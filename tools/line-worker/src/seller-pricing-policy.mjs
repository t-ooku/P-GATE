const PLANS = Object.freeze({
  SELLER: {
    catalog_sync: true,
    basic_insight: true,
    performance_attribution: true,
    advanced_demand_report: false,
    target_price_demand: true,
    scheduled_alert_report: false,
    api_priority_support: false
  },
  BUSINESS: {
    catalog_sync: true,
    basic_insight: true,
    performance_attribution: true,
    advanced_demand_report: true,
    target_price_demand: true,
    scheduled_alert_report: true,
    api_priority_support: true
  },
  LITE: {
    catalog_sync: true,
    basic_insight: true,
    performance_attribution: true,
    advanced_demand_report: false,
    target_price_demand: true,
    scheduled_alert_report: false,
    api_priority_support: false
  },
  PILOT: {
    catalog_sync: true,
    basic_insight: true,
    performance_attribution: true,
    advanced_demand_report: false,
    target_price_demand: true,
    scheduled_alert_report: false,
    api_priority_support: false
  },
  GROWTH: {
    catalog_sync: true,
    basic_insight: true,
    performance_attribution: true,
    advanced_demand_report: true,
    target_price_demand: true,
    scheduled_alert_report: true,
    api_priority_support: false
  },
  PRO: {
    catalog_sync: true,
    basic_insight: true,
    performance_attribution: true,
    advanced_demand_report: true,
    target_price_demand: true,
    scheduled_alert_report: true,
    api_priority_support: true
  },
  PARTNER: {
    catalog_sync: true,
    basic_insight: true,
    performance_attribution: true,
    advanced_demand_report: true,
    target_price_demand: true,
    scheduled_alert_report: true,
    api_priority_support: true
  }
});

export function sellerPlanEntitlements(plan = 'PILOT') {
  return { ...(PLANS[String(plan).toUpperCase()] || PLANS.PILOT) };
}

export function calculateAttributedFee({
  attributedOrderValue = 0,
  performanceFeeRate = 0
} = {}) {
  const orderValue = Math.max(0, Number(attributedOrderValue) || 0);
  const rate = Math.min(1, Math.max(0, Number(performanceFeeRate) || 0));
  return Math.round(orderValue * rate);
}

export function rankWithoutPaidPlacement(candidates = []) {
  return [...candidates].sort((left, right) =>
    Number(right?.relevance_score || 0) - Number(left?.relevance_score || 0) ||
    Number(right?.available === true) - Number(left?.available === true) ||
    Number(left?.total_cost || Number.MAX_SAFE_INTEGER) -
      Number(right?.total_cost || Number.MAX_SAFE_INTEGER)
  );
}

const OFFER_PLAN_PRIORITY = Object.freeze({
  BUSINESS: 1,
  SELLER: 5,
  ENTERPRISE: 0,
  PARTNER: 0,
  SCALE: 1,
  PRO: 1,
  GROWTH: 2,
  STARTER: 3,
  LITE: 3,
  LAUNCH_PERFORMANCE: 4,
  PILOT: 4,
  PERFORMANCE_ONLY: 5,
  UNCONTRACTED: 6,
});

function clean(value) {
  return String(value || "").trim();
}

function planPriority(offer) {
  const plan = clean(
    offer?.commercial_plan || offer?.seller_plan || offer?.plan || "UNCONTRACTED",
  ).toUpperCase();
  return OFFER_PLAN_PRIORITY[plan] ?? OFFER_PLAN_PRIORITY.UNCONTRACTED;
}

export function productIdentityKey(product = {}) {
  const marketplace = clean(product.marketplace || product.marketplace_id).toUpperCase();
  const productId = clean(
    product.external_product_id || product.product_id || product.asin,
  ).toUpperCase();
  const variantId = clean(
    product.variant_id || product.variation_id || product.child_product_id,
  ).toUpperCase();
  if (!marketplace || !productId) return "";
  return `${marketplace}:${productId}${variantId ? `:${variantId}` : ""}`;
}

export function shouldMergeMarketplaceProducts(left, right) {
  const leftKey = productIdentityKey(left);
  return Boolean(leftKey) && leftKey === productIdentityKey(right);
}

export function rankContractedSellerOffers(offers = []) {
  return [...offers]
    .map((offer, index) => ({ offer, index }))
    .sort((left, right) => {
      const plan = planPriority(left.offer) - planPriority(right.offer);
      if (plan) return plan;
      const leftObserved =
        Date.parse(left.offer.verified_at || left.offer.observed_at || "") || 0;
      const rightObserved =
        Date.parse(right.offer.verified_at || right.offer.observed_at || "") || 0;
      if (leftObserved !== rightObserved) return rightObserved - leftObserved;
      const leftRegistered =
        Date.parse(left.offer.registered_at || left.offer.created_at || "") ||
        Number.MAX_SAFE_INTEGER;
      const rightRegistered =
        Date.parse(right.offer.registered_at || right.offer.created_at || "") ||
        Number.MAX_SAFE_INTEGER;
      return (
        leftRegistered - rightRegistered ||
        clean(left.offer.offer_id).localeCompare(clean(right.offer.offer_id)) ||
        left.index - right.index
      );
    })
    .map(({ offer }) => offer);
}

export function rankEligibleSellerProducts(
  candidates = [],
  { minimumRelevance = 0.45 } = {},
) {
  return [...candidates]
    .filter((candidate) =>
      Number(candidate?.relevance_score || 0) >= minimumRelevance &&
      candidate?.verified_product_url === true)
    .sort((left, right) => {
      const leftContracted = left?.contracted_seller === true ? 1 : 0;
      const rightContracted = right?.contracted_seller === true ? 1 : 0;
      return (
        rightContracted - leftContracted ||
        Number(right?.relevance_score || 0) - Number(left?.relevance_score || 0)
      );
    });
}

export const sellerPricingPrinciples = Object.freeze({
  catalog_registration: 'FREE',
  basic_insight: 'FREE',
  outbound_attribution: 'PERFORMANCE_BASED',
  advanced_demand_analytics: 'SUBSCRIPTION_OPTION',
  scheduled_reports: 'SUBSCRIPTION_OPTION',
  paid_search_ranking: 'CONTRACTED_DIRECT_LINKS_AFTER_RELEVANCE_GATE',
  same_product_offer_priority:
    'BUSINESS_SELLER_UNCONTRACTED_WITH_LEGACY_PLAN_COMPATIBILITY',
  product_identity: 'MARKETPLACE_PRODUCT_ID_AND_VARIANT_ID'
});
