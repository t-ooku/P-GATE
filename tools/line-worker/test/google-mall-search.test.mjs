import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  parseGoogleMallItems, normalizeAgentSearchResponse, searchGoogleMalls, googleMallSearchConfigured,
  googleBillingDayKey, reserveGoogleMallSearchRequest, mallForHost, googleAccessToken, resetGoogleAccessTokenCache, broadenGoogleMallQuery
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
  // プライバシー境界: 検索本文・検索単位のIDは書かない。残すのは 1 時間バケットの結果種別の件数だけ。
  const buckets = await env.PRODUCT_DB.prepare('SELECT bucket_at, source, reason, request_count FROM google_mall_search_log').bind().all();
  assert.deepEqual(buckets.results.map((row) => [row.source, row.reason, row.request_count]), [['live', 'SHOWN', 1]]);
  assert.match(buckets.results[0].bucket_at, /^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/u);
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
  // 2026-09-20: キャッシュ鍵は v3。0 件の結果は 10 分だけ（24 時間ではない）。
  const keys = [...store.keys()];
  assert.ok(keys.every((key) => key.includes('/v3?q=')));
  const empties = [];
  const emptyCache = { async match() { return undefined; }, async put(request, response) { empties.push(response.headers.get('cache-control')); } };
  const emptyEnv = { ...baseEnv(), GOOGLE_MALL_SEARCH_DAILY_LIMIT: '5' };
  await searchGoogleMalls(emptyEnv, '無い商品', { fetch: fakeGoogle([], { results: [] }), cache: emptyCache });
  assert.deepEqual(empties, ['public, max-age=600']);
});

test('broadenGoogleMallQuery はブランド名らしい語（カタカナだけ・英数字だけ）を外し、外す語が無い／全部外れる時は null', () => {
  assert.equal(broadenGoogleMallQuery('韓国 頭皮ケア LILIB リリーブ lilib'), '韓国 頭皮ケア');
  assert.equal(broadenGoogleMallQuery('ダイソン 掃除機'), '掃除機');
  assert.equal(broadenGoogleMallQuery('子ども 水筒'), null);
  assert.equal(broadenGoogleMallQuery('リリーブ'), null);
  assert.equal(broadenGoogleMallQuery('LILIB リリーブ'), null);
});

test('0 件のときだけ 1 回、ブランド名らしい語を外して探し直す（要求は +1、予算も +1）。結果はブランド無しの検索語で出る', async () => {
  resetGoogleAccessTokenCache();
  const env = { ...baseEnv(), GOOGLE_MALL_SEARCH_DAILY_LIMIT: '10' };
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }), { headers: { 'content-type': 'application/json' } });
    const query = JSON.parse(init.body).query;
    return new Response(JSON.stringify(query === '韓国 頭皮ケア' ? SAMPLE : { results: [] }), { headers: { 'content-type': 'application/json' } });
  };
  const result = await searchGoogleMalls(env, '韓国 頭皮ケア LILIB リリーブ lilib', { fetch: fetchImpl, cache: null });
  const searches = calls.filter((call) => call.url.includes(':search')).map((call) => JSON.parse(call.init.body).query);
  assert.deepEqual(searches, ['韓国 頭皮ケア LILIB リリーブ lilib', '韓国 頭皮ケア']);
  assert.equal(result.source, 'live');
  assert.ok(result.items.length > 0);
  const usage = await env.PRODUCT_DB.prepare('SELECT reserved_requests FROM google_mall_search_usage_daily').bind().first();
  assert.equal(usage.reserved_requests, 2);
  const log = await env.PRODUCT_DB.prepare('SELECT source, reason, request_count FROM google_mall_search_log ORDER BY reason').bind().all();
  assert.deepEqual(log.results.map((row) => ({ ...row })), [{ source: 'live', reason: 'BROADENED', request_count: 1 }, { source: 'live', reason: 'SHOWN', request_count: 1 }]);
  // 外す語が無い検索語は探し直さない（要求は 1 回だけ）
  const plainCalls = [];
  const plain = await searchGoogleMalls(env, '子ども 水筒', { fetch: fakeGoogle(plainCalls, { results: [] }), cache: null });
  assert.equal(plainCalls.filter((call) => call.url.includes(':search')).length, 1);
  assert.equal(plain.items.length, 0);
});
