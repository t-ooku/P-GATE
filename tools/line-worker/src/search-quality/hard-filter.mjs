const TRUE = /^(?:1|true|on)$/iu;

export const HARD_FILTER_REASONS = Object.freeze({
  PRODUCT_TYPE_MISMATCH: 'PRODUCT_TYPE_MISMATCH',
  REQUIRED_ATTRIBUTE_MISSING: 'REQUIRED_ATTRIBUTE_MISSING',
  EXCLUDED_ATTRIBUTE_MATCHED: 'EXCLUDED_ATTRIBUTE_MATCHED'
});

export function canonicalHardFilterEnabled(env = {}) {
  return TRUE.test(String(env.HOSHILU_CANONICAL_HARD_FILTER_ENABLED || ''));
}

function values(candidate, key) {
  const value = candidate?.[key];
  return new Set((Array.isArray(value) ? value : value ? [value] : []).map(String));
}

function compatibleProductType(queryType, candidateType) {
  if (!queryType || queryType === 'UNKNOWN' || queryType === 'ANY') return true;
  return String(candidateType || '') === queryType;
}

export function evaluateCanonicalCandidate(structuredQuery, candidate) {
  if (!compatibleProductType(structuredQuery?.product_type, candidate?.product_type)) {
    return { accepted: false, reason_code: HARD_FILTER_REASONS.PRODUCT_TYPE_MISMATCH };
  }

  const attributes = values(candidate, 'detected_attributes');
  const missing = (structuredQuery?.required_attributes || []).filter((id) => !attributes.has(String(id)));
  if (missing.length) {
    return {
      accepted: false,
      reason_code: HARD_FILTER_REASONS.REQUIRED_ATTRIBUTE_MISSING,
      attribute_ids: missing
    };
  }

  const prohibited = (structuredQuery?.excluded_attributes || []).filter((id) => attributes.has(String(id)));
  if (prohibited.length) {
    return {
      accepted: false,
      reason_code: HARD_FILTER_REASONS.EXCLUDED_ATTRIBUTE_MATCHED,
      attribute_ids: prohibited
    };
  }

  return { accepted: true, reason_code: null, attribute_ids: [] };
}

export function applyCanonicalHardFilter(structuredQuery, candidates = []) {
  const accepted = [];
  const rejected = [];
  for (const candidate of candidates) {
    const decision = evaluateCanonicalCandidate(structuredQuery, candidate);
    (decision.accepted ? accepted : rejected).push({ candidate, decision });
  }
  return { accepted: accepted.map(({ candidate }) => candidate), rejected };
}

export function maybeApplyCanonicalHardFilter(structuredQuery, candidates = [], env = {}) {
  if (!canonicalHardFilterEnabled(env)) {
    return { enabled: false, accepted: candidates, rejected: [] };
  }
  return { enabled: true, ...applyCanonicalHardFilter(structuredQuery, candidates) };
}
