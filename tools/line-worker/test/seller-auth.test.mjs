import test from 'node:test';
import assert from 'node:assert/strict';
import cryptoModule from 'node:crypto';

globalThis.crypto ??= cryptoModule.webcrypto;
globalThis.btoa ??= (value) => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ??= (value) => Buffer.from(value, 'base64').toString('binary');

const { handleSellerRoutes, verifySellerSession, readSellerSession } = await import('../src/seller-auth.mjs');
const env = {
  SELLER_AUTH_ID: 'seller-admin',
  SELLER_AUTH_PASSWORD: 'a-strong-password-123',
  AUTH_SESSION_SECRET: 's'.repeat(64),
  SELLER_ACCOUNT_NAME: 'ITG GROUP',
  SELLER_ALLOWED_TENANTS: 'itg,itt,mc2',
  SELLER_PLAN: 'PARTNER',
  ASSETS: { fetch: async () => new Response('seller console') }
};

test('未認証ではセラー画面をログインへ転送する', async () => {
  const response = await handleSellerRoutes(new Request('https://hoshilu.app/seller'), env);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://hoshilu.app/seller-login.html');
});

test('誤った認証情報は拒否する', async () => {
  const response = await handleSellerRoutes(new Request('https://hoshilu.app/api/seller/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
    body: JSON.stringify({ id: 'seller-admin', password: 'wrong-password-value' })
  }), env);
  assert.equal(response.status, 401);
});

test('正しい認証はHttpOnlyセッションを発行する', async () => {
  const response = await handleSellerRoutes(new Request('https://hoshilu.app/api/seller/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
    body: JSON.stringify({ id: env.SELLER_AUTH_ID, password: env.SELLER_AUTH_PASSWORD })
  }), env);
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  const token = cookie.match(/hoshilu_seller_session=([^;]+)/)[1];
  assert.equal(await verifySellerSession(new Request('https://hoshilu.app/seller', {
    headers: { cookie: `hoshilu_seller_session=${token}` }
  }), env), true);
  const seller = await readSellerSession(new Request('https://hoshilu.app/seller', {
    headers: { cookie: `hoshilu_seller_session=${token}` }
  }), env);
  assert.deepEqual(seller, { account: 'ITG GROUP', tenants: ['itg', 'itt', 'mc2'], plan: 'PARTNER' });
});

test('セラー用静的シェルは直接公開しない', async () => {
  const response = await handleSellerRoutes(new Request('https://hoshilu.app/seller-shell.html'), env);
  assert.equal(response.status, 404);
});
