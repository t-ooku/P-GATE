const ALLOWED_PERCENTAGES = new Set([0, 5, 25, 100]);

function percentage(value) {
  const parsed = Number(value);
  return ALLOWED_PERCENTAGES.has(parsed) ? parsed : 0;
}

function hashBucket(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

export function rolloutSafetyGate({ shadowDays = 0, metrics = null, approved = false } = {}) {
  const errors = [];
  if (approved !== true) errors.push('explicit_approval_required');
  if (Number(shadowDays) < 7) errors.push('shadow_period_too_short');
  if (!metrics) errors.push('shadow_metrics_missing');
  else {
    if (metrics.exclusion_violation_rate !== 0) errors.push('exclusion_violation_rate_nonzero');
    if (metrics.marketplace_url_violation_rate !== 0) errors.push('marketplace_url_violation_rate_nonzero');
    if (metrics.zero_result_honesty !== 1) errors.push('zero_result_honesty_below_one');
    if (metrics.regressed === true) errors.push('quality_regression_detected');
  }
  return { passed: errors.length === 0, errors };
}

export function rolloutConfiguration(env = {}, evidence = {}) {
  const requested = percentage(env.HOSHILU_SEARCH_ROLLOUT_PERCENT);
  if (requested === 0) return { percentage: 0, stage: 'OFF', errors: [] };
  const gate = rolloutSafetyGate(evidence);
  if (!gate.passed) return { percentage: 0, stage: 'BLOCKED', errors: gate.errors };
  return { percentage: requested, stage: requested === 100 ? 'FULL' : `PILOT_${requested}`, errors: [] };
}

export function assignedToStructuredSearch(subjectId, configuration) {
  const percent = percentage(configuration?.percentage);
  if (!subjectId || percent === 0) return false;
  if (percent === 100) return true;
  return hashBucket(subjectId) < percent;
}

export function rollbackRolloutConfiguration() {
  return { percentage: 0, stage: 'OFF', errors: [], rollback: true };
}
