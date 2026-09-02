import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hasThreeConsecutivePostIncidentSuccesses } from '../scripts/production-monitor-recovery.mjs';

const workflow = await readFile(new URL('../../../.github/workflows/production-monitor.yml', import.meta.url), 'utf8');
const wrangler = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));

test('five-minute production monitor checks the live feature branch without deploy credentials', () => {
  assert.match(workflow, /2 \* \* \* \*/u);
  assert.match(workflow, /7,12,17,22,27,32,37,42,47,52,57 \* \* \* \*/u);
  assert.match(workflow, /ref: feature\/ui-search-v2/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(workflow, /--asset-policy live/u);
  assert.match(workflow, /check-production-search-sli\.mjs/u);
  assert.match(workflow, /check-social-ai-actress-sla\.mjs/u);
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
  assert.match(workflow, /timeout-minutes: 9/u);
  assert.match(workflow, /cancel-in-progress: false/u);
  assert.doesNotMatch(workflow, /cancel-in-progress: true/u);
});

test('Codex KPI snapshot runs hourly, contains aggregates only and is retained briefly', () => {
  assert.match(workflow, /id: kpi/u);
  assert.match(workflow, /github\.event\.schedule == '2 \* \* \* \*'/u);
  assert.match(workflow, /read-codex-kpi-snapshot\.mjs/u);
  assert.match(workflow, /hoshilu-codex-kpi-snapshot\.json/u);
  assert.match(workflow, /hoshilu-codex-kpi-\$\{\{ github\.run_id \}\}/u);
  assert.match(workflow, /retention-days: 7/u);
  assert.match(workflow, /KPI_OUTCOME: \$\{\{ steps\.kpi\.outcome \}\}/u);
  assert.match(workflow, /steps\.kpi\.outcome == 'failure'/u);
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
  // 2026-09-02: 実機で再現する写真検索の失敗を追跡IDで切り分けるため、
  // 当面は全リクエストを記録する(1)。原因確定後に0.1へ戻す想定。
  assert.ok([1, 0.1].includes(wrangler.observability.head_sampling_rate));
  assert.equal(wrangler.observability.head_sampling_rate, 1);
});

test('production monitor deduplicates incidents and waits for stable recovery', () => {
  assert.match(workflow, /\[AUTO\]\[HOSHILU\] Production reliability incident/u);
  assert.match(workflow, /issues\.find/u);
  assert.match(workflow, /hasThreeConsecutivePostIncidentSuccesses/u);
  assert.match(workflow, /three consecutive new scheduled checks/u);
  assert.match(workflow, /Search text and personal data are not recorded/u);
});

test('daily AI actress SLA participates in the shared incident and final workflow result', () => {
  assert.match(workflow, /id: social_ai/u);
  assert.match(workflow, /SOCIAL_AI_OUTCOME: \$\{\{ steps\.social_ai\.outcome \}\}/u);
  assert.match(workflow, /externalFailed \|\| sliFailed \|\| socialAiFailed/u);
  assert.match(workflow, /Daily AI-actress social SLA/u);
  assert.match(workflow, /hoshilu-social-ai-actress-sla\.log/u);
  assert.match(workflow, /steps\.social_ai\.outcome != 'success'/u);
  assert.match(workflow, /--attempts 3 --retry-ms 5000/u);
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

test('recovery requires two prior original scheduled successes after last detection', () => {
  const issueBody = [
    '- First detected: `2026-08-21T18:34:47.727Z`',
    '- Last detected: `2026-08-21T18:55:00.000Z`'
  ].join('\n');
  const recovered = [
    { id: 63, event: 'schedule', run_attempt: 1, created_at: '2026-08-21T19:12:00Z', conclusion: 'success' },
    { id: 62, event: 'schedule', run_attempt: 1, created_at: '2026-08-21T19:07:00Z', conclusion: 'success' },
    { id: 61, event: 'schedule', run_attempt: 1, created_at: '2026-08-21T19:02:00Z', conclusion: 'success' },
    { id: 60, event: 'schedule', run_attempt: 1, created_at: '2026-08-21T18:34:21Z', conclusion: 'success' }
  ];
  assert.equal(hasThreeConsecutivePostIncidentSuccesses(recovered, 63, issueBody, 1, 'schedule'), true);

  const interrupted = recovered.map((run) => run.id === 62
    ? { ...run, conclusion: 'failure' } : run);
  assert.equal(hasThreeConsecutivePostIncidentSuccesses(interrupted, 63, issueBody, 1, 'schedule'), false);
  assert.equal(hasThreeConsecutivePostIncidentSuccesses(recovered, 63, '', 1, 'schedule'), false);
});

test('recovery ignores manually rerun jobs and starts after the last detection', () => {
  const issueBody = [
    '- First detected: `2026-08-31T00:37:43.196Z`',
    '- Last detected: `2026-08-31T11:09:56.065Z`'
  ].join('\n');
  const runs = [
    { id: 664, event: 'schedule', run_attempt: 1, created_at: '2026-08-31T13:59:03Z', conclusion: 'success' },
    { id: 663, event: 'schedule', run_attempt: 1, created_at: '2026-08-31T13:30:33Z', conclusion: 'success' },
    { id: 662, event: 'schedule', run_attempt: 2, created_at: '2026-08-31T06:12:00Z', conclusion: 'success' },
    { id: 661, event: 'schedule', run_attempt: 16, created_at: '2026-08-31T05:19:50Z', conclusion: 'success' }
  ];

  assert.equal(hasThreeConsecutivePostIncidentSuccesses(runs, 664, issueBody), false);
  assert.equal(hasThreeConsecutivePostIncidentSuccesses(runs, 664, issueBody, 2, 'schedule'), false);
  assert.equal(hasThreeConsecutivePostIncidentSuccesses(runs, 664, issueBody, 1, 'workflow_dispatch'), false);
});
