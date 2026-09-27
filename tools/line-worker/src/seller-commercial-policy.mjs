import {MONTHLY_JPY,AUTO_RENEW_OFFER,AUTO_RENEW_TERMS} from '../public/seller-trial-policy.mjs';
const current=Object.freeze({monthlyFeeJpy:MONTHLY_JPY,currency:'jpy',taxInclusive:true,trialDays:30,trialStart:'FIRST_PUBLICATION_SUCCESS',cardRequired:true,automaticRenewal:true,offerVersion:AUTO_RENEW_OFFER,termsVersion:AUTO_RENEW_TERMS,initialFeeJpy:0,cancellationFeeJpy:0,qualifiedReferralMultiplier:0,insightDepth:'ADVANCED_DEMAND',billingUnit:'BUSINESS_ACCOUNT'});
export const SELLER_COMMERCIAL_PLANS=Object.freeze({SELLER:current});
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

export function recommendedSellerPlan() { return 'SELLER'; }

export function commercialTerms(planName) {
  const name = String(planName || "").toUpperCase();
  const plan = SELLER_COMMERCIAL_PLANS[name];
  if (!plan) throw new Error("unknown seller commercial plan");
  return { name, ...plan };
}
