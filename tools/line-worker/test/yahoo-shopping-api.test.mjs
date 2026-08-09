import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeYahooShoppingItems,
  searchYahooShopping,
  yahooShoppingApiConfigured
} from '../src/yahoo-shopping-api.mjs';

test('Yahoo Shopping API requires an explicit client ID', () => {
  assert.equal(yahooShoppingApiConfigured({}), false);
  assert.equal(yahooShoppingApiConfigured({ YAHOO_SHOPPING_CLIENT_ID: 'client-id' }), true);
});

test('normalizes only product detail URLs and confirms totals only for free shipping', () => {
  const candidates = normalizeYahooShoppingItems({ hits: [
    { code: 'shop_item', name: '同一商品', url: 'https://store.shopping.yahoo.co.jp/shop/item.html', price: 3980, janCode: '4901234567894', shipping: { code: 2 }, delivery: { day: 2 }, image: { medium: 'https://item-shopping.c.yimg.jp/i/g/shop_item' } },
    { code: 'shop_other', name: '送料別商品', url: 'https://store.shopping.yahoo.co.jp/shop/other.html', price: 2980, shipping: { code: 3 } },
    { code: 'search', name: '検索ページ', url: 'https://shopping.yahoo.co.jp/search?p=x', price: 1000, shipping: { code: 2 } }
  ] });
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].record_key, 'JAN:4901234567894');
  assert.equal(candidates[0].offers[0].total_cost, 3980);
  assert.equal(candidates[0].offers[0].shipping_fee_confirmed, true);
  assert.equal(candidates[0].offers[0].delivery_days, 2);
  assert.equal(candidates[1].offers[0].total_cost, 0);
  assert.equal(candidates[1].offers[0].shipping_fee_confirmed, false);
});

test('searches the official endpoint without exposing the client ID in output data', async () => {
  let requested = '';
  const results = await searchYahooShopping(
    { YAHOO_SHOPPING_CLIENT_ID: 'secret-client-id' },
    '光る スマホケース',
    async (url) => {
      requested = url;
      return { ok: true, json: async () => ({ hits: [] }) };
    }
  );
  const url = new URL(requested);
  assert.equal(url.hostname, 'shopping.yahooapis.jp');
  assert.equal(url.searchParams.get('appid'), 'secret-client-id');
  assert.equal(url.searchParams.get('query'), '光る スマホケース');
  assert.equal(url.searchParams.get('image_size'), '600');
  assert.deepEqual(results, []);
});
