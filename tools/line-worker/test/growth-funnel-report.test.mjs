import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('SNS外ファネルSQLはQAを実績から分離して率を計算する', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(read('migrations/0004_unmet_demand_events.sql'));
  db.exec(read('migrations/0012_growth_events.sql'));
  db.exec(read('migrations/0013_growth_event_traffic_class.sql'));
  const insert = db.prepare(`INSERT INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class)
    VALUES(?,?,?,?,?,?,?,?,?,?)`);
  const add = (id, eventType, trafficClass = 'ATTRIBUTED') => insert.run(
    id, eventType, 'JA', trafficClass === 'QA' ? 'qa_acceptance' : 'google',
    trafficClass === 'QA' ? 'qa' : 'cpc', 'acq_unknown_product_202608', 'rsa_a', '',
    '2026-08-02T01:00:00Z', trafficClass
  );
  add('landing', 'landing_view');
  add('started', 'search_started');
  add('completed', 'search_completed');
  add('registration', 'registration_completed');
  add('marketplace', 'marketplace_click');
  add('qa-landing', 'landing_view', 'QA');

  const statements = read('../../marketing/analytics/HOSHILU_GROWTH_FUNNEL_REPORT.sql')
    .split(';').map((value) => value.trim()).filter(Boolean);
  const rows = db.prepare(statements[0]).all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].channel, 'PAID_SEARCH');
  assert.equal(rows[0].landing_views, 1);
  assert.equal(rows[0].search_completion_pct, 100);
  assert.equal(rows[0].marketplace_clicks, 1);

  const qaRows = db.prepare(statements[1]).all();
  assert.equal(qaRows.length, 1);
  assert.equal(qaRows[0].qa_events, 1);
});
