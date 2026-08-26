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

test('ホームはcanonicalに一致する言語指定と全ガイドへの明確な導線を持つ', async () => {
  const [html, styles] = await Promise.all([read('index.html'), read('styles.css')]);
  assert.match(html, /<link rel="alternate" hreflang="ja" href="https:\/\/hoshilu\.app\/">/);
  assert.match(html, /<link rel="alternate" hreflang="x-default" href="https:\/\/hoshilu\.app\/">/);
  assert.doesNotMatch(html, /rel="alternate" hreflang="(?:en|zh|ko)"/);
  assert.doesNotMatch(html, /hreflang="[^"]+" href="[^\"]+\?lang=/);
  assert.match(html, /class="shopping-guides-all"><a href="\/ja\/guides">目的別の買い物ガイドをすべて見る/);
  assert.match(styles, /\.shopping-guides-all a\{[^}]*min-height:48px/);
  assert.match(styles, /\.shopping-guides-all a:hover,\.shopping-guides-all a:focus-visible/);
});

// AI Overview/検索スニペット品質: UIクローム(ナビ・ダイアログ・通知設定・
// 会員ハブ・お知らせ・フッター)の文言が本文スニペットへ混入しないよう
// data-nosnippetを固定する。根拠: claude/hoshilu_ai_overview_seo_findings_20260818.md
// (全ソースで「本文以外の混入あり」を実測)。一方で価値提案の本文(ヒーロー・
// 検索パネル・FAQ・ガイド)はスニペット対象のまま残す。

test('ホームは3本柱とブランド原則をtitle・説明・OG・ファーストビューで一貫表示する', async () => {
  const [html, styles] = await Promise.all([read('index.html'), read('styles.css')]);
  const description = 'ホシルは、モール横断検索、AI探索、おすすめ・口コミ・ランキングからの発見を一つにした無料の商品検索サービス。商品名が分からなくても、用途や特徴から実在する候補と購入先を探せます。';
  assert.match(html, /<title>ホシル｜モール横断検索・AI探索で欲しい物を探す<\/title>/);
  assert.ok(html.includes('<meta name="description" content="' + description + '">'));
  assert.match(html, /<meta property="og:title" content="ホシル｜モール横断検索・AI探索で欲しい物を探す">/);
  assert.match(html, /<p class="hero-promise">AIは理解、HOSHILUは探す。モール横断検索、AI探索、おすすめ・口コミ・ランキングからの発見を、ひとつの買い物体験に。<\/p>/);
  const match = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
  const data = JSON.parse(match[1]);
  assert.equal(data['@graph'].find((item) => item['@type'] === 'WebApplication').description, description);
  assert.match(styles, /\.hero-copy \.hero-promise\{[^}]*font-size:clamp\(14px,2\.1vw,18px\)[^}]*line-height:1\.75/);
  assert.match(styles, /@media\(max-width:760px\)\{\.hero-copy \.hero-promise\{[^}]*font-size:14px[^}]*line-height:1\.65/);
});
test('UIクロームはdata-nosnippet、本文セクションはスニペット対象のまま', async () => {
  const html = await read('index.html');
  const chrome = [
    /<header class="topbar" data-nosnippet>/,
    /<dialog id="installDialog"[^>]* data-nosnippet>/,
    /<dialog id="notificationSettingsDialog"[^>]* data-nosnippet>/,
    /<nav id="searchModeSwitch"[^>]* data-nosnippet>/,
    /<aside class="sale-notice-card"[^>]* data-nosnippet>/,
    /<section id="insight"[^>]* data-nosnippet>/,
    /<section id="announcements"[^>]* data-nosnippet>/,
    /<footer data-nosnippet>/
  ];
  for (const pattern of chrome) assert.match(html, pattern);
  const snippetable = [
    /<section class="hero"(?![^>]*data-nosnippet)[^>]*>/,
    /<section id="hoshiluSearch"(?![^>]*data-nosnippet)[^>]*>/,
    /<section id="faq"(?![^>]*data-nosnippet)[^>]*>/,
    /<section class="shopping-guides"(?![^>]*data-nosnippet)[^>]*>/
  ];
  for (const pattern of snippetable) assert.match(html, pattern);
  // metaタグでのnosnippet全面禁止はしない(ページ全体が対象外になるため)。
  assert.doesNotMatch(html, /<meta[^>]+nosnippet/);
});

test('FAQは日英中韓の画面文言を持ち、sitemapは公開ページを案内する', async () => {
  const [i18n, sitemap, robots, worker] = await Promise.all([
    read('site-i18n.js'), read('sitemap.xml'), read('robots.txt'), read('service-worker.js')
  ]);
  for (const language of ['JA', 'EN', 'ZH', 'KO']) {
    assert.match(i18n, new RegExp(`Object\\.assign\\(messages\\.${language},\\{'faq\\.title'`));
  }
  assert.match(sitemap, /<loc>https:\/\/hoshilu\.app\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/hoshilu\.app\/ja\/guides<\/loc>/);
  assert.equal((sitemap.match(/<url>/g) || []).length, 74);
  assert.match(robots, /Sitemap: https:\/\/hoshilu\.app\/sitemap\.xml/);
  assert.match(worker, /hoshilu-shell-v393/);
});
