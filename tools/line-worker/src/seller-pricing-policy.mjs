const PLANS = Object.freeze({
  LITE: {
    catalog_sync: true,
    basic_insight: true,
    performance_attribution: true,
    advanced_demand_report: false,
    scheduled_alert_report: false,
    api_priority_support: false
  },
  PILOT: {
    catalog_sync: true,
    basic_insight: true,
    performance_attribution: true,
    advanced_demand_report: false,
    scheduled_alert_report: false,
    api_priority_support: false
  },
  GROWTH: {
    catalog_sync: true,
    basic_insight: true,
    performance_attribution: true,
    advanced_demand_report: true,
    scheduled_alert_report: true,
    api_priority_support: false
  },
  PRO: {
    catalog_sync: true,
    basic_insight: true,
    performance_attribution: true,
    advanced_demand_report: true,
    scheduled_alert_report: true,
    api_priority_support: true
  },
  PARTNER: {
    catalog_sync: true,
    basic_insight: true,
    performance_attribution: true,
    advanced_demand_report: true,
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

export const sellerPricingPrinciples = Object.freeze({
  catalog_registration: 'FREE',
  basic_insight: 'FREE',
  outbound_attribution: 'PERFORMANCE_BASED',
  advanced_demand_analytics: 'SUBSCRIPTION_OPTION',
  scheduled_reports: 'SUBSCRIPTION_OPTION',
  paid_search_ranking: 'FORBIDDEN',
  same_asin_offer_priority: 'PARTNER_PRO_GROWTH_LITE'
});
