import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {PILOT_OFFER,calendarTrialEnd,normalizePilotDraft,transitionPilot,pilotEntitlement,acquisitionComplete,handleSellerListingPilotRoutes} from '../src/seller-listing-pilot.mjs';
const sample=()=>({shop_name:'テスト店舗',business_name:'テスト法人',registered_address:'検証専用住所',business_evidence_ref:'fixture-business',external_verified:true,external_evidence_ref:'fixture-external',test:true,
 products:[1,2,3].map(n=>({title:`検証商品${n}`,image_url:'https://example.com/image.png',destination_url:`https://example.com/products/${n}`,marketplace:'OWN_STORE',price_jpy:null,permission_ref:'test-owned-fixture'}))});
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const name of ['0058_seller_business_inquiries','0089_seller_listing_pilot'])db.exec(readFileSync(new URL(`../migrations/${name}.sql`,import.meta.url),'utf8'));
 db.prepare(`INSERT INTO seller_business_inquiries(inquiry_id,inquiry_type,organization_type,organization_name,contact_name,contact_email,created_at,updated_at) VALUES('SBI_test','CONSULTATION','SELLER','テスト','','owner@example.com','2026-01-01','2026-01-01')`).run();
 const adapter={prepare(sql){const stmt=db.prepare(sql);let vals=[];return{bind(...args){vals=args;return this;},async all(){return{results:stmt.all(...vals)}},async run(){const r=stmt.run(...vals);return{meta:{changes:Number(r.changes)}}}}},async batch(stmts){db.exec('BEGIN');try{const rs=[];for(const stmt of stmts)rs.push(await stmt.run());db.exec('COMMIT');return rs;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const env={PRODUCT_DB:adapter,SELLER_MANUAL_PILOT_ENABLED:'true',SELLER_PILOT_OFFER_VERSION:PILOT_OFFER};
 const deps={authorize:async()=>true,member:async()=>({id:'owner'}),ownerForEmail:async()=> 'owner'};
 const call=(path,body,overrides={})=>handleSellerListingPilotRoutes(new Request(`https://hoshilu.app${path}`,body?{method:'POST',headers:{origin:'https://hoshilu.app'},body:JSON.stringify(body)}:{}),env,{...deps,...overrides});
 return{db,env,deps,call};
}
test('3か月はJST暦月・末日へ丸め、90日ではない',()=>{
 assert.equal(calendarTrialEnd('2026-01-31T03:30:00Z'),'2026-04-30T03:30:00.000Z');
 assert.equal(calendarTrialEnd('2027-11-30T16:00:00Z'),'2028-02-29T16:00:00.000Z');
 assert.equal(calendarTrialEnd('2026-08-31T14:59:59Z'),'2026-11-30T14:59:59.000Z');
});
test('許諾・3つの異なる商品・正しい販売先を必須とし価格を推測しない',()=>{
 const input=sample();assert.equal(normalizePilotDraft(input).products[0].price_jpy,null);
 assert.throws(()=>normalizePilotDraft({...input,products:input.products.slice(0,2)}),/THREE/);
 input.products[0].permission_ref='';assert.throws(()=>normalizePilotDraft(input),/PERMISSION/);
 input.products[0].permission_ref='test';input.products[0].marketplace='AMAZON';assert.throws(()=>normalizePilotDraft(input),/MISMATCH/);
 input.products[0].destination_url='https://amazon.co.jp/dp/B000000000';assert.throws(()=>normalizePilotDraft(input),/SELLER_DESTINATION/);
});
test('期限・重複イベントでも課金せず、社内テストは獲得に数えない',()=>{
 const draft=normalizePilotDraft(sample());const now=new Date('2026-01-31T03:30:00Z');
 assert.throws(()=>transitionPilot(draft,'PUBLISH',{}, {actor:'ADMIN',offerEnabled:true,now}),/OWNER_APPROVAL/);
 assert.throws(()=>transitionPilot(draft,'APPROVE',{publication_consent:true,offer_version:PILOT_OFFER},{actor:'OWNER',offerEnabled:false,now}),/CONDITIONS/);
 const approved=transitionPilot(draft,'APPROVE',{publication_consent:true,offer_version:PILOT_OFFER},{actor:'OWNER',offerEnabled:true,now});
 const published=transitionPilot(approved,'PUBLISH',{}, {actor:'ADMIN',offerEnabled:true,now});
 assert.strictEqual(transitionPilot(published,'PUBLISH',{}, {actor:'ADMIN',offerEnabled:true,now}),published);
 const confirmed=transitionPilot(published,'CONFIRM',{}, {actor:'OWNER',now});
 assert.equal(acquisitionComplete(confirmed,now),false);
 assert.equal(acquisitionComplete({...confirmed,test:false},now),true);
 const expired=pilotEntitlement(confirmed,new Date(confirmed.ends_at));assert.equal(expired.active,false);assert.equal(expired.automatic_charge,false);assert.equal(expired.billing_status,'NO_PAID_CONTRACT');
 assert.equal(draft.status,'DRAFT');assert.equal(draft.starts_at,undefined);
});
test('本番フラグ既定OFF、管理権限・店舗ごとの閲覧を強制する',async()=>{
 const {env,deps,call}=fixture();
 assert.equal((await handleSellerListingPilotRoutes(new Request('https://hoshilu.app/seller-pilot'),{...env,SELLER_MANUAL_PILOT_ENABLED:''},deps)).status,404);
 assert.equal((await call('/api/admin/seller-pilot',null,{authorize:async()=>false})).status,401);
 const created=await(await call('/api/admin/seller-pilot',{...sample(),action:'CREATE',inquiry_id:'SBI_test'})).json();
 const stranger=await(await call('/api/seller-pilot',null,{member:async()=>({id:'stranger'})})).json();assert.equal(stranger.items.length,0);
 const denied=await call(`/api/seller-pilot/${created.pilot_id}`,{action:'APPROVE',revision:1,publication_consent:true,offer_version:PILOT_OFFER},{member:async()=>({id:'stranger'})});assert.equal(denied.status,404);
 const page=await call(`/seller-pilot/shops/${created.pilot_id}`);assert.doesNotMatch(await page.text(),/検証商品/);
});
test('保存→本人承認→公開→本人確認の実DB経路。GETや管理者では本人確認できない',async()=>{
 const {db,call}=fixture();
 const created=await call('/api/admin/seller-pilot',{...sample(),action:'CREATE',inquiry_id:'SBI_test'});assert.equal(created.status,201);
 const {pilot_id:id}=await created.json();
 await call(`/api/seller-pilot/${id}`);assert.equal(db.prepare('SELECT revision FROM seller_listing_pilots').get().revision,1);
 assert.equal((await call(`/api/admin/seller-pilot/${id}`,{action:'APPROVE',revision:1,publication_consent:true,offer_version:PILOT_OFFER})).status,400);
 assert.equal((await call(`/api/seller-pilot/${id}`,{action:'APPROVE',revision:1,publication_consent:true,offer_version:PILOT_OFFER})).status,200);
 assert.equal((await call(`/api/admin/seller-pilot/${id}`,{action:'PUBLISH',revision:1})).status,409);
 assert.equal((await call(`/api/admin/seller-pilot/${id}`,{action:'PUBLISH',revision:2})).status,200);
 const page=await call(`/seller-pilot/shops/${id}`);assert.match(await page.text(),/検証商品1/);
 assert.equal((await call(`/api/admin/seller-pilot/${id}`,{action:'CONFIRM',revision:3})).status,400);
 assert.equal((await call(`/api/seller-pilot/${id}`,{action:'CONFIRM',revision:3})).status,200);
 assert.equal(db.prepare('SELECT count(*) n FROM seller_listing_pilot_audit').get().n,4);
});
test('CSRF・巨大入力・他店舗書込みを拒否する',async()=>{
 const {env,deps}=fixture();
 const request=new Request('https://hoshilu.app/api/admin/seller-pilot',{method:'POST',headers:{origin:'https://evil.example'},body:'{}'});
 assert.equal((await handleSellerListingPilotRoutes(request,env,deps)).status,403);
 const huge=new Request('https://hoshilu.app/api/admin/seller-pilot',{method:'POST',headers:{origin:'https://hoshilu.app'},body:JSON.stringify({x:'x'.repeat(50000)})});
 assert.equal((await handleSellerListingPilotRoutes(huge,env,deps)).status,400);
});

test('手動公開商品も既存の条件一致判定で横断検索でき、期限後は消える',async()=>{
 const {searchAcrossShops}=await import('../src/shop-demand.mjs');
 const {resetShopCache}=await import('../src/seller-shop.mjs');resetShopCache();
 const {db,env,call}=fixture();const input=sample();input.test=false;input.products[0].title='帆布 トートバッグ 白 A4';
 const {pilot_id:id}=await(await call('/api/admin/seller-pilot',{...input,action:'CREATE',inquiry_id:'SBI_test'})).json();
 await call(`/api/seller-pilot/${id}`,{action:'APPROVE',revision:1,publication_consent:true,offer_version:PILOT_OFFER});
 await call(`/api/admin/seller-pilot/${id}`,{action:'PUBLISH',revision:2});
 const found=await searchAcrossShops(env,'帆布 トートバッグ 白 A4');assert.equal(found.exact.length,1);assert.equal(found.exact[0].price,0);
 const saved=await call(`/api/seller-pilot/${id}/save`,{product_id:'1'},{member:async()=>({id:'buyer'})});assert.equal(saved.status,200);
 await call(`/api/seller-pilot/${id}/save`,{product_id:'1'},{member:async()=>({id:'buyer'})});
 assert.equal(db.prepare('SELECT count(*) n FROM seller_listing_pilot_saves').get().n,1);
 assert.equal((await call(`/api/seller-pilot/${id}/save`,{product_id:'1'})).status,400);
 const savedPage=await call('/seller-pilot/saved',null,{member:async()=>({id:'buyer'})});assert.match(await savedPage.text(),/トートバッグ/);
 db.prepare("UPDATE seller_listing_pilots SET document_json=json_set(document_json,'$.ends_at','2020-01-01T00:00:00Z')").run();
 assert.equal((await searchAcrossShops(env,'帆布 トートバッグ 白 A4')).exact.length,0);
 assert.equal((await call(`/seller-pilot/shops/${id}`)).status,404);
 assert.equal(db.prepare('SELECT count(*) n FROM seller_listing_pilot_saves').get().n,1,'期限でデータを消さない');
});

test('実Workerのルーティングで相談管理・手動掲載APIに到達し、認証を保持する',async()=>{
 const worker=(await import('../src/index.mjs')).default;
 const {env}=fixture();env.SOCIAL_ADMIN_SECRET='fixture-admin-secret-'.repeat(3);
 const call=(path,authorized)=>worker.fetch(new Request(`https://hoshilu.app${path}`,{headers:authorized?{authorization:`Bearer ${env.SOCIAL_ADMIN_SECRET}`}:{}}),env,{waitUntil(){}});
 assert.equal((await call('/api/admin/seller-business/inquiries',true)).status,200);
 assert.equal((await call('/api/admin/seller-business/inquiries',false)).status,401);
 assert.equal((await call('/api/admin/seller-pilot',true)).status,200);
 assert.equal((await call('/api/admin/seller-pilot',false)).status,401);
});
