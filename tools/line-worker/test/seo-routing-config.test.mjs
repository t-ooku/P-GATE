import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from '../src/index.mjs';

test('Cloudflare routes Japanese and English SEO pages through the Worker', async () => {
  const config = JSON.parse(
    await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
  );
  const routes = config.assets?.run_worker_first || [];
  assert.ok(routes === true || routes.includes('/ja/*'));
  assert.ok(routes === true || routes.includes('/en/*'));
});

test('trailing slash SEO URLs permanently redirect to one canonical URL', async () => {
  const response = await worker.fetch(
    new Request('https://hoshilu.app/en/find-product-without-name/?source=directory'),
    {},
    { waitUntil() {} }
  );
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://hoshilu.app/en/find-product-without-name?source=directory');

  const canonical = await worker.fetch(
    new Request('https://hoshilu.app/en/find-product-without-name'),
    {},
    { waitUntil() {} }
  );
  assert.equal(canonical.status, 200);
});
