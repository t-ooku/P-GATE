import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignedToStructuredSearch,
  rollbackRolloutConfiguration,
  rolloutConfiguration,
  rolloutSafetyGate
} from '../src/search-quality/gradual-rollout.mjs';

const safeMetrics = {
  exclusion_violation_rate: 0,
  marketplace_url_violation_rate: 0,
  zero_result_honesty: 1,
  regressed: false
};

test('Phase 9 rollout is forced OFF by default and for invalid percentages', () => {
  assert.equal(rolloutConfiguration({}, {}).percentage, 0);
  assert.equal(rolloutConfiguration({ HOSHILU_SEARCH_ROLLOUT_PERCENT: '10' }, { shadowDays: 14, metrics: safeMetrics, approved: true }).percentage, 0);
});

test('rollout requires explicit approval, seven shadow days, and all mandatory safety gates', () => {
  assert.equal(rolloutSafetyGate({ shadowDays: 14, metrics: safeMetrics, approved: true }).passed, true);
  assert.equal(rolloutConfiguration({ HOSHILU_SEARCH_ROLLOUT_PERCENT: '5' }, { shadowDays: 6, metrics: safeMetrics, approved: true }).stage, 'BLOCKED');
  assert.equal(rolloutConfiguration({ HOSHILU_SEARCH_ROLLOUT_PERCENT: '5' }, { shadowDays: 14, metrics: safeMetrics, approved: false }).stage, 'BLOCKED');
  assert.equal(rolloutConfiguration({ HOSHILU_SEARCH_ROLLOUT_PERCENT: '5' }, { shadowDays: 14, metrics: { ...safeMetrics, exclusion_violation_rate: 0.001 }, approved: true }).stage, 'BLOCKED');
});

test('only 5, 25, and 100 percent rollout stages can become active', () => {
  for (const expected of [5, 25, 100]) {
    const config = rolloutConfiguration({ HOSHILU_SEARCH_ROLLOUT_PERCENT: String(expected) }, { shadowDays: 14, metrics: safeMetrics, approved: true });
    assert.equal(config.percentage, expected);
  }
});

test('cohort assignment is deterministic and never enables an empty identifier', () => {
  const config = { percentage: 25 };
  assert.equal(assignedToStructuredSearch('anonymous-session-123', config), assignedToStructuredSearch('anonymous-session-123', config));
  assert.equal(assignedToStructuredSearch('', { percentage: 100 }), false);
  assert.equal(assignedToStructuredSearch('session', { percentage: 0 }), false);
});

test('rollback is an immediate code-free return to zero percent', () => {
  assert.deepEqual(rollbackRolloutConfiguration(), { percentage: 0, stage: 'OFF', errors: [], rollback: true });
});
