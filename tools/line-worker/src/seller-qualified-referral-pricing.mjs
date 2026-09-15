export const QUALIFIED_REFERRAL_PRICE_RULES = Object.freeze({
  FASHION: Object.freeze({ rate: 0.0008 }),
  COSMETICS: Object.freeze({ rate: 0.0012 }),
  GADGET: Object.freeze({ rate: 0.0006 }),
  LIFESTYLE: Object.freeze({ rate: 0.0008 }),
  FOOD: Object.freeze({ rate: 0.001 }),
  HOBBY: Object.freeze({ rate: 0.0008 }),
  BABY: Object.freeze({ rate: 0.0008 }),
  PET: Object.freeze({ rate: 0.0008 }),
  SPORTS: Object.freeze({ rate: 0.0006 }),
  AUTOMOTIVE: Object.freeze({ rate: 0.0004 }),
  OTHER: Object.freeze({ rate: 0.0007 }),
});

const PLAN_MULTIPLIER = Object.freeze({
  LAUNCH_PERFORMANCE: 1,
  PERFORMANCE_ONLY: 1.5,
  STARTER: 1,
  GROWTH: 0.85,
  SCALE: 0.7,
});

export function normalizedReferralCategory(category) {
  const normalized = String(category || "").trim().toUpperCase();
  return QUALIFIED_REFERRAL_PRICE_RULES[normalized] ? normalized : "OTHER";
}

export function qualifiedReferralUnitPriceJpy({
  category,
  plan,
  displayedProductPriceJpy,
  enterpriseUnitPriceJpy,
} = {}) {
  const normalizedPlan = String(plan || "").trim().toUpperCase();
  if (normalizedPlan === "ENTERPRISE") {
    const custom = Number(enterpriseUnitPriceJpy);
    if (!Number.isFinite(custom) || custom <= 0) {
      throw new Error("enterpriseUnitPriceJpy is required");
    }
    return custom;
  }

  const displayedPrice = Number(displayedProductPriceJpy);
  if (!Number.isFinite(displayedPrice) || displayedPrice <= 0) {
    throw new Error("displayedProductPriceJpy is required");
  }
  const multiplier = PLAN_MULTIPLIER[normalizedPlan];
  if (!multiplier) throw new Error("unknown qualified referral plan");

  const rule = QUALIFIED_REFERRAL_PRICE_RULES[
    normalizedReferralCategory(category)
  ];
  const charge = displayedPrice * rule.rate * multiplier;
  return Math.round(charge * 1_000_000) / 1_000_000;
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
