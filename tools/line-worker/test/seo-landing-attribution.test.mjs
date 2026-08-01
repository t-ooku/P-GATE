import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
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
  assert.match(analytics, /pageContent \|\| \(attribution\.content\.startsWith\('seo_'\) \? '' : attribution\.content\)/);
  assert.match(analytics, /send\('landing_view', \{ content: landingContent \}\)/);
});

test('downstream pages do not inflate SEO landing views', async () => {
  const source = await readFile(new URL('../public/growth-analytics.mjs', import.meta.url), 'utf8');
  const beacons = [];
  const stored = JSON.stringify({ source: '', medium: '', campaign: '', content: 'seo_product_requests' });
  const context = {
    URLSearchParams, Blob, Date,
    location: { search: '' },
    navigator: { sendBeacon: (_url, blob) => { beacons.push(blob); return true; } },
    document: {
      body: { dataset: {} }, documentElement: { lang: 'ja' },
      addEventListener() {}, querySelector() { return null; }
    },
    sessionStorage: { getItem: () => stored, setItem() {} },
    localStorage: { getItem: () => '0', setItem() {} },
    fetch() { return Promise.resolve(); }
  };
  context.window = context;
  vm.runInNewContext(source, context);
  const landing = JSON.parse(await beacons[0].text());
  assert.equal(landing.event_type, 'landing_view');
  assert.equal(landing.content, '');
  assert.equal(context.HoshiluGrowthAttribution.content, 'seo_product_requests');
});
