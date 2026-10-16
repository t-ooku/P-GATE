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
