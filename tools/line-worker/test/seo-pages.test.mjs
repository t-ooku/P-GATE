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
    assert.match(html, /BreadcrumbList/);
    assert.match(html, /FAQPage/);
    assert.match(html, /aria-current="page"/);
    assert.match(html, /aria-labelledby="related-guides"/);
    assert.match(html, /growth-analytics\.mjs/);
    assert.doesNotMatch(html, /Amazon公式|楽天公式|Qoo10公式|SHEIN公式/);
  }
});

test('FAQ structured data matches the visible question and answer', () => {
  for (const path of seoPagePaths) {
    const html = renderSeoPage(path);
    const json = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1];
    const data = JSON.parse(json);
    const faq = data['@graph'].find((entry) => entry['@type'] === 'FAQPage');
    const entity = faq.mainEntity[0];
    assert.ok(html.includes(`<summary>${entity.name}</summary>`));
    assert.ok(html.includes(`<p>${entity.acceptedAnswer.text}</p>`));
  }
});

test('each SEO page links to every other guide in the same language', () => {
  for (const path of seoPagePaths) {
    const html = renderSeoPage(path);
    const [locale] = path.slice(1).split('/');
    const siblingPaths = seoPagePaths.filter((candidate) => candidate.startsWith(`/${locale}/`) && candidate !== path);
    assert.equal(siblingPaths.length, 4);
    for (const siblingPath of siblingPaths) assert.match(html, new RegExp(`href="${siblingPath}"`));
    assert.doesNotMatch(html, new RegExp(`href="${path}"`));
  }
});

test('未定義SEOパスは通常ルーティングへ戻す', () => {
  assert.equal(renderSeoPage('/ja/not-defined'), null);
  assert.equal(renderSeoPage('/api/config'), null);
});
