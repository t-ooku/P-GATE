import test from 'node:test';
import assert from 'node:assert/strict';
import { unifyResults } from '../src/unified-results.mjs';
import { sanitizePublicCandidate } from '../src/index.mjs';
globalThis.document ??= { addEventListener() {}, querySelector() { return null; } };
const { priceEvidenceText } = await import('../public/unified-results-ui.mjs');
const offer = { marketplace: 'RAKUTEN_JP', price: 1000, total_cost: 1500, shipping_fee: 500, shipping_fee_confirmed: true, tracking_url: 'https://hoshilu.app/go?token=fixture' };
const row = (offers) => unifyResults({ query: 'トートバッグ', candidates: [{ display_name: 'トートバッグ', offers }] }).items[0];

test('positive total with unconfirmed delivery must not claim shipping included', () => {
  const item = row([{ ...offer, shipping_fee_confirmed: false }]);
  assert.equal(item.price_jpy, 1500);
  assert.equal(item.price_shipping_included, false);
  assert.equal(priceEvidenceText(item), '送料未確認・確認時刻不明');
});
test('confirmed arithmetic and explicit observation carry honest evidence', () => {
  const item = row([{ ...offer, observed_at: '2026-10-19T01:00:00Z' }]);
  assert.equal(item.price_shipping_included, true);
  assert.equal(item.price_observed_at, '2026-10-19T01:00:00.000Z');
  assert.match(priceEvidenceText(item), /^送料込み・10\/19 10:00確認$/u);
  assert.equal(row([{ ...offer, total_cost: 1000 }]).price_shipping_included, false);
});
test('price evidence comes from amount source even when destination differs', () => {
  const item = row([{ marketplace: 'YAHOO_JP', tracking_url: offer.tracking_url }, { ...offer, tracking_url: '', observed_at: 'invalid' }]);
  assert.equal(item.marketplace, 'YAHOO_JP');
  assert.equal(item.price_marketplace, 'RAKUTEN_JP');
  assert.equal(item.price_observed_at, '');
  assert.equal(priceEvidenceText(item), '送料込み・価格元：楽天市場・確認時刻不明');
});
test('unknown delivery, absent time and web reference prices never gain evidence', () => {
  assert.equal(row([{ ...offer, shipping_fee: null }]).price_shipping_included, false);
  assert.equal(row([{ ...offer, shipping_fee: -500, total_cost: 500 }]).price_shipping_included, false);
  assert.equal(priceEvidenceText({ source: 'WEB', price_jpy: 1000, price_shipping_included: true }), '');
  assert.equal(priceEvidenceText({ source: 'HOSHILU', price_jpy: null }), '');
});

test('public candidate boundary preserves explicit unconfirmed delivery and only real timestamps', () => {
  const candidate = sanitizePublicCandidate({ offers: [{ ...offer, shipping_fee_confirmed: false, fetched_at: '2026-10-19T01:00:00Z' }] });
  const item = row([{ ...candidate.offers[0], tracking_url: offer.tracking_url }]);
  assert.equal(item.price_jpy, 1000);
  assert.equal(item.price_shipping_included, false);
  assert.equal(item.price_observed_at, '2026-10-19T01:00:00.000Z');
  assert.equal(sanitizePublicCandidate({ offers: [{ ...offer, observed_at: 'invalid' }] }).offers[0].observed_at, undefined);
});
