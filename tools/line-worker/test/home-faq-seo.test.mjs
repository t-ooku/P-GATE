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
  const social = faq.mainEntity.find((item) => item.name === '写真やSNS投稿URLから探せますか？');
  assert.ok(social);
  assert.match(social.acceptedAnswer.text, /スマホで撮影/u);
  assert.match(social.acceptedAnswer.text, /HOSHILU対応形式の公開投稿単体URL/u);
  assert.doesNotMatch(social.acceptedAnswer.text, /YouTube/u);
  // YouTube動画URLはURL Context非対応。一方、既存のYouTube検索リンクは別機能として維持する。
  assert.match(html, /Instagram・X・TikTok・YouTubeでも探せます/u);
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

test('ホームはカメラを含む4入力とAI/HOSHILUの責任境界をtitle・説明・OG・ファーストビューで一貫表示する', async () => {
  const [html, styles, speechStyles] = await Promise.all([read('index.html'), read('styles.css'), read('speech-input.css')]);
  const description = 'ホシルは、写真・スクショ・公開SNS投稿URL・一言から商品を探し、最大13モールの検索、おすすめ理由、取得元を確認できる口コミ評価・件数、モール公式ランキングから候補を見つける無料サービスです。';
  assert.match(html, /<title>ホシル｜写真・スクショ・一言から商品を探す<\/title>/);
  assert.ok(html.includes('<meta name="description" content="' + description + '">'));
  assert.match(html, /<meta property="og:title" content="ホシル｜写真・スクショ・一言から商品を探す">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/hoshilu\.app\/">/);
  assert.match(html, /<p id="heroPromise" class="hero-promise">AIは手がかりを理解し、HOSHILUは実際の購入先を探す。最大13モールの検索、おすすめ理由、取得元を確認できる口コミ評価・件数、モール公式ランキングから候補を見つけられます。<\/p>/);
  const match = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
  const data = JSON.parse(match[1]);
  assert.equal(data['@graph'].find((item) => item['@type'] === 'WebApplication').description, description);
  assert.match(html, /商品特定の補助にGoogle Cloud VisionのWeb画像照合とGoogle Gemini APIを使う場合があります。/u);
  assert.match(styles, /\.hero-copy \.hero-promise\{[^}]*font-size:clamp\(14px,2\.1vw,18px\)[^}]*line-height:1\.75/);
  assert.match(styles, /@media\(max-width:760px\)\{\.hero-copy \.hero-promise\{[^}]*font-size:14px[^}]*line-height:1\.65/);
  assert.match(speechStyles, /\.speech-input\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/);
  assert.match(speechStyles, /\.quick-queries \.chip\s*\{[^}]*min-height:\s*44px;/);
  assert.match(html, /<link rel="stylesheet" href="\/speech-input\.css\?v=2">/);
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
  assert.doesNotMatch(i18n, /faq\.social\.answer'[^\n]*YouTube/u);
  assert.match(sitemap, /<loc>https:\/\/hoshilu\.app\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/hoshilu\.app\/ja\/guides<\/loc>/);
  assert.equal((sitemap.match(/<url>/g) || []).length, 104);
  assert.match(robots, /Sitemap: https:\/\/hoshilu\.app\/sitemap\.xml/);
  assert.match(worker, /hoshilu-shell-v405/);
});

test('SNS URL FAQは静的表示とruntime上書きで対応形式の公開単体URLに統一する', async () => {
  const [html, i18n] = await Promise.all([read('index.html'), read('site-i18n.js')]);
  const visible = html.match(
    /<p data-i18n="faq\.social\.answer">([^<]+)<\/p>/u
  )?.[1];
  const runtimeJa = i18n.match(
    /Object\.assign\(messages\.JA,\{'faq\.social\.question':'写真やSNS投稿URLから探せますか？','faq\.social\.answer':'([^']+)'\}\);/u
  )?.[1];
  assert.ok(visible);
  assert.equal(runtimeJa, visible);
  for (const copy of [
    'HOSHILU対応形式の公開投稿単体URL',
    'HOSHILU-supported public single-post URL',
    'HOSHILU 支持格式公开单帖链接',
    'HOSHILU 지원 형식 공개 단일 게시물 URL'
  ]) assert.ok(i18n.includes(copy), `runtime FAQに対応形式の説明がない: ${copy}`);
});
