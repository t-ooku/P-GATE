import test from 'node:test';
import assert from 'node:assert/strict';
import { acknowledgeReliabilityIncidents, writeGithubScheduleHeartbeat } from '../scripts/production-monitor-control.mjs';

function mockD1(inspect) {
  return async (_url, init) => {
    assert.equal(init.headers.authorization, 'Bearer token');
    const payload = JSON.parse(init.body);
    inspect(payload);
    return Response.json({ success:true, result:[{ success:true, meta:{ changes:1 } }] });
  };
}

test('scheduled heartbeat writes only a fixed internal row and numeric run id', async () => {
  const result = await writeGithubScheduleHeartbeat({
    accountId:'account', apiToken:'token', status:'STARTED', runId:'31689726133',
    now:Date.parse('2026-08-13T11:00:00Z'), fetcher:mockD1(({ sql, params }) => {
      assert.match(sql, /event_type.*reliability_heartbeat/su);
      assert.match(sql, /ON CONFLICT\(event_id\) DO UPDATE/u);
      assert.deepEqual(params.slice(0, 3), ['reliability-heartbeat:github_schedule','STARTED','31689726133']);
      assert.doesNotMatch(sql, /query_text|prompt|history|response|authorization/iu);
    })
  });
  assert.equal(result.status, 'STARTED');
});

test('push bootstrap cannot overwrite a real scheduled heartbeat', async () => {
  await writeGithubScheduleHeartbeat({
    accountId:'account', apiToken:'token', status:'BOOTSTRAP', runId:'1',
    fetcher:mockD1(({ sql }) => {
      assert.match(sql, /INSERT OR IGNORE/u);
      assert.doesNotMatch(sql, /DO UPDATE/u);
    })
  });
});

test('acknowledgement is cutoff-bound and accepts only safe persisted incident ids', async () => {
  const payload = { cutoff:'2026-08-13T11:00:00.000Z', incident_ids:[
    'reliability-incident:GITHUB_SCHEDULE_STALE',
    'reliability-incident:GITHUB_SCHEDULE_STALE'
  ] };
  const result = await acknowledgeReliabilityIncidents({
    accountId:'account', apiToken:'token', payload, fetcher:mockD1(({ sql, params }) => {
      assert.match(sql, /campaign='PENDING'/u);
      assert.match(sql, /occurred_at<=\?1/u);
      assert.deepEqual(params, [payload.cutoff, 'reliability-incident:GITHUB_SCHEDULE_STALE']);
    })
  });
  assert.equal(result.acknowledged, 1);
});

test('control writer rejects unsafe status, run IDs and incident IDs before D1', async () => {
  await assert.rejects(writeGithubScheduleHeartbeat({ status:'FAILED', runId:'1' }), /MONITOR_CONTROL_STATUS_INVALID/u);
  await assert.rejects(writeGithubScheduleHeartbeat({ status:'STARTED', runId:'abc' }), /MONITOR_CONTROL_RUN_ID_INVALID/u);
  await assert.rejects(acknowledgeReliabilityIncidents({ payload:{ cutoff:new Date().toISOString(), incident_ids:['unsafe'] } }),
    /MONITOR_CONTROL_ACK_ID_INVALID/u);
});
