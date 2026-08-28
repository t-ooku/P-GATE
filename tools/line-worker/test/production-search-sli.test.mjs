import test from 'node:test';
import assert from 'node:assert/strict';
import { deepCanaryReservationSql, deepCanarySql, evaluateDeepCanary, evaluateMonthlyContinuity,
  evaluatePendingReliabilityIncidents, evaluateReliabilityHeartbeats, evaluateSearchProviderDegradation,
  evaluateSearchSli, evaluateSearchSlo,
  inspectProductionSearchSli, reliabilityHeartbeatSql, reliabilityPendingIncidentSql,
  searchBackendFailureSql, searchClientDegradationSql, searchMonthlySloSql, searchProviderDegradationSql,
  searchSliRequiresIncident, searchSliSql, searchSloSql } from '../scripts/check-production-search-sli.mjs';

function healthyCanaryRows(now = Date.now()) {
  const iso = new Date(now - 60000).toISOString();
  return ['query_structurer','ai_chat_primary','openai_backup','rakuten','yahoo']
    .map((component) => ({ event_id:`deep-canary:${now}:${component}`, component, status:'PASS', code:'CANARY_OK', occurred_at:iso }));
}

function healthyHeartbeatRows(now = Date.now()) {
  const occurred_at = new Date(now - 60000).toISOString();
  return ['cloudflare_regular', 'cloudflare_deep'].map((component) => ({
    event_id:`reliability-heartbeat:${component}`, component, status:'COMPLETED', run_id:String(now), occurred_at
  }));
}

