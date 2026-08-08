import test from 'node:test';
import assert from 'node:assert/strict';
import { HOSHILU_PRODUCT_SCHEMA_FIELDS, normalizeOffer, normalizeTitle } from '../src/hoshilu-product-schema.mjs';

// v4.3 指示書 section 21: HOSHILU共通商品データ形式の最低限フィールド一覧を
// 固定化する。

test('v4.3項目21: 共通商品データ形式は指示書section21の最低限フィールドをすべて含む', () => {
  const required = [
    'hoshilu_product_id', 'source_marketplace', 'source_product_id', 'asin', 'jan', 'gtin',
    'manufacturer_part_number', 'brand', 'title', 'normalized_title', 'category', 'attributes',
    'image_url', 'product_url', 'price', 'shipping_fee', 'effective_price', 'currency',
    'stock_status', 'seller_id', 'updated_at'
  ];
  assert.deepEqual([...HOSHILU_PRODUCT_SCHEMA_FIELDS], required);
});

test('v4.3項目21: normalizeOfferは全フィールドを出力し、余計なフィールドを混入しない', () => {
  const offer = normalizeOffer({
    source_product_id: 'B000TEST01', asin: 'b000test01', title: 'ハンディファン', brand: 'HOSHILU',
    price: 2980, shipping_fee: 0, currency: 'jpy', stock_status: 'in_stock', updated_at: '2026-08-08T00:00:00Z'
  }, { sourceMarketplace: 'amazon_jp' });
  assert.deepEqual(Object.keys(offer).sort(), [...HOSHILU_PRODUCT_SCHEMA_FIELDS].sort());
  assert.equal(offer.source_marketplace, 'AMAZON_JP');
  assert.equal(offer.asin, 'B000TEST01');
  assert.equal(offer.currency, 'JPY');
  assert.equal(offer.stock_status, 'IN_STOCK');
  assert.equal(offer.effective_price, 2980);
});

test('v4.3項目21: 取得できない値はNULLにし、AIで実データを補完したように見せない', () => {
  const offer = normalizeOffer({
    source_product_id: 'X1', title: '商品', updated_at: '2026-08-08T00:00:00Z'
  }, { sourceMarketplace: 'LOFT_JP' });
  assert.equal(offer.jan, null);
  assert.equal(offer.gtin, null);
  assert.equal(offer.manufacturer_part_number, null);
  assert.equal(offer.price, null);
  assert.equal(offer.shipping_fee, null);
  // 送料が不明なのにeffective_price(合計額)を作り出さない
  assert.equal(offer.effective_price, null);
  assert.equal(offer.seller_id, null);
});

test('v4.3項目21: source_marketplace・source_product_id・updated_atは必須で、欠けるとエラーになる', () => {
  assert.throws(() => normalizeOffer({ source_product_id: 'X', updated_at: '2026-08-08T00:00:00Z' }, {}),
    /HOSHILU_PRODUCT_SOURCE_MARKETPLACE_REQUIRED/);
  assert.throws(() => normalizeOffer({ updated_at: '2026-08-08T00:00:00Z' }, { sourceMarketplace: 'AMAZON_JP' }),
    /HOSHILU_PRODUCT_SOURCE_PRODUCT_ID_REQUIRED/);
  assert.throws(() => normalizeOffer({ source_product_id: 'X' }, { sourceMarketplace: 'AMAZON_JP' }),
    /HOSHILU_PRODUCT_UPDATED_AT_REQUIRED/);
});

test('v4.3項目21: 未知のstock_statusはUNKNOWNへ丸められる(捏造しない)', () => {
  const offer = normalizeOffer({
    source_product_id: 'X2', stock_status: 'たぶん在庫あり', updated_at: '2026-08-08T00:00:00Z'
  }, { sourceMarketplace: 'HANDS_JP' });
  assert.equal(offer.stock_status, 'UNKNOWN');
});

test('normalizeTitle: 表記ゆれ(全角/半角・大文字小文字・記号)を吸収する', () => {
  const a = normalizeTitle('ハンディファン　ホワイト【新品】', 'HOSHILU');
  const b = normalizeTitle('ハンディファン ホワイト新品', 'hoshilu');
  assert.equal(a, b);
});
