import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migration = (name) => readFileSync(
  new URL(`../migrations/${name}`, import.meta.url),
  'utf8'
);
const plainRows = (rows) => rows.map((row) => ({ ...row }));

test('growth traffic migration classifies known QA and preserves legacy uncertainty', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(migration('0012_growth_events.sql'));
  db.exec(migration('0004_unmet_demand_events.sql'));

  const insertGrowth = db.prepare(`INSERT INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at)
    VALUES(?,?,?,?,?,?,?,?,?)`);
  insertGrowth.run(
    'direct', 'landing_view', 'JA', '', '', '', '', '', '2026-07-30T00:00:00Z'
  );
  insertGrowth.run(
    'qa', 'landing_view', 'JA', 'codex_acceptance', 'qa',
    'production_acceptance', 'smoke', '', '2026-07-30T00:01:00Z'
  );
  insertGrowth.run(
    'instagram', 'landing_view', 'JA', 'instagram', 'organic_social',
    'itg_brand_reel', 'findfun', '', '2026-07-30T00:02:00Z'
  );

  db.prepare(`INSERT INTO unmet_demand_events
    (event_id,occurred_at,user_hash,demand_hash,category,marketplace,
     destination_type,contract_match,demand_status,channel)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
    'legacy', '2026-07-29T00:00:00Z', 'hash1', 'demand1', 'charger',
    'AMAZON_JP', 'AMAZON_SEARCH_FALLBACK', 0, 'UNMET', 'PWA'
  );

  db.exec(migration('0013_growth_event_traffic_class.sql'));

  assert.deepEqual(
    plainRows(db.prepare('SELECT event_id,traffic_class FROM growth_events ORDER BY event_id').all()),
    [
      { event_id: 'direct', traffic_class: 'UNATTRIBUTED' },
      { event_id: 'instagram', traffic_class: 'ATTRIBUTED' },
      { event_id: 'qa', traffic_class: 'QA' }
    ]
  );
  assert.deepEqual(
    plainRows(db.prepare('SELECT event_id,traffic_class FROM unmet_demand_events').all()),
    [{ event_id: 'legacy', traffic_class: 'LEGACY_UNKNOWN' }]
  );
  assert.deepEqual(
    plainRows(db.prepare(`SELECT traffic_class,COUNT(*) AS events
      FROM growth_events WHERE traffic_class<>'QA'
      GROUP BY traffic_class ORDER BY traffic_class`).all()),
    [
      { traffic_class: 'ATTRIBUTED', events: 1 },
      { traffic_class: 'UNATTRIBUTED', events: 1 }
    ]
  );
});
