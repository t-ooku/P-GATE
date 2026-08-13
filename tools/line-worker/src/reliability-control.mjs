const HEARTBEAT_EVENT_TYPE = 'reliability_heartbeat';
const INCIDENT_EVENT_TYPE = 'reliability_incident';
const GITHUB_HEARTBEAT_ID = 'reliability-heartbeat:github_schedule';
const GITHUB_COMPONENT = 'github_schedule';
const STALE_AFTER_MS = 20 * 60 * 1000;
const STARTED_STUCK_AFTER_MS = 10 * 60 * 1000;

const CLOUDFLARE_COMPONENTS = Object.freeze({
  cloudflare_regular: 'reliability-heartbeat:cloudflare_regular',
  cloudflare_deep: 'reliability-heartbeat:cloudflare_deep'
});

const INCIDENT_CODES = Object.freeze({
  missing: 'GITHUB_SCHEDULE_HEARTBEAT_MISSING',
  stale: 'GITHUB_SCHEDULE_HEARTBEAT_STALE',
  stuck: 'GITHUB_SCHEDULE_HEARTBEAT_STUCK'
});

function actualDate(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('RELIABILITY_CLOCK_INVALID');
  return date;
}

function cloudflareHeartbeatId(component) {
  return CLOUDFLARE_COMPONENTS[component] || '';
}

async function safeControlStep(action, failureCode) {
  try {
    return await action();
  } catch {
    // Never log an exception, query, provider response, or bound D1 value here.
    // The fixed code is enough to correlate the failure with Workers Logs.
    console.error(failureCode);
    return null;
  }
}

export async function writeCloudflareReliabilityHeartbeat(
  env, component, status, occurredAt = new Date()
) {
  const eventId = cloudflareHeartbeatId(component);
  if (!eventId || !['STARTED', 'COMPLETED'].includes(status)) {
    throw new Error('RELIABILITY_HEARTBEAT_INVALID');
  }
  if (!env?.PRODUCT_DB) return { skipped: true };
  const at = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);
  if (!Number.isFinite(at.getTime())) throw new Error('RELIABILITY_CLOCK_INVALID');
  const runId = String(at.getTime());
  await env.PRODUCT_DB.prepare(`INSERT INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class)
    VALUES(?1,?2,'JA','worker',?3,?4,?5,'',?6,'QA')
    ON CONFLICT(event_id) DO UPDATE SET event_type=excluded.event_type,
      locale=excluded.locale,source=excluded.source,medium=excluded.medium,
      campaign=excluded.campaign,content=excluded.content,marketplace='',
      occurred_at=excluded.occurred_at,traffic_class='QA'`)
    .bind(eventId, HEARTBEAT_EVENT_TYPE, component, status, runId, at.toISOString()).run();
  return { skipped: false, component, status };
}

function githubHeartbeatIncident(row, now) {
  if (!row) return INCIDENT_CODES.missing;
  if (!/^\d{1,30}$/u.test(String(row.content || ''))) return INCIDENT_CODES.stale;
  const occurredAt = Date.parse(String(row.occurred_at || ''));
  if (!Number.isFinite(occurredAt)) return INCIDENT_CODES.stale;
  const ageMs = now.getTime() - occurredAt;
  const status = String(row.campaign || '');
  if (!['BOOTSTRAP', 'STARTED', 'COMPLETED'].includes(status)) return INCIDENT_CODES.stale;
  if (status === 'STARTED' && ageMs > STARTED_STUCK_AFTER_MS) return INCIDENT_CODES.stuck;
  if (ageMs > STALE_AFTER_MS || ageMs < -STALE_AFTER_MS) return INCIDENT_CODES.stale;
  return '';
}

async function enqueueReliabilityIncident(env, code, occurredAt) {
  const eventId = `reliability-incident:${code}`;
  await env.PRODUCT_DB.prepare(`INSERT INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class)
    VALUES(?1,?2,'JA','worker',?3,'PENDING',?4,'',?5,'QA')
    ON CONFLICT(event_id) DO UPDATE SET campaign='PENDING',
      medium=excluded.medium,content=excluded.content,occurred_at=excluded.occurred_at
    WHERE growth_events.event_type=?2 AND growth_events.campaign='ACKED'`)
    .bind(eventId, INCIDENT_EVENT_TYPE, GITHUB_COMPONENT, code, occurredAt.toISOString()).run();
  return code;
}

export async function inspectGithubScheduleHeartbeat(env, now = new Date()) {
  if (!env?.PRODUCT_DB) return { skipped: true, incident: '' };
  const at = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(at.getTime())) throw new Error('RELIABILITY_CLOCK_INVALID');
  const row = await env.PRODUCT_DB.prepare(`SELECT campaign,content,occurred_at
    FROM growth_events
    WHERE event_id=?1 AND event_type=?2 AND source='github' AND medium=?3
    LIMIT 1`).bind(GITHUB_HEARTBEAT_ID, HEARTBEAT_EVENT_TYPE, GITHUB_COMPONENT).first();
  const incident = githubHeartbeatIncident(row, at);
  if (incident) await enqueueReliabilityIncident(env, incident, at);
  return { skipped: false, incident };
}

export async function runReliabilityControlledCron(
  env, component, job, { clock = () => new Date() } = {}
) {
  const validComponent = Boolean(cloudflareHeartbeatId(component));
  if (!validComponent) {
    console.error('RELIABILITY_COMPONENT_INVALID');
    return job();
  }

  await safeControlStep(
    () => writeCloudflareReliabilityHeartbeat(env, component, 'STARTED', actualDate(clock)),
    'RELIABILITY_HEARTBEAT_START_WRITE_FAILED'
  );
  await safeControlStep(
    () => inspectGithubScheduleHeartbeat(env, actualDate(clock)),
    'RELIABILITY_GITHUB_HEARTBEAT_CHECK_FAILED'
  );

  try {
    return await job();
  } finally {
    await safeControlStep(
      () => writeCloudflareReliabilityHeartbeat(env, component, 'COMPLETED', actualDate(clock)),
      'RELIABILITY_HEARTBEAT_COMPLETE_WRITE_FAILED'
    );
  }
}

export const reliabilityControlTest = Object.freeze({
  HEARTBEAT_EVENT_TYPE,
  INCIDENT_EVENT_TYPE,
  GITHUB_HEARTBEAT_ID,
  GITHUB_COMPONENT,
  CLOUDFLARE_COMPONENTS,
  INCIDENT_CODES,
  STALE_AFTER_MS,
  STARTED_STUCK_AFTER_MS,
  githubHeartbeatIncident
});
