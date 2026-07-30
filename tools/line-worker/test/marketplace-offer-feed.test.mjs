import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { marketplaceOfferStats, validateMarketplaceOfferFeed } from '../src/marketplace-offer-feed.mjs';

test('公開サンプルは3モールの商品詳細URLフィードとして検証できる', async () => {
 const sampleUrl = new URL('../../../docs/examples/hoshilu-marketplace-offers.sample.json', import.meta.url);
 const sample = JSON.parse(await readFile(sampleUrl, 'utf8'));
 const result = validateMarketplaceOfferFeed(sample);
 assert.deepEqual(result.records.map(row => row.marketplace), ['RAKUTEN_JP','QOO10_JP','SHEIN_JP']);
});

test('Qoo10・SHEIN・楽天の商品詳細URLだけをフィードとして受け入れる',()=>{
 const result=validateMarketplaceOfferFeed({tenant:'itg',batch_id:'offers-20260729-01',records:[
  {record_key:'q1',marketplace:'QOO10_JP',external_product_id:'123',product_url:'https://www.qoo10.jp/gmkt.inc/Goods/Goods.aspx?goodscode=123456789'},
  {record_key:'s1',marketplace:'SHEIN_JP',external_product_id:'456',product_url:'https://jp.shein.com/item-p-456789.html'},
  {record_key:'r1',marketplace:'RAKUTEN_JP',external_product_id:'shop:item',product_url:'https://item.rakuten.co.jp/shop/item/'}
 ]});
 assert.equal(result.records.length,3);
 assert.deepEqual(result.records.map(row=>row.marketplace),['QOO10_JP','SHEIN_JP','RAKUTEN_JP']);
});

test('楽天公式アフィリエイトURLは実商品URLを含む場合だけフィードへ受け入れる',()=>{
 const valid=validateMarketplaceOfferFeed({tenant:'itg',batch_id:'affiliate-offer-20260730',records:[{
  record_key:'r1',marketplace:'RAKUTEN_JP',external_product_id:'shop:item',
  product_url:'https://hb.afl.rakuten.co.jp/hgc/abc123/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fshop%2Fitem%2F'
 }]});
 assert.equal(valid.records.length,1);
 assert.throws(()=>validateMarketplaceOfferFeed({tenant:'itg',batch_id:'affiliate-offer-bad-20260730',records:[{
  record_key:'r1',marketplace:'RAKUTEN_JP',external_product_id:'shop:item',
  product_url:'https://hb.afl.rakuten.co.jp/hgc/abc123/?pc=https%3A%2F%2Fevil.example%2Fitem'
 }]}),/OFFER_FEED_PRODUCT_URL_INVALID/);
});

test('検索結果URLや未許可ドメインを商品URLとして受け入れない',()=>{
 assert.throws(()=>validateMarketplaceOfferFeed({tenant:'itg',batch_id:'offers-20260729-02',records:[{marketplace:'QOO10_JP',external_product_id:'x',product_url:'https://www.qoo10.jp/s/?keyword=camera'}]}),/PRODUCT_URL_INVALID/);
 assert.throws(()=>validateMarketplaceOfferFeed({tenant:'itg',batch_id:'offers-20260729-03',records:[{marketplace:'SHEIN_JP',external_product_id:'x',product_url:'https://evil.example/item-p-123.html'}]}),/PRODUCT_URL_INVALID/);
});

