import test from 'node:test';
import assert from 'node:assert/strict';
import { matchProductIdentity } from '../src/product-identity-matching.mjs';
import { normalizeOffer } from '../src/hoshilu-product-schema.mjs';

const offer = (overrides) => normalizeOffer({
  source_product_id: overrides.source_product_id || 'X',
  updated_at: '2026-08-08T00:00:00Z',
  ...overrides
}, { sourceMarketplace: overrides.source_marketplace || 'AMAZON_JP' });

// v4.3 指示書 section 19: 同一商品判定は 1.JAN/GTIN 2.ASIN等モールID
// 3.メーカー型番 4.ブランド+正式商品名+容量/サイズ 5.AI類似判定 の順。

test('v4.3項目19: JANが一致すれば同一商品(tier=jan)', () => {
  const a = offer({ source_product_id: 'A1', jan: '4912345678904' });
  const b = offer({ source_product_id: 'B1', source_marketplace: 'RAKUTEN_JP', jan: '4912345678904', asin: 'DIFFERENT01' });
  const result = matchProductIdentity(a, b);
  assert.equal(result.matched, true);
  assert.equal(result.tier, 'jan');
});

test('v4.3項目19: GTINが一致すれば同一商品(tier=gtin)', () => {
  const a = offer({ source_product_id: 'A2', gtin: '00012345678905' });
  const b = offer({ source_product_id: 'B2', source_marketplace: 'YAHOO_JP', gtin: '00012345678905' });
  assert.equal(matchProductIdentity(a, b).tier, 'gtin');
});

test('v4.3項目19: JAN/GTINが無くてもASINが一致すれば同一商品(tier=asin)', () => {
  const a = offer({ source_product_id: 'A3', asin: 'B0ABC12345' });
  const b = offer({ source_product_id: 'B0ABC12345', source_marketplace: 'RAKUTEN_JP', asin: 'B0ABC12345' });
  assert.equal(matchProductIdentity(a, b).tier, 'asin');
});

test('v4.3項目19: 型番が一致しブランドも一致すれば同一商品(tier=manufacturer_part_number)', () => {
  const a = offer({ source_product_id: 'A4', brand: 'HOSHILU', manufacturer_part_number: 'HF-100' });
  const b = offer({ source_product_id: 'B4', source_marketplace: 'LOFT_JP', brand: 'HOSHILU', manufacturer_part_number: 'HF-100' });
  assert.equal(matchProductIdentity(a, b).tier, 'manufacturer_part_number');
});

test('v4.3項目19: 型番が一致してもブランドが食い違えば不一致', () => {
  const a = offer({ source_product_id: 'A5', brand: 'BRAND_A', manufacturer_part_number: 'SAME-100' });
  const b = offer({ source_product_id: 'B5', source_marketplace: 'LOFT_JP', brand: 'BRAND_B', manufacturer_part_number: 'SAME-100' });
  assert.equal(matchProductIdentity(a, b).matched, false);
});

test('v4.3項目19: 識別子が無くても、ブランド+正式商品名が一致すれば同一商品(tier=brand_title_size)', () => {
  const a = offer({ source_product_id: 'A6', brand: 'HOSHILU', title: 'ハンディファン ホワイト' });
  const b = offer({ source_product_id: 'B6', source_marketplace: 'HANDS_JP', brand: 'HOSHILU', title: 'ハンディファン ホワイト' });
  assert.equal(matchProductIdentity(a, b).tier, 'brand_title_size');
});

test('v4.3項目20: ブランドや商品名が違う場合はどのtierにも一致せず「類似商品」扱いになる(tier=null)', () => {
  const a = offer({ source_product_id: 'A7', brand: 'HOSHILU', title: 'ハンディファン ホワイト' });
  const b = offer({ source_product_id: 'B7', source_marketplace: 'HANDS_JP', brand: 'OTHERBRAND', title: '全く違う商品' });
  const result = matchProductIdentity(a, b);
  assert.equal(result.matched, false);
  assert.equal(result.tier, null);
});

test('サイズ/容量が食い違えばブランド+商品名が一致しても不一致', () => {
  const a = offer({ source_product_id: 'A8', brand: 'HOSHILU', title: '圧縮ポーチ', attributes: { size: 'S' } });
  const b = offer({ source_product_id: 'B8', source_marketplace: 'HANDS_JP', brand: 'HOSHILU', title: '圧縮ポーチ', attributes: { size: 'L' } });
  assert.equal(matchProductIdentity(a, b).matched, false);
});
