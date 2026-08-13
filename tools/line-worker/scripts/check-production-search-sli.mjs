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

export function searchProviderDegradationSql() {
  return `SELECT medium AS component,marketplace AS provider,campaign AS code,
    content AS request_id,occurred_at
  FROM growth_events
  WHERE traffic_class<>'QA' AND source='worker'
    AND event_type='search_provider_degraded' AND occurred_at>=?1
  ORDER BY occurred_at DESC LIMIT 128`;
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

export function deepCanarySql() {
  return `SELECT event_id,medium AS component,campaign AS status,content AS code,occurred_at
  FROM growth_events
  WHERE event_type='deep_canary_result' AND traffic_class='QA' AND source='worker'
    AND occurred_at>=?1
  ORDER BY occurred_at DESC LIMIT 160`;
}

export function deepCanaryReservationSql() {
  return `SELECT event_id,medium AS component,campaign AS status,content AS reserved_micro_usd,
    marketplace AS maximum_micro_usd,occurred_at
  FROM growth_events
  WHERE event_type='deep_canary_budget' AND traffic_class='QA' AND source='worker'
    AND campaign='RESERVED' AND occurred_at>=?1
  ORDER BY occurred_at DESC LIMIT 160`;
}

export function reliabilityHeartbeatSql() {
  return `SELECT event_id,medium AS component,campaign AS status,content AS run_id,occurred_at
  FROM growth_events
  WHERE event_type='reliability_heartbeat' AND traffic_class='QA'
    AND medium IN ('cloudflare_regular','cloudflare_deep')
  ORDER BY occurred_at DESC LIMIT 8`;
}

export function reliabilityPendingIncidentSql() {
  return `SELECT event_id,medium AS component,content AS code,occurred_at
  FROM growth_events
  WHERE event_type='reliability_incident' AND traffic_class='QA' AND source='worker'
    AND campaign='PENDING'
  ORDER BY occurred_at ASC LIMIT 32`;
}

const CANARY_MAX_AGE_MINUTES = Object.freeze({
  query_structurer: 70,
  rakuten: 20,
  yahoo: 20,
  ai_chat_primary: 70,
  openai_backup: 390
});

const CANARY_BOOTSTRAP_DEADLINE_MS = Date.parse('2026-08-13T10:30:00.000Z');
const CANARY_RESERVATION_GRACE_MS = 2 * 60000;
const CANARY_PAID_COMPONENTS = new Set(['query_structurer', 'ai_chat_primary', 'openai_backup']);
const CANARY_RESERVATION_MICRO_USD = Object.freeze({
  query_structurer: '0100000', ai_chat_primary: '0500000', openai_backup: '0007000'
});
// Keep this allowlist aligned with deep-canary.mjs. Only these AI-primary
// failures receive one confirmation probe; every other primary failure is an
// immediate control/contract incident.
const CANARY_PRIMARY_TRANSIENT_CODES = new Set([
  'CANARY_PROVIDER_TIMEOUT',
  'CANARY_PROVIDER_RATE_LIMITED',
  'CANARY_PROVIDER_UPSTREAM_5XX',
  'CANARY_PROVIDER_NETWORK_FAILED',
  'CANARY_PROVIDER_INVALID_JSON',
  'GEMINI_CHAT_INTENT_INVALID_JSON',
  'OPENAI_CHAT_INTENT_INVALID_JSON',
  'CANARY_AI_RESPONSE_INVALID'
]);
const CANARY_IMMEDIATE_CODE_PATTERN = /(?:^|_)(?:NOT_CONFIGURED|CONFIG(?:URATION)?|SETTINGS?|AUTH(?:ENTICATION|ORIZATION)?|UNAUTHORIZED|FORBIDDEN|API_KEY|HTTP_(?:401|403)|MODEL|PROVIDER_INVALID|REQUEST_REJECTED|PRICING|BILLING|BUDGET|USAGE|COST|RESERVATION|PROMPT|OUTPUT_LIMIT)(?:_|$)/u;
const RELIABILITY_HEARTBEAT_COMPONENTS = new Set(['cloudflare_regular', 'cloudflare_deep']);
const RELIABILITY_HEARTBEAT_MAX_AGE_MS = 25 * 60000;
const RELIABILITY_HEARTBEAT_STARTED_MAX_AGE_MS = 20 * 60000;
const RELIABILITY_BOOTSTRAP_DEADLINE_MS = Date.parse('2026-08-13T12:30:00.000Z');
const SEARCH_PROVIDER_COMPONENTS = new Set([
  'ai_chat_primary', 'ai_chat_all',
  'query_structurer_primary', 'query_structurer_all'
]);
const SEARCH_PROVIDER_TRANSIENT_CODES = new Set([
  'AI_PROVIDER_TIMEOUT',
  'AI_PROVIDER_RATE_LIMITED',
  'AI_PROVIDER_UPSTREAM_5XX',
  'AI_PROVIDER_NETWORK_FAILED',
  'AI_PROVIDER_INVALID_JSON'
]);
const SEARCH_PROVIDER_PRIMARY_CODES = new Set([
  ...SEARCH_PROVIDER_TRANSIENT_CODES,
  'AI_PROVIDER_REQUEST_REJECTED', 'AI_PROVIDER_AUTH_FAILED',
  'AI_PROVIDER_OUTPUT_LIMIT', 'AI_PROVIDER_FAILED', 'AI_PROVIDER_NOT_CONFIGURED'
]);
const SEARCH_PROVIDER_ALL_CODES = new Set([
  'AI_PROVIDERS_NOT_CONFIGURED', 'AI_ALL_PROVIDERS_FAILED'
]);

export function evaluateSearchProviderDegradation(rows = []) {
  const normalized = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const component = String(row?.component || '');
    const provider = String(row?.provider || '');
    const code = String(row?.code || '');
    const requestId = String(row?.request_id || '').toLowerCase();
    const occurredAt = String(row?.occurred_at || '');
    const timestamp = Date.parse(occurredAt);
    const providerMatchesComponent = component.endsWith('_primary')
      ? provider === 'GEMINI'
      : component.endsWith('_all') && provider === 'ALL';
    const codeMatchesComponent = component.endsWith('_primary')
      ? SEARCH_PROVIDER_PRIMARY_CODES.has(code)
      : component.endsWith('_all') && SEARCH_PROVIDER_ALL_CODES.has(code);
    if (!SEARCH_PROVIDER_COMPONENTS.has(component) || !providerMatchesComponent
      || !codeMatchesComponent
      || !/^[a-f0-9-]{20,64}$/u.test(requestId) || !Number.isFinite(timestamp)) {
      throw new Error('SEARCH_PROVIDER_DEGRADATION_INVALID');
    }
    normalized.push({ component, provider, code, request_id: requestId, timestamp });
  }
  normalized.sort((left, right) => right.timestamp - left.timestamp);
  const allFailure = normalized.find((item) => item.component.endsWith('_all'));
  if (allFailure) {
    throw new Error(`SEARCH_PROVIDER_ALL_FAILED:${allFailure.component.toUpperCase()}:${allFailure.code}:${allFailure.request_id}`);
  }
  const primaryRequests = new Map([
    ['ai_chat_primary', new Map()],
    ['query_structurer_primary', new Map()]
  ]);
  for (const item of normalized) {
    if (!SEARCH_PROVIDER_TRANSIENT_CODES.has(item.code)) {
      throw new Error(`SEARCH_PROVIDER_PRIMARY_NON_TRANSIENT:${item.component.toUpperCase()}:${item.code}:${item.request_id}`);
    }
    if (!primaryRequests.get(item.component).has(item.request_id)) {
      primaryRequests.get(item.component).set(item.request_id, item);
    }
  }
  for (const [component, requests] of primaryRequests) {
    if (requests.size >= 2) {
      const latest = requests.values().next().value;
      throw new Error(`SEARCH_PROVIDER_PRIMARY_REPEATED:${component.toUpperCase()}:${latest.code}:${latest.request_id}:${requests.size}`);
    }
  }
  return {
    all_provider_failures: 0,
    ai_chat_primary_transient_requests: primaryRequests.get('ai_chat_primary').size,
    query_structurer_primary_transient_requests: primaryRequests.get('query_structurer_primary').size
  };
}

