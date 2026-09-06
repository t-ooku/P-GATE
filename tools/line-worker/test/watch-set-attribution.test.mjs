import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { internalMemberIds, recordTargetPriceWatchSet } from '../src/growth-events.mjs';

function databaseEnv(extra = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE growth_events (event_id TEXT PRIMARY KEY, event_type TEXT, locale TEXT, source TEXT,
    medium TEXT, campaign TEXT, content TEXT, marketplace TEXT, occurred_at TEXT, traffic_class TEXT,
    visitor_id TEXT, session_id TEXT);`);
  const env = { ...extra, PRODUCT_DB: { prepare(sql) { const statement = db.prepare(sql); let values = [];
    return { bind(...next) { values = next; return this; },
      async run() { statement.run(...values); return { success: true }; },
      async all() { return { results: statement.all(...values) }; } }; } } };
  return { db, env };
}

const SESSION = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const VISITOR = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

test('希望価格の登録は流入元と匿名IDだけを1件残す（会員ID・商品名・金額は残さない）', async () => {
  const { db, env } = databaseEnv();
  const ok = await recordTargetPriceWatchSet(env, {
    memberId: 'member-1', wishId: 'wish-1', locale: 'JA',
    attribution: { source: 'threads', medium: 'social', campaign: 'hoshilu-deal-daily-v1', content: 'watch-bottle' },
    visitorId: VISITOR, sessionId: SESSION, now: new Date('2026-09-06T00:00:00.000Z')
  });
  assert.equal(ok, true);
  const row = db.prepare('SELECT * FROM growth_events').get();
  assert.equal(row.event_type, 'target_price_watch_set');
  assert.equal(row.source, 'threads');
  assert.equal(row.traffic_class, 'ATTRIBUTED');
  assert.equal(row.session_id, SESSION);
  const serialized = JSON.stringify(row);
  assert.doesNotMatch(serialized, /member-1|wish-1/u);
});

test('同じウォッチを何度保存し直しても1件のまま', async () => {
  const { db, env } = databaseEnv();
  const args = { memberId: 'm', wishId: 'w', attribution: { source: 'x' }, sessionId: SESSION };
  await recordTargetPriceWatchSet(env, args);
  await recordTargetPriceWatchSet(env, args);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM growth_events').get().n, 1);
});

test('内部・テスト会員の登録は QA として書き、集計から外れる', async () => {
  const internal = 'IEpqu7DILaYNEAh9-Nsmqow9eILwTW0jFQAdpi520Tk';
  const { db, env } = databaseEnv({ INTERNAL_MEMBER_IDS: `x , ${internal} ,` });
  assert.equal(internalMemberIds(env).has(internal), true);
  assert.equal(internalMemberIds({}).size, 0);
  await recordTargetPriceWatchSet(env, { memberId: internal, wishId: 'w', attribution: { source: 'threads' }, sessionId: SESSION });
  assert.equal(db.prepare('SELECT traffic_class FROM growth_events').get().traffic_class, 'QA');
});

test('保存に必要な情報が無ければ何も書かない', async () => {
  const { db, env } = databaseEnv();
  assert.equal(await recordTargetPriceWatchSet(env, { memberId: '', wishId: 'w' }), false);
  assert.equal(await recordTargetPriceWatchSet(env, { memberId: 'm', wishId: '' }), false);
  assert.equal(await recordTargetPriceWatchSet({}, { memberId: 'm', wishId: 'w' }), false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM growth_events').get().n, 0);
});

test('ブラウザからは作れない（EVENTS 許可リストに入れない）', () => {
  const source = readFileSync(new URL('../src/growth-events.mjs', import.meta.url), 'utf8');
  const allowlist = source.slice(source.indexOf('const EVENTS'), source.indexOf('const MARKETPLACES'));
  assert.doesNotMatch(allowlist, /target_price_watch_set/u);
});

test('配線と集計（保存時に記録し、流入元別と訪問→Watch Set率を出す）', () => {
  const wish = readFileSync(new URL('../src/member-wish-v2.mjs', import.meta.url), 'utf8');
  assert.match(wish, /recordTargetPriceWatchSet/u);
  assert.match(wish, /if \(targetPrice !== null\) \{/u);
  const dashboard = readFileSync(new URL('../src/promotion-dashboard.mjs', import.meta.url), 'utf8');
  assert.match(dashboard, /visit_to_watch_set: percentage\(metrics\.watch_set_sessions, metrics\.landing_sessions\)/u);
  assert.match(dashboard, /watch_set_rate: percentage/u);
  // 画面側は流入元と匿名IDを一緒に送る。
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /function watchAttributionPayload\(\)/u);
  assert.match(app, /return\{\.\.\.watchAttributionPayload\(\),query,language:elements\.language\.value/u);
  const analytics = readFileSync(new URL('../public/growth-analytics.mjs', import.meta.url), 'utf8');
  assert.match(analytics, /window\.HoshiluGrowthIdentity = Object\.freeze/u);
});
