import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  parseGoogleMallItems, searchGoogleMalls, googleMallSearchConfigured, googleBillingDayKey,
  reserveGoogleMallSearchRequest, mallForHost
} from '../src/google-mall-search.mjs';

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0082_google_mall_search.sql', import.meta.url), 'utf8'));
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async first() { return statement.get(...params) ?? null; }
      };
    }
  };
}

const SAMPLE = {
  items: [
    { title: 'キッズ 水筒 500ml ステンレス | ZOZOTOWN', link: 'https://zozo.jp/shop/example/goods/12345/', snippet: '子ども用', pagemap: { cse_image: [{ src: 'https://c.imgz.jp/123/12345.jpg' }], offer: [{ price: '2,980', pricecurrency: 'JPY' }] } },
    { title: '水筒 検索結果 | ロフト', link: 'https://www.loft.co.jp/search?q=%E6%B0%B4%E7%AD%92', snippet: '', pagemap: {} },
    { title: 'SHEIN kids bottle', link: 'https://jp.shein.com/kids-bottle-p-999.html', snippet: '', pagemap: { metatags: [{ 'og:image': 'https://img.ltwebstatic.com/x.jpg', 'product:price:amount': '9.99', 'product:price:currency': 'USD' }] } },
    { title: '無関係のサイト', link: 'https://example.com/bottle', snippet: '', pagemap: {} },
    { title: '重複', link: 'https://zozo.jp/shop/example/goods/12345/#top', snippet: '', pagemap: {} },
    { title: 'Amazon 水筒', link: 'https://www.amazon.co.jp/dp/B0EXAMPLE1', snippet: '', pagemap: { metatags: [{ 'og:image': 'http://insecure.example/x.jpg' }] } }
  ]
};

test('Google の結果は 11 モールのホストだけ残し、商品ページを検索ページより先に並べ、重複と他ドメインを捨てる', () => {
  const items = parseGoogleMallItems(SAMPLE);
  assert.deepEqual(items.map((item) => item.url), [
    'https://zozo.jp/shop/example/goods/12345/',
    'https://jp.shein.com/kids-bottle-p-999.html',
    'https://www.amazon.co.jp/dp/B0EXAMPLE1',
    'https://www.loft.co.jp/search?q=%E6%B0%B4%E7%AD%92'
  ]);
  assert.equal(items[0].mall_label, 'ZOZOTOWN');
  assert.equal(items[0].listed_price_jpy, 2980);
  assert.equal(items[0].image_url, 'https://c.imgz.jp/123/12345.jpg');
  // USD の価格は表示しない（API 確認価格と混ぜない・通貨違いを円に見せない）
  assert.equal(items[1].listed_price_jpy, 0);
  // http の画像は捨てる
  assert.equal(items[2].image_url, '');
  assert.equal(items[3].marketplace, 'LOFT_JP');
});

test('mallForHost はサブドメインも含めて 11 モールを判定し、それ以外は null', () => {
  assert.equal(mallForHost('www.amazon.co.jp').marketplace, 'AMAZON_JP');
  assert.equal(mallForHost('jp.shein.com').label, 'SHEIN');
  assert.equal(mallForHost('www.matsukiyococokara-online.com').marketplace, 'MATSUKIYO_JP');
  assert.equal(mallForHost('search.rakuten.co.jp'), null);
  assert.equal(mallForHost('example.com'), null);
});

test('設定判定: cx と key が揃い、GOOGLE_MALL_SEARCH_ENABLED=false でなければ有効', () => {
  assert.equal(googleMallSearchConfigured({}), false);
  assert.equal(googleMallSearchConfigured({ GOOGLE_CSE_ID: 'abcdefghij', GOOGLE_CSE_KEY: 'AIza' + 'x'.repeat(30) }), true);
  assert.equal(googleMallSearchConfigured({ GOOGLE_CSE_ID: 'abcdefghij', GOOGLE_CSE_KEY: 'AIza' + 'x'.repeat(30), GOOGLE_MALL_SEARCH_ENABLED: 'false' }), false);
});

