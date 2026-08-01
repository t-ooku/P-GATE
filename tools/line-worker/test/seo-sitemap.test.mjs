import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderSeoPage, seoPagePaths } from '../src/seo-pages.mjs';

test('sitemap stays synchronized with every rendered SEO page', async () => {
  const sitemap = await readFile(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  const locations = [...sitemap.matchAll(/<loc>https:\/\/hoshilu\.app([^<]*)<\/loc>/g)].map((match) => match[1] || '/');

  for (const path of seoPagePaths) {
    assert.equal(locations.filter((location) => location === path).length, 1, `${path} must occur once`);
  }
  assert.equal(locations.filter((location) => /^\/(?:ja|en)\//.test(location)).length, seoPagePaths.length);
});

test('each localized sitemap entry declares ja, en, and x-default alternates', async () => {
  const sitemap = await readFile(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  const entries = [...sitemap.matchAll(/<url>\s*<loc>https:\/\/hoshilu\.app\/(?:ja|en)\/[^<]+<\/loc>([\s\S]*?)<\/url>/g)];

  assert.equal(entries.length, seoPagePaths.length);
  for (const [, body] of entries) {
    assert.match(body, /hreflang="ja"/);
    assert.match(body, /hreflang="en"/);
    assert.match(body, /hreflang="x-default"/);
  }
});

test('HTML and sitemap agree on the Japanese x-default URL', async () => {
  const sitemap = await readFile(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  for (const path of seoPagePaths) {
    const slug = path.split('/').pop();
    const expected = `https://hoshilu.app/ja/${slug}`;
    const html = renderSeoPage(path);
    assert.ok(html.includes(`<link rel="alternate" hreflang="x-default" href="${expected}">`));
    const sitemapEntry = sitemap.match(new RegExp(`<url>\\s*<loc>https://hoshilu\\.app${path}</loc>([\\s\\S]*?)</url>`))?.[1] ?? '';
    assert.ok(sitemapEntry.includes(`hreflang="x-default" href="${expected}"`));
  }
});
