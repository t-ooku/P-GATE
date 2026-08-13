import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { normalizeGrowthEvent } from '../src/growth-events.mjs';
import {
  inspectGithubScheduleHeartbeat,
  reliabilityControlTest,
  runReliabilityControlledCron
} from '../src/reliability-control.mjs';

const migration = (name) => readFileSync(
  new URL(`../migrations/${name}`, import.meta.url),
  'utf8'
);

function sqliteEnvironment() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(migration('0012_growth_events.sql'));
  sqlite.exec(migration('0004_unmet_demand_events.sql'));
  sqlite.exec(migration('0013_growth_event_traffic_class.sql'));
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...values) {
          return {
            run: async () => {
              const result = statement.run(...values);
              return { meta: { changes: Number(result.changes || 0) } };
            },
            first: async () => statement.get(...values) || null
          };
        }
      };
    }
  };
  return { sqlite, env: { PRODUCT_DB: db } };
}

function seedGithubHeartbeat(sqlite, campaign, occurredAt) {
  const runId = String(Date.parse(occurredAt));
  sqlite.prepare(`INSERT INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class)
    VALUES('reliability-heartbeat:github_schedule','reliability_heartbeat','JA','github',
      'github_schedule',?,?,'',?,'QA')
    ON CONFLICT(event_id) DO UPDATE SET campaign=excluded.campaign,content=excluded.content,
      occurred_at=excluded.occurred_at`)
    .run(campaign, runId, occurredAt);
}

