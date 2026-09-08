const TRUE = /^(?:1|true|on)$/iu;
const COMPATIBILITY_ATTRIBUTES = new Map([['COMPAT_IPHONE15', 'iPhone 15']]);

export function evidenceGateEnabled(env = {}) {
  return TRUE.test(String(env.HOSHILU_EVIDENCE_GATE_ENABLED || ''));
}

function confirmedEvidence(candidate, attributeId) {
  const evidence = candidate?.attribute_evidence?.[attributeId];
  return Boolean(evidence && evidence.confirmed === true && evidence.source && evidence.value !== undefined);
}

function normalizedList(value) {
  return (Array.isArray(value) ? value : value ? [value] : []).map((item) => String(item).normalize('NFKC').toLowerCase());
}

export function evaluateCandidateEvidence(structuredQuery, candidate) {
  for (const attributeId of structuredQuery?.required_attributes || []) {
    const expected = COMPATIBILITY_ATTRIBUTES.get(attributeId);
    if (expected && !normalizedList(candidate?.compatibility_list).includes(expected.toLowerCase())) {
      return { accepted: false, reason_code: 'COMPATIBILITY_MISMATCH', attribute_ids: [attributeId] };
    }
  }

  for (const attributeId of structuredQuery?.evidence_required || []) {
    if (!confirmedEvidence(candidate, attributeId)) {
      return { accepted: false, reason_code: 'EVIDENCE_INSUFFICIENT', attribute_ids: [attributeId] };
    }
  }

  if ((structuredQuery?.required_attributes || []).includes('URL_VERIFIED') && candidate?.url_verified !== true) {
    return { accepted: false, reason_code: 'PRODUCT_URL_UNVERIFIED', attribute_ids: ['URL_VERIFIED'] };
  }

  return { accepted: true, reason_code: null, attribute_ids: [] };
}

export function applyEvidenceGate(structuredQuery, candidates = []) {
  const accepted = [];
  const rejected = [];
  for (const candidate of candidates) {
    const decision = evaluateCandidateEvidence(structuredQuery, candidate);
    (decision.accepted ? accepted : rejected).push({ candidate, decision });
  }
  return { accepted: accepted.map(({ candidate }) => candidate), rejected };
}

export function maybeApplyEvidenceGate(structuredQuery, candidates = [], env = {}) {
  if (!evidenceGateEnabled(env)) return { enabled: false, accepted: candidates, rejected: [] };
  return { enabled: true, ...applyEvidenceGate(structuredQuery, candidates) };
}
