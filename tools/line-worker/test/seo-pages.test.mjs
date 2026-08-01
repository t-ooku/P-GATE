import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSeoPage, seoPagePaths } from '../src/seo-pages.mjs';

test('日英SEO必須10ページを別URLで提供する', () => {
  assert.equal(seoPagePaths.length, 10);
  for (const path of seoPagePaths) {
    const html = renderSeoPage(path);
    assert.match(html, /<link rel="canonical" href="https:\/\/hoshilu\.app\//);
    assert.match(html, /hreflang="ja"/);
    assert.match(html, /hreflang="en"/);
    assert.match(html, /hreflang="x-default"/);
    assert.match(html, /<form action="\/" method="get"[^>]*>/);
    assert.match(html, /<details>/);
    assert.match(html, /data-growth-search/);
    assert.match(html, /application\/ld\+json/);
    assert.match(html, /growth-analytics\.mjs/);
    assert.doesNotMatch(html, /Amazon公式|楽天公式|Qoo10公式|SHEIN公式/);
  }
});

test('未定義SEOパスは通常ルーティングへ戻す', () => {
  assert.equal(renderSeoPage('/ja/not-defined'), null);
  assert.equal(renderSeoPage('/api/config'), null);
});
