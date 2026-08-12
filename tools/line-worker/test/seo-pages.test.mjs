import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateSeoPageQuality, renderSeoPage, seoPagePaths } from '../src/seo-pages.mjs';

test('既存10ページと検索意図が異なる日本語5ページを提供する', () => {
  assert.equal(seoPagePaths.length, 15);
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

test('スマホ比較表は横スクロールではなく行カードへ変換するCSSを持つ', () => {
  const css = readFileSync(new URL('../public/seo-article.css', import.meta.url), 'utf8');
  assert.match(css, /td::before\s*\{\s*content:\s*attr\(data-label\)/);
  assert.match(css, /table, tbody, tr, td\s*\{\s*display:\s*block/);
  assert.doesNotMatch(css, /margin-right:\s*-1rem/);
  assert.match(css, /:focus-visible/);
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
