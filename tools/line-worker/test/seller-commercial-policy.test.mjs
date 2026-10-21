import test from "node:test";
import assert from "node:assert/strict";
import {
  commercialTerms,
  recommendedSellerPlan,
  sellerLifecycleMonth,
} from "../src/seller-commercial-policy.mjs";

test("参加後3か月は月額0円・ジャンル基準送客単価を提案する", () => {
  assert.equal(recommendedSellerPlan({
    lifecycleMonth: 3,
    catalogCount: 100_000,
  }), "LAUNCH_PERFORMANCE");
  assert.deepEqual(
    commercialTerms("LAUNCH_PERFORMANCE"),
    {
      name: "LAUNCH_PERFORMANCE",
      monthlyFeeJpy: 0,
      qualifiedReferralMultiplier: 1,
      treasureMapDelayHours: 168,
      insightDepth: "FULL_KPI_PILOT",
      catalogLimit: 50_000,
    },
  );
});

test("4か月目以降は商品数と個別連携要件から推奨する", () => {
  assert.equal(recommendedSellerPlan({
    lifecycleMonth: 4,
    catalogCount: 200,
  }), "STARTER");
  assert.equal(recommendedSellerPlan({
    lifecycleMonth: 4,
    catalogCount: 4_000,
  }), "GROWTH");
  assert.equal(recommendedSellerPlan({
    lifecycleMonth: 4,
    catalogCount: 40_000,
  }), "SCALE");
  assert.equal(recommendedSellerPlan({
    lifecycleMonth: 4,
    catalogCount: 200,
    requiresEnterpriseIntegration: true,
  }), "ENTERPRISE");
});

test("成果報酬のみの継続は基準送客単価の1.5倍", () => {
  assert.equal(commercialTerms("PERFORMANCE_ONLY").monthlyFeeJpy, 0);
  assert.equal(
    commercialTerms("PERFORMANCE_ONLY").qualifiedReferralMultiplier,
    1.5,
  );
  assert.equal(commercialTerms("PERFORMANCE_ONLY").treasureMapDelayHours, 168);
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
