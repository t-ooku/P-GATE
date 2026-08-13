import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMonthlyContinuity, evaluateSearchSli, evaluateSearchSlo, inspectProductionSearchSli, searchBackendFailureSql, searchMonthlySloSql, searchSliSql, searchSloSql } from '../scripts/check-production-search-sli.mjs';

function d1Fetch(row, sloRow = { finished: 10, degraded: 1 }, diagnosticRow = {}) {
  let calls = 0;
  return async (_url, init) => {
    assert.equal(init.headers.authorization, 'Bearer test-token');
    const body = JSON.parse(init.body);
    assert.match(body.sql, /traffic_class<>'QA'/u);
    assert.doesNotMatch(body.sql, /query_text|visitor_id|session_id/iu);
    assert.match(body.params[0], /^\d{4}-\d{2}-\d{2}T/u);
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
  assert.match(searchMonthlySloSql(), /search_backend_failed/u);
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
  assert.throws(
    () => evaluateSearchSli({ started: 1, completed: 0, hard_failed: 0, backend_failed: 1, degraded: 0 }),
    /SEARCH_SLI_BACKEND_FAILURES:1/u
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
