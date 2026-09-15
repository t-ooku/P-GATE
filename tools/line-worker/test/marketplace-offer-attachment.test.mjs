import test from 'node:test';
import assert from 'node:assert/strict';
import { attachMarketplaceOffers } from '../src/product-index-v2.mjs';

test('公開商品には7日以内に確認された購入可能なモールURLだけを接続する',async()=>{
  let sql='';
  const env={PRODUCT_DB:{prepare(value){sql=value;return{bind(){return{all:async()=>({results:[]})}}}}}};
  const rows=await attachMarketplaceOffers(env,'itg',[{asin:'B000000001',record_key:'item-1'}]);
  assert.equal(rows.length,1);
  assert.match(sql,/datetime\(observed_at\)>=datetime\('now','-7 days'\)/);
  assert.match(sql,/stock_status NOT IN \('OUT_OF_STOCK','UNAVAILABLE'\)/);
});
