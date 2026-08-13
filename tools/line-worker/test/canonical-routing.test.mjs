import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { canonicalRequestRedirect } from '../src/index.mjs';

const context = { waitUntil() {} };

test('canonical URLはHTTPS・apex・拡張子なしへ恒久転送する', () => {
  assert.equal(
    canonicalRequestRedirect('http://hoshilu.app/ja/find-product-without-name?utm_source=test'),
    'https://hoshilu.app/ja/find-product-without-name?utm_source=test'
  );
  assert.equal(canonicalRequestRedirect('https://www.hoshilu.app/privacy.html'), 'https://hoshilu.app/privacy');
  assert.equal(canonicalRequestRedirect('https://hoshilu.app/ja/guides/'), 'https://hoshilu.app/ja/guides');
  assert.equal(canonicalRequestRedirect('https://hoshilu.app/unknown/'), null);
  assert.equal(canonicalRequestRedirect('https://example.com/'), null);
});

test('HTTPリクエストはbodyを返さず308でHTTPSへ転送する', async () => {
  const response = await worker.fetch(new Request('http://hoshilu.app/health'), {}, context);
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://hoshilu.app/health');
  assert.equal(await response.text(), '');
});

test('SEOハブはGETとHEADで同じsecurity headersを返す', async () => {
  for (const method of ['GET', 'HEAD']) {
    const response = await worker.fetch(new Request('https://hoshilu.app/ja/guides', { method }), {}, context);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy') || '', /default-src 'self'/);
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
    assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
    if (method === 'HEAD') assert.equal(await response.text(), '');
  }
});

test('未定義APIはSPAのHTMLへフォールバックせずJSON 404を返す', async () => {
  let assetCalled = false;
  const response = await worker.fetch(new Request('https://hoshilu.app/api/not-defined'), {
    ASSETS: { fetch() { assetCalled = true; throw new Error('should not be called'); } }
  }, context);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.deepEqual(await response.json(), { ok: false, error: 'NOT_FOUND' });
  assert.equal(assetCalled, false);
});

test('静的資産は404-pageモードでsoft 404を防ぐ', () => {
  const wrangler = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  const notFound = readFileSync(new URL('../public/404.html', import.meta.url), 'utf8');
  assert.equal(wrangler.assets.not_found_handling, '404-page');
  assert.match(notFound, /<meta name="robots" content="noindex,follow">/);
  assert.match(notFound, /href="\/ja\/guides"/);
});
