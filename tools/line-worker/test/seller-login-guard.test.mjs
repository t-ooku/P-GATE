import test from 'node:test';
import assert from 'node:assert/strict';
import cryptoModule from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  sellerLoginFingerprint, sellerLoginLocked, recordSellerLoginFailure,
  recordSellerLoginLocked, recordSellerLoginSuccess, recordSellerLogout,
  purgeSellerAuthRecords
} from '../src/seller-login-guard.mjs';

globalThis.crypto ??= cryptoModule.webcrypto;
const migration = readFileSync(
  new URL('../migrations/0028_seller_login_guard.sql', import.meta.url), 'utf8'
);
const sqliteD1 = () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(migration);
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return { bind(...values) { return {
        run: async () => { const result = statement.run(...values); return { meta: { changes: Number(result.changes || 0) } }; },
        first: async () => statement.get(...values) || null
      }; } };
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
  };
  return { sqlite, db };
};

test('セラーログイン識別子は管理者と分離したSecret付きハッシュにする', async () => {
  const request = new Request('https://hoshilu.app/api/seller/login', {
    headers: { 'cf-connecting-ip': '203.0.113.50' }
  });
  const fingerprint = await sellerLoginFingerprint(request, 's'.repeat(64));
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(fingerprint, /203\.0\.113\.50/);
});

test('セラー認証は15分内の5回失敗で停止し全イベントを監査する', async () => {
  const { sqlite, db } = sqliteD1();
  const fingerprint = 'f'.repeat(64);
  const now = new Date('2026-08-02T00:00:00Z');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await recordSellerLoginFailure(db, fingerprint, new Date(now.getTime() + attempt * 1000));
  }
  assert.equal(await sellerLoginLocked(db, fingerprint, new Date('2026-08-02T00:00:05Z')), true);
  await recordSellerLoginLocked(db, fingerprint, new Date('2026-08-02T00:00:05Z'));
  await recordSellerLoginSuccess(db, fingerprint, new Date('2026-08-02T00:20:00Z'));
  await recordSellerLogout(db, fingerprint, new Date('2026-08-02T00:21:00Z'));
  assert.deepEqual(sqlite.prepare(`SELECT event_type,COUNT(*) AS total FROM seller_auth_audit
    GROUP BY event_type ORDER BY event_type`).all().map((row) => ({ ...row })), [
    { event_type: 'LOGIN_FAILURE', total: 5 },
    { event_type: 'LOGIN_LOCKED', total: 1 },
    { event_type: 'LOGIN_SUCCESS', total: 1 },
    { event_type: 'LOGOUT', total: 1 }
  ]);
});

test('セラー認証監査は90日、解除済み試行制限は24時間で整理する', async () => {
  const { sqlite, db } = sqliteD1();
  sqlite.prepare(`INSERT INTO seller_auth_audit
    (event_id,event_type,fingerprint_hash,occurred_at) VALUES(?,?,?,?)`)
    .run('old', 'LOGIN_FAILURE', 'a'.repeat(64), '2026-04-01T00:00:00Z');
  sqlite.prepare(`INSERT INTO seller_login_guard
    (fingerprint_hash,window_started_at,failure_count,locked_until,updated_at)
    VALUES(?,?,?,?,?)`).run(
      'b'.repeat(64), '2026-07-30T00:00:00Z', 1, '', '2026-07-30T00:00:00Z'
    );
  assert.deepEqual(await purgeSellerAuthRecords(
    { PRODUCT_DB: db }, new Date('2026-08-02T00:00:00Z')
  ), { audit_deleted: 1, guards_deleted: 1, available: true });
});
