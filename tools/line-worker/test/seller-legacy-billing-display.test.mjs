import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyBillingDisplay} from '../src/seller-legacy-billing-display.mjs';
test('legacy billing displays actual price and invoice without changing the subscription or guessing 1980',async()=>{
 const account={stripe_subscription_id:'sub_old',stripe_customer_id:'cus_old'};
 const sub={id:'sub_old',customer:'cus_old',livemode:true,status:'trialing',trial_end:1900000000,items:{data:[{quantity:1,price:{id:'price_old',unit_amount:4980,currency:'jpy',recurring:{interval:'month',interval_count:1}}}]}};
 const env={STRIPE_SECRET_KEY:'sk_live_'+'x'.repeat(32),STRIPE_FETCH:async(url,init)=>{assert.equal(init.method,'GET');return Response.json(url.includes('upcoming')?{currency:'jpy',customer:'cus_old',amount_due:4980}:sub);}};
 const actual=await legacyBillingDisplay(env,account);assert.equal(actual.monthly_jpy,4980);assert.equal(actual.next_invoice_jpy,4980);
 sub.cancel_at_period_end=true;assert.equal((await legacyBillingDisplay(env,account)).next_billing_at,null);
 env.STRIPE_FETCH=async()=>{throw new Error('offline')};const unknown=await legacyBillingDisplay(env,account);assert.equal(unknown.monthly_jpy,null);assert.equal(unknown.billing_verified,false);
});
