import { pathToFileURL } from 'node:url';

const DEFAULT_DATABASE_ID = '17629324-b771-4348-982c-c25da48c29b2';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.trunc(parsed))) : fallback;
}

function boundedRate(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}

export function searchSliSql() {
  return `WITH recent AS (
    SELECT event_type
    FROM growth_events
    WHERE traffic_class<>'QA'
      AND event_type IN ('search_started','search_completed','search_dead_end','search_backend_failed','search_degraded')
      AND occurred_at>=?1
  ) SELECT
    COALESCE(SUM(CASE WHEN event_type='search_started' THEN 1 ELSE 0 END),0) AS started,
    COALESCE(SUM(CASE WHEN event_type='search_completed' THEN 1 ELSE 0 END),0) AS completed,
    COALESCE(SUM(CASE WHEN event_type='search_dead_end' THEN 1 ELSE 0 END),0) AS hard_failed,
    COALESCE(SUM(CASE WHEN event_type='search_backend_failed' THEN 1 ELSE 0 END),0) AS backend_failed,
    COALESCE(SUM(CASE WHEN event_type='search_degraded' THEN 1 ELSE 0 END),0) AS degraded
  FROM recent`;
}

export function searchBackendFailureSql() {
  return `SELECT medium AS component,campaign AS code,content AS request_id
  FROM growth_events
  WHERE traffic_class<>'QA' AND event_type='search_backend_failed' AND occurred_at>=?1
  ORDER BY occurred_at DESC LIMIT 1`;
}

export function searchSloSql() {
  return `SELECT
    COALESCE(SUM(CASE WHEN event_type IN ('search_completed','search_dead_end','search_degraded') THEN 1 ELSE 0 END),0) AS finished,
    COALESCE(SUM(CASE WHEN event_type='search_degraded' THEN 1 ELSE 0 END),0) AS degraded
  FROM growth_events
  WHERE traffic_class<>'QA'
    AND event_type IN ('search_completed','search_dead_end','search_degraded')
    AND occurred_at>=?1`;
}

export function searchMonthlySloSql() {
  return `SELECT
    COALESCE(SUM(CASE WHEN event_type IN ('search_completed','search_dead_end','search_degraded') THEN 1 ELSE 0 END),0) AS finished,
    COALESCE(SUM(CASE WHEN event_type='search_dead_end' THEN 1 ELSE 0 END),0) AS unavailable
  FROM growth_events
  WHERE traffic_class<>'QA'
    AND event_type IN ('search_completed','search_dead_end','search_degraded')
    AND occurred_at>=?1`;
}

export function evaluateSearchSli(row = {}, {
  windowMinutes = 15,
  maxHardFailures = 0,
  maxBackendFailures = 0,
  degradedMinimum = 3,
  degradedRateLimit = 0.2
} = {}) {
  const counts = Object.fromEntries(['started', 'completed', 'hard_failed', 'backend_failed', 'degraded']
    .map((name) => [name, Math.max(0, Number(row?.[name]) || 0)]));
  const finished = counts.completed + counts.hard_failed + counts.degraded;
  const degradedRate = finished > 0 ? counts.degraded / finished : 0;
  const hardLimit = boundedInteger(maxHardFailures, 0, 0, 1000);
  const backendLimit = boundedInteger(maxBackendFailures, 0, 0, 1000);
  const degradedFloor = boundedInteger(degradedMinimum, 3, 1, 1000);
  const degradedLimit = boundedRate(degradedRateLimit, 0.2);
  assert(counts.hard_failed <= hardLimit, `SEARCH_SLI_HARD_FAILURES:${counts.hard_failed}`);
  assert(counts.backend_failed <= backendLimit, `SEARCH_SLI_BACKEND_FAILURES:${counts.backend_failed}`);
  assert(!(counts.degraded >= degradedFloor && degradedRate >= degradedLimit),
    `SEARCH_SLI_DEGRADED:${counts.degraded}/${finished}:${degradedRate.toFixed(3)}`);
  return {
    ok: true,
    checked_at: new Date().toISOString(),
    window_minutes: boundedInteger(windowMinutes, 15, 5, 60),
    ...counts,
    finished,
    degraded_rate: Number(degradedRate.toFixed(4))
  };
}

