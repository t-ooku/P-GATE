import test from 'node:test';
import assert from 'node:assert/strict';
import cryptoModule from 'node:crypto';
import worker from '../src/index.mjs';

globalThis.crypto ??= cryptoModule.webcrypto;
globalThis.btoa ??= (value) => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ??= (value) => Buffer.from(value, 'base64').toString('binary');

function environment(rows) {
  return {
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    TURNSTILE_SITE_KEY: 'site-key',
    GAS_BACKEND_URL: 'https://gas.example.test/exec',
    GAS_BRIDGE_SECRET: 'g'.repeat(32),
    LINK_SIGNING_SECRET: 'l'.repeat(32),
    PRODUCT_DB: {
      prepare() {
        return { bind() { return { all: async () => ({ results: rows }) }; } };
      }
    }
  };
}

function request(query, language = 'JA', searchAttempt = 1) {
  return new Request('https://hoshilu.app/api/knowledge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query,
      language,
      search_attempt: searchAttempt,
      consent: true,
      session_id: 'anonymous_session_123456',
      turnstile_token: 'verified-token'
    })
  });
}

const context = { waitUntil() {} };

test('public search API attempts product presentation from the first search and suggests MYWISH', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).includes('siteverify')
    ? Response.json({ success: true })
    : Response.json({ ok: true, result: { query_id: 'gas-q1', candidates: [], message: '' } });
  try {
    const response = await worker.fetch(request('SNSで見た青いやつ'), environment([]), context);
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.result.candidates, []);
    assert.equal(payload.result.clarification.required, false);
    assert.equal(payload.result.search_guidance.product_presentation_required, true);
    assert.equal(payload.result.mywish.suggested, true);
    const secondResponse = await worker.fetch(request('SNSで見た青いもの / 遊び・趣味に使う'), environment([]), context);
    const secondPayload = await secondResponse.json();
    assert.equal(secondResponse.status, 200, JSON.stringify(secondPayload));
    assert.equal(secondPayload.result.clarification.required, false);
    assert.equal(secondPayload.result.search_guidance.continuation, true);
    assert.equal(secondPayload.result.search_guidance.product_presentation_required, true);
    assert.match(secondPayload.result.amazon_search_url, /\/go\?/);
    const thirdResponse = await worker.fetch(request('SNSで見た青いもの / 遊び・趣味に使う / 手のひらサイズ'), environment([]), context);
    const thirdPayload = await thirdResponse.json();
    assert.equal(thirdResponse.status, 200, JSON.stringify(thirdPayload));
    assert.equal(thirdPayload.result.clarification.required, false);
    assert.match(thirdPayload.result.amazon_search_url, /\/go\?/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('second search presents an indexed product instead of asking again', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).includes('siteverify')
    ? Response.json({ success: true })
    : Response.json({ ok: true, result: { query_id: 'gas-second', candidates: [], message: '' } });
  const row = {
    asin: 'B000SECOND', product_name: 'Blue light-up phone case', manufacturer: 'Example',
    image_url: 'https://images.example.test/case.jpg', stock: 2
  };
  try {
    const response = await worker.fetch(request('TikTokで見た光るスマホケース', 'JA', 2), environment([row]), context);
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.result.clarification.required, false);
    assert.equal(payload.result.search_guidance.product_presentation_required, true);
    assert.equal(payload.result.search_guidance.product_presentation_met, true);
    assert.equal(payload.result.candidates[0].asin, row.asin);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AI product discovery runs from the first search when ten-mall candidates remain empty', async () => {
  const originalFetch = globalThis.fetch;
  const productUrl = 'https://shop.example.test/products/unknown-light';
  let aiCalls = 0;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('siteverify')) return Response.json({ success: true });
    if (target.includes('/v1beta/interactions')) {
      aiCalls += 1;
      return Response.json({ steps: [{ type: 'model_output', content: [{
        type: 'text',
        text: JSON.stringify({ products: [{ title: 'Possible light case', url: productUrl, reason: 'Visual clue match' }] }),
        annotations: [{ type: 'url_citation', url: productUrl, title: 'Example shop' }]
      }] }] });
    }
    if (target === productUrl) return new Response('<meta property="og:type" content="product"><meta property="og:image" content="https://cdn.example.test/unknown-light.jpg"><button>Add to cart</button>', { headers: { 'content-type': 'text/html' } });
    return Response.json({ ok: true, result: { query_id: 'gas-ai-fallback', candidates: [], message: '' } });
  };
  const env = { ...environment([]), GEMINI_API_KEY: 'g'.repeat(32) };
  try {
    const firstPayload = await (await worker.fetch(request('見たことのない光る小物', 'JA', 1), env, context)).json();
    assert.equal(aiCalls, 1);
    assert.equal(firstPayload.result.ai_discovery.provider, 'GEMINI_GOOGLE_SEARCH');
    assert.equal(firstPayload.result.ai_discovery.candidates[0].url, productUrl);
    const secondPayload = await (await worker.fetch(request('見たことのない光る小物', 'JA', 2), env, context)).json();
    assert.equal(aiCalls, 2);
    assert.equal(secondPayload.result.candidates.length, 0);
    assert.equal(secondPayload.result.ai_discovery.provider, 'GEMINI_GOOGLE_SEARCH');
    assert.equal(secondPayload.result.ai_discovery.candidates[0].url, productUrl);
    assert.equal(secondPayload.result.ai_discovery.candidates[0].verification, 'AI_DISCOVERY_UNCONFIRMED');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('public search API can return an ITG indexed result without an unapproved outbound URL', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).includes('siteverify')
    ? Response.json({ success: true })
    : Response.json({ ok: true, result: { query_id: 'gas-q2', candidates: [], message: '' } });
  const row = {
    asin: 'B08RMZKYTL',
    product_name: 'Logitech G PRO X Superlight Wireless Gaming Mouse - Black',
    manufacturer: 'Logitech',
    image_url: 'https://images.example.test/mouse.jpg',
    stock: 5,
    amazon_jp_url: 'https://www.amazon.co.jp/dp/B08RMZKYTL',
    amazon_us_url: ''
  };
  try {
    const response = await worker.fetch(request('Logitech G PRO X Superlight ワイヤレスゲーミングマウス'), environment([row]), context);
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.result.candidates[0].asin, row.asin);
    assert.equal(payload.result.candidates[0].tracking_url, '');
    assert.equal(payload.result.candidates[0].amazon_jp_url, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
