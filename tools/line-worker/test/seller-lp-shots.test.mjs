import test from 'node:test';
import assert from 'node:assert/strict';
import { LP_SHOTS, SAMPLE_QUERY } from '../scripts/build-seller-lp-shots.mjs';
import { PHOTO_SELECTORS } from '../scripts/build-social-screens.mjs';

// 2026-10-16 大隆さん指示「セラー募集のLPに、ホシルの推し機能を実際の画像で。表示できない部分はぼかせばよい」
test('出品者向けページの実画像: 4 画面とも商品の価格をぼかす設定で、検索語は固定の見本', () => {
  assert.deepEqual(LP_SHOTS.map((shot) => shot.id), ['search', 'results', 'buzz', 'drops']);
  for (const shot of LP_SHOTS) {
    assert.notEqual(shot.mask, false, `${shot.id} は価格をぼかす`);
    assert.ok(shot.maxHeight <= 1100, shot.id);
    assert.match(shot.url, /^\//u);
  }
  assert.doesNotMatch(SAMPLE_QUERY, /\d|円|%/u);
  // 検索結果の商品写真にも下帯ぼかしを掛ける
  assert.ok(PHOTO_SELECTORS.includes('.product-image-gallery'));
});

test('出品者向けページ: 第一画面と「実際の画面」に本番の実画面を載せ、撮れていない画像は枠ごと外す', async () => {
  const { readFileSync } = await import('node:fs');
  const { applyPromoPlansToPublicPage } = await import('../src/seller-promo-public-pages.mjs');
  const html = readFileSync(new URL('../public/for-sellers.html', import.meta.url), 'utf8');
  for (const page of [html, applyPromoPlansToPublicPage('/for-sellers', html)]) {
    assert.match(page, /<figure class="seller-hero-real">[\s\S]*?\/for-sellers-shots\/results\.jpg/u, '第一画面に検索結果の実画面');
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
  assert.match(js, /\.real-screen img, \.seller-hero-real img/u);
});