test('marketplace offer stats reports safe attachment counts without exposing product URLs',async()=>{
 const rows=[{marketplace:'QOO10_JP',total:12,available:9,fresh_available:7,stale_available:2,matched_fresh_available:5,oldest_observed_at:'2026-07-28T00:00:00Z',newest_observed_at:'2026-07-29T00:00:00Z',tenants:2}];
 let sql='';
 const env={MARKETPLACE_OFFER_SYNC_SECRET:'x'.repeat(32),PRODUCT_DB:{prepare:(value)=>{sql=value;return{all:async()=>({results:rows})}}}};
 const response=await marketplaceOfferStats(new Request('https://hoshilu.app/api/internal/marketplace-offers/stats',{headers:{authorization:`Bearer ${'x'.repeat(32)}`}}),env);
 assert.equal(response.status,200);
 const body=await response.json();
 assert.deepEqual(body.offers,[{marketplace:'QOO10_JP',total:12,available:9,fresh_available:7,stale_available:2,matched_fresh_available:5,unmatched_fresh_available:2,oldest_observed_at:'2026-07-28T00:00:00Z',newest_observed_at:'2026-07-29T00:00:00Z',tenants:2}]);
 assert.equal(JSON.stringify(body).includes('product_url'),false);
 assert.deepEqual(body.missing_marketplaces,['RAKUTEN_JP','SHEIN_JP']);
 assert.equal(body.feed_required,true);
 assert.match(sql,/AS fresh_available/);
 assert.match(sql,/AS stale_available/);
 assert.match(sql,/AS matched_fresh_available/);
 assert.match(sql,/EXISTS\(SELECT 1 FROM products/);
});

test('marketplace offer stats requires the existing sync secret',async()=>{
 const env={MARKETPLACE_OFFER_SYNC_SECRET:'x'.repeat(32),PRODUCT_DB:{prepare:()=>{throw new Error('must not query')}}};
 const response=await marketplaceOfferStats(new Request('https://hoshilu.app/api/internal/marketplace-offers/stats'),env);
 assert.equal(response.status,401);
});

test('商品URLの確認日時はISO形式へ正規化し、不正値と未来日時を拒否する',()=>{
 const base={tenant:'itg',batch_id:'offers-time-20260729',records:[{record_key:'r1',marketplace:'RAKUTEN_JP',external_product_id:'shop:item',product_url:'https://item.rakuten.co.jp/shop/item/',observed_at:'2026-07-29T01:02:03+09:00'}]};
 const result=validateMarketplaceOfferFeed(base);
 assert.equal(result.records[0].observed_at,'2026-07-28T16:02:03.000Z');
 assert.throws(()=>validateMarketplaceOfferFeed({...base,records:[{...base.records[0],observed_at:'not-a-date'}]}),/OBSERVED_AT_INVALID/);
 assert.throws(()=>validateMarketplaceOfferFeed({...base,records:[{...base.records[0],observed_at:new Date(Date.now()+60*60*1000).toISOString()}]}),/OBSERVED_AT_FUTURE/);
});

test('商品詳細URLには外部商品IDとHOSHILU照合キーまたは正しいASINが必要',()=>{
 const record={marketplace:'QOO10_JP',product_url:'https://www.qoo10.jp/gmkt.inc/Goods/Goods.aspx?goodscode=123456789'};
 assert.throws(()=>validateMarketplaceOfferFeed({tenant:'itg',batch_id:'offers-key-20260729',records:[record]}),/EXTERNAL_PRODUCT_ID_REQUIRED/);
 assert.throws(()=>validateMarketplaceOfferFeed({tenant:'itg',batch_id:'offers-key-20260730',records:[{...record,external_product_id:'123'}]}),/MATCH_KEY_REQUIRED/);
 assert.throws(()=>validateMarketplaceOfferFeed({tenant:'itg',batch_id:'offers-key-20260731',records:[{...record,external_product_id:'123',asin:'INVALID'}]}),/MATCH_KEY_REQUIRED/);
 const result=validateMarketplaceOfferFeed({tenant:'itg',batch_id:'offers-key-20260801',records:[{...record,external_product_id:'123',asin:'B000000001'}]});
 assert.equal(result.records[0].asin,'B000000001');
});

test('URL未取込時は不足している3モールを明示する',async()=>{
 const env={MARKETPLACE_OFFER_SYNC_SECRET:'x'.repeat(32),PRODUCT_DB:{prepare:()=>({all:async()=>({results:[]})})}};
 const response=await marketplaceOfferStats(new Request('https://hoshilu.app/api/internal/marketplace-offers/stats',{headers:{authorization:`Bearer ${'x'.repeat(32)}`}}),env);
 const body=await response.json();
 assert.deepEqual(body.offers,[]);
 assert.deepEqual(body.missing_marketplaces,['RAKUTEN_JP','QOO10_JP','SHEIN_JP']);
 assert.equal(body.feed_required,true);
});
