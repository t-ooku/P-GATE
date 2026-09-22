import test from "node:test";
import assert from "node:assert/strict";

import {
  authorizeAction,
  navigationForPrincipal,
  principalFromSession,
  requireAuthorization,
} from "../src/access-policy.mjs";

test("guest can search but cannot create a cloud wish", () => {
  const guest = principalFromSession(null);
  assert.equal(
    authorizeAction({ principal: guest, action: "search:execute" }).allowed,
    true,
  );
  const wish = authorizeAction({ principal: guest, action: "wish:create" });
  assert.equal(wish.allowed, false);
  assert.equal(wish.code, "LOGIN_REQUIRED");
});

test("member can manage only their own wish", () => {
  const member = principalFromSession({
    subject: "member-1",
    role: "member",
  });
  assert.equal(
    authorizeAction({
      principal: member,
      action: "wish:update",
      resource: { member_id: "member-1" },
    }).allowed,
    true,
  );
  assert.equal(
    authorizeAction({
      principal: member,
      action: "wish:delete",
      resource: { member_id: "member-2" },
    }).code,
    "RESOURCE_OWNER_MISMATCH",
  );
});

test("seller is restricted to its own tenant", () => {
  const seller = principalFromSession({
    subject: "seller-user-1",
    role: "seller",
    tenant: "itg",
  });
  assert.equal(
    authorizeAction({
      principal: seller,
      action: "seller:catalog:view",
      targetTenant: "itg",
    }).allowed,
    true,
  );
  assert.equal(
    authorizeAction({
      principal: seller,
      action: "seller:demand:view",
      targetTenant: "itt",
    }).code,
    "TENANT_BOUNDARY_VIOLATION",
  );
});

test("seller cannot call operator functions", () => {
  const seller = principalFromSession({
    subject: "seller-user-1",
    role: "seller",
    tenant: "itg",
  });
  assert.throws(
    () =>
      requireAuthorization({
        principal: seller,
        action: "operator:audit:view",
      }),
    /ROLE_FORBIDDEN/,
  );
});

test("navigation separates member and seller experiences", () => {
  const memberNav = navigationForPrincipal(
    principalFromSession({ subject: "m1", role: "member" }),
  );
  const sellerNav = navigationForPrincipal(
    principalFromSession({ subject: "s1", role: "seller", tenant: "itg" }),
  );
  assert.ok(memberNav.includes("my_wishes"));
  assert.equal(memberNav.includes("seller_dashboard"), false);
  assert.ok(sellerNav.includes("seller_dashboard"));
  assert.equal(sellerNav.includes("my_wishes"), false);
});
