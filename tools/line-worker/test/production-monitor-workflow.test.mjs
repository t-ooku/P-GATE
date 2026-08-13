import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../../../.github/workflows/production-monitor.yml', import.meta.url), 'utf8');
const wrangler = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));

test('five-minute production monitor checks the live feature branch without deploy credentials', () => {
  assert.match(workflow, /2,7,12,17,22,27,32,37,42,47,52,57 \* \* \* \*/u);
  assert.match(workflow, /ref: feature\/ui-search-v2/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(workflow, /--asset-policy live/u);
  assert.match(workflow, /check-production-search-sli\.mjs/u);
  assert.match(workflow, /--deadline-ms 90000/u);
  assert.match(workflow, /timeout-minutes: 2/u);
  assert.match(workflow, /branches: \[main\]/u);
  assert.match(workflow, /actions: read/u);
  assert.match(workflow, /issues: write/u);
});

test('Worker logs are explicitly enabled for trace-ID root-cause analysis', () => {
  assert.equal(wrangler.observability.enabled, true);
  assert.equal(wrangler.observability.head_sampling_rate, 0.1);
});

test('production monitor deduplicates incidents and waits for stable recovery', () => {
  assert.match(workflow, /\[AUTO\]\[HOSHILU\] Production reliability incident/u);
  assert.match(workflow, /issues\.find/u);
  assert.match(workflow, /slice\(0, 2\)/u);
  assert.match(workflow, /three consecutive successful checks/u);
  assert.match(workflow, /Search text and personal data are not recorded/u);
});
