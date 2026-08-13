import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Cloudflare routes Japanese and English SEO pages through the Worker', async () => {
  const config = JSON.parse(
    await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
  );
  const routes = config.assets?.run_worker_first || [];
  assert.ok(routes === true || routes.includes('/ja/*'));
  assert.ok(routes === true || routes.includes('/en/*'));
});

test('Cloudflare serves apex and www through the canonical redirect Worker', async () => {
  const config = JSON.parse(
    await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
  );
  const customDomains = config.routes
    .filter((route) => route.custom_domain === true)
    .map((route) => route.pattern);
  assert.deepEqual(customDomains, ['hoshilu.app', 'www.hoshilu.app']);
});
