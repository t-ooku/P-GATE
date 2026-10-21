import test from 'node:test';
import assert from 'node:assert/strict';
import canonicalAttributes from '../src/search-quality/canonical-attributes.json' with { type: 'json' };
import {
  renderClarification,
  renderEvidenceBadge,
  renderZeroResult,
  validateSearchQualityLocales
} from '../src/search-quality/localized-messages.mjs';

test('canonical attributes used by Phase 2 contain all four languages', () => {
  for (const [attributeId, terms] of Object.entries(canonicalAttributes)) {
    for (const locale of ['ja', 'en', 'ko', 'zh']) {
      assert.ok(Array.isArray(terms[locale]) && terms[locale].length > 0, `${attributeId}.${locale}`);
    }
  }
});

test('zero-result, clarification, and evidence messages are complete in four languages', () => {
  assert.deepEqual(validateSearchQualityLocales(), []);
  for (const locale of ['ja', 'en', 'ko', 'zh']) {
    assert.ok(renderZeroResult('ACCESSORY_ONLY', locale, { product_type: 'camera' }).includes('camera'));
    assert.ok(renderClarification('COMPATIBILITY_UNKNOWN', locale));
    assert.ok(renderEvidenceBadge('confirmed', locale));
  }
});

test('zero-result output is honest and never invents an item count or URL', () => {
  for (const locale of ['ja', 'en', 'ko', 'zh']) {
    const message = renderZeroResult('EVIDENCE_INSUFFICIENT', locale, { attribute: 'IP68', product_type: 'speaker' });
    assert.doesNotMatch(message, /https?:\/\//iu);
    assert.doesNotMatch(message, /(?:\b[1-9]\d*\s*(?:items?|products?)\b|[1-9]\d*件)/iu);
  }
});

test('unsupported locale safely falls back to Japanese', () => {
  assert.equal(renderEvidenceBadge('unknown', 'fr'), renderEvidenceBadge('unknown', 'ja'));
  assert.equal(renderZeroResult('NOT_A_REASON', 'ja', {}), null);
});
