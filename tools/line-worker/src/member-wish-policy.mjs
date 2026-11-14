/**
 * Member-managed HOSHILU wish policy.
 *
 * Raw wish text belongs to the member and is removed on deletion.
 * A minimal anonymous tombstone may remain for aggregate product-demand metrics.
 */

export const WISH_NOTIFICATION_TYPES = Object.freeze([
  "sale_start",
  "price_drop",
  "coupon",
  "restock",
]);

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function uniqueNotifications(values) {
  const allowed = new Set(WISH_NOTIFICATION_TYPES);
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value))
        .filter((value) => allowed.has(value)),
    ),
  ];
}

export function createMemberWish({
  memberId,
  query,
  locale = "ja",
  notifications = ["sale_start", "price_drop"],
  productId = "",
  categoryId = "",
  now = new Date(),
  idFactory = () => crypto.randomUUID(),
}) {
  const normalizedMemberId = cleanText(memberId, 128);
  const normalizedQuery = cleanText(query, 1000);
  if (!normalizedMemberId) throw new Error("memberId is required");
  if (!normalizedQuery) throw new Error("query is required");

  const timestamp = now.toISOString();
  return {
    wish_id: idFactory(),
    member_id: normalizedMemberId,
    query: normalizedQuery,
    locale: cleanText(locale, 12) || "ja",
    product_id: cleanText(productId, 128),
    category_id: cleanText(categoryId, 128),
    notifications: uniqueNotifications(notifications),
    status: "active",
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: "",
  };
}

export function updateMemberWish(wish, patch, now = new Date()) {
  if (!wish || wish.status !== "active") {
    throw new Error("Only an active wish can be updated");
  }
  const next = {
    ...wish,
    updated_at: now.toISOString(),
  };
  if (Object.hasOwn(patch || {}, "notifications")) {
    next.notifications = uniqueNotifications(patch.notifications);
  }
  if (Object.hasOwn(patch || {}, "query")) {
    const query = cleanText(patch.query, 1000);
    if (!query) throw new Error("query cannot be empty");
    next.query = query;
  }
  return next;
}

export function memberWishView(wish, requestingMemberId) {
  if (!wish || wish.status !== "active") return null;
  if (String(wish.member_id) !== String(requestingMemberId || "")) {
    throw new Error("Wish access denied");
  }
  return {
    wish_id: wish.wish_id,
    query: wish.query,
    locale: wish.locale,
    product_id: wish.product_id,
    category_id: wish.category_id,
    notifications: [...wish.notifications],
    created_at: wish.created_at,
    updated_at: wish.updated_at,
  };
}

/**
 * Returns:
 * - deletedWish: member-owned record with raw text removed;
 * - analyticsEvent: no member ID and no raw query.
 */
export function deleteMemberWish(wish, requestingMemberId, now = new Date()) {
  if (!wish || wish.status !== "active") {
    throw new Error("Active wish not found");
  }
  if (String(wish.member_id) !== String(requestingMemberId || "")) {
    throw new Error("Wish access denied");
  }
  const deletedAt = now.toISOString();
  return {
    deletedWish: {
      wish_id: wish.wish_id,
      member_id: "",
      query: "",
      locale: wish.locale,
      product_id: "",
      category_id: "",
      notifications: [],
      status: "deleted",
      created_at: wish.created_at,
      updated_at: deletedAt,
      deleted_at: deletedAt,
    },
    analyticsEvent: {
      event_type: "wish_deleted",
      locale: wish.locale,
      category_id: cleanText(wish.category_id, 128),
      had_product_match: Boolean(wish.product_id),
      notification_count: wish.notifications.length,
      created_date: String(wish.created_at || "").slice(0, 10),
      deleted_date: deletedAt.slice(0, 10),
    },
  };
}

export function sortMemberWishes(wishes) {
  return (Array.isArray(wishes) ? wishes : [])
    .filter((wish) => wish?.status === "active")
    .sort(
      (a, b) =>
        Date.parse(b.updated_at || b.created_at || 0) -
        Date.parse(a.updated_at || a.created_at || 0),
    );
}
