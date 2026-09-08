import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apparelFacetDimensions,
  apparelMarketplaceKeywords,
  apparelSearchFacets
} from '../src/apparel-search-intelligence.mjs';

test('若者の曖昧な系統・形・色・カテゴリを商品条件へ分解する', () => {
  const facets = apparelSearchFacets('SNSで見た韓国ストリートっぽい黒の短い丈のトップス');
  assert.equal(facets.style[0].id, 'korean-street');
  assert.equal(facets.category[0].id, 'tops');
  assert.equal(facets.silhouette[0].id, 'cropped');
  assert.equal(facets.color[0].id, 'black');
  assert.equal(apparelMarketplaceKeywords('SNSで見た韓国ストリートっぽい黒の短い丈のトップス'),
    '韓国ストリート トップス クロップド丈 黒');
});

test('日本語と英語が混ざった海外ガール検索を保持する', () => {
  const keywords = apparelMarketplaceKeywords('海外ガール風 silver mini bag');
  assert.match(keywords, /海外ガール/);
  assert.match(keywords, /バッグ/);
  assert.match(keywords, /ミニ丈/);
  assert.match(keywords, /シルバー/);
});

test('検索辞書は5軸を提供し、不明な表現は原文へ戻す', () => {
  assert.deepEqual(apparelFacetDimensions, ['style', 'category', 'silhouette', 'detail', 'color']);
  assert.equal(apparelMarketplaceKeywords('不思議な雰囲気のもの'), '不思議な雰囲気のもの');
});
