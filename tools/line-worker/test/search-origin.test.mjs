import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSearchOrigin, orderMarketplaceDestinations, preferredMarketplaceOrder } from '../src/search-origin.mjs';
import { marketplaceSearchDestinations } from '../src/index.mjs';

// 2026-09-03 指示書 §5/§7: 「どこで見たか」は商品語ではなく出所。検索語から外し、
// モール導線の先頭を出所と韓国系の手がかりで決める。

test('「<出所>で見た…」は商品語から外れ、出所だけが残る', () => {
  assert.deepEqual(extractSearchOrigin('Instagramで見たマットレス'), { query: 'マットレス', origin: 'INSTAGRAM', korean: false, stripped: true });
  assert.equal(extractSearchOrigin('Amazonで見た収納用品').query, '収納用品');
  assert.equal(extractSearchOrigin('Amazonで見た収納用品').origin, 'AMAZON');
  assert.equal(extractSearchOrigin('SHEINで見たワンピース').origin, 'SHEIN');
  assert.equal(extractSearchOrigin('TikTokで流れてきた白いスニーカー').query, '白いスニーカー');
  assert.equal(extractSearchOrigin('Xで見た透明なイヤホン').query, '透明なイヤホン');
  assert.equal(extractSearchOrigin('Qoo10 韓国リップ').query, '韓国リップ');
  assert.equal(extractSearchOrigin('Qoo10で見た韓国リップ').korean, true);
});

test('出所を外すと空になる文・商品名に含まれる語は壊さない', () => {
  assert.equal(extractSearchOrigin('インスタで見たやつ').query, 'インスタで見たやつ');
  assert.equal(extractSearchOrigin('iPhone X ケース').query, 'iPhone X ケース');
  assert.equal(extractSearchOrigin('Xperia ケース').origin, '');
  assert.equal(extractSearchOrigin('コアラマットレス').stripped, false);
  assert.equal(extractSearchOrigin('自立する本革トートバッグ').query, '自立する本革トートバッグ');
});

test('モール順は出所・韓国系で変わり、手がかりが無ければ従来順', () => {
  assert.deepEqual(preferredMarketplaceOrder({}), ['AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP', 'QOO10_JP', 'SHEIN_JP']);
  assert.equal(preferredMarketplaceOrder({ origin: 'INSTAGRAM', korean: true })[0], 'QOO10_JP');
  assert.equal(preferredMarketplaceOrder({ origin: 'SHEIN' })[0], 'SHEIN_JP');
  assert.equal(preferredMarketplaceOrder({ origin: 'INSTAGRAM' })[1], 'QOO10_JP');
  const env = { AMAZON_ASSOCIATE_TAG: 'hoshilu00-22' };
  const plain = marketplaceSearchDestinations('韓国リップ', env).map((item) => item.marketplace);
  assert.deepEqual(plain.slice(0, 5), ['AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP', 'QOO10_JP', 'SHEIN_JP']);
  const korean = marketplaceSearchDestinations('韓国リップ', env, { sourceOrigin: 'QOO10', korean: true }).map((item) => item.marketplace);
  assert.deepEqual(korean.slice(0, 5), ['QOO10_JP', 'AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP', 'SHEIN_JP']);
  assert.deepEqual(new Set(plain), new Set(korean), '順序が変わっても導線は1つも消えない');
  assert.deepEqual(orderMarketplaceDestinations([{ marketplace: 'ZOZOTOWN_JP' }, { marketplace: 'SHEIN_JP' }], { origin: 'SHEIN' }).map((i) => i.marketplace), ['SHEIN_JP', 'ZOZOTOWN_JP']);
});
