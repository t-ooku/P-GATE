import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker, {
  requireProcessingNotice,
  validateChatRequest,
  validateKnowledgeRequest,
  validatePriceComparisonRequest,
  validateRankingRequest,
  validateRelatedRecommendationsRequest
} from '../src/index.mjs';

const session_id = 'processing_notice_session_123456';
const turnstile_token = 'verified-token';

function streamedApiRequest(path, body) {
  const bytes = new TextEncoder().encode(body);
  let offset = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      const end = Math.min(offset + 257, bytes.byteLength);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    }
  });
  const request = new Request(`https://hoshilu.app${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
    body: stream,
    duplex: 'half'
  });
  assert.equal(request.headers.has('content-length'), false);
  return request;
}

function validatorCases(notice) {
  const shared = { ...notice, session_id, turnstile_token };
  return [
    ['knowledge', validateKnowledgeRequest, { ...shared, query: 'ハンディファン' }],
    ['chat', validateChatRequest, {
      ...shared, history: [{ role: 'user', text: '白いハンディファン' }]
    }],
    ['ranking', validateRankingRequest, {
      ...shared, query: 'ハンディファン', marketplace: 'RAKUTEN_JP'
    }],
    ['price comparison', validatePriceComparisonRequest, {
      ...shared, product: { title: '白いハンディファン' }
    }],
    ['related recommendations', validateRelatedRecommendationsRequest, {
      ...shared, query: 'ハンディファン'
    }]
  ];
}

test('一般ユーザーAPIはprocessing_notice_shown=trueを新しい入力契約として受ける', () => {
  assert.equal(requireProcessingNotice({ processing_notice_shown: true }), true);
  for (const [name, validate, payload] of validatorCases({ processing_notice_shown: true })) {
    const result = validate(payload);
    assert.equal(result.processing_notice_shown, true, `${name} did not normalize the notice flag`);
    assert.equal('consent' in result, false, `${name} retained the legacy consent field`);
  }
});

test('旧PWAのconsent=trueはローリング更新中の後方互換として受ける', () => {
  assert.equal(requireProcessingNotice({ consent: true }), true);
  for (const [name, validate, payload] of validatorCases({ consent: true })) {
    const result = validate(payload);
    assert.equal(result.processing_notice_shown, true, `${name} did not normalize legacy input`);
    assert.equal('consent' in result, false, `${name} retained the legacy consent field`);
  }
});

test('告知済みフラグはboolean trueだけを受け、未提示は新しいエラーコードで拒否する', () => {
  for (const payload of [
    null,
    {},
    { processing_notice_shown: false },
    { processing_notice_shown: 'true' },
    { consent: false },
    { consent: 'true' }
  ]) {
    assert.throws(() => requireProcessingNotice(payload), /PROCESSING_NOTICE_REQUIRED/);
  }
});

test('一般APIクライアント・運用probe・生成ツールは処理告知済みを送る', async () => {
  const [chat, priceComparison, app, versionedApp, healthProbe, generator] = await Promise.all([
    readFile(new URL('../public/ai-search-ui.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../public/ai-price-comparison-ui.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/assets-v143/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/check-production-health.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../tools/apply-ai-search-v2-step2.mjs', import.meta.url), 'utf8')
  ]);
  for (const [name, source] of [
    ['AI chat', chat],
    ['price comparison', priceComparison],
    ['main app', app],
    ['versioned app', versionedApp],
    ['production health probe', healthProbe],
    ['AI search generator', generator]
  ]) {
    assert.match(source, /processing_notice_shown:\s*true/u, `${name} lacks the notice flag`);
    assert.doesNotMatch(source, /\bconsent:\s*true/u, `${name} still sends legacy consent`);
  }
});

test('一般ユーザー向け各routeは処理告知が無い要求を400で返す', async (t) => {
  const cases = [
    ['/api/knowledge', { query: 'ハンディファン', session_id, turnstile_token }],
    ['/api/related-recommendations', { query: 'ハンディファン', session_id, turnstile_token }],
    ['/api/ai-chat', {
      history: [{ role: 'user', text: 'ハンディファン' }], session_id, turnstile_token
    }],
    ['/api/price-comparison', {
      product: { title: 'ハンディファン' }, session_id, turnstile_token
    }],
    ['/api/rankings', {
      query: 'ハンディファン', marketplace: 'RAKUTEN_JP', session_id, turnstile_token
    }],
    ['/api/hoshilu-rankings', { query: 'ハンディファン', session_id, turnstile_token }]
  ];
  for (const [path, body] of cases) {
    await t.test(path, async () => {
      const response = await worker.fetch(new Request(`https://hoshilu.app${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
        body: JSON.stringify(body)
      }), {}, { waitUntil() {} });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'PROCESSING_NOTICE_REQUIRED');
    });
  }
});

test('公開JSON routeはContent-Length未申告の実測超過をTurnstile前に413で拒否する', async (t) => {
  const cases = [
    ['/api/hoshilu-rankings', 4000],
    ['/api/ai-chat', 4000],
    ['/api/price-comparison', 6000],
    ['/api/rankings', 4000],
    ['/api/related-recommendations', 10000]
  ];
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async () => {
    externalCalls += 1;
    throw new Error('EXTERNAL_FETCH_MUST_NOT_RUN');
  };
  try {
    for (const [path, maximumBytes] of cases) {
      await t.test(path, async () => {
        const body = JSON.stringify({ padding: 'x'.repeat(maximumBytes + 32) });
        const response = await worker.fetch(
          streamedApiRequest(path, body),
          { TURNSTILE_SECRET_KEY: 'turnstile-secret' },
          { waitUntil() {} }
        );
        assert.equal(response.status, 413);
        assert.equal((await response.json()).error, 'REQUEST_TOO_LARGE');
      });
    }
    assert.equal(externalCalls, 0, 'Turnstile/provider fetch ran before the body-size rejection');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('公開JSON routeはContent-Length未申告の不正JSONをTurnstile前に400で拒否する', async (t) => {
  const paths = [
    '/api/hoshilu-rankings',
    '/api/ai-chat',
    '/api/price-comparison',
    '/api/rankings',
    '/api/related-recommendations'
  ];
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async () => {
    externalCalls += 1;
    throw new Error('EXTERNAL_FETCH_MUST_NOT_RUN');
  };
  try {
    for (const path of paths) {
      await t.test(path, async () => {
        const response = await worker.fetch(
          streamedApiRequest(path, '{"processing_notice_shown":true'),
          { TURNSTILE_SECRET_KEY: 'turnstile-secret' },
          { waitUntil() {} }
        );
        assert.equal(response.status, 400);
        assert.equal((await response.json()).error, 'REQUEST_JSON_INVALID');
      });
    }
    assert.equal(externalCalls, 0, 'Turnstile/provider fetch ran before the JSON rejection');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