export function evaluateSearchSlo(row = {}, { minimumFinished = 100, degradedRateLimit = 0.01 } = {}) {
  const finished = Math.max(0, Number(row?.finished) || 0);
  const degraded = Math.max(0, Number(row?.degraded) || 0);
  const minimum = boundedInteger(minimumFinished, 100, 1, 1000000);
  const limit = boundedRate(degradedRateLimit, 0.01);
  const degradedRate = finished > 0 ? degraded / finished : 0;
  assert(!(finished >= minimum && degradedRate > limit),
    `SEARCH_SLO_DEGRADED:${degraded}/${finished}:${degradedRate.toFixed(3)}`);
  return { finished, degraded, degraded_rate: Number(degradedRate.toFixed(4)), minimum_finished: minimum };
}

export function evaluateMonthlyContinuity(row = {}, { minimumFinished = 1000, unavailableRateLimit = 0.0005 } = {}) {
  const finished = Math.max(0, Number(row?.finished) || 0);
  const unavailable = Math.max(0, Number(row?.unavailable) || 0);
  const minimum = boundedInteger(minimumFinished, 1000, 1, 10000000);
  const limit = boundedRate(unavailableRateLimit, 0.0005);
  const unavailableRate = finished > 0 ? unavailable / finished : 0;
  assert(!(finished >= minimum && unavailableRate > limit),
    `SEARCH_SLO_CONTINUITY:${unavailable}/${finished}:${unavailableRate.toFixed(4)}`);
  return { finished, unavailable, unavailable_rate: Number(unavailableRate.toFixed(6)), minimum_finished: minimum };
}

