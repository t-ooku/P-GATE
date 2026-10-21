const TRUE = /^(?:1|true|on)$/iu;
const REASON_CODES = new Set([
  'PRODUCT_TYPE_MISMATCH', 'REQUIRED_ATTRIBUTE_MISSING', 'EXCLUDED_ATTRIBUTE_MATCHED',
  'ACCESSORY_ONLY', 'COMPATIBILITY_MISMATCH', 'VOLTAGE_MISMATCH', 'EVIDENCE_INSUFFICIENT',
  'OUT_OF_STOCK', 'PRODUCT_URL_UNVERIFIED', 'AMBIGUOUS_QUERY', 'CONTRADICTORY_QUERY',
  'ZERO_CANDIDATE_AFTER_FILTER'
]);

export function shadowEvaluationEnabled(env = {}) {
  return TRUE.test(String(env.HOSHILU_SEARCH_SHADOW_ENABLED || ''));
}

function integer(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function safeIds(value) {
  return (Array.isArray(value) ? value : []).map(String).filter((id) => /^[a-z0-9:_-]{1,80}$/iu.test(id)).slice(0, 10);
}

export function createShadowRecord(input = {}) {
  const oldIds = safeIds(input.legacy_product_ids);
  const newIds = safeIds(input.shadow_product_ids);
  const reasonCounts = {};
  for (const [reason, count] of Object.entries(input.rejection_counts || {})) {
    if (REASON_CODES.has(reason)) reasonCounts[reason] = integer(count);
  }
  return {
    evaluation_id: /^[a-z0-9_-]{8,80}$/iu.test(String(input.evaluation_id || '')) ? String(input.evaluation_id) : null,
    query_hash: /^[a-f0-9]{64}$/iu.test(String(input.query_hash || '')) ? String(input.query_hash).toLowerCase() : null,
    locale: ['ja', 'en', 'ko', 'zh'].includes(input.locale) ? input.locale : 'ja',
    legacy_product_ids: oldIds,
    shadow_product_ids: newIds,
    rejection_counts: reasonCounts,
    overlap_at_1: oldIds[0] && oldIds[0] === newIds[0] ? 1 : 0,
    overlap_at_3: oldIds.slice(0, 3).filter((id) => newIds.slice(0, 3).includes(id)).length,
    exclusion_violations: integer(input.exclusion_violations),
    unverified_urls: integer(input.unverified_urls),
    zero_result_honest: input.zero_result_honest === true,
    recorded_at: typeof input.recorded_at === 'string' ? input.recorded_at : null
  };
}

export function aggregateShadowRecords(records = []) {
  if (!records.length) return { sample_size: 0, ready: false, metrics: null };
  const sum = (key) => records.reduce((total, row) => total + integer(row[key]), 0);
  const honestRelevant = records.filter((row) => row.shadow_product_ids.length === 0);
  return {
    sample_size: records.length,
    ready: false,
    metrics: {
      top1_overlap: sum('overlap_at_1') / records.length,
      mean_top3_overlap: sum('overlap_at_3') / records.length,
      exclusion_violation_rate: sum('exclusion_violations') / records.length,
      marketplace_url_violation_rate: sum('unverified_urls') / records.length,
      zero_result_honesty: honestRelevant.length ? honestRelevant.filter((row) => row.zero_result_honest).length / honestRelevant.length : null
    }
  };
}

export function maybeCreateShadowRecord(input, env = {}) {
  return shadowEvaluationEnabled(env) ? { enabled: true, record: createShadowRecord(input) } : { enabled: false, record: null };
}
