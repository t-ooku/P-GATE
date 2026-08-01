import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const publicUrl = new URL('../public/', import.meta.url);
const paths = [
  'find-product-without-name',
  'how-to-search-by-description',
  'shopping-in-japan',
  'american-products-in-japan',
  'product-requests',
];

test('homepage links directly to every Japanese and English SEO guide', async () => {
  const html = await readFile(new URL('index.html', publicUrl), 'utf8');
  assert.match(html, /<section class="seo-guides" aria-labelledby="seoGuidesTitle">/);
  assert.equal(html.match(/id="seoGuidesTitle"/g)?.length, 1);
  for (const path of paths) {
    assert.match(html, new RegExp(`href="/ja/${path}"`));
    assert.match(html, new RegExp(`href="/en/${path}"`));
  }
  const section = html.match(/<section class="seo-guides"[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.doesNotMatch(section, /rel="nofollow"/);
});

test('SEO guide styles are loaded and available offline', async () => {
  const [html, css, serviceWorker] = await Promise.all([
    readFile(new URL('index.html', publicUrl), 'utf8'),
    readFile(new URL('seo-guides.css', publicUrl), 'utf8'),
    readFile(new URL('service-worker.js', publicUrl), 'utf8'),
  ]);
  assert.match(html, /href="\/seo-guides\.css"/);
  assert.match(css, /\.seo-guides-grid/);
  assert.match(css, /:focus-visible/);
  assert.match(serviceWorker, /'\/seo-guides\.css'/);
  assert.match(serviceWorker, /hoshilu-shell-v102/);
});
