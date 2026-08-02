import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyEvidenceGate,
  evaluateCandidateEvidence,
  evidenceGateEnabled,
  maybeApplyEvidenceGate
} from '../src/search-quality/evidence-gate.mjs';

function evidence(attributeId, value) {
  return { [attributeId]: { confirmed: true, source: 'official_product_page', value } };
}

test('Phase 5 evidence gate is OFF by default', () => {
  const candidates = [{ id: 'legacy' }];
  assert.equal(evidenceGateEnabled({}), false);
  assert.deepEqual(maybeApplyEvidenceGate({}, candidates, {}).accepted, candidates);
});

test('iPhone 15 request rejects a candidate for another model before evidence evaluation', () => {
  const query = { required_attributes: ['COMPAT_IPHONE15'], evidence_required: ['COMPAT_IPHONE15'] };
  const decision = evaluateCandidateEvidence(query, {
    compatibility_list: ['iPhone 14'],
    attribute_evidence: evidence('COMPAT_IPHONE15', 'iPhone 15')
  });
  assert.equal(decision.reason_code, 'COMPATIBILITY_MISMATCH');
});

test('100V, waterproof and genuine claims require confirmed source and value', () => {
  for (const attributeId of ['VOLTAGE_100V_COMPAT', 'WATERPROOF', 'GENUINE_BRAND']) {
    const query = { required_attributes: [attributeId], evidence_required: [attributeId] };
    assert.equal(evaluateCandidateEvidence(query, { attribute_evidence: {} }).reason_code, 'EVIDENCE_INSUFFICIENT');
    assert.equal(evaluateCandidateEvidence(query, { attribute_evidence: { [attributeId]: { confirmed: true, value: true } } }).reason_code, 'EVIDENCE_INSUFFICIENT');
    assert.equal(evaluateCandidateEvidence(query, { attribute_evidence: evidence(attributeId, true) }).accepted, true);
  }
});

test('unverified product URLs never pass a URL-required query', () => {
  const query = { required_attributes: ['URL_VERIFIED'], evidence_required: [] };
  assert.equal(evaluateCandidateEvidence(query, { url_verified: false }).reason_code, 'PRODUCT_URL_UNVERIFIED');
  assert.equal(evaluateCandidateEvidence(query, { url_verified: true }).accepted, true);
});

test('only fully evidenced candidates survive the gate', () => {
  const query = {
    required_attributes: ['COMPAT_IPHONE15', 'WATERPROOF'],
    evidence_required: ['COMPAT_IPHONE15', 'WATERPROOF']
  };
  const result = applyEvidenceGate(query, [
    { id: 'ok', compatibility_list: ['iPhone 15'], attribute_evidence: { ...evidence('COMPAT_IPHONE15', 'iPhone 15'), ...evidence('WATERPROOF', 'IP68') } },
    { id: 'wrong-model', compatibility_list: ['iPhone 14'], attribute_evidence: { ...evidence('COMPAT_IPHONE15', 'iPhone 15'), ...evidence('WATERPROOF', 'IP68') } },
    { id: 'no-proof', compatibility_list: ['iPhone 15'], attribute_evidence: evidence('COMPAT_IPHONE15', 'iPhone 15') }
  ]);
  assert.deepEqual(result.accepted.map(({ id }) => id), ['ok']);
  assert.deepEqual(result.rejected.map(({ decision }) => decision.reason_code), ['COMPATIBILITY_MISMATCH', 'EVIDENCE_INSUFFICIENT']);
});
