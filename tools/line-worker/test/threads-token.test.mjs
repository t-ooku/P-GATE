import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { resolveThreadsToken, withThreadsToken, THREADS_REFRESH_EVERY_MS, tokenFingerprint } from '../src/threads-token.mjs';

// 2026-10-17 大隆さん「スレッズはどうすればいいの？」→「おけ、続けて」: 60 日で切れる Threads のトークンを自動で延長する
function d1(database) {
  return {
    prepare(sql) {
      const statement = database.prepare(sql);
      let params = [];
      const api = {
        bind(...values) { params = values; return api; },
        async first() { return statement.get(...params) ?? null; },
        async run() { const info = statement.run(...params); return { meta: { changes: info.changes } }; }
      };
      return api;
    }
  };
}
const KEY = 'k'.repeat(40);
function setup() {
  const database = new DatabaseSync(':memory:');
  database.exec(readFileSync(new URL('../migrations/0095_threads_token_store.sql', import.meta.url), 'utf8'));
  return database;
}

test('Threads のトークン: secret を種にし、3 日ごとに延長して暗号化して保存する。延長後はその新しいトークンを使う', async () => {
  const database = setup();
  const env = { PRODUCT_DB: d1(database), THREADS_ACCESS_TOKEN: 'seed-token', SOCIAL_OAUTH_ENCRYPTION_KEY: KEY };
  const calls = [];
  const fetchImpl = async (url) => { calls.push(String(url)); return Response.json({ access_token: 'refreshed-1', token_type: 'bearer', expires_in: 5184000 }); };
  const t0 = new Date('2026-10-17T10:00:00Z');
  const first = await resolveThreadsToken(env, { fetchImpl, now: t0 });
  assert.deepEqual([first.token, first.source], ['seed-token', 'secret_seeded']);
  const stored = database.prepare("SELECT * FROM threads_token_store WHERE platform='THREADS'").get();
  assert.ok(!JSON.stringify(stored).includes('seed-token'), 'トークンを平文で保存しない');
  assert.equal(stored.seed_fingerprint, await tokenFingerprint('seed-token'));
  // 24 時間以上たつまでは延長しない（Threads の決まり）。3 日たつまでは保存した物をそのまま使う
  const early = await resolveThreadsToken(env, { fetchImpl, now: new Date(t0.getTime() + 24 * 3600e3) });
  assert.deepEqual([early.token, early.source], ['seed-token', 'stored']);
  assert.equal(calls.length, 0);
  const later = new Date(t0.getTime() + THREADS_REFRESH_EVERY_MS + 1000);
  const refreshed = await resolveThreadsToken(env, { fetchImpl, now: later });
  assert.deepEqual([refreshed.token, refreshed.source, refreshed.refreshed], ['refreshed-1', 'refreshed', true]);
  assert.match(calls[0], /^https:\/\/graph\.threads\.net\/refresh_access_token\?grant_type=th_refresh_token&access_token=seed-token$/u);
  assert.equal(refreshed.expires_at, new Date(later.getTime() + 5184000 * 1000).toISOString());
  // 次の周回は延長後のトークン（secret は同じまま）
  const next = await resolveThreadsToken(env, { fetchImpl, now: new Date(later.getTime() + 60e3) });
  assert.deepEqual([next.token, next.source], ['refreshed-1', 'stored']);
  // 大隆さんが secret を入れ直したら、新しい方を種にし直す
  const reset = await resolveThreadsToken({ ...env, THREADS_ACCESS_TOKEN: 'new-seed' }, { fetchImpl, now: new Date(later.getTime() + 120e3) });
  assert.deepEqual([reset.token, reset.source], ['new-seed', 'secret_seeded']);
});

test('Threads のトークン: 延長に失敗しても手元のトークンで続け、6 時間は再試行しない。表・鍵が無ければ secret のまま', async () => {
  const database = setup();
  const env = { PRODUCT_DB: d1(database), THREADS_ACCESS_TOKEN: 'seed-token', SOCIAL_OAUTH_ENCRYPTION_KEY: KEY };
  let calls = 0;
  const failing = async () => { calls += 1; return new Response('{"error":{"code":190}}', { status: 400 }); };
  const t0 = new Date('2026-10-17T10:00:00Z');
  await resolveThreadsToken(env, { fetchImpl: failing, now: t0 });
  const due = new Date(t0.getTime() + THREADS_REFRESH_EVERY_MS + 1000);
  const failed = await resolveThreadsToken(env, { fetchImpl: failing, now: due });
  assert.deepEqual([failed.token, failed.error], ['seed-token', 'THREADS_REFRESH_400']);
  assert.equal(database.prepare("SELECT last_error FROM threads_token_store").get().last_error, 'THREADS_REFRESH_400');
  await resolveThreadsToken(env, { fetchImpl: failing, now: new Date(due.getTime() + 3600e3) });
  assert.equal(calls, 1, '6 時間以内は API を叩き直さない');
  await resolveThreadsToken(env, { fetchImpl: failing, now: new Date(due.getTime() + 7 * 3600e3) });
  assert.equal(calls, 2);
  // 鍵が無い・短い／表が無い → secret のまま
  assert.equal((await resolveThreadsToken({ ...env, SOCIAL_OAUTH_ENCRYPTION_KEY: 'short' })).source, 'secret');
  const noTable = { PRODUCT_DB: d1(new DatabaseSync(':memory:')), THREADS_ACCESS_TOKEN: 'seed-token', SOCIAL_OAUTH_ENCRYPTION_KEY: KEY };
  assert.deepEqual(await resolveThreadsToken(noTable), { token: 'seed-token', source: 'secret', reason: 'no_table' });
  assert.equal((await resolveThreadsToken({})).source, 'none');
  // 入口のラッパーは、どんな失敗でも env をそのまま返す（投稿を止めない）
  const broken = { THREADS_ACCESS_TOKEN: 'seed-token', SOCIAL_OAUTH_ENCRYPTION_KEY: KEY, PRODUCT_DB: { prepare() { throw new Error('boom'); } } };
  assert.equal((await withThreadsToken(broken)).THREADS_ACCESS_TOKEN, 'seed-token');
  const source = readFileSync(new URL('../src/social-publisher.mjs', import.meta.url), 'utf8');
  for (const name of ['runDueSocialPosts', 'syncThreadsInsights', 'retractOldPricingPosts']) {
    const start = source.indexOf(`export async function ${name}(`);
    assert.ok(start >= 0 && source.slice(start, start + 300).includes('env = await withThreadsToken(env'), name);
  }
});
