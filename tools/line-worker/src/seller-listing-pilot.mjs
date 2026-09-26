// New, isolated pilot. OFF until offer/retention/migration approval. No billing imports.
import { authorizeAdminRequest } from './admin-auth.mjs';
import { readMemberSession } from './member-auth.mjs';
import { resolveMemberIdentityAlias } from './member-notification-delivery.mjs';
import { readBoundedJson } from './bounded-json.mjs';
export const PILOT_OFFER = 'external-seller-calendar3-v1';
const MONTHLY_JPY = 4980;
const json = (body, status = 200) => Response.json(body, {status,headers:{'cache-control':'no-store','x-robots-tag':'noindex','referrer-policy':'no-referrer'}});
const text = (value, max=200) => String(value || '').trim().slice(0,max);
const esc = value => String(value ?? '').replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const originOK = request => request.headers.get('origin') === new URL(request.url).origin;
function https(value) {
  try { const url=new URL(value); return url.protocol==='https:' && !url.username && !url.password ? url.href : ''; } catch {return '';}
}
export function calendarTrialEnd(start) {
  const time=new Date(start).getTime();
  if (!Number.isFinite(time)) throw new Error('INVALID_DATE');
  const jst=new Date(time+9*3600_000);
  const year=jst.getUTCFullYear(),month=jst.getUTCMonth()+3;
  const day=Math.min(jst.getUTCDate(),new Date(Date.UTC(year,month+1,0)).getUTCDate());
  return new Date(Date.UTC(year,month,day,jst.getUTCHours(),jst.getUTCMinutes(),jst.getUTCSeconds(),jst.getUTCMilliseconds())-9*3600_000).toISOString();
}
export function pilotEntitlement(doc, now=new Date()) {
  const active=doc.status==='PUBLISHED' && doc.offer_version===PILOT_OFFER && Date.parse(doc.ends_at)>now.getTime();
  return {active,expired:doc.status==='PUBLISHED'&&!active,billing_status:'NO_PAID_CONTRACT',automatic_charge:false,monthly_jpy:MONTHLY_JPY,currency:'JPY'};
}
export function normalizePilotDraft(input) {
  const doc={status:'DRAFT',shop_name:text(input.shop_name),business_name:text(input.business_name),registered_address:text(input.registered_address,500),
    business_evidence_ref:text(input.business_evidence_ref,500),external_evidence_ref:text(input.external_evidence_ref,500),
    external_verified:input.external_verified===true,test:input.test===true,products:[]};
  if(!doc.shop_name||!doc.business_name||!doc.registered_address||!doc.business_evidence_ref||!doc.external_evidence_ref||!doc.external_verified) throw new Error('BUSINESS_VERIFICATION_REQUIRED');
  if(!Array.isArray(input.products)||input.products.length<3||input.products.length>20) throw new Error('THREE_PRODUCTS_REQUIRED');
  doc.products=input.products.map((p,index)=>{
    const item={id:String(index+1),title:text(p.title,300),image_url:https(p.image_url),destination_url:https(p.destination_url),marketplace:text(p.marketplace,40),
      permission_ref:text(p.permission_ref,500),price_jpy:p.price_jpy===null||p.price_jpy===undefined?null:Number(p.price_jpy),price_verified_at:text(p.price_verified_at,40),asin:text(p.asin,10),jan:text(p.jan,13)};
    if(!item.title||!item.image_url||!item.destination_url||!item.permission_ref) throw new Error('PRODUCT_PERMISSION_REQUIRED');
    // Server never fetches arbitrary URLs. Image loading in browser sends no referrer.
    const host=new URL(item.destination_url).hostname;
    const allowed={AMAZON:/(^|\.)amazon\.co\.jp$/u,RAKUTEN:/(^|\.)rakuten\.co\.jp$/u,YAHOO:/(^|\.)shopping\.yahoo\.co\.jp$/u};
    if(item.marketplace!=='OWN_STORE' && !allowed[item.marketplace]?.test(host)) throw new Error('MARKETPLACE_URL_MISMATCH');
    if(item.marketplace==='AMAZON'&&!/[?&](?:m|smid|seller)=[A-Z0-9]+(?:&|$)/iu.test(new URL(item.destination_url).search)) throw new Error('AMAZON_SELLER_DESTINATION_REQUIRED');
    if(item.asin&&!/^[A-Z0-9]{10}$/u.test(item.asin)) throw new Error('ASIN_INVALID');
    if(item.jan&&!/^\d{8}(?:\d{5})?$/u.test(item.jan)) throw new Error('JAN_INVALID');
    if(item.price_jpy!==null&&(!Number.isSafeInteger(item.price_jpy)||item.price_jpy<0||!Number.isFinite(Date.parse(item.price_verified_at)))) throw new Error('PRICE_EVIDENCE_REQUIRED');
    return item;
  });
  if(new Set(doc.products.map(p=>p.destination_url)).size<3) throw new Error('THREE_DISTINCT_PRODUCTS_REQUIRED');
  return doc;
}
export function transitionPilot(doc, action, input, {actor,offerEnabled,now=new Date()}={}) {
  const next=structuredClone(doc),at=now.toISOString();
  if(action==='APPROVE'&&actor==='OWNER') {
    if(doc.status==='APPROVED') return doc;
    if(doc.status!=='DRAFT'||input.publication_consent!==true||input.offer_version!==PILOT_OFFER||!offerEnabled) throw new Error('APPROVAL_CONDITIONS_REQUIRED');
    next.status='APPROVED';next.approved_at=at;next.offer_version=PILOT_OFFER;
  } else if(action==='PUBLISH'&&actor==='ADMIN') {
    if(doc.status==='PUBLISHED') return doc;
    if(doc.status!=='APPROVED'||!doc.approved_at||!offerEnabled) throw new Error('OWNER_APPROVAL_REQUIRED');
    next.status='PUBLISHED';next.starts_at=at;next.ends_at=calendarTrialEnd(at);
  } else if(action==='CONFIRM'&&actor==='OWNER') {
    if(!pilotEntitlement(doc,now).active) throw new Error('ACTIVE_LISTING_REQUIRED');
    if(doc.owner_confirmed_at) return doc;
    next.owner_confirmed_at=at;
  } else throw new Error('ACTION_NOT_ALLOWED');
  return next;
}
export function acquisitionComplete(doc,now=new Date()) {
  return Boolean(doc.external_verified&&!doc.test&&doc.approved_at&&doc.owner_confirmed_at&&doc.products?.length>=3&&pilotEntitlement(doc,now).active);
}
export async function activePilotListings(env,now=new Date()) {
  if(env.SELLER_MANUAL_PILOT_ENABLED!=='true'||env.SELLER_PILOT_OFFER_VERSION!==PILOT_OFFER||!env.PRODUCT_DB) return [];
  try {
    const rows=(await env.PRODUCT_DB.prepare("SELECT pilot_id,document_json FROM seller_listing_pilots WHERE json_extract(document_json,'$.status')='PUBLISHED' ORDER BY created_at LIMIT 50").all()).results||[];
    return rows.map(row=>({pilot_id:row.pilot_id,...JSON.parse(row.document_json)})).filter(doc=>!doc.test&&pilotEntitlement(doc,now).active);
  } catch {return [];}
}
async function pilotKpi(env,row,doc) {
  if(doc.test||!doc.starts_at) return {status:'EXCLUDED_OR_NOT_STARTED'};
  const internal=[row.owner_member_id,...String(env.INTERNAL_MEMBER_IDS||'').split(',').filter(Boolean)];
  try {
    const events=(await env.PRODUCT_DB.prepare(`SELECT event_type,COUNT(*) AS count FROM growth_events
      WHERE campaign=?1 AND source='seller_pilot' AND traffic_class<>'QA' AND visitor_id<>''
      AND occurred_at>=?2 AND event_type IN ('shop_view_confirmed','marketplace_click') GROUP BY event_type`).bind(row.pilot_id,doc.starts_at).all()).results||[];
    const saves=(await env.PRODUCT_DB.prepare(`SELECT COUNT(*) AS count FROM seller_listing_pilot_saves
      WHERE pilot_id=?1 AND member_id NOT IN (${internal.map((_,i)=>`?${i+2}`).join(',')})`).bind(row.pilot_id,...internal).all()).results?.[0]?.count;
    return {status:'MEASURED',since:doc.starts_at,views:Number(events.find(e=>e.event_type==='shop_view_confirmed')?.count||0),
      outbound_clicks:Number(events.find(e=>e.event_type==='marketplace_click')?.count||0),saves:Number(saves||0),sales:null,
      caveat:'掲載ページのブラウザで計測できた回数（横断検索からの直接遷移は含まない）。計測拒否・未ログインの運営者操作は識別できません。購入・売上は未計測。'};
  } catch {return {status:'UNAVAILABLE'};}
}
async function ownerForEmail(env,email) {
  const secret=String(env.MEMBER_SESSION_SECRET||env.LINK_SIGNING_SECRET||'');
  if(secret.length<32) throw new Error('MEMBER_SESSION_SECRET_REQUIRED');
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`email:${email.toLowerCase().trim()}:${secret}`)));
  const id=btoa(String.fromCharCode(...bytes)).replace(/\+/gu,'-').replace(/\//gu,'_').replace(/=+$/gu,'');
  return resolveMemberIdentityAlias(env,id);
}
const page = (title,body,status=200) => new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${esc(title)}</title><link rel="stylesheet" href="/for-sellers.css"><body><main style="max-width:900px;margin:auto;padding:24px"><h1>${esc(title)}</h1>${body}</main></body></html>`,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex','referrer-policy':'no-referrer'}});
export async function handleSellerListingPilotRoutes(request,env,deps={}) {
  const path=new URL(request.url).pathname;
  if(!/^\/(?:api\/(?:admin\/)?seller-pilot(?:\/|$)|seller-pilot(?:\/|$)|admin\/seller-pilot$)/u.test(path)) return null;
  if(env.SELLER_MANUAL_PILOT_ENABLED!=='true') return json({ok:false,error:'PILOT_NOT_ENABLED'},404);
  const adminPath=path.startsWith('/api/admin/')||path==='/admin/seller-pilot';
  const publicId=path.match(/^\/seller-pilot\/shops\/(SPL_[a-zA-Z0-9-]+)$/u)?.[1];
  if(request.method!=='GET'&&!originOK(request)) return json({ok:false,error:'ORIGIN_REQUIRED'},403);
  const admin=adminPath&&await (deps.authorize||authorizeAdminRequest)(request,env);
  const savePath=path.match(/^\/api\/seller-pilot\/(SPL_[a-zA-Z0-9-]+)\/save$/u);
  const member=!adminPath&&!publicId?await (deps.member||readMemberSession)(request,env):null;
  if(!publicId&&!admin&&!member) return json({ok:false,error:'AUTH_REQUIRED',login:'/login.html'},401);
  if(request.method==='GET'&&(path==='/seller-pilot'||path==='/admin/seller-pilot')) return page('掲載見本と掲載確認',`<p>通常料金：月額4,980円（税込）。公開の承認と有料契約は別です。</p><div id="pilotApp" data-admin="${admin?'true':'false'}"></div><p id="pilotStatus" role="status"></p><script type="module" src="/seller-pilot.js"></script>`);
  const db=env.PRODUCT_DB;if(!db) return json({ok:false,error:'STORE_UNAVAILABLE'},503);
  const select=async(id)=> (await db.prepare('SELECT * FROM seller_listing_pilots WHERE pilot_id=?1').bind(id).all()).results?.[0];
  const offerEnabled=env.SELLER_PILOT_OFFER_VERSION===PILOT_OFFER;
  try {
    if(publicId&&request.method==='GET') {
      const row=await select(publicId),doc=row&&JSON.parse(row.document_json);
      if(!doc||!pilotEntitlement(doc).active) return page('掲載していません','<p>この店舗の掲載期間は終了したか、公開前です。</p>',404);
      return page(doc.shop_name,`<details><summary>事業者情報</summary><p>${esc(doc.business_name)}<br>${esc(doc.registered_address)}</p></details><section>${doc.products.map(p=>`<article><img referrerpolicy="no-referrer" src="${esc(p.image_url)}" alt="" width="160"><h2>${esc(p.title)}</h2><p>${p.price_jpy===null?'価格未確認':`${p.price_jpy.toLocaleString('ja-JP')}円（${esc(p.price_verified_at.slice(0,10))}確認）`}</p><a href="${esc(p.destination_url)}" data-pilot-click="${esc(p.id)}" target="_blank" rel="noopener noreferrer">${esc(p.marketplace==='OWN_STORE'?'店舗の販売先':p.marketplace)}で確認</a><button data-pilot-save="${esc(p.id)}">気になるに保存</button></article>`).join('')}</section><div id="pilotPublic" data-pilot-id="${esc(publicId)}" data-test="${doc.test?'true':'false'}"></div><p id="saveStatus" role="status"></p><script type="module" src="/seller-pilot-public.js"></script>`);
    }
    if(path==='/seller-pilot/saved'&&request.method==='GET') {
      const rows=(await db.prepare(`SELECT p.pilot_id,p.document_json,s.product_id FROM seller_listing_pilot_saves s
        JOIN seller_listing_pilots p ON p.pilot_id=s.pilot_id WHERE s.member_id=?1 ORDER BY s.saved_at DESC LIMIT 100`).bind(member.id).all()).results||[];
      return page('保存した商品',rows.map(row=>{const doc=JSON.parse(row.document_json),product=doc.products.find(p=>p.id===row.product_id);return product?`<article><h2>${esc(product.title)}</h2><p>${esc(doc.shop_name)}</p>${pilotEntitlement(doc).active?`<a href="/seller-pilot/shops/${esc(row.pilot_id)}">掲載ページを見る</a>`:'<p>掲載期間は終了しました。保存履歴は保持しています。</p>'}</article>`:'';}).join('')||'<p>保存した商品はありません。</p>');
    }
    if(savePath&&request.method==='POST') {
      const row=await select(savePath[1]),doc=row&&JSON.parse(row.document_json);
      if(!doc||!pilotEntitlement(doc).active) return json({ok:false,error:'NOT_FOUND'},404);
      const parsed=await readBoundedJson(request,1000);
      const productId=String(parsed.value?.product_id||'');
      if(!parsed.ok||!doc.products.some(p=>p.id===productId)) return json({ok:false,error:'PRODUCT_REQUIRED'},400);
      if(doc.test||member.id===row.owner_member_id||String(env.INTERNAL_MEMBER_IDS||'').split(',').includes(member.id)) return json({ok:false,error:'OWNER_OR_TEST_EXCLUDED'},400);
      await db.prepare('INSERT INTO seller_listing_pilot_saves(pilot_id,product_id,member_id,saved_at) VALUES(?1,?2,?3,?4) ON CONFLICT DO NOTHING').bind(row.pilot_id,productId,member.id,new Date().toISOString()).run();
      return json({ok:true});
    }
    if(request.method==='GET') {
      const result=admin?await db.prepare('SELECT * FROM seller_listing_pilots ORDER BY created_at DESC LIMIT 50').all():await db.prepare('SELECT * FROM seller_listing_pilots WHERE owner_member_id=?1 ORDER BY created_at DESC LIMIT 50').bind(member.id).all();
      return json({ok:true,measurement_excluded:admin||String(env.INTERNAL_MEMBER_IDS||'').split(',').includes(member?.id),offer_enabled:offerEnabled,offer_version:PILOT_OFFER,items:await Promise.all(result.results.map(async row=>{const doc=JSON.parse(row.document_json);return {pilot_id:row.pilot_id,revision:row.revision,...doc,entitlement:pilotEntitlement(doc),kpi:await pilotKpi(env,row,doc)};}))});
    }
    if(request.method!=='POST') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
    const parsed=await readBoundedJson(request,40_000);
    if(!parsed.ok||!parsed.value||typeof parsed.value!=='object') return json({ok:false,error:'INVALID_INPUT'},400);
    const input=parsed.value;
    if(admin&&path==='/api/admin/seller-pilot'&&input.action==='CREATE') {
      const doc=normalizePilotDraft(input);
      const inquiry=(await db.prepare('SELECT contact_email FROM seller_business_inquiries WHERE inquiry_id=?1').bind(text(input.inquiry_id,100)).all()).results?.[0];
      if(!inquiry) return json({ok:false,error:'INQUIRY_REQUIRED'},400);
      const owner=await (deps.ownerForEmail||ownerForEmail)(env,inquiry.contact_email),id=`SPL_${crypto.randomUUID()}`,at=new Date().toISOString();
      await db.batch([
        db.prepare('INSERT INTO seller_listing_pilots(pilot_id,inquiry_id,owner_member_id,revision,document_json,created_at,updated_at) VALUES(?1,?2,?3,1,?4,?5,?5)').bind(id,input.inquiry_id,owner,JSON.stringify(doc),at),
        db.prepare("INSERT INTO seller_listing_pilot_audit VALUES(?1,?2,1,'ADMIN','CREATE',?3)").bind(crypto.randomUUID(),id,at)
      ]);
      return json({ok:true,pilot_id:id,revision:1},201);
    }
    const id=path.match(/\/(SPL_[a-zA-Z0-9-]+)$/u)?.[1];
    const row=id&&await select(id);
    if(!row||(!admin&&row.owner_member_id!==member.id)) return json({ok:false,error:'NOT_FOUND'},404);
    if(Number(input.revision)!==row.revision) return json({ok:false,error:'REVISION_CONFLICT'},409);
    const doc=JSON.parse(row.document_json);
    let next;
    if(admin && input.action==='REVISE') {
      if(doc.status==='PUBLISHED') return json({ok:false,error:'PUBLISHED_REVISION_REQUIRES_REVIEW'},409);
      next=normalizePilotDraft(input);
    } else next=transitionPilot(doc,input.action,input,{actor:admin?'ADMIN':'OWNER',offerEnabled});
    if(next===doc) return json({ok:true,revision:row.revision});
    const at=new Date().toISOString(),revision=row.revision+1;
    const results=await db.batch([
      db.prepare('UPDATE seller_listing_pilots SET document_json=?1,revision=?2,updated_at=?3 WHERE pilot_id=?4 AND revision=?5').bind(JSON.stringify(next),revision,at,id,row.revision),
      db.prepare(`INSERT INTO seller_listing_pilot_audit(event_id,pilot_id,revision,actor_kind,action,occurred_at)
        SELECT ?1,?2,?3,?4,?5,?6 WHERE changes()=1`).bind(crypto.randomUUID(),id,revision,admin?'ADMIN':'OWNER',input.action,at)
    ]);
    if(results[0]?.meta?.changes!==1) return json({ok:false,error:'REVISION_CONFLICT'},409);
    return json({ok:true,revision});
  } catch(error) {
    const reason=String(error?.message||'');
    return json({ok:false,error:/^[A-Z_]+$/u.test(reason)?reason:'PILOT_STORE_UNAVAILABLE'},/^[A-Z_]+$/u.test(reason)?400:503);
  }
}
