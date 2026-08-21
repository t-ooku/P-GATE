import test from "node:test";
import assert from "node:assert/strict";
import {
  isBillableQualifiedReferral,
  normalizedReferralCategory,
  qualifiedReferralUnitPriceJpy,
  settledQualifiedReferralChargeJpy,
} from "../src/seller-qualified-referral-pricing.mjs";

test("Businessの有効クリック単価は商品価格ではなくジャンルごとに固定する", () => {
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "FASHION",
    plan: "BUSINESS",
    displayedProductPriceJpy: 8_000,
  }), 25);
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "COSMETICS",
    plan: "BUSINESS",
    displayedProductPriceJpy: 500,
  }), 38);
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "GADGET",
    plan: "BUSINESS",
    displayedProductPriceJpy: 100_000,
  }), 19);
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "AUTOMOTIVE",
    plan: "BUSINESS",
  }), 13);
});

test("月額なしの優先掲載はジャンル単価の1.5倍を円単位で確定する", () => {
  assert.equal(qualifiedReferralUnitPriceJpy({ category: "FASHION", plan: "SELLER" }), 38);
  assert.equal(qualifiedReferralUnitPriceJpy({ category: "COSMETICS", plan: "SELLER" }), 57);
  assert.equal(settledQualifiedReferralChargeJpy([38, 57, 19]), 114);
});

test("ジャンル判定不能はOTHERを使用する", () => {
  assert.equal(normalizedReferralCategory("unknown"), "OTHER");
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "unknown",
    plan: "BUSINESS",
  }), 22);
});

test("未定義の契約プランでは課金しない", () => {
  assert.throws(
    () => qualifiedReferralUnitPriceJpy({
      category: "FASHION",
      plan: "UNKNOWN",
    }),
    /unknown qualified referral plan/,
  );
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
