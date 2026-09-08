import test from "node:test";
import assert from "node:assert/strict";

import {
  activateSellerCatalog,
  createSellerApplication,
  recordApiAuthorization,
  reviewSellerApplication,
  submitSellerApplication,
} from "../src/seller-onboarding-policy.mjs";

function draft() {
  return createSellerApplication(
    {
      tenant: "itg",
      display_name: "with care",
      legal_name: "ITG",
      contact_email: "seller@example.com",
      marketplace: "amazon_jp",
      merchant_id: "A19ONFBH56J9DF",
      storefront_url: "https://www.amazon.co.jp/",
      contains_secret: false,
    },
    {
      now: new Date("2026-07-24T00:00:00Z"),
      idFactory: () => "application-1",
    },
  );
}

test("valid Amazon seller can submit an application", () => {
  const submitted = submitSellerApplication(
    draft(),
    new Date("2026-07-24T01:00:00Z"),
  );
  assert.equal(submitted.status, "submitted");
  assert.equal(submitted.catalog_visibility, "hidden");
});

test("secret-bearing seller metadata is rejected", () => {
  assert.throws(
    () =>
      createSellerApplication({
        ...draft(),
        contains_secret: true,
      }),
    /secrets are forbidden/,
  );
});

test("approval still keeps catalog hidden", () => {
  const reviewed = reviewSellerApplication(
    submitSellerApplication(draft()),
    "approve",
    { reviewerId: "operator-1" },
  );
  assert.equal(reviewed.application.status, "approved");
  assert.equal(reviewed.application.catalog_visibility, "hidden");
});

test("catalog becomes visible only after API auth and reconciliation", () => {
  const approved = reviewSellerApplication(
    submitSellerApplication(draft()),
    "approve",
    { reviewerId: "operator-1" },
  ).application;
  const authorized = recordApiAuthorization(approved, {
    authorizationId: "authorization-1",
    marketplaceId: "A1VC38T7YXB528",
  });
  const active = activateSellerCatalog(authorized, {
    passed: true,
    catalogCount: 300000,
  });
  assert.equal(active.catalog_visibility, "visible");
  assert.equal(active.initial_catalog_count, 300000);
});

test("catalog cannot activate before reconciliation", () => {
  const approved = reviewSellerApplication(
    submitSellerApplication(draft()),
    "approve",
    { reviewerId: "operator-1" },
  ).application;
  const authorized = recordApiAuthorization(approved, {
    authorizationId: "authorization-1",
  });
  assert.throws(
    () => activateSellerCatalog(authorized, { passed: false }),
    /reconciliation/,
  );
});
