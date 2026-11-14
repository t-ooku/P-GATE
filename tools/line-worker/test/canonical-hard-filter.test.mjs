import test from 'node:test';
import assert from 'node:assert/strict';
import { SEARCH_QUALITY_CASES } from '../evaluation/search-quality-cases.mjs';
import { structureSearchQuery } from '../src/search-quality/query-structurer.mjs';
import {
  applyCanonicalHardFilter,
  canonicalHardFilterEnabled,
  evaluateCanonicalCandidate,
  maybeApplyCanonicalHardFilter
} from '../src/search-quality/hard-filter.mjs';

test('Phase 3 canonical filter remains disabled by default', () => {
  const candidates = [{ id: 'legacy' }];
  assert.equal(canonicalHardFilterEnabled({}), false);
  assert.deepEqual(maybeApplyCanonicalHardFilter({}, candidates, {}).accepted, candidates);
  assert.equal(canonicalHardFilterEnabled({ HOSHILU_CANONICAL_HARD_FILTER_ENABLED: 'on' }), true);
});

test('hard-filter order is product type, required attributes, then exclusions', () => {
  const query = { product_type: 'PHONE_CASE', required_attributes: ['CASE_BODY'], excluded_attributes: ['CABLE'] };
  assert.equal(evaluateCanonicalCandidate(query, { product_type: 'CABLE', detected_attributes: [] }).reason_code, 'PRODUCT_TYPE_MISMATCH');
  assert.equal(evaluateCanonicalCandidate(query, { product_type: 'PHONE_CASE', detected_attributes: ['CABLE'] }).reason_code, 'REQUIRED_ATTRIBUTE_MISSING');
  assert.equal(evaluateCanonicalCandidate(query, { product_type: 'PHONE_CASE', detected_attributes: ['CASE_BODY', 'CABLE'] }).reason_code, 'EXCLUDED_ATTRIBUTE_MATCHED');
});

test('50-case synthetic negatives cannot cross the canonical hard filter', () => {
  let exclusionViolations = 0;
  let requiredViolations = 0;
  for (const item of SEARCH_QUALITY_CASES) {
    const query = structureSearchQuery(item.query, item.locale);
    if (query.product_type === 'UNKNOWN' || query.contradictory) continue;
    const good = {
      id: `${item.case_id}-ok`,
      product_type: query.product_type,
      detected_attributes: [...query.required_attributes]
    };
    const bad = {
      id: `${item.case_id}-ng`,
      product_type: query.product_type,
      detected_attributes: [...query.required_attributes, ...query.excluded_attributes]
    };
    if (!query.excluded_attributes.length && query.required_attributes.length) bad.detected_attributes = query.required_attributes.slice(1);
    if (!query.excluded_attributes.length && !query.required_attributes.length) bad.product_type = 'IRRELEVANT';
    const result = applyCanonicalHardFilter(query, [good, bad]);
    for (const candidate of result.accepted) {
      const attrs = new Set(candidate.detected_attributes);
      if (query.excluded_attributes.some((id) => attrs.has(id))) exclusionViolations++;
      if (query.required_attributes.some((id) => !attrs.has(id))) requiredViolations++;
    }
    assert.ok(result.accepted.some((candidate) => candidate.id === good.id), item.case_id);
    assert.ok(result.rejected.some(({ candidate }) => candidate.id === bad.id), item.case_id);
  }
  assert.equal(exclusionViolations, 0);
  assert.equal(requiredViolations, 0);
});
