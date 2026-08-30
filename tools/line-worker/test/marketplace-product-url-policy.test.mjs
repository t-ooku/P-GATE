import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMarketplaceProductUrl, marketplaceForProductUrl, PRODUCT_MARKETPLACES
} from '../src/marketplace-product-url-policy.mjs';

const PRODUCTS = [
  ['AMAZON_JP', 'https://www.amazon.co.jp/dp/B000000001'],
  ['RAKUTEN_JP', 'https://item.rakuten.co.jp/shop/item-code/'],
  ['YAHOO_JP', 'https://store.shopping.yahoo.co.jp/shop/item-code.html'],
  ['QOO10_JP', 'https://www.qoo10.jp/gmkt.inc/Goods/Goods.aspx?goodscode=123456789'],
  ['SHEIN_JP', 'https://jp.shein.com/example-p-456789.html'],
  ['ZOZOTOWN_JP', 'https://zozo.jp/shop/example/goods/12345678/'],
  ['SHOPLIST_JP', 'https://www.shop-list.com/women/example/item-code/'],
  ['MUSINSA_JP', 'https://global.musinsa.com/jp/goods/1234567'],
  ['BUYMA_JP', 'https://www.buyma.com/item/123456789/'],
  ['SNKRDUNK_JP', 'https://snkrdunk.com/products/123456']
];

test('ten marketplace product detail URLs are recognized', () => {
  assert.equal(PRODUCT_MARKETPLACES.length, 10);
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

test('ValueCommerce affiliate redirects are accepted only for a verified embedded product destination', () => {
  const yahoo = 'https://ck.jp.ap.valuecommerce.com/servlet/referral?vs=123456&vp=987654&vc_url=https%3A%2F%2Fstore.shopping.yahoo.co.jp%2Fshop%2Fitem-code.html';
  const qoo10 = 'https://ck.jp.ap.valuecommerce.com/servlet/referral?vs=abc123&vp=def456&vc_url=https%3A%2F%2Fwww.qoo10.jp%2Fgmkt.inc%2FGoods%2FGoods.aspx%3Fgoodscode%3D123456789';
  assert.equal(marketplaceForProductUrl(yahoo), 'YAHOO_JP');
  assert.equal(marketplaceForProductUrl(qoo10), 'QOO10_JP');
  assert.equal(isMarketplaceProductUrl('QOO10_JP', yahoo), false);
  assert.equal(marketplaceForProductUrl('https://ck.jp.ap.valuecommerce.com/servlet/referral?vs=1&vp=2&vc_url=https%3A%2F%2Fevil.example%2Fproduct'), '');
  assert.equal(marketplaceForProductUrl('https://ck.jp.ap.valuecommerce.com/servlet/referral?vc_url=https%3A%2F%2Fstore.shopping.yahoo.co.jp%2Fshop%2Fitem-code.html'), '');
});
