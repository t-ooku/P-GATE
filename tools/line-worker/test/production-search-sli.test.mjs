import test from 'node:test';
import assert from 'node:assert/strict';
import { deepCanaryReservationSql, deepCanarySql, evaluateDeepCanary, evaluateMonthlyContinuity, evaluateSearchSli, evaluateSearchSlo, inspectProductionSearchSli, searchBackendFailureSql, searchMonthlySloSql, searchSliSql, searchSloSql } from '../scripts/check-production-search-sli.mjs';

function healthyCanaryRows(now = Date.now()) {
  const iso = new Date(now - 60000).toISOString();
  return ['query_structurer','ai_chat_primary','openai_backup','rakuten','yahoo']
    .map((component) => ({ event_id:`deep-canary:${now}:${component}`, component, status:'PASS', code:'CANARY_OK', occurred_at:iso }));
}

function d1Fetch(row, sloRow = { finished: 10, degraded: 1 }, diagnosticRow = {}) {
  let calls = 0;
  return async (_url, init) => {
    assert.equal(init.headers.authorization, 'Bearer test-token');
    const body = JSON.parse(init.body);
    if (body.sql.includes("event_type='deep_canary_")) assert.match(body.sql, /traffic_class='QA'/u);
    else assert.match(body.sql, /traffic_class<>'QA'/u);
    assert.doesNotMatch(body.sql, /query_text|visitor_id|session_id/iu);
    assert.match(body.params[0], /^\d{4}-\d{2}-\d{2}T/u);
    if (body.sql.includes("event_type='deep_canary_result'")) {
      return Response.json({ success: true, result: [{ success: true, results: healthyCanaryRows() }] });
    }
    if (body.sql.includes("event_type='deep_canary_budget'")) {
      return Response.json({ success: true, result: [{ success: true, results: [] }] });
    }
    calls += 1;
    const monthlyCall = Number(row.backend_failed) > 0 ? 4 : 3;
    const result = calls === 1 ? row
      : Number(row.backend_failed) > 0 && calls === 2 ? diagnosticRow
        : calls === monthlyCall ? { finished: 10, unavailable: 0 } : sloRow;
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
  assert.throws(() => evaluateSearchSlo({ finished: 100, degraded: 2 }), /SEARCH_SLO_DEGRADED:2\/100:0\.020/u);
  assert.equal(evaluateSearchSlo({ finished: 99, degraded: 99 }).finished, 99);
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

test('deep canary accepts fresh passing components', () => {
  const now = Date.now();
  const result = evaluateDeepCanary(healthyCanaryRows(now), { now });
  assert.equal(result.rakuten.status, 'PASS');
});

test('deep canary alerts on one AI chat failure', () => {
  const now = Date.now();
  const rows = healthyCanaryRows(now).map((row) => row.component === 'ai_chat_primary'
    ? { ...row, status:'FAIL', code:'GEMINI_CHAT_INTENT_FAILED' } : row);
  assert.throws(() => evaluateDeepCanary(rows, { now }), /DEEP_CANARY_AI_CHAT_IMMEDIATE:GEMINI_CHAT_INTENT_FAILED/u);
});

test('deep canary alerts on one query structurer failure', () => {
  const now = Date.now();
  const rows = healthyCanaryRows(now).map((row) => row.component === 'query_structurer'
    ? { ...row, status:'FAIL', code:'GEMINI_CHAT_INTENT_FAILED' } : row);
  assert.throws(() => evaluateDeepCanary(rows, { now }), /DEEP_CANARY_QUERY_STRUCTURER_IMMEDIATE:GEMINI_CHAT_INTENT_FAILED/u);
});

test('deep canary immediately alerts on non-transient control failures', () => {
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
    assert.throws(
      () => evaluateDeepCanary(rows, { now }),
      new RegExp(`DEEP_CANARY_NON_TRANSIENT_IMMEDIATE:OPENAI_BACKUP:${code}`, 'u')
    );
  }
});

test('deep canary keeps transient OpenAI backup failures on a distinct two-run warning', () => {
  const now = Date.now();
  const base = healthyCanaryRows(now).filter((row) => row.component !== 'openai_backup');
  const failed = [0, 360].map((minutes, index) => ({
    event_id:`deep-canary:${now-index}:openai_backup`, component:'openai_backup', status:'FAIL',
    code:'OPENAI_CHAT_INTENT_FAILED', occurred_at:new Date(now-minutes*60000).toISOString()
  }));
  assert.doesNotThrow(() => evaluateDeepCanary([...base, failed[0]], { now }));
  assert.throws(
    () => evaluateDeepCanary([...base, ...failed], { now }),
    /DEEP_CANARY_OPENAI_BACKUP_WARNING:OPENAI_BACKUP:OPENAI_CHAT_INTENT_FAILED/u
  );
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

test('deep canary detects a missed 15m/1h/6h run within 20/70/390 minutes', () => {
  const now = Date.now();
  const windows = { rakuten:20, yahoo:20, query_structurer:70, ai_chat_primary:70, openai_backup:390 };
  for (const [component, minutes] of Object.entries(windows)) {
    const atBoundary = healthyCanaryRows(now).map((row) => row.component === component
      ? { ...row, occurred_at:new Date(now-minutes*60000).toISOString() } : row);
    assert.doesNotThrow(() => evaluateDeepCanary(atBoundary, { now }));
    const stale = atBoundary.map((row) => row.component === component
      ? { ...row, occurred_at:new Date(now-(minutes+1)*60000).toISOString() } : row);
    assert.throws(() => evaluateDeepCanary(stale, { now }), new RegExp(`DEEP_CANARY_STALE:${component.toUpperCase()}`, 'u'));
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

test('production SLI fails when repeated degradation crosses the rate threshold', () => {
  assert.throws(
    () => evaluateSearchSli({ started: 10, completed: 7, hard_failed: 0, degraded: 3 }),
    /SEARCH_SLI_DEGRADED:3\/10:0\.300/u
  );
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
