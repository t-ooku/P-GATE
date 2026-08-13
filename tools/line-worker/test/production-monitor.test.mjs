import test from 'node:test';
import assert from 'node:assert/strict';
import { criticalAssetPaths, inspectProduction } from '../scripts/check-production-health.mjs';

const expectedIndexHtml = `
  <script src="/app.js?v=126"></script>
  <script type="module" src="/ai-search-ui.mjs?v=8"></script>`;

function mockFetch({ healthOk = true, yahooAvailable = true } = {}) {
  return async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    const url = new URL(request.url);
    if (url.pathname === '/health') return Response.json({ ok: healthOk, checks: {
      turnstile_configured: true, ai_chat_configured: true,
      rakuten_marketplace_configured: true, yahoo_shopping_configured: true
    } });
    if (url.pathname === '/') return new Response(expectedIndexHtml);
    if (url.pathname === '/app.js') return new Response(`${'x'.repeat(1100)} tokenCallbackTimeoutMs maxAttempts`);
    if (url.pathname === '/ai-search-ui.mjs') return new Response(`${'x'.repeat(1100)} AI_CHAT_HTTP_TIMEOUT_MS tokenCallbackTimeoutMs`);
    if (url.pathname === '/api/ranking-capabilities') return Response.json({ ok: true, marketplaces: [
      { marketplace_id: 'YAHOO_JP', status: yahooAvailable ? 'available' : 'planned', ranking_mode: yahooAvailable ? 'native_api' : 'derived_api' },
      ...Array.from({ length: 12 }, (_, index) => ({ marketplace_id: `M${index}` }))
    ] });
    if (['/api/ai-chat', '/api/knowledge'].includes(url.pathname)) {
      const requestId = `monitor-request-id-${url.pathname.slice(5)}`;
      return Response.json({ ok: false, error: 'TURNSTILE_TOKEN_INVALID', request_id: requestId }, {
        status: 400, headers: { 'x-request-id': requestId }
      });
    }
    throw new Error(`UNEXPECTED_URL:${url}`);
  };
}

test('criticalAssetPaths reads both versioned production assets', () => {
  assert.deepEqual(criticalAssetPaths(expectedIndexHtml), ['/app.js?v=126', '/ai-search-ui.mjs?v=8']);
});

test('production monitor verifies health, deployed assets, rankings and trace IDs', async () => {
  const result = await inspectProduction({ baseUrl: 'https://hoshilu.app/', fetcher: mockFetch(), expectedIndexHtml });
  assert.equal(result.ok, true);
  assert.equal(result.checks.length, 5);
});

test('production monitor fails when Yahoo ranking regresses to planned', async () => {
  await assert.rejects(
    inspectProduction({ baseUrl: 'https://hoshilu.app/', fetcher: mockFetch({ yahooAvailable: false }), expectedIndexHtml }),
    /YAHOO_RANKING_NOT_AVAILABLE/u
  );
});
