import test from 'node:test';
import assert from 'node:assert/strict';
import cryptoModule from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

globalThis.crypto ??= cryptoModule.webcrypto;
globalThis.btoa ??= (value) => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ??= (value) => Buffer.from(value, 'base64').toString('binary');

const { handleSellerRoutes, verifySellerSession, readSellerSession } = await import('../src/seller-auth.mjs');
const authSqlite = new DatabaseSync(':memory:');
authSqlite.exec(readFileSync(new URL('../migrations/0028_seller_login_guard.sql', import.meta.url), 'utf8'));
const authDb = {
  prepare(sql) {
    const statement = authSqlite.prepare(sql);
    return { bind(...values) { return {
      run: async () => { const result = statement.run(...values); return { meta: { changes: Number(result.changes || 0) } }; },
      first: async () => statement.get(...values) || null
    }; } };
  },
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
};
const env = {
  SELLER_AUTH_ID: 'seller-admin',
  SELLER_AUTH_PASSWORD: 'a-strong-password-123',
  AUTH_SESSION_SECRET: 's'.repeat(64),
  SELLER_ACCOUNT_NAME: 'ITG GROUP',
  SELLER_ALLOWED_TENANTS: 'itg,itt,mc2',
  SELLER_PLAN: 'PARTNER',
  PRODUCT_DB: authDb,
  ASSETS: { fetch: async () => new Response('seller console') }
};
const setCookies = (response) => typeof response.headers.getSetCookie === 'function'
  ? response.headers.getSetCookie()
  : [response.headers.get('set-cookie')];
const hasCookie = (cookies, name, pattern) => cookies.some((value) =>
  value.startsWith(`${name}=`) && pattern.test(value));

test('未認証ではセラー画面をログインへ転送する', async () => {
  const response = await handleSellerRoutes(new Request('https://hoshilu.app/seller'), env);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://hoshilu.app/seller-login.html');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('誤った認証情報は拒否する', async () => {
  const response = await handleSellerRoutes(new Request('https://hoshilu.app/api/seller/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
    body: JSON.stringify({ id: 'seller-admin', password: 'wrong-password-value' })
  }), env);
  assert.equal(response.status, 401);
});

test('セラー認証は弱い設定値とサンプル値を拒否する', async () => {
  for (const unsafeEnv of [
    { ...env, AUTH_SESSION_SECRET: 'short-secret' },
    { ...env, SELLER_AUTH_PASSWORD: 'short' },
    { ...env, SELLER_ALLOWED_TENANTS: '' },
    { ...env, SELLER_ALLOWED_TENANTS: '***' },
    { ...env, SELLER_AUTH_ID: 'replace-with-seller-id' },
    { ...env, SELLER_AUTH_PASSWORD: 'replace-with-unique-password-at-least-12-characters' },
    { ...env, AUTH_SESSION_SECRET: 'replace-with-independent-random-secret-at-least-64-characters' }
  ]) {
    const response = await handleSellerRoutes(new Request('https://hoshilu.app/api/seller/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
      body: JSON.stringify({ id: unsafeEnv.SELLER_AUTH_ID, password: unsafeEnv.SELLER_AUTH_PASSWORD })
    }), unsafeEnv);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'SELLER_AUTH_NOT_CONFIGURED');
  }
});

test('セラーセッションは明示店舗を正規化して重複を除く', async () => {
  const normalizedEnv = { ...env, SELLER_ALLOWED_TENANTS: ' ITG,itt,itg ' };
  const response = await handleSellerRoutes(new Request('https://hoshilu.app/api/seller/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
    body: JSON.stringify({ id: env.SELLER_AUTH_ID, password: env.SELLER_AUTH_PASSWORD })
  }), normalizedEnv);
  assert.equal(response.status, 200);
  const token = response.headers.get('set-cookie')
    .match(/__Host-hoshilu_seller_session=([^;]+)/)[1];
  const seller = await readSellerSession(new Request('https://hoshilu.app/seller', {
    headers: { cookie: `__Host-hoshilu_seller_session=${token}` }
  }), normalizedEnv);
  assert.deepEqual(seller.tenants, ['itg', 'itt']);

  const narrowed = await readSellerSession(new Request('https://hoshilu.app/seller', {
    headers: { cookie: `__Host-hoshilu_seller_session=${token}` }
  }), {
    ...normalizedEnv,
    SELLER_ALLOWED_TENANTS: 'itg',
    SELLER_ACCOUNT_NAME: 'ITG UPDATED',
    SELLER_PLAN: 'LITE'
  });
  assert.equal(narrowed.account, 'ITG UPDATED');
  assert.deepEqual(narrowed.tenants, ['itg']);
  assert.equal(narrowed.plan, 'LITE');
  assert.match(narrowed.seller_key, /^[A-Za-z0-9_-]{20,120}$/);

  const revoked = await readSellerSession(new Request('https://hoshilu.app/seller', {
    headers: { cookie: `__Host-hoshilu_seller_session=${token}` }
  }), { ...normalizedEnv, SELLER_ALLOWED_TENANTS: 'mc2' });
  assert.equal(revoked, null);

  const changedPassword = await readSellerSession(new Request('https://hoshilu.app/seller', {
    headers: { cookie: `__Host-hoshilu_seller_session=${token}` }
  }), { ...normalizedEnv, SELLER_AUTH_PASSWORD: 'new-strong-password-456' });
  assert.equal(changedPassword, null);

  const changedId = await readSellerSession(new Request('https://hoshilu.app/seller', {
    headers: { cookie: `__Host-hoshilu_seller_session=${token}` }
  }), { ...normalizedEnv, SELLER_AUTH_ID: 'new-seller-admin' });
  assert.equal(changedId, null);
});