function d1Fetch(row, sloRow = {
  finished: 10,
  degraded: 1,
  latest_degraded_at: '2026-08-20T00:00:00.000Z',
  latest_completed_at: '2026-08-20T00:01:00.000Z'
}, diagnosticRow = {}, providerRows = [], pendingRows = []) {
  return async (_url, init) => {
    assert.equal(init.headers.authorization, 'Bearer test-token');
    const body = JSON.parse(init.body);
    if (/event_type='(?:deep_canary_|reliability_)/u.test(body.sql)) assert.match(body.sql, /traffic_class='QA'/u);
    else assert.match(body.sql, /traffic_class<>'QA'/u);
    assert.doesNotMatch(body.sql, /query_text|visitor_id|session_id/iu);
    if (body.params.length) assert.match(body.params[0], /^\d{4}-\d{2}-\d{2}T/u);
    if (body.sql.includes("event_type='deep_canary_result'")) {
      return Response.json({ success: true, result: [{ success: true, results: healthyCanaryRows() }] });
    }
    if (body.sql.includes("event_type='deep_canary_budget'")) {
      return Response.json({ success: true, result: [{ success: true, results: [] }] });
    }
    if (body.sql.includes("event_type='reliability_heartbeat'")) {
      return Response.json({ success: true, result: [{ success: true, results: healthyHeartbeatRows() }] });
    }
    if (body.sql.includes("event_type='reliability_incident'")) {
      return Response.json({ success: true, result: [{ success: true, results: pendingRows }] });
    }
    if (body.sql.includes("event_type='search_provider_degraded'")) {
      return Response.json({ success: true, result: [{ success: true, results: providerRows }] });
    }
    if (body.sql.includes("event_type='search_client_degraded'")) {
      return Response.json({ success: true, result: [{ success: true, results: [] }] });
    }
    const result = body.sql.includes("WHERE traffic_class<>'QA' AND event_type='search_backend_failed'") ? diagnosticRow
      : body.sql.includes('AS unavailable') ? { finished: 10, unavailable: 0 }
        : body.sql.includes('WITH recent AS') ? row : sloRow;
    return Response.json({ success: true, result: [{ success: true, results: [result] }] });
  };
}

test('production SLI query only aggregates privacy-safe terminal event counts', () => {
  const sql = searchSliSql();
  assert.match(sql, /search_degraded/u);
  assert.match(sql, /search_dead_end/u);
  assert.doesNotMatch(sql, /search_failed/u);
  assert.match(sql, /occurred_at>=\?1/u);
  assert.doesNotMatch(sql, /unixepoch/u);
  assert.doesNotMatch(sql, /SELECT \*/u);
  assert.doesNotMatch(sql, /content/u);
});

test('provider degradation query selects only fixed anonymous operational fields', () => {
  const sql = searchProviderDegradationSql();
  assert.match(sql, /event_type='search_provider_degraded'/u);
  assert.match(sql, /source='worker'/u);
  assert.match(sql, /medium AS component/u);
  assert.match(sql, /content AS request_id/u);
  assert.doesNotMatch(sql, /query|prompt|history|response|visitor_id|session_id|authorization/iu);
});

test('client degradation query selects only safe operational dimensions', () => {
  const sql = searchClientDegradationSql();
  assert.match(sql, /event_type='search_client_degraded'/u);
  assert.match(sql, /source='browser'/u);
  assert.match(sql, /campaign AS code/u);
  assert.match(sql, /content AS request_id/u);
  assert.doesNotMatch(sql, /query|prompt|history|response|visitor_id|session_id|authorization/iu);
});

test('one all-provider fallback is an immediate real-request incident', () => {
  const row = {
    component:'ai_chat_all', provider:'ALL', code:'AI_ALL_PROVIDERS_FAILED',
    request_id:'e309d1ad-2a34-4f2f-913b-47fccdbbe240', occurred_at:new Date().toISOString()
  };
  assert.throws(
    () => evaluateSearchProviderDegradation([row]),
    /SEARCH_PROVIDER_ALL_FAILED:AI_CHAT_ALL:AI_ALL_PROVIDERS_FAILED:e309d1ad-2a34-4f2f-913b-47fccdbbe240/u
  );
});

test('primary transient needs two distinct request IDs within the same component', () => {
  const occurred_at = new Date().toISOString();
  const first = {
    component:'ai_chat_primary', provider:'GEMINI', code:'AI_PROVIDER_TIMEOUT',
    request_id:'e309d1ad-2a34-4f2f-913b-47fccdbbe241', occurred_at
  };
  const second = { ...first, request_id:'e309d1ad-2a34-4f2f-913b-47fccdbbe242' };
  assert.equal(evaluateSearchProviderDegradation([first]).ai_chat_primary_transient_requests, 1);
  assert.equal(evaluateSearchProviderDegradation([first, first]).ai_chat_primary_transient_requests, 1);
  assert.doesNotThrow(() => evaluateSearchProviderDegradation([
    first, { ...second, component:'query_structurer_primary' }
  ]));
  assert.throws(
    () => evaluateSearchProviderDegradation([first, second]),
    /SEARCH_PROVIDER_PRIMARY_REPEATED:AI_CHAT_PRIMARY:AI_PROVIDER_TIMEOUT:e309d1ad-2a34-4f2f-913b-47fccdbbe241:2/u
  );
});

test('one non-transient primary failure alerts and unknown codes fail closed', () => {
  const row = {
    component:'query_structurer_primary', provider:'GEMINI', code:'AI_PROVIDER_AUTH_FAILED',
    request_id:'e309d1ad-2a34-4f2f-913b-47fccdbbe243', occurred_at:new Date().toISOString()
  };
  assert.throws(
    () => evaluateSearchProviderDegradation([row]),
    /SEARCH_PROVIDER_PRIMARY_NON_TRANSIENT:QUERY_STRUCTURER_PRIMARY:AI_PROVIDER_AUTH_FAILED/u
  );
  assert.throws(
    () => evaluateSearchProviderDegradation([{ ...row, code:'RAW_UPPERCASE_PROVIDER_MESSAGE' }]),
    /SEARCH_PROVIDER_DEGRADATION_INVALID/u
  );
});

test('provider degradation flows through the existing SLI failure and Issue lifecycle', async () => {
  const providerRows = [{
    component:'ai_chat_all', provider:'ALL', code:'AI_ALL_PROVIDERS_FAILED',
    request_id:'e309d1ad-2a34-4f2f-913b-47fccdbbe244', occurred_at:new Date().toISOString()
  }];
  await assert.rejects(inspectProductionSearchSli({
    accountId:'account', apiToken:'test-token',
    fetcher:d1Fetch({ started:1, completed:1, hard_failed:0, backend_failed:0, degraded:0 },
      { finished:1, degraded:0 }, {}, providerRows)
  }), /SEARCH_PROVIDER_ALL_FAILED:AI_CHAT_ALL/u);
});

test('production SLO enforces a thirty-day 99.95 percent continuity budget', () => {
  assert.doesNotMatch(searchMonthlySloSql(), /search_backend_failed/u);
  assert.match(searchMonthlySloSql(), /event_type='search_dead_end'/u);
  assert.throws(
    () => evaluateMonthlyContinuity({ finished: 1000, unavailable: 1 }),
    /SEARCH_SLO_CONTINUITY:1\/1000:0\.0010/u
  );
});

test('production SLO checks a six-hour one-percent quality budget', () => {
  const sql = searchSloSql();
  assert.match(sql, /occurred_at>=\?1/u);
  assert.match(sql, /latest_degraded_at/u);
  assert.match(sql, /latest_completed_at/u);
  assert.doesNotMatch(sql, /query_text|visitor_id|session_id|content/iu);
  assert.throws(() => evaluateSearchSlo({ finished: 100, degraded: 2 }), /SEARCH_SLO_DEGRADED:2\/100:0\.020/u);
  assert.equal(evaluateSearchSlo({ finished: 99, degraded: 99 }).finished, 99);
});

test('quiet acute windows do not claim recovery while the last sampled searches remain degraded', async () => {
  const unverified = evaluateSearchSlo({
    finished: 6,
    degraded: 6,
    latest_degraded_at: '2026-08-20T07:00:00.000Z',
    latest_completed_at: null
  });
  assert.equal(unverified.status, 'DEGRADED');
  assert.equal(unverified.code, 'SEARCH_SLO_RECOVERY_UNVERIFIED:6/6:1.000');

  const result = await inspectProductionSearchSli({
    accountId: 'account', apiToken: 'test-token',
    fetcher: d1Fetch(
      { started: 0, completed: 0, hard_failed: 0, backend_failed: 0, degraded: 0 },
      {
        finished: 6,
        degraded: 6,
        latest_degraded_at: '2026-08-20T07:00:00.000Z',
        latest_completed_at: null
      }
    )
  });
  assert.equal(result.status, 'DEGRADED');
  assert.equal(result.code, 'SEARCH_SLO_RECOVERY_UNVERIFIED:6/6:1.000');
  assert.equal(searchSliRequiresIncident(result.status), true);
});

test('a healthy search after the last degradation is valid recovery evidence', () => {
  const recovered = evaluateSearchSlo({
    finished: 7,
    degraded: 6,
    latest_degraded_at: '2026-08-20T07:00:00.000Z',
    latest_completed_at: '2026-08-20T07:05:00.000Z'
  });
  assert.equal(recovered.status, 'PASS');
  assert.equal(recovered.recovery_verified, true);
});

test('deep canary SQL selects only fixed operational fields', () => {
  const sql = deepCanarySql();
  assert.match(sql, /traffic_class='QA'/u);
  assert.match(sql, /source='worker'/u);
  assert.doesNotMatch(sql, /query|prompt|history|response|authorization/iu);
});

test('deep canary reservation SQL selects only internal cost metadata', () => {
  const sql = deepCanaryReservationSql();
  assert.match(sql, /event_type='deep_canary_budget'/u);
  assert.match(sql, /campaign='RESERVED'/u);
  assert.doesNotMatch(sql, /query|prompt|history|response|authorization|visitor_id|session_id/iu);
});

test('control-plane queries select only fixed internal heartbeat and incident fields', () => {
  const heartbeat = reliabilityHeartbeatSql();
  const incidents = reliabilityPendingIncidentSql();
  assert.match(heartbeat, /cloudflare_regular/u);
  assert.match(heartbeat, /cloudflare_deep/u);
  assert.match(incidents, /campaign='PENDING'/u);
  for (const sql of [heartbeat, incidents]) {
    assert.doesNotMatch(sql, /query_text|visitor_id|session_id|prompt|history|response|authorization/iu);
  }
});

test('control-plane heartbeat detects stale and stuck Cloudflare cron independently', () => {
  const now = Date.now();
  assert.equal(evaluateReliabilityHeartbeats(healthyHeartbeatRows(now), { now }).cloudflare_deep.status, 'COMPLETED');
  const stale = healthyHeartbeatRows(now).map((row) => row.component === 'cloudflare_regular'
    ? { ...row, occurred_at:new Date(now-26*60000).toISOString() } : row);
  assert.throws(() => evaluateReliabilityHeartbeats(stale, { now }), /RELIABILITY_HEARTBEAT_STALE:CLOUDFLARE_REGULAR/u);
  const stuck = healthyHeartbeatRows(now).map((row) => row.component === 'cloudflare_deep'
    ? { ...row, status:'STARTED', occurred_at:new Date(now-21*60000).toISOString() } : row);
  assert.throws(() => evaluateReliabilityHeartbeats(stuck, { now }), /RELIABILITY_HEARTBEAT_STUCK:CLOUDFLARE_DEEP/u);
});

test('pending reliability incident stays actionable until GitHub records it', () => {
  const incident = { event_id:'reliability-incident:GITHUB_SCHEDULE_STALE', component:'github_schedule',
    code:'GITHUB_SCHEDULE_STALE', occurred_at:new Date().toISOString() };
  assert.throws(
    () => evaluatePendingReliabilityIncidents([incident]),
    error => error?.message === 'RELIABILITY_INCIDENT_PENDING:github_schedule:GITHUB_SCHEDULE_STALE'
      && error.pendingIncidents?.[0]?.event_id === incident.event_id
  );
  assert.deepEqual(evaluatePendingReliabilityIncidents([]), []);
});

test('every pending reliability code is recorded before the matching ids are acknowledged', () => {
  const rows = [
    {
      event_id: 'reliability-incident:GITHUB_SCHEDULE_HEARTBEAT_MISSING',
      component: 'github_schedule', code: 'GITHUB_SCHEDULE_HEARTBEAT_MISSING',
      occurred_at: '2026-08-13T11:00:00.000Z'
    },
    {
      event_id: 'reliability-incident:GITHUB_SCHEDULE_HEARTBEAT_STUCK',
      component: 'github_schedule', code: 'GITHUB_SCHEDULE_HEARTBEAT_STUCK',
      occurred_at: '2026-08-13T11:05:00.000Z'
    }
  ];
  assert.throws(() => evaluatePendingReliabilityIncidents(rows), (error) => {
    assert.match(error.message, /GITHUB_SCHEDULE_HEARTBEAT_MISSING/u);
    assert.match(error.message, /GITHUB_SCHEDULE_HEARTBEAT_STUCK/u);
    assert.deepEqual(error.pendingIncidents.map((item) => item.event_id), rows.map((item) => item.event_id));
    return true;
  });
});

test('persisted control incident does not suppress current SLI evidence', async () => {
  const pending = {
    event_id:'reliability-incident:GITHUB_SCHEDULE_HEARTBEAT_STALE',
    component:'github_schedule', code:'GITHUB_SCHEDULE_HEARTBEAT_STALE',
    occurred_at:'2026-08-13T11:00:00.000Z'
  };
  const result = await inspectProductionSearchSli({
    accountId:'account', apiToken:'test-token',
    fetcher:d1Fetch(
      { started:2, completed:2, hard_failed:0, backend_failed:0, degraded:0 },
      { finished:2, degraded:0, latest_degraded_at:null,
        latest_completed_at:'2026-08-28T11:00:00.000Z' },
      {}, [], [pending]
    )
  });
  assert.equal(result.code, 'SEARCH_SLI_OK');
  assert.equal(result.started, 2);
  assert.equal(result.completed, 2);
  assert.equal(result.pending_control.code,
    'RELIABILITY_INCIDENT_PENDING:github_schedule:GITHUB_SCHEDULE_HEARTBEAT_STALE');
  assert.deepEqual(result.pending_control.incidents, [pending]);
});

test('current SLI failure preserves pending control incident ids for acknowledgement', async () => {
  const pending = {
    event_id:'reliability-incident:GITHUB_SCHEDULE_HEARTBEAT_STALE',
    component:'github_schedule', code:'GITHUB_SCHEDULE_HEARTBEAT_STALE',
    occurred_at:'2026-08-13T11:00:00.000Z'
  };
  await assert.rejects(inspectProductionSearchSli({
    accountId:'account', apiToken:'test-token',
    fetcher:d1Fetch(
      { started:1, completed:0, hard_failed:1, backend_failed:0, degraded:0 },
      undefined, {}, [], [pending]
    )
  }), (error) => {
    assert.match(error.message, /SEARCH_SLI_HARD_FAILURES:1/u);
    assert.match(error.message,
      /RELIABILITY_INCIDENT_PENDING:github_schedule:GITHUB_SCHEDULE_HEARTBEAT_STALE/u);
    assert.deepEqual(error.pendingIncidents, [pending]);
    return true;
  });
});

test('deep canary accepts fresh passing components', () => {
  const now = Date.now();
  const result = evaluateDeepCanary(healthyCanaryRows(now), { now });
  assert.equal(result.rakuten.status, 'PASS');
});

test('deep canary requires two distinct transient AI chat failures and resets on pass', () => {
  const now = Date.now();
  const base = healthyCanaryRows(now).filter((row) => row.component !== 'ai_chat_primary');
  const failed = [0, 15].map((minutes, index) => ({
    event_id:`deep-canary:${now-index}:ai_chat_primary`, component:'ai_chat_primary', status:'FAIL',
    code:'CANARY_PROVIDER_TIMEOUT', occurred_at:new Date(now-minutes*60000).toISOString()
  }));
  assert.doesNotThrow(() => evaluateDeepCanary([...base, failed[0]], { now }));
  assert.throws(
    () => evaluateDeepCanary([...base, ...failed], { now }),
    /DEEP_CANARY_AI_CHAT_CONSECUTIVE:AI_CHAT_PRIMARY:CANARY_PROVIDER_TIMEOUT/u
  );
  assert.doesNotThrow(() => evaluateDeepCanary([
    ...base, { ...failed[0], status:'PASS', code:'CANARY_OK' }, failed[1]
  ], { now }));
});

test('deep canary waits for confirmation on a transient invalid primary response', () => {
  const now = Date.now();
  const rows = healthyCanaryRows(now).map((row) => row.component === 'ai_chat_primary'
    ? { ...row, status:'FAIL', code:'CANARY_PROVIDER_INVALID_JSON' } : row);
  assert.doesNotThrow(() => evaluateDeepCanary(rows, { now }));
});

test('deep canary immediately alerts on one non-transient AI chat failure', () => {
  const now = Date.now();
  const rows = healthyCanaryRows(now).map((row) => row.component === 'ai_chat_primary'
    ? { ...row, status:'FAIL', code:'GEMINI_CHAT_INTENT_FAILED' } : row);
  assert.throws(() => evaluateDeepCanary(rows, { now }),
    /DEEP_CANARY_NON_TRANSIENT_IMMEDIATE:AI_CHAT_PRIMARY:GEMINI_CHAT_INTENT_FAILED/u);
});

test('deep canary confirms transient query structurer failures before alerting', () => {
  const now = Date.now();
  const latest = healthyCanaryRows(now).map((row) => row.component === 'query_structurer'
    ? { ...row, status:'FAIL', code:'GEMINI_CHAT_INTENT_FAILED' } : row);
  assert.throws(() => evaluateDeepCanary(latest, { now }),
    /DEEP_CANARY_NON_TRANSIENT_IMMEDIATE:QUERY_STRUCTURER:GEMINI_CHAT_INTENT_FAILED/u);

  const transient = healthyCanaryRows(now).map((row) => row.component === 'query_structurer'
    ? { ...row, status:'FAIL', code:'CANARY_PROVIDER_TIMEOUT' } : row);
  assert.doesNotThrow(() => evaluateDeepCanary(transient, { now }));
  transient.push({
    component:'query_structurer', status:'FAIL', code:'CANARY_PROVIDER_TIMEOUT',
    occurred_at:new Date(now - 15 * 60000).toISOString(),
    event_id:`deep-canary:${now - 15 * 60000}:query_structurer`
  });
  assert.throws(() => evaluateDeepCanary(transient, { now }),
    /DEEP_CANARY_QUERY_STRUCTURER_CONSECUTIVE:QUERY_STRUCTURER:CANARY_PROVIDER_TIMEOUT/u);
});

test('optional OpenAI control failures are degraded rather than search failures', () => {
  const now = Date.now();
  const codes = [
    'OPENAI_NOT_CONFIGURED',
    'OPENAI_AUTH_FAILED',
    'CANARY_MODEL_PRICING_UNKNOWN',
    'CANARY_PRICING_REVIEW_REQUIRED',
    'CANARY_MONTHLY_BUDGET_LIMIT',
    'CANARY_USAGE_MISSING',
    'CANARY_COST_EXCEEDS_RESERVATION',
    'CANARY_BILLING_TIME_INVALID',
    'CANARY_PROMPT_TOO_LARGE'
  ];
  for (const code of codes) {
    const rows = healthyCanaryRows(now).map((row) => row.component === 'openai_backup'
      ? { ...row, status:'FAIL', code } : row);
    assert.equal(evaluateDeepCanary(rows, { now }).openai_backup.status, 'DEGRADED');
  }
});

test('optional OpenAI request rejection is degraded rather than a search failure', () => {
  const now = Date.now();
  const rows = healthyCanaryRows(now).map((row) => row.component === 'openai_backup'
    ? { ...row, status:'FAIL', code:'CANARY_PROVIDER_REQUEST_REJECTED' } : row);
  assert.equal(evaluateDeepCanary(rows, { now }).openai_backup.status, 'DEGRADED');
});

test('optional OpenAI transient failures remain degraded across repeated runs', () => {
  const now = Date.now();
  const base = healthyCanaryRows(now).filter((row) => row.component !== 'openai_backup');
  const failed = [0, 360].map((minutes, index) => ({
    event_id:`deep-canary:${now-index}:openai_backup`, component:'openai_backup', status:'FAIL',
    code:'OPENAI_CHAT_INTENT_FAILED', occurred_at:new Date(now-minutes*60000).toISOString()
  }));
  assert.doesNotThrow(() => evaluateDeepCanary([...base, failed[0]], { now }));
  assert.equal(evaluateDeepCanary([...base, ...failed], { now }).openai_backup.status, 'DEGRADED');
});

test('deep canary requires two distinct failed marketplace runs and resets on pass', () => {
  const now = Date.now();
  const base = healthyCanaryRows(now).filter((row) => row.component !== 'rakuten');
  const failed = [0, 15].map((minutes, index) => ({
    event_id:`deep-canary:${now-index}:rakuten`, component:'rakuten', status:'FAIL',
    code:'RAKUTEN_MARKETPLACE_SEARCH_FAILED', occurred_at:new Date(now-minutes*60000).toISOString()
  }));
  assert.throws(() => evaluateDeepCanary([...base, ...failed], { now }), /DEEP_CANARY_CONSECUTIVE_FAILURE:RAKUTEN/u);
  assert.doesNotThrow(() => evaluateDeepCanary([...base, { ...failed[0], status:'PASS', code:'CANARY_OK' }, failed[1]], { now }));
});

test('deep canary detects missed 15m marketplaces, 1h Gemini, and 6h backup runs', () => {
  const now = Date.now();
  const windows = { rakuten:20, yahoo:20, ai_chat_primary:70, query_structurer:70, openai_backup:390 };
  for (const [component, minutes] of Object.entries(windows)) {
    const atBoundary = healthyCanaryRows(now).map((row) => row.component === component
      ? { ...row, occurred_at:new Date(now-minutes*60000).toISOString() } : row);
    assert.doesNotThrow(() => evaluateDeepCanary(atBoundary, { now }));
    const stale = atBoundary.map((row) => row.component === component
      ? { ...row, occurred_at:new Date(now-(minutes+1)*60000).toISOString() } : row);
    if (component === 'openai_backup') {
      assert.equal(evaluateDeepCanary(stale, { now }).openai_backup.status, 'DEGRADED');
    } else {
      assert.throws(() => evaluateDeepCanary(stale, { now }), new RegExp(`DEEP_CANARY_STALE:${component.toUpperCase()}`, 'u'));
    }
  }
});

test('deep canary alerts when a paid reservation has no terminal result after two minutes', () => {
  const now = Date.now();
  const reservation = {
    event_id:`deep-canary-budget:${now}:query_structurer`, component:'query_structurer', status:'RESERVED',
    reserved_micro_usd:'0100000', maximum_micro_usd:'0100000',
    occurred_at:new Date(now-3*60000).toISOString()
  };
  assert.throws(
    () => evaluateDeepCanary(healthyCanaryRows(now).filter((row) => row.component !== 'query_structurer'), {
      now, reservationRows:[reservation]
    }),
    /DEEP_CANARY_RESERVATION_STUCK:QUERY_STRUCTURER/u
  );
  const withTerminal = healthyCanaryRows(now).map((row) => row.component === 'query_structurer'
    ? { ...row, event_id:`deep-canary:${now}:query_structurer` } : row);
  assert.doesNotThrow(() => evaluateDeepCanary(withTerminal, { now, reservationRows:[reservation] }));

  const interruptedRun = now-10*60000;
  const recoveredLater = healthyCanaryRows(now).map((row) => row.component === 'query_structurer'
    ? { ...row, event_id:`deep-canary:${now-1000}:query_structurer`,
      occurred_at:new Date(now-1000).toISOString() } : row);
  assert.doesNotThrow(() => evaluateDeepCanary(recoveredLater, { now, reservationRows:[{
    ...reservation,
    event_id:`deep-canary-budget:${interruptedRun}:query_structurer`,
    occurred_at:new Date(interruptedRun).toISOString()
  }] }));
});

test('deep canary rejects a reservation amount that does not match its component', () => {
  const now = Date.now();
  assert.throws(() => evaluateDeepCanary(healthyCanaryRows(now), { now, reservationRows:[{
    event_id:`deep-canary-budget:${now}:query_structurer`, component:'query_structurer', status:'RESERVED',
    reserved_micro_usd:'0000001', maximum_micro_usd:'0000001', occurred_at:new Date(now-1000).toISOString()
  }] }), /DEEP_CANARY_RESERVATION_INVALID:QUERY_STRUCTURER/u);
});

test('deep canary missing-row bootstrap has a fixed UTC deadline', () => {
  const beforeDeadline = Date.parse('2026-08-13T10:29:59.999Z');
  const pending = evaluateDeepCanary([], { now:beforeDeadline });
  assert.equal(pending.query_structurer.status, 'PENDING');
  assert.equal(pending.openai_backup.code, 'CANARY_BOOTSTRAP_PENDING');
  assert.throws(
    () => evaluateDeepCanary([], { now:Date.parse('2026-08-13T10:30:00.000Z') }),
    /DEEP_CANARY_STALE:QUERY_STRUCTURER/u
  );
});

test('production SLI accepts a quiet window without pretending traffic exists', () => {
  const result = evaluateSearchSli({ started: 0, completed: 0, hard_failed: 0, degraded: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.finished, 0);
  assert.equal(result.degraded_rate, 0);
});

test('production SLI accepts healthy and low-sample degraded searches', async () => {
  const result = await inspectProductionSearchSli({
    accountId: 'account', apiToken: 'test-token', fetcher: d1Fetch({
      started: 10, completed: 9, hard_failed: 0, backend_failed: 0, degraded: 1
    })
  });
  assert.equal(result.ok, true);
  assert.equal(result.finished, 10);
  assert.equal(result.degraded_rate, 0.1);
});

test('production SLI fails on one real dead-end event', () => {
  assert.throws(
    () => evaluateSearchSli({ started: 1, completed: 0, hard_failed: 1, degraded: 0 }),
    /SEARCH_SLI_HARD_FAILURES:1/u
  );
});

test('production SLI fails on one server-authenticated backend failure', () => {
  assert.match(searchBackendFailureSql(), /event_type='search_backend_failed'/u);
  assert.match(searchBackendFailureSql(), /medium AS component/u);
  assert.throws(
    () => evaluateSearchSli({ started: 1, completed: 0, hard_failed: 0, backend_failed: 1, degraded: 0 }),
    /SEARCH_SLI_BACKEND_FAILURES:1/u
  );
});

test('production SLI reports the safe AI chat stage, code and request ID', async () => {
  await assert.rejects(
    inspectProductionSearchSli({
      accountId: 'account', apiToken: 'test-token',
      fetcher: d1Fetch(
        { started: 1, completed: 0, hard_failed: 0, backend_failed: 1, degraded: 0 },
        { finished: 1, degraded: 0 },
        { component: 'ai_chat', code: 'AI_CHAT_INTERNAL_ERROR', request_id: 'e309d1ad-2a34-4f2f-913b-47fccdbbe24d' }
      )
    }),
    /SEARCH_SLI_BACKEND_FAILURES:1:ai_chat:AI_CHAT_INTERNAL_ERROR:e309d1ad-2a34-4f2f-913b-47fccdbbe24d/u
  );
});

test('検索継続できたdegradedは全面障害にせず警告として返す', () => {
  const result = evaluateSearchSli({ started: 10, completed: 7, hard_failed: 0, degraded: 3 });
  assert.equal(result.status, 'DEGRADED');
  assert.equal(result.code, 'SEARCH_SLI_DEGRADED:3/10:0.300');
  assert.equal(searchSliRequiresIncident(result.status), true);
  assert.equal(searchSliRequiresIncident('PASS'), false);
});

test('production SLI fails closed when the D1 aggregate cannot be read', async () => {
  await assert.rejects(
    inspectProductionSearchSli({
      accountId: 'account', apiToken: 'test-token',
      fetcher: async () => new Response('unavailable', { status: 503 })
    }),
    /SEARCH_SLI_D1_HTTP_503/u
  );
});
