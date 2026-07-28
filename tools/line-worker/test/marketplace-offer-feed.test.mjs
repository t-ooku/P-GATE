import test from 'node:test';
import assert from 'node:assert/strict';
import { marketplaceOfferStats, validateMarketplaceOfferFeed } from '../src/marketplace-offer-feed.mjs';

test('Qoo10・SHEIN・楽天の商品詳細URLだけをフィードとして受け入れる',()=>{
 const result=validateMarketplaceOfferFeed({tenant:'itg',batch_id:'offers-20260729-01',records:[
  {record_key:'q1',marketplace:'QOO10_JP',external_product_id:'123',product_url:'https://www.qoo10.jp/gmkt.inc/Goods/Goods.aspx?goodscode=123456789'},
  {record_key:'s1',marketplace:'SHEIN_JP',external_product_id:'456',product_url:'https://jp.shein.com/item-p-456789.html'},
  {record_key:'r1',marketplace:'RAKUTEN_JP',external_product_id:'shop:item',product_url:'https://item.rakuten.co.jp/shop/item/'}
 ]});
 assert.equal(result.records.length,3);
 assert.deepEqual(result.records.map(row=>row.marketplace),['QOO10_JP','SHEIN_JP','RAKUTEN_JP']);
});

test('検索結果URLや未許可ドメインを商品URLとして受け入れない',()=>{
 assert.throws(()=>validateMarketplaceOfferFeed({tenant:'itg',batch_id:'offers-20260729-02',records:[{marketplace:'QOO10_JP',external_product_id:'x',product_url:'https://www.qoo10.jp/s/?keyword=camera'}]}),/PRODUCT_URL_INVALID/);
 assert.throws(()=>validateMarketplaceOfferFeed({tenant:'itg',batch_id:'offers-20260729-03',records:[{marketplace:'SHEIN_JP',external_product_id:'x',product_url:'https://evil.example/item-p-123.html'}]}),/PRODUCT_URL_INVALID/);
});

test('marketplace offer stats reports safe counts without exposing product URLs',async()=>{
 const rows=[{marketplace:'QOO10_JP',total:12,available:9,oldest_observed_at:'2026-07-28T00:00:00Z',newest_observed_at:'2026-07-29T00:00:00Z',tenants:2}];
 const env={MARKETPLACE_OFFER_SYNC_SECRET:'x'.repeat(32),PRODUCT_DB:{prepare:()=>({all:async()=>({results:rows})})}};
 const response=await marketplaceOfferStats(new Request('https://hoshilu.app/api/internal/marketplace-offers/stats',{headers:{authorization:`Bearer ${'x'.repeat(32)}`}}),env);
 assert.equal(response.status,200);
 const body=await response.json();
 assert.deepEqual(body.offers,[{marketplace:'QOO10_JP',total:12,available:9,oldest_observed_at:'2026-07-28T00:00:00Z',newest_observed_at:'2026-07-29T00:00:00Z',tenants:2}]);
 assert.equal(JSON.stringify(body).includes('product_url'),false);
});

test('marketplace offer stats requires the existing sync secret',async()=>{
 const env={MARKETPLACE_OFFER_SYNC_SECRET:'x'.repeat(32),PRODUCT_DB:{prepare:()=>{throw new Error('must not query')}}};
 const response=await marketplaceOfferStats(new Request('https://hoshilu.app/api/internal/marketplace-offers/stats'),env);
 assert.equal(response.status,401);
});
