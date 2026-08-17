import test from 'node:test';
import assert from 'node:assert/strict';
import cryptoModule from 'node:crypto';
import { readFileSync } from 'node:fs';
import worker, { buildAmazonSearchKeywords, finalPriceComparisonSearchQuery, validatePriceComparisonRequest, verifyTrackToken } from '../src/index.mjs';
import { INTEGRATED_MARKETPLACES, isIntegratedMarketplace } from '../src/marketplace-search-mode.mjs';

globalThis.crypto ??= cryptoModule.webcrypto;
globalThis.btoa ??= (value) => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ??= (value) => Buffer.from(value, 'base64').toString('binary');

// v4.3 指示書 Priority 3: /api/price-comparison のエンドツーエンド確認。

function environment(overrides = {}) {
  return {
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    TURNSTILE_SITE_KEY: 'site-key',
    LINK_SIGNING_SECRET: 'l'.repeat(32),
    ...overrides
  };
}

function request(body) {
  return new Request('https://hoshilu.app/api/price-comparison', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      product: { title: 'ハンディファン ホワイト', brand: 'HOSHILU', category: '家電' },
      real_offers: [
        { marketplace: 'AMAZON_JP', total_cost: 8980, currency: 'JPY', tracking_url: 'https://hoshilu.app/go?token=a' },
        { marketplace: 'RAKUTEN_JP', total_cost: 9180, currency: 'JPY', tracking_url: 'https://hoshilu.app/go?token=b' }
      ],
      direct_marketplaces: ['LOFT_JP', 'HANDS_JP'],
      search_query: '携帯扇風機',
      language: 'JA',
      consent: true,
      session_id: 'anonymous_session_123456',
      turnstile_token: 'verified-token',
      ...body
    })
  });
}

const context = { waitUntil() {} };

test('validatePriceComparisonRequest: 未知のモールや不正な同意は弾く', () => {
  assert.throws(() => validatePriceComparisonRequest({ consent: false }), /CONSENT_REQUIRED/);
  const result = validatePriceComparisonRequest({
    product: { title: '商品' }, consent: true, session_id: 'a'.repeat(20), turnstile_token: 't',
    direct_marketplaces: ['LOFT_JP', 'NOT_A_REAL_MALL', 'AMAZON_JP']
  });
  // NOT_A_REAL_MALLは未知のモールとして弾かれる。
  // AMAZON_JPは残る: 以前は「AMAZON_JPはIntegratedだから」という理由で
  // 落としていたが、それは誤りだった。marketplace-search-mode.mjs
  // (モール分類の唯一の判定元)ではINTEGRATEDはRAKUTEN_JP/YAHOO_JPのみで、
  // 「Amazonは公式API未接続のため外部検索導線として扱う」と明記されている。
  assert.deepEqual(result.direct_marketplaces, ['LOFT_JP', 'AMAZON_JP']);
});

