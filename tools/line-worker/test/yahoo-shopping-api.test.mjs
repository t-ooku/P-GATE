import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchYahooHighRatingRanking,
  normalizeYahooHighRatingRanking,
  normalizeYahooShoppingItems,
  searchYahooShopping,
  yahooShoppingApiConfigured
} from '../src/yahoo-shopping-api.mjs';
import { safeProviderErrorCode } from '../src/provider-error-code.mjs';

test('provider log codeは既知allowlist以外のtoken風本文・key風本文も拒否する', () => {
  assert.equal(safeProviderErrorCode('PRIVATE_MEDICAL_QUERY', 400), 'HTTP_400');
  assert.equal(safeProviderErrorCode('AKIAIOSFODNN7EXAMPLE', 0), 'PROVIDER_REQUEST_FAILED');
  assert.equal(safeProviderErrorCode('insufficient_quota', 429), 'INSUFFICIENT_QUOTA');
});

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

test('Yahoo provider自由文はqueryを含めずHTTP固定コードへ畳む', async () => {
  await assert.rejects(
    searchYahooShopping(
      { YAHOO_SHOPPING_CLIENT_ID: 'secret-client-id' }, '秘密の検索語',
      async () => Response.json({ Error: { Message: 'invalid query: 秘密の検索語' } }, { status: 400 })
    ),
    (error) => error.message === 'YAHOO_SHOPPING_SEARCH_FAILED'
      && error.providerCode === 'HTTP_400'
      && !String(error.providerCode).includes('秘密の検索語')
  );
});

test('高評価トレンドランキングは公式順位・評価集計・レビューURLだけを保持する', () => {
  const candidates = normalizeYahooHighRatingRanking({ high_rating_trend_ranking: {
    meta: { last_modified: '2026-08-13' },
    ranking_data: [{
      rank: 2,
      item_information: {
        name: '高評価イヤホン', code: 'earbuds-1', jan_code: '4901234567894',
        url: 'https://store.shopping.yahoo.co.jp/shop/earbuds-1.html',
        regular_price: 4980, bargain_price: 3980, premium_price: 2980
      },
      image: { medium: 'https://item-shopping.c.yimg.jp/i/g/shop_earbuds-1' },
      review: { rate: 4.72, count: 1597, url: 'https://shopping.yahoo.co.jp/review/item/list?store_id=shop&page_key=earbuds-1' }
    }]
  } });
  assert.equal(candidates[0].rank, 2);
  assert.equal(candidates[0].record_key, 'JAN:4901234567894');
  assert.equal(candidates[0].offers[0].price, 3980);
  assert.equal(candidates[0].offers[0].total_cost, 0);
  assert.equal(candidates[0].review_average, 4.72);
  assert.equal(candidates[0].review_count, 1597);
  assert.match(candidates[0].review_url, /shopping\.yahoo\.co\.jp\/review/u);
  assert.equal('review_body' in candidates[0], false);
});

test('高評価トレンドランキングAPIへ既存Client IDと検索語を送る', async () => {
  let requested = '';
  const candidates = await fetchYahooHighRatingRanking(
    { YAHOO_SHOPPING_CLIENT_ID: 'secret-client-id' },
    'ワイヤレスイヤホン',
    async (url) => {
      requested = String(url);
      return Response.json({ high_rating_trend_ranking: { ranking_data: [] } });
    }
  );
  const url = new URL(requested);
  assert.equal(url.pathname, '/ShoppingWebService/V1/highRatingTrendRanking');
  assert.equal(url.searchParams.get('appid'), 'secret-client-id');
  assert.equal(url.searchParams.get('query'), 'ワイヤレスイヤホン');
  assert.equal(url.searchParams.get('limit'), '30');
  assert.deepEqual(candidates, []);
});