test('セラーログインはOrigin未申告と実測サイズ超過を拒否する', async () => {
  const noOrigin = await handleSellerRoutes(new Request('https://hoshilu.app/api/seller/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  }), env);
  assert.equal(noOrigin.status, 403);
  assert.equal((await noOrigin.json()).error, 'ORIGIN_NOT_ALLOWED');

  const oversized = await handleSellerRoutes(new Request('https://hoshilu.app/api/seller/login', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
    body: JSON.stringify({ id: 'seller-admin', password: 'x'.repeat(2100) })
  }), env);
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error, 'REQUEST_TOO_LARGE');
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
  assert.match(cookie, /^__Host-hoshilu_seller_session=/);
  assert.doesNotMatch(cookie, /Domain=/i);
  assert.equal(hasCookie(setCookies(response), 'hoshilu_seller_session',
    /Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=0/), true);
  const token = cookie.match(/__Host-hoshilu_seller_session=([^;]+)/)[1];
  assert.equal(await verifySellerSession(new Request('https://hoshilu.app/seller', {
    headers: { cookie: `__Host-hoshilu_seller_session=${token}` }
  }), env), true);
  const seller = await readSellerSession(new Request('https://hoshilu.app/seller', {
    headers: { cookie: `__Host-hoshilu_seller_session=${token}` }
  }), env);
  assert.equal(seller.account, 'ITG GROUP');
  assert.deepEqual(seller.tenants, ['itg', 'itt', 'mc2']);
  assert.equal(seller.plan, 'PARTNER');
  assert.match(seller.seller_key, /^[A-Za-z0-9_-]{20,120}$/);
  assert.equal(await verifySellerSession(new Request('https://hoshilu.app/seller', {
    headers: { cookie: `__Host-hoshilu_seller_session=${token}` }
  }), env, Math.floor(Date.now() / 1000) + 43200), false);
});

test('セッション確認APIは内部Sellerキーをブラウザへ返さない', async () => {
  const login = await handleSellerRoutes(new Request('https://hoshilu.app/api/seller/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
    body: JSON.stringify({ id: env.SELLER_AUTH_ID, password: env.SELLER_AUTH_PASSWORD })
  }), env);
  const token = login.headers.get('set-cookie').match(/__Host-hoshilu_seller_session=([^;]+)/)[1];
  const response = await handleSellerRoutes(new Request('https://hoshilu.app/api/seller/session', {
    headers: { cookie: `__Host-hoshilu_seller_session=${token}` }
  }), env);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.seller.account, 'ITG GROUP');
  assert.equal('seller_key' in payload.seller, false);
});

test('セラーログアウトは同一オリジンだけ許可する', async () => {
  const blocked = await handleSellerRoutes(new Request('https://hoshilu.app/api/seller/logout', {
    method: 'POST', headers: { origin: 'https://evil.example' }
  }), env);
  assert.equal(blocked.status, 403);
  const response = await handleSellerRoutes(new Request('https://hoshilu.app/api/seller/logout', {
    method: 'POST', headers: { origin: 'https://hoshilu.app' }
  }), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /^__Host-hoshilu_seller_session=/);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  const cookies = setCookies(response);
  assert.equal(hasCookie(cookies, '__Host-hoshilu_seller_session', /Max-Age=0/), true);
  assert.equal(hasCookie(cookies, 'hoshilu_seller_session',
    /Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=0/), true);
});

test('セラーログインは5回失敗後に15分停止する', async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await handleSellerRoutes(new Request('https://hoshilu.app/api/seller/login', {
      method: 'POST',
      headers: { origin: 'https://hoshilu.app', 'content-type': 'application/json',
        'cf-connecting-ip': '203.0.113.40' },
      body: JSON.stringify({ id: env.SELLER_AUTH_ID, password: 'wrong-password-value' })
    }), env);
    assert.equal(response.status, 401);
  }
  const blocked = await handleSellerRoutes(new Request('https://hoshilu.app/api/seller/login', {
    method: 'POST',
    headers: { origin: 'https://hoshilu.app', 'content-type': 'application/json',
      'cf-connecting-ip': '203.0.113.40' },
    body: JSON.stringify({ id: env.SELLER_AUTH_ID, password: env.SELLER_AUTH_PASSWORD })
  }), env);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '900');
});

test('セラー用静的シェルは直接公開しない', async () => {
  const response = await handleSellerRoutes(new Request('https://hoshilu.app/seller-shell.html'), env);
  assert.equal(response.status, 404);
});
