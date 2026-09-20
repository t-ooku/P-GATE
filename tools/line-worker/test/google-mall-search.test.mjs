import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  parseGoogleMallItems, normalizeAgentSearchResponse, searchGoogleMalls, googleMallSearchConfigured,
  googleBillingDayKey, reserveGoogleMallSearchRequest, mallForHost, googleAccessToken, resetGoogleAccessTokenCache
} from '../src/google-mall-search.mjs';

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0082_google_mall_search.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0083_google_mall_search_log.sql', import.meta.url), 'utf8'));
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async first() { return statement.get(...params) ?? null; },
        async run() { statement.run(...params); return { success: true }; },
        async all() { return { results: statement.all(...params) }; }
      };
    }
  };
}

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA_JSON = JSON.stringify({
  type: 'service_account', client_email: 'hoshilu-agent-search@hoshilu-visual-search.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://oauth2.googleapis.com/token'
});
const ENGINE = 'projects/1053599249807/locations/global/collections/default_collection/engines/hoshilu-malls_1789846201676';
const baseEnv = () => ({ PRODUCT_DB: d1(), GOOGLE_AGENT_SEARCH_SA_JSON: SA_JSON, GOOGLE_AGENT_SEARCH_ENGINE: ENGINE });

const doc = (title, link, extra = {}) => ({ document: { derivedStructData: { title, link, snippets: [{ snippet: extra.snippet || '' }], pagemap: extra.pagemap || {} } } });
const SAMPLE = {
  results: [
    doc('キッズ 水筒 500ml ステンレス | ZOZOTOWN', 'https://zozo.jp/shop/example/goods/12345/', { snippet: '子ども用', pagemap: { cse_image: [{ src: 'https://c.imgz.jp/123/12345.jpg' }], offer: [{ price: '2,980', pricecurrency: 'JPY' }] } }),
    doc('水筒 子供 - Amazon.co.jp', 'https://www.amazon.co.jp/s?k=%E6%B0%B4%E7%AD%92'),
    doc('キッズの水筒（ボーイズ）- ZOZOTOWN', 'https://zozo.jp/kids-category/tableware-kitchenware/water-bottles/'),
    doc('SHEIN kids bottle', 'https://jp.shein.com/kids-bottle-p-999.html', { pagemap: { metatags: [{ 'og:image': 'https://img.ltwebstatic.com/x.jpg', 'product:price:amount': '9.99', 'product:price:currency': 'USD' }] } }),
    doc('無関係のサイト', 'https://example.com/bottle'),
    doc('重複', 'https://zozo.jp/shop/example/goods/12345/#top'),
    doc('Amazon 水筒', 'https://www.amazon.co.jp/dp/B0EXAMPLE1', { pagemap: { metatags: [{ 'og:image': 'http://insecure.example/x.jpg' }] } })
  ]
};

test('Agent Search の結果は 11 モールのホストだけ残し、商品詳細 URL だけを返し（検索一覧・カテゴリは除外）、重複と他ドメインを捨てる', () => {
  const items = parseGoogleMallItems(normalizeAgentSearchResponse(SAMPLE));
  assert.deepEqual(items.map((item) => item.url), [
    'https://zozo.jp/shop/example/goods/12345/',
    'https://jp.shein.com/kids-bottle-p-999.html',
    'https://www.amazon.co.jp/dp/B0EXAMPLE1'
  ]);
  assert.equal(items[0].mall_label, 'ZOZOTOWN');
  assert.equal(items[0].listed_price_jpy, 2980);
  assert.equal(items[0].image_url, 'https://c.imgz.jp/123/12345.jpg');
  assert.equal(items[1].listed_price_jpy, 0); // USD は出さない
  assert.equal(items[2].image_url, ''); // http 画像は捨てる
});

test('商品ページが 1 件も無い時だけ、一覧ページを最大 2 件残す', () => {
  const items = parseGoogleMallItems(normalizeAgentSearchResponse({ results: [
    doc('A - Amazon', 'https://www.amazon.co.jp/s?k=a'), doc('B - ZOZO', 'https://zozo.jp/ranking/x.html'), doc('C - ロフト', 'https://www.loft.co.jp/search?q=c')
  ] }));
  assert.equal(items.length, 2);
  assert.equal(items[0].product_page, false);
});

test('mallForHost はサブドメインも含めて 11 モールを判定し、それ以外は null', () => {
  assert.equal(mallForHost('www.amazon.co.jp').marketplace, 'AMAZON_JP');
  assert.equal(mallForHost('jp.shein.com').label, 'SHEIN');
  assert.equal(mallForHost('www.matsukiyococokara-online.com').marketplace, 'MATSUKIYO_JP');
  assert.equal(mallForHost('search.rakuten.co.jp'), null);
  assert.equal(mallForHost('example.com'), null);
});

test('設定判定: サービスアカウント JSON とエンジン名が揃い、GOOGLE_MALL_SEARCH_ENABLED=false でなければ有効', () => {
  assert.equal(googleMallSearchConfigured({}), false);
  assert.equal(googleMallSearchConfigured({ GOOGLE_CSE_ID: 'abcdefghij', GOOGLE_CSE_KEY: 'AIza' + 'x'.repeat(30) }), false);
  assert.equal(googleMallSearchConfigured(baseEnv()), true);
  assert.equal(googleMallSearchConfigured({ ...baseEnv(), GOOGLE_AGENT_SEARCH_ENGINE: 'engines/x' }), false);
  assert.equal(googleMallSearchConfigured({ ...baseEnv(), GOOGLE_MALL_SEARCH_ENABLED: 'false' }), false);
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
  assert.equal((await reserveGoogleMallSearchRequest(env, new Date('2026-09-20T08:00:00Z'))).allowed, true);
});

