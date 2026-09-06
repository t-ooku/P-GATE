/**
 * Manufacturer / seller onboarding policy for HOSHILU.
 *
 * This record contains business metadata only. OAuth refresh tokens, API keys,
 * passwords and cookies must never be stored in this object.
 */

const MARKETPLACES = new Set([
  "amazon_jp",
  "rakuten_jp",
  "yahoo_jp",
  "shopify",
  "direct",
]);

function text(value, maxLength = 256) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeTenant(value) {
  return text(value, 32)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

function validHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function validAmazonSellerId(value) {
  return /^A[A-Z0-9]{8,31}$/.test(text(value, 32));
}

export function validateSellerApplication(application) {
  const errors = [];
  if (!normalizeTenant(application?.tenant)) errors.push("tenant is required");
  if (!text(application?.display_name)) errors.push("display_name is required");
  if (!text(application?.legal_name)) errors.push("legal_name is required");
  if (!text(application?.contact_email)) errors.push("contact_email is required");
  if (!MARKETPLACES.has(application?.marketplace)) {
    errors.push("supported marketplace is required");
  }
  if (!validHttpsUrl(application?.storefront_url)) {
    errors.push("HTTPS storefront_url is required");
  }
  if (
    application?.marketplace === "amazon_jp" &&
    !validAmazonSellerId(application?.merchant_id)
  ) {
    errors.push("valid Amazon Seller / Merchant ID is required");
  }
  if (application?.contains_secret === true) {
    errors.push("secrets are forbidden in seller metadata");
  }
  return errors;
}

export function createSellerApplication(input, {
  now = new Date(),
  idFactory = () => crypto.randomUUID(),
} = {}) {
  const normalized = {
    application_id: idFactory(),
    tenant: normalizeTenant(input?.tenant),
    display_name: text(input?.display_name),
    legal_name: text(input?.legal_name),
    contact_email: text(input?.contact_email, 320).toLowerCase(),
    marketplace: text(input?.marketplace, 32),
    merchant_id: text(input?.merchant_id, 32).toUpperCase(),
    storefront_url: validHttpsUrl(input?.storefront_url),
    privacy_url: validHttpsUrl(input?.privacy_url),
    terms_url: validHttpsUrl(input?.terms_url),
    contract_reference: text(input?.contract_reference, 128),
    contains_secret: input?.contains_secret === true,
    status: "draft",
    catalog_visibility: "hidden",
    api_authorization_status: "not_started",
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    submitted_at: "",
    approved_at: "",
  };
  const errors = validateSellerApplication(normalized);
  if (errors.length) throw new Error(errors.join("; "));
  return normalized;
}

export function submitSellerApplication(application, now = new Date()) {
  const errors = validateSellerApplication(application);
  if (errors.length) throw new Error(errors.join("; "));
  if (application.status !== "draft" && application.status !== "changes_requested") {
    throw new Error("Only draft or changes_requested applications can be submitted");
  }
  return {
    ...application,
    status: "submitted",
    catalog_visibility: "hidden",
    submitted_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
}

export function reviewSellerApplication(application, decision, {
  now = new Date(),
  reviewerId,
  reason = "",
} = {}) {
  if (application?.status !== "submitted") {
    throw new Error("Only submitted applications can be reviewed");
  }
  const reviewer = text(reviewerId, 128);
  if (!reviewer) throw new Error("reviewerId is required");
  const normalizedDecision = text(decision, 32);
  if (!["approve", "request_changes", "reject"].includes(normalizedDecision)) {
    throw new Error("Invalid review decision");
  }
  const status = {
    approve: "approved",
    request_changes: "changes_requested",
    reject: "rejected",
  }[normalizedDecision];
  const timestamp = now.toISOString();
  return {
    application: {
      ...application,
      status,
      catalog_visibility: "hidden",
      approved_at: normalizedDecision === "approve" ? timestamp : "",
      updated_at: timestamp,
    },
    audit_event: {
      event_type: `seller_application_${status}`,
      application_id: application.application_id,
      tenant: application.tenant,
      reviewer_id: reviewer,
      reason: text(reason, 1000),
      occurred_at: timestamp,
    },
  };
}

export function recordApiAuthorization(application, {
  authorizationId,
  marketplaceId,
  now = new Date(),
} = {}) {
  if (application?.status !== "approved") {
    throw new Error("Seller application must be approved first");
  }
  const authId = text(authorizationId, 128);
  if (!authId) throw new Error("authorizationId is required");
  return {
    ...application,
    api_authorization_status: "authorized",
    api_authorization_id: authId,
    marketplace_id: text(marketplaceId, 64),
    updated_at: now.toISOString(),
  };
}

export function activateSellerCatalog(application, reconciliation) {
  if (application?.status !== "approved") {
    throw new Error("Seller application is not approved");
  }
  if (application?.api_authorization_status !== "authorized") {
    throw new Error("Seller API authorization is incomplete");
  }
  if (!reconciliation?.passed) {
    throw new Error("Initial catalog reconciliation has not passed");
  }
  return {
    ...application,
    catalog_visibility: "visible",
    catalog_activated_at: new Date().toISOString(),
    initial_catalog_count: Number(reconciliation.catalogCount || 0),
    updated_at: new Date().toISOString(),
  };
}
