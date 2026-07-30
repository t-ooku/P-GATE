import test from "node:test";
import assert from "node:assert/strict";
import {
  isBillableQualifiedReferral,
  normalizedReferralCategory,
  qualifiedReferralUnitPriceJpy,
} from "../src/seller-qualified-referral-pricing.mjs";

test("表示商品価格へジャンル料率・上下限・プラン倍率を適用する", () => {
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "FASHION",
    plan: "STARTER",
    displayedProductPriceJpy: 8_000,
  }), 12);
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "FASHION",
    plan: "GROWTH",
    displayedProductPriceJpy: 8_000,
  }), 11);
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "GADGET",
    plan: "SCALE",
    displayedProductPriceJpy: 100_000,
  }), 42);
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "FOOD",
    plan: "PERFORMANCE_ONLY",
    displayedProductPriceJpy: 500,
  }), 8);
});

test("価格上限により高額商品の過大課金を防ぐ", () => {
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "AUTOMOTIVE",
    plan: "STARTER",
    displayedProductPriceJpy: 500_000,
  }), 100);
});

test("ジャンル判定不能はOTHERを使用する", () => {
  assert.equal(normalizedReferralCategory("unknown"), "OTHER");
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "unknown",
    plan: "STARTER",
    displayedProductPriceJpy: 6_000,
  }), 9);
});

test("表示価格なしでは料率課金しない", () => {
  assert.throws(
    () => qualifiedReferralUnitPriceJpy({
      category: "FASHION",
      plan: "STARTER",
    }),
    /displayedProductPriceJpy/,
  );
});

test("Enterpriseは契約単価を必須にする", () => {
  assert.throws(
    () => qualifiedReferralUnitPriceJpy({
      category: "FOOD",
      plan: "ENTERPRISE",
    }),
    /enterpriseUnitPriceJpy/,
  );
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "FOOD",
    plan: "ENTERPRISE",
    enterpriseUnitPriceJpy: 17.2,
  }), 18);
});

test("出品セラーを固定・照合できた送客だけ課金する", () => {
  const valid = {
    source: "HOSHILU_PRODUCT_CARD",
    contractedSeller: true,
    verifiedProductUrl: true,
    signedClickVerified: true,
    humanVerified: true,
    uniqueWithin24Hours: true,
    internalActor: false,
    redirectCompleted: true,
    displayedPriceVerified: true,
    sellerBoundDestination: true,
    offerSellerId: "SELLER-A",
    billedSellerId: "SELLER-A",
  };
  assert.equal(isBillableQualifiedReferral(valid), true);
  assert.equal(isBillableQualifiedReferral({
    ...valid,
    sellerBoundDestination: false,
  }), false);
  assert.equal(isBillableQualifiedReferral({
    ...valid,
    billedSellerId: "SELLER-B",
  }), false);
  assert.equal(isBillableQualifiedReferral({
    ...valid,
    displayedPriceVerified: false,
  }), false);
});
