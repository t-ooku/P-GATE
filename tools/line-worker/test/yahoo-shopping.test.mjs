import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildYahooShoppingSearchDestination,
  isProductDetailDestination,
  productMarketplaceOffers
} from '../src/index.mjs';
import { PRODUCT_MARKETPLACES, marketplaceForProductUrl } from '../src/marketplace-product-url-policy.mjs';
import { SALE_MARKETPLACES } from '../src/marketplace-sales.mjs';

const readPublic = name => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('Yahoo!ショッピングを主要5番手として安全な検索URLへ案内する', () => {
  const url = new URL(buildYahooShoppingSearchDestination('SNSで見た 透明 ワイヤレスイヤホン'));
  assert.equal(url.origin, 'https://shopping.yahoo.co.jp');
  assert.equal(url.pathname, '/search');
  assert.match(url.searchParams.get('p'), /イヤホン/);
});

test('Yahoo!ショッピングの商品詳細URLだけを10モール商品候補として認識する', () => {
  const productUrl = 'https://store.shopping.yahoo.co.jp/example-store/item-123.html';
  assert.equal(PRODUCT_MARKETPLACES.length, 10);
  assert.equal(PRODUCT_MARKETPLACES.includes('YAHOO_JP'), true);
  assert.equal(marketplaceForProductUrl(productUrl), 'YAHOO_JP');
  assert.equal(isProductDetailDestination(productUrl), true);
  assert.equal(marketplaceForProductUrl('https://shopping.yahoo.co.jp/search?p=earphones'), '');
  assert.deepEqual(productMarketplaceOffers([{ marketplace: 'YAHOO_JP', product_url: productUrl, stock_status: 'IN_STOCK' }]).map(item => item.marketplace), ['YAHOO_JP']);
});

// v4.2 項目14・15: LPの検索フォールバックは「主要5モール/最大10モール」から
// 「まとめて検索3モール/個別に探す最大13モール」表記へ切り替えた。SALE RADAR
// SALE RADARと通知設定も2026-08-09に現行の同じ13モールへ統一した。
test('LP・検索フォールバック・SALE RADARは13モール表記で一致する', async () => {
  const [html, app, coverage, sales] = await Promise.all([
    readPublic('index.html'), readPublic('app.js'), readPublic('marketplace-coverage.mjs'), readPublic('sale-center.mjs')
  ]);
  assert.match(html, /まとめて検索/);
  assert.match(html, /Yahoo!ショッピング/);
  assert.match(html, /最大13モール/);
  assert.match(app, /marketplace:'YAHOO_JP'.+shopping\.yahoo\.co\.jp\/search/);
  assert.match(coverage, /Up to 13 marketplaces/);
  assert.match(sales, /13モールのセール情報を横断/);
  assert.match(sales, /\['YAHOO_JP','Yahoo!ショッピング'\]/);
  assert.match(sales, /preference\.marketplaces==='ALL'\?marketplaces\.map/);
  assert.equal(SALE_MARKETPLACES.length, 13);
  assert.equal(SALE_MARKETPLACES.includes('YAHOO_JP'), true);
});
