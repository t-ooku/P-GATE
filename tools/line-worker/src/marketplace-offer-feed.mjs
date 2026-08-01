import { isMarketplaceProductUrl, PRODUCT_MARKETPLACES } from './marketplace-product-url-policy.mjs';

const MARKETPLACES = PRODUCT_MARKETPLACES;
const MARKETPLACE_SET = new Set(MARKETPLACES);
const RIGHTS_GATED_MARKETPLACES = new Set([
  'ZOZOTOWN_JP', 'SHOPLIST_JP', 'MUSINSA_JP', 'BUYMA_JP', 'SNKRDUNK_JP'
]);
const clean = (value, max = 500) => String(value ?? '').normalize('NFKC')
  .replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

function normalizeObservedAt(value) {
  const timestamp = Date.parse(clean(value || new Date().toISOString(), 40));
  if (!Number.isFinite(timestamp)) throw new Error('OFFER_FEED_OBSERVED_AT_INVALID');
  if (timestamp > Date.now() + 15 * 60 * 1000) throw new Error('OFFER_FEED_OBSERVED_AT_FUTURE');
  return new Date(timestamp).toISOString();
}

function validProductUrl(marketplace, value) {
  return isMarketplaceProductUrl(marketplace, value);
}

export function validateMarketplaceOfferFeed(payload = {}) {
  const tenant = clean(payload.tenant, 40).toLowerCase();
  const batchId = clean(payload.batch_id, 100);
  const records = Array.isArray(payload.records) ? payload.records : [];
  if (!/^[a-z0-9_-]{2,40}$/.test(tenant)) throw new Error('OFFER_FEED_TENANT_INVALID');
  if (!/^[A-Za-z0-9._:-]{8,100}$/.test(batchId)) throw new Error('OFFER_FEED_BATCH_INVALID');
  if (!records.length || records.length > 200) throw new Error('OFFER_FEED_COUNT_INVALID');
  return {
    tenant,
    batch_id: batchId,
    records: records.map((record) => {
      const marketplace = clean(record.marketplace, 24).toUpperCase();
      const productUrl = clean(record.product_url, 1200);
      if (!MARKETPLACE_SET.has(marketplace)) throw new Error('OFFER_FEED_MARKETPLACE_INVALID');
      if (!validProductUrl(marketplace, productUrl)) throw new Error('OFFER_FEED_PRODUCT_URL_INVALID');
      const recordKey = clean(record.record_key, 160);
      const asin = clean(record.asin, 20).toUpperCase();
      const externalProductId = clean(record.external_product_id, 160);
      if (!externalProductId) throw new Error('OFFER_FEED_EXTERNAL_PRODUCT_ID_REQUIRED');
      const dataRightsStatus = clean(record.data_rights_status, 24).toUpperCase();
      const rightsReference = clean(record.rights_reference, 500);
      if (RIGHTS_GATED_MARKETPLACES.has(marketplace)) {
        if (dataRightsStatus !== 'APPROVED') throw new Error('OFFER_FEED_DATA_RIGHTS_NOT_APPROVED');
        try {
          const reference = new URL(rightsReference);
          if (reference.protocol !== 'https:' || reference.username || reference.password) throw new Error();
        } catch {
          throw new Error('OFFER_FEED_RIGHTS_REFERENCE_INVALID');
        }
      }
      if (!recordKey && !/^[A-Z0-9]{10}$/.test(asin)) throw new Error('OFFER_FEED_MATCH_KEY_REQUIRED');
      if (asin && !/^[A-Z0-9]{10}$/.test(asin)) throw new Error('OFFER_FEED_ASIN_INVALID');
      return {
        record_key: recordKey,
        asin,
        marketplace,
        external_product_id: externalProductId,
        seller_id: clean(record.seller_id, 160),
        product_url: productUrl,
        price: Math.max(0, Number(record.price || 0)),
        currency: clean(record.currency || 'JPY', 8),
        stock_status: clean(record.stock_status || 'UNKNOWN', 24).toUpperCase(),
        active: record.active === false ? 0 : 1,
        observed_at: normalizeObservedAt(record.observed_at),
        source: clean(record.source || 'partner_feed', 80),
        data_rights_status: dataRightsStatus || 'UNSPECIFIED',
        rights_reference: rightsReference
      };
    })
  };
}

function authorized(request, env) {
  const expected = String(env.MARKETPLACE_OFFER_SYNC_SECRET || '');
  const received = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return expected.length >= 32 && received === expected;
}

export function buildMarketplaceOfferDiagnostics(offers = []) {
  const byMarketplace = new Map(offers.map((row) => [row.marketplace, row]));
  const marketplaces = MARKETPLACES.map((marketplace) => {
    const row = byMarketplace.get(marketplace) || {};
    const matchedFresh = Number(row.matched_fresh_available || 0);
    const unmatchedFresh = Number(row.unmatched_fresh_available || 0);
    const stale = Number(row.stale_available || 0);
    let status = 'HEALTHY';
    let recommendedAction = 'NONE';
    if (matchedFresh === 0) {
      status = 'FEED_REQUIRED';
      recommendedAction = 'IMPORT_VERIFIED_PRODUCT_URLS';
    } else if (stale > 0) {
      status = 'REFRESH_REQUIRED';
      recommendedAction = 'REVERIFY_STALE_PRODUCT_URLS';
    } else if (unmatchedFresh > 0) {
      status = 'MATCHING_REQUIRED';
      recommendedAction = 'ADD_RECORD_KEY_OR_ASIN_MATCH';
    }
    return {
      marketplace,
      status,
      recommended_action: recommendedAction,
      matched_fresh_available: matchedFresh,
      unmatched_fresh_available: unmatchedFresh,
      stale_available: stale
    };
  });
  return {
    healthy: marketplaces.every((row) => row.status === 'HEALTHY'),
    feed_required: marketplaces.some((row) => row.status === 'FEED_REQUIRED'),
    refresh_required: marketplaces.some((row) => row.status === 'REFRESH_REQUIRED'),
    matching_required: marketplaces.some((row) => row.status === 'MATCHING_REQUIRED'),
    marketplaces
  };
}

