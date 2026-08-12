import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderSeoPage, seoPagePaths } from '../src/seo-pages.mjs';

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
    assert.doesNotMatch(html, /Amazon公式|楽天公式|Qoo10公式|SHEIN公式/);
    assert.doesNotMatch(html, /最安(?:値)?です|人気No\.1|絶対おすすめ/);
  }
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
});
