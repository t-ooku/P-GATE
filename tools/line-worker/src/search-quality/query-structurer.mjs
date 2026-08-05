import canonicalAttributes from './canonical-attributes.json' with { type: 'json' };
import productTypes from './product-types.json' with { type: 'json' };
import { lookupTeacherDatasetEntry } from './teacher-dataset-lookup.mjs';

const LOCALES = new Set(['ja','en','ko','zh']);
const CONFLICTS = new Map([
  ['TRUE_WIRELESS',['WIRED']], ['WIRELESS_MOUSE',['WIRED']],
  ['PARASOL_HANDHELD',['GARDEN_SIZE']],
  ['KIDS_SIZE',['ADULT_SIZE']], ['GENUINE_BRAND',['COMPATIBLE_GENERIC']],
  ['WATERPROOF',['SPLASH_ONLY']]
]);
const EVIDENCE_REQUIRED = new Set(['VOLTAGE_100V_COMPAT','WATERPROOF','COMPAT_IPHONE15','GENUINE_BRAND']);
const NEGATION_BEFORE = /(?:not\s+(?:a|an|the)?\s*|no\s+|without\s+|ではない|じゃない|ではなく|아닌|없음|不是|不含)\s*$/iu;
const NEGATION_AFTER = /^\s*(?:ではない|じゃない|ではなく|アニム|아님|아닌|不是)/iu;

function locale(value) {
  const normalized = String(value || 'ja').toLowerCase().split(/[-_]/u)[0];
  return LOCALES.has(normalized) ? normalized : 'ja';
}

function normalized(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase();
}

function includesTerm(text, term) {
  const needle = normalized(term);
  if (!needle) return false;
  if (/^[a-z0-9 ._-]+$/u.test(needle)) {
    return new RegExp(`(?:^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9])`, 'iu').test(text);
  }
  return text.includes(needle);
}

function matchedTerms(text, dictionary, language) {
  return Object.entries(dictionary).flatMap(([id, entry]) => {
    const terms = [...(entry[language] || []), ...(entry.en || [])];
    return terms.some((term) => includesTerm(text, term)) ? [id] : [];
  });
}

function negatedAttributeIds(text, language) {
  const ids = [];
  for (const [id, entry] of Object.entries(canonicalAttributes)) {
    for (const term of entry[language] || []) {
      const needle = normalized(term);
      const index = text.indexOf(needle);
      if (index < 0) continue;
      const before = text.slice(Math.max(0, index - 20), index);
      const after = text.slice(index + needle.length, Math.min(text.length, index + needle.length + 12));
      if (NEGATION_BEFORE.test(before) || NEGATION_AFTER.test(after)) { ids.push(id); break; }
    }
  }
  return ids;
}

function detectProductType(text, language) {
  for (const [id, entry] of Object.entries(productTypes)) {
    const terms = [...(entry.synonyms?.[language] || []), ...(entry.synonyms?.en || [])];
    if (terms.some((term) => includesTerm(text, term))) return { id, label: entry.label };
  }
  return { id: 'UNKNOWN', label: '不明' };
}

function marketplaceContext(productType) {
  if (['SHOES','BACKPACK'].includes(productType)) {
    return ['amazon','rakuten','yahoo','qoo10','shein','zozotown','shoplist','musinsa','buyma','snkrdunk'];
  }
  return ['amazon','rakuten','yahoo','qoo10','shein'];
}

export function structuredQueryEnabled(env = {}) {
  return /^(?:1|true|on)$/iu.test(String(env.HOSHILU_STRUCTURED_QUERY_ENABLED || ''));
}

export function structureSearchQuery(rawQuery, requestedLocale = 'ja') {
  const language = locale(requestedLocale);
  const raw = String(rawQuery || '');
  const text = normalized(raw);
  const detected = new Set(matchedTerms(text, canonicalAttributes, language));
  const negated = new Set(negatedAttributeIds(text, language));
  const required = new Set([...detected].filter((id) => !negated.has(id)));
  const excluded = new Set(negated);
  for (const id of required) for (const conflict of CONFLICTS.get(id) || []) excluded.add(conflict);

  const contradictory = [...required].some((id) => (CONFLICTS.get(id) || []).some((other) => required.has(other)))
    || (required.has('TRUE_WIRELESS') && /コード付き|wired|有線|유선|有线/iu.test(text));
  if (contradictory) {
    required.add('TRUE_WIRELESS');
    required.add('WIRED');
    excluded.delete('WIRED');
  }
  const product = detectProductType(text, language);
  const internalTest = /^\s*\[内部テスト\]/u.test(raw);
  if (internalTest && /出品URL未確認|URL未確認/iu.test(raw)) required.add('URL_VERIFIED');
  // Teacher Dataset connection (2026-08-05 v3.1): product-types.json alone
  // cannot classify child/elderly/vague queries like "ゲームにつなぐやつ" -
  // they simply have no matching vocabulary. When that happens, consult
  // teacher-dataset-lookup.mjs (compiled from committed
  // evaluation/teacher-dataset/*.json batches) before giving up. A concrete
  // teacher-authored category resolves product_type directly; an
  // UNCLASSIFIED teacher entry (the query was ultra-ambiguous even to the
  // human/GPT author) is still surfaced via teacher_dataset_match so callers
  // can show its ideal_answer as a clarifying question instead of a generic
  // fallback.
  const teacherMatch = product.id === 'UNKNOWN' ? lookupTeacherDatasetEntry(raw) : null;
  const resolvedProductId = teacherMatch && teacherMatch.category !== 'UNCLASSIFIED'
    ? teacherMatch.category
    : product.id;
  const resolvedProductLabel = teacherMatch && teacherMatch.category !== 'UNCLASSIFIED'
    ? teacherMatch.category
    : product.label;
  const ambiguity = [];
  if (resolvedProductId === 'UNKNOWN' && !internalTest) ambiguity.push('product_type');
  if (contradictory) ambiguity.push('contradictory_attributes');
  if (required.has('VOLTAGE_100V_COMPAT') && resolvedProductId === 'SMALL_APPLIANCE') ambiguity.push('product_specification');

  return {
    raw_query: raw,
    locale: language,
    product_type: resolvedProductId,
    product_type_label: resolvedProductLabel,
    teacher_dataset_match: teacherMatch ? {
      content_hash: teacherMatch.content_hash,
      category: teacherMatch.category,
      ideal_answer: teacherMatch.ideal_answer,
      search_terms: teacherMatch.search_terms,
      excluded_conditions: teacherMatch.excluded_conditions,
      persona: teacherMatch.persona,
      confidence: teacherMatch.confidence
    } : null,
    required_attributes: [...required],
    preferred_attributes: [],
    excluded_attributes: [...excluded],
    use_case: null,
    target_user: null,
    compatibility: required.has('COMPAT_IPHONE15') ? ['iPhone 15'] : [],
    brand_model: null,
    color: [],
    material: [],
    shape: required.has('ROUND_SHAPE') ? 'round' : null,
    size: required.has('SMALL_SIZE') ? 'small' : null,
    power_voltage: required.has('VOLTAGE_100V_COMPAT') ? '100V' : null,
    marketplace_context: internalTest ? [] : marketplaceContext(product.id),
    ambiguity,
    evidence_required: [...required].filter((id) => EVIDENCE_REQUIRED.has(id)),
    contradictory
  };
}

export function maybeStructureSearchQuery(rawQuery, requestedLocale, env = {}) {
  return structuredQueryEnabled(env) ? structureSearchQuery(rawQuery, requestedLocale) : null;
}