export async function marketplaceOfferStats(request, env) {
  if (!env.PRODUCT_DB) return Response.json({ ok: false, error: 'PRODUCT_DB_NOT_CONFIGURED' }, { status: 503 });
  if (!authorized(request, env)) return Response.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  try {
    const result = await env.PRODUCT_DB.prepare(`SELECT o.marketplace,
      COUNT(*) AS total,
      SUM(CASE WHEN o.active=1 AND o.stock_status NOT IN ('OUT_OF_STOCK','UNAVAILABLE') THEN 1 ELSE 0 END) AS available,
      SUM(CASE WHEN o.active=1 AND o.stock_status NOT IN ('OUT_OF_STOCK','UNAVAILABLE') AND datetime(o.observed_at)>=datetime('now','-7 days') THEN 1 ELSE 0 END) AS fresh_available,
      SUM(CASE WHEN o.active=1 AND o.stock_status NOT IN ('OUT_OF_STOCK','UNAVAILABLE') AND datetime(o.observed_at)<datetime('now','-7 days') THEN 1 ELSE 0 END) AS stale_available,
      SUM(CASE WHEN o.active=1 AND o.stock_status NOT IN ('OUT_OF_STOCK','UNAVAILABLE') AND datetime(o.observed_at)>=datetime('now','-7 days') AND EXISTS(
        SELECT 1 FROM products p WHERE p.tenant=o.tenant AND ((o.asin<>'' AND p.asin=o.asin) OR (o.record_key<>'' AND p.record_key=o.record_key))
      ) THEN 1 ELSE 0 END) AS matched_fresh_available,
      MIN(o.observed_at) AS oldest_observed_at,
      MAX(o.observed_at) AS newest_observed_at,
      COUNT(DISTINCT o.tenant) AS tenants
      FROM marketplace_offers o GROUP BY o.marketplace ORDER BY o.marketplace`).all();
    const offers = (result.results || []).map((row) => {
      const freshAvailable = Number(row.fresh_available || 0);
      const matchedFreshAvailable = Number(row.matched_fresh_available || 0);
      return {
        marketplace: String(row.marketplace || ''),
        total: Number(row.total || 0),
        available: Number(row.available || 0),
        fresh_available: freshAvailable,
        stale_available: Number(row.stale_available || 0),
        matched_fresh_available: matchedFreshAvailable,
        unmatched_fresh_available: Math.max(0, freshAvailable - matchedFreshAvailable),
        oldest_observed_at: String(row.oldest_observed_at || ''),
        newest_observed_at: String(row.newest_observed_at || ''),
        tenants: Number(row.tenants || 0)
      };
    });
    const diagnostics = buildMarketplaceOfferDiagnostics(offers);
    const missingMarketplaces = diagnostics.marketplaces
      .filter((row) => row.status === 'FEED_REQUIRED')
      .map((row) => row.marketplace);
    return Response.json({
      ok: true,
      offers,
      diagnostics,
      missing_marketplaces: missingMarketplaces,
      feed_required: diagnostics.feed_required
    }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ ok: false, error: 'OFFER_STATS_FAILED' }, { status: 500 });
  }
}

export async function syncMarketplaceOffers(request, env) {
  if (!env.PRODUCT_DB) return Response.json({ ok: false, error: 'PRODUCT_DB_NOT_CONFIGURED' }, { status: 503 });
  if (!authorized(request, env)) return Response.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  try {
    const input = validateMarketplaceOfferFeed(await request.json());
    const sql = `INSERT INTO marketplace_offers(tenant,record_key,asin,marketplace,external_product_id,seller_id,product_url,price,currency,stock_status,active,observed_at,source,data_rights_status,rights_reference)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)
      ON CONFLICT(tenant,marketplace,external_product_id,seller_id) DO UPDATE SET
      record_key=excluded.record_key,asin=excluded.asin,product_url=excluded.product_url,price=excluded.price,currency=excluded.currency,
      stock_status=excluded.stock_status,active=excluded.active,observed_at=excluded.observed_at,source=excluded.source,
      data_rights_status=excluded.data_rights_status,rights_reference=excluded.rights_reference`;
    const statement = env.PRODUCT_DB.prepare(sql);
    const results = await env.PRODUCT_DB.batch(input.records.map((row) => statement.bind(
      input.tenant, row.record_key, row.asin, row.marketplace, row.external_product_id, row.seller_id,
      row.product_url, row.price, row.currency, row.stock_status, row.active, row.observed_at, row.source,
      row.data_rights_status, row.rights_reference
    )));
    return Response.json({
      ok: true,
      received: input.records.length,
      changed: results.reduce((total,result) => total + Number(result.meta?.changes || 0), 0)
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error.message || error) }, { status: 400 });
  }
}
