import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildApparelMarketplaceDestinations,
  isApparelSearch
} from '../src/apparel-marketplaces.mjs';

test('アパレルの曖昧な日本語・英語・トレンド表現を判定する', () => {
  assert.equal(isApparelSearch('韓国っぽい短い丈のトップス'), true);
  assert.equal(isApparelSearch('海外ガール風 black dress'), true);
  assert.equal(isApparelSearch('推し活で使える写真プリンター'), false);
});

test('主力4アパレルモールへ全文を安全に引き継ぐ', () => {
  const query = '韓国っぽい 黒 クロップド丈 トップス';
  const links = buildApparelMarketplaceDestinations(query);
  assert.deepEqual(links.map((item) => item.marketplace), [
    'ZOZOTOWN_JP', 'SHOPLIST_JP', 'MUSINSA_JP', 'BUYMA_JP'
  ]);
  for (const link of links) {
    assert.equal(new URL(link.destination).protocol, 'https:');
    assert.match(decodeURIComponent(link.destination).replaceAll('+', ' '), /韓国っぽい 黒 クロップド丈 トップス/);
  }
});

test('アパレル以外には追加モールを表示しない', () => {
  assert.deepEqual(buildApparelMarketplaceDestinations('USB充電の写真プリンター'), []);
});