test('AI最安比較のdirectモール一覧はintegratedと重ならず、Amazonを必ず含む', () => {
  // 一度ドリフトした(Amazonがintegrated扱いされ、結果としてintegrated側にも
  // direct側にも入らない隙間に落ちて、最安比較にAmazonが一切出なくなった)ため、
  // 分類の唯一の判定元と突き合わせて固定する。
  const source = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('const KNOWN_DIRECT_MARKETPLACES');
  assert.ok(start > 0, 'KNOWN_DIRECT_MARKETPLACESが見つからない');
  const block = source.slice(start, source.indexOf(']', start));
  const known = (block.match(/'[A-Z0-9_]+'/g) || []).map((item) => item.replace(/'/g, ''));

  assert.ok(known.includes('AMAZON_JP'), 'AMAZON_JPがdirect一覧から外れている');
  for (const marketplace of known) {
    assert.equal(
      isIntegratedMarketplace(marketplace), false,
      `${marketplace}はintegratedなのでdirect一覧に入れてはいけない`
    );
  }
  for (const marketplace of INTEGRATED_MARKETPLACES) {
    assert.ok(!known.includes(marketplace), `${marketplace}がdirect一覧に混入している`);
  }
});

test('AI最安比較はカテゴリ階層名から最終小ジャンルだけを検索語にする', () => {
  assert.equal(
    finalPriceComparisonSearchQuery('コンタクトレンズ・ケア用品 › カラーコンタクトレンズ', { title: 'LILMOON カラコン' }),
    'カラーコンタクトレンズ'
  );
  assert.equal(
    finalPriceComparisonSearchQuery('コンタクトレンズ・ケア用品>', { title: 'LILMOON カラコン', category: 'カラーコンタクトレンズ' }),
    'カラーコンタクトレンズ'
  );
});

test('AI最安比較は長時間待たせずGeminiと予備AIの合計を8秒以内に制限する', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../src/ai-price-comparison.mjs', import.meta.url), 'utf8'));
  assert.match(source, /GEMINI_ESTIMATE_TIMEOUT_MS = 4500/);
  assert.match(source, /OPENAI_ESTIMATE_TIMEOUT_MS = 3500/);
});

test('v4.3項目12・13: API連携中の実価格(楽天)とAI推定(ロフト/ハンズ)が明確に分かれて返る', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('siteverify')) return Response.json({ success: true });
    if (target.includes('generativelanguage.googleapis.com')) {
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        estimates: [
          { marketplace: 'LOFT_JP', range_min: 8000, range_max: 10000, confidence: 'HIGH' },
          { marketplace: 'HANDS_JP', range_min: 8500, range_max: 10500, confidence: 'MEDIUM' }
        ]
      }) }] } }] });
    }
    throw new Error(`UNEXPECTED_FETCH:${target}`);
  };
  const env = { ...environment(), GEMINI_API_KEY: 'g'.repeat(32) };
  try {
    const response = await worker.fetch(request({}), env, context);
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.result.real.map((r) => r.marketplace), ['RAKUTEN_JP']);
    assert.equal(payload.result.real[0].source, 'REAL');
    assert.equal(payload.result.real[0].search_query, buildAmazonSearchKeywords('携帯扇風機'));
    assert.equal(payload.result.real[0].search_sort, 'PRICE_ASC');
    assert.deepEqual(payload.result.ai_estimated.map((r) => r.marketplace).sort(), ['HANDS_JP', 'LOFT_JP']);
    assert.equal(payload.result.ai_estimated[0].source, 'AI_ESTIMATE');
    for (const row of payload.result.ai_estimated) {
      assert.equal(row.search_query, buildAmazonSearchKeywords('携帯扇風機'));
      assert.match(row.search_url, /^https:\/\/hoshilu\.app\/go\?token=/);
    }
    const loftRow = payload.result.ai_estimated.find((row) => row.marketplace === 'LOFT_JP');
    const loftToken = new URL(loftRow.search_url).searchParams.get('token');
    const loftDestination = new URL((await verifyTrackToken(loftToken, env.LINK_SIGNING_SECRET)).d);
    assert.equal(loftDestination.searchParams.get('sort'), 'price');
    assert.equal(loftRow.search_sort, 'PRICE_ASC');
    const handsRow = payload.result.ai_estimated.find((row) => row.marketplace === 'HANDS_JP');
    assert.equal(handsRow.search_sort, '');
    assert.equal(payload.result.disclaimer_required, true);
    assert.match(payload.result.disclaimer_text, /AI推定価格です/);
    assert.equal(payload.result.cheapest_claim, null);
    assert.match(payload.result.confirmed_price_note, /楽天市場のみ/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('価格昇順リンクは親階層語を残さず最終小ジャンルでモール検索する', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('siteverify')) return Response.json({ success: true });
    if (target.includes('generativelanguage.googleapis.com')) return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      estimates: [{ marketplace: 'LOFT_JP', range_min: 1200, range_max: 2200, confidence: 'MEDIUM' }]
    }) }] } }] });
    throw new Error(`UNEXPECTED_FETCH:${target}`);
  };
  const env = { ...environment(), GEMINI_API_KEY: 'g'.repeat(32) };
  try {
    const response = await worker.fetch(request({
      product: { title: 'LILMOON 度あり カラコン', brand: 'LILMOON', category: 'カラーコンタクトレンズ' },
      real_offers: [], direct_marketplaces: ['LOFT_JP'],
      search_query: 'コンタクトレンズ・ケア用品 › カラーコンタクトレンズ'
    }), env, context);
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    const row = payload.result.ai_estimated[0];
    assert.equal(row.search_query, buildAmazonSearchKeywords('カラーコンタクトレンズ'));
    assert.doesNotMatch(row.search_query, /コンタクトレンズ・ケア用品|[>›]/u);
    const token = new URL(row.search_url).searchParams.get('token');
    const destination = new URL((await verifyTrackToken(token, env.LINK_SIGNING_SECRET)).d);
    assert.equal(destination.searchParams.get('keyword'), buildAmazonSearchKeywords('カラーコンタクトレンズ'));
    assert.equal(destination.searchParams.get('sort'), 'price');
  } finally { globalThis.fetch = originalFetch; }
});

test('v4.3項目9: AI障害時でも実価格側は正常に返り、比較API全体は500にならない', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('siteverify')) return Response.json({ success: true });
    return new Response('down', { status: 503 });
  };
  const env = { ...environment(), GEMINI_API_KEY: 'g'.repeat(32) };
  try {
    const response = await worker.fetch(request({}), env, context);
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.deepEqual(payload.result.real.map((r) => r.marketplace), ['RAKUTEN_JP']);
    assert.deepEqual(payload.result.ai_estimated, []);
    assert.deepEqual(payload.result.unavailable.map((r) => r.marketplace).sort(), ['HANDS_JP', 'LOFT_JP']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Turnstile検証に失敗すれば400で拒否される(通常検索と同じ保護)', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => (String(url).includes('siteverify') ? Response.json({ success: false }) : new Response('unused'));
  try {
    const response = await worker.fetch(request({}), environment(), context);
    assert.equal(response.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
