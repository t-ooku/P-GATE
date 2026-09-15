const TRUE = /^(?:1|true|on)$/iu;

export function twoStageRankingEnabled(env = {}) {
  return TRUE.test(String(env.HOSHILU_TWO_STAGE_RANKING_ENABLED || ''));
}

function set(value) {
  return new Set((Array.isArray(value) ? value : []).map(String));
}

export function relevanceScore(structuredQuery, candidate) {
  const attributes = set(candidate?.detected_attributes);
  const preferred = structuredQuery?.preferred_attributes || [];
  const preferredMatches = preferred.filter((id) => attributes.has(String(id))).length;
  const evidence = Object.values(candidate?.attribute_evidence || {});
  const confirmed = evidence.filter((item) => item?.confirmed === true || item?.confidence === 'confirmed').length;
  const inferred = evidence.filter((item) => item?.confidence === 'inferred').length;
  const reviewSignal = Number.isFinite(candidate?.review_rating) ? Math.max(0, Math.min(5, candidate.review_rating)) / 5 : 0;
  return preferredMatches * 20 + confirmed * 4 + inferred + reviewSignal;
}

export function rankByRelevance(structuredQuery, acceptedCandidates = []) {
  return acceptedCandidates
    .filter((candidate) => candidate?.hard_filter_passed === true)
    .map((candidate, input_index) => ({ ...candidate, relevance_score: relevanceScore(structuredQuery, candidate), input_index }))
    .sort((a, b) => b.relevance_score - a.relevance_score || a.input_index - b.input_index);
}

export function applyCommercialRanking(relevanceRankedCandidates = []) {
  if (relevanceRankedCandidates.some((candidate) => candidate?.hard_filter_passed !== true || !Number.isFinite(candidate?.relevance_score))) {
    throw new TypeError('Commercial ranking accepts only hard-filtered relevance-ranked candidates');
  }
  return relevanceRankedCandidates.slice().sort((a, b) => {
    if (b.relevance_score !== a.relevance_score) return b.relevance_score - a.relevance_score;
    const aCommercial = a.commercial?.contracted === true ? 1 : 0;
    const bCommercial = b.commercial?.contracted === true ? 1 : 0;
    if (aCommercial !== bCommercial) return bCommercial - aCommercial;
    return (a.input_index ?? 0) - (b.input_index ?? 0);
  });
}

export function rankTwoStage(structuredQuery, acceptedCandidates = []) {
  const relevance = rankByRelevance(structuredQuery, acceptedCandidates);
  return { relevance, commercial: applyCommercialRanking(relevance) };
}

export function maybeRankTwoStage(structuredQuery, acceptedCandidates = [], env = {}) {
  if (!twoStageRankingEnabled(env)) return { enabled: false, relevance: acceptedCandidates, commercial: acceptedCandidates };
  return { enabled: true, ...rankTwoStage(structuredQuery, acceptedCandidates) };
}
