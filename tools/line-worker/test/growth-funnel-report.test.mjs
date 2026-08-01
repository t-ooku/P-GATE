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
  db.exec(read('migrations/0024_growth_experiments.sql'));
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
  add('exposure', 'experiment_exposure');
  insert.run('seo-landing', 'landing_view', 'JA', '', '', '', 'seo_find_product_without_name', '', '2026-08-02T02:00:00Z', 'UNATTRIBUTED');
  insert.run('seo-started', 'search_started', 'JA', '', '', '', 'seo_find_product_without_name', '', '2026-08-02T02:01:00Z', 'UNATTRIBUTED');
  insert.run('seo-completed', 'search_completed', 'JA', '', '', '', 'seo_find_product_without_name', '', '2026-08-02T02:02:00Z', 'UNATTRIBUTED');
  insert.run('seo-qa', 'landing_view', 'JA', 'qa_acceptance', 'qa', '', 'seo_find_product_without_name', '', '2026-08-02T02:03:00Z', 'QA');
  db.exec(`UPDATE growth_events
    SET experiment='lp_search_cta_v1', variant='benefit'
    WHERE traffic_class <> 'QA' AND campaign='acq_unknown_product_202608'`);

  const statements = read('../../marketing/analytics/HOSHILU_GROWTH_FUNNEL_REPORT.sql')
    .split(';').map((value) => value.trim()).filter(Boolean);
  const rows = db.prepare(statements[0]).all();
  const paidRow = rows.find((row) => row.channel === 'PAID_SEARCH');
  assert.equal(paidRow.landing_views, 1);
  assert.equal(paidRow.search_completion_pct, 100);
  assert.equal(paidRow.marketplace_clicks, 1);

  const qaRows = db.prepare(statements[1]).all();
  assert.equal(qaRows.length, 2);
  assert.equal(qaRows.reduce((total, row) => total + row.qa_events, 0), 2);

  const experimentRows = db.prepare(statements[2]).all();
  assert.equal(experimentRows.length, 1);
  assert.equal(experimentRows[0].experiment, 'lp_search_cta_v1');
  assert.equal(experimentRows[0].variant, 'benefit');
  assert.equal(experimentRows[0].exposures, 1);
  assert.equal(experimentRows[0].exposure_to_search_pct, 100);

  const seoRows = db.prepare(statements[3]).all();
  assert.equal(seoRows.length, 1);
  assert.equal(seoRows[0].seo_landing, 'seo_find_product_without_name');
  assert.equal(seoRows[0].landing_views, 1);
  assert.equal(seoRows[0].landing_to_search_pct, 100);
  assert.equal(seoRows[0].search_completion_pct, 100);
});
