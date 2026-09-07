import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { assertReadOnlySql, targetPriceDiagnostics } from '../scripts/read-codex-kpi-snapshot.mjs';

test('ウォッチ診断は読取専用・集計だけで欠落IDと最近の巡回を区別する', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE member_wishes(watch_price,condition_snapshot);
    CREATE TABLE target_price_observations(reason,observed_at);
    CREATE TABLE search_watch_matches(product_identity_key,matched_at);
    INSERT INTO member_wishes VALUES(1,'{"price_condition":{"target_price_jpy":2500,"target_product_key":"YAHOO:item-1"}}'),
      (1,'{"price_condition":{"target_price_jpy":2500,"target_product_key":""}}'),(0,'{}');
    INSERT INTO target_price_observations VALUES('ABOVE_TARGET',datetime('now')),('NO_MATCH',datetime('now')),('REACHED','2020-01-01');
    INSERT INTO search_watch_matches VALUES('TARGET_PRICE_CHECK',datetime('now'));`);
  const db = { prepare(sql) { const statement = sqlite.prepare(assertReadOnlySql(sql)); return {
    first: async () => statement.get(), all: async () => ({ results: statement.all() })
  }; } };
  const result = await targetPriceDiagnostics(db);
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.includes_internal_tests, true);
  assert.deepEqual(result.watches, { total: 2, with_product_key: 1, without_product_key: 1 });
  assert.deepEqual(result.observations_last_24h.map(row => row.reason), ['ABOVE_TARGET','NO_MATCH']);
  assert.ok(result.last_checked_at);
  assert.doesNotMatch(JSON.stringify(result), /YAHOO:item-1|member_id|wish_id|query_text|target_product_name/);
});

test('D1確認に失敗した診断は0件に偽装しない', async () => {
  assert.deepEqual(await targetPriceDiagnostics({ prepare() { throw new Error('DB unavailable'); } }),
    { status: 'UNAVAILABLE', includes_internal_tests: true });
});
