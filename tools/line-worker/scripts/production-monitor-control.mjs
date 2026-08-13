import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DEFAULT_DATABASE_ID = '17629324-b771-4348-982c-c25da48c29b2';
const HEARTBEAT_EVENT_ID = 'reliability-heartbeat:github_schedule';

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

function safeRunId(value) {
  const runId = String(value || '').trim();
  assert(/^\d{1,30}$/u.test(runId), 'MONITOR_CONTROL_RUN_ID_INVALID');
  return runId;
}

async function d1Query({ accountId, apiToken, databaseId = DEFAULT_DATABASE_ID, fetcher = fetch }, sql, params) {
  assert(String(accountId || '').trim(), 'CLOUDFLARE_ACCOUNT_ID_MISSING');
  assert(String(apiToken || '').trim(), 'CLOUDFLARE_API_TOKEN_MISSING');
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiToken}`,
      'content-type': 'application/json',
      'user-agent': 'HOSHILU-Production-Monitor-Control/1.0'
    },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(10000)
  });
  assert(response?.ok, `MONITOR_CONTROL_D1_HTTP_${Number(response?.status) || 0}`);
  const payload = await response.json();
  const result = Array.isArray(payload?.result) ? payload.result[0] : null;
  assert(payload?.success === true && result?.success !== false, 'MONITOR_CONTROL_D1_QUERY_FAILED');
  return result;
}

export async function writeGithubScheduleHeartbeat(options = {}) {
  const status = String(options.status || '').toUpperCase();
  assert(['BOOTSTRAP', 'STARTED', 'COMPLETED'].includes(status), 'MONITOR_CONTROL_STATUS_INVALID');
  const runId = safeRunId(options.runId);
  const occurredAt = new Date(options.now ?? Date.now()).toISOString();
  const insert = status === 'BOOTSTRAP'
    ? `INSERT OR IGNORE INTO growth_events
      (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class,visitor_id,session_id)
      VALUES(?1,'reliability_heartbeat','JA','github','github_schedule',?2,?3,'',?4,'QA','','')`
    : `INSERT INTO growth_events
      (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class,visitor_id,session_id)
      VALUES(?1,'reliability_heartbeat','JA','github','github_schedule',?2,?3,'',?4,'QA','','')
      ON CONFLICT(event_id) DO UPDATE SET campaign=excluded.campaign,content=excluded.content,
        occurred_at=excluded.occurred_at,source=excluded.source,medium=excluded.medium,traffic_class=excluded.traffic_class`;
  await d1Query(options, insert, [HEARTBEAT_EVENT_ID, status, runId, occurredAt]);
  return { ok: true, status, occurred_at: occurredAt };
}

export async function acknowledgeReliabilityIncidents(options = {}) {
  const payload = options.payload || {};
  const cutoff = String(payload.cutoff || '');
  assert(Number.isFinite(Date.parse(cutoff)), 'MONITOR_CONTROL_ACK_CUTOFF_INVALID');
  const ids = [...new Set(Array.isArray(payload.incident_ids) ? payload.incident_ids.map(String) : [])];
  if (!ids.length) return { ok: true, acknowledged: 0 };
  assert(ids.length <= 32 && ids.every((id) => /^reliability-incident:[A-Z][A-Z0-9_]{2,79}$/u.test(id)),
    'MONITOR_CONTROL_ACK_ID_INVALID');
  const placeholders = ids.map((_, index) => `?${index + 2}`).join(',');
  const result = await d1Query(options, `UPDATE growth_events SET campaign='ACKED'
    WHERE event_type='reliability_incident' AND source='worker' AND traffic_class='QA'
      AND campaign='PENDING' AND occurred_at<=?1 AND event_id IN (${placeholders})`, [cutoff, ...ids]);
  return { ok: true, acknowledged: Math.max(0, Number(result?.meta?.changes) || 0) };
}

function cliValue(argv, name, fallback = '') {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
}

async function main(argv) {
  const [command] = argv;
  const common = {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    databaseId: process.env.HOSHILU_D1_DATABASE_ID || DEFAULT_DATABASE_ID
  };
  if (command === 'heartbeat') {
    const result = await writeGithubScheduleHeartbeat({ ...common,
      status: cliValue(argv, '--status'), runId: cliValue(argv, '--run-id') });
    console.log(`MONITOR_HEARTBEAT_${result.status}`);
    return;
  }
  if (command === 'ack') {
    const file = cliValue(argv, '--file');
    assert(file, 'MONITOR_CONTROL_ACK_FILE_MISSING');
    const result = await acknowledgeReliabilityIncidents({ ...common, payload: JSON.parse(await readFile(file, 'utf8')) });
    console.log(`MONITOR_INCIDENTS_ACKNOWLEDGED:${result.acknowledged}`);
    return;
  }
  throw new Error('MONITOR_CONTROL_COMMAND_INVALID');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(String(error?.message || 'MONITOR_CONTROL_FAILED').slice(0, 160));
    process.exitCode = 1;
  });
}
