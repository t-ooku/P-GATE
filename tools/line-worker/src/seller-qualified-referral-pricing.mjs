// 2026-09-03 大隆さん決定（総合実行指示書 §23/§55 の料金2階層）:
// - 無料プラン（Businessなし）: 月額0円。ジャンルごとの「定価」を有効クリック1件ごとに課金。
// - Business（月額¥9,800・登録後3か月は月額0円）: 有効クリックは定価の50%。
//   さらに毎月、割引単価で積算した送客料 ¥5,000 までは 0円、¥5,001 から課金。
//   この無料枠は1か月目から適用し、4か月目以降も続く（月額0円期間の特典ではない）。
// 定価は 2026-07-30 v1.1 で「Businessなし」列に出していた単価をそのまま引き継ぐ。
export const QUALIFIED_REFERRAL_PRICE_RULES = Object.freeze({
  FASHION: Object.freeze({ listUnitPriceJpy: 38 }),
  COSMETICS: Object.freeze({ listUnitPriceJpy: 57 }),
  GADGET: Object.freeze({ listUnitPriceJpy: 29 }),
  LIFESTYLE: Object.freeze({ listUnitPriceJpy: 38 }),
  FOOD: Object.freeze({ listUnitPriceJpy: 47 }),
  HOBBY: Object.freeze({ listUnitPriceJpy: 38 }),
  BABY: Object.freeze({ listUnitPriceJpy: 38 }),
  PET: Object.freeze({ listUnitPriceJpy: 38 }),
  SPORTS: Object.freeze({ listUnitPriceJpy: 29 }),
  AUTOMOTIVE: Object.freeze({ listUnitPriceJpy: 20 }),
  OTHER: Object.freeze({ listUnitPriceJpy: 33 }),
});

// 定価に対する倍率。BUSINESS は 0.5（定価の半額）。
const PLAN_MULTIPLIER = Object.freeze({
  BUSINESS: 0.5,
  SELLER: 1,
  // Historical contract names remain readable for existing charge records.
  LAUNCH_PERFORMANCE: 0.5,
  PERFORMANCE_ONLY: 1,
  STARTER: 0.5,
  GROWTH: 0.5,
  SCALE: 0.5,
});

// Business の毎月の送客料無料枠（割引単価で積算した金額、税込）。
export const BUSINESS_MONTHLY_REFERRAL_FREE_ALLOWANCE_JPY = 5000;

const PLANS_WITH_MONTHLY_FREE_ALLOWANCE = new Set([
  "BUSINESS", "LAUNCH_PERFORMANCE", "STARTER", "GROWTH", "SCALE",
]);

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
  // 端数は円未満を四捨五入（38×0.5=19、57×0.5=28.5→29、29×0.5=14.5→15、47×0.5=23.5→24、33×0.5=16.5→17）。
  return Math.round(rule.listUnitPriceJpy * multiplier);
}

export function monthlyReferralFreeAllowanceJpy(plan) {
  const normalizedPlan = String(plan || "").trim().toUpperCase();
  return PLANS_WITH_MONTHLY_FREE_ALLOWANCE.has(normalizedPlan)
    ? BUSINESS_MONTHLY_REFERRAL_FREE_ALLOWANCE_JPY
    : 0;
}

// 月の請求額。charges は当月の有効クリックごとの単価（割引後）。
// 積算が無料枠以内なら 0 円、超えた分だけ請求する。無料枠は翌月へ繰り越さない。
export function monthlyQualifiedReferralInvoiceJpy({ plan, charges = [] } = {}) {
  const accrued = settledQualifiedReferralChargeJpy(charges);
  const allowance = monthlyReferralFreeAllowanceJpy(plan);
  const billable = Math.max(0, accrued - allowance);
  return { accruedJpy: accrued, freeAllowanceJpy: allowance, billableJpy: billable };
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
