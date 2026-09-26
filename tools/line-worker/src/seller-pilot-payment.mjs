// Explicit owner opt-in only. No timer, trial-expiry or GET creates Stripe objects.
import {stripeRequest,stripeMode} from './stripe-client.mjs';
import {MONTHLY_JPY} from '../public/seller-trial-policy.mjs';
export const PAID_TERMS='seller-monthly-4980-20260927-v1';
export function paidRequest(doc,input,now=new Date()) {
  if(!doc.approved_at||!doc.starts_at||!Number.isFinite(Date.parse(doc.ends_at))||now.getTime()<Date.parse(doc.ends_at)) throw new Error('TRIAL_MUST_FINISH_FIRST');
  if(input.paid_consent!==true||input.paid_terms_version!==PAID_TERMS) throw new Error('PAID_CONSENT_REQUIRED');
  if(doc.paid_opt_in_at)return doc;
  return {...doc,paid_opt_in_at:now.toISOString(),paid_terms_version:PAID_TERMS};
}
export function pilotPaymentsReady(env) {
  return env.SELLER_PILOT_PAYMENTS_ENABLED==='true' && ['live','test'].includes(stripeMode(env)) && env.SELLER_PILOT_PAYMENT_MODE===stripeMode(env) && /^price_[A-Za-z0-9]+$/u.test(env.SELLER_PILOT_PRICE_ID||'');
}
function requireMode(env,doc) {
  if(!pilotPaymentsReady(env))throw new Error('PILOT_PAYMENTS_NOT_ENABLED');
  if(doc.test && stripeMode(env)!=='test') throw new Error('QA_LIVE_PAYMENT_FORBIDDEN');
  if(!doc.test && stripeMode(env)==='test') throw new Error('EXTERNAL_TEST_PAYMENT_FORBIDDEN');
  if(!doc.paid_opt_in_at||doc.paid_terms_version!==PAID_TERMS)throw new Error('PAID_CONSENT_REQUIRED');
}
const idOf=o=>typeof o==='string'?o:o?.id;
function metadataOK(o,id){return o?.metadata?.purpose==='SELLER_PILOT'&&o.metadata.pilot_id===id;}
function priceOK(price,env){return price?.id===env.SELLER_PILOT_PRICE_ID&&price.active!==false&&price.currency==='jpy'&&price.unit_amount===MONTHLY_JPY&&price.recurring?.interval==='month'&&(price.recurring.interval_count||1)===1&&price.tax_behavior==='inclusive'&&price.livemode===(stripeMode(env)==='live');}
export async function pilotCheckout(env,row,doc,now=new Date()) {
  requireMode(env,doc);
  if(now.getTime()<Date.parse(doc.ends_at))throw new Error('TRIAL_MUST_FINISH_FIRST');
  if(doc.payment?.session_id) {
    const existing=await stripeRequest(env,'GET',`/checkout/sessions/${doc.payment.session_id}`);
    if(!metadataOK(existing,row.pilot_id))throw new Error('PAYMENT_IDENTITY_MISMATCH');
    if(existing.livemode!==(stripeMode(env)==='live')||!/^https:\/\/checkout\.stripe\.com\//u.test(existing.url||''))throw new Error('CHECKOUT_RESPONSE_INVALID');
    if(existing.status!=='open')throw new Error('CHECK_PAYMENT_OR_CONTACT_OPERATOR');
    return existing;
  }
  // Stripe idempotency retention is finite: unknown outcomes older than 23h require reconciliation.
  if(now.getTime()-Date.parse(doc.paid_opt_in_at)>23*3600000)throw new Error('PAYMENT_RECONCILIATION_REQUIRED');
  const price=await stripeRequest(env,'GET',`/prices/${env.SELLER_PILOT_PRICE_ID}`);
  if(!priceOK(price,env))throw new Error('PRICE_OR_ENVIRONMENT_MISMATCH');
  const metadata={purpose:'SELLER_PILOT',pilot_id:row.pilot_id,paid_terms_version:PAID_TERMS,paid_opt_in_at:doc.paid_opt_in_at};
  const session=await stripeRequest(env,'POST','/checkout/sessions',{
    mode:'subscription',locale:'ja',payment_method_types:['card'],line_items:[{price:price.id,quantity:1}],
    metadata,subscription_data:{metadata},client_reference_id:row.pilot_id,
    success_url:'https://hoshilu.app/seller-pilot',cancel_url:'https://hoshilu.app/seller-pilot',
    custom_text:{submit:{message:'月額4,980円（税込）。初回はこのお申込みの決済時、以後毎月更新。管理画面から次回更新前に解約できます。'}}
  },{idempotencyKey:`pilot-paid:${row.pilot_id}:${doc.paid_opt_in_at}`});
  if(!/^cs_[A-Za-z0-9_]+$/u.test(session?.id||'')||!metadataOK(session,row.pilot_id)||session.metadata.paid_opt_in_at!==doc.paid_opt_in_at||session.livemode!==(stripeMode(env)==='live')||!/^https:\/\/checkout\.stripe\.com\//u.test(session.url||''))throw new Error('CHECKOUT_RESPONSE_INVALID');
  return session;
}
export async function verifiedPilotPayment(env,row,doc) {
  requireMode(env,doc);
  if(!/^cs_[A-Za-z0-9_]+$/u.test(doc.payment?.session_id||''))throw new Error('CHECKOUT_REQUIRED');
  const session=await stripeRequest(env,'GET',`/checkout/sessions/${doc.payment.session_id}`);
  if(!metadataOK(session,row.pilot_id)||session.metadata.paid_opt_in_at!==doc.paid_opt_in_at||session.livemode!==(stripeMode(env)==='live')||session.mode!=='subscription')throw new Error('PAYMENT_IDENTITY_MISMATCH');
  const subId=idOf(session.subscription);
  if(session.status!=='complete'||session.payment_status!=='paid'||!/^sub_[A-Za-z0-9]+$/u.test(subId||''))return {...doc.payment,status:'PENDING',verified_at:new Date().toISOString()};
  const sub=await stripeRequest(env,'GET',`/subscriptions/${subId}`,null,{query:{expand:['latest_invoice']}});
  const items=sub.items?.data||[],price=items[0]?.price,invoice=sub.latest_invoice;
  if(!metadataOK(sub,row.pilot_id)||sub.metadata.paid_opt_in_at!==doc.paid_opt_in_at||sub.livemode!==session.livemode||items.length!==1||items[0].quantity!==1||!priceOK(price,env)||sub.currency!=='jpy')throw new Error('SUBSCRIPTION_MISMATCH');
  const end=Number(sub.current_period_end||items[0]?.current_period_end||0);
  const active=sub.status==='active'&&invoice?.status==='paid'&&invoice.amount_paid===MONTHLY_JPY&&invoice.currency==='jpy'&&end>Date.now()/1000;
  return {session_id:session.id,subscription_id:sub.id,status:active?'ACTIVE':'INACTIVE',current_period_end_at:end?new Date(end*1000).toISOString():null,
    mode:stripeMode(env),verified_at:new Date().toISOString(),cancel_at_period_end:sub.cancel_at_period_end===true};
}
export async function cancelPilotSubscription(env,row,doc) {
  const verified=await verifiedPilotPayment(env,row,doc);
  if(!verified.subscription_id)throw new Error('SUBSCRIPTION_REQUIRED');
  await stripeRequest(env,'POST',`/subscriptions/${verified.subscription_id}`,{cancel_at_period_end:true},{idempotencyKey:`pilot-cancel:${row.pilot_id}:${verified.subscription_id}`});
  return verifiedPilotPayment(env,row,doc);
}
// Caller must already have verified the raw Stripe webhook signature and timestamp.
export async function processPilotStripeEvent(env,event) {
  if(env.SELLER_PILOT_PAYMENTS_ENABLED!=='true'||!['checkout.session.completed','checkout.session.async_payment_succeeded','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed'].includes(event?.type))return null;
  const object=event?.data?.object||{};
  let row;
  try {
    if(object.metadata?.purpose==='SELLER_PILOT') {
      row=(await env.PRODUCT_DB.prepare('SELECT * FROM seller_listing_pilots WHERE pilot_id=?1').bind(object.metadata.pilot_id).all()).results?.[0];
    } else {
      const sub=idOf(object.subscription||object.parent?.subscription_details?.subscription);
      if(!sub)return null;
      row=(await env.PRODUCT_DB.prepare("SELECT * FROM seller_listing_pilots WHERE json_extract(document_json,'$.payment.subscription_id')=?1").bind(sub).all()).results?.[0];
    }
  } catch(error) {if(/no such table/iu.test(String(error?.message)))return null;throw error;}
  if(!row)return object.metadata?.purpose==='SELLER_PILOT'?'PILOT_NOT_FOUND':null;
  // Re-fetch current provider state for every event; never apply an old event payload as current state.
  const doc=JSON.parse(row.document_json);
  // Recover a completed Checkout whose response was lost before local persistence.
  const candidate=!doc.payment?.session_id && event.type.startsWith('checkout.session.') && /^cs_[A-Za-z0-9_]+$/u.test(object.id||'') ? {...doc,payment:{session_id:object.id}} : doc;
  const payment=await verifiedPilotPayment(env,row,candidate),at=new Date().toISOString();
  const rs=await env.PRODUCT_DB.batch([
    env.PRODUCT_DB.prepare('UPDATE seller_listing_pilots SET document_json=?1,revision=revision+1,updated_at=?2 WHERE pilot_id=?3 AND revision=?4').bind(JSON.stringify({...doc,payment}),at,row.pilot_id,row.revision),
    env.PRODUCT_DB.prepare("INSERT INTO seller_listing_pilot_audit(event_id,pilot_id,revision,actor_kind,action,occurred_at) SELECT ?1,?2,?3,'ADMIN','STRIPE_VERIFIED',?4 WHERE changes()=1").bind(`stripe:${event.id}`,row.pilot_id,row.revision+1,at)
  ]);
  if(rs[0]?.meta?.changes!==1)throw new Error('PILOT_PAYMENT_REVISION_CONFLICT');
  return `PILOT_${payment.status}`;
}
