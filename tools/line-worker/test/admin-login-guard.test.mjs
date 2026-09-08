import test from 'node:test';
import assert from 'node:assert/strict';
import cryptoModule from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  adminLoginFingerprint, adminLoginLocked, recordAdminLoginFailure,
  purgeAdminAuthRecords, recordAdminLoginLocked, recordAdminLoginSuccess,
  recordAdminLogout
} from '../src/admin-login-guard.mjs';

globalThis.crypto ??= cryptoModule.webcrypto;
const migration = readFileSync(new URL('../migrations/0027_admin_login_guard.sql', import.meta.url), 'utf8');
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

test('管理ログイン識別子はIPを保存せずSecret付きハッシュへ変換する', async () => {
  const request = new Request('https://hoshilu.app/api/admin/login', {
    headers: { 'cf-connecting-ip': '203.0.113.10' }
  });
  const fingerprint = await adminLoginFingerprint(request, 'a'.repeat(64));
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(fingerprint, /203\.0\.113\.10/);
});

test('15分内の5回失敗で停止し成功時に解除して監査する', async () => {
  const { sqlite, db } = sqliteD1();
  const fingerprint = 'f'.repeat(64);
  const now = new Date('2026-08-01T00:00:00Z');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await recordAdminLoginFailure(db, fingerprint, new Date(now.getTime() + attempt * 1000));
  }
  assert.equal(await adminLoginLocked(db, fingerprint, new Date('2026-08-01T00:00:05Z')), true);
  await recordAdminLoginLocked(db, fingerprint, new Date('2026-08-01T00:00:05Z'));
  await recordAdminLoginSuccess(db, fingerprint, new Date('2026-08-01T00:20:00Z'));
  await recordAdminLogout(db, fingerprint, new Date('2026-08-01T00:21:00Z'));
  assert.equal(await adminLoginLocked(db, fingerprint, new Date('2026-08-01T00:20:01Z')), false);
  assert.deepEqual(sqlite.prepare(`SELECT event_type,COUNT(*) AS total FROM admin_auth_audit
    GROUP BY event_type ORDER BY event_type`).all().map((row) => ({ ...row })), [
    { event_type: 'LOGIN_FAILURE', total: 5 },
    { event_type: 'LOGIN_LOCKED', total: 1 },
    { event_type: 'LOGIN_SUCCESS', total: 1 },
    { event_type: 'LOGOUT', total: 1 }
  ]);
});

test('管理認証監査は90日、解除済み試行制限は24日ではなく24時間で整理する', async () => {
  const { sqlite, db } = sqliteD1();
  sqlite.prepare(`INSERT INTO admin_auth_audit
    (event_id,event_type,fingerprint_hash,occurred_at) VALUES(?,?,?,?)`)
    .run('old', 'LOGIN_FAILURE', 'a'.repeat(64), '2026-04-01T00:00:00Z');
  sqlite.prepare(`INSERT INTO admin_auth_audit
    (event_id,event_type,fingerprint_hash,occurred_at) VALUES(?,?,?,?)`)
    .run('recent', 'LOGIN_SUCCESS', 'b'.repeat(64), '2026-07-31T00:00:00Z');
  sqlite.prepare(`INSERT INTO admin_login_guard
    (fingerprint_hash,window_started_at,failure_count,locked_until,updated_at)
    VALUES(?,?,?,?,?)`).run(
      'c'.repeat(64), '2026-07-29T00:00:00Z', 1, '', '2026-07-29T00:00:00Z'
    );
  const result = await purgeAdminAuthRecords(
    { PRODUCT_DB: db }, new Date('2026-08-01T00:00:00Z')
  );
  assert.deepEqual(result, { audit_deleted: 1, guards_deleted: 1, available: true });
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS total FROM admin_auth_audit').get().total, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS total FROM admin_login_guard').get().total, 0);
});
