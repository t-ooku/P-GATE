import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyOrderAttribution,
} from "../src/seller-order-attribution-policy.mjs";

test("署名クリックと注文証跡が一致した注文だけ成果報酬対象", () => {
  const result = classifyOrderAttribution({
    signedClickVerified: true,
    sellerOrderProofVerified: true,
    clickAndOrderProductMatch: true,
    withinContractWindow: true,
  });
  assert.equal(result.classification, "VERIFIED_SELLER_ORDER");
  assert.equal(result.sellerPerformanceBillable, true);
});

test("後日の直接購入らしき注文は推測で請求しない", () => {
  const result = classifyOrderAttribution({
    signedClickVerified: true,
    sellerOrderProofVerified: false,
    clickAndOrderProductMatch: false,
    withinContractWindow: true,
  });
  assert.equal(result.classification, "ASSISTED_CLICK_ONLY");
  assert.equal(result.sellerPerformanceBillable, false);
});

test("公式アフィリエイトレポートはセラー成果報酬と分離する", () => {
  const result = classifyOrderAttribution({
    marketplaceAffiliateConfirmed: true,
  });
  assert.equal(result.classification, "MARKETPLACE_AFFILIATE_CONVERSION");
  assert.equal(result.sellerPerformanceBillable, false);
  assert.equal(result.marketplaceAffiliateRevenue, true);
});

test("二重報酬禁止のモール成果をセラーへ二重請求しない", () => {
  const result = classifyOrderAttribution({
    signedClickVerified: true,
    sellerOrderProofVerified: true,
    clickAndOrderProductMatch: true,
    withinContractWindow: true,
    marketplaceAffiliateConfirmed: true,
    marketplaceForbidsDoubleCompensation: true,
  });
  assert.equal(result.classification, "MARKETPLACE_AFFILIATE_CONVERSION");
  assert.equal(result.sellerPerformanceBillable, false);
});

test("同じ注文IDの再送は成果へ再計上しない", () => {
  const result = classifyOrderAttribution({
    signedClickVerified: true,
    sellerOrderProofVerified: true,
    clickAndOrderProductMatch: true,
    withinContractWindow: true,
    alreadyAttributed: true,
  });
  assert.equal(result.classification, "DUPLICATE");
  assert.equal(result.sellerPerformanceBillable, false);
});
