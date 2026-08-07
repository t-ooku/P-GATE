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

// ZOZOTOWN and SHOPLIST take their keyword percent-encoded as Shift_JIS, not
// UTF-8 (see src/shift-jis-url.mjs), so decodeURIComponent throws "URI
// malformed" on their links. Decode each destination with the charset that
// mall actually uses before asserting on the keyword.
const SHIFT_JIS_MARKETPLACES = new Set(['ZOZOTOWN_JP', 'SHOPLIST_JP']);
function decodeDestination(link) {
  if (!SHIFT_JIS_MARKETPLACES.has(link.marketplace)) {
    return decodeURIComponent(link.destination).replaceAll('+', ' ');
  }
  const bytes = [];
  const url = link.destination;
  for (let i = 0; i < url.length; i += 1) {
    if (url[i] === '%') { bytes.push(parseInt(url.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(url.charCodeAt(i));
  }
  return new TextDecoder('shift_jis').decode(Uint8Array.from(bytes)).replaceAll('+', ' ');
}

test('アパレルモールへ商品向けに圧縮した検索語を安全に引き継ぐ', () => {
  const query = '韓国っぽい 黒 クロップド丈 トップス';
  const links = buildApparelMarketplaceDestinations(query);
  assert.deepEqual(links.map((item) => item.marketplace), [
    'ZOZOTOWN_JP', 'SHOPLIST_JP', 'MUSINSA_JP', 'BUYMA_JP', 'SNKRDUNK_JP'
  ]);
  for (const link of links) {
    assert.equal(new URL(link.destination).protocol, 'https:');
    const decoded = decodeDestination(link);
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
      const decoded = decodeDestination(link);
      assert.match(decoded, /軽量/);
      assert.match(decoded, /バッグ/);
      assert.doesNotMatch(decoded, /想找|찾고 있어요/);
    }
  }
});

test('アパレル以外の検索でも10モール目標のため追加5モールを表示する', () => {
  // 2026-08-07 instructions #8: all ten marketplaces stay searchable on every
  // query now, not just apparel-looking ones - isApparelSearch remains for
  // other callers, but no longer gates this list.
  const links = buildApparelMarketplaceDestinations('USB充電の写真プリンター');
  assert.deepEqual(links.map((item) => item.marketplace), [
    'ZOZOTOWN_JP', 'SHOPLIST_JP', 'MUSINSA_JP', 'BUYMA_JP', 'SNKRDUNK_JP'
  ]);
  assert.deepEqual(buildApparelMarketplaceDestinations(''), []);
});

// 2026-08-07 実機報告: 「夏用、丈長め、おしゃれ、ブラウス」で検索したら
// SHEIN に「白 トップス」として届いていた。
//
// GENERIC_PRODUCTS は広いカテゴリ名しか知らないため「ブラウス」は「トップス」
// に潰れ、ユーザーが打った中で最も絞り込みに効く語がちょうど消える。
// ensureApparelProductTypeTerm という復元処理は前からあったが Amazon と楽天に
// しか適用されておらず、SHEIN・Qoo10・アパレル5モールは素通しだった。
test('具体的な衣類名がすべてのモールの検索語に残る', async () => {
  const { buildApparelMarketplaceDestinations } = await import('../src/apparel-marketplaces.mjs');
  const { buildSheinSearchDestination, buildQoo10SearchDestination } = await import('../src/index.mjs');

  for (const query of ['夏用、丈長め、おしゃれ、ブラウス', '白 ブラウス']) {
    assert.match(decodeURIComponent(buildSheinSearchDestination(query)), /ブラウス/, `SHEIN: ${query}`);
    assert.match(decodeURIComponent(buildQoo10SearchDestination(query)), /ブラウス/, `Qoo10: ${query}`);
    for (const link of buildApparelMarketplaceDestinations(query)) {
      assert.match(decodeDestination(link), /ブラウス/, `${link.marketplace}: ${query}`);
    }
  }
  // カットソーは GENERIC_PRODUCTS に無く、復元しないと完全に消える語
  for (const link of buildApparelMarketplaceDestinations('カットソー レディース')) {
    assert.match(decodeDestination(link), /カットソー/, link.marketplace);
  }
});
