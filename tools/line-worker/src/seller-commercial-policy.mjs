export const SELLER_COMMERCIAL_PLANS = Object.freeze({
  SELLER: Object.freeze({
    monthlyFeeJpy: 0,
    qualifiedReferralMultiplier: 1.5,
    insightDepth: "BASIC",
    searchApiMonthlyRequests: 0,
    searchApiOverageJpy: null,
  }),
  BUSINESS: Object.freeze({
    monthlyFeeJpy: 9_800,
    promotionalFreeMonths: 3,
    initialFeeJpy: 0,
    cancellationFeeJpy: 0,
    qualifiedReferralMultiplier: 1,
    insightDepth: "ADVANCED_DEMAND",
    searchApiMonthlyRequests: 10_000,
    searchApiOverageJpy: 4,
    billingUnit: "BUSINESS_ACCOUNT",
  }),
});

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
  subscription = true,
} = {}) {
  return subscription ? "BUSINESS" : "SELLER";
}

export function commercialTerms(planName) {
  const name = String(planName || "").toUpperCase();
  const plan = SELLER_COMMERCIAL_PLANS[name];
  if (!plan) throw new Error("unknown seller commercial plan");
  return { name, ...plan };
}
