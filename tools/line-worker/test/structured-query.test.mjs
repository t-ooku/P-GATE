import test from 'node:test';
import assert from 'node:assert/strict';
import { SEARCH_QUALITY_CASES } from '../evaluation/search-quality-cases.mjs';
import { maybeStructureSearchQuery, structureSearchQuery, structuredQueryEnabled } from '../src/search-quality/query-structurer.mjs';

test('Phase 2 feature flag is off by default and leaves the legacy path untouched', () => {
  assert.equal(structuredQueryEnabled({}), false);
  assert.equal(maybeStructureSearchQuery('完全ワイヤレスイヤホン', 'ja', {}), null);
  assert.equal(structuredQueryEnabled({ HOSHILU_STRUCTURED_QUERY_ENABLED: 'true' }), true);
});

test('structured query preserves raw text and separates required, preferred and excluded attributes', () => {
  const raw = 'clear phone case not a cable';
  const result = structureSearchQuery(raw, 'en-US');
  assert.equal(result.raw_query, raw);
  assert.equal(result.locale, 'en');
  assert.equal(result.product_type, 'PHONE_CASE');
  assert.ok(result.required_attributes.includes('CASE_BODY'));
  assert.ok(result.excluded_attributes.includes('CABLE'));
  assert.deepEqual(result.preferred_attributes, []);
});

test('contradictory true-wireless and wired intent is explicit rather than silently relaxed', () => {
  const result = structureSearchQuery('完全ワイヤレスだけどコード付きイヤホン', 'ja');
  assert.equal(result.contradictory, true);
  assert.ok(result.required_attributes.includes('TRUE_WIRELESS'));
  assert.ok(result.required_attributes.includes('WIRED'));
  assert.ok(result.ambiguity.includes('contradictory_attributes'));
});

test('50-case structuring reaches the Phase 2 classification threshold', () => {
  let productMatches = 0;
  let requiredHits = 0;
  let requiredTotal = 0;
  let excludedHits = 0;
  let excludedTotal = 0;
  for (const item of SEARCH_QUALITY_CASES) {
    const result = structureSearchQuery(item.query, item.locale);
    if (item.product_type === '任意' || item.product_type === '不明' || result.product_type_label === item.product_type) productMatches++;
    requiredTotal += item.required_attributes.length;
    requiredHits += item.required_attributes.filter((id) => result.required_attributes.includes(id)).length;
    excludedTotal += item.excluded_attributes.length;
    excludedHits += item.excluded_attributes.filter((id) => result.excluded_attributes.includes(id)).length;
  }
  assert.ok(productMatches / SEARCH_QUALITY_CASES.length >= 0.84, `product type accuracy ${productMatches}/50`);
  assert.ok(requiredHits / requiredTotal >= 0.85, `required attribute recall ${requiredHits}/${requiredTotal}`);
  assert.ok(excludedHits / excludedTotal >= 0.85, `excluded attribute recall ${excludedHits}/${excludedTotal}`);
});

