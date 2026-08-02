import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(read('migrations/0004_unmet_demand_events.sql'));
  db.exec(read('migrations/0012_growth_events.sql'));
  db.exec(read('migrations/0013_growth_event_traffic_class.sql'));
  return db;
}

test('匿名トレンド集計は最低母数を満たす非QAカテゴリだけを返す', () => {
  const db = database();
  const growth = db.prepare(`INSERT INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class)
    VALUES(?,?,?,?,?,?,?,?,?,?)`);
  for (let index = 0; index < 100; index += 1) {
    growth.run(`search-${index}`, 'search_started', 'JA', '', '', '', '', '',
      '2026-08-10T01:00:00Z', 'UNATTRIBUTED');
  }
  growth.run('qa-search', 'search_started', 'JA', 'qa_acceptance', 'qa', '', '', '',
    '2026-08-10T01:00:00Z', 'QA');

  const demand = db.prepare(`INSERT INTO unmet_demand_events
    (event_id,occurred_at,user_hash,demand_hash,category,marketplace,destination_type,
     contract_match,demand_status,channel,traffic_class)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
  for (let index = 0; index < 20; index += 1) {
    demand.run(`eligible-${index}`, '2026-08-11T01:00:00Z', `user-${index}`,
      `demand-${index}`, 'home', 'AMAZON_JP', 'PRODUCT', 1,
      index < 5 ? 'UNMET' : 'MATCHED', 'WEB', 'UNATTRIBUTED');
  }
  for (let index = 0; index < 19; index += 1) {
    demand.run(`small-${index}`, '2026-08-11T01:00:00Z', `small-user-${index}`,
      `small-demand-${index}`, 'fashion', 'RAKUTEN_JP', 'PRODUCT', 0,
      'UNMET', 'WEB', 'ATTRIBUTED');
  }
  demand.run('qa-demand', '2026-08-11T01:00:00Z', 'qa-user', 'qa-demand',
    'home', 'AMAZON_JP', 'PRODUCT', 0, 'UNMET', 'WEB', 'QA');
  demand.run('legacy-demand', '2026-08-11T01:00:00Z', 'legacy-user', 'legacy-demand',
    'home', 'AMAZON_JP', 'PRODUCT', 0, 'UNMET', 'WEB', 'LEGACY_UNKNOWN');

  const sql = read('../../marketing/analytics/HOSHILU_ANONYMOUS_SEARCH_TRENDS_REPORT.sql');
  const rows = db.prepare(sql).all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, 'home');
  assert.equal(rows[0].non_qa_searches_started, 100);
  assert.equal(rows[0].demand_events, 20);
  assert.equal(rows[0].distinct_demand_patterns, 20);
  assert.equal(rows[0].unmet_events, 5);
  assert.equal(rows[0].unmet_event_share_pct, 25);
  assert.equal(Object.hasOwn(rows[0], 'user_hash'), false);
  assert.equal(Object.hasOwn(rows[0], 'demand_hash'), false);
});

test('匿名トレンド集計は全体検索母数が100件未満なら何も返さない', () => {
  const db = database();
  const demand = db.prepare(`INSERT INTO unmet_demand_events
    (event_id,occurred_at,user_hash,demand_hash,category,marketplace,destination_type,
     contract_match,demand_status,channel,traffic_class)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
  for (let index = 0; index < 20; index += 1) {
    demand.run(`demand-${index}`, '2026-08-11T01:00:00Z', `user-${index}`,
      `hash-${index}`, 'home', 'AMAZON_JP', 'PRODUCT', 0, 'UNMET', 'WEB', 'UNATTRIBUTED');
  }
  const sql = read('../../marketing/analytics/HOSHILU_ANONYMOUS_SEARCH_TRENDS_REPORT.sql');
  assert.deepEqual(db.prepare(sql).all(), []);
});