async function queryD1(fetcher, endpoint, apiToken, sql, params = []) {
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiToken}`,
      'content-type': 'application/json',
      'user-agent': 'HOSHILU-Production-Monitor/1.0'
    },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(10000)
  });
  assert(response?.ok, `SEARCH_SLI_D1_HTTP_${Number(response?.status) || 0}`);
  const payload = await response.json();
  const query = Array.isArray(payload?.result) ? payload.result[0] : null;
  assert(payload?.success === true && query?.success !== false, 'SEARCH_SLI_D1_QUERY_FAILED');
  const row = Array.isArray(query?.results) ? query.results[0] : null;
  assert(row && typeof row === 'object', 'SEARCH_SLI_D1_RESULT_MISSING');
  return row;
}

export async function inspectProductionSearchSli({
  accountId,
  apiToken,
  databaseId = DEFAULT_DATABASE_ID,
  fetcher = fetch,
  windowMinutes = 15,
  maxHardFailures = 0,
  maxBackendFailures = 0,
  degradedMinimum = 3,
  degradedRateLimit = 0.2,
  sloWindowMinutes = 360,
  sloMinimumFinished = 100,
  sloDegradedRateLimit = 0.01,
  monthlyMinimumFinished = 1000,
  monthlyUnavailableRateLimit = 0.0005
} = {}) {
  assert(String(accountId || '').trim(), 'CLOUDFLARE_ACCOUNT_ID_MISSING');
  assert(String(apiToken || '').trim(), 'CLOUDFLARE_API_TOKEN_MISSING');
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;
  const now = Date.now();
  const acuteMinutes = boundedInteger(windowMinutes, 15, 5, 60);
  const sloMinutes = boundedInteger(sloWindowMinutes, 360, 60, 1440);
  const acuteCutoff = new Date(now - acuteMinutes * 60000).toISOString();
  // The aggregate query remains count-only. Fetch the latest diagnostic only
  // when a server-created failure exists; public /api/events cannot create it.
  const acuteRow = await queryD1(fetcher, endpoint, apiToken, searchSliSql(), [acuteCutoff]);
  let backendDiagnostic = null;
  if (Number(acuteRow.backend_failed) > 0) {
    const row = await queryD1(fetcher, endpoint, apiToken, searchBackendFailureSql(), [acuteCutoff]);
    const code = /^[A-Z][A-Z0-9_]{2,79}$/u.test(String(row.code || '')) ? String(row.code) : 'UNKNOWN';
    const requestId = /^[a-f0-9-]{20,64}$/iu.test(String(row.request_id || '')) ? String(row.request_id) : 'UNKNOWN';
    const component = ['ai_chat', 'knowledge'].includes(String(row.component || '')) ? String(row.component) : 'unknown';
    backendDiagnostic = { component, code, request_id: requestId };
  }
  let acute;
  try {
    acute = evaluateSearchSli(acuteRow, { windowMinutes, maxHardFailures, maxBackendFailures, degradedMinimum, degradedRateLimit });
  } catch (error) {
    if (backendDiagnostic) {
      error.message = `${error.message}:${backendDiagnostic.component}:${backendDiagnostic.code}:${backendDiagnostic.request_id}`;
    }
    throw error;
  }
  const sloRow = await queryD1(fetcher, endpoint, apiToken, searchSloSql(), [new Date(now - sloMinutes * 60000).toISOString()]);
  const slo = evaluateSearchSlo(sloRow, { minimumFinished: sloMinimumFinished, degradedRateLimit: sloDegradedRateLimit });
  const monthlyRow = await queryD1(fetcher, endpoint, apiToken, searchMonthlySloSql(), [new Date(now - 30 * 86400000).toISOString()]);
  const monthly = evaluateMonthlyContinuity(monthlyRow, {
    minimumFinished: monthlyMinimumFinished, unavailableRateLimit: monthlyUnavailableRateLimit
  });
  return { ...acute, slo_window_minutes: sloMinutes, slo, monthly };
}

export async function runProductionSearchSli(options = {}) {
  const attempts = boundedInteger(options.attempts, 3, 1, 5);
  const retryMs = boundedInteger(options.retryMs, 5000, 100, 30000);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await inspectProductionSearchSli(options);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
  }
  throw lastError;
}

function cliOptions(argv) {
  const value = (name, fallback) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : fallback;
  };
  return {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    databaseId: process.env.HOSHILU_D1_DATABASE_ID || DEFAULT_DATABASE_ID,
    windowMinutes: Number(value('--window-minutes', process.env.HOSHILU_SLI_WINDOW_MINUTES || 15)),
    maxHardFailures: Number(value('--max-hard-failures', process.env.HOSHILU_SLI_MAX_HARD_FAILURES || 0)),
    maxBackendFailures: Number(value('--max-backend-failures', process.env.HOSHILU_SLI_MAX_BACKEND_FAILURES || 0)),
    degradedMinimum: Number(value('--degraded-minimum', process.env.HOSHILU_SLI_DEGRADED_MINIMUM || 3)),
    degradedRateLimit: Number(value('--degraded-rate-limit', process.env.HOSHILU_SLI_DEGRADED_RATE_LIMIT || 0.2)),
    sloWindowMinutes: Number(value('--slo-window-minutes', process.env.HOSHILU_SLO_WINDOW_MINUTES || 360)),
    sloMinimumFinished: Number(value('--slo-minimum-finished', process.env.HOSHILU_SLO_MINIMUM_FINISHED || 100)),
    sloDegradedRateLimit: Number(value('--slo-degraded-rate-limit', process.env.HOSHILU_SLO_DEGRADED_RATE_LIMIT || 0.01)),
    monthlyMinimumFinished: Number(value('--monthly-minimum-finished', process.env.HOSHILU_MONTHLY_MINIMUM_FINISHED || 1000)),
    monthlyUnavailableRateLimit: Number(value('--monthly-unavailable-rate-limit', process.env.HOSHILU_MONTHLY_UNAVAILABLE_RATE_LIMIT || 0.0005)),
    attempts: Number(value('--attempts', process.env.HOSHILU_MONITOR_ATTEMPTS || 3)),
    retryMs: Number(value('--retry-ms', process.env.HOSHILU_MONITOR_RETRY_MS || 5000))
  };
}

async function main() {
  try {
    const result = await runProductionSearchSli(cliOptions(process.argv.slice(2)));
    const summary = [
      '## HOSHILU real-user search SLI: PASS', '',
      `Checked: ${result.checked_at}`,
      `Window: ${result.window_minutes} minutes`,
      `- started: ${result.started}`,
      `- completed: ${result.completed}`,
      `- degraded: ${result.degraded}`,
      `- hard failed: ${result.hard_failed}`,
      `- backend failed: ${result.backend_failed}`,
      `- degraded rate: ${(result.degraded_rate * 100).toFixed(1)}%`, ''
      ,`Six-hour quality window: ${result.slo.finished} finished / ${result.slo.degraded} degraded (${(result.slo.degraded_rate * 100).toFixed(1)}%)`, ''
      ,`Thirty-day continuity: ${result.monthly.finished} finished / ${result.monthly.unavailable} unavailable (${(result.monthly.unavailable_rate * 100).toFixed(3)}%)`, ''
    ].join('\n');
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY) await import('node:fs/promises').then(({ appendFile }) => appendFile(process.env.GITHUB_STEP_SUMMARY, summary));
  } catch (error) {
    const message = String(error?.message || error).slice(0, 240);
    const summary = `## HOSHILU real-user search SLI: FAIL\n\n- ${message}\n`;
    console.error(summary);
    if (process.env.GITHUB_STEP_SUMMARY) await import('node:fs/promises').then(({ appendFile }) => appendFile(process.env.GITHUB_STEP_SUMMARY, summary));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
