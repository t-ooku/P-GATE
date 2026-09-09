// 2026-09-06 大隆さん指摘:「ショップの中の詳細条件がメルカリやAmazonのような検索方法に
// なってない。改善して」。価格・評価は本番D1に入っていない(marketplace_offers は0件)ので、
// いま本当に効く絞り込み=商品名から作る「絞り込みワード」と、メーカーの複数選択を検証する。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  queryWords, shopAttributeDefinition, shopAttributeFacets, shopKeywordTokens,
  shopKeywordFacets, shopTitleMatchesAttributes, toggleKeywordInQuery
} from '../src/shop-facets.mjs';

test('商品名から、絞り込みに使える語だけを取り出す', () => {
  const tokens = shopKeywordTokens('サーモス 水筒 真空断熱ケータイマグ 500ml ブラック 送料無料');
  assert.ok(tokens.includes('サーモス'));
  assert.ok(tokens.includes('500ml'));
  assert.ok(tokens.includes('ブラック'));
  // 売り文句は絞り込みにならないので落とす
  assert.ok(!tokens.includes('送料無料'));
  assert.equal(shopKeywordTokens('').length, 0);
});

test('よく出てくる語だけをチップにし、全件に出る語は落とす', () => {
  const titles = [
    'サーモス 水筒 真空断熱 500ml ブラック',
    'サーモス 水筒 真空断熱 600ml ホワイト',
    'タイガー 水筒 真空断熱 500ml ピンク',
    'ピーコック 水筒 保冷 350ml ブラック'
  ];
  const facets = shopKeywordFacets(titles, { exclude: ['水筒'], limit: 5 });
  const words = facets.map((facet) => facet.word);
  assert.ok(words.includes('真空断熱'));
  assert.ok(words.includes('500ml'));
  // 検索語そのもの(と、それを含む語)は出さない
  assert.ok(!words.includes('水筒'));
  // 1件しか無い語は押しても意味がないので出さない
  assert.ok(!words.includes('ピーコック'));
  // 総数が分かるときは、見えている件数から目安を伸ばす
  const scaled = shopKeywordFacets(titles, { exclude: ['水筒'], total: 40 });
  assert.ok(scaled.every((facet) => facet.estimated === true));
  assert.ok(scaled[0].count > 3);
});

test('絞り込みワードは検索語に足す・外すができ、二重に足さない', () => {
  assert.equal(toggleKeywordInQuery('水筒', '保温'), '水筒 保温');
  assert.equal(toggleKeywordInQuery('水筒 保温', '保温'), '水筒');
  assert.equal(toggleKeywordInQuery('水筒　保温', '500ml'), '水筒 保温 500ml');
  assert.deepEqual(queryWords(' 水筒　保温 '), ['水筒', '保温']);
});

test('商品名に実在する色・サイズ・素材だけを詳細検索候補にする', () => {
  const facets = shopAttributeFacets([
    '本革トートバッグ ホワイト A4',
    'ナイロンリュック ブラック Mサイズ',
    'ステンレスボトル ブルー 500 ml'
  ]);
  assert.deepEqual(facets.colors.map((item) => item.value), ['black', 'blue', 'white']);
  assert.deepEqual(facets.sizes.map((item) => item.value).sort(), ['500ml', 'A4', 'Mサイズ'].sort());
  assert.deepEqual(facets.materials.map((item) => item.value).sort(), ['leather', 'nylon', 'stainless']);
  assert.equal(shopTitleMatchesAttributes('本革トートバッグ ホワイト A4', { color: 'white', size: 'A4', material: 'leather' }), true);
  assert.equal(shopTitleMatchesAttributes('ナイロンリュック ブラック Mサイズ', { color: 'white' }), false);
  assert.equal(shopAttributeDefinition('color', 'not-a-color'), null);
  assert.equal(shopAttributeDefinition('size', '好きな文字列'), null);
});
