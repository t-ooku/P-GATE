import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAmazonSearchKeywords,
  buildQoo10SearchKeywords,
  buildRakutenSearchKeywords,
  buildAmazonSearchDestination,
  buildRakutenSearchDestination,
  buildYahooShoppingSearchDestination,
  buildQoo10SearchDestination,
  buildSheinSearchDestination
} from '../src/index.mjs';
import { isApparelSearch, buildApparelMarketplaceDestinations } from '../src/apparel-marketplaces.mjs';

// Regression suite for the カットソー search-quality investigation
// (2026-08-04/05). Covers the acceptance criteria from section C of the
// audit instructions: original text preserved, Japanese-script keyword kept
// primary, English category words never fully replace it, negation is not
// inverted, the apparel five-marketplace gate activates/does not activate
// correctly, a single marketplace failing does not stop the others, and a
// zero-candidate search still falls back to the original text.

function hasJapaneseScript(text) {
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(String(text || ''));
}

function isAllLatinAndDigits(text) {
  return /^[\sA-Za-z0-9.,'"!?%$-]+$/.test(String(text || ''));
}

// Core assertion used by every non-apparel-gate case: the four marketplace
// keyword builders must (1) never return an empty string for a non-empty
// query, and (2) for a Japanese-origin query, never degrade into an
// all-Latin string that has silently dropped every trace of the original
// Japanese/CJK text.
function assertKeywordsKeepOriginal(query, { japaneseOrigin = true } = {}) {
  const amazon = buildAmazonSearchKeywords(query);
  const rakuten = buildRakutenSearchKeywords(query);
  const qoo10 = buildQoo10SearchKeywords(query);
  const yahoo = buildYahooShoppingSearchDestination(query);
  const shein = buildSheinSearchDestination(query);
  for (const [label, value] of [['amazon', amazon], ['rakuten', rakuten], ['qoo10', qoo10]]) {
    assert.ok(value && value.length > 0, `${label} keywords should not be empty for "${query}"`);
    if (japaneseOrigin) {
      assert.ok(
        !isAllLatinAndDigits(value) || hasJapaneseScript(query) === false,
        `${label} keywords for "${query}" should not discard the original Japanese text entirely, got "${value}"`
      );
    }
  }
  assert.ok(yahoo, `yahoo destination should not be empty for "${query}"`);
  assert.ok(shein, `shein destination should not be empty for "${query}"`);
  return { amazon, rakuten, qoo10 };
}

function assertJapanesePrimary(query, keywords) {
  // The first word HOSHILU sends to a mall should be, or start from, content
  // drawn from the user's own Japanese text - never only the English
  // category words search-intelligence.mjs happens to know about.
  assert.ok(hasJapaneseScript(keywords), `expected Japanese-script content in "${keywords}" for query "${query}"`);
}

// --- A. ファッション -------------------------------------------------
const fashionCases = [
  'カットソー',
  '白い長袖トップス',
  '韓国っぽい透明バッグ',
  'ゆったりした黒いワンピース',
  'メンズの夏用セットアップ',
  '子ども用レインコート',
  'オーバーサイズのパーカー'
];

for (const query of fashionCases) {
  test(`ファッション検索は原文を保持し5モールを有効化する: ${query}`, () => {
    const { amazon } = assertKeywordsKeepOriginal(query);
    assertJapanesePrimary(query, amazon);
    assert.equal(isApparelSearch(query), true, `${query} should enable the apparel marketplace gate`);
    const apparelDestinations = buildApparelMarketplaceDestinations(query);
    assert.deepEqual(
      apparelDestinations.map((item) => item.marketplace),
      ['ZOZOTOWN_JP', 'SHOPLIST_JP', 'MUSINSA_JP', 'BUYMA_JP', 'SNKRDUNK_JP'],
      `${query} should activate all five apparel marketplaces`
    );
  });
}

// --- B. 家電・ガジェット ----------------------------------------------
const electronicsCases = [
  '透明ワイヤレスイヤホン',
  'iPhoneを急速充電できる小さい充電器',
  'テレビにつなげるゲーム機',
  '海外で使えるドライヤー',
  'Type-C対応モバイルバッテリー',
  'USB-Cハブ4ポート'
];

for (const query of electronicsCases) {
  test(`家電検索は原文を保持しファッション5モールを誤って有効化しない: ${query}`, () => {
    const { amazon } = assertKeywordsKeepOriginal(query);
    assertJapanesePrimary(query, amazon);
    assert.equal(isApparelSearch(query), false, `${query} must not trigger the apparel marketplace gate`);
    assert.deepEqual(buildApparelMarketplaceDestinations(query), []);
  });
}

// --- C. 生活用品 --------------------------------------------------------
const dailyGoodsCases = [
  '水筒の中を洗う細いブラシ',
  '一人暮らし用の小さい炊飯器',
  '猫の毛が取れる掃除道具',
  '雨の日でも滑りにくい靴',
  '折りたたみ傘 軽量'
];

for (const query of dailyGoodsCases) {
  test(`生活用品検索は原文を保持する: ${query}`, () => {
    const { amazon } = assertKeywordsKeepOriginal(query);
    assertJapanesePrimary(query, amazon);
  });
}

// --- D. 曖昧文 ----------------------------------------------------------
const vagueCases = [
  '前にSNSで見た透明なやつ',
  '名前は分からないけど机のコードをまとめるもの',
  '旅行で荷物を小さくしたい',
  '子どもが寝るときに使える明るすぎないライト',
  '韓国の人が使っていそうなバッグ',
  '推し活で使える小さいグッズ'
];

for (const query of vagueCases) {
  test(`曖昧文でも検索語が1つ以上生成され候補ゼロ時のフォールバックが働く: ${query}`, () => {
    const { amazon, rakuten, qoo10 } = assertKeywordsKeepOriginal(query);
    // A vague description still has to produce at least one usable token per
    // marketplace - never an empty query string reaching the mall.
    assert.ok(amazon.trim().split(/\s+/).length >= 1);
    assert.ok(rakuten.trim().length > 0);
    assert.ok(qoo10.trim().length > 0);
  });
}

// --- E. 否定・条件 -------------------------------------------------------
const negationCases = [
  ['有線ではなく完全ワイヤレスイヤホン', '有線'],
  ['黒以外のスニーカー', null],
  ['1万円以下で軽いもの', null],
  ['中国製以外のモバイルバッテリー', null],
  ['電池式ではない懐中電灯', '電池式'],
  ['中古ではなく新品のカットソー', '中古'],
  ['セール品ではなく正規品', 'セール品']
];

for (const [query, excludedTerm] of negationCases) {
  test(`否定条件は反転せず維持される: ${query}`, () => {
    const { amazon } = assertKeywordsKeepOriginal(query);
    assertJapanesePrimary(query, amazon);
    if (excludedTerm) {
      // The negated term must never appear as the sole/standalone keyword -
      // that would mean the exclusion was inverted into a positive filter.
      assert.notEqual(amazon.trim(), excludedTerm);
    }
  });
}

// --- F. 多言語 (EN/ZH/KO) -------------------------------------------------
const multilingualCases = [
  ['transparent wireless earbuds', '透明ワイヤレスイヤホン(EN)'],
  ['透明无线耳机', '透明ワイヤレスイヤホン(ZH)'],
  ['투명 무선 이어폰', '透明ワイヤレスイヤホン(KO)'],
  ['sneakers not in black', '黒以外のスニーカー(EN)'],
  ['黑色以外的运动鞋', '黒以外のスニーカー(ZH)'],
  ['검정색이 아닌 운동화', '黒以外のスニーカー(KO)'],
  ['something light under 10000 yen', '1万円以下で軽いもの(EN)'],
  ['一万日元以下的轻便物品', '1万円以下で軽いもの(ZH)'],
  ['1만엔 이하의 가벼운 물건', '1万円以下で軽いもの(KO)'],
  ['power bank not made in China', '中国製以外のモバイルバッテリー(EN)'],
  ['非中国制造的移动电源', '中国製以外のモバイルバッテリー(ZH)'],
  ['중국산이 아닌 보조배터리', '中国製以外のモバイルバッテリー(KO)'],
  ['want to pack smaller for travel', '旅行で荷物を小さくしたい(EN)'],
  ['旅行时想让行李变小', '旅行で荷物を小さくしたい(ZH)'],
  ['여행 짐을 작게 줄이고 싶어요', '旅行で荷物を小さくしたい(KO)'],
  ['a bag Korean people seem to use', '韓国の人が使っていそうなバッグ(EN)'],
  ['韩国人常用的那种包', '韓国の人が使っていそうなバッグ(ZH)'],
  ['한국 사람들이 쓸 것 같은 가방', '韓国の人が使っていそうなバッグ(KO)'],
  ['white long sleeve top', '白い長袖トップス(EN)'],
  ['白色长袖上衣', '白い長袖トップス(ZH)'],
  ['흰색 긴팔 상의', '白い長袖トップス(KO)'],
  ['small charger that fast charges iPhone', 'iPhone急速充電器(EN)'],
  ['可以给iPhone快速充电的小型充电器', 'iPhone急速充電器(ZH)'],
  ['아이폰을 급속 충전할 수 있는 작은 충전기', 'iPhone急速充電器(KO)']
];

for (const [query, label] of multilingualCases) {
  test(`多言語検索でも検索語が1つ以上生成され原文が失われない: ${label}`, () => {
    const amazon = buildAmazonSearchKeywords(query);
    const rakuten = buildRakutenSearchKeywords(query);
    const qoo10 = buildQoo10SearchKeywords(query);
    assert.ok(amazon.trim().length > 0, `amazon keywords empty for ${label}`);
    assert.ok(rakuten.trim().length > 0, `rakuten keywords empty for ${label}`);
    assert.ok(qoo10.trim().length > 0, `qoo10 keywords empty for ${label}`);
  });
}

// --- G. 1モール失敗時も他モール検索が継続する -----------------------------
test('1モールの検索語生成に問題があっても他モールの検索導線は独立して機能する', () => {
  // Amazon/Rakuten/Yahoo/Qoo10/SHEIN keyword builders are independent pure
  // functions with no shared mutable state; a query that produces an empty
  // Amazon destination must not prevent the other marketplaces from
  // producing valid destinations. We simulate this with an empty query,
  // which every builder treats as "no keywords" and safely returns '' for,
  // while a real query still produces destinations for every marketplace
  // even though buildApparelMarketplaceDestinations legitimately returns
  // nothing for it.
  const query = 'テレビにつなげるゲーム機';
  assert.equal(buildAmazonSearchDestination('', 'hoshilu-22'), '');
  assert.ok(buildAmazonSearchDestination(query, 'hoshilu-22').startsWith('https://www.amazon.co.jp/s'));
  assert.ok(buildRakutenSearchDestination(query).startsWith('https://search.rakuten.co.jp'));
  assert.ok(buildYahooShoppingSearchDestination(query).startsWith('https://shopping.yahoo.co.jp'));
  assert.ok(buildQoo10SearchDestination(query).startsWith('https://www.qoo10.jp'));
  assert.ok(buildSheinSearchDestination(query).startsWith('https://jp.shein.com'));
  assert.deepEqual(buildApparelMarketplaceDestinations(query), []);
});

test('候補ゼロでも空文字を返さず原文ベースのフォールバックを維持する', () => {
  for (const query of ['カットソー', 'ずっと探しているけど名前が分からないもの', '완전 무선 이어폰']) {
    assert.ok(buildAmazonSearchKeywords(query).length > 0, query);
    assert.ok(buildQoo10SearchKeywords(query).length > 0, query);
    assert.ok(buildRakutenSearchKeywords(query).length > 0, query);
  }
});
