import test from "node:test";
import assert from "node:assert/strict";
import {
  commercialTerms,
  recommendedSellerPlan,
  sellerLifecycleMonth,
} from "../src/seller-commercial-policy.mjs";

test("Seller is one inclusive 1980 subscription with demand analysis and no click fees", () => {
  const terms=commercialTerms('SELLER');
  assert.equal(recommendedSellerPlan(), 'SELLER');
  assert.equal(terms.monthlyFeeJpy,1980);assert.equal(terms.taxInclusive,true);
  assert.equal(terms.trialDays,30);assert.equal(terms.trialStart,'FIRST_PUBLICATION_SUCCESS');
  assert.equal(terms.cardRequired,true);assert.equal(terms.automaticRenewal,true);
  assert.equal(terms.insightDepth,'ADVANCED_DEMAND');assert.equal(terms.qualifiedReferralMultiplier,0);
  assert.equal(terms.searchApiOverageJpy,undefined);
  assert.throws(()=>commercialTerms('GROWTH'),/unknown/);
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
