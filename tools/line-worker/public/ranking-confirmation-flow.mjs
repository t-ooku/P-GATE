function normalizeOptions(options = []) {
  const seen = new Set();
  return (Array.isArray(options) ? options : []).filter((option) => {
    const key = String(option?.genre_id || option?.value || '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

export function createRankingConfirmationFlow(options = [], rejectionCount = 0) {
  return {
    options: normalizeOptions(options),
    index: 0,
    rejectionCount: Math.max(0, Math.min(2, Number(rejectionCount) || 0))
  };
}

export function currentRankingCategoryProposal(flow = {}) {
  return Array.isArray(flow.options) ? flow.options[Number(flow.index) || 0] || null : null;
}

export function rejectRankingCategoryProposal(flow = {}) {
  const rejectionCount = Math.max(0, Number(flow.rejectionCount) || 0) + 1;
  if (rejectionCount >= 3) return {
    flow: { ...flow, rejectionCount }, action: 'return_to_search', proposal: null
  };
  const index = Math.max(0, Number(flow.index) || 0) + 1;
  if (!Array.isArray(flow.options) || !flow.options[index]) return {
    flow: { ...flow, index, rejectionCount }, action: 'needs_refinement', proposal: null
  };
  const next = { ...flow, index, rejectionCount };
  return { flow: next, action: 'show_next', proposal: currentRankingCategoryProposal(next) };
}
