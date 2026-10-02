// Versioned opt-in flow. Existing no-card/no-auto-charge offers never enter here.
import {stripeRequest,stripeMode} from './stripe-client.mjs';
import {AUTO_RENEW_OFFER,LEGACY_AUTO_RENEW_OFFER} from '../public/seller-trial-policy.mjs';
// 2026-10-03: offer の一覧はサーバー側の registry から（1,980円は公開ポリシーのまま、AI販促担当 Light/Standard を足す）。
import {autoRenewPolicy,isAutoRenewOffer,offerPriceConfiguration,creatableOffer,autoRenewOffersForReconciliation} from './seller-offer-registry.mjs';
import {isPromoOffer} from './seller-promo-billing.mjs';
const idOf = value => typeof value === 'string' ? value : value?.id;
const isId = (value,prefix) => new RegExp(`^${prefix}_[A-Za-z0-9_]+$`,'u').test(value||'');
const metadata = (row,doc) => ({purpose:'SELLER_PILOT_AUTORENEW',pilot_id:row.pilot_id,terms:doc.autorenew?.terms,consented_at:doc.autorenew?.consented_at});
const identity = (object,row,doc,env) => object?.livemode === (stripeMode(env)==='live') && Object.entries(metadata(row,doc)).every(([k,v])=>v&&object?.metadata?.[k]===v);
function contract(doc,env) {
  const policy=autoRenewPolicy(doc.offer_version);
  if(!policy)throw new Error('AUTORENEW_CONSENT_REQUIRED');
  const saved=doc.autorenew?.contract;
  if(saved) {
    if(Object.entries(policy).some(([k,v])=>k!=='copy'&&saved[k]!==v)||saved.mode!==stripeMode(env)||!isId(saved.price_id,'price')||!isId(saved.product_id,'prod'))throw new Error('CONTRACT_SNAPSHOT_MISMATCH');
    return saved;
  }
  if(doc.offer_version!==LEGACY_AUTO_RENEW_OFFER)throw new Error('CONTRACT_SNAPSHOT_REQUIRED');
  return {...policy,price_id:env.SELLER_PILOT_PRICE_ID,mode:stripeMode(env)};
}
export function autoRenewReady(env,offer=AUTO_RENEW_OFFER,{existing=false}={}) {
  const configuration=offerPriceConfiguration(env,stripeMode(env),offer);
  return env.SELLER_PILOT_AUTORENEW_ENABLED==='true' && env.SELLER_PILOT_PAYMENTS_ENABLED==='true' && (existing||creatableOffer(env,offer)) &&
    ['test','live'].includes(stripeMode(env)) && env.SELLER_PILOT_PAYMENT_MODE===stripeMode(env) && isId(configuration.price_id,'price') && isId(configuration.product_id,'prod');
}
function requireAccess(env,doc,{creating=false}={}) {
  if(!isAutoRenewOffer(doc.offer_version)||!doc.autorenew?.consented_at||doc.autorenew.terms!==autoRenewPolicy(doc.offer_version).terms)throw new Error('AUTORENEW_CONSENT_REQUIRED');
  // New-contract switches do not disable cancellation or reconciliation of existing contracts.
  contract(doc,env);
  // AI販促担当の契約は、公開済み（starts_at あり）なら販売を止めた後でもサブスク作成を続ける（既存契約を止めない）。
  const existingPromo=isPromoOffer(doc.offer_version)&&Boolean(doc.starts_at);
  if(creating&&!existingPromo&&!creatableOffer(env,doc.offer_version))throw new Error('SUPERSEDED_OFFER_REVIEW_REQUIRED');
  if(creating&&!autoRenewReady(env,doc.offer_version,{existing:existingPromo}))throw new Error('AUTORENEW_NOT_ENABLED');
  if(!['test','live'].includes(stripeMode(env))||env.SELLER_PILOT_PAYMENT_MODE!==stripeMode(env))throw new Error('PAYMENT_MODE_MISMATCH');
  if(doc.test&&stripeMode(env)!=='test')throw new Error('QA_LIVE_PAYMENT_FORBIDDEN');
  if(!doc.test&&stripeMode(env)!=='live')throw new Error('EXTERNAL_TEST_PAYMENT_FORBIDDEN');
}
function fresh(at,now) {
  const elapsed=now.getTime()-Date.parse(at);
  if(!Number.isFinite(elapsed)||elapsed<0||elapsed>23*3600000)throw new Error('PAYMENT_RECONCILIATION_REQUIRED');
}
export function autoRenewConsent(doc,input,now=new Date(),env={}) {
  if(!creatableOffer(env,doc.offer_version)||doc.starts_at||doc.status!=='DRAFT'||doc.autorenew?.cancel_requested_at)throw new Error('AUTORENEW_CONSENT_NOT_ALLOWED');
  const policy=autoRenewPolicy(doc.offer_version);
  if(input.autorenew_consent!==true||input.autorenew_terms!==policy.terms)throw new Error('AUTORENEW_CONSENT_REQUIRED');
  if(doc.autorenew?.consented_at)return doc;
  const configuration=offerPriceConfiguration(env,stripeMode(env),doc.offer_version);
  if(!isId(configuration.price_id,'price')||!isId(configuration.product_id,'prod'))throw new Error('PRICE_CONFIGURATION_REQUIRED');
  return {...doc,autorenew:{terms:policy.terms,consented_at:now.toISOString(),accepted_copy:policy.copy,contract:{...policy,...configuration}}};
}
export async function setupAutoRenewCard(env,row,doc,now=new Date()) {
  requireAccess(env,doc,{creating:true});
  if(doc.starts_at||doc.autorenew.cancel_requested_at)throw new Error('CARD_SETUP_NOT_ALLOWED');
  await verifyNewAutoRenewPrice(env,doc);
  let session;
  if(doc.autorenew.setup_session_id)session=await stripeRequest(env,'GET',`/checkout/sessions/${doc.autorenew.setup_session_id}`);
  else {
    fresh(doc.autorenew.consented_at,now);
    // Setup mode stores a card, and neither invoices nor starts the trial.
    session=await stripeRequest(env,'POST','/checkout/sessions',{
      mode:'setup',currency:'jpy',locale:'ja',payment_method_types:['card'],
      metadata:metadata(row,doc),setup_intent_data:{metadata:metadata(row,doc)},
      client_reference_id:row.pilot_id,success_url:'https://hoshilu.app/seller-pilot',cancel_url:'https://hoshilu.app/seller-pilot',
      custom_text:{submit:{message:doc.autorenew.accepted_copy}}
    },{idempotencyKey:`pilot-auto-setup:${row.pilot_id}:${doc.autorenew.consented_at}`});
  }
  if(!isId(session?.id,'cs')||!identity(session,row,doc,env)||session.mode!=='setup'||session.status!=='open'||!/^https:\/\/checkout\.stripe\.com\//u.test(session.url||''))throw new Error('CARD_SETUP_RESPONSE_INVALID');
  return session;
}
export async function verifyAutoRenewCard(env,row,doc) {
  requireAccess(env,doc);
  if(!isId(doc.autorenew.setup_session_id,'cs'))throw new Error('CARD_SETUP_REQUIRED');
  const session=await stripeRequest(env,'GET',`/checkout/sessions/${doc.autorenew.setup_session_id}`);
  if(!identity(session,row,doc,env)||session.mode!=='setup'||session.status!=='complete'||!isId(idOf(session.setup_intent),'seti'))throw new Error('CARD_SETUP_INCOMPLETE');
  const setup=await stripeRequest(env,'GET',`/setup_intents/${idOf(session.setup_intent)}`);
  if(!identity(setup,row,doc,env)||setup.status!=='succeeded'||setup.usage!=='off_session'||!isId(idOf(setup.payment_method),'pm'))throw new Error('CARD_SETUP_INCOMPLETE');
  const pm=await stripeRequest(env,'GET',`/payment_methods/${idOf(setup.payment_method)}`);
  if(pm.livemode!==(stripeMode(env)==='live')||pm.type!=='card'||pm.id!==idOf(setup.payment_method))throw new Error('CARD_IDENTITY_MISMATCH');
  return {...doc.autorenew,payment_method_id:pm.id,card_verified_at:new Date().toISOString()};
}
// 税込1,980円の判定。Stripe 本番のダッシュボードでは既存 Price の tax_behavior を後から入れられない（Shell も読み取り専用）。
// 'unspecified' は、自動税計算オフ・税率なし（checkSubscription で強制）なら請求額が unit_amount ちょうど＝税込と同じになるので同等に扱う。
// 'exclusive'（税を上乗せ）は常に不可。
function taxOK(price,c){return price?.tax_behavior===c.tax_behavior||(c.tax_behavior==='inclusive'&&price?.tax_behavior==='unspecified');}
function validPrice(price,env,doc,{creating=false}={}) {
  const c=contract(doc,env);
  return price?.id===c.price_id&&(!creating||price.active===true)&&price.livemode===(c.mode==='live')&&price.currency===c.currency&&price.unit_amount===c.amount&&taxOK(price,c)&&price.recurring?.interval===c.interval&&price.recurring.interval_count===c.interval_count&&(!c.product_id||idOf(price.product)===c.product_id);
}
export async function verifyNewAutoRenewPrice(env,doc) {
  requireAccess(env,doc,{creating:true});
  const price=await stripeRequest(env,'GET',`/prices/${contract(doc,env).price_id}`);
  if(!validPrice(price,env,doc,{creating:true}))throw new Error('PRICE_OR_ENVIRONMENT_MISMATCH');
  return price;
}
function checkSubscription(sub,row,doc,env) {
  const items=sub.items?.data||[];
  if(!identity(sub,row,doc,env)||!isId(sub.id,'sub')||idOf(sub.customer)!==doc.autorenew.customer_id||items.length!==1||items[0].quantity!==1||!validPrice(items[0].price,env,doc)||sub.currency!=='jpy'||sub.trial_end!==Math.ceil(Date.parse(doc.ends_at)/1000)||sub.collection_method!=='charge_automatically'||sub.automatic_tax?.enabled===true||(sub.default_tax_rates||[]).length>0||(items[0]?.tax_rates||[]).length>0||(sub.discounts||[]).length>0)throw new Error('AUTORENEW_SUBSCRIPTION_MISMATCH');
  return sub;
}
export async function readAutoRenewSubscription(env,row,doc,now=new Date()) {
  requireAccess(env,doc);
  if(!isId(doc.autorenew.subscription_id,'sub'))throw new Error('SUBSCRIPTION_REQUIRED');
  const sub=checkSubscription(await stripeRequest(env,'GET',`/subscriptions/${doc.autorenew.subscription_id}`,null,{query:{expand:['latest_invoice']}}),row,doc,env);
  const end=Number(sub.current_period_end||sub.items.data[0].current_period_end||0),invoice=sub.latest_invoice;
  const paid=sub.status==='active'&&invoice?.status==='paid'&&invoice.currency==='jpy'&&invoice.amount_paid===contract(doc,env).amount&&end>now.getTime()/1000;
  return {...doc.autorenew,status:sub.status,paid,period_end_at:end?new Date(end*1000).toISOString():null,cancel_at_period_end:sub.cancel_at_period_end===true,canceled:sub.status==='canceled',verified_at:now.toISOString()};
}
async function readRow(env,id) {return (await env.PRODUCT_DB.prepare('SELECT * FROM seller_listing_pilots WHERE pilot_id=?1').bind(id).all()).results?.[0];}
async function persist(env,row,doc,action,actor) {
  const at=new Date().toISOString();
  const result=await env.PRODUCT_DB.batch([
    env.PRODUCT_DB.prepare('UPDATE seller_listing_pilots SET document_json=?1,revision=revision+1,updated_at=?2 WHERE pilot_id=?3 AND revision=?4').bind(JSON.stringify(doc),at,row.pilot_id,row.revision),
    env.PRODUCT_DB.prepare('INSERT INTO seller_listing_pilot_audit(event_id,pilot_id,revision,actor_kind,action,occurred_at) SELECT ?1,?2,?3,?4,?5,?6 WHERE changes()=1').bind(crypto.randomUUID(),row.pilot_id,row.revision+1,actor,action,at)
  ]);
  if(result[0]?.meta?.changes!==1)throw new Error('REVISION_CONFLICT');
  return {...row,revision:row.revision+1,document_json:JSON.stringify(doc)};
}
// Persist publication first. A failed DB write cannot create a billable subscription.
// One durable lease serializes subscription creation and cancellation. Unknown outcomes
// retain the original operation timestamp and idempotency key, never a new attempt ID.
export async function reconcileAutoRenew(env,id,{cancel=false,revision,now=new Date(),actor='ADMIN'}={}) {
  let row=await readRow(env,id);if(!row)throw new Error('PILOT_NOT_FOUND');
  let doc=JSON.parse(row.document_json);requireAccess(env,doc);
  if(!cancel&&revision!==undefined&&revision!==row.revision)throw new Error('REVISION_CONFLICT');
  if(Date.parse(doc.autorenew.lease_until)>now.getTime()) {
    if(!cancel)throw new Error('PAYMENT_UPDATE_IN_PROGRESS');
    // Record a deadline-sensitive cancellation even while another provider request
    // holds the lease. Its stale revision cannot overwrite this durable request.
    doc.autorenew={...doc.autorenew,cancel_requested_at:doc.autorenew.cancel_requested_at||now.toISOString()};
    row=await persist(env,row,doc,'AUTORENEW_CANCEL_REQUESTED',actor);
    return {row,doc,error:null,pending:true};
  }
  doc.autorenew={...doc.autorenew,lease_until:new Date(now.getTime()+120000).toISOString(),...(cancel?{cancel_requested_at:doc.autorenew.cancel_requested_at||now.toISOString()}:{})};
  row=await persist(env,row,doc,cancel?'AUTORENEW_CANCEL_REQUESTED':'AUTORENEW_RECONCILE',actor);
  try {
    if(doc.starts_at&&!doc.autorenew.subscription_id) {
      // A cancellation without a create attempt is complete without touching Stripe.
      if(doc.autorenew.cancel_requested_at&&!doc.autorenew.subscription_requested_at)doc.autorenew.canceled=true;
      else {
        requireAccess(env,doc,{creating:!doc.autorenew.subscription_requested_at});
        if(!doc.autorenew.card_verified_at||!isId(doc.autorenew.payment_method_id,'pm'))throw new Error('CARD_REGISTRATION_REQUIRED');
        if(!doc.autorenew.subscription_requested_at) {
          if(Date.parse(doc.ends_at)<=now.getTime()+60000)throw new Error('TRIAL_RECONCILIATION_REQUIRED');
          doc.autorenew.subscription_requested_at=now.toISOString();
          row=await persist(env,row,doc,'AUTORENEW_CREATE_REQUESTED',actor);
        }
        fresh(doc.autorenew.subscription_requested_at,now);
        const price=await stripeRequest(env,'GET',`/prices/${contract(doc,env).price_id}`);
        if(!validPrice(price,env,doc,{creating:true}))throw new Error('PRICE_OR_ENVIRONMENT_MISMATCH');
        if(!doc.autorenew.customer_id) {
          const customer=await stripeRequest(env,'POST','/customers',{metadata:metadata(row,doc),payment_method:doc.autorenew.payment_method_id},{idempotencyKey:`pilot-auto-customer:${id}:${doc.autorenew.consented_at}`});
          if(!isId(customer?.id,'cus')||!identity(customer,row,doc,env))throw new Error('CUSTOMER_IDENTITY_MISMATCH');
          doc.autorenew.customer_id=customer.id;row=await persist(env,row,doc,'AUTORENEW_CUSTOMER_VERIFIED',actor);
        }
        const sub=await stripeRequest(env,'POST','/subscriptions',{
          customer:doc.autorenew.customer_id,default_payment_method:doc.autorenew.payment_method_id,
          items:[{price:price.id,quantity:1}],metadata:metadata(row,doc),
          trial_end:Math.ceil(Date.parse(doc.ends_at)/1000),collection_method:'charge_automatically',automatic_tax:{enabled:false},default_tax_rates:[],
          trial_settings:{end_behavior:{missing_payment_method:'cancel'}},payment_settings:{payment_method_types:['card']}
        },{idempotencyKey:`pilot-auto-subscription:${id}:${doc.starts_at}`});
        checkSubscription(sub,row,doc,env);
        doc.autorenew.subscription_id=sub.id;row=await persist(env,row,doc,'AUTORENEW_SUBSCRIPTION_VERIFIED',actor);
      }
    }
    if(doc.autorenew.subscription_id) {
      if(doc.autorenew.cancel_requested_at) {
        // During the trial, cancel at its end so no first paid invoice is created.
        await stripeRequest(env,'POST',`/subscriptions/${doc.autorenew.subscription_id}`,{cancel_at_period_end:true},{idempotencyKey:`pilot-auto-cancel:${id}:${doc.autorenew.subscription_id}`});
      }
      doc.autorenew=await readAutoRenewSubscription(env,row,doc,now);
      if(doc.autorenew.cancel_requested_at&&!doc.autorenew.cancel_at_period_end&&!doc.autorenew.canceled)throw new Error('CANCELLATION_NOT_CONFIRMED');
    } else if(doc.autorenew.cancel_requested_at) doc.autorenew.canceled=true;
    delete doc.autorenew.error;
  } catch(error) {
    doc.autorenew.error=/^[A-Z_]+$/u.test(error.message)?error.message:'PAYMENT_PROVIDER_UNAVAILABLE';
  }
  delete doc.autorenew.lease_until;
  row=await persist(env,row,doc,'AUTORENEW_STATE_SAVED',actor);
  return {row,doc,error:doc.autorenew.error||null};
}
export async function runAutoRenewReconciliation(env) {
  if(!env.PRODUCT_DB||!['test','live'].includes(stripeMode(env)))return;
  let rows;
  try {rows=(await env.PRODUCT_DB.prepare("SELECT pilot_id FROM seller_listing_pilots WHERE json_extract(document_json,'$.offer_version') IN (SELECT value FROM json_each(?1)) AND json_extract(document_json,'$.autorenew.consented_at') IS NOT NULL AND (json_extract(document_json,'$.starts_at') IS NOT NULL OR json_extract(document_json,'$.autorenew.cancel_requested_at') IS NOT NULL) AND coalesce(json_extract(document_json,'$.autorenew.canceled'),0)=0 ORDER BY updated_at LIMIT 5").bind(JSON.stringify([AUTO_RENEW_OFFER,LEGACY_AUTO_RENEW_OFFER,...autoRenewOffersForReconciliation()])).all()).results||[];}catch(error){if(/no such table/iu.test(error.message))return;throw error;}
  for(const row of rows) {try {await reconcileAutoRenew(env,row.pilot_id);}catch{ /* durable state stays pending; no raw provider details in logs */ }}
}
export async function processAutoRenewStripeEvent(env,event) {
  if(!env.PRODUCT_DB)return null;
  const object=event?.data?.object||{};
  let row;
  if(object.metadata?.purpose==='SELLER_PILOT_AUTORENEW')row=await readRow(env,object.metadata.pilot_id);
  else {
    const sub=idOf(object.subscription||object.parent?.subscription_details?.subscription);
    if(!isId(sub,'sub'))return null;
    try {row=(await env.PRODUCT_DB.prepare("SELECT * FROM seller_listing_pilots WHERE json_extract(document_json,'$.autorenew.subscription_id')=?1").bind(sub).all()).results?.[0];}catch(error){if(/no such table/iu.test(error.message))return null;throw error;}
    if(!row)return null;
    // Invoice payloads only select a saved subscription; current Stripe state is authoritative.
    return (await reconcileAutoRenew(env,row.pilot_id)).error?'AUTORENEW_PENDING':'AUTORENEW_VERIFIED';
  }
  if(!row)throw new Error('PILOT_NOT_FOUND');
  const doc=JSON.parse(row.document_json);requireAccess(env,doc);
  if(!identity(object,row,doc,env))throw new Error('PAYMENT_IDENTITY_MISMATCH');
  // Provider state is always fetched afresh. Creation stays in the durable outbox.
  if(event.type.startsWith('customer.subscription.')&&doc.autorenew.subscription_id)return (await reconcileAutoRenew(env,row.pilot_id)).error?'AUTORENEW_PENDING':'AUTORENEW_VERIFIED';
  return 'AUTORENEW_PENDING';
}
