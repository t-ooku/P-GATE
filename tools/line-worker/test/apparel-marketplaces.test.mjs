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

// ZOZOTOWN takes its keyword percent-encoded as Shift_JIS, not UTF-8 (see
// src/shift-jis-url.mjs), so decodeURIComponent throws "URI malformed" on its
// link. Decode each destination with the charset that mall actually uses
// before asserting on the keyword.
const SHIFT_JIS_MARKETPLACES = new Set(['ZOZOTOWN_JP']);
// 2026-08-08: @cosme SHOPPING(products/list.php?name=)とABC-MART
// (search.aspx?keyword=)は実際のキーワードパラメータをWebFetch/WebSearchで
// 特定できたため検索語を維持するようになった。一方マツキヨココカラは逆に
// 「?q=」パラメータが実際には効いていないことが確認できたため、v4.2時点の
// ような暫定ランディングページへ切り替えた(src/apparel-marketplaces.mjsの
// コメント参照)。今はこの1モールだけ検索語が含まれないことを前提にテスト
// する。
const LANDING_PAGE_ONLY_MARKETPLACES = new Set(['MATSUKIYO_JP']);
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

const EXPECTED_MARKETPLACES = [
  'ZOZOTOWN_JP', 'LOFT_JP', 'HANDS_JP', 'MATSUKIYO_JP', 'COSME_JP', 'ABCMART_JP', 'BUYMA_JP', 'SNKRDUNK_JP'
];

test('アパレルモールへ商品向けに圧縮した検索語を安全に引き継ぐ', () => {
  const query = '韓国っぽい 黒 クロップド丈 トップス';
  const links = buildApparelMarketplaceDestinations(query);
  assert.deepEqual(links.map((item) => item.marketplace), EXPECTED_MARKETPLACES);
  for (const link of links) {
    assert.equal(new URL(link.destination).protocol, 'https:');
    if (LANDING_PAGE_ONLY_MARKETPLACES.has(link.marketplace)) continue;
    const decoded = decodeDestination(link);
    assert.match(decoded, /韓国風/);
    assert.match(decoded, /黒/);
    assert.match(decoded, /トップス/);
    assert.doesNotMatch(decoded, /っぽい/);
    // 2026-08-08: ensureApparelQualifierTermsが「クロップド丈」を「ショート丈」
    // として復元するようになったため、「丈」自体は残ってよい(むしろ絞り込み
    // に有効な情報なので残すべき)。「クロップド」という原語ではなく正規化
    // 済みの「ショート丈」になっていることを確認する。
    assert.match(decoded, /ショート丈/);
  }
});

test('中国語・韓国語の自然文もアパレル判定し正規化した検索語を渡す', () => {
  for (const query of ['想找轻量黑色手提包', '가벼운 갈색 가방을 찾고 있어요']) {
    const links = buildApparelMarketplaceDestinations(query);
    assert.equal(links.length, EXPECTED_MARKETPLACES.length);
    for (const link of links) {
      if (LANDING_PAGE_ONLY_MARKETPLACES.has(link.marketplace)) continue;
      const decoded = decodeDestination(link);
      assert.match(decoded, /軽量/);
      assert.match(decoded, /バッグ/);
      assert.doesNotMatch(decoded, /想找|찾고 있어요/);
    }
  }
});

test('アパレル以外の検索でも13モール目標のため直接検索モールを表示する', () => {
  // 2026-08-07 instructions #8: every "direct" marketplace stays searchable
  // on every query now, not just apparel-looking ones - isApparelSearch
  // remains for other callers, but no longer gates this list.
  const links = buildApparelMarketplaceDestinations('USB充電の写真プリンター');
  assert.deepEqual(links.map((item) => item.marketplace), EXPECTED_MARKETPLACES);
  assert.deepEqual(buildApparelMarketplaceDestinations(''), []);
});

test('v4.2項目14: SHOPLIST/MUSINSAはこの検索導線から外れている', () => {
  const links = buildApparelMarketplaceDestinations('カットソー');
  const marketplaces = links.map((item) => item.marketplace);
  assert.ok(!marketplaces.includes('SHOPLIST_JP'));
  assert.ok(!marketplaces.includes('MUSINSA_JP'));
});

