import test from "node:test";
import assert from "node:assert/strict";
import {
  isBillableQualifiedReferral,
  normalizedReferralCategory,
  qualifiedReferralUnitPriceJpy,
  settledQualifiedReferralChargeJpy,
} from "../src/seller-qualified-referral-pricing.mjs";

test("表示商品価格へジャンル固定料率とプラン倍率だけを適用する", () => {
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "FASHION",
    plan: "STARTER",
    displayedProductPriceJpy: 8_000,
  }), 6.4);
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "FASHION",
    plan: "GROWTH",
    displayedProductPriceJpy: 8_000,
  }), 5.44);
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "GADGET",
    plan: "SCALE",
    displayedProductPriceJpy: 100_000,
  }), 42);
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "FOOD",
    plan: "PERFORMANCE_ONLY",
    displayedProductPriceJpy: 500,
  }), 0.75);
});

test("クリック単位で丸めず合計時に一度だけ円へ丸める", () => {
  assert.equal(settledQualifiedReferralChargeJpy([0.75, 0.75, 6.4]), 8);
});

test("ジャンル判定不能はOTHERを使用する", () => {
  assert.equal(normalizedReferralCategory("unknown"), "OTHER");
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "unknown",
    plan: "STARTER",
    displayedProductPriceJpy: 6_000,
  }), 4.2);
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
  }), 17.2);
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
