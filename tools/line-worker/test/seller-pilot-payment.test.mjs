import test from 'node:test';
import assert from 'node:assert/strict';
import {paidRequest,pilotCheckout,verifiedPilotPayment,processPilotStripeEvent,PAID_TERMS} from '../src/seller-pilot-payment.mjs';
const now=new Date();
const old=()=>({test:true,approved_at:'2026-01-01T00:00:00Z',starts_at:'2026-01-01T00:00:00Z',ends_at:'2026-01-31T00:00:00Z'});
const consent=()=>paidRequest(old(),{paid_consent:true,paid_terms_version:PAID_TERMS},now);
function fixture(){
 const calls=[], row={pilot_id:'SPL_test'};
 const metadata={purpose:'SELLER_PILOT',pilot_id:row.pilot_id,paid_opt_in_at:now.toISOString()};
 const price={id:'price_test',currency:'jpy',unit_amount:4980,active:true,livemode:false,tax_behavior:'inclusive',recurring:{interval:'month',interval_count:1}};
 const session={id:'cs_test_fixture',livemode:false,metadata,url:'https://checkout.stripe.com/c/pay/test',mode:'subscription',status:'open',payment_status:'unpaid'};
 const sub={id:'sub_fixture',livemode:false,metadata,status:'active',currency:'jpy',items:{data:[{quantity:1,price}]},current_period_end:Math.floor(Date.now()/1000)+3600,latest_invoice:{status:'paid',currency:'jpy',amount_paid:4980}};
 const env={SELLER_PILOT_PAYMENTS_ENABLED:'true',SELLER_PILOT_PAYMENT_MODE:'test',SELLER_PILOT_PRICE_ID:'price_test',STRIPE_SECRET_KEY:'sk_test_'+'x'.repeat(32),STRIPE_FETCH:async(url,init)=>{
   calls.push({url,init});const p=new URL(url).pathname;
   return Response.json(p.includes('/prices/')?price:p.includes('/subscriptions/')?sub:session);
 }};
 return{calls,row,price,session,sub,env};
}
test('explicit terms and expiry required; unrelated saved card cannot create a contract',async()=>{
 assert.throws(()=>paidRequest(old(),{}),/CONSENT/);
 assert.throws(()=>paidRequest({...old(),ends_at:new Date(Date.now()+1000).toISOString()},{paid_consent:true,paid_terms_version:PAID_TERMS}),/FINISH/);
 const {calls,row,env}=fixture();await assert.rejects(()=>pilotCheckout(env,row,{...old(),payment_method:'other-card'}),/CONSENT/);assert.equal(calls.length,0);
 const d=consent();assert.strictEqual(paidRequest(d,{paid_consent:true,paid_terms_version:PAID_TERMS}),d);
});
test('test/live separation, amount/currency/tax/recurrence validated before creating checkout',async()=>{
 const {row,env,price,calls}=fixture(),d=consent();
 await assert.rejects(()=>pilotCheckout({...env,STRIPE_SECRET_KEY:'sk_live_'+'x'.repeat(32),SELLER_PILOT_PAYMENT_MODE:'live'},row,d),/QA_LIVE/);
 price.unit_amount=3980;await assert.rejects(()=>pilotCheckout(env,row,d),/MISMATCH/);assert.equal(calls.filter(c=>c.init.method==='POST').length,0);
});
test('durable consent gives same idempotency key; old unknown outcome cannot create again',async()=>{
 const {row,env,calls}=fixture(),d=consent();await pilotCheckout(env,row,d);await pilotCheckout(env,row,d);
 const posts=calls.filter(c=>c.init.method==='POST');assert.equal(posts.length,2);assert.equal(posts[0].init.headers['idempotency-key'],posts[1].init.headers['idempotency-key']);
 assert.doesNotMatch(posts[0].init.body,/trial_end|customer=|price_data/);
 await assert.rejects(()=>pilotCheckout(env,row,d,new Date(now.getTime()+24*3600000)),/RECONCILIATION/);
});
test('success screen is insufficient; authoritative session/subscription/invoice must all match',async()=>{
 const {row,env,session,sub}=fixture(),d={...consent(),payment:{session_id:'cs_test_fixture'}};
 assert.equal((await verifiedPilotPayment(env,row,d)).status,'PENDING');
 session.status='complete';session.payment_status='paid';session.subscription=sub.id;
 assert.equal((await verifiedPilotPayment(env,row,d)).status,'ACTIVE');
 sub.latest_invoice.status='open';assert.equal((await verifiedPilotPayment(env,row,d)).status,'INACTIVE');
 sub.latest_invoice.status='paid';sub.status='canceled';assert.equal((await verifiedPilotPayment(env,row,d)).status,'INACTIVE');
 sub.metadata={purpose:'SELLER_PILOT',pilot_id:'SPL_another'};await assert.rejects(()=>verifiedPilotPayment(env,row,d),/MISMATCH/);
});
test('pilot-off cannot alter existing billing webhook processing',async()=>{
 assert.equal(await processPilotStripeEvent({}, {type:'invoice.paid',data:{object:{subscription:'sub_existing'}}}),null);
});
