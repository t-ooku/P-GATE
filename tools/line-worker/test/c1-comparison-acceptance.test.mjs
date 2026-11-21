import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPriceComparison, realPriceRows } from '../src/ai-price-comparison.mjs';
import {
  COSMETICS_COHORT_ID, evaluateCosmeticsCoverage, scoreVerifiedC1Offers
} from '../src/cheapest-coverage-evaluation.mjs';
import { verifiedSameJanComparisonOffers } from '../src/rakuten-jan-bridge.mjs';

const measured_at = '2026-11-15T10:30:00Z';
const now = Date.parse(measured_at);
const target = {
  jan: '4901234567894', manufacturer_part_number: 'FIXTURE-47',
  attributes: { shade: '04', volume: '4g', pack_count: 1 }
};
const rakuten = {
  ...target, marketplace: 'RAKUTEN_JP', price: 1300, total_cost: 1800,
  currency: 'JPY', source: 'REAL', stock_status: 'IN_STOCK',
  observed_at: '2026-11-15T10:15:00Z', verification: 'page_verified',
  product_url: 'https://item.rakuten.co.jp/qa-fixture/item1/'
};
const yahoo = {
  ...rakuten, marketplace: 'YAHOO_JP', price: 1500, total_cost: 1500,
  product_url: 'https://store.shopping.yahoo.co.jp/qa-fixture/item1.html'
};

test('C-1 verified Rakuten and Yahoo! SKU compares by item price without shipping fields', () => {
  const { total_cost, ...withoutShipping } = rakuten;
  const result = scoreVerifiedC1Offers(target, [yahoo, withoutShipping], now);
  assert.equal(result.established, true);
  assert.deepEqual(result.rows.map(({ marketplace, price }) => [marketplace, price]), [
    ['RAKUTEN_JP', 1300], ['YAHOO_JP', 1500]
  ]);
  // Use the deployed response builder for the already-verified group.
  const real = realPriceRows(result.rows.map((row) => ({ ...row, tracking_url: row.product_url })), { now });
  assert.deepEqual(real.map(({ marketplace }) => marketplace), ['RAKUTEN_JP', 'YAHOO_JP']);
  assert.equal(buildPriceComparison({ real }).cheapest_claim.marketplace, 'RAKUTEN_JP');
  assert.equal(scoreVerifiedC1Offers(target, [rakuten, yahoo], now).rows[0].marketplace, 'RAKUTEN_JP',
    'shipping-inclusive total must not change the winner');
});

test('auto-open payload is allowed only for the exact verified two-mall JAN group', () => {
  const rakutenListing = { ...rakuten, title: 'Fixture 47 shade 04 4g' };
  const yahooListing = { ...yahoo, title: 'Fixture 47 shade 04 4g' };
  const candidate = { record_key: `JAN:${target.jan}`, offers: [rakutenListing, yahooListing] };
  assert.deepEqual(verifiedSameJanComparisonOffers(candidate, now).map((offer) => offer.marketplace), [
    'RAKUTEN_JP', 'YAHOO_JP'
  ]);
  assert.deepEqual(verifiedSameJanComparisonOffers({ ...candidate, offers: [rakutenListing] }, now), []);
  assert.deepEqual(verifiedSameJanComparisonOffers({ ...candidate, record_key: 'OTHER' }, now), []);
  assert.deepEqual(verifiedSameJanComparisonOffers({ ...candidate, offers: [rakutenListing, { ...yahooListing, attributes: { ...target.attributes, pack_count: 2 } }] }, now), []);
  assert.deepEqual(verifiedSameJanComparisonOffers({ ...candidate, offers: [rakutenListing, { ...yahooListing, observed_at: '2026-11-14T10:29:59Z' }] }, now), []);
});

test('C-1 never relaxes JAN, model, color, capacity, or pack size', () => {
  const conflicting = [
    { jan: '4901234567801' }, { jan: '' }, { manufacturer_part_number: 'OTHER' },
    { attributes: { ...target.attributes, shade: 'S04' } },
    { attributes: { ...target.attributes, volume: '8g' } },
    { attributes: { ...target.attributes, pack_count: 2 } },
    { attributes: { volume: '4g', pack_count: 1 } },
    { verification: 'unverified' }
  ];
  for (const mismatch of conflicting) {
    assert.equal(scoreVerifiedC1Offers(target, [rakuten, { ...yahoo, ...mismatch }], now).established, false);
  }
  const invalid = { ...target, jan: '0000000000000' };
  assert.equal(scoreVerifiedC1Offers(invalid, [{ ...rakuten, jan: invalid.jan }, { ...yahoo, jan: invalid.jan }], now).marketplace_count, 0);
});