function fakeGoogle(calls, searchPayload = SAMPLE) {
  return async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith('https://oauth2.googleapis.com/token')) {
      const body = new URLSearchParams(init.body);
      assert.equal(body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
      assert.match(body.get('assertion'), /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
      return new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }), { headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify(searchPayload), { headers: { 'content-type': 'application/json' } });
  };
}

test('searchGoogleMalls はトークンを取ってから Discovery Engine に検索語だけを送り、HOSHILU に結果があるモールは除外する', async () => {
  resetGoogleAccessTokenCache();
  const calls = [];
  const env = { ...baseEnv(), GOOGLE_MALL_SEARCH_DAILY_LIMIT: '1' };
  const live = await searchGoogleMalls(env, '  子ども　水筒 ', { fetch: fakeGoogle(calls), cache: null, excludeMarketplaces: ['AMAZON_JP'] });
  assert.equal(live.source, 'live');
  assert.deepEqual(live.items.map((item) => item.marketplace), ['ZOZOTOWN_JP', 'SHEIN_JP']);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
  assert.equal(calls[1].url, `https://discoveryengine.googleapis.com/v1/${ENGINE}/servingConfigs/default_search:search`);
  const body = JSON.parse(calls[1].init.body);
  assert.deepEqual(body, { query: '子ども 水筒', pageSize: 20, languageCode: 'ja', safeSearch: true, spellCorrectionSpec: { mode: 'AUTO' }, queryExpansionSpec: { condition: 'AUTO' } });
  assert.equal(calls[1].init.headers.authorization, 'Bearer ya29.test');
  // 2026-09-20: 1 検索 1 行のログ（何件返り・何件残り・何を除外したか）
  await new Promise((resolve) => setTimeout(resolve, 20));
  const log = await env.PRODUCT_DB.prepare('SELECT * FROM google_mall_search_log ORDER BY searched_at DESC').bind().all();
  assert.equal(log.results.length, 1);
  assert.equal(log.results[0].source, 'live');
  assert.equal(log.results[0].raw_count, 7);
  assert.equal(log.results[0].product_count, 3);
  assert.equal(log.results[0].kept_count, 2);
  assert.equal(log.results[0].excluded_marketplaces, 'AMAZON_JP');
  // 上限 1 なので 2 回目は呼ばない
  const limited = await searchGoogleMalls(env, '別の検索', { fetch: fakeGoogle(calls), cache: null });
  assert.equal(limited.source, 'limit');
  assert.equal(calls.length, 2);
  // 未設定
  assert.equal((await searchGoogleMalls({ PRODUCT_DB: d1() }, '水筒', { fetch: fakeGoogle([]), cache: null })).source, 'disabled');
});

test('トークンはメモリにキャッシュされ、2 回目の検索ではトークン取得を省く。HTTP エラーは items:[] で返す', async () => {
  resetGoogleAccessTokenCache();
  const calls = [];
  const env = baseEnv();
  await searchGoogleMalls(env, '水筒', { fetch: fakeGoogle(calls), cache: null });
  await searchGoogleMalls(env, 'リュック', { fetch: fakeGoogle(calls), cache: null });
  assert.equal(calls.filter((call) => call.url.startsWith('https://oauth2')).length, 1);
  assert.equal(calls.filter((call) => call.url.includes(':search')).length, 2);
  const failing = await searchGoogleMalls(baseEnv(), '水筒', { fetch: async (url) => url.startsWith('https://oauth2') ? new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 })) : new Response('nope', { status: 403 }), cache: null });
  assert.equal(failing.source, 'error');
  assert.equal(failing.reason, 'HTTP_403');
  assert.deepEqual(failing.items, []);
  resetGoogleAccessTokenCache();
  await assert.rejects(googleAccessToken({ GOOGLE_AGENT_SEARCH_SA_JSON: '{"type":"user"}' }, { fetch: fakeGoogle([]) }), /GOOGLE_AGENT_SEARCH_SA_INVALID/u);
});

test('同じ検索語は Cache API を優先し、上限を消費しない', async () => {
  resetGoogleAccessTokenCache();
  const store = new Map();
  const cache = {
    async match(request) { return store.get(request.url) ? new Response(store.get(request.url)) : undefined; },
    async put(request, response) { store.set(request.url, await response.text()); }
  };
  const calls = [];
  const env = { ...baseEnv(), GOOGLE_MALL_SEARCH_DAILY_LIMIT: '1' };
  const first = await searchGoogleMalls(env, '水筒', { fetch: fakeGoogle(calls), cache });
  const second = await searchGoogleMalls(env, '水筒', { fetch: fakeGoogle(calls), cache });
  assert.equal(first.source, 'live');
  assert.equal(second.source, 'cache');
  assert.equal(second.items.length, 3);
  assert.equal(calls.filter((call) => call.url.includes(':search')).length, 1);
});
