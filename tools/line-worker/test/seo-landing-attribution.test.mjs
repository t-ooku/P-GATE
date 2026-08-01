import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderSeoPage, seoPagePaths } from '../src/seo-pages.mjs';

test('each SEO landing page exposes one safe anonymous content dimension', () => {
  const values = new Set();
  for (const path of seoPagePaths) {
    const html = renderSeoPage(path);
    const value = html.match(/<body data-growth-content="([a-z0-9_]+)">/)?.[1] ?? '';
    assert.match(value, /^seo_[a-z0-9_]{1,59}$/);
    values.add(value);
  }
  assert.equal(values.size, 5);
});

test('growth analytics accepts only bounded page content and preserves explicit UTM content', async () => {
  const analytics = await readFile(new URL('../public/growth-analytics.mjs', import.meta.url), 'utf8');
  assert.match(analytics, /\^\[a-z0-9_\]\{1,64\}\$/);
  assert.match(analytics, /params\.get\('utm_content'\) \|\| pageContent/);
});
