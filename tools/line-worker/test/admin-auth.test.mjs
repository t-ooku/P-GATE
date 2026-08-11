import test from 'node:test';
import assert from 'node:assert/strict';
import cryptoModule from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

globalThis.crypto ??= cryptoModule.webcrypto;
globalThis.btoa ??= (value) => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ??= (value) => Buffer.from(value, 'base64').toString('binary');

const { handleAdminAuthRoutes, readAdminSession } = await import('../src/admin-auth.mjs');
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../migrations/0027_admin_login_guard.sql', import.meta.url), 'utf8'));
const db = {
  prepare(sql) {
    const statement = sqlite.prepare(sql);
    return { bind(...values) { return {
      run: async () => {
        const result = statement.run(...values);
        return { meta: { changes: Number(result.changes || 0) } };
      },
      first: async () => statement.get(...values) || null
    }; } };
  },
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
};
const env = {
  ADMIN_AUTH_ID: 'owner@example.com',
  ADMIN_AUTH_PASSWORD: 'A1b2C3d4',
  ADMIN_SESSION_SECRET: 'a'.repeat(64),
  PRODUCT_DB: db
};
const loginRequest = (id, password, address = '203.0.113.80') => new Request(
  'https://hoshilu.app/api/admin/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json', origin: 'https://hoshilu.app',
      'cf-connecting-ip': address
    },
    body: JSON.stringify({ id, password })
  }
);

test('所有者はメールアドレスと8文字のパスワードでログインできる', async () => {
  const response = await handleAdminAuthRoutes(
    loginRequest(` ${env.ADMIN_AUTH_ID} `, env.ADMIN_AUTH_PASSWORD), env
  );
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /^__Host-hoshilu_admin_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  const token = cookie.match(/__Host-hoshilu_admin_session=([^;]+)/)[1];
  assert.deepEqual(await readAdminSession(new Request('https://hoshilu.app/admin/promotion', {
    headers: { cookie: `__Host-hoshilu_admin_session=${token}` }
  }), env), { role: 'operator' });
});

test('8文字未満の管理パスワード設定は拒否する', async () => {
  const shortPasswordEnv = { ...env, ADMIN_AUTH_PASSWORD: 'Ab12cd3' };
  const response = await handleAdminAuthRoutes(
    loginRequest(shortPasswordEnv.ADMIN_AUTH_ID, shortPasswordEnv.ADMIN_AUTH_PASSWORD, '203.0.113.81'),
    shortPasswordEnv
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'ADMIN_AUTH_NOT_CONFIGURED');
});

test('誤った管理パスワードは拒否する', async () => {
  const response = await handleAdminAuthRoutes(
    loginRequest(env.ADMIN_AUTH_ID, 'wrong-pass', '203.0.113.82'), env
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'LOGIN_FAILED');
});
