import rules from './body-accessory-rules.json' with { type: 'json' };

const TRUE = /^(?:1|true|on)$/iu;

function normalize(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase();
}

function termsForLocale(locale) {
  const language = String(locale || 'ja').toLowerCase().split(/[-_]/u)[0];
  return [...(rules.accessory_terms[language] || []), ...(language === 'en' ? [] : rules.accessory_terms.en)];
}

export function accessoryClassifierEnabled(env = {}) {
  return TRUE.test(String(env.HOSHILU_ACCESSORY_CLASSIFIER_ENABLED || ''));
}

export function classifyBodyAccessory(candidate, locale = 'ja') {
  if (typeof candidate?.is_accessory === 'boolean') {
    return { classification: candidate.is_accessory ? 'ACCESSORY' : 'BODY', confidence: 1, evidence: ['structured:is_accessory'] };
  }
  const text = normalize([candidate?.title, candidate?.description, candidate?.category].filter(Boolean).join(' '));
  const accessoryEvidence = termsForLocale(locale).filter((term) => text.includes(normalize(term)));
  const bodyEvidence = (rules.body_terms[candidate?.product_type] || []).filter((term) => text.includes(normalize(term)));
  if (accessoryEvidence.length && !bodyEvidence.length) {
    return { classification: 'ACCESSORY', confidence: 0.95, evidence: accessoryEvidence };
  }
  if (bodyEvidence.length) {
    return { classification: 'BODY', confidence: accessoryEvidence.length ? 0.8 : 0.95, evidence: bodyEvidence };
  }
  return { classification: 'UNKNOWN', confidence: 0, evidence: [] };
}

export function filterAccessoryOnlyCandidates(structuredQuery, candidates = [], locale = 'ja') {
  const bodyRequested = !structuredQuery?.required_attributes?.includes('ACCESSORY');
  if (!bodyRequested) return { accepted: candidates, rejected: [] };
  const accepted = [];
  const rejected = [];
  for (const candidate of candidates) {
    const classification = classifyBodyAccessory(candidate, locale);
    if (classification.classification === 'ACCESSORY') {
      rejected.push({ candidate, decision: { accepted: false, reason_code: 'ACCESSORY_ONLY', ...classification } });
    } else {
      accepted.push(candidate);
    }
  }
  return { accepted, rejected };
}

export function maybeFilterAccessoryOnlyCandidates(structuredQuery, candidates = [], locale = 'ja', env = {}) {
  if (!accessoryClassifierEnabled(env)) return { enabled: false, accepted: candidates, rejected: [] };
  return { enabled: true, ...filterAccessoryOnlyCandidates(structuredQuery, candidates, locale) };
}
