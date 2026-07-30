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

export const prepaidBillingStatuses = Object.freeze({
  ACTIVE,
  SUSPENDED_UNPAID,
});
