import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAttributedFee,
  rankWithoutPaidPlacement,
  sellerPlanEntitlements,
  sellerPricingPrinciples
} from '../src/seller-pricing-policy.mjs';

test('pilot keeps catalog registration and basic insight free', () => {
  const plan = sellerPlanEntitlements('PILOT');
  assert.equal(plan.catalog_sync, true);
  assert.equal(plan.basic_insight, true);
  assert.equal(plan.advanced_demand_report, false);
});

test('four seller plans expose increasing service entitlements', () => {
  const lite = sellerPlanEntitlements('LITE');
  const growth = sellerPlanEntitlements('GROWTH');
  const pro = sellerPlanEntitlements('PRO');
  const partner = sellerPlanEntitlements('PARTNER');
  assert.equal(lite.advanced_demand_report, false);
  assert.equal(growth.advanced_demand_report, true);
  assert.equal(pro.api_priority_support, true);
  assert.equal(partner.api_priority_support, true);
});

test('performance fee applies only to attributed order value', () => {
  assert.equal(calculateAttributedFee({
    attributedOrderValue: 10000,
    performanceFeeRate: 0.08
  }), 800);
  assert.equal(calculateAttributedFee({
    attributedOrderValue: 0,
    performanceFeeRate: 0.08
  }), 0);
});

test('payment never changes product relevance order', () => {
  const ranked = rankWithoutPaidPlacement([
    { id: 'paid', relevance_score: 0.4, available: true, paid: true },
    { id: 'relevant', relevance_score: 0.9, available: true, paid: false }
  ]);
  assert.equal(ranked[0].id, 'relevant');
  assert.equal(sellerPricingPrinciples.paid_search_ranking, 'FORBIDDEN');
});
