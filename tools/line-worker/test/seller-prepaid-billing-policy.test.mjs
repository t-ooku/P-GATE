import test from "node:test";
import assert from "node:assert/strict";
import {
  consumePerformanceCredit,
  prepaidBillingState,
  resumeAfterConfirmedPayment,
} from "../src/seller-prepaid-billing-policy.mjs";

test("翌利用期間の開始時に未払いなら契約直リンクと機能を停止する", () => {
  const state = prepaidBillingState({
    now: "2026-09-01T00:00:00Z",
    paidThrough: "2026-09-01T00:00:00Z",
  });
  assert.equal(state.status, "SUSPENDED_UNPAID");
  assert.equal(state.sellerDirectLinksEnabled, false);
  assert.equal(state.sellerConsoleEnabled, false);
  assert.equal(state.accruesReceivable, false);
});

test("支払い済み期間内は停止しない", () => {
  const state = prepaidBillingState({
    now: "2026-08-15T00:00:00Z",
    paidThrough: "2026-09-01T00:00:00Z",
  });
  assert.equal(state.status, "ACTIVE");
  assert.equal(state.sellerDirectLinksEnabled, true);
});

test("成果報酬残高が停止基準以下なら新しい送客を止める", () => {
  const state = prepaidBillingState({
    now: "2026-08-15T00:00:00Z",
    paidThrough: "2026-09-01T00:00:00Z",
    performancePlan: true,
    performanceBalanceJpy: 10_000,
    performanceReserveFloorJpy: 10_000,
  });
  assert.equal(state.status, "SUSPENDED_UNPAID");
  assert.equal(state.reason, "PERFORMANCE_BALANCE_BELOW_FLOOR");
});

test("成果報酬を前払い残高から消化し不足時は債権化しない", () => {
  assert.deepEqual(consumePerformanceCredit({
    balanceJpy: 5_000,
    attributedFeeJpy: 6_000,
    reserveFloorJpy: 1_000,
  }), {
    accepted: false,
    balanceJpy: 5_000,
    status: "SUSPENDED_UNPAID",
    sellerDirectLinksEnabled: false,
  });
});

test("署名確認済みの支払イベントだけで再開する", () => {
  const unverified = resumeAfterConfirmedPayment({
    previousStatus: "SUSPENDED_UNPAID",
    paymentEventVerified: false,
    paidThrough: "2026-10-01T00:00:00Z",
  });
  assert.equal(unverified.status, "SUSPENDED_UNPAID");

  const verified = resumeAfterConfirmedPayment({
    previousStatus: "SUSPENDED_UNPAID",
    paymentEventVerified: true,
    paidThrough: "2026-10-01T00:00:00Z",
    now: "2026-09-01T00:00:00Z",
  });
  assert.equal(verified.status, "ACTIVE");
  assert.equal(verified.sellerDirectLinksEnabled, true);
});
