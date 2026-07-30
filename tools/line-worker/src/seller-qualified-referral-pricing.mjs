export const QUALIFIED_REFERRAL_PRICE_RULES = Object.freeze({
  FASHION: Object.freeze({ rate: 0.0015, minimumJpy: 8, maximumJpy: 40 }),
  COSMETICS: Object.freeze({ rate: 0.0025, minimumJpy: 8, maximumJpy: 35 }),
  GADGET: Object.freeze({ rate: 0.0012, minimumJpy: 10, maximumJpy: 60 }),
  LIFESTYLE: Object.freeze({ rate: 0.0018, minimumJpy: 8, maximumJpy: 40 }),
  FOOD: Object.freeze({ rate: 0.0025, minimumJpy: 5, maximumJpy: 25 }),
  HOBBY: Object.freeze({ rate: 0.0018, minimumJpy: 8, maximumJpy: 45 }),
  BABY: Object.freeze({ rate: 0.002, minimumJpy: 8, maximumJpy: 40 }),
  PET: Object.freeze({ rate: 0.0022, minimumJpy: 8, maximumJpy: 35 }),
  SPORTS: Object.freeze({ rate: 0.0015, minimumJpy: 10, maximumJpy: 60 }),
  AUTOMOTIVE: Object.freeze({ rate: 0.001, minimumJpy: 15, maximumJpy: 100 }),
  OTHER: Object.freeze({ rate: 0.0015, minimumJpy: 8, maximumJpy: 45 }),
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
    return Math.ceil(custom);
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
  const categoryPrice = Math.min(
    rule.maximumJpy,
    Math.max(rule.minimumJpy, displayedPrice * rule.rate),
  );
  return Math.ceil(categoryPrice * multiplier);
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