test('regular and deep cron heartbeats use fixed internal rows and actual completion time', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  seedGithubHeartbeat(sqlite, 'COMPLETED', '2026-08-13T00:04:00.000Z');
  const times = [
    new Date('2026-08-13T00:05:01.000Z'),
    new Date('2026-08-13T00:05:02.000Z'),
    new Date('2026-08-13T00:05:03.000Z')
  ];
  let ran = false;
  const result = await runReliabilityControlledCron(env, 'cloudflare_regular', async () => {
    ran = true;
    return 'done';
  }, { clock: () => times.shift() });
  assert.equal(ran, true);
  assert.equal(result, 'done');
  assert.deepEqual({ ...sqlite.prepare(`SELECT event_id,event_type,source,medium,campaign,
      content,marketplace,occurred_at,traffic_class FROM growth_events
      WHERE event_id='reliability-heartbeat:cloudflare_regular'`).get() }, {
    event_id: 'reliability-heartbeat:cloudflare_regular',
    event_type: 'reliability_heartbeat',
    source: 'worker',
    medium: 'cloudflare_regular',
    campaign: 'COMPLETED',
    content: '1786579503000',
    marketplace: '',
    occurred_at: '2026-08-13T00:05:03.000Z',
    traffic_class: 'QA'
  });
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM growth_events
    WHERE event_type='reliability_incident'`).get().count, 0);
});

test('GitHub schedule tolerates platform delay while detecting missing, stale, and stuck heartbeats', () => {
  const { githubHeartbeatIncident, INCIDENT_CODES } = reliabilityControlTest;
  const now = new Date('2026-08-13T00:30:00.000Z');
  assert.equal(githubHeartbeatIncident(null, now), INCIDENT_CODES.missing);
  assert.equal(githubHeartbeatIncident({
    campaign: 'COMPLETED', content: '12345', occurred_at: '2026-08-12T22:30:00.000Z'
  }, now), '');
  assert.equal(githubHeartbeatIncident({
    campaign: 'COMPLETED', content: '12345', occurred_at: '2026-08-12T22:29:59.999Z'
  }, now), INCIDENT_CODES.stale);
  assert.equal(githubHeartbeatIncident({
    campaign: 'STARTED', content: '12345', occurred_at: '2026-08-13T00:20:00.000Z'
  }, now), '');
  assert.equal(githubHeartbeatIncident({
    campaign: 'STARTED', content: '12345', occurred_at: '2026-08-13T00:19:59.999Z'
  }, now), INCIDENT_CODES.stuck);
  assert.equal(githubHeartbeatIncident({
    campaign: 'BOOTSTRAP', content: '12345', occurred_at: '2026-08-13T00:29:00.000Z'
  }, now), '');
  assert.equal(githubHeartbeatIncident({ campaign: 'UNKNOWN', content: '12345', occurred_at: 'invalid' }, now),
    INCIDENT_CODES.stale);
  assert.equal(githubHeartbeatIncident({
    campaign: 'COMPLETED', content: 'not-a-run-id', occurred_at: '2026-08-13T00:29:00.000Z'
  }, now), INCIDENT_CODES.stale);
});

test('incident outbox preserves first PENDING detection and reopens an ACKED recurrence', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  const first = new Date('2026-08-13T00:00:00.000Z');
  const repeated = new Date('2026-08-13T00:05:00.000Z');
  const recurred = new Date('2026-08-13T00:10:00.000Z');
  await inspectGithubScheduleHeartbeat(env, first);
  await inspectGithubScheduleHeartbeat(env, repeated);
  const eventId = 'reliability-incident:GITHUB_SCHEDULE_HEARTBEAT_MISSING';
  assert.deepEqual({ ...sqlite.prepare(`SELECT event_type,source,medium,campaign,content,
    occurred_at,traffic_class FROM growth_events WHERE event_id=?`).get(eventId) }, {
    event_type: 'reliability_incident',
    source: 'worker',
    medium: 'github_schedule',
    campaign: 'PENDING',
    content: 'GITHUB_SCHEDULE_HEARTBEAT_MISSING',
    occurred_at: first.toISOString(),
    traffic_class: 'QA'
  });
  sqlite.prepare(`UPDATE growth_events SET campaign='ACKED' WHERE event_id=?`).run(eventId);
  await inspectGithubScheduleHeartbeat(env, recurred);
  assert.deepEqual({ ...sqlite.prepare(`SELECT campaign,occurred_at FROM growth_events
    WHERE event_id=?`).get(eventId) }, {
    campaign: 'PENDING', occurred_at: recurred.toISOString()
  });
});

test('stale completion and stuck start enqueue separate fixed safe-code rows', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  seedGithubHeartbeat(sqlite, 'COMPLETED', '2026-08-13T00:00:00.000Z');
  await inspectGithubScheduleHeartbeat(env, new Date('2026-08-13T02:00:00.001Z'));
  seedGithubHeartbeat(sqlite, 'STARTED', '2026-08-13T00:20:00.000Z');
  await inspectGithubScheduleHeartbeat(env, new Date('2026-08-13T00:30:00.001Z'));
  assert.deepEqual(sqlite.prepare(`SELECT event_id,medium,campaign,content
    FROM growth_events WHERE event_type='reliability_incident' ORDER BY event_id`).all()
    .map((row) => ({ ...row })), [
    {
      event_id: 'reliability-incident:GITHUB_SCHEDULE_HEARTBEAT_STALE',
      medium: 'github_schedule', campaign: 'PENDING',
      content: 'GITHUB_SCHEDULE_HEARTBEAT_STALE'
    },
    {
      event_id: 'reliability-incident:GITHUB_SCHEDULE_HEARTBEAT_STUCK',
      medium: 'github_schedule', campaign: 'PENDING',
      content: 'GITHUB_SCHEDULE_HEARTBEAT_STUCK'
    }
  ]);
});

test('D1 control failures log fixed codes only and never block the scheduled job', async () => {
  const originalError = console.error;
  const logs = [];
  console.error = (...values) => logs.push(values);
  let ran = false;
  try {
    const result = await runReliabilityControlledCron({
      PRODUCT_DB: {
        prepare() { throw new Error('SECRET query external response must never be logged'); }
      }
    }, 'cloudflare_deep', async () => {
      ran = true;
      return 'job-result';
    }, { clock: () => new Date('2026-08-13T00:00:00.000Z') });
    assert.equal(result, 'job-result');
  } finally {
    console.error = originalError;
  }
  assert.equal(ran, true);
  assert.deepEqual(logs, [
    ['RELIABILITY_HEARTBEAT_START_WRITE_FAILED'],
    ['RELIABILITY_GITHUB_HEARTBEAT_CHECK_FAILED'],
    ['RELIABILITY_HEARTBEAT_COMPLETE_WRITE_FAILED']
  ]);
  assert.doesNotMatch(JSON.stringify(logs), /SECRET|query|response/u);
});

test('a rejected cron job still writes completion and preserves the job rejection', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  seedGithubHeartbeat(sqlite, 'COMPLETED', '2026-08-13T00:00:00.000Z');
  const times = [
    new Date('2026-08-13T00:01:00.000Z'),
    new Date('2026-08-13T00:01:01.000Z'),
    new Date('2026-08-13T00:01:02.000Z')
  ];
  await assert.rejects(runReliabilityControlledCron(env, 'cloudflare_deep', async () => {
    throw new Error('DEEP_JOB_FAILED');
  }, { clock: () => times.shift() }), /DEEP_JOB_FAILED/u);
  assert.deepEqual({ ...sqlite.prepare(`SELECT campaign,occurred_at FROM growth_events
    WHERE event_id='reliability-heartbeat:cloudflare_deep'`).get() }, {
    campaign: 'COMPLETED', occurred_at: '2026-08-13T00:01:02.000Z'
  });
});

test('public growth events cannot forge reliability heartbeat or incident rows', () => {
  assert.throws(() => normalizeGrowthEvent({ event_type: 'reliability_heartbeat' }),
    /GROWTH_EVENT_INVALID/u);
  assert.throws(() => normalizeGrowthEvent({ event_type: 'reliability_incident' }),
    /GROWTH_EVENT_INVALID/u);
});

test('both Worker cron paths are wrapped in one awaited reliability lifecycle', () => {
  const source = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ runReliabilityControlledCron \} from '\.\/reliability-control\.mjs'/u);
  assert.match(source, /ctx\.waitUntil\(runReliabilityControlledCron\([\s\S]*?'cloudflare_deep'[\s\S]*?runDeepCanaryCycle\(env, scheduledAt\)[\s\S]*?\)\);[\s\S]*?return;/u);
  assert.match(source, /ctx\.waitUntil\(runReliabilityControlledCron\([\s\S]*?'cloudflare_regular'[\s\S]*?Promise\.allSettled\(\[/u);
});
