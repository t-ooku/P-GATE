const ACTIVE = "ACTIVE";
const SUSPENDED_UNPAID = "SUSPENDED_UNPAID";

function yen(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
}

function instant(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("valid date is required");
  return date;
}

export function prepaidBillingState({
  now = new Date(),
  paidThrough,
  paymentConfirmed = false,
  performanceBalanceJpy = 0,
  performanceReserveFloorJpy = 0,
  performancePlan = false,
} = {}) {
  const current = instant(now);
  const coverage = instant(paidThrough);
  const monthlyCovered = paymentConfirmed || current < coverage;
  const performanceCovered =
    !performancePlan ||
    yen(performanceBalanceJpy) > yen(performanceReserveFloorJpy);

  if (!monthlyCovered || !performanceCovered) {
    return {
      status: SUSPENDED_UNPAID,
      sellerDirectLinksEnabled: false,
      sellerConsoleEnabled: false,
      accruesReceivable: false,
      reason: !monthlyCovered
        ? "NEXT_PERIOD_NOT_PREPAID"
        : "PERFORMANCE_BALANCE_BELOW_FLOOR",
    };
  }

  return {
    status: ACTIVE,
    sellerDirectLinksEnabled: true,
    sellerConsoleEnabled: true,
    accruesReceivable: false,
    reason: "PREPAID",
  };
}

export function consumePerformanceCredit({
  balanceJpy = 0,
  attributedFeeJpy = 0,
  reserveFloorJpy = 0,
} = {}) {
  const balance = yen(balanceJpy);
  const fee = yen(attributedFeeJpy);
  if (fee > balance) {
    return {
      accepted: false,
      balanceJpy: balance,
      status: SUSPENDED_UNPAID,
      sellerDirectLinksEnabled: false,
    };
  }
  const remaining = balance - fee;
  return {
    accepted: true,
    balanceJpy: remaining,
    status: remaining > yen(reserveFloorJpy) ? ACTIVE : SUSPENDED_UNPAID,
    sellerDirectLinksEnabled: remaining > yen(reserveFloorJpy),
  };
}

export function resumeAfterConfirmedPayment({
  previousStatus,
  paymentEventVerified,
  paidThrough,
  performanceBalanceJpy = 0,
  performanceReserveFloorJpy = 0,
  performancePlan = false,
  now = new Date(),
} = {}) {
  if (!paymentEventVerified) {
    return {
      status: previousStatus || SUSPENDED_UNPAID,
      sellerDirectLinksEnabled: false,
      sellerConsoleEnabled: false,
      accruesReceivable: false,
      reason: "PAYMENT_NOT_VERIFIED",
    };
  }
  return prepaidBillingState({
    now,
    paidThrough,
    paymentConfirmed: true,
    performanceBalanceJpy,
    performanceReserveFloorJpy,
    performancePlan,
  });
}

const REFUND_EXCEPTION_REASONS = new Set([
  "DUPLICATE_CHARGE",
  "INCORRECT_CHARGE",
  "PROVIDER_MATERIAL_BREACH",
  "REQUIRED_BY_LAW",
  "REQUIRED_BY_PAYMENT_NETWORK",
]);

export function sellerRefundDecision({
  reason,
  operatorApprovals = 0,
  legalOrNetworkMandateVerified = false,
} = {}) {
  const normalizedReason = String(reason || "").trim().toUpperCase();
  const exception = REFUND_EXCEPTION_REASONS.has(normalizedReason);
  const mandated = normalizedReason === "REQUIRED_BY_LAW" ||
    normalizedReason === "REQUIRED_BY_PAYMENT_NETWORK";
  const approved =
    exception &&
    (mandated ? legalOrNetworkMandateVerified : Number(operatorApprovals) >= 2);
  return {
    refundable: approved,
    reason: approved ? normalizedReason : "NON_REFUNDABLE",
    manualReviewRequired: exception && !approved,
  };
}

export const prepaidBillingStatuses = Object.freeze({
  ACTIVE,
  SUSPENDED_UNPAID,
});
