import compiled from './teacher-dataset-rules.generated.json' with { type: 'json' };

// Read-only lookup over the compiled teacher-dataset artifact (see
// scripts/compile-teacher-dataset-rules.mjs). This is the one place the live
// search pipeline (query-structurer.mjs, knowledge-search.mjs, marketplace
// keyword builders in index.mjs) reads teacher-authored data from - each of
// those call sites stays a thin, additive consumer of this lookup rather
// than reimplementing normalization/matching independently.

function normalizedQuery(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s。、,.!?！？「」『』]+/gu, '');
}

const byNormalizedQuery = new Map(
  (compiled.entries || []).map((entry) => [normalizedQuery(entry.query_text), entry])
);

export function lookupTeacherDatasetEntry(query) {
  return byNormalizedQuery.get(normalizedQuery(query)) || null;
}

export function teacherDatasetStats() {
  return {
    generatedAt: compiled.generated_at,
    entryCount: compiled.entry_count || 0,
    sourceBatches: compiled.source_batches || []
  };
}