export function evaluateReliabilityHeartbeats(rows = [], { now = Date.now() } = {}) {
  const nowMs = Number(now);
  assert(Number.isFinite(nowMs), 'RELIABILITY_HEARTBEAT_TIME_INVALID');
  const latest = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const component = String(row?.component || '');
    if (!RELIABILITY_HEARTBEAT_COMPONENTS.has(component)) continue;
    const eventId = String(row?.event_id || '');
    const status = String(row?.status || '');
    const runId = String(row?.run_id || '');
    const occurredAt = String(row?.occurred_at || '');
    const timestamp = Date.parse(occurredAt);
    if (eventId !== `reliability-heartbeat:${component}`
      || !['STARTED', 'COMPLETED'].includes(status)
      || !/^\d{1,30}$/u.test(runId)
      || !Number.isFinite(timestamp) || timestamp > nowMs + 5 * 60000) {
      throw new Error(`RELIABILITY_HEARTBEAT_INVALID:${component.toUpperCase()}`);
    }
    if (!latest.has(component) || timestamp > latest.get(component).timestamp) {
      latest.set(component, { status, run_id: runId, occurred_at: occurredAt, timestamp });
    }
  }
  const summary = {};
  for (const component of RELIABILITY_HEARTBEAT_COMPONENTS) {
    const item = latest.get(component);
    if (!item && nowMs < RELIABILITY_BOOTSTRAP_DEADLINE_MS) {
      summary[component] = { status: 'PENDING', occurred_at: '' };
      continue;
    }
    if (!item || nowMs - item.timestamp > RELIABILITY_HEARTBEAT_MAX_AGE_MS) {
      throw new Error(`RELIABILITY_HEARTBEAT_STALE:${component.toUpperCase()}`);
    }
    if (item.status === 'STARTED' && nowMs - item.timestamp > RELIABILITY_HEARTBEAT_STARTED_MAX_AGE_MS) {
      throw new Error(`RELIABILITY_HEARTBEAT_STUCK:${component.toUpperCase()}`);
    }
    summary[component] = { status: item.status, occurred_at: item.occurred_at };
  }
  return summary;
}

