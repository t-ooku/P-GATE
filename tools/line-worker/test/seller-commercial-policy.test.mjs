import test from "node:test";
import assert from "node:assert/strict";
import {
  attributedFeeBase,
  commercialTerms,
  recommendedSellerPlan,
  sellerLifecycleMonth,
} from "../src/seller-commercial-policy.mjs";

test("参加後3か月は月額0円・成果報酬6%を提案する", () => {
  assert.equal(recommendedSellerPlan({
    lifecycleMonth: 3,
    catalogCount: 100_000,
    attributedGmvJpy: 20_000_000,
  }), "LAUNCH_PERFORMANCE");
  assert.deepEqual(
    commercialTerms("LAUNCH_PERFORMANCE"),
    {
      name: "LAUNCH_PERFORMANCE",
      monthlyFeeJpy: 0,
      performanceFeeRate: 0.06,
      catalogLimit: 50_000,
      attributedGmvLimitJpy: Infinity,
    },
  );
});

test("4か月目以降は商品数と帰属売上の大きい方で推奨する", () => {
  assert.equal(recommendedSellerPlan({
    lifecycleMonth: 4,
    catalogCount: 200,
    attributedGmvJpy: 100_000,
  }), "STARTER");
  assert.equal(recommendedSellerPlan({
    lifecycleMonth: 4,
    catalogCount: 4_000,
    attributedGmvJpy: 200_000,
  }), "GROWTH");
  assert.equal(recommendedSellerPlan({
    lifecycleMonth: 4,
    catalogCount: 200,
    attributedGmvJpy: 5_000_000,
  }), "SCALE");
});

test("成果報酬のみの継続は導入期間より高い10%", () => {
  assert.equal(commercialTerms("PERFORMANCE_ONLY").monthlyFeeJpy, 0);
  assert.equal(commercialTerms("PERFORMANCE_ONLY").performanceFeeRate, 0.1);
});

test("返品を控除し税と送料を成果報酬対象にしない", () => {
  assert.equal(attributedFeeBase({
    itemSubtotalJpy: 20_000,
    taxJpy: 2_000,
    shippingJpy: 800,
    refundedItemSubtotalJpy: 5_000,
  }), 15_000);
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
