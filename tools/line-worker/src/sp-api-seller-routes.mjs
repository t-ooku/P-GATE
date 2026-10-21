import { readSellerSession } from './seller-auth.mjs';
import { createSpApiD1Repository, spApiConfiguredTenants } from './sp-api-d1-repository.mjs';
import { SP_API_SELLERS, synchronizeSeller } from './sp-api-sync.mjs';

const json = (value, init = {}) => {
  const headers = new Headers(init.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return Response.json(value, { ...init, headers });
};

async function scopedStatus(env, tenants) {
  const configured = new Set(spApiConfiguredTenants(env));
  const stores = [];
  for (const tenant of tenants) {
    if (!SP_API_SELLERS[tenant]) continue;
    const listing = await env.PRODUCT_DB.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN buyable=1 AND discoverable=1 AND missing_from_amazon=0 THEN 1 ELSE 0 END) AS active,
      MAX(observed_at) AS last_observed_at
      FROM sp_api_listings WHERE tenant=?1`).bind(tenant).first();
    const audit = await env.PRODUCT_DB.prepare(`SELECT result,items,pages,error_code,completed_at
      FROM sp_api_sync_audit WHERE tenant=?1 ORDER BY completed_at DESC LIMIT 1`).bind(tenant).first();
    stores.push({
      tenant,
      store_name: SP_API_SELLERS[tenant].storeName,
      configured: configured.has(tenant),
      total: Number(listing?.total || 0),
      active: Number(listing?.active || 0),
      last_observed_at: listing?.last_observed_at || '',
      last_sync: audit || null
    });
  }
  return stores;
}
export async function handleSpApiSellerRoutes(
  request,
  env,
  { synchronize = synchronizeSeller } = {}
) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/seller/sp-api/')) return null;
  const seller = await readSellerSession(request, env);
  if (!seller) return json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  if (!env.PRODUCT_DB) {
    return json({ ok: false, error: 'PRODUCT_DB_NOT_CONFIGURED' }, { status: 503 });
  }
  const allowed = (seller.tenants || []).filter((tenant) => SP_API_SELLERS[tenant]);
  if (request.method === 'GET' && url.pathname === '/api/seller/sp-api/status') {
    return json({ ok: true, stores: await scopedStatus(env, allowed) });
  }
  if (request.method === 'POST' && url.pathname === '/api/seller/sp-api/sync') {
    if (Number(request.headers.get('content-length') || 0) > 1000) {
      return json({ ok: false, error: 'REQUEST_TOO_LARGE' }, { status: 413 });
    }
    let input;
    try {
      input = await request.json();
    } catch {
      return json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
    }
    const tenant = String(input.tenant || '').trim().toLowerCase();
    if (!allowed.includes(tenant)) {
      return json({ ok: false, error: 'TENANT_NOT_ALLOWED' }, { status: 403 });
    }
    if (!spApiConfiguredTenants(env).includes(tenant)) {
      return json({ ok: false, error: 'SP_API_TENANT_NOT_CONFIGURED' }, { status: 409 });
    }
    try {
      const result = await synchronize({
        tenant,
        env,
        repository: createSpApiD1Repository(env.PRODUCT_DB),
        full: input.full === true,
        now: new Date()
      });
      return json({
        ok: true,
        tenant,
        full: input.full === true,
        items: result.itemCount,
        pages: result.pageCount,
        sync_id: result.syncId
      });
    } catch (error) {
      return json({
        ok: false,
        error: String(error?.message || 'SP_API_SYNC_FAILED').slice(0, 120)
      }, { status: 502 });
    }
  }
  return json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
}
