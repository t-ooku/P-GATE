import test from "node:test";
import assert from "node:assert/strict";
import {
  commercialTerms,
  recommendedSellerPlan,
  sellerLifecycleMonth,
} from "../src/seller-commercial-policy.mjs";

test("有料サブスクは1事業者アカウント月額9,800円のBusinessだけにする", () => {
  assert.equal(recommendedSellerPlan({ subscription: true }), "BUSINESS");
  assert.deepEqual(
    commercialTerms("BUSINESS"),
    {
      name: "BUSINESS",
      monthlyFeeJpy: 9_800,
      promotionalFreeMonths: 3,
      initialFeeJpy: 0,
      cancellationFeeJpy: 0,
      qualifiedReferralMultiplier: 1,
      insightDepth: "ADVANCED_DEMAND",
      searchApiMonthlyRequests: 10_000,
      searchApiOverageJpy: 4,
      billingUnit: "BUSINESS_ACCOUNT",
    },
  );
});

test("無料掲載と成果課金だけならSellerを使う", () => {
  assert.equal(recommendedSellerPlan({ subscription: false }), "SELLER");
  assert.equal(commercialTerms("SELLER").monthlyFeeJpy, 0);
  assert.equal(commercialTerms("SELLER").qualifiedReferralMultiplier, 1.5);
});

test("契約開始日から導入月を判定する", () => {
  assert.equal(
    sellerLifecycleMonth("2026-07-15T00:00:00Z", new Date("2026-09-14T00:00:00Z")),
    2,
  );
  assert.equal(
    sellerLifecycleMonth("2026-07-15T00:00:00Z", new Date("2026-10-15T00:00:00Z")),
    4,
  );
});
