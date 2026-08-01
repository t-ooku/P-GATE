import { createSpApiD1Repository, spApiConfiguredTenants } from './sp-api-d1-repository.mjs';
import { SP_API_SELLERS, synchronizeSeller } from './sp-api-sync.mjs';
import { authorizeAdminRequest } from './admin-auth.mjs';
import { readBoundedJson } from './bounded-json.mjs';

function noStoreJson(value, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return Response.json(value, { ...init, headers });
}

function tenantAllowed(tenant, env) {
  return spApiConfiguredTenants(env).includes(tenant);
}

async function status(env) {
  const configured = spApiConfiguredTenants(env);
  const listings = await env.PRODUCT_DB.prepare(`SELECT tenant,
    COUNT(*) AS total,
    SUM(CASE WHEN buyable=1 AND discoverable=1 AND missing_from_amazon=0 THEN 1 ELSE 0 END) AS active,
    MAX(observed_at) AS last_observed_at
    FROM sp_api_listings GROUP BY tenant ORDER BY tenant`).all();
  const integrity = await env.PRODUCT_DB.prepare(`SELECT tenant,
    SUM(CASE
      WHEN tenant='itg' AND merchant_id<>'A19ONFBH56J9DF' THEN 1
      WHEN tenant='itt' AND merchant_id<>'A1MIQXZ599XF4E' THEN 1
      WHEN tenant='mc2' AND merchant_id<>'A3NNU8MHK7TN8Z' THEN 1
      ELSE 0 END) AS seller_mismatch,
    SUM(CASE WHEN marketplace_id<>'A1VC38T7YXB528' THEN 1 ELSE 0 END) AS marketplace_mismatch,
    SUM(CASE WHEN asin='' OR seller_sku='' THEN 1 ELSE 0 END) AS missing_identity,
    SUM(CASE WHEN product_url NOT LIKE 'https://www.amazon.co.jp/%' THEN 1 ELSE 0 END) AS invalid_product_url,
    SUM(CASE WHEN quantity<0 OR price<0 THEN 1 ELSE 0 END) AS invalid_commerce_value
    FROM sp_api_listings GROUP BY tenant ORDER BY tenant`).all();
  const audits = await env.PRODUCT_DB.prepare(`SELECT type,tenant,seller_id,result,pages,items,
    from_at,to_at,error_code,completed_at
    FROM sp_api_sync_audit ORDER BY completed_at DESC LIMIT 30`).all();
  const authCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let adminAuthSummary = { results: [] };
  let sellerAuthSummary = { results: [] };
  try {
    adminAuthSummary = await env.PRODUCT_DB.prepare(`SELECT event_type,
      COUNT(*) AS total,MAX(occurred_at) AS last_at FROM admin_auth_audit
      WHERE occurred_at>=?1 GROUP BY event_type ORDER BY event_type`)
      .bind(authCutoff).all();
  } catch {
    // Status remains available while migration 0027 is pending.
  }
  try {
    sellerAuthSummary = await env.PRODUCT_DB.prepare(`SELECT event_type,
      COUNT(*) AS total,MAX(occurred_at) AS last_at FROM seller_auth_audit
      WHERE occurred_at>=?1 GROUP BY event_type ORDER BY event_type`)
      .bind(authCutoff).all();
  } catch {
    // Status remains available while migration 0028 is pending.
  }
  return {
    ok: true,
    configured,
    listings: listings.results || [],
    integrity: integrity.results || [],
    audits: audits.results || [],
    admin_auth_summary: (adminAuthSummary.results || []).map((item) => ({
      event_type: item.event_type,
      total: Math.max(0, Number(item.total || 0)),
      last_at: item.last_at || ''
    })),
    seller_auth_summary: (sellerAuthSummary.results || []).map((item) => ({
      event_type: item.event_type,
      total: Math.max(0, Number(item.total || 0)),
      last_at: item.last_at || ''
    }))
  };
}

export async function handleSpApiAdminRoutes(
  request,
  env,
  { synchronize = synchronizeSeller } = {}
) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/internal/sp-api/')) return null;
  if (!await authorizeAdminRequest(request, env)) {
    return noStoreJson({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (!env.PRODUCT_DB) {
    return noStoreJson({ ok: false, error: 'PRODUCT_DB_NOT_CONFIGURED' }, { status: 503 });
  }
  if (request.method === 'GET' && url.pathname === '/api/internal/sp-api/status') {
    return noStoreJson(await status(env));
  }
  if (request.method === 'POST' && url.pathname === '/api/internal/sp-api/sync') {
    const parsed = await readBoundedJson(request, 1000);
    if (!parsed.ok) return noStoreJson({ ok: false, error: parsed.error }, {
      status: parsed.error === 'REQUEST_TOO_LARGE' ? 413 : 400
    });
    const input = parsed.value;
    const tenant = String(input.tenant || '').trim().toLowerCase();
    if (!SP_API_SELLERS[tenant]) {
      return noStoreJson({ ok: false, error: 'UNKNOWN_TENANT' }, { status: 400 });
    }
    if (!tenantAllowed(tenant, env)) {
      return noStoreJson({ ok: false, error: 'SP_API_TENANT_NOT_CONFIGURED' }, { status: 409 });
    }
    try {
      const result = await synchronize({
        tenant,
        env,
        repository: createSpApiD1Repository(env.PRODUCT_DB),
        full: input.full === true,
        now: new Date()
      });
      return noStoreJson({
        ok: true,
        tenant,
        full: input.full === true,
        items: result.itemCount,
        pages: result.pageCount,
        sync_id: result.syncId
      });
    } catch (error) {
      return noStoreJson({
        ok: false, error: error?.message === 'SP_API_SYNC_IN_PROGRESS'
          ? 'SP_API_SYNC_IN_PROGRESS' : 'SP_API_SYNC_FAILED'
      }, { status: 502 });
    }
  }
  return noStoreJson({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
}
