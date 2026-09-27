import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {AUTO_RENEW_OFFER,AUTO_RENEW_TERMS,LEGACY_AUTO_RENEW_OFFER,LEGACY_AUTO_RENEW_TERMS,autoRenewPolicy,DAY_MS} from '../public/seller-trial-policy.mjs';
import {autoRenewConsent,setupAutoRenewCard,verifyAutoRenewCard,reconcileAutoRenew,processAutoRenewStripeEvent,runAutoRenewReconciliation} from '../src/seller-pilot-autorenew.mjs';
import {handleSellerListingPilotRoutes,pilotEntitlement,transitionPilot} from '../src/seller-listing-pilot.mjs';
const priceConfig={SELLER_PILOT_1980_TEST_PRICE_ID:'price_test',SELLER_PILOT_1980_TEST_PRODUCT_ID:'prod_test',STRIPE_SECRET_KEY:'sk_test_'+'x'.repeat(32)};
const start=new Date('2026-09-27T06:20:00Z');
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0089_seller_listing_pilot.sql',import.meta.url),'utf8'));
 const doc=autoRenewConsent({status:'DRAFT',offer_version:AUTO_RENEW_OFFER,test:true,products:[{id:'1'}]},{autorenew_consent:true,autorenew_terms:AUTO_RENEW_TERMS},start,priceConfig);
 const row={pilot_id:'SPL_test',owner_member_id:'owner',revision:1};
 db.prepare('INSERT INTO seller_listing_pilots VALUES(?,?,?,?,?,?,?)').run(row.pilot_id,'SBI_test','owner',1,JSON.stringify(doc),start.toISOString(),start.toISOString());
 const adapter={prepare(sql){let vals=[];const stmt=db.prepare(sql);return{bind(...v){vals=v;return this;},async all(){return{results:stmt.all(...vals)}},async run(){const r=stmt.run(...vals);return{meta:{changes:Number(r.changes)}}}}},async batch(stmts){db.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const meta={purpose:'SELLER_PILOT_AUTORENEW',pilot_id:row.pilot_id,terms:AUTO_RENEW_TERMS,consented_at:start.toISOString()};
 const price={id:'price_test',livemode:false,active:true,currency:'jpy',unit_amount:1980,product:'prod_test',tax_behavior:'inclusive',recurring:{interval:'month',interval_count:1}};
 const session={id:'cs_test_setup',livemode:false,mode:'setup',status:'open',metadata:meta,url:'https://checkout.stripe.com/c/pay/test',setup_intent:'seti_test'};
 const setup={id:'seti_test',livemode:false,status:'succeeded',usage:'off_session',metadata:meta,payment_method:'pm_test'};
 const pm={id:'pm_test',livemode:false,type:'card'};
 const customer={id:'cus_test',livemode:false,metadata:meta};
 const sub={id:'sub_test',livemode:false,metadata:meta,customer:'cus_test',status:'trialing',currency:'jpy',collection_method:'charge_automatically',items:{data:[{quantity:1,price}]},trial_end:Math.ceil((start.getTime()+30*DAY_MS)/1000),current_period_end:Math.ceil((start.getTime()+30*DAY_MS)/1000),cancel_at_period_end:false};
 const calls=[];let fail=false;
 const env={...priceConfig,PRODUCT_DB:adapter,SELLER_MANUAL_PILOT_ENABLED:'true',SELLER_PILOT_OFFER_VERSION:AUTO_RENEW_OFFER,SELLER_PILOT_AUTORENEW_ENABLED:'true',SELLER_PILOT_PAYMENTS_ENABLED:'true',SELLER_PILOT_PAYMENT_MODE:'test',SELLER_PILOT_PRICE_ID:'price_test',STRIPE_SECRET_KEY:'sk_test_'+'x'.repeat(32),STRIPE_FETCH:async(url,init)=>{
  const path=new URL(url).pathname,c={path,method:init.method,body:new URLSearchParams(init.body),key:init.headers['idempotency-key']};calls.push(c);
  if(path==='/v1/subscriptions'&&fail)throw new Error('network');
  if(path.includes('/subscriptions/sub_test')&&init.method==='POST')sub.cancel_at_period_end=true;
  return Response.json(path.includes('/prices/')?price:path.includes('/checkout/')?session:path.includes('/setup_intents/')?setup:path.includes('/payment_methods/')?pm:path==='/v1/customers'?customer:sub);
 }};
 const read=()=>JSON.parse(db.prepare('SELECT document_json FROM seller_listing_pilots').get().document_json);
 const write=d=>db.prepare('UPDATE seller_listing_pilots SET document_json=?').run(JSON.stringify(d));
 const published=()=>{const d={...doc,status:'PUBLISHED',approved_at:start.toISOString(),starts_at:start.toISOString(),ends_at:new Date(start.getTime()+30*DAY_MS).toISOString(),autorenew:{...doc.autorenew,setup_session_id:session.id,card_verified_at:start.toISOString(),payment_method_id:pm.id}};write(d);return d;};
 return{db,env,row,doc,price,session,setup,pm,sub,calls,read,write,published,setFail:v=>{fail=v;}};
}
test('new flow requires explicit consent and registered card; legacy offer cannot enter',()=>{
 assert.throws(()=>autoRenewConsent({status:'DRAFT',offer_version:AUTO_RENEW_OFFER},{}),/CONSENT_REQUIRED/);
 assert.throws(()=>autoRenewConsent({status:'DRAFT',offer_version:'external-seller-30d-v1'},{autorenew_consent:true,autorenew_terms:AUTO_RENEW_TERMS}),/NOT_ALLOWED/);
 const d={status:'DRAFT',offer_version:AUTO_RENEW_OFFER};
 assert.throws(()=>transitionPilot(d,'APPROVE',{publication_consent:true,offer_version:AUTO_RENEW_OFFER},{actor:'OWNER',offerEnabled:true}),/CARD_REGISTRATION/);
});
test('setup is card-only: no subscription, charge, trial or arbitrary saved card',async()=>{
 const f=fixture();const s=await setupAutoRenewCard(f.env,f.row,f.doc,start);
 assert.equal(s.id,f.session.id);const post=f.calls.find(c=>c.path==='/v1/checkout/sessions');assert.equal(post.body.get('mode'),'setup');assert.equal(post.body.get('payment_method_types[0]'),'card');assert.equal(post.body.has('line_items[0][price]'),false);assert.equal(post.body.has('subscription_data[trial_end]'),false);
 assert.equal(f.read().starts_at,undefined);assert.equal(f.calls.some(c=>c.path.includes('/subscriptions')),false);
 await assert.rejects(()=>verifyAutoRenewCard(f.env,f.row,{...f.doc,autorenew:{...f.doc.autorenew,setup_session_id:s.id}}),/INCOMPLETE/);
 f.session.status='complete';const card=await verifyAutoRenewCard(f.env,f.row,{...f.doc,autorenew:{...f.doc.autorenew,setup_session_id:s.id}});assert.equal(card.payment_method_id,'pm_test');
 f.setup.metadata={...f.setup.metadata,pilot_id:'SPL_other'};await assert.rejects(()=>verifyAutoRenewCard(f.env,f.row,{...f.doc,autorenew:{...f.doc.autorenew,setup_session_id:s.id}}),/INCOMPLETE/);
});
test('subscription starts only from durable publication and carries exact public trial end',async()=>{
 const f=fixture();await reconcileAutoRenew(f.env,f.row.pilot_id,{now:start});assert.equal(f.calls.length,0);
 f.published();const out=await reconcileAutoRenew(f.env,f.row.pilot_id,{now:start});assert.equal(out.error,null);
 const req=f.calls.find(c=>c.path==='/v1/subscriptions');assert.equal(req.body.get('trial_end'),String(f.sub.trial_end));assert.equal(req.body.get('default_payment_method'),'pm_test');assert.equal(req.body.get('items[0][price]'),'price_test');
 assert.equal(out.doc.autorenew.subscription_id,'sub_test');assert.equal(pilotEntitlement(out.doc,start).active,true);assert.equal(pilotEntitlement(out.doc,new Date(out.doc.ends_at)).active,false);
 await reconcileAutoRenew(f.env,f.row.pilot_id,{now:start});assert.equal(f.calls.filter(c=>c.path==='/v1/subscriptions').length,1);
});
test('cancellation before publication never creates a subscription',async()=>{
 const f=fixture();const out=await reconcileAutoRenew(f.env,f.row.pilot_id,{cancel:true,now:start,actor:'OWNER'});assert.equal(out.error,null);assert.equal(out.doc.autorenew.canceled,true);assert.equal(f.calls.length,0);
});
test('trial cancellation stops renewal, keeps original free interval and works with new-enrollment flag off',async()=>{
 const f=fixture();f.published();await reconcileAutoRenew(f.env,f.row.pilot_id,{now:start});f.env.SELLER_PILOT_AUTORENEW_ENABLED='false';
 const out=await reconcileAutoRenew(f.env,f.row.pilot_id,{cancel:true,now:new Date(start.getTime()+29*DAY_MS),actor:'OWNER'});
 assert.equal(out.error,null);assert.equal(out.doc.autorenew.cancel_at_period_end,true);assert.equal(pilotEntitlement(out.doc,new Date(start.getTime()+29*DAY_MS)).active,true);assert.equal(pilotEntitlement(out.doc,new Date(out.doc.ends_at)).active,false);assert.equal(pilotEntitlement(out.doc,start).automatic_charge,false);
});
test('unknown create response retries same key, blocks duplicates outside provider retention',async()=>{
 const f=fixture();f.published();f.setFail(true);assert.ok((await reconcileAutoRenew(f.env,f.row.pilot_id,{now:start})).error);
 const first=f.calls.find(c=>c.path==='/v1/subscriptions').key;f.setFail(false);const recovered=await reconcileAutoRenew(f.env,f.row.pilot_id,{now:new Date(start.getTime()+1000)});assert.equal(recovered.error,null);assert.equal(f.calls.filter(c=>c.path==='/v1/subscriptions')[1].key,first);
 const g=fixture();g.published();g.setFail(true);await reconcileAutoRenew(g.env,g.row.pilot_id,{now:start});const n=g.calls.length;
 assert.equal((await reconcileAutoRenew(g.env,g.row.pilot_id,{now:new Date(start.getTime()+24*3600000)})).error,'PAYMENT_RECONCILIATION_REQUIRED');assert.equal(g.calls.length,n);
});
test('price or environment mismatch cannot create contract',async()=>{
 const f=fixture();f.published();f.price.unit_amount=3980;assert.equal((await reconcileAutoRenew(f.env,f.row.pilot_id,{now:start})).error,'PRICE_OR_ENVIRONMENT_MISMATCH');assert.equal(f.calls.some(c=>c.method==='POST'),false);
 f.env.STRIPE_SECRET_KEY='sk_live_'+'x'.repeat(32);f.env.SELLER_PILOT_PAYMENT_MODE='live';await assert.rejects(()=>reconcileAutoRenew(f.env,f.row.pilot_id,{now:start}),/CONTRACT_SNAPSHOT_MISMATCH|QA_LIVE/);
});
test('paid status needs a current paid invoice; old webhook payload cannot restore access',async()=>{
 const f=fixture();f.published();await reconcileAutoRenew(f.env,f.row.pilot_id,{now:start});const now=new Date(start.getTime()+30*DAY_MS+1000);
 f.sub.status='active';f.sub.current_period_end=Math.floor(now.getTime()/1000)+86400;f.sub.latest_invoice={status:'paid',currency:'jpy',amount_paid:1980};
 assert.equal(pilotEntitlement((await reconcileAutoRenew(f.env,f.row.pilot_id,{now})).doc,now).paid,true);
 f.sub.status='past_due';const d=(await reconcileAutoRenew(f.env,f.row.pilot_id,{now})).doc;assert.equal(pilotEntitlement(d,now).paid,false);
 assert.equal(await processAutoRenewStripeEvent(f.env,{type:'invoice.paid',data:{object:{metadata:{purpose:'OTHER'}}}}),null);
});
test('DB failure prevents provider create; durable lease rejects concurrent billing mutation',async()=>{
 const f=fixture();f.published();f.env.PRODUCT_DB.batch=async()=>{throw new Error('database unavailable');};await assert.rejects(()=>reconcileAutoRenew(f.env,f.row.pilot_id,{now:start}),/database/);assert.equal(f.calls.length,0);
 const g=fixture();const doc=g.published();doc.autorenew.lease_until=new Date(start.getTime()+60000).toISOString();g.write(doc);const pending=await reconcileAutoRenew(g.env,g.row.pilot_id,{cancel:true,now:start});assert.equal(pending.pending,true);assert.equal(g.read().autorenew.cancel_requested_at,start.toISOString());assert.equal(g.calls.length,0);
});
test('authenticated API enforces owner, origin, revision and registered card before publication',async()=>{
 const f=fixture();const deps={authorize:async()=>true,member:async()=>({id:'owner'})};
 const req=(path,body,origin='https://hoshilu.app')=>new Request('https://hoshilu.app'+path,{method:'POST',headers:{origin},body:JSON.stringify(body)});
 const base='/api/seller-pilot/SPL_test';
 assert.equal((await handleSellerListingPilotRoutes(req(base,{action:'AUTO_SETUP',revision:1},'https://other.example'),f.env,deps)).status,403);
 assert.equal((await handleSellerListingPilotRoutes(req(base,{action:'AUTO_SETUP',revision:1}),f.env,{...deps,member:async()=>({id:'other'})})).status,404);
 assert.equal((await handleSellerListingPilotRoutes(req(base,{action:'AUTO_SETUP',revision:99}),f.env,deps)).status,409);
 const response=await handleSellerListingPilotRoutes(req(base,{action:'APPROVE',revision:1,publication_consent:true,offer_version:AUTO_RENEW_OFFER}),f.env,deps);
 assert.equal((await response.json()).error,'CARD_REGISTRATION_REQUIRED');assert.equal(f.calls.length,0);
 const doc=f.read();doc.status='APPROVED';doc.approved_at=start.toISOString();f.write(doc);
 const publish=await handleSellerListingPilotRoutes(req('/api/admin/seller-pilot/SPL_test',{action:'PUBLISH',revision:1}),f.env,deps);
 assert.equal(publish.status,400);assert.equal(f.read().starts_at,undefined);assert.equal(f.calls.some(c=>c.path==='/v1/subscriptions'),false);
 const view=await handleSellerListingPilotRoutes(new Request('https://hoshilu.app/api/seller-pilot'),f.env,deps);assert.equal(view.status,200);assert.equal(f.calls.some(c=>c.method==='POST'),false);
});
test('expired unknown publication never creates an immediate paid subscription',async()=>{
 const f=fixture();const d=f.published();const out=await reconcileAutoRenew(f.env,f.row.pilot_id,{now:new Date(d.ends_at)});
 assert.equal(out.error,'TRIAL_RECONCILIATION_REQUIRED');assert.equal(f.calls.length,0);
});

test('old 4980 auto-renew contract survives the 1980 default, archival, reconciliation and cancellation',async()=>{
 const f=fixture();const d=f.published();
 d.offer_version=LEGACY_AUTO_RENEW_OFFER;d.autorenew.terms=LEGACY_AUTO_RENEW_TERMS;d.autorenew.accepted_copy=autoRenewPolicy(LEGACY_AUTO_RENEW_OFFER).copy;delete d.autorenew.contract;
 Object.assign(d.autorenew,{subscription_id:'sub_test',customer_id:'cus_test'});f.write(d);
 f.sub.metadata.terms=LEGACY_AUTO_RENEW_TERMS;f.price.unit_amount=4980;f.price.active=false;
 f.env.SELLER_PILOT_1980_TEST_PRICE_ID='price_new';f.env.SELLER_PILOT_AUTORENEW_ENABLED='false';
 const originalCopy=d.autorenew.accepted_copy;
 const out=await reconcileAutoRenew(f.env,f.row.pilot_id,{now:start});assert.equal(out.error,null);assert.equal(pilotEntitlement(out.doc,start).monthly_jpy,4980);
 await runAutoRenewReconciliation(f.env);assert.equal(f.read().autorenew.error,undefined);
 const cancelled=await reconcileAutoRenew(f.env,f.row.pilot_id,{now:start,cancel:true});assert.equal(cancelled.error,null);assert.equal(cancelled.doc.autorenew.cancel_at_period_end,true);assert.equal(cancelled.doc.autorenew.accepted_copy,originalCopy);
 assert.equal(f.calls.some(c=>c.path==='/v1/subscriptions'),false);
});
test('current contract pins amount, terms, product, Price and environment independently of later new-default changes',async()=>{
 const f=fixture();f.published();f.env.SELLER_PILOT_1980_TEST_PRICE_ID='price_other';f.env.SELLER_PILOT_PRICE_ID='price_legacy';
 assert.equal((await reconcileAutoRenew(f.env,f.row.pilot_id,{now:start})).error,null);
 assert.equal(f.calls.find(c=>c.path==='/v1/subscriptions').body.get('items[0][price]'),'price_test');
 const d=f.read();d.autorenew.contract.amount=4980;f.write(d);await assert.rejects(()=>reconcileAutoRenew(f.env,f.row.pilot_id,{now:start}),/SNAPSHOT_MISMATCH/);
});
test('wrong price, product, tax, currency, interval, environment or quantity cannot be accepted',async()=>{
 for(const changes of [{unit_amount:4980},{currency:'usd'},{tax_behavior:'exclusive'},{livemode:true},{product:'prod_other'},{active:false},{recurring:{interval:'year',interval_count:1}},{recurring:{interval:'month',interval_count:2}}]){
  const f=fixture();f.published();Object.assign(f.price,changes);
  assert.equal((await reconcileAutoRenew(f.env,f.row.pilot_id,{now:start})).error,'PRICE_OR_ENVIRONMENT_MISMATCH');assert.equal(f.calls.some(c=>c.method==='POST'),false);
 }
 for(const mutate of [f=>f.sub.items.data[0].quantity=2,f=>f.sub.automatic_tax={enabled:true},f=>f.sub.default_tax_rates=['txr_other']]) {
  const f=fixture();f.published();mutate(f);assert.equal((await reconcileAutoRenew(f.env,f.row.pilot_id,{now:start})).error,'AUTORENEW_SUBSCRIPTION_MISMATCH');
 }
});
test('invoice webhook without direct metadata re-fetches both new and legacy contracts; duplicates do not create subscriptions',async()=>{
 const f=fixture();f.published();await reconcileAutoRenew(f.env,f.row.pilot_id,{now:start});
 const event={type:'invoice.payment_failed',data:{object:{parent:{subscription_details:{subscription:'sub_test'}}}}};
 f.sub.status='past_due';await processAutoRenewStripeEvent(f.env,event);await processAutoRenewStripeEvent(f.env,{...event,type:'invoice.paid'});
 assert.equal(f.read().autorenew.status,'past_due');assert.equal(f.read().autorenew.paid,false);assert.equal(f.calls.filter(c=>c.path==='/v1/subscriptions').length,1);
});
test('superseded open card setup cannot start a new old-price subscription',async()=>{
 const f=fixture();const d=f.doc;d.offer_version=LEGACY_AUTO_RENEW_OFFER;d.autorenew.terms=LEGACY_AUTO_RENEW_TERMS;delete d.autorenew.contract;
 await assert.rejects(()=>setupAutoRenewCard(f.env,f.row,d,start),/SUPERSEDED/);assert.equal(f.calls.length,0);
});
test('30-day trial is exact at month/year/leap boundaries for the new offer',()=>{
 for(const date of ['2026-01-31T14:59:59.999Z','2028-02-29T15:00:00Z','2026-12-31T23:59:59Z']) {
  const f=fixture();const d=f.doc;d.status='APPROVED';d.approved_at=date;d.autorenew.card_verified_at=date;
  const published=transitionPilot(d,'PUBLISH',{}, {actor:'ADMIN',offerEnabled:true,now:new Date(date)});
  assert.equal(Date.parse(published.ends_at)-Date.parse(published.starts_at),30*DAY_MS);
  assert.equal(pilotEntitlement(published,new Date(Date.parse(published.ends_at)-1)).active,true);assert.equal(pilotEntitlement(published,new Date(published.ends_at)).active,false);
 }
});
