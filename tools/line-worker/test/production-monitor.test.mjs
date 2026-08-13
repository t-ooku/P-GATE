import test from 'node:test';
import assert from 'node:assert/strict';
import { criticalAssetPaths, inspectProduction } from '../scripts/check-production-health.mjs';

const expectedIndexHtml = `
  <script src="/app.js?v=127"></script>
  <script type="module" src="/ai-search-ui.mjs?v=8"></script>
  <script type="module" src="/growth-analytics.mjs?v=1"></script>`;

function mockFetch({ healthOk = true, yahooAvailable = true, appMarkers = true } = {}) {
  return async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    const url = new URL(request.url);
    if (url.pathname === '/health') return Response.json({ ok: healthOk, checks: {
      turnstile_configured: true, ai_chat_configured: true,
      rakuten_marketplace_configured: true, yahoo_shopping_configured: true
    } });
    if (url.pathname === '/') return new Response(expectedIndexHtml);
    if (url.pathname === '/app.js') return new Response(`${'x'.repeat(1100)} ${appMarkers ? 'KNOWLEDGE_HTTP_TIMEOUT_MS SEARCH_DEADLINE_EXCEEDED SEARCH_SUPERSEDED tokenCallbackTimeoutMs maxAttempts' : 'missing markers'}`);
    if (url.pathname === '/ai-search-ui.mjs') return new Response(`${'x'.repeat(1100)} AI_CHAT_HTTP_TIMEOUT_MS tokenCallbackTimeoutMs`);
    if (url.pathname === '/growth-analytics.mjs') return new Response(`${'x'.repeat(1100)} SEARCH_WATCHDOG_MS search-execution-started search_dead_end search_degraded`);
    if (url.pathname === '/api/ranking-capabilities') return Response.json({ ok: true, marketplaces: [
      { marketplace_id: 'YAHOO_JP', status: yahooAvailable ? 'available' : 'planned', ranking_mode: yahooAvailable ? 'native_api' : 'derived_api' },
      ...Array.from({ length: 12 }, (_, index) => ({ marketplace_id: `M${index}` }))
    ] });
    if (['/api/ai-chat', '/api/knowledge'].includes(url.pathname)) {
      const requestId = `monitor-request-id-${url.pathname.slice(5)}`;
      const input = await request.json();
      const error = input.turnstile_token ? 'TURNSTILE_VERIFICATION_FAILED' : 'TURNSTILE_TOKEN_INVALID';
      return Response.json({ ok: false, error, request_id: requestId }, {
        status: 400, headers: { 'x-request-id': requestId }
      });
    }
    if (url.pathname === '/api/events') {
      const input = await request.json();
      assert.deepEqual(input, {
        event_type: 'landing_view', locale: 'JA',
        source: 'qa_production_monitor', medium: 'qa', campaign: 'reliability_monitor'
      });
      return Response.json({ ok: true }, { status: 202 });
    }
    throw new Error(`UNEXPECTED_URL:${url}`);
  };
}

test('criticalAssetPaths reads all versioned production reliability assets', () => {
  assert.deepEqual(criticalAssetPaths(expectedIndexHtml), ['/app.js?v=127', '/ai-search-ui.mjs?v=8', '/growth-analytics.mjs?v=1']);
});

test('scheduled monitor can validate the assets currently referenced by production', async () => {
  const result = await inspectProduction({
    baseUrl: 'https://hoshilu.app/', fetcher: mockFetch(),
    expectedIndexHtml: expectedIndexHtml.replace('app.js?v=127', 'app.js?v=999'),
    assetPolicy: 'live'
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.expected_assets, ['/app.js?v=127', '/ai-search-ui.mjs?v=8', '/growth-analytics.mjs?v=1']);
});

test('production monitor verifies health, deployed assets, rankings and trace IDs', async () => {
  const result = await inspectProduction({ baseUrl: 'https://hoshilu.app/', fetcher: mockFetch(), expectedIndexHtml });
  assert.equal(result.ok, true);
  assert.equal(result.checks.length, 6);
});

test('production monitor rejects stale assets without reliability markers', async () => {
  await assert.rejects(
    inspectProduction({ baseUrl: 'https://hoshilu.app/', fetcher: mockFetch({ appMarkers: false }), expectedIndexHtml }),
    /PRODUCTION_ASSET_MARKER_MISSING:app\.js:KNOWLEDGE_HTTP_TIMEOUT_MS/u
  );
});

test('production monitor applies a timeout signal to every network request', async () => {
  let requests = 0;
  const fetcher = mockFetch();
  await inspectProduction({
    baseUrl: 'https://hoshilu.app/', expectedIndexHtml,
    fetcher: async (input, init = {}) => {
      requests += 1;
      const signal = input instanceof Request ? input.signal : init.signal;
      assert.ok(signal instanceof AbortSignal);
      return fetcher(input, init);
    }
  });
  assert.equal(requests, 9);
});

test('production monitor fails when Yahoo ranking regresses to planned', async () => {
  await assert.rejects(
    inspectProduction({ baseUrl: 'https://hoshilu.app/', fetcher: mockFetch({ yahooAvailable: false }), expectedIndexHtml }),
    /YAHOO_RANKING_NOT_AVAILABLE/u
  );
});

test('production monitor rejects a hanging request within the fetch deadline', { timeout: 2000 }, async () => {
  await assert.rejects(
    inspectProduction({
      baseUrl: 'https://hoshilu.app/', expectedIndexHtml,
      requestTimeoutMs: 25,
      fetcher: (input, init = {}) => new Promise((_resolve, reject) => {
        const signal = input instanceof Request ? input.signal : init.signal;
        // AbortSignal.timeout() intentionally uses an unref'd timer in Node. A
        // referenced guard keeps the isolated CI test process alive long enough
        // to observe the production timeout instead of cancelling the test.
        const guard = setTimeout(() => reject(new Error('TEST_TIMEOUT_GUARD')), 500);
        signal?.addEventListener('abort', () => {
          clearTimeout(guard);
          reject(signal.reason);
        }, { once: true });
      })
    }),
    error => error?.name === 'TimeoutError'
  );
});
