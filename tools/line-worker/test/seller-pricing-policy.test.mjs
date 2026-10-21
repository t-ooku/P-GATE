import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAttributedFee,
  productIdentityKey,
  rankContractedSellerOffers,
  rankEligibleSellerProducts,
  rankWithoutPaidPlacement,
  sellerPlanEntitlements,
  sellerPricingPrinciples,
  shouldMergeMarketplaceProducts
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

test('relevance-only helper remains available for non-commercial ranking', () => {
  const ranked = rankWithoutPaidPlacement([
    { id: 'paid', relevance_score: 0.4, available: true, paid: true },
    { id: 'relevant', relevance_score: 0.9, available: true, paid: false }
  ]);
  assert.equal(ranked[0].id, 'relevant');
});

test('relevant confirmed products with contracted direct links rank first', () => {
  const ranked = rankEligibleSellerProducts([
    {
      id: 'uncontracted',
      relevance_score: 0.9,
      verified_product_url: true,
      contracted_seller: false,
    },
    {
      id: 'contracted',
      relevance_score: 0.7,
      verified_product_url: true,
      contracted_seller: true,
    },
    {
      id: 'irrelevant-paid',
      relevance_score: 0.1,
      verified_product_url: true,
      contracted_seller: true,
    },
  ]);
  assert.deepEqual(ranked.map((candidate) => candidate.id), [
    'contracted',
    'uncontracted',
  ]);
});

test('same product offers use subscription price order and performance only last', () => {
  const ranked = rankContractedSellerOffers([
    { offer_id: 'performance', commercial_plan: 'PERFORMANCE_ONLY' },
    { offer_id: 'starter', commercial_plan: 'STARTER' },
    { offer_id: 'scale', commercial_plan: 'SCALE' },
    { offer_id: 'growth', commercial_plan: 'GROWTH' },
  ]);
  assert.deepEqual(ranked.map((offer) => offer.offer_id), [
    'scale',
    'growth',
    'starter',
    'performance',
  ]);
});

test('different marketplace product or variation ids are separate products', () => {
  const black = {
    marketplace: 'AMAZON_JP',
    external_product_id: 'B000BLACK',
    variant_id: 'BLACK-M',
  };
  const white = {
    marketplace: 'AMAZON_JP',
    external_product_id: 'B000WHITE',
    variant_id: 'WHITE-M',
  };
  const blackLarge = {
    ...black,
    variant_id: 'BLACK-L',
  };
  assert.equal(productIdentityKey(black), 'AMAZON_JP:B000BLACK:BLACK-M');
  assert.equal(shouldMergeMarketplaceProducts(black, { ...black }), true);
  assert.equal(shouldMergeMarketplaceProducts(black, white), false);
  assert.equal(shouldMergeMarketplaceProducts(black, blackLarge), false);
  assert.equal(
    sellerPricingPrinciples.paid_search_ranking,
    'CONTRACTED_DIRECT_LINKS_AFTER_RELEVANCE_GATE',
  );
});
