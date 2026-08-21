import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hasThreeConsecutivePostIncidentSuccesses } from '../scripts/production-monitor-recovery.mjs';

const workflow = await readFile(new URL('../../../.github/workflows/production-monitor.yml', import.meta.url), 'utf8');
const wrangler = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));

test('five-minute production monitor checks the live feature branch without deploy credentials', () => {
  assert.match(workflow, /2,7,12,17,22,27,32,37,42,47,52,57 \* \* \* \*/u);
  assert.match(workflow, /ref: feature\/ui-search-v2/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(workflow, /--asset-policy live/u);
  assert.match(workflow, /check-production-search-sli\.mjs/u);
  assert.match(workflow, /production-monitor-control\.mjs heartbeat --status STARTED/u);
  assert.match(workflow, /production-monitor-control\.mjs heartbeat --status COMPLETED/u);
  assert.match(workflow, /production-monitor-control\.mjs heartbeat --status BOOTSTRAP/u);
  assert.match(workflow, /--pending-output \/tmp\/hoshilu-pending-incidents\.json/u);
  assert.match(workflow, /production-monitor-control\.mjs ack/u);
  assert.match(workflow, /--deadline-ms 90000/u);
  assert.match(workflow, /timeout-minutes: 2/u);
  assert.match(workflow, /branches: \[main\]/u);
  assert.match(workflow, /actions: read/u);
  assert.match(workflow, /issues: write/u);
  assert.match(workflow, /timeout-minutes: 6/u);
  assert.match(workflow, /cancel-in-progress: false/u);
  assert.doesNotMatch(workflow, /cancel-in-progress: true/u);
});

test('monitor heartbeat is schedule-only and persisted incidents are acknowledged only after Issue recording', () => {
  assert.match(workflow, /if: github\.event_name == 'schedule'/u);
  assert.match(workflow, /steps\.incident\.outputs\.recorded == 'true'/u);
  assert.match(workflow, /core\.setOutput\('recorded', 'true'\)/u);
  assert.match(workflow, /heartbeat_start\.outcome != 'success'/u);
  assert.match(workflow, /heartbeat_complete\.outcome != 'success'/u);
});

test('Worker logs are explicitly enabled for trace-ID root-cause analysis', () => {
  assert.equal(wrangler.observability.enabled, true);
  assert.equal(wrangler.observability.head_sampling_rate, 0.1);
});

test('production monitor deduplicates incidents and waits for stable recovery', () => {
  assert.match(workflow, /\[AUTO\]\[HOSHILU\] Production reliability incident/u);
  assert.match(workflow, /issues\.find/u);
  assert.match(workflow, /hasThreeConsecutivePostIncidentSuccesses/u);
  assert.match(workflow, /three consecutive successful checks/u);
  assert.match(workflow, /Search text and personal data are not recorded/u);
});

test('a rerun cannot count successes that happened before the incident', () => {
  const issueBody = '- First detected: `2026-08-21T18:34:47.727Z`';
  const runs = [
    { id: 60, created_at: '2026-08-21T18:34:21Z', conclusion: 'success' },
    { id: 59, created_at: '2026-08-21T17:59:25Z', conclusion: 'success' },
    { id: 58, created_at: '2026-08-21T17:35:23Z', conclusion: 'success' }
  ];
  assert.equal(hasThreeConsecutivePostIncidentSuccesses(runs, 60, issueBody), false);
});

test('recovery requires two prior successful runs after first detection', () => {
  const issueBody = '- First detected: `2026-08-21T18:34:47.727Z`';
  const recovered = [
    { id: 63, created_at: '2026-08-21T19:12:00Z', conclusion: 'success' },
    { id: 62, created_at: '2026-08-21T19:07:00Z', conclusion: 'success' },
    { id: 61, created_at: '2026-08-21T19:02:00Z', conclusion: 'success' },
    { id: 60, created_at: '2026-08-21T18:34:21Z', conclusion: 'success' }
  ];
  assert.equal(hasThreeConsecutivePostIncidentSuccesses(recovered, 63, issueBody), true);

  const interrupted = recovered.map((run) => run.id === 62
    ? { ...run, conclusion: 'failure' } : run);
  assert.equal(hasThreeConsecutivePostIncidentSuccesses(interrupted, 63, issueBody), false);
  assert.equal(hasThreeConsecutivePostIncidentSuccesses(recovered, 63, ''), false);
});
