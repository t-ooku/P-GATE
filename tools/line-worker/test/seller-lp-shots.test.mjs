import test from 'node:test';
import assert from 'node:assert/strict';
import { LP_SHOTS, SAMPLE_QUERY } from '../scripts/build-seller-lp-shots.mjs';
import { PHOTO_SELECTORS, PR_SAMPLE_SHOP, samplePrResponse } from '../scripts/build-social-screens.mjs';

// 2026-10-16 大隆さん指示「セラー募集のLPに、ホシルの推し機能を実際の画像で。表示できない部分はぼかせばよい」
test('出品者向けページの実画像: 5 画面とも商品の価格をぼかす設定で、検索語は固定の見本', () => {
  assert.deepEqual(LP_SHOTS.map((shot) => shot.id), ['search', 'listing', 'keep', 'buzz', 'drops']);
  for (const shot of LP_SHOTS) {
    assert.notEqual(shot.mask, false, `${shot.id} は価格をぼかす`);
    assert.ok(shot.maxHeight <= 1100, shot.id);
    assert.match(shot.url, /^\//u);
  }
  assert.doesNotMatch(SAMPLE_QUERY, /\d|円|%/u);
  // 検索結果の商品写真にも下帯ぼかしを掛ける
  assert.ok(PHOTO_SELECTORS.includes('.product-image-gallery'));
  // 掲載見本の PR 枠の写真にも下帯ぼかし
  assert.ok(PHOTO_SELECTORS.includes('.unified-pr-image'));
  assert.equal(LP_SHOTS.find((shot) => shot.id === 'listing').prSample, true);
});

// 2026-10-16 大隆さん指示「リアルな掲載見本を画面掲載して」: 本番の検索結果の先頭 2 件を、撮る画面の中だけ PR 枠へ移す
test('掲載見本: 先頭 2 件を PR 枠へ移し、店名は見本・価格は出さない。通常の列からは外して重複させない', () => {
  const body = { unified_results: {
    items: [
      { position: 1, product_name: 'スリム傘立て A', image_url: 'https://img.example/a.jpg', url: 'https://shop.example/a', listing: false },
      { position: 2, product_name: '一覧ページ', image_url: 'https://img.example/l.jpg', url: 'https://shop.example/l', listing: true },
      { position: 3, product_name: 'スリム傘立て B', image_url: 'https://img.example/b.jpg', url: 'https://shop.example/b', listing: false },
      { position: 4, product_name: 'スリム傘立て C', image_url: 'https://img.example/c.jpg', url: 'https://shop.example/c', listing: false }
    ],
    sponsored: [], price_order: [4, 3, 1, 2]
  } };
  const out = samplePrResponse(structuredClone(body), 'https://hoshilu.app');
  assert.deepEqual(out.unified_results.sponsored.map((item) => item.product_name), ['スリム傘立て A', 'スリム傘立て B']);
  for (const item of out.unified_results.sponsored) {
    assert.equal(item.label, 'PR');
    assert.equal(item.shop_name, PR_SAMPLE_SHOP);
    assert.match(item.shop_name, /見本/u);
    assert.equal(item.price_jpy, null);
    assert.equal(item.url, 'https://hoshilu.app/for-sellers', '他店の販売ページへは飛ばさない');
  }
  assert.deepEqual(out.unified_results.items.map((item) => item.position), [2, 4]);
  assert.deepEqual(out.unified_results.price_order, [4, 2]);
  // 応答に一覧が無いときは何もしない
  assert.deepEqual(samplePrResponse({ ok: true }), { ok: true });
});

test('出品者向けページ: 第一画面に掲載見本、「実際の画面」「呼び戻す」「相談フォーム」にも本番の実画面を載せ、撮れていない画像は枠ごと外す', async () => {
  const { readFileSync } = await import('node:fs');
  const { applyPromoPlansToPublicPage } = await import('../src/seller-promo-public-pages.mjs');
  const html = readFileSync(new URL('../public/for-sellers.html', import.meta.url), 'utf8');
  for (const page of [html, applyPromoPlansToPublicPage('/for-sellers', html)]) {
    assert.match(page, /<figure class="seller-hero-real">[\s\S]*?\/for-sellers-shots\/listing\.jpg" data-fallback="\/for-sellers-shots\/results\.jpg"/u, '第一画面に掲載見本（撮れるまでは検索結果の実画面）');
    assert.match(page, /PR枠の商品は見本です/u, '見本と明記');
    assert.doesNotMatch(page, /seller-pr-visual/u, '灰色の箱の図は使わない');
    for (const shot of LP_SHOTS) assert.ok(page.includes(`/for-sellers-shots/${shot.id}.jpg`), shot.id);
    // 画像の説明（alt）は空にしない。説明文に他店の価格・割引率を書かない
    const section = page.match(/<section class="real-screens"[\s\S]*?<\/section>/u)?.[0] || '';
    assert.ok(section);
    assert.doesNotMatch(section, /alt=""/u);
    assert.doesNotMatch(section.replace(/<[^>]+>/gu, ''), /\d[\d,]*\s?円|\d+\s?[%％]|最安|必ず|保証します/u);
    assert.match(page, /for-sellers-real\.css/u);
  }
  const js = readFileSync(new URL('../public/for-sellers.js', import.meta.url), 'utf8');
  assert.match(js, /\.real-screen img, \.seller-hero-real img, \.seller-sample-real img/u);
  assert.match(js, /data-fallback/u);
});
