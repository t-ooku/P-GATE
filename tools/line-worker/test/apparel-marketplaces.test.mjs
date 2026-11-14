import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildApparelMarketplaceDestinations,
  isApparelSearch
} from '../src/apparel-marketplaces.mjs';

test('アパレルの曖昧な日本語・英語・トレンド表現を判定する', () => {
  assert.equal(isApparelSearch('韓国っぽい短い丈のトップス'), true);
  assert.equal(isApparelSearch('海外ガール風 black dress'), true);
  assert.equal(isApparelSearch('想找黑色连衣裙'), true);
  assert.equal(isApparelSearch('검은색 원피스를 찾고 있어요'), true);
  assert.equal(isApparelSearch('推し活で使える写真プリンター'), false);
});

test('アパレルモールへ商品向けに圧縮した検索語を安全に引き継ぐ', () => {
  const query = '韓国っぽい 黒 クロップド丈 トップス';
  const links = buildApparelMarketplaceDestinations(query);
  assert.deepEqual(links.map((item) => item.marketplace), [
    'ZOZOTOWN_JP', 'SHOPLIST_JP', 'MUSINSA_JP', 'BUYMA_JP', 'SNKRDUNK_JP'
  ]);
  for (const link of links) {
    assert.equal(new URL(link.destination).protocol, 'https:');
    const decoded = decodeURIComponent(link.destination).replaceAll('+', ' ');
    assert.match(decoded, /韓国風/);
    assert.match(decoded, /黒/);
    assert.match(decoded, /トップス/);
    assert.doesNotMatch(decoded, /っぽい|丈/);
  }
});

test('中国語・韓国語の自然文もアパレル判定し正規化した検索語を渡す', () => {
  for (const query of ['想找轻量黑色手提包', '가벼운 갈색 가방을 찾고 있어요']) {
    const links = buildApparelMarketplaceDestinations(query);
    assert.equal(links.length, 5);
    for (const link of links) {
      const decoded = decodeURIComponent(link.destination).replaceAll('+', ' ');
      assert.match(decoded, /軽量/);
      assert.match(decoded, /バッグ/);
      assert.doesNotMatch(decoded, /想找|찾고 있어요/);
    }
  }
});

test('アパレル以外には追加モールを表示しない', () => {
  assert.deepEqual(buildApparelMarketplaceDestinations('USB充電の写真プリンター'), []);
});