test('日次上限は太平洋時間の日付で数え、上限に達したら予約を断る', async () => {
  const env = { PRODUCT_DB: d1(), GOOGLE_MALL_SEARCH_DAILY_LIMIT: '2' };
  const now = new Date('2026-09-20T05:00:00Z'); // 9/19 22:00 PDT
  assert.equal(googleBillingDayKey(now), '2026-09-19');
  assert.equal((await reserveGoogleMallSearchRequest(env, now)).allowed, true);
  assert.equal((await reserveGoogleMallSearchRequest(env, now)).allowed, true);
  const third = await reserveGoogleMallSearchRequest(env, now);
  assert.equal(third.allowed, false);
  assert.equal(third.reason, 'DAILY_LIMIT_REACHED');
  // 翌日（PDT）は別枠
  assert.equal((await reserveGoogleMallSearchRequest(env, new Date('2026-09-20T08:00:00Z'))).allowed, true);
});

test('searchGoogleMalls は検索語だけを Google に送り、上限超過や未設定では呼ばず、失敗しても items:[] を返す', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(new URL(url));
    return new Response(JSON.stringify(SAMPLE), { headers: { 'content-type': 'application/json' } });
  };
  const env = { PRODUCT_DB: d1(), GOOGLE_CSE_ID: 'abcdefghij', GOOGLE_CSE_KEY: 'AIza' + 'x'.repeat(30), GOOGLE_MALL_SEARCH_DAILY_LIMIT: '1' };
  const live = await searchGoogleMalls(env, '  子ども　水筒 ', { fetch: fetchImpl, cache: null });
  assert.equal(live.source, 'live');
  assert.equal(live.items.length, 4);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].hostname, 'www.googleapis.com');
  assert.equal(calls[0].searchParams.get('q'), '子ども 水筒');
  assert.equal(calls[0].searchParams.get('cx'), 'abcdefghij');
  assert.equal(calls[0].searchParams.get('gl'), 'jp');
  for (const name of ['session', 'visitor', 'email', 'u']) assert.equal(calls[0].searchParams.has(name), false);
  // 上限 1 なので 2 回目は呼ばない
  const limited = await searchGoogleMalls(env, '別の検索', { fetch: fetchImpl, cache: null });
  assert.equal(limited.source, 'limit');
  assert.equal(calls.length, 1);
  // 未設定
  const disabled = await searchGoogleMalls({ PRODUCT_DB: d1() }, '水筒', { fetch: fetchImpl, cache: null });
  assert.equal(disabled.source, 'disabled');
  // HTTP エラー
  const failing = await searchGoogleMalls({ ...env, PRODUCT_DB: d1() }, '水筒', { fetch: async () => new Response('nope', { status: 429 }), cache: null });
  assert.equal(failing.source, 'error');
  assert.deepEqual(failing.items, []);
});

test('同じ検索語は Cache API を優先し、上限を消費しない', async () => {
  const store = new Map();
  const cache = {
    async match(request) { return store.get(request.url) ? new Response(store.get(request.url)) : undefined; },
    async put(request, response) { store.set(request.url, await response.text()); }
  };
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return new Response(JSON.stringify(SAMPLE)); };
  const env = { PRODUCT_DB: d1(), GOOGLE_CSE_ID: 'abcdefghij', GOOGLE_CSE_KEY: 'AIza' + 'x'.repeat(30), GOOGLE_MALL_SEARCH_DAILY_LIMIT: '1' };
  const first = await searchGoogleMalls(env, '水筒', { fetch: fetchImpl, cache });
  const second = await searchGoogleMalls(env, '水筒', { fetch: fetchImpl, cache });
  assert.equal(first.source, 'live');
  assert.equal(second.source, 'cache');
  assert.equal(second.items.length, 4);
  assert.equal(calls, 1);
});