export function evaluatePendingReliabilityIncidents(rows = []) {
  const incidents = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const eventId = String(row?.event_id || '');
    const component = String(row?.component || '');
    const code = String(row?.code || '');
    const occurredAt = String(row?.occurred_at || '');
    if (!/^reliability-incident:[A-Z][A-Z0-9_]{2,79}$/u.test(eventId)
      || !/^[a-z][a-z0-9_]{2,39}$/u.test(component)
      || !/^[A-Z][A-Z0-9_]{2,79}$/u.test(code)
      || !Number.isFinite(Date.parse(occurredAt))) {
      throw new Error('RELIABILITY_INCIDENT_INVALID');
    }
    incidents.push({ event_id: eventId, component, code, occurred_at: occurredAt });
  }
  if (incidents.length) {
    // Every ID that will be acknowledged must first be visible in the public
    // GitHub incident. Values are already restricted to fixed safe formats.
    const diagnostic = incidents.map((item) => `${item.component}:${item.code}`).join(',');
    const error = new Error(`RELIABILITY_INCIDENT_PENDING:${diagnostic}`);
    error.pendingIncidents = incidents;
    error.pendingCutoff = new Date().toISOString();
    throw error;
  }
  return [];
}

export function evaluateDeepCanary(rows = [], { now = Date.now(), reservationRows = [] } = {}) {
  const nowMs = Number(now);
  assert(Number.isFinite(nowMs), 'DEEP_CANARY_TIME_INVALID');
  const resultKeys = new Set();
  const grouped = new Map(Object.keys(CANARY_MAX_AGE_MINUTES).map((component) => [component, []]));
  for (const row of Array.isArray(rows) ? rows : []) {
    const component = String(row?.component || '');
    if (!grouped.has(component)) continue;
    const status = String(row?.status || '');
    const code = String(row?.code || '');
    const occurredAt = String(row?.occurred_at || '');
    const timestamp = Date.parse(occurredAt);
    const runId = String(row?.event_id || '').match(/^deep-canary:(\d+):/u)?.[1] || '';
    if (!['PASS', 'FAIL'].includes(status) || !/^[A-Z][A-Z0-9_]{2,79}$/u.test(code)
      || !runId || !Number.isFinite(timestamp) || timestamp > nowMs + 5 * 60000) {
      throw new Error(`DEEP_CANARY_RESULT_INVALID:${component || 'UNKNOWN'}`);
    }
    resultKeys.add(`${runId}:${component}`);
    if (!grouped.get(component).some((item) => item.run_id === runId)) {
      grouped.get(component).push({ status, code, timestamp, occurred_at: occurredAt, run_id: runId });
    }
  }
  for (const row of Array.isArray(reservationRows) ? reservationRows : []) {
    const component = String(row?.component || '');
    const status = String(row?.status || '');
    const reserved = String(row?.reserved_micro_usd || '');
    const maximum = String(row?.maximum_micro_usd || '');
    const occurredAt = String(row?.occurred_at || '');
    const timestamp = Date.parse(occurredAt);
    const match = String(row?.event_id || '').match(/^deep-canary-budget:(\d+):(query_structurer|ai_chat_primary|openai_backup)$/u);
    const runId = match?.[1] || '';
    if (!CANARY_PAID_COMPONENTS.has(component) || match?.[2] !== component || status !== 'RESERVED'
      || !/^\d{7}$/u.test(reserved) || reserved !== maximum
      || maximum !== CANARY_RESERVATION_MICRO_USD[component]
      || !Number.isFinite(timestamp) || timestamp > nowMs + 5 * 60000) {
      throw new Error(`DEEP_CANARY_RESERVATION_INVALID:${CANARY_PAID_COMPONENTS.has(component) ? component.toUpperCase() : 'UNKNOWN'}`);
    }
    if (nowMs - timestamp > CANARY_RESERVATION_GRACE_MS && !resultKeys.has(`${runId}:${component}`)) {
      throw new Error(`DEEP_CANARY_RESERVATION_STUCK:${component.toUpperCase()}`);
    }
  }
  const summary = {};
  for (const [component, items] of grouped) {
    items.sort((left, right) => right.timestamp - left.timestamp);
    const latest = items[0];
    if (!latest && nowMs < CANARY_BOOTSTRAP_DEADLINE_MS) {
      summary[component] = { status: 'PENDING', code: 'CANARY_BOOTSTRAP_PENDING', occurred_at: '' };
      continue;
    }
    if (!latest || nowMs - latest.timestamp > CANARY_MAX_AGE_MINUTES[component] * 60000) {
      throw new Error(`DEEP_CANARY_STALE:${component.toUpperCase()}`);
    }
    if (latest.status === 'FAIL' && ['query_structurer', 'ai_chat_primary'].includes(component)
      && !CANARY_PRIMARY_TRANSIENT_CODES.has(latest.code)) {
      throw new Error(`DEEP_CANARY_NON_TRANSIENT_IMMEDIATE:${component.toUpperCase()}:${latest.code}`);
    }
    if (latest.status === 'FAIL' && CANARY_IMMEDIATE_CODE_PATTERN.test(latest.code)
      && !(['query_structurer', 'ai_chat_primary'].includes(component)
        && CANARY_PRIMARY_TRANSIENT_CODES.has(latest.code))) {
      throw new Error(`DEEP_CANARY_NON_TRANSIENT_IMMEDIATE:${component.toUpperCase()}:${latest.code}`);
    }
    if (items.length >= 2
      && items[0].status === 'FAIL' && items[1].status === 'FAIL') {
      const prefix = component === 'query_structurer'
        ? 'DEEP_CANARY_QUERY_STRUCTURER_CONSECUTIVE'
        : component === 'ai_chat_primary'
          ? 'DEEP_CANARY_AI_CHAT_CONSECUTIVE'
        : component === 'openai_backup'
          ? 'DEEP_CANARY_OPENAI_BACKUP_WARNING' : 'DEEP_CANARY_CONSECUTIVE_FAILURE';
      throw new Error(`${prefix}:${component.toUpperCase()}:${latest.code}`);
    }
    summary[component] = { status: latest.status, code: latest.code, occurred_at: latest.occurred_at };
  }
  return summary;
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

async function queryD1Rows(fetcher, endpoint, apiToken, sql, params = []) {
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
  return Array.isArray(query?.results) ? query.results : [];
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
  // Persisted control-plane incidents take precedence over current quality
  // checks. Otherwise a separate SLI failure could hide the outbox forever
  // and prevent the recovered GitHub monitor from recording and ACKing it.
  const pendingIncidents = await queryD1Rows(fetcher, endpoint, apiToken, reliabilityPendingIncidentSql());
  evaluatePendingReliabilityIncidents(pendingIncidents);
  const acuteMinutes = boundedInteger(windowMinutes, 15, 5, 60);
  const sloMinutes = boundedInteger(sloWindowMinutes, 360, 60, 1440);
  const acuteCutoff = new Date(now - acuteMinutes * 60000).toISOString();
  // This is server-authenticated real-request telemetry, not browser RUM.
  // One all-provider fallback is immediately actionable; a transient primary
  // fallback needs two distinct request IDs in the acute window.
  const providerRows = await queryD1Rows(
    fetcher, endpoint, apiToken, searchProviderDegradationSql(), [acuteCutoff]
  );
  const providerDegradation = evaluateSearchProviderDegradation(providerRows);
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
  const canaryRows = await queryD1Rows(fetcher, endpoint, apiToken, deepCanarySql(), [
    new Date(now - 7 * 86400000).toISOString()
  ]);
  const reservationRows = await queryD1Rows(fetcher, endpoint, apiToken, deepCanaryReservationSql(), [
    new Date(now - 7 * 86400000).toISOString()
  ]);
  const deepCanary = evaluateDeepCanary(canaryRows, { now, reservationRows });
  const heartbeatRows = await queryD1Rows(fetcher, endpoint, apiToken, reliabilityHeartbeatSql());
  const reliabilityHeartbeats = evaluateReliabilityHeartbeats(heartbeatRows, { now });
  return { ...acute, provider_degradation: providerDegradation,
    slo_window_minutes: sloMinutes, slo, monthly, deep_canary: deepCanary,
    reliability_heartbeats: reliabilityHeartbeats };
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
    pendingOutput: value('--pending-output', process.env.HOSHILU_PENDING_INCIDENT_OUTPUT || ''),
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
      ,`Provider degradation: AI chat primary transient=${result.provider_degradation.ai_chat_primary_transient_requests}, query structurer primary transient=${result.provider_degradation.query_structurer_primary_transient_requests}, all-provider=0`, ''
      ,`Six-hour quality window: ${result.slo.finished} finished / ${result.slo.degraded} degraded (${(result.slo.degraded_rate * 100).toFixed(1)}%)`, ''
      ,`Thirty-day continuity: ${result.monthly.finished} finished / ${result.monthly.unavailable} unavailable (${(result.monthly.unavailable_rate * 100).toFixed(3)}%)`, ''
      ,`Deep canary: ${Object.entries(result.deep_canary).map(([component, value]) => `${component}=${value.status}(${value.code}) at ${value.occurred_at || 'pending'}`).join(', ')}`, ''
      ,`Control heartbeats: ${Object.entries(result.reliability_heartbeats).map(([component, value]) => `${component}=${value.status} at ${value.occurred_at || 'pending'}`).join(', ')}`, ''
    ].join('\n');
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY) await import('node:fs/promises').then(({ appendFile }) => appendFile(process.env.GITHUB_STEP_SUMMARY, summary));
  } catch (error) {
    const pendingOutput = cliOptions(process.argv.slice(2)).pendingOutput;
    if (pendingOutput && Array.isArray(error?.pendingIncidents)) {
      const payload = { cutoff: error.pendingCutoff, incident_ids: error.pendingIncidents.map((item) => item.event_id) };
      await import('node:fs/promises').then(({ writeFile }) => writeFile(pendingOutput, `${JSON.stringify(payload)}\n`, { mode: 0o600 }));
    }
    const message = String(error?.message || error).slice(0, 2000);
    const summary = `## HOSHILU real-user search SLI: FAIL\n\n- ${message}\n`;
    console.error(summary);
    if (process.env.GITHUB_STEP_SUMMARY) await import('node:fs/promises').then(({ appendFile }) => appendFile(process.env.GITHUB_STEP_SUMMARY, summary));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
