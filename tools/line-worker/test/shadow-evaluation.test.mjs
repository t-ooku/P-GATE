import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateShadowRecords,
  createShadowRecord,
  maybeCreateShadowRecord,
  shadowEvaluationEnabled
} from '../src/search-quality/shadow-evaluation.mjs';

const hash = 'a'.repeat(64);

test('Phase 8 shadow evaluation is OFF by default and cannot affect responses', () => {
  assert.equal(shadowEvaluationEnabled({}), false);
  assert.deepEqual(maybeCreateShadowRecord({ query_hash: hash }, {}), { enabled: false, record: null });
});

test('shadow records exclude raw queries, URLs, names, and unknown reason codes', () => {
  const record = createShadowRecord({
    evaluation_id: 'eval_12345678', query_hash: hash, locale: 'en', raw_query: 'private search',
    legacy_product_ids: ['sku:one', 'https://example.com'], shadow_product_ids: ['sku:one'],
    rejection_counts: { ACCESSORY_ONLY: 2, SECRET_REASON: 9 }, customer_name: 'person'
  });
  assert.equal(record.query_hash, hash);
  assert.deepEqual(record.legacy_product_ids, ['sku:one']);
  assert.deepEqual(record.rejection_counts, { ACCESSORY_ONLY: 2 });
  assert.equal('raw_query' in record, false);
  assert.equal('customer_name' in record, false);
});

test('shadow aggregation keeps mandatory safety rates explicit', () => {
  const records = [
    createShadowRecord({ query_hash: hash, legacy_product_ids: ['a'], shadow_product_ids: ['a'], zero_result_honest: false }),
    createShadowRecord({ query_hash: hash, legacy_product_ids: [], shadow_product_ids: [], zero_result_honest: true }),
    createShadowRecord({ query_hash: hash, legacy_product_ids: ['b'], shadow_product_ids: ['c'], exclusion_violations: 1, unverified_urls: 1 })
  ];
  const report = aggregateShadowRecords(records);
  assert.equal(report.sample_size, 3);
  assert.equal(report.ready, false);
  assert.equal(report.metrics.exclusion_violation_rate, 1 / 3);
  assert.equal(report.metrics.marketplace_url_violation_rate, 1 / 3);
  assert.equal(report.metrics.zero_result_honesty, 1);
});

test('no shadow sample is never reported as zero quality', () => {
  assert.deepEqual(aggregateShadowRecords([]), { sample_size: 0, ready: false, metrics: null });
});
