import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeShiftJisPercent } from '../src/shift-jis-url.mjs';
import { buildApparelMarketplaceDestinations } from '../src/apparel-marketplaces.mjs';

// ZOZOTOWN and SHOPLIST decode their keyword parameter as Shift_JIS, not
// UTF-8 (2026-08-07, verified on the live sites: UTF-8 percent-encoding made
// "弁当 バラン" arrive as the UTF-8-read-as-Shift_JIS mojibake "蠑∝ｽ 繝舌Λ繝ｳ"
// and returned 0 items, while the Shift_JIS-encoded URL for ワンピース
// resolved to the real listing with 83,765 items). Workers' TextEncoder is
// UTF-8-only, hence the generated table this exercises.
function decodeShiftJisPercent(value) {
  const bytes = [];
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '%') { bytes.push(parseInt(value.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(value.charCodeAt(i));
  }
  return new TextDecoder('shift_jis').decode(Uint8Array.from(bytes));
}

test('Shift_JISのパーセントエンコードが往復で元の文字列に戻る', () => {
  const samples = [
    '弁当 バラン 仕切り', 'ワンピース', 'カットソー レディース 半袖 おしゃれ',
    '黒 トップス 韓国風', '一二三 日本語 業務用', 'あいうえお アイウエオ',
    '０１２ＡＢＣ、。「」・ー', 'nike', 'iPhone 16 ケース'
  ];
  for (const sample of samples) {
    assert.equal(decodeShiftJisPercent(encodeShiftJisPercent(sample)), sample, sample);
  }
});

test('実際に検証したZOZOTOWNのURLとバイト列が一致する', () => {
  // このURLをブラウザで開くとワンピース一覧(83,765件)が正しく表示されることを
  // 2026-08-07に実機確認済み。
  assert.equal(encodeShiftJisPercent('ワンピース'), '%83%8F%83%93%83%73%81%5B%83%58');
  assert.equal(encodeShiftJisPercent('弁当'), '%95%D9%93%96');
});

test('Shift_JISにない文字は落として残りを使える検索語にする', () => {
  // 置換文字を入れるとそれ自体が検索されて必ず0件になるため、落とす。
  assert.equal(decodeShiftJisPercent(encodeShiftJisPercent('バラン🍱弁当')), 'バラン弁当');
  assert.equal(encodeShiftJisPercent(''), '');
  assert.equal(encodeShiftJisPercent(null), '');
});

test('ASCIIは素通しし、区切り文字だけをエスケープする', () => {
  assert.equal(encodeShiftJisPercent('nike air'), 'nike%20air');
  assert.equal(encodeShiftJisPercent('S-M_size.1'), 'S-M_size.1');
});

test('Shift_JISを使うのはZOZOTOWNとABC-MARTで、他のモールはUTF-8のまま', () => {
  const links = buildApparelMarketplaceDestinations('弁当 バラン 仕切り');
  const byMarketplace = Object.fromEntries(links.map((link) => [link.marketplace, link.destination]));
  // Shift_JIS: 「弁当」= 95 D9 93 96
  assert.match(byMarketplace.ZOZOTOWN_JP, /p_keyv=%95%D9%93%96/);
  // UTF-8: 「弁当」= E5 BC 81 E5 BD 93
  assert.match(byMarketplace.LOFT_JP, /%E5%BC%81%E5%BD%93/);
  assert.match(byMarketplace.HANDS_JP, /%E5%BC%81%E5%BD%93/);
  assert.match(byMarketplace.BUYMA_JP, /%E5%BC%81%E5%BD%93/);
  assert.match(byMarketplace.SNKRDUNK_JP, /%E5%BC%81%E5%BD%93/);
  // マツキヨと@cosmeはUTF-8、ABC-MARTはShift_JIS。
  assert.match(byMarketplace.MATSUKIYO_JP, /search_keyword=%E5%BC%81%E5%BD%93/);
  assert.match(byMarketplace.COSME_JP, /%E5%BC%81%E5%BD%93/);
  assert.match(byMarketplace.ABCMART_JP, /keyword=%95%D9%93%96/);
  // 全モールがhttpsの正当なURLであること
  for (const link of links) assert.equal(new URL(link.destination).protocol, 'https:');
});
