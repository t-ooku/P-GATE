export const SELLER_COMMERCIAL_PLANS = Object.freeze({
  LAUNCH_PERFORMANCE: Object.freeze({
    monthlyFeeJpy: 0,
    qualifiedReferralMultiplier: 1,
    treasureMapDelayHours: 168,
    insightDepth: "FULL_KPI_PILOT",
    catalogLimit: 50_000,
  }),
  STARTER: Object.freeze({
    monthlyFeeJpy: 9_800,
    qualifiedReferralMultiplier: 1,
    treasureMapDelayHours: 72,
    insightDepth: "CATEGORY",
    catalogLimit: 500,
  }),
  GROWTH: Object.freeze({
    monthlyFeeJpy: 29_800,
    qualifiedReferralMultiplier: 0.85,
    treasureMapDelayHours: 24,
    insightDepth: "QUERY_CLUSTER",
    catalogLimit: 5_000,
  }),
  SCALE: Object.freeze({
    monthlyFeeJpy: 79_800,
    qualifiedReferralMultiplier: 0.7,
    treasureMapDelayHours: 0,
    insightDepth: "PRODUCT_REALTIME",
    catalogLimit: 50_000,
  }),
  ENTERPRISE: Object.freeze({
    monthlyFeeJpy: null,
    qualifiedReferralMultiplier: null,
    treasureMapDelayHours: 0,
    insightDepth: "API_CUSTOM",
    catalogLimit: Infinity,
  }),
  PERFORMANCE_ONLY: Object.freeze({
    monthlyFeeJpy: 0,
    qualifiedReferralMultiplier: 1.5,
    treasureMapDelayHours: 168,
    insightDepth: "MONTHLY_SUMMARY",
    catalogLimit: 50_000,
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
  requiresEnterpriseIntegration = false,
} = {}) {
  if (nonNegativeNumber(lifecycleMonth) <= 3) return "LAUNCH_PERFORMANCE";
  if (requiresEnterpriseIntegration) return "ENTERPRISE";

  const catalog = nonNegativeNumber(catalogCount);
  if (catalog <= SELLER_COMMERCIAL_PLANS.STARTER.catalogLimit) return "STARTER";
  if (catalog <= SELLER_COMMERCIAL_PLANS.GROWTH.catalogLimit) return "GROWTH";
  if (catalog <= SELLER_COMMERCIAL_PLANS.SCALE.catalogLimit) return "SCALE";
  return "ENTERPRISE";
}

export function commercialTerms(planName) {
  const name = String(planName || "").toUpperCase();
  const plan = SELLER_COMMERCIAL_PLANS[name];
  if (!plan) throw new Error("unknown seller commercial plan");
  return { name, ...plan };
}
