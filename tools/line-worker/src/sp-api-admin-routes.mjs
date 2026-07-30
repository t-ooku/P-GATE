import { createSpApiD1Repository, spApiConfiguredTenants } from './sp-api-d1-repository.mjs';
import { SP_API_SELLERS, synchronizeSeller } from './sp-api-sync.mjs';

function authorized(request, env) {
  const expected = String(env.SOCIAL_ADMIN_SECRET || '');
  const received = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return expected.length >= 32 && received === expected;
}

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
  return {
    ok: true,
    configured,
    listings: listings.results || [],
    integrity: integrity.results || [],
    audits: audits.results || []
  };
}

export async function handleSpApiAdminRoutes(
  request,
  env,
  { synchronize = synchronizeSeller } = {}
) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/internal/sp-api/')) return null;
  if (!authorized(request, env)) {
    return noStoreJson({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (!env.PRODUCT_DB) {
    return noStoreJson({ ok: false, error: 'PRODUCT_DB_NOT_CONFIGURED' }, { status: 503 });
  }
  if (request.method === 'GET' && url.pathname === '/api/internal/sp-api/status') {
    return noStoreJson(await status(env));
  }
  if (request.method === 'POST' && url.pathname === '/api/internal/sp-api/sync') {
    if (Number(request.headers.get('content-length') || 0) > 1000) {
      return noStoreJson({ ok: false, error: 'REQUEST_TOO_LARGE' }, { status: 413 });
    }
    let input;
    try {
      input = await request.json();
    } catch {
      return noStoreJson({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
    }
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
        ok: false,
        error: String(error?.message || 'SP_API_SYNC_FAILED').slice(0, 120)
      }, { status: 502 });
    }
  }
  return noStoreJson({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
}
