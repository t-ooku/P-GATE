// Read the actual old subscription, never substitute the new enrollment amount.
import {stripeRequest,stripeMode} from './stripe-client.mjs';
export async function legacyBillingDisplay(env,account) {
 const unknown={monthly_jpy:null,next_invoice_jpy:null,price_id:null,billing_verified:false};
 if(!/^sub_[A-Za-z0-9_]+$/u.test(account?.stripe_subscription_id||''))return unknown;
 try {
  const sub=await stripeRequest(env,'GET',`/subscriptions/${account.stripe_subscription_id}`);
  const customer=typeof sub.customer==='string'?sub.customer:sub.customer?.id;
  if(sub.id!==account.stripe_subscription_id||customer!==account.stripe_customer_id||sub.livemode!==(stripeMode(env)==='live'))return unknown;
  const items=sub.items?.data||[],price=items[0]?.price;
  if(items.length!==1||items[0].quantity!==1||price?.currency!=='jpy'||price.recurring?.interval!=='month'||price.recurring.interval_count!==1||!Number.isSafeInteger(price.unit_amount))return unknown;
  const result={...unknown,monthly_jpy:price.unit_amount,price_id:price.id,billing_verified:true,cancel_at_period_end:sub.cancel_at_period_end===true,next_billing_at:sub.cancel_at_period_end||sub.status==='canceled'?null:new Date((sub.trial_end&&sub.status==='trialing'?sub.trial_end:sub.current_period_end||items[0].current_period_end)*1000).toISOString()};
  if(result.next_billing_at) {
   try {
    const invoice=await stripeRequest(env,'GET','/invoices/upcoming',null,{query:{subscription:sub.id}});
    if(invoice.currency==='jpy'&&invoice.customer===customer&&Number.isSafeInteger(invoice.amount_due))result.next_invoice_jpy=invoice.amount_due;
   }catch{/* An unavailable preview is shown as unknown, never the new 1980 default. */}
  }
  return result;
 }catch{return unknown;}
}