test('v4.2項目14: 新規5モールはhttps宛のロフト・ハンズ・マツキヨ・@cosme・ABC-MARTドメインを指す', () => {
  const links = buildApparelMarketplaceDestinations('カットソー');
  const byMarketplace = Object.fromEntries(links.map((item) => [item.marketplace, item.destination]));
  assert.match(byMarketplace.LOFT_JP, /^https:\/\/www\.loft\.co\.jp\//);
  assert.match(byMarketplace.HANDS_JP, /^https:\/\/hands\.net\//);
  assert.match(byMarketplace.MATSUKIYO_JP, /^https:\/\/www\.matsukiyococokara-online\.com\//);
  assert.match(byMarketplace.COSME_JP, /^https:\/\/www\.cosme\.com\//);
  assert.match(byMarketplace.ABCMART_JP, /^https:\/\/www\.abc-mart\.net\//);
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
      if (LANDING_PAGE_ONLY_MARKETPLACES.has(link.marketplace)) continue;
      assert.match(decodeDestination(link), /ブラウス/, `${link.marketplace}: ${query}`);
    }
  }
  // カットソーは GENERIC_PRODUCTS に無く、復元しないと完全に消える語
  for (const link of buildApparelMarketplaceDestinations('カットソー レディース')) {
    if (LANDING_PAGE_ONLY_MARKETPLACES.has(link.marketplace)) continue;
    assert.match(decodeDestination(link), /カットソー/, link.marketplace);
  }
});

// 2026-08-07 追加報告: 「ブラウス」を戻したあとも「トップス」が残り、モールへ
// 「ブラウス トップス」として届いていた。ユーザーはブラウスを探しているので
// あって、トップス全般を探しているわけではない。辞書が補った広いカテゴリ語は
// 具体語が取れた時点で落とす。
test('具体的な衣類名が取れたら辞書が補った広いカテゴリ語は落とす', async () => {
  const { ensureApparelProductTypeTerm } = await import('../src/apparel-query-attributes.mjs');
  assert.equal(ensureApparelProductTypeTerm('夏用、丈長め、おしゃれ、ブラウス', 'トップス'), 'ブラウス');
  assert.equal(ensureApparelProductTypeTerm('白 ブラウス', '白 トップス'), 'ブラウス 白');

  // ただし落とすのは辞書が足した分だけ。ユーザー自身が両方打ったなら両方残す。
  assert.equal(ensureApparelProductTypeTerm('カットソー トップス', 'カットソー トップス'), 'カットソー トップス');
  // 広いカテゴリ語しか打っていないなら、それが探している物なので残す。
  assert.equal(ensureApparelProductTypeTerm('トップス', 'トップス'), 'トップス');
  // 長い語句の一部として既に入っているときに前置して二重にしない。
  assert.equal(
    ensureApparelProductTypeTerm('楽で涼しいカットソー', '楽で涼しいカットソー 丈長め'),
    '楽で涼しいカットソー 丈長め'
  );
});

// 2026-08-08 再発報告: SHEIN/Qoo10/アパレル5モール(上のテスト)は2026-08-07に
// 修正されたが、Amazonは別経路(semanticSearchGroups由来のcategoryJapaneseLabels
// 補完)で「トップス」を積み直しており、「ブラウス トップス」のままだった。
// Yahoo!ショッピングは逆にensureApparelProductTypeTerm自体が一度も配線されて
// おらず、「ブラウス」が丸ごと落ちて「トップス」だけになっていた。
test('Amazon: 具体的な衣類名が取れたらcategoryJapaneseLabels補完が広いカテゴリ語を積み直さない', async () => {
  const { buildAmazonSearchKeywords } = await import('../src/index.mjs');
  for (const query of ['夏用、丈長め、おしゃれ、ブラウス', '白 ブラウス']) {
    const keywords = buildAmazonSearchKeywords(query);
    assert.match(keywords, /ブラウス/, `Amazon should keep ブラウス: ${query}`);
    assert.doesNotMatch(keywords, /トップス/, `Amazon should not re-add トップス: ${query}`);
  }
  // ユーザー自身が両方打ったなら両方残る(辞書が足した分だけを落とす)。
  assert.match(buildAmazonSearchKeywords('カットソー トップス レディース'), /トップス/);
});

// 2026-08-08 再報告: 「マツキヨ・アットコスメ・ABCマート・Instagram・
// TikTok」で検索語が維持されないとの報告を受け、実際にWebFetch/WebSearchで
// 各URLを検証した。@cosme SHOPPINGとABC-MARTは正しいパラメータ名が判明した
// ため検索語を維持するようになった一方、マツキヨは逆に「?q=」が実際には
// 何も絞り込んでいないことが確認できたため暫定ランディングページへ切り
// 替えた。この3モールの具体的なURL形式をここに固定する。
test('2026-08-08: @cosme SHOPPINGとABC-MARTは検証済みの正しいパラメータで検索語を維持する', () => {
  const links = buildApparelMarketplaceDestinations('白 長袖 ブラウス');
  const byMarketplace = Object.fromEntries(links.map((item) => [item.marketplace, item.destination]));
  // products/list.php?name= : WebFetchで実クエリ(3,106件)とダミー語(0件)
  // で結果件数が変わることを確認済み。旧実装のproducts/search.phpは
  // キーワードを一切受け付けない静的ページだった。
  const cosmeUrl = new URL(byMarketplace.COSME_JP);
  assert.equal(cosmeUrl.pathname, '/products/list.php');
  assert.match(cosmeUrl.searchParams.get('name'), /ブラウス/);
  // search.aspx?keyword= : WebSearchでwww.abc-mart.net自身が同じ形式の
  // search.aspx?keyword=... URLを実際に検索エンジンにインデックスさせて
  // いることを確認済み(ライブの差分検証はabc-mart.netがWebFetchを403で
  // 拒否するため未実施 - 確度はマツキヨ・@cosmeほど高くない)。
  const abcmartUrl = new URL(byMarketplace.ABCMART_JP);
  assert.equal(abcmartUrl.pathname, '/shop/goods/search.aspx');
  assert.match(abcmartUrl.searchParams.get('keyword'), /ブラウス/);
});

test('2026-08-08: マツキヨは「?q=」パラメータが実際には効いていないことを確認し、暫定ランディングページへ戻した', () => {
  const links = buildApparelMarketplaceDestinations('白 長袖 ブラウス');
  const matsukiyo = links.find((item) => item.marketplace === 'MATSUKIYO_JP');
  assert.equal(matsukiyo.destination, 'https://www.matsukiyococokara-online.com/store/catalogsearch/result/');
  assert.doesNotMatch(matsukiyo.destination, /\?/);
});

test('Yahoo!ショッピング: 具体的な衣類名がブラウス→トップスに潰れず検索語・API候補の両方に残る', async () => {
  const { buildYahooShoppingSearchDestination, buildMarketplaceApiKeywordCandidates } =
    await import('../src/index.mjs');
  const { buildMarketplaceSearchKeywords } = await import('../public/marketplace-search-keywords-v2.mjs');
  const { ensureApparelProductTypeTerm } = await import('../src/apparel-query-attributes.mjs');
  for (const query of ['夏用、丈長め、おしゃれ、ブラウス', '白 ブラウス']) {
    const destination = decodeURIComponent(buildYahooShoppingSearchDestination(query));
    assert.match(destination, /ブラウス/, `Yahoo destination should keep ブラウス: ${query}`);

    // /api/knowledge のYahooカタログAPI検索経路が使う候補配列も同様に確認する
    // (marketplace-search-mode.mjs 相当の内部呼び出しをそのまま再現)。
    const primaryKeywords = ensureApparelProductTypeTerm(query, buildMarketplaceSearchKeywords(query));
    const candidates = buildMarketplaceApiKeywordCandidates(query, primaryKeywords);
    assert.ok(candidates.some((candidate) => candidate.includes('ブラウス')), `Yahoo API candidates should include ブラウス: ${query}`);
  }
});

// 2026-08-08 再報告: 「ブラウス 夏用 丈長め おしゃれ」で検索すると、Amazon
// 以外のモールの検索窓が「ブラウス」だけになっていた。2026-08-07の修正
// (ensureApparelProductTypeTerm)は商品名詞(ブラウス)だけを復元しており、
// marketplace-search-keywords-v2.mjsのGENERIC_ATTRIBUTESにはアパレル用の
// 季節・スタイル・丈の語彙が元々1つも登録されていなかったため、「夏用」
// 「丈長め」「おしゃれ」はどの語も一切拾われていなかった。
// ensureApparelQualifierTerms(新設)がこれらを復元する。
test('2026-08-08: 「ブラウス 夏用 丈長め おしゃれ」の季節・丈・スタイル語が全モールの検索語に残る', async () => {
  const { buildAmazonSearchKeywords, buildRakutenSearchKeywords, buildQoo10SearchKeywords,
    buildSheinSearchDestination, buildYahooShoppingSearchDestination } = await import('../src/index.mjs');
  const query = 'ブラウス 夏用 丈長め おしゃれ';

  const amazon = buildAmazonSearchKeywords(query);
  const rakuten = buildRakutenSearchKeywords(query);
  const qoo10 = buildQoo10SearchKeywords(query);
  const shein = decodeURIComponent(buildSheinSearchDestination(query));
  const yahoo = decodeURIComponent(buildYahooShoppingSearchDestination(query));

  for (const [name, keywords] of [['Amazon', amazon], ['Rakuten', rakuten], ['Qoo10', qoo10], ['SHEIN', shein], ['Yahoo', yahoo]]) {
    assert.match(keywords, /ブラウス/, `${name} should keep ブラウス, got "${keywords}"`);
    // 「夏用」はUSE_CASE_PATTERNSの正規化ラベル「涼しい」として復元される
    assert.match(keywords, /涼しい/, `${name} should restore 夏用→涼しい, got "${keywords}"`);
    assert.match(keywords, /おしゃれ/, `${name} should keep おしゃれ, got "${keywords}"`);
    // 「丈長め」はLENGTH_PATTERNSの正規化ラベル「ロング丈」として復元される
    assert.match(keywords, /ロング丈/, `${name} should restore 丈長め→ロング丈, got "${keywords}"`);
    // 単語1つ(「ブラウス」だけ)に潰れていないこと自体も確認する
    assert.notEqual(keywords.trim(), 'ブラウス', `${name} should not collapse to just ブラウス`);
  }
});

test('2026-08-08: 個別に探す10モールでも同じ季節・丈・スタイル語が維持される(マツキヨを除く)', async () => {
  const query = 'ブラウス 夏用 丈長め おしゃれ';
  const links = buildApparelMarketplaceDestinations(query);
  for (const link of links) {
    if (LANDING_PAGE_ONLY_MARKETPLACES.has(link.marketplace)) continue;
    const decoded = decodeDestination(link);
    assert.match(decoded, /涼しい/, `${link.marketplace} should restore 夏用→涼しい`);
    assert.match(decoded, /ロング丈/, `${link.marketplace} should restore 丈長め→ロング丈`);
    assert.match(decoded, /おしゃれ/, `${link.marketplace} should keep おしゃれ`);
  }
});

test('2026-08-08: ensureApparelQualifierTermsは既に同じ内容が表現済みの語を重複して足さない', async () => {
  const { ensureApparelQualifierTerms } = await import('../src/apparel-query-attributes.mjs');
  // 「丈長め」がすでに原文のまま残っているテキストに、正規化ラベル
  // 「ロング丈」を重複して足さない(足すと「丈長めで...ロング丈」という
  // 同じ意味の繰り返しになり、モール側の検索語をいたずらに長くするだけ)。
  const alreadyPhrased = '楽で涼しいカットソー 丈長めで色は白系 女性向けおしゃれ';
  assert.equal(ensureApparelQualifierTerms(alreadyPhrased, alreadyPhrased), alreadyPhrased);
});

test('2026-08-08: ensureApparelQualifierTermsはアパレル商品種別が無いクエリには何も足さない', async () => {
  const { ensureApparelQualifierTerms } = await import('../src/apparel-query-attributes.mjs');
  // 「夏用」「おしゃれ」に相当する語がクエリに含まれていても、アパレルの
  // 具体的な商品種別(ブラウス等)が無ければ、無関係なカテゴリ(この例では
  // 加湿器)へアパレル語彙を注入しない。
  const query = '夏用 おしゃれ 小型加湿器';
  assert.equal(ensureApparelQualifierTerms(query, '小型加湿器'), '小型加湿器');
});
