// Operator tool: defaults to read-only. --create-price creates a Price only;
// it never changes products, old Prices, subscriptions, customers or receipts.
import {pathToFileURL} from 'node:url';
import {stripeRequest,stripeMode} from '../src/stripe-client.mjs';
import {AUTO_RENEW_OFFER,autoRenewPolicy} from '../public/seller-trial-policy.mjs';
export async function prepareSellerPrice(env,{productId,mode,create=false}={}) {
 if(!['test','live'].includes(mode)||stripeMode(env)!==mode||!/^prod_[A-Za-z0-9_]+$/u.test(productId||''))throw new Error('EXPLICIT_PRODUCT_AND_MODE_REQUIRED');
 const policy=autoRenewPolicy(AUTO_RENEW_OFFER),live=mode==='live';
 const product=await stripeRequest(env,'GET',`/products/${productId}`);
 if(product.id!==productId||product.livemode!==live||product.active!==true||!/^HOSHILU Seller$/iu.test(product.name||''))throw new Error('SELLER_PRODUCT_REVIEW_REQUIRED');
 const lookup='hoshilu_seller_1980_jpy_month_inclusive_v1';
 const list=await stripeRequest(env,'GET','/prices',null,{query:{lookup_keys:[lookup],limit:2}});
 if(list.has_more||list.data?.length>1)throw new Error('PRICE_REVIEW_REQUIRED');
 let price=list.data?.[0];
 if(!price&&!create)return {status:'PRICE_NOT_CREATED',mode,product_id:productId,lookup_key:lookup};
 if(!price)price=await stripeRequest(env,'POST','/prices',{product:productId,unit_amount:policy.amount,currency:policy.currency,recurring:{interval:policy.interval,interval_count:policy.interval_count},tax_behavior:policy.tax_behavior,lookup_key:lookup,metadata:{offer:policy.offer,terms:policy.terms}},{idempotencyKey:`seller-1980-price-v1:${mode}:${productId}`});
 if(!/^price_[A-Za-z0-9_]+$/u.test(price.id||'')||price.active!==true||price.product!==productId||price.livemode!==live||price.unit_amount!==policy.amount||price.currency!==policy.currency||price.tax_behavior!==policy.tax_behavior||price.recurring?.interval!==policy.interval||price.recurring.interval_count!==policy.interval_count)throw new Error('PRICE_OR_ENVIRONMENT_MISMATCH');
 return {status:'PRICE_VERIFIED',mode,product_id:productId,price_id:price.id,amount:policy.amount,currency:policy.currency,tax_behavior:policy.tax_behavior,offer:policy.offer,terms:policy.terms};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 const value=name=>process.argv[process.argv.indexOf(name)+1];
 try{console.log(JSON.stringify(await prepareSellerPrice(process.env,{productId:value('--product'),mode:value('--mode'),create:process.argv.includes('--create-price')}),null,2));}
 catch(error){console.error(/^[A-Z_]+$/u.test(error.message)?error.message:'STRIPE_OPERATION_FAILED');process.exitCode=1;}
}
