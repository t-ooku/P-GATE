import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('ホームFAQは利用者に見える回答とFAQPage構造化データを一致させる', async () => {
  const html = await read('index.html');
  const match = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
  assert.ok(match);
  const data = JSON.parse(match[1]);
  const faq = data['@graph'].find((item) => item['@type'] === 'FAQPage');
  assert.equal(faq.mainEntity.length, 4);
  for (const item of faq.mainEntity) {
    assert.ok(html.includes(item.name));
    assert.ok(html.includes(item.acceptedAnswer.text));
  }
  assert.match(html, /class="hoshilu-faq"/);
});

test('FAQは日英中韓の画面文言を持ち、sitemapは公開ページを案内する', async () => {
  const [i18n, sitemap, robots, worker] = await Promise.all([
    read('site-i18n.js'), read('sitemap.xml'), read('robots.txt'), read('service-worker.js')
  ]);
  for (const language of ['JA', 'EN', 'ZH', 'KO']) {
    assert.match(i18n, new RegExp(`Object\\.assign\\(messages\\.${language},\\{'faq\\.title'`));
  }
  assert.match(sitemap, /<loc>https:\/\/hoshilu\.app\/<\/loc>/);
  assert.equal((sitemap.match(/<url>/g) || []).length, 13);
  assert.match(robots, /Sitemap: https:\/\/hoshilu\.app\/sitemap\.xml/);
  assert.match(worker, /hoshilu-shell-v367/);
});
