import test from "node:test";
import assert from "node:assert/strict";
import {
  BUSINESS_MONTHLY_REFERRAL_FREE_ALLOWANCE_JPY,
  isBillableQualifiedReferral,
  monthlyQualifiedReferralInvoiceJpy,
  monthlyReferralFreeAllowanceJpy,
  normalizedReferralCategory,
  qualifiedReferralUnitPriceJpy,
  settledQualifiedReferralChargeJpy,
} from "../src/seller-qualified-referral-pricing.mjs";

// 2026-09-03 大隆さん決定: 無料プランは定価、Business は定価の50%。
test("無料プラン（Businessなし）はジャンルごとの定価を有効クリック1件ごとに課金する", () => {
  assert.equal(qualifiedReferralUnitPriceJpy({ category: "FASHION", plan: "SELLER" }), 38);
  assert.equal(qualifiedReferralUnitPriceJpy({ category: "COSMETICS", plan: "SELLER" }), 57);
  assert.equal(qualifiedReferralUnitPriceJpy({ category: "GADGET", plan: "SELLER" }), 29);
  assert.equal(qualifiedReferralUnitPriceJpy({ category: "FOOD", plan: "SELLER" }), 47);
  assert.equal(qualifiedReferralUnitPriceJpy({ category: "AUTOMOTIVE", plan: "SELLER" }), 20);
  assert.equal(qualifiedReferralUnitPriceJpy({ category: "OTHER", plan: "SELLER" }), 33);
  assert.equal(settledQualifiedReferralChargeJpy([38, 57, 19]), 114);
  // 無料プランに月の無料枠はない。
  assert.equal(monthlyReferralFreeAllowanceJpy("SELLER"), 0);
  assert.deepEqual(monthlyQualifiedReferralInvoiceJpy({ plan: "SELLER", charges: [38, 38] }),
    { accruedJpy: 76, freeAllowanceJpy: 0, billableJpy: 76 });
});

test("Businessの有効クリック単価は商品価格ではなく、ジャンル定価の50%で固定する", () => {
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "FASHION",
    plan: "BUSINESS",
    displayedProductPriceJpy: 8_000,
  }), 19);
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "COSMETICS",
    plan: "BUSINESS",
    displayedProductPriceJpy: 500,
  }), 29);
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "GADGET",
    plan: "BUSINESS",
    displayedProductPriceJpy: 100_000,
  }), 15);
  assert.equal(qualifiedReferralUnitPriceJpy({ category: "FOOD", plan: "BUSINESS" }), 24);
  assert.equal(qualifiedReferralUnitPriceJpy({ category: "AUTOMOTIVE", plan: "BUSINESS" }), 10);
  assert.equal(qualifiedReferralUnitPriceJpy({ category: "OTHER", plan: "BUSINESS" }), 17);
});

test("Businessは毎月、割引単価で積算した送客料5,000円まで0円・5,001円から課金する", () => {
  assert.equal(BUSINESS_MONTHLY_REFERRAL_FREE_ALLOWANCE_JPY, 5000);
  assert.equal(monthlyReferralFreeAllowanceJpy("BUSINESS"), 5000);
  // 5,000円ちょうどは0円。
  assert.deepEqual(monthlyQualifiedReferralInvoiceJpy({ plan: "BUSINESS", charges: Array(200).fill(25) }),
    { accruedJpy: 5000, freeAllowanceJpy: 5000, billableJpy: 0 });
  // 5,001円目から課金。
  assert.deepEqual(monthlyQualifiedReferralInvoiceJpy({ plan: "BUSINESS", charges: [...Array(200).fill(25), 1] }),
    { accruedJpy: 5001, freeAllowanceJpy: 5000, billableJpy: 1 });
  // ファッション300クリック = 5,700円 → 700円。
  assert.deepEqual(monthlyQualifiedReferralInvoiceJpy({ plan: "BUSINESS", charges: Array(300).fill(19) }),
    { accruedJpy: 5700, freeAllowanceJpy: 5000, billableJpy: 700 });
  // クリック0件は0円（無料枠はマイナスにならない）。
  assert.deepEqual(monthlyQualifiedReferralInvoiceJpy({ plan: "BUSINESS", charges: [] }),
    { accruedJpy: 0, freeAllowanceJpy: 5000, billableJpy: 0 });
});

test("ジャンル判定不能はOTHERを使用する", () => {
  assert.equal(normalizedReferralCategory("unknown"), "OTHER");
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "unknown",
    plan: "BUSINESS",
  }), 17);
  assert.equal(qualifiedReferralUnitPriceJpy({
    category: "unknown",
    plan: "SELLER",
  }), 33);
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
