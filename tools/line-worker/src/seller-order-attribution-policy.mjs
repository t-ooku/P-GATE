const SELLER = "VERIFIED_SELLER_ORDER";
const AFFILIATE = "MARKETPLACE_AFFILIATE_CONVERSION";
const ASSIST = "ASSISTED_CLICK_ONLY";

export function classifyOrderAttribution({
  signedClickVerified = false,
  sellerOrderProofVerified = false,
  clickAndOrderProductMatch = false,
  withinContractWindow = false,
  marketplaceAffiliateConfirmed = false,
  alreadyAttributed = false,
  marketplaceForbidsDoubleCompensation = false,
} = {}) {
  if (alreadyAttributed) {
    return {
      classification: "DUPLICATE",
      sellerPerformanceBillable: false,
      marketplaceAffiliateRevenue: false,
      reason: "ORDER_ALREADY_ATTRIBUTED",
    };
  }

  const sellerVerified =
    signedClickVerified &&
    sellerOrderProofVerified &&
    clickAndOrderProductMatch &&
    withinContractWindow;

  if (
    sellerVerified &&
    !(marketplaceAffiliateConfirmed && marketplaceForbidsDoubleCompensation)
  ) {
    return {
      classification: SELLER,
      sellerPerformanceBillable: true,
      marketplaceAffiliateRevenue: false,
      reason: "DETERMINISTIC_SELLER_PROOF",
    };
  }

  if (marketplaceAffiliateConfirmed) {
    return {
      classification: AFFILIATE,
      sellerPerformanceBillable: false,
      marketplaceAffiliateRevenue: true,
      reason: sellerVerified
        ? "MARKETPLACE_RULE_PREVENTS_DOUBLE_COMPENSATION"
        : "MARKETPLACE_REPORT",
    };
  }

  return {
    classification: ASSIST,
    sellerPerformanceBillable: false,
    marketplaceAffiliateRevenue: false,
    reason: "NO_DETERMINISTIC_ORDER_PROOF",
  };
}

export const orderAttributionClasses = Object.freeze({
  SELLER,
  AFFILIATE,
  ASSIST,
});
