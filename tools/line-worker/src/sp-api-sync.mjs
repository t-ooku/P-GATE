/**
 * HOSHILU Amazon Selling Partner API synchronizer.
 * Credentials are supplied by Worker Secrets and are never logged.
 */

export const AMAZON_JP_MARKETPLACE_ID = "A1VC38T7YXB528";
export const SP_API_FE_ENDPOINT = "https://sellingpartnerapi-fe.amazon.com";
export const LWA_TOKEN_ENDPOINT = "https://api.amazon.com/auth/o2/token";

export const SP_API_SELLERS = Object.freeze({
  itg: Object.freeze({
    tenant: "itg",
    storeName: "with care",
    sellerId: "A19ONFBH56J9DF",
    refreshTokenBinding: "SPAPI_REFRESH_TOKEN_ITG",
  }),
  itt: Object.freeze({
    tenant: "itt",
    storeName: "Find fun",
    sellerId: "A1MIQXZ599XF4E",
    refreshTokenBinding: "SPAPI_REFRESH_TOKEN_ITT",
  }),
  mc2: Object.freeze({
    tenant: "mc2",
    storeName: "Tomorrow's smile",
    sellerId: "A3NNU8MHK7TN8Z",
    refreshTokenBinding: "SPAPI_REFRESH_TOKEN_MC2",
  }),
});

const INCLUDED_DATA = [
  "summaries",
  "attributes",
  "issues",
  "offers",
  "fulfillmentAvailability",
  "productTypes",
].join(",");

const DEFAULT_OVERLAP_MS = 10 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_MAX_RETRIES = 6;

function required(value, name) {
  if (!value) throw new Error(`Missing required SP-API setting: ${name}`);
  return value;
}

function amazonTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function safeJson(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function retryDelayMs(attempt, retryAfter) {
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  return Math.min(30_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function resolveSeller(tenant) {
  const normalized = String(tenant || "").trim().toLowerCase();
  const seller = SP_API_SELLERS[normalized];
  if (!seller) throw new Error(`Unknown SP-API tenant: ${normalized || "(empty)"}`);
  return seller;
}

export async function exchangeRefreshToken({
  fetchImpl = fetch,
  clientId,
  clientSecret,
  refreshToken,
}) {
  required(clientId, "SPAPI_LWA_CLIENT_ID");
  required(clientSecret, "SPAPI_LWA_CLIENT_SECRET");
  required(refreshToken, "seller refresh token");

  const response = await fetchImpl(LWA_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const payload = safeJson(await response.text());
  if (!response.ok || !payload.access_token) {
    throw new Error(`LWA token exchange failed (${response.status})`);
  }
  return {
    accessToken: payload.access_token,
    expiresIn: Number(payload.expires_in || 3600),
  };
}

export async function spApiRequest({
  fetchImpl = fetch,
  accessToken,
  path,
  query,
  method = "GET",
  maxRetries = DEFAULT_MAX_RETRIES,
}) {
  required(accessToken, "LWA access token");
  const url = new URL(path, SP_API_FE_ENDPOINT);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetchImpl(url, {
      method,
      headers: {
        host: url.host,
        "x-amz-access-token": accessToken,
        "x-amz-date": amazonTimestamp(),
        "user-agent": "HOSHILU/1.0 (Language=JavaScript; Platform=Cloudflare-Workers)",
        accept: "application/json",
      },
    });
    const payload = safeJson(await response.text());
    if (response.ok) {
      return {
        payload,
        requestId: response.headers.get("x-amzn-requestid") || "",
        rateLimit: response.headers.get("x-amzn-ratelimit-limit") || "",
      };
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === maxRetries) {
      const code = payload?.errors?.[0]?.code || "SP_API_ERROR";
      throw new Error(`${code}: SP-API request failed (${response.status})`);
    }
    await delay(retryDelayMs(attempt, response.headers.get("retry-after")));
  }
  throw new Error("SP-API request exhausted retries");
}

export async function searchListingsPage({
  fetchImpl = fetch,
  accessToken,
  sellerId,
  pageToken,
  lastUpdatedAfter,
  lastUpdatedBefore,
}) {
  const response = await spApiRequest({
    fetchImpl,
    accessToken,
    path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}`,
    query: {
      marketplaceIds: AMAZON_JP_MARKETPLACE_ID,
      issueLocale: "ja_JP",
      includedData: INCLUDED_DATA,
      lastUpdatedAfter,
      lastUpdatedBefore,
      sortBy: "lastUpdatedDate",
      sortOrder: "ASC",
      pageSize: DEFAULT_PAGE_SIZE,
      pageToken,
    },
  });
  return {
    items: Array.isArray(response.payload?.items) ? response.payload.items : [],
    nextToken: response.payload?.pagination?.nextToken || "",
    requestId: response.requestId,
    rateLimit: response.rateLimit,
  };
}

function firstMarketplaceValue(values) {
  if (!Array.isArray(values)) return undefined;
  return (
    values.find((value) => value?.marketplaceId === AMAZON_JP_MARKETPLACE_ID) ||
    values[0]
  );
}

export function normalizeListing(item, seller, syncId, observedAt) {
  const summary = firstMarketplaceValue(item?.summaries) || {};
  const offer = firstMarketplaceValue(item?.offers) || {};
  const availability = firstMarketplaceValue(item?.fulfillmentAvailability) || {};
  const statuses = Array.isArray(summary?.status) ? summary.status : [];
  const asin = String(summary?.asin || "");

  return {
    tenant: seller.tenant,
    store_name: seller.storeName,
    merchant_id: seller.sellerId,
    marketplace_id: AMAZON_JP_MARKETPLACE_ID,
    seller_sku: String(item?.sku || ""),
    asin,
    product_name: summary?.itemName || "",
    product_type: summary?.productType || item?.productTypes?.[0]?.productType || "",
    condition_type: summary?.conditionType || "",
    image_url: summary?.mainImage?.link || "",
    created_at_amazon: summary?.createdDate || "",
    updated_at_amazon: summary?.lastUpdatedDate || "",
    buyable: statuses.includes("BUYABLE"),
    discoverable: statuses.includes("DISCOVERABLE"),
    status: statuses,
    quantity: availability?.quantity ?? null,
    price: offer?.price?.amount ?? null,
    currency: offer?.price?.currencyCode || "JPY",
    issues: Array.isArray(item?.issues) ? item.issues : [],
    product_url: asin ? `https://www.amazon.co.jp/dp/${encodeURIComponent(asin)}` : "",
    sync_id: syncId,
    observed_at: observedAt,
    source: "amazon_sp_api",
  };
}

export function incrementalWindow(cursor, now = new Date(), overlapMs = DEFAULT_OVERLAP_MS) {
  const upper = now.toISOString();
  if (!cursor) return { lastUpdatedAfter: undefined, lastUpdatedBefore: upper };
  const parsed = Date.parse(cursor);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid SP-API cursor: ${cursor}`);
  return {
    lastUpdatedAfter: new Date(parsed - overlapMs).toISOString(),
    lastUpdatedBefore: upper,
  };
}

/**
 * Repository contract:
 * getCursor, upsertListings, setCursor, appendAudit,
 * and optionally finishFullScan for daily reconciliation.
 */
export async function synchronizeSeller({
  tenant,
  env,
  repository,
  fetchImpl = fetch,
  full = false,
  now = new Date(),
}) {
  const seller = resolveSeller(tenant);
  const clientId = required(env?.SPAPI_LWA_CLIENT_ID, "SPAPI_LWA_CLIENT_ID");
  const clientSecret = required(env?.SPAPI_LWA_CLIENT_SECRET, "SPAPI_LWA_CLIENT_SECRET");
  const refreshToken = required(
    env?.[seller.refreshTokenBinding],
    seller.refreshTokenBinding,
  );
  required(repository?.upsertListings, "repository.upsertListings");
  required(repository?.appendAudit, "repository.appendAudit");

  const cursor = full ? undefined : await repository.getCursor?.(seller.tenant);
  const window = full
    ? { lastUpdatedAfter: undefined, lastUpdatedBefore: now.toISOString() }
    : incrementalWindow(cursor, now);
  const syncId = crypto.randomUUID();
  const observedAt = now.toISOString();
  const token = await exchangeRefreshToken({
    fetchImpl,
    clientId,
    clientSecret,
    refreshToken,
  });

  let pageToken = "";
  let pageCount = 0;
  let itemCount = 0;
  do {
    const page = await searchListingsPage({
      fetchImpl,
      accessToken: token.accessToken,
      sellerId: seller.sellerId,
      pageToken,
      ...window,
    });
    const listings = page.items.map((item) =>
      normalizeListing(item, seller, syncId, observedAt),
    );
    if (listings.length) {
      await repository.upsertListings(seller.tenant, listings);
      itemCount += listings.length;
    }
    pageCount += 1;
    pageToken = page.nextToken;
  } while (pageToken);

  if (full && repository.finishFullScan) {
    await repository.finishFullScan(seller.tenant, syncId, observedAt);
  }
  await repository.setCursor?.(seller.tenant, window.lastUpdatedBefore);
  await repository.appendAudit({
    type: full ? "sp_api_full_sync" : "sp_api_incremental_sync",
    tenant: seller.tenant,
    seller_id: seller.sellerId,
    sync_id: syncId,
    pages: pageCount,
    items: itemCount,
    from: window.lastUpdatedAfter || "",
    to: window.lastUpdatedBefore,
    completed_at: new Date().toISOString(),
  });

  return {
    ok: true,
    tenant: seller.tenant,
    syncId,
    full,
    pageCount,
    itemCount,
    cursor: window.lastUpdatedBefore,
  };
}

export async function synchronizeAllSellers(options) {
  const results = [];
  for (const tenant of Object.keys(SP_API_SELLERS)) {
    results.push(await synchronizeSeller({ ...options, tenant }));
  }
  return results;
}
