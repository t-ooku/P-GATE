const TRUE = /^(?:1|true|on)$/iu;

export function keywordExpansionEnabled(env = {}) {
  return TRUE.test(String(env.HOSHILU_KEYWORD_EXPANSION_ENABLED || ''));
}

function normalize(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

export function buildKeywordExpansionPrompt({ category, batchSize = 10, examples = [], canonicalExcerpt = {} }) {
  const safeSize = Math.max(1, Math.min(20, Number(batchSize) || 10));
  return [
    'あなたはECサイトの検索クエリ設計者です。',
    `カテゴリ「${String(category || '').slice(0, 80)}」について、未収録の曖昧な検索文を${safeSize}件生成してください。`,
    '各keywordsは2〜4件。ブランド名を決め打ちせず、JSON配列のみ返してください。',
    `既存例: ${JSON.stringify(examples.slice(0, 10))}`,
    `属性辞書: ${JSON.stringify(canonicalExcerpt)}`
  ].join('\n');
}

export function validateGeneratedKeywordEntry(entry) {
  const errors = [];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return ['entry_not_object'];
  if (!String(entry.category || '').trim() || String(entry.category).length > 80) errors.push('invalid_category');
  if (!String(entry.query || '').trim() || String(entry.query).length > 200) errors.push('invalid_query');
  if (!Array.isArray(entry.keywords) || entry.keywords.length < 2 || entry.keywords.length > 4) errors.push('invalid_keywords');
  else if (entry.keywords.some((item) => !String(item || '').trim() || String(item).length > 100)) errors.push('invalid_keyword_value');
  if (entry.url || entry.product_url || entry.brand) errors.push('forbidden_commercial_field');
  return errors;
}

export function findNearDuplicate(query, existingQueries = []) {
  const candidate = normalize(query);
  if (!candidate) return null;
  return existingQueries.find((item) => {
    const known = normalize(item);
    return known === candidate || (known.length >= 8 && candidate.length >= 8 && (known.includes(candidate) || candidate.includes(known)));
  }) || null;
}

export function deterministicSample(entries, batchNumber) {
  const rate = Number(batchNumber) <= 3 ? 1 : 0.2;
  const count = Math.max(1, Math.ceil(entries.length * rate));
  return entries.filter((_, index) => index % Math.max(1, Math.floor(entries.length / count)) === 0).slice(0, count);
}

export function evaluateStagingBatch({ entries = [], existingQueries = [], batchNumber = 1, machineReview = () => true, claudeReview = null }) {
  const sample = deterministicSample(entries, batchNumber);
  const results = sample.map((entry) => ({
    entry,
    schema_ok: validateGeneratedKeywordEntry(entry).length === 0,
    duplicate: Boolean(findNearDuplicate(entry?.query, existingQueries)),
    direction_ok: machineReview(entry) === true,
    naturalness_review: claudeReview?.(entry) ?? 'PENDING_CLAUDE_REVIEW'
  }));
  const passed = results.filter((item) => item.schema_ok && !item.duplicate && item.direction_ok && item.naturalness_review === true).length;
  const passRate = results.length ? passed / results.length : null;
  return {
    sample_rate: Number(batchNumber) <= 3 ? 1 : 0.2,
    sampled: results.length,
    pass_rate: passRate,
    approved: passRate !== null && passRate >= 0.9,
    status: claudeReview ? (passRate >= 0.9 ? 'APPROVED' : 'REJECTED') : 'PENDING_CLAUDE_REVIEW',
    results
  };
}

export function createStagingBatch(input, env = {}) {
  if (!keywordExpansionEnabled(env)) return { enabled: false, status: 'DISABLED', entries: [] };
  return { enabled: true, status: 'STAGED', entries: input?.entries || [], created_at: input?.created_at || null };
}
