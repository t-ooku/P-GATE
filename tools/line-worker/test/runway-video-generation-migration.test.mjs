import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../migrations/0050_runway_video_generation.sql', import.meta.url), 'utf8');
test('Runway generation migration is idempotent and enforces budget/job invariants', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(sql); db.exec(sql);
  const policy = db.prepare('SELECT * FROM runway_budget_policy WHERE policy_id=1').get();
  assert.equal(policy.initial_cap_credits, 1000); assert.equal(policy.monthly_cap_credits, 3000); assert.equal(policy.enabled, 1); assert.equal(policy.kill_switch, 0); assert.equal(policy.initial_test_completed, 0);
  const cols = db.prepare("SELECT name FROM pragma_table_info('runway_generation_jobs')").all().map(x => x.name);
  for (const c of ['job_id','post_id','request_fingerprint','provider_task_id','status','recipe','recipe_version','character_image_url','product_image_url','duration_seconds','ratio','audio','product_info','user_concept','caption','link','expected_credits','rights_confirmed','ai_disclosure_confirmed','storage_key','qa_status','attempt_count','max_attempts','created_at','updated_at']) assert.ok(cols.includes(c), c);
  const base = {job_id:'j1',request_fingerprint:'fp',status:'APPROVED',recipe:'product_ugc',character_image_url:'https://x/c.jpg',product_image_url:'https://x/p.jpg',duration_seconds:8,ratio:'720:1280',product_info:'info',user_concept:'concept',expected_credits:336,created_at:'x',updated_at:'x'};
  const fields = Object.keys(base), vals = Object.values(base); db.prepare(`INSERT INTO runway_generation_jobs(${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`).run(...vals);
  const duplicate = {...base, job_id:'j2'};
  assert.throws(() => db.prepare(`INSERT INTO runway_generation_jobs(${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`).run(...fields.map(f => duplicate[f])));
  assert.throws(() => db.prepare("UPDATE runway_generation_jobs SET duration_seconds=3 WHERE job_id='j1'").run());
  db.prepare("INSERT INTO runway_generation_attempts(attempt_id,job_id,attempt_number,status,expected_credits,created_at,updated_at) VALUES ('a1','j1',1,'RESERVED',336,'x','x')").run();
  assert.throws(() => db.prepare("INSERT INTO runway_cost_reservations(reservation_id,attempt_id,job_id,scope,period_key,status,credits,created_at,updated_at) VALUES ('r1','a1','j1','BAD','m','RESERVED',1,'x','x')").run());
  assert.throws(() => db.prepare("INSERT INTO runway_cost_reservations(reservation_id,attempt_id,job_id,scope,period_key,status,credits,created_at,updated_at) VALUES ('r2','a1','j1','TEST','INITIAL_2026-08-13','RESERVED',1001,'x','x')").run(), /RUNWAY_INITIAL_TEST_LIMIT/);

  db.prepare("UPDATE runway_generation_jobs SET status='PROCESSING' WHERE job_id='j1'").run();
  const second = {...base, job_id:'j3', request_fingerprint:'fp-3', status:'APPROVED'};
  db.prepare(`INSERT INTO runway_generation_jobs(${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`).run(...fields.map(f => second[f]));
  assert.throws(() => db.prepare("UPDATE runway_generation_jobs SET status='PROCESSING' WHERE job_id='j3'").run());
});
