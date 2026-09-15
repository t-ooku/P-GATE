import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMarketplaceOfferFeed } from '../src/marketplace-offer-feed.mjs';

const payload = (overrides = {}) => ({
  tenant: 'itg',
  batch_id: 'commerce-validation-20260801',
  records: [{
    record_key: 'product-1',
    marketplace: 'YAHOO_JP',
    external_product_id: 'shop/item-1',
    product_url: 'https://store.shopping.yahoo.co.jp/shop/item-1.html',
    price: 1980,
    currency: 'jpy',
    stock_status: 'in_stock',
    ...overrides
  }]
});

test('商品フィードは有限の非負価格・通貨・在庫状態を正規化する', () => {
  const [record] = validateMarketplaceOfferFeed(payload()).records;
  assert.equal(record.price, 1980);
  assert.equal(record.currency, 'JPY');
  assert.equal(record.stock_status, 'IN_STOCK');
});

test('不正な価格・通貨・在庫状態を診断前に拒否する', () => {
  for (const price of [-1, 'not-a-price', Number.POSITIVE_INFINITY]) {
    assert.throws(() => validateMarketplaceOfferFeed(payload({ price })), /OFFER_FEED_PRICE_INVALID/);
  }
  assert.throws(() => validateMarketplaceOfferFeed(payload({ currency: 'JP' })), /OFFER_FEED_CURRENCY_INVALID/);
  assert.throws(() => validateMarketplaceOfferFeed(payload({ stock_status: 'maybe' })), /OFFER_FEED_STOCK_STATUS_INVALID/);
});
