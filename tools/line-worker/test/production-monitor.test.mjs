import test from 'node:test';
import assert from 'node:assert/strict';
import { criticalAssetPaths, inspectProduction } from '../scripts/check-production-health.mjs';

const expectedIndexHtml = `
  <script src="/app.js?v=130"></script>
  <script type="module" src="/ai-search-ui.mjs?v=9"></script>
  <script type="module" src="/growth-analytics.mjs?v=2"></script>
  <link rel="stylesheet" href="/ai-search-layout-fix.css?v=123">
  <link rel="stylesheet" href="/wish-carousel.css?v=3">
  <link rel="stylesheet" href="/hero-fixes.css?v=88">
  Amazonのアソシエイトとして、HOSHILUは適格販売により収入を得ています。`;

const guideSecurityHeaders = {
  'strict-transport-security': 'max-age=31536000',
  'content-security-policy': "default-src 'self'; object-src 'none'",
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY'
};

function mockFetch({
  healthOk = true,
  yahooAvailable = true,
  appMarkers = true,
  redirectStatus = 308,
  notFoundOk = true,
  guideHeaders = guideSecurityHeaders
} = {}) {
  return async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname === 'www.hoshilu.app') throw new TypeError('DNS unavailable');
    if (url.protocol === 'http:' && url.pathname === '/') return new Response(null, {
      status: redirectStatus,
      headers: [301, 308].includes(redirectStatus) ? { location: 'https://hoshilu.app/' } : {}
    });
    if (url.pathname.includes('__hoshilu-monitor-missing-')) return new Response('not found', { status: notFoundOk ? 404 : 200 });
    if (url.pathname === '/ja/guides') {
      if (request.method === 'HEAD') return new Response(null, { status: 200, headers: guideHeaders });
      return new Response('<link rel="canonical" href="https://hoshilu.app/ja/guides">', { headers: guideHeaders });
    }
    if (url.pathname === '/sitemap.xml') return new Response('<urlset><url><loc>https://hoshilu.app/ja/guides</loc></url></urlset>');
    if (url.pathname === '/health') return Response.json({ ok: healthOk, checks: {
      turnstile_configured: true, ai_chat_configured: true,
      amazon_associate_link_configured: true,
      rakuten_marketplace_configured: true, yahoo_shopping_configured: true
    } });
    if (url.pathname === '/') return new Response(expectedIndexHtml);
    if (url.pathname === '/app.js') return new Response(`${'x'.repeat(1100)} ${appMarkers ? 'KNOWLEDGE_HTTP_TIMEOUT_MS SEARCH_DEADLINE_EXCEEDED SEARCH_SUPERSEDED tokenCallbackTimeoutMs maxAttempts takeReadyTurnstileToken hoshilu00-22 sponsored nofollow noopener noreferrer' : 'missing markers'}`);
    if (url.pathname === '/ai-search-ui.mjs') return new Response(`${'x'.repeat(1100)} AI_CHAT_HTTP_TIMEOUT_MS tokenCallbackTimeoutMs`);
    if (url.pathname === '/growth-analytics.mjs') return new Response(`${'x'.repeat(1100)} SEARCH_WATCHDOG_MS search-execution-started search_dead_end search_degraded marketplace_fallback_click`);
    if (url.pathname === '/ai-search-layout-fix.css') return new Response(`${'x'.repeat(1100)} result-row-recommended related-category-card overflow-x:auto`);
    if (url.pathname === '/wish-carousel.css') return new Response(`${'x'.repeat(1100)} share-discovery-actions share-gmail-button grid-column: 1 / -1`);
    if (url.pathname === '/hero-fixes.css') return new Response(`${'x'.repeat(1100)} .journey-heading h2 span overflow-wrap: anywhere word-break: normal`);
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
  assert.deepEqual(criticalAssetPaths(expectedIndexHtml), [
    '/app.js?v=130', '/ai-search-ui.mjs?v=9', '/growth-analytics.mjs?v=2',
    '/ai-search-layout-fix.css?v=123', '/wish-carousel.css?v=3', '/hero-fixes.css?v=88'
  ]);
});

test('scheduled monitor can validate the assets currently referenced by production', async () => {
  const result = await inspectProduction({
    baseUrl: 'https://hoshilu.app/', fetcher: mockFetch(),
    expectedIndexHtml: expectedIndexHtml.replace('app.js?v=130', 'app.js?v=999'),
    assetPolicy: 'live'
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.expected_assets, [
    '/app.js?v=130', '/ai-search-ui.mjs?v=9', '/growth-analytics.mjs?v=2',
    '/ai-search-layout-fix.css?v=123', '/wish-carousel.css?v=3', '/hero-fixes.css?v=88'
  ]);
});

test('production monitor verifies health, deployed assets, rankings and trace IDs', async () => {
  const result = await inspectProduction({ baseUrl: 'https://hoshilu.app/', fetcher: mockFetch(), expectedIndexHtml });
  assert.equal(result.ok, true);
  assert.equal(result.checks.length, 10);
  assert.deepEqual(result.warnings, ['www.hoshilu.app: SKIP (DNS or endpoint unavailable)']);
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
  assert.equal(requests, 20);
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

test('production monitor treats a runner-level HTTP 200 as advisory while HTTPS HSTS stays required', async () => {
  const result = await inspectProduction({
    baseUrl: 'https://hoshilu.app/', fetcher: mockFetch({ redirectStatus: 200 }), expectedIndexHtml
  });
  assert.ok(result.warnings.some((warning) => warning.includes('transparent upgrade')));
});

test('production monitor fails on an unexpected canonical HTTP response', async () => {
  await assert.rejects(
    inspectProduction({ baseUrl: 'https://hoshilu.app/', fetcher: mockFetch({ redirectStatus: 503 }), expectedIndexHtml }),
    /HTTP_APEX_REDIRECT_STATUS:503/u
  );
});

test('production monitor fails when unknown routes return the SPA shell', async () => {
  await assert.rejects(
    inspectProduction({ baseUrl: 'https://hoshilu.app/', fetcher: mockFetch({ notFoundOk: false }), expectedIndexHtml }),
    /EXPECTED_404_GOT_200/u
  );
});

test('production monitor requires security headers on the guide hub', async () => {
  const incomplete = { ...guideSecurityHeaders };
  delete incomplete['content-security-policy'];
  await assert.rejects(
    inspectProduction({ baseUrl: 'https://hoshilu.app/', fetcher: mockFetch({ guideHeaders: incomplete }), expectedIndexHtml }),
    /GUIDE_HUB_SECURITY_HEADER_MISSING:content-security-policy/u
  );
});
