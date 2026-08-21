export const QUALIFIED_REFERRAL_PRICE_RULES = Object.freeze({
  FASHION: Object.freeze({ businessUnitPriceJpy: 25 }),
  COSMETICS: Object.freeze({ businessUnitPriceJpy: 38 }),
  GADGET: Object.freeze({ businessUnitPriceJpy: 19 }),
  LIFESTYLE: Object.freeze({ businessUnitPriceJpy: 25 }),
  FOOD: Object.freeze({ businessUnitPriceJpy: 31 }),
  HOBBY: Object.freeze({ businessUnitPriceJpy: 25 }),
  BABY: Object.freeze({ businessUnitPriceJpy: 25 }),
  PET: Object.freeze({ businessUnitPriceJpy: 25 }),
  SPORTS: Object.freeze({ businessUnitPriceJpy: 19 }),
  AUTOMOTIVE: Object.freeze({ businessUnitPriceJpy: 13 }),
  OTHER: Object.freeze({ businessUnitPriceJpy: 22 }),
});

const PLAN_MULTIPLIER = Object.freeze({
  BUSINESS: 1,
  SELLER: 1.5,
  // Historical contract names remain readable for existing charge records.
  LAUNCH_PERFORMANCE: 1,
  PERFORMANCE_ONLY: 1.5,
  STARTER: 1,
  GROWTH: 1,
  SCALE: 1,
});

export function normalizedReferralCategory(category) {
  const normalized = String(category || "").trim().toUpperCase();
  return QUALIFIED_REFERRAL_PRICE_RULES[normalized] ? normalized : "OTHER";
}

export function qualifiedReferralUnitPriceJpy({
  category,
  plan,
} = {}) {
  const normalizedPlan = String(plan || "").trim().toUpperCase();
  const multiplier = PLAN_MULTIPLIER[normalizedPlan];
  if (!multiplier) throw new Error("unknown qualified referral plan");

  const rule = QUALIFIED_REFERRAL_PRICE_RULES[
    normalizedReferralCategory(category)
  ];
  return Math.round(rule.businessUnitPriceJpy * multiplier);
}

export function settledQualifiedReferralChargeJpy(charges = []) {
  const total = charges.reduce((sum, charge) => {
    const value = Number(charge);
    return Number.isFinite(value) && value > 0 ? sum + value : sum;
  }, 0);
  return Math.round(total);
}

export function isBillableQualifiedReferral({
  source = "",
  contractedSeller = false,
  verifiedProductUrl = false,
  signedClickVerified = false,
  humanVerified = false,
  uniqueWithin24Hours = false,
  internalActor = false,
  redirectCompleted = false,
  displayedPriceVerified = false,
  sellerBoundDestination = false,
  offerSellerId = "",
  billedSellerId = "",
} = {}) {
  return (
    source === "HOSHILU_PRODUCT_CARD" &&
    contractedSeller &&
    verifiedProductUrl &&
    signedClickVerified &&
    humanVerified &&
    uniqueWithin24Hours &&
    !internalActor &&
    redirectCompleted &&
    displayedPriceVerified &&
    sellerBoundDestination &&
    Boolean(offerSellerId) &&
    offerSellerId === billedSellerId
  );
}
