import test from "node:test";
import assert from "node:assert/strict";

import {
  createMemberWish,
  deleteMemberWish,
  memberWishView,
  sortMemberWishes,
  updateMemberWish,
} from "../src/member-wish-policy.mjs";

function fixture() {
  return createMemberWish({
    memberId: "member-1",
    query: "丸くてシリコンっぽい台所用品",
    categoryId: "kitchen",
    now: new Date("2026-07-24T00:00:00Z"),
    idFactory: () => "wish-1",
  });
}

test("creates a member wish with default notification choices", () => {
  const wish = fixture();
  assert.equal(wish.wish_id, "wish-1");
  assert.deepEqual(wish.notifications, ["sale_start", "price_drop"]);
});

test("member can change notification conditions", () => {
  const updated = updateMemberWish(
    fixture(),
    { notifications: ["coupon", "restock", "invalid"] },
    new Date("2026-07-24T01:00:00Z"),
  );
  assert.deepEqual(updated.notifications, ["coupon", "restock"]);
});

test("only the owner can view or delete the wish", () => {
  assert.throws(() => memberWishView(fixture(), "other"), /denied/);
  assert.throws(() => deleteMemberWish(fixture(), "other"), /denied/);
});

test("deletion removes member ID, raw query and product from retained record", () => {
  const deleted = deleteMemberWish(
    fixture(),
    "member-1",
    new Date("2026-07-25T00:00:00Z"),
  );
  assert.equal(deleted.deletedWish.member_id, "");
  assert.equal(deleted.deletedWish.query, "");
  assert.equal(deleted.deletedWish.product_id, "");
  assert.equal(deleted.analyticsEvent.event_type, "wish_deleted");
  assert.equal(Object.hasOwn(deleted.analyticsEvent, "member_id"), false);
  assert.equal(Object.hasOwn(deleted.analyticsEvent, "query"), false);
});

test("sorts active wishes by most recently updated", () => {
  const older = fixture();
  const newer = {
    ...fixture(),
    wish_id: "wish-2",
    updated_at: "2026-07-25T00:00:00Z",
  };
  assert.deepEqual(
    sortMemberWishes([older, newer]).map((wish) => wish.wish_id),
    ["wish-2", "wish-1"],
  );
});
