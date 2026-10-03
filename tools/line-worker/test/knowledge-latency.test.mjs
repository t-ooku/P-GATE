import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  KNOWLEDGE_LATENCY_RETENTION_MS, KNOWLEDGE_LATENCY_STAGES, createStageClock, knowledgeLatencyRow,
  purgeKnowledgeLatencyLog, recordKnowledgeLatency
} from '../src/knowledge-latency.mjs';

function databaseEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0094_knowledge_latency_log.sql', import.meta.url), 'utf8'));
  const env = { PRODUCT_DB: { prepare(sql) { const statement = db.prepare(sql); let values = [];
    return { bind(...next) { values = next; return this; },
      async run() { statement.run(...values); return { success: true }; },
      async all() { return { results: statement.all(...values) }; } }; } } };
  return { db, env };
}

// 2026-10-03 検索時間 2 秒短縮: 段階ごとのミリ秒だけを残す（検索文も利用者の情報も残さない）。
test('検索の所要時間は段階ごとのミリ秒・入力の種類・レーン数・利用区分だけを残す', () => {
  const row = knowledgeLatencyRow({ inputKind: 'text', trafficClass: 'ATTRIBUTED', lanes: 4, lateLanes: 1, resultCount: 60,
    lateLaneKeys: ['zozotown_official_store', 'ブラウス 白', 'yahoo_catalog_connected'],
    stages: { gate_ms: 12.6, analysis_ms: 0, lookup_ms: 1490, marketplace_ms: 4501, google_wait_ms: 120, decorate_ms: 310, total_ms: 7440 } });
  assert.deepEqual(Object.keys(row), ['log_id', 'input_kind', 'traffic_class', ...KNOWLEDGE_LATENCY_STAGES, 'lanes', 'late_lanes', 'late_lane_keys', 'result_count', 'created_at']);
  assert.equal(row.gate_ms, 13);
  assert.equal(row.marketplace_ms, 4501);
  assert.equal(row.late_lanes, 1);
  // レーン名は固定の識別子だけ（検索文のような文字列は落とす）。
  assert.equal(row.late_lane_keys, 'zozotown_official_store,yahoo_catalog_connected');
  assert.equal(row.result_count, 60);
  // 想定外の値は書かない（未知の入力種別・未知の利用区分）。
  assert.equal(knowledgeLatencyRow({ inputKind: 'voice', trafficClass: 'QA' }), null);
  assert.equal(knowledgeLatencyRow({ inputKind: 'text', trafficClass: 'SELLER' }), null);
  // 異常な数値は丸める（負・巨大）。
  assert.equal(knowledgeLatencyRow({ inputKind: 'image', trafficClass: 'QA', stages: { total_ms: 9e9 }, lanes: -3 }).total_ms, 600000);
  assert.equal(knowledgeLatencyRow({ inputKind: 'image', trafficClass: 'QA', lanes: -3 }).lanes, 0);
});

test('所要時間は D1 に残り、14 日で消える。計測が落ちても検索は止めない', async () => {
  const { db, env } = databaseEnv();
  const now = new Date('2026-10-03T12:00:00.000Z');
  assert.equal(await recordKnowledgeLatency(env, { inputKind: 'text', trafficClass: 'QA', stages: { total_ms: 7200 }, lateLaneKeys: ['zozotown_official_store'], now }), true);
  const stored = db.prepare('SELECT * FROM knowledge_latency_log').get();
  assert.equal(stored.total_ms, 7200);
  assert.equal(stored.traffic_class, 'QA');
  assert.equal(stored.late_lane_keys, 'zozotown_official_store');
  assert.deepEqual(Object.keys(stored).filter((key) => /query|session|image|user|member/u.test(key)), []);
  await purgeKnowledgeLatencyLog(env, new Date(now.getTime() + KNOWLEDGE_LATENCY_RETENTION_MS + 1000));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM knowledge_latency_log').get().n, 0);
  assert.equal(await recordKnowledgeLatency({}, { inputKind: 'text', trafficClass: 'QA' }), false);
});

test('段階の時計は mark の間隔を段階に積み、合計は開始からの経過', () => {
  let t = 1000;
  const clock = createStageClock(() => t);
  t = 1012; clock.mark('gate_ms');
  t = 2500; clock.mark('lookup_ms');
  t = 7000; clock.mark('marketplace_ms');
  clock.set('google_wait_ms', 150.4);
  t = 7400; clock.mark('decorate_ms');
  assert.deepEqual(clock.stages(), { gate_ms: 12, lookup_ms: 1488, marketplace_ms: 4500, google_wait_ms: 150, decorate_ms: 400, total_ms: 6400 });
});

test('/api/knowledge は段階ごとの所要時間を D1 に残し、検索文を渡さない。古い行は定期実行で消す', () => {
  const source = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(source, /recordKnowledgeLatency\(env, \{[\s\S]{0,400}?inputKind[\s\S]{0,400}?trafficClass: input\.traffic_class/u);
  // 本検索の記録（続き handleKnowledgeFollowup の記録より後ろにある方）
  const call = source.slice(source.lastIndexOf('recordKnowledgeLatency(env, {'), source.lastIndexOf('recordKnowledgeLatency(env, {') + 600);
  assert.ok(!/input\.query|submittedQuery|session_id|search_image|social_url/u.test(call), '検索文・画像・セッションIDを渡さない');
  assert.match(call, /lateLaneKeys: latency\.lateLanes/u, '遅れたレーン名を残す（対策 (b)(c) の判断材料）');
  for (const stage of ['gate_ms', 'lookup_ms', 'marketplace_ms', 'google_wait_ms', 'decorate_ms']) assert.match(source, new RegExp(`'${stage}'`, 'u'), stage);
  assert.match(source, /purgeKnowledgeLatencyLog\(env, scheduledAt\)/u);
});
