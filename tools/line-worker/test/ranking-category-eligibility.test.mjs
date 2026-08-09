import test from 'node:test';
import assert from 'node:assert/strict';
import { filterRankingCategoryCandidates, isRankingCategoryEligible } from '../src/ranking-category-eligibility.mjs';

const category = { id: 'handheld_fan', label: 'ハンディファン' };

test('ランキング候補は関連レコメンドを価格評価の前に除外する', () => {
  assert.equal(isRankingCategoryEligible({
    product_name: 'ハンディファンと一緒に使えるスマホストラップ',
    related_category: 'スマホストラップ', recommendation_reason: '一緒に使える関連商品'
  }, category), false);
});

test('SEOハッシュタグに小ジャンル名があるだけの商品はランキングへ入れない', () => {
  assert.equal(isRankingCategoryEligible({ product_name: 'USB充電器 急速20W #ハンディファン #夏' }, category), false);
});

test('小ジャンル名を含む専用アクセサリーは商品本体として扱わない', () => {
  assert.equal(isRankingCategoryEligible({ product_name: 'ハンディファン用 交換ストラップ' }, category), false);
});

test('構造化情報がない関連商品も商品名の主語がアクセサリーなら除外する', () => {
  assert.equal(isRankingCategoryEligible({ product_name: 'スマホストラップ ハンディファンと一緒におすすめ' }, category), false);
});

test('商品本体と公式カテゴリ確認済み候補はAPI接続有無に関係なく残す', () => {
  const result = filterRankingCategoryCandidates([
    { product_name: '静音ハンディファン 5段階' },
    { product_name: '商品名表記が異なる本体', ranking_category_verified: true },
    { product_name: 'スマホ充電器 #ハンディファン' }
  ], category);
  assert.deepEqual(result.map((item) => item.product_name), ['静音ハンディファン 5段階', '商品名表記が異なる本体']);
});
