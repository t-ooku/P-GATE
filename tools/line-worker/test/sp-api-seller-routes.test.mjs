import test from 'node:test';
import assert from 'node:assert/strict';
import cryptoModule from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

globalThis.crypto ??= cryptoModule.webcrypto;
globalThis.btoa ??= (value) => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ??= (value) => Buffer.from(value, 'base64').toString('binary');

const { handleSellerRoutes } = await import('../src/seller-auth.mjs');
const { handleSpApiSellerRoutes } = await import('../src/sp-api-seller-routes.mjs');
const { spApiSellerPageResponse } = await import('../src/sp-api-seller-page.mjs');
const authSqlite = new DatabaseSync(':memory:');
authSqlite.exec(readFileSync(new URL('../migrations/0028_seller_login_guard.sql', import.meta.url), 'utf8'));

function database() {
  return {
    prepare(sql) {
      if (sql.includes('seller_login_guard') || sql.includes('seller_auth_audit')) {
        const statement = authSqlite.prepare(sql);
        return { bind(...values) { return {
          run: async () => { const result = statement.run(...values); return { meta: { changes: Number(result.changes || 0) } }; },
          first: async () => statement.get(...values) || null
        }; } };
      }
      return {
        bind() {
          return {
            first: async () => sql.includes('sp_api_sync_audit')
              ? { result: 'SUCCESS', items: 3, pages: 1, completed_at: '2026-07-30T00:00:00Z' }
              : { total: 3, active: 2, last_observed_at: '2026-07-30T00:00:00Z' },
            run: async () => ({ meta: { changes: 1 } }),
            all: async () => ({ results: [] })
          };
        }
      };
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
  };
}

const env = {
  SELLER_AUTH_ID: 'seller-admin',
  SELLER_AUTH_PASSWORD: 'a-strong-password-123',
  AUTH_SESSION_SECRET: 's'.repeat(64),
  SELLER_ACCOUNT_NAME: 'ITG GROUP',
  SELLER_ALLOWED_TENANTS: 'itg',
  SELLER_PLAN: 'PARTNER',
  PRODUCT_DB: database(),
  SPAPI_LWA_CLIENT_ID: 'client',
  SPAPI_LWA_CLIENT_SECRET: 'secret',
  SPAPI_REFRESH_TOKEN_ITG: 'refresh'
};

async function sellerCookie() {
  const response = await handleSellerRoutes(new Request('https://hoshilu.app/api/seller/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
    body: JSON.stringify({ id: env.SELLER_AUTH_ID, password: env.SELLER_AUTH_PASSWORD })
  }), env);
  return response.headers.get('set-cookie').split(';')[0];
}

test('seller SP-API status requires a seller session', async () => {
  const response = await handleSpApiSellerRoutes(
    new Request('https://hoshilu.app/api/seller/sp-api/status'),
    env
  );
  assert.equal(response.status, 401);
});

test('seller SP-API page is readable and does not expose credentials', async () => {
  const response = spApiSellerPageResponse({
    account: 'ITG GROUP', tenants: ['itg', 'itt', 'mc2'], plan: 'PARTNER'
  });
  const html = await response.text();
  assert.match(html, /Amazon商品同期/);
  assert.match(html, /認証情報の値は画面やログへ表示しません/);
  assert.match(html, /seller-sp-api\.js/);
  assert.doesNotMatch(html, /Atzr\||client-secret-value|refresh-token-value/i);
});

test('seller sees SP-API status only for an allowed tenant', async () => {
  const response = await handleSpApiSellerRoutes(
    new Request('https://hoshilu.app/api/seller/sp-api/status', {
      headers: { cookie: await sellerCookie() }
    }),
    env
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.stores.length, 1);
  assert.equal(payload.stores[0].tenant, 'itg');
  assert.equal(payload.stores[0].configured, true);
  assert.equal(payload.stores[0].active, 2);
});

test('seller can run a full sync only for an allowed configured tenant', async () => {
  let received;
  const response = await handleSpApiSellerRoutes(
    new Request('https://hoshilu.app/api/seller/sp-api/sync', {
      method: 'POST',
      headers: { cookie: await sellerCookie(), 'content-type': 'application/json' },
      body: JSON.stringify({ tenant: 'itg', full: true })
    }),
    env,
    { synchronize: async (options) => {
      received = options;
      return { itemCount: 8, pageCount: 2, syncId: 'sync-seller-1' };
    } }
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(received.tenant, 'itg');
  assert.equal(received.full, true);
  assert.equal(payload.items, 8);
});

test('seller cannot sync another tenant', async () => {
  const response = await handleSpApiSellerRoutes(
    new Request('https://hoshilu.app/api/seller/sp-api/sync', {
      method: 'POST',
      headers: { cookie: await sellerCookie(), 'content-type': 'application/json' },
      body: JSON.stringify({ tenant: 'itt', full: true })
    }),
    env
  );
  assert.equal(response.status, 403);
});
