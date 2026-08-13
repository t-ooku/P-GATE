import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAmazonSearchKeywords, marketplaceSearchDestinations } from '../src/index.mjs';
import { encodeShiftJisPercent } from '../src/shift-jis-url.mjs';

function decodedSearchQuery(item) {
  const url = new URL(item.destination);
  switch (item.marketplace) {
    case 'AMAZON_JP': return url.searchParams.get('k');
    case 'RAKUTEN_JP': return decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1));
    case 'YAHOO_JP': return url.searchParams.get('p');
    case 'QOO10_JP': return url.searchParams.get('keyword');
    case 'SHEIN_JP': return decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1));
    case 'LOFT_JP': return url.searchParams.get('keyword');
    case 'HANDS_JP': return url.searchParams.get('q');
    case 'MATSUKIYO_JP': return url.searchParams.get('search_keyword');
    case 'COSME_JP': return url.searchParams.get('name');
    case 'BUYMA_JP': return decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1));
    case 'SNKRDUNK_JP': return url.searchParams.get('keywords');
    default: return null;
  }
}

test('顔用扇風機の検索語は13モールで同じ整理済み語を引き継ぐ', () => {
  const links = marketplaceSearchDestinations('顔用 扇風機 ハンディファン 首掛け', { AMAZON_ASSOCIATE_TAG: 'hoshilu00-22' });
  assert.equal(links.length, 13);
  const shared = buildAmazonSearchKeywords('顔用 扇風機 ハンディファン 首掛け');
  for (const item of links.filter((link) => !['ZOZOTOWN_JP', 'ABCMART_JP'].includes(link.marketplace))) {
    assert.equal(decodedSearchQuery(item), shared, item.marketplace);
  }
  const zozo = links.find((item) => item.marketplace === 'ZOZOTOWN_JP').destination;
  const abc = links.find((item) => item.marketplace === 'ABCMART_JP').destination;
  assert.match(zozo, new RegExp(`p_keyv=${encodeShiftJisPercent(shared).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(abc, new RegExp(`keyword=${encodeShiftJisPercent(shared).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});

test('マツキヨとABC-MARTは正しい公式パラメータ名・文字コードを維持する', () => {
  const links = marketplaceSearchDestinations('スニーカー 防水');
  const matsukiyo = new URL(links.find((item) => item.marketplace === 'MATSUKIYO_JP').destination);
  const abc = links.find((item) => item.marketplace === 'ABCMART_JP').destination;
  assert.equal(matsukiyo.searchParams.get('search_keyword'), links[0] && decodedSearchQuery(links[0]));
  assert.match(abc, /[?&]keyword=/);
  assert.match(abc, /%[0-9A-F]{2}/);
});

test('ASINはAmazonだけに残し、他12モールの共通検索語には混入させない', () => {
  const asin = 'B08N5WRWNW';
  const links = marketplaceSearchDestinations(`${asin} 手袋 防水`);
  assert.equal(links.length, 13);
  assert.match(decodedSearchQuery(links.find((item) => item.marketplace === 'AMAZON_JP')), new RegExp(asin, 'i'));
  for (const item of links.filter((link) => link.marketplace !== 'AMAZON_JP')) {
    assert.doesNotMatch(item.destination, new RegExp(asin, 'i'), item.marketplace);
  }
});

test('ASINだけの入力ではAmazon以外の空検索リンクを作らない', () => {
  const links = marketplaceSearchDestinations('B08N5WRWNW');
  assert.deepEqual(links.map(({ marketplace }) => marketplace), ['AMAZON_JP']);
});

test('AI最安比較用リンクだけ、公式に確認できた価格昇順指定を付ける', () => {
  const normal = marketplaceSearchDestinations('ハンディファン');
  const sorted = marketplaceSearchDestinations('ハンディファン', {}, { sort: 'PRICE_ASC' });
  const destination = (links, marketplace) => links.find((item) => item.marketplace === marketplace).destination;

  assert.equal(new URL(destination(normal, 'AMAZON_JP')).searchParams.get('s'), null);
  assert.equal(new URL(destination(sorted, 'AMAZON_JP')).searchParams.get('s'), 'price-asc-rank');
  assert.equal(new URL(destination(sorted, 'RAKUTEN_JP')).searchParams.get('s'), '2');
  assert.equal(new URL(destination(sorted, 'YAHOO_JP')).searchParams.get('X'), '2');
  assert.equal(new URL(destination(sorted, 'QOO10_JP')).searchParams.get('sortType'), 'SORT_PRICE_ASC');
  assert.equal(new URL(destination(sorted, 'SHEIN_JP')).searchParams.get('sort'), 'price_asc');
  assert.match(destination(sorted, 'ZOZOTOWN_JP'), /[?&]p_scpid=1(?:&|$)/);
  assert.equal(new URL(destination(sorted, 'LOFT_JP')).searchParams.get('sort'), 'price');
  assert.equal(new URL(destination(sorted, 'COSME_JP')).searchParams.get('sort'), '5');
  assert.match(destination(sorted, 'ABCMART_JP'), /[?&]fssort=price(?:&|$)/);
  assert.match(destination(sorted, 'BUYMA_JP'), /\/r\/-O3\//);
  for (const marketplace of ['HANDS_JP', 'MATSUKIYO_JP', 'SNKRDUNK_JP']) {
    assert.equal(sorted.find((item) => item.marketplace === marketplace).sort_applied, false);
  }
});
