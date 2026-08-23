import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateSeoPageQuality, renderSeoPage, seoHubPaths, seoPagePaths } from '../src/seo-pages.mjs';

test('検索意図が異なる日本語43ページと英語5ページを提供する', () => {
  assert.equal(seoPagePaths.length, 54);
  for (const path of seoPagePaths) {
    const html = renderSeoPage(path);
    assert.match(html, /<link rel="canonical" href="https:\/\/hoshilu\.app\//);
    assert.match(html, /hreflang="x-default"/);
    assert.match(html, /<form action="\/" method="get" data-seo-search-form>/);
    assert.match(html, /<details>/);
    assert.match(html, /data-seo-article-id=/);
    assert.match(html, /seo-article-analytics\.mjs/);
    assert.match(html, /最終更新|Last updated/);
    assert.match(html, /<table>/);
    assert.match(html, /<figure class="guide-visual"/);
    assert.match(html, /class="article-toc"/);
    assert.match(html, /class="guide-flow"/);
    assert.match(html, /class="review-check-grid"/);
    assert.match(html, /class="identity-guide"/);
    assert.match(html, /<th scope="col">/);
    assert.match(html, /<td data-label=/);
    assert.match(html, /data-seo-intent=/);
    assert.match(html, /data-seo-section-event="seo_comparison_view"/);
    assert.match(html, /og:image" content="https:\/\/hoshilu\.app\/og-hoshilu\.png/);
    assert.doesNotMatch(html, /Amazon公式|楽天公式|Qoo10公式|SHEIN公式/);
    assert.doesNotMatch(html, /最安(?:値)?です|人気No\.1|絶対おすすめ/);
    assert.doesNotMatch(html, /https?:\/\/[^"']+\.(?:jpg|jpeg|webp)/i);
    assert.ok(evaluateSeoPageQuality(path).total >= 85);
  }
});

test('各日本語テーマは検索意図別の固有な図解手順を持つ', () => {
  const japanesePaths = seoPagePaths.filter((path) => path.startsWith('/ja/'));
  const flows = japanesePaths.map((path) => {
    const html = renderSeoPage(path);
    return html.match(/<ol class="guide-flow">([\s\S]*?)<\/ol>/)?.[1] || '';
  });
  assert.equal(new Set(flows).size, japanesePaths.length);
});

test('日本語ガイドハブは43記事を重複なく分類し全記事から戻れる', () => {
  assert.deepEqual(seoHubPaths, ['/ja/guides']);
  const html = renderSeoPage('/ja/guides');
  assert.ok(html);
  assert.match(html, /<link rel="canonical" href="https:\/\/hoshilu\.app\/ja\/guides">/);
  assert.match(html, /<meta name="robots" content="index,follow/);
  assert.match(html, /<h1>商品選び・比較・探し方ガイド<\/h1>/);
  assert.match(html, /"@type":"CollectionPage"/);
  assert.match(html, /"@type":"ItemList"/);
  assert.doesNotMatch(html, /utm_(?:source|medium|campaign|content)/, 'internal SEO links must preserve organic attribution');

  const japanesePaths = seoPagePaths.filter((path) => path.startsWith('/ja/'));
  assert.equal(japanesePaths.length, 49);
  for (const path of japanesePaths) {
    assert.equal((html.match(new RegExp(`href="${path}"`, 'g')) || []).length, 1, `${path} should appear once in the hub`);
    assert.match(renderSeoPage(path), /href="\/ja\/guides"/);
  }
});

test('新規5テーマは商品・価格・口コミ・順位を根拠なく断定しない', () => {
  const paths = [
    '/ja/how-to-check-size-and-installation-space',
    '/ja/check-device-compatibility-before-buying',
    '/ja/find-products-for-small-spaces',
    '/ja/shopping-guide-for-living-alone',
    '/ja/compare-delivery-and-return-conditions'
  ];
  for (const path of paths) {
    const html = renderSeoPage(path);
    assert.ok(html);
    assert.ok(evaluateSeoPageQuality(path).total >= 85);
    assert.match(html, /販売ページ/);
    assert.doesNotMatch(html, /最安(?:値)?です|人気No\.1|売れ筋No\.1|絶対おすすめ/);
    assert.doesNotMatch(html, /Premium|月額980円/);
  }
});

test('2026-08-21公開の10記事は正しい更新日を表示・構造化データへ反映する', () => {
  const published = [
    'find-products-seen-on-social-media', 'find-products-seen-on-tiktok',
    'find-fashion-items-seen-on-instagram', 'find-products-introduced-on-youtube',
    'identify-correct-product-name-from-vague-memory', 'find-a-product-from-a-photo-or-screenshot',
    'identify-a-product-someone-else-is-using', 'find-a-product-you-saw-in-a-store',
    'find-a-product-you-saw-in-a-tv-commercial', 'turn-vague-words-into-search-terms'
  ];
  for (const slug of published) {
    const html = renderSeoPage(`/ja/${slug}`);
    assert.match(html, /datetime="2026-08-21"/);
    assert.match(html, /"dateModified":"2026-08-21"/);
  }
});


test('2026-08-22公開の5記事は固有の意図・図解・更新日・品質基準を満たす', () => {
  const published = [
    'find-korean-cosmetics-without-product-name',
    'find-korean-style-fashion-by-features',
    'find-products-used-by-favorite-idol',
    'find-fan-activity-goods-by-purpose',
    'shopping-guide-for-students-on-a-budget'
  ];
  const intents = new Set();
  for (const slug of published) {
    const path = '/ja/' + slug;
    const html = renderSeoPage(path);
    assert.match(html, /datetime="2026-08-22"/);
    assert.match(html, /"dateModified":"2026-08-22"/);
    assert.match(html, /<figure class="guide-visual"/);
    assert.match(html, /data-seo-section-event="seo_comparison_view"/);
    assert.ok(evaluateSeoPageQuality(path).total >= 85);
    const intent = html.match(/data-seo-intent="([^"]+)"/)?.[1];
    assert.ok(intent);
    intents.add(intent);
  }
  assert.equal(intents.size, published.length);
});

test('2026-08-23公開の口コミ2記事・ランキング3記事は固有意図と安全基準を満たす', () => {
  const reviews = [
    'read-korean-cosmetics-reviews-by-skin-type',
    'read-korean-fashion-size-reviews'
  ];
  const rankings = [
    'use-korean-cosmetics-rankings-safely',
    'use-fan-goods-rankings-by-purpose',
    'use-student-commute-item-rankings'
  ];
  const intents = new Set();
  for (const slug of [...reviews, ...rankings]) {
    const path = '/ja/' + slug;
    const html = renderSeoPage(path);
    assert.match(html, /datetime="2026-08-23"/);
    assert.match(html, /"dateModified":"2026-08-23"/);
    assert.match(html, /<figure class="guide-visual"/);
    assert.match(html, /data-seo-section-event="seo_review_guide_view"/);
    assert.doesNotMatch(html, /Premium|月額980円|人気No\.1|絶対おすすめ/);
    assert.ok(evaluateSeoPageQuality(path).total >= 85);
    intents.add(html.match(/data-seo-intent="([^"]+)"/)?.[1]);
  }
  assert.equal(intents.size, 5);
  for (const slug of reviews) assert.match(renderSeoPage('/ja/' + slug), /data-seo-article-type="review-guide"/);
  for (const slug of rankings) assert.match(renderSeoPage('/ja/' + slug), /data-seo-article-type="ranking-guide"/);
});

test('2026-08-23の新規記事はハブと同一検索意図クラスタへつながる', () => {
  const reviews = ['read-korean-cosmetics-reviews-by-skin-type', 'read-korean-fashion-size-reviews'];
  const rankings = ['use-korean-cosmetics-rankings-safely', 'use-fan-goods-rankings-by-purpose', 'use-student-commute-item-rankings'];
  for (const slug of [...reviews, ...rankings]) {
    const html = renderSeoPage('/ja/' + slug);
    assert.match(html, /href="\/ja\/guides"/);
    const nav = html.match(/<nav class="related"[\s\S]*?<\/nav>/)?.[0] || '';
    const links = [...nav.matchAll(/href="(\/ja\/(?!guides)[^"]+)"/g)].map((match) => match[1]);
    assert.equal(links.length, 3);
    assert.equal(new Set(links).size, 3);
  }
  for (const slug of rankings) {
    const html = renderSeoPage('/ja/' + slug);
    for (const candidate of rankings.filter((other) => other !== slug)) assert.ok(html.includes('href="/ja/' + candidate + '"'));
  }
});
test('サイトマップはガイドハブ・全SEOページ・canonicalの法的ページを含む', () => {
  const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  for (const path of seoPagePaths) assert.match(sitemap, new RegExp(`<loc>https://hoshilu\\.app${path}</loc>`));
  assert.match(sitemap, /<loc>https:\/\/hoshilu\.app\/ja\/guides<\/loc>\s*<lastmod>2026-08-23<\/lastmod>/);
  assert.match(sitemap, /<loc>https:\/\/hoshilu\.app\/privacy<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/hoshilu\.app\/terms<\/loc>/);
  assert.doesNotMatch(sitemap, /<loc>[^<]+\.html<\/loc>/);
  assert.equal((sitemap.match(/<url>/g) || []).length, 60);
  assert.match(sitemap, /<loc>https:\/\/hoshilu\.app\/buzz<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/hoshilu\.app\/for-sellers<\/loc>/);
});

test('新規5記事はハブと同一クラスタの関連記事へ重複なくつながる', () => {
  const youth = [
    'find-korean-cosmetics-without-product-name',
    'find-korean-style-fashion-by-features',
    'find-products-used-by-favorite-idol',
    'find-fan-activity-goods-by-purpose'
  ];
  const published = [...youth, 'shopping-guide-for-students-on-a-budget'];
  for (const slug of published) {
    const html = renderSeoPage('/ja/' + slug);
    assert.match(html, /href="\/ja\/guides"/);
    const nav = html.match(/<nav class="related"[\s\S]*?<\/nav>/)?.[0] || '';
    const articleLinks = [...nav.matchAll(/href="(\/ja\/(?!guides)[^"]+)"/g)].map((match) => match[1]);
    assert.equal(articleLinks.length, 3);
    assert.equal(new Set(articleLinks).size, 3);
  }
  for (const slug of youth) {
    const html = renderSeoPage('/ja/' + slug);
    for (const candidate of youth.filter((other) => other !== slug)) {
      assert.ok(html.includes('href="/ja/' + candidate + '"'));
    }
  }
});
test('スマホ比較表は横スクロールではなく行カードへ変換するCSSを持つ', () => {
  const css = readFileSync(new URL('../public/seo-article.css', import.meta.url), 'utf8');
  assert.match(css, /td::before\s*\{\s*content:\s*attr\(data-label\)/);
  assert.match(css, /table, tbody, tr, td\s*\{\s*display:\s*block/);
  assert.doesNotMatch(css, /margin-right:\s*-1rem/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.breadcrumbs a\s*\{[^}]*display:\s*inline-flex[^}]*min-height:\s*44px/s);
  assert.match(css, /\.guide-hub-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.guide-hub-grid a\s*\{[^}]*min-height:\s*108px[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*\.guide-hub-grid\s*\{\s*grid-template-columns:\s*1fr/);
});

test('Service Workerは存在しない旧SEO素材をprecacheしない', () => {
  const worker = readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');
  assert.doesNotMatch(worker, /seo-pages\.css|seo\/hoshilu-seo-hero-v1|seo\/hoshilu-category-guide-v1/);
  assert.match(worker, /seo-article\.css/);
  assert.match(worker, /seo-article-analytics\.mjs/);
});

test('英語版がない日本語記事へ存在しないalternateを出さない', () => {
  const html = renderSeoPage('/ja/search-product-by-model-number');
  assert.match(html, /hreflang="ja"/);
  assert.doesNotMatch(html, /hreflang="en"/);
});

test('未定義SEOパスは通常ルーティングへ戻す', () => {
  assert.equal(renderSeoPage('/ja/not-defined'), null);
  assert.equal(renderSeoPage('/api/config'), null);
});

test('受け入れ検証アクセスは記事の実KPIではなくQAへ分類できる', () => {
  const analytics = readFileSync(new URL('../public/seo-article-analytics.mjs', import.meta.url), 'utf8');
  assert.match(analytics, /requestedSource\.startsWith\('codex'\)/);
  assert.match(analytics, /requestedMedium === 'qa'/);
  assert.match(analytics, /eventMedium = isQaVisit \? 'qa' : 'internal'/);
  assert.match(analytics, /campaign: searchIntent/);
  assert.match(analytics, /IntersectionObserver/);
});
