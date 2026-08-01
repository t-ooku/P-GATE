import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMarketplaceProductUrl, marketplaceForProductUrl, PRODUCT_MARKETPLACES
} from '../src/marketplace-product-url-policy.mjs';

const PRODUCTS = [
  ['AMAZON_JP', 'https://www.amazon.co.jp/dp/B000000001'],
  ['RAKUTEN_JP', 'https://item.rakuten.co.jp/shop/item-code/'],
  ['QOO10_JP', 'https://www.qoo10.jp/gmkt.inc/Goods/Goods.aspx?goodscode=123456789'],
  ['SHEIN_JP', 'https://jp.shein.com/example-p-456789.html'],
  ['ZOZOTOWN_JP', 'https://zozo.jp/shop/example/goods/12345678/'],
  ['SHOPLIST_JP', 'https://www.shop-list.com/women/example/item-code/'],
  ['MUSINSA_JP', 'https://global.musinsa.com/jp/goods/1234567'],
  ['BUYMA_JP', 'https://www.buyma.com/item/123456789/'],
  ['SNKRDUNK_JP', 'https://snkrdunk.com/products/123456']
];

test('nine marketplace product detail URLs are recognized', () => {
  assert.equal(PRODUCT_MARKETPLACES.length, 9);
  for (const [marketplace, url] of PRODUCTS) {
    assert.equal(marketplaceForProductUrl(url), marketplace);
    assert.equal(isMarketplaceProductUrl(marketplace, url), true);
  }
});

test('search, category, credentials, and wrong marketplace URLs are rejected', () => {
  for (const url of [
    'https://zozo.jp/search/?p_keyv=coat',
    'https://www.shop-list.com/women/svc/product/Search/?keyword=coat',
    'https://global.musinsa.com/jp/search/goods?keyword=coat',
    'https://www.buyma.com/r/coat/',
    'https://snkrdunk.com/search/?keywords=coat',
    'https://user:pass@snkrdunk.com/products/123456'
  ]) assert.equal(marketplaceForProductUrl(url), '');
  assert.equal(isMarketplaceProductUrl('BUYMA_JP', 'https://snkrdunk.com/products/123456'), false);
});
