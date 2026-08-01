import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSeoPage, seoPagePaths } from '../src/seo-pages.mjs';

test('日英SEO必須12ページを別URLで提供する', () => {
  assert.equal(seoPagePaths.length, 12);
  for (const path of seoPagePaths) {
    const html = renderSeoPage(path);
    assert.match(html, /<link rel="canonical" href="https:\/\/hoshilu\.app\//);
    assert.match(html, /<meta property="og:image" content="https:\/\/hoshilu\.app\/og\/hoshilu-x-v3\.png">/);
    assert.match(html, /<meta property="og:image:width" content="1200">/);
    assert.match(html, /<meta property="og:image:height" content="630">/);
    assert.match(html, /<meta property="og:locale" content="(?:ja_JP|en_US)">/);
    assert.match(html, /primaryImageOfPage/);
    assert.match(html, /hreflang="ja"/);
    assert.match(html, /hreflang="en"/);
    assert.match(html, /hreflang="x-default"/);
    assert.match(html, /<form action="\/" method="get"[^>]*>/);
    assert.match(html, /<details>/);
    assert.match(html, /<ol><li>[^<]+<\/li><li>[^<]+<\/li><li>[^<]+<\/li><\/ol>/);
    assert.match(html, /data-growth-cta/);
    assert.match(html, /application\/ld\+json/);
    assert.match(html, /BreadcrumbList/);
    assert.match(html, /FAQPage/);
    assert.match(html, /aria-current="page"/);
    assert.match(html, /aria-labelledby="related-guides"/);
    assert.match(html, /growth-analytics\.mjs/);
    assert.doesNotMatch(html, /Amazon公式|楽天公式|Qoo10公式|SHEIN公式/);
  }
});

test('each guide provides three localized, actionable search steps', () => {
  for (const path of seoPagePaths) {
    const html = renderSeoPage(path);
    const list = html.match(/<ol>([\s\S]*?)<\/ol>/)?.[1] ?? '';
    assert.equal(list.match(/<li>/g)?.length, 3, path);
    assert.match(html, path.startsWith('/ja/') ? /探すときの3ステップ/ : /Three steps to search/);
  }
});

test('seen-product guides accurately explain text search limitations', () => {
  assert.match(renderSeoPage('/ja/find-product-seen-online'), /画像そのものを検索する機能ではありません/);
  assert.match(renderSeoPage('/en/find-product-seen-online'), /does not perform image search/);
});

test('FAQ structured data matches the visible question and answer', () => {
  const questionsByLocale = { ja: new Set(), en: new Set() };
  for (const path of seoPagePaths) {
    const html = renderSeoPage(path);
    const json = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1];
    const data = JSON.parse(json);
    const faq = data['@graph'].find((entry) => entry['@type'] === 'FAQPage');
    const entity = faq.mainEntity[0];
    const locale = path.split('/')[1];
    questionsByLocale[locale].add(entity.name);
    assert.ok(html.includes(`<summary>${entity.name}</summary>`));
    assert.ok(html.includes(`<p>${entity.acceptedAnswer.text}</p>`));
  }
  assert.equal(questionsByLocale.ja.size, 6);
  assert.equal(questionsByLocale.en.size, 6);
});

test('each SEO page links to every other guide in the same language', () => {
  for (const path of seoPagePaths) {
    const html = renderSeoPage(path);
    const [locale] = path.slice(1).split('/');
    const siblingPaths = seoPagePaths.filter((candidate) => candidate.startsWith(`/${locale}/`) && candidate !== path);
    assert.equal(siblingPaths.length, 5);
    for (const siblingPath of siblingPaths) assert.match(html, new RegExp(`href="${siblingPath}"`));
    assert.doesNotMatch(html, new RegExp(`href="${path}"`));
  }
});

test('each SEO page visibly links to its reciprocal language version', () => {
  for (const path of seoPagePaths) {
    const html = renderSeoPage(path);
    const [, locale, slug] = path.split('/');
    const alternate = locale === 'ja' ? 'en' : 'ja';
    const label = locale === 'ja' ? 'English' : '日本語';
    assert.ok(html.includes(`<a class="language-switch" href="/${alternate}/${slug}" hreflang="${alternate}" lang="${alternate}">${label}</a>`));
  }
});

test('未定義SEOパスは通常ルーティングへ戻す', () => {
  assert.equal(renderSeoPage('/ja/not-defined'), null);
  assert.equal(renderSeoPage('/api/config'), null);
});