test('C-3 evidence excludes non-item prices, missing or stale checks, unavailable stock, and non-product links', () => {
  const bad = [
    { price: 0, total_cost: 1 }, { price: Infinity }, { source: 'AI_ESTIMATE' },
    { stock_status: 'UNKNOWN' }, { stock_status: 'OUT_OF_STOCK' },
    { observed_at: undefined }, { observed_at: '2026-11-14T10:29:59Z' },
    { observed_at: '2026-11-15T10:30:01Z' },
    { product_url: 'https://shopping.yahoo.co.jp/search?p=qa' },
    { product_url: rakuten.product_url }, { product_url: 'https://hoshilu.app/go?token=example' }
  ];
  for (const row of bad) {
    assert.equal(scoreVerifiedC1Offers(target, [rakuten, { ...yahoo, ...row }], now).established, false);
  }
  assert.equal(scoreVerifiedC1Offers(target, [rakuten, { ...yahoo, observed_at: '2026-11-14T10:30:00Z' }], now).established, true);
  const oneMall = scoreVerifiedC1Offers(target, [rakuten, { ...rakuten, price: 1250 }], now);
  assert.equal(oneMall.established, false);
  assert.equal(oneMall.rows[0].price, 1250);
});

const roster = Array.from({ length: 20 }, (_, i) => ({
  id: String(i + 1).padStart(2, '0'), verification: i === 0 ? 'page_verified' : 'unverified', target
}));
const sample = (revision, offers) => ({
  revision, captured_at: measured_at, cases: [{ id: '01', status: 'complete', measured_at, offers }]
});
const packet = { cohort_id: COSMETICS_COHORT_ID, roster, before: sample('1234567', [rakuten]) };

test('same fixed denominator before and after; only measured pairs are compared', () => {
  const out = evaluateCosmeticsCoverage({ ...packet, after: sample('7654321', [rakuten, yahoo]) });
  assert.equal(out.before.denominator, 20);
  assert.equal(out.after.denominator, 20);
  assert.equal(out.before.rate, null);
  assert.equal(out.after.rate, null);
  assert.equal(out.after.confirmed_lower_bound, 1 / 20);
  assert.deepEqual(out.comparison, {
    paired_count: 1, paired_before_established: 0, paired_after_established: 1, percentage_point_delta: null
  });
  assert.doesNotMatch(JSON.stringify(out), /qa-fixture|4901234567894|FIXTURE-47/u);
});

test('unmeasured is not zero; no case ids can be dropped, changed or duplicated', () => {
  const out = evaluateCosmeticsCoverage({ ...packet, before: { ...packet.before, cases: [] } });
  assert.equal(out.before.cases[0].status, 'NOT_MEASURED');
  assert.equal(out.before.cases[1].status, 'UNVERIFIED_TARGET');
  assert.equal(out.before.confirmed_lower_bound, null);
  assert.equal(out.comparison, null);
  const failed = evaluateCosmeticsCoverage({
    ...packet, before: { ...packet.before, cases: [{ id: '01', status: 'failed' }] }
  });
  assert.equal(failed.before.cases[0].status, 'MEASUREMENT_FAILED');
  assert.throws(() => evaluateCosmeticsCoverage({ ...packet, roster: roster.slice(1) }), /20/u);
  assert.throws(() => evaluateCosmeticsCoverage({ ...packet, roster: [roster[0], ...roster.slice(0, -1)] }), /duplicate/u);
});

test('with complete fixed observation, compare rates as percentage points', () => {
  const fullRoster = roster.map((row) => ({ ...row, verification: 'page_verified' }));
  const cases = (offers) => fullRoster.map(({ id }) => ({ id, status: 'complete', measured_at, offers }));
  const out = evaluateCosmeticsCoverage({
    ...packet, roster: fullRoster, before: { ...packet.before, cases: cases([rakuten]) },
    after: { ...sample('7654321', []), cases: cases([rakuten, yahoo]) }
  });
  assert.equal(out.before.rate, 0);
  assert.equal(out.after.rate, 1);
  assert.equal(out.comparison.percentage_point_delta, 100);
});
