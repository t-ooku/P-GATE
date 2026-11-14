import test from "node:test";
import assert from "node:assert/strict";

import {
  AMAZON_JP_MARKETPLACE_ID,
  SP_API_SELLERS,
  incrementalWindow,
  normalizeListing,
  resolveSeller,
  searchListingsPage,
} from "../src/sp-api-sync.mjs";

test("tenant to seller mapping is fixed for the three ITG accounts", () => {
  assert.equal(resolveSeller("itg").sellerId, "A19ONFBH56J9DF");
  assert.equal(resolveSeller("ITT").sellerId, "A1MIQXZ599XF4E");
  assert.equal(resolveSeller("mc2").sellerId, "A3NNU8MHK7TN8Z");
  assert.equal(Object.keys(SP_API_SELLERS).length, 3);
});

test("incremental window overlaps the stored cursor by ten minutes", () => {
  const window = incrementalWindow(
    "2026-07-24T00:30:00.000Z",
    new Date("2026-07-24T01:00:00.000Z"),
  );
  assert.equal(window.lastUpdatedAfter, "2026-07-24T00:20:00.000Z");
  assert.equal(window.lastUpdatedBefore, "2026-07-24T01:00:00.000Z");
});

test("listing normalization preserves tenant, SKU, ASIN and status", () => {
  const seller = resolveSeller("itg");
  const normalized = normalizeListing(
    {
      sku: "TEST-SKU-1",
      summaries: [
        {
          marketplaceId: AMAZON_JP_MARKETPLACE_ID,
          asin: "B000TEST01",
          itemName: "テスト商品",
          status: ["BUYABLE", "DISCOVERABLE"],
          lastUpdatedDate: "2026-07-24T00:00:00Z",
        },
      ],
      offers: [
        {
          marketplaceId: AMAZON_JP_MARKETPLACE_ID,
          price: { amount: 1980, currencyCode: "JPY" },
        },
      ],
      fulfillmentAvailability: [
        {
          marketplaceId: AMAZON_JP_MARKETPLACE_ID,
          quantity: 7,
        },
      ],
    },
    seller,
    "sync-1",
    "2026-07-24T01:00:00Z",
  );

  assert.equal(normalized.tenant, "itg");
  assert.equal(normalized.merchant_id, "A19ONFBH56J9DF");
  assert.equal(normalized.seller_sku, "TEST-SKU-1");
  assert.equal(normalized.asin, "B000TEST01");
  assert.equal(normalized.buyable, true);
  assert.equal(normalized.discoverable, true);
  assert.equal(normalized.price, 1980);
  assert.equal(normalized.quantity, 7);
});

test("listing search follows Amazon page tokens and Japan marketplace", async () => {
  let requestedUrl = "";
  const fetchImpl = async (url) => {
    requestedUrl = String(url);
    return new Response(
      JSON.stringify({
        items: [{ sku: "SKU-1" }],
        pagination: { nextToken: "NEXT" },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-amzn-requestid": "request-1",
        },
      },
    );
  };

  const page = await searchListingsPage({
    fetchImpl,
    accessToken: "test-access-token",
    sellerId: "A19ONFBH56J9DF",
    pageToken: "CURRENT",
    lastUpdatedAfter: "2026-07-23T00:00:00Z",
    lastUpdatedBefore: "2026-07-24T00:00:00Z",
  });

  assert.equal(page.items.length, 1);
  assert.equal(page.nextToken, "NEXT");
  assert.match(requestedUrl, /marketplaceIds=A1VC38T7YXB528/);
  assert.match(requestedUrl, /pageToken=CURRENT/);
  assert.match(requestedUrl, /lastUpdatedAfter=/);
});
