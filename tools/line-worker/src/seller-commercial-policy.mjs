export const SELLER_COMMERCIAL_PLANS = Object.freeze({
  LAUNCH_PERFORMANCE: Object.freeze({
    monthlyFeeJpy: 0,
    performanceFeeRate: 0.06,
    catalogLimit: 50_000,
    attributedGmvLimitJpy: Infinity,
  }),
  STARTER: Object.freeze({
    monthlyFeeJpy: 9_800,
    performanceFeeRate: 0.03,
    catalogLimit: 500,
    attributedGmvLimitJpy: 300_000,
  }),
  GROWTH: Object.freeze({
    monthlyFeeJpy: 29_800,
    performanceFeeRate: 0.02,
    catalogLimit: 5_000,
    attributedGmvLimitJpy: 3_000_000,
  }),
  SCALE: Object.freeze({
    monthlyFeeJpy: 79_800,
    performanceFeeRate: 0.01,
    catalogLimit: 50_000,
    attributedGmvLimitJpy: 10_000_000,
  }),
  ENTERPRISE: Object.freeze({
    monthlyFeeJpy: null,
    performanceFeeRate: null,
    catalogLimit: Infinity,
    attributedGmvLimitJpy: Infinity,
  }),
  PERFORMANCE_ONLY: Object.freeze({
    monthlyFeeJpy: 0,
    performanceFeeRate: 0.1,
    catalogLimit: 50_000,
    attributedGmvLimitJpy: Infinity,
  }),
});

function nonNegativeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function sellerLifecycleMonth(startedAt, now = new Date()) {
  const start = new Date(startedAt);
  const current = new Date(now);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(current.getTime())) {
    throw new Error("valid dates are required");
  }
  if (current < start) return 1;
  const months =
    (current.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    current.getUTCMonth() -
    start.getUTCMonth();
  return Math.max(
    1,
    months + (current.getUTCDate() >= start.getUTCDate() ? 1 : 0),
  );
}

export function recommendedSellerPlan({
  lifecycleMonth,
  catalogCount = 0,
  attributedGmvJpy = 0,
  requiresEnterpriseIntegration = false,
} = {}) {
  if (nonNegativeNumber(lifecycleMonth) <= 3) return "LAUNCH_PERFORMANCE";
  if (requiresEnterpriseIntegration) return "ENTERPRISE";

  const catalog = nonNegativeNumber(catalogCount);
  const gmv = nonNegativeNumber(attributedGmvJpy);
  if (
    catalog <= SELLER_COMMERCIAL_PLANS.STARTER.catalogLimit &&
    gmv < SELLER_COMMERCIAL_PLANS.STARTER.attributedGmvLimitJpy
  ) return "STARTER";
  if (
    catalog <= SELLER_COMMERCIAL_PLANS.GROWTH.catalogLimit &&
    gmv < SELLER_COMMERCIAL_PLANS.GROWTH.attributedGmvLimitJpy
  ) return "GROWTH";
  if (
    catalog <= SELLER_COMMERCIAL_PLANS.SCALE.catalogLimit &&
    gmv < SELLER_COMMERCIAL_PLANS.SCALE.attributedGmvLimitJpy
  ) return "SCALE";
  return "ENTERPRISE";
}

export function commercialTerms(planName) {
  const name = String(planName || "").toUpperCase();
  const plan = SELLER_COMMERCIAL_PLANS[name];
  if (!plan) throw new Error("unknown seller commercial plan");
  return { name, ...plan };
}

export function attributedFeeBase({
  itemSubtotalJpy = 0,
  taxJpy = 0,
  shippingJpy = 0,
  refundedItemSubtotalJpy = 0,
} = {}) {
  void taxJpy;
  void shippingJpy;
  return Math.max(
    0,
    Math.round(
      nonNegativeNumber(itemSubtotalJpy) -
      nonNegativeNumber(refundedItemSubtotalJpy),
    ),
  );
}
