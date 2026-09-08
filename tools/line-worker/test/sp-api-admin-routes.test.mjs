import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSpApiAdminRoutes } from '../src/sp-api-admin-routes.mjs';

const secret = 's'.repeat(40);
const authorization = { authorization: `Bearer ${secret}` };

function database() {
  return {
    prepare(sql) {
      const rows = sql.includes('seller_mismatch')
        ? [{ tenant: 'itg', seller_mismatch: 0, marketplace_mismatch: 0,
            missing_identity: 0, invalid_product_url: 0, invalid_commerce_value: 0 }]
        : sql.includes('sp_api_listings')
          ? [{ tenant: 'itg', total: 2, active: 1, last_observed_at: '2026-07-30T00:00:00Z' }]
          : [];
      return {
        bind() {
          return {
            first: async () => null,
            run: async () => ({ meta: { changes: 1 } }),
            all: async () => ({ results: [] })
          };
        },
        all: async () => ({ results: rows })
      };
    }
  };
}

function environment(extra = {}) {
  return {
    PRODUCT_DB: database(),
    SOCIAL_ADMIN_SECRET: secret,
    SPAPI_LWA_CLIENT_ID: 'client',
    SPAPI_LWA_CLIENT_SECRET: 'client-secret',
    SPAPI_REFRESH_TOKEN_ITG: 'refresh-itg',
    ...extra
  };
}

test('SP-API admin routes reject unauthenticated requests', async () => {
  const response = await handleSpApiAdminRoutes(
    new Request('https://hoshilu.app/api/internal/sp-api/status'),
    environment()
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'UNAUTHORIZED');
});

test('SP-API status exposes configuration and aggregate data without secrets', async () => {
  const response = await handleSpApiAdminRoutes(
    new Request('https://hoshilu.app/api/internal/sp-api/status', { headers: authorization }),
    environment()
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.configured, ['itg']);
  assert.equal(payload.listings[0].active, 1);
  assert.equal(payload.integrity[0].seller_mismatch, 0);
  assert.doesNotMatch(JSON.stringify(payload), /refresh-itg|client-secret/);
});

test('SP-API manual full sync only runs for a configured tenant', async () => {
  let received;
  const response = await handleSpApiAdminRoutes(
    new Request('https://hoshilu.app/api/internal/sp-api/sync', {
      method: 'POST',
      headers: { ...authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ tenant: 'itg', full: true })
    }),
    environment(),
    { synchronize: async (options) => {
      received = options;
      return { itemCount: 12, pageCount: 2, syncId: 'sync-1' };
    } }
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(received.tenant, 'itg');
  assert.equal(received.full, true);
  assert.equal(payload.items, 12);
  assert.equal(payload.sync_id, 'sync-1');
});

test('SP-API manual sync rejects an unconfigured tenant', async () => {
  const response = await handleSpApiAdminRoutes(
    new Request('https://hoshilu.app/api/internal/sp-api/sync', {
      method: 'POST',
      headers: { ...authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ tenant: 'itt', full: true })
    }),
    environment()
  );
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'SP_API_TENANT_NOT_CONFIGURED');
});
