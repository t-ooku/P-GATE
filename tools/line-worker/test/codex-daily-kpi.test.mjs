import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { previousJstDay, previousDayKpi } from '../scripts/codex-daily-kpi.mjs';
import { assertReadOnlySql } from '../scripts/read-codex-kpi-snapshot.mjs';

test('previous JST day crosses month/year boundaries, not rolling 24h', () => {
  const p = previousJstDay(new Date('2026-12-31T23:00:00Z'));
  assert.equal(p.date,'2026-12-31');
  assert.equal(p.start_at,'2026-12-30T15:00:00.000Z');
  assert.equal(p.end_at,'2026-12-31T15:00:00.000Z');
  assert.equal(previousJstDay(new Date('2026-10-27T23:00:00Z')).date,'2026-10-27');
});

test('daily aggregates include start, exclude end, QA/internal and legacy focus; multiple clicks remain events', async () => {
  const s = new DatabaseSync(':memory:');
  s.exec(`CREATE TABLE growth_events(event_type TEXT,traffic_class TEXT,session_id TEXT,content TEXT,occurred_at TEXT);
    CREATE TABLE seller_business_inquiries(created_at TEXT);`);
  const insert=s.prepare('INSERT INTO growth_events VALUES(?,?,?,?,?)');
  for(const [type,traffic,session,content,at] of [
    ['landing_view','ATTRIBUTED','s1','','2026-10-26T15:00:00Z'],
    ['landing_view','ATTRIBUTED','s2','','2026-10-27T15:00:00Z'],
    ['marketplace_click','UNATTRIBUTED','s1','','2026-10-27T01:00:00Z'],
    ['marketplace_click','UNATTRIBUTED','s1','','2026-10-27T02:00:00Z'],
    ['marketplace_click','QA','qa','','2026-10-27T02:00:00Z'],
    ['marketplace_click','INTERNAL','internal','','2026-10-27T02:00:00Z'],
    ['seller_form_started','ATTRIBUTED','s1','consultation','2026-10-27T02:00:00Z'],
    ['seller_form_started','ATTRIBUTED','s2','consultation_input','2026-10-27T02:00:00Z'],
    ['target_price_watch_set','QA','internal','','2026-10-27T02:00:00Z']
  ]) insert.run(type,traffic,session,content,at);
  const db={prepare(sql){const q=s.prepare(assertReadOnlySql(sql));return {bind(...a){return {async all(){return {results:q.all(...a)}}}}}}};
  const j=await previousDayKpi(db,['internal-member'],new Date('2026-10-27T23:00:00Z'));
  assert.equal(j.landing.sessions,1);
  assert.deepEqual(j.marketplace_click,{status:'AVAILABLE',events:2,sessions:1});
  assert.equal(j.seller_input.events,1);
  assert.equal(j.general_watch_saved.events,0);
  assert.equal(j.external_seller_inquiries.count,0);
  assert.equal(j.new_paid_contracts.status,'UNAVAILABLE');
  s.exec(`INSERT INTO seller_business_inquiries VALUES('2026-10-27T02:00:00Z')`);
  assert.equal((await previousDayKpi(db,[],new Date('2026-10-27T23:00:00Z'))).external_seller_inquiries.status,'UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(j), /s1|s2|internal-member/);
  s.close();
});

test('query failure is unavailable, never zero', async () => {
  const j=await previousDayKpi({prepare(){throw Error('offline')}},[],new Date('2026-10-27T23:00:00Z'));
  assert.equal(j.marketplace_click.status,'UNAVAILABLE');
  assert.equal(j.general_watch_saved.status,'UNAVAILABLE');
  assert.equal(j.external_seller_inquiries.status,'UNAVAILABLE');
});
