import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSellerPrice} from '../scripts/prepare-seller-1980-price.mjs';
import {publicPilotOffer} from '../src/seller-listing-pilot.mjs';
import {AUTO_RENEW_OFFER} from '../public/seller-trial-policy.mjs';
test('new Price operator tool cannot modify old Prices and defaults to read-only',async()=>{
 const calls=[];let price;
 const env={STRIPE_SECRET_KEY:'sk_test_'+'x'.repeat(32),STRIPE_FETCH:async(url,init)=>{
  const path=new URL(url).pathname,body=new URLSearchParams(init.body);calls.push({path,method:init.method});
  if(path.startsWith('/v1/products/'))return Response.json({id:'prod_seller',name:'HOSHILU Seller',active:true,livemode:false});
  if(init.method==='POST') {assert.equal(path,'/v1/prices');assert.equal(body.get('unit_amount'),'1980');assert.equal(body.get('tax_behavior'),'inclusive');assert.equal(body.get('recurring[interval]'),'month');price={id:'price_new',active:true,product:'prod_seller',livemode:false,unit_amount:1980,currency:'jpy',tax_behavior:'inclusive',recurring:{interval:'month',interval_count:1}};return Response.json(price);}
  return Response.json({data:price?[price]:[],has_more:false});
 }};
 assert.equal((await prepareSellerPrice(env,{productId:'prod_seller',mode:'test'})).status,'PRICE_NOT_CREATED');assert.equal(calls.some(c=>c.method==='POST'),false);
 assert.equal((await prepareSellerPrice(env,{productId:'prod_seller',mode:'test',create:true})).price_id,'price_new');
 await prepareSellerPrice(env,{productId:'prod_seller',mode:'test',create:true});assert.equal(calls.filter(c=>c.method==='POST').length,1);
 price.unit_amount=4980;await assert.rejects(()=>prepareSellerPrice(env,{productId:'prod_seller',mode:'test',create:true}),/MISMATCH/);
 await assert.rejects(()=>prepareSellerPrice(env,{productId:'prod_seller',mode:'live',create:true}),/MODE_REQUIRED/);
});
test('current recruitment cannot claim availability with old or missing Price configuration',()=>{
 const env={SELLER_MANUAL_PILOT_ENABLED:'true',SELLER_PILOT_AUTORENEW_ENABLED:'true',SELLER_PILOT_PAYMENTS_ENABLED:'true',SELLER_PILOT_OFFER_VERSION:AUTO_RENEW_OFFER,SELLER_PILOT_RECRUITMENT_VERIFIED:AUTO_RENEW_OFFER,SELLER_PILOT_PAYMENT_MODE:'live',SELLER_PILOT_PRICE_ID:'price_old'};
 assert.equal(publicPilotOffer(env).enabled,false);assert.equal(publicPilotOffer(env).monthly_jpy,1980);
});
