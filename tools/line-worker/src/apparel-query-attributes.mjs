// Lightweight, apparel-domain-scoped attribute extraction used to (a) build
// a second-tier "organized conditions" marketplace search candidate and
// (b) score candidate products by audience/sleeve/feature/color match.
// Intentionally narrow: this is not a general structured-query system (see
// docs/HOSHILU_SEARCH_PIPELINE_VOL2_DESIGN_2026-08-05.md for that), just
// enough to fix the reproduced カットソー ranking/search-text problem
// without inventing a parallel NLU pipeline.

const AUDIENCE_PATTERNS = [
  ['レディース', /(?:レディース|女性向け|女性用|婦人|女子|women'?s?|for women|女装|女性|女生|여성용)/iu],
  ['メンズ', /(?:メンズ|男性向け|男性用|紳士|男子|men'?s?|for men|男装|男性|男生|남성용)/iu],
  ['キッズ', /(?:キッズ|子供用|子ども用|こども用|children'?s?|kids'?|kid'?s?|아동용)/iu]
];

const SLEEVE_PATTERNS = [
  ['長袖', /(?:長袖|袖長め|袖.{0,4}長め|袖が長い|long\s*sleeves?|长袖|長袖|긴팔)/iu],
  ['半袖', /(?:半袖|袖短め|袖が短い|short\s*sleeves?|短袖|短袖|반팔)/iu],
  ['袖なし', /(?:ノースリーブ|袖なし|sleeveless|无袖|無袖|민소매)/iu]
];

// A small, curated list of generic descriptive/style words commonly used in
// apparel search text. Deliberately not exhaustive - this only needs to
// cover terms common enough to matter for ranking, not every adjective.
const FEATURE_PATTERNS = [
  ['涼しい', /(?:涼しい|接触冷感|ひんやり|cool(?:ing)?|凉感|凉爽|시원한)/iu],
  ['暖かい', /(?:暖かい|温かい|あったか|warm|保暖|따뜻한)/iu],
  ['楽', /(?:楽な|楽に|着心地.{0,4}(?:良|いい|楽)|comfortable|舒适|舒適|편안한)/iu],
  ['おしゃれ', /(?:おしゃれ|オシャレ|お洒落|stylish|trendy|时尚|時尚|스타일리시)/iu],
  ['ゆったり', /(?:ゆったり|オーバーサイズ|大きめ|loose(?:\s*fit)?|oversized|宽松|寬鬆|루즈핏|오버사이즈)/iu],
  ['シンプル', /(?:シンプル|simple|minimal|简约|簡約|심플)/iu]
];

function firstMatch(patterns, text) {
  for (const [label, pattern] of patterns) {
    if (pattern.test(text)) return label;
  }
  return null;
}

export function extractApparelAudience(query) {
  return firstMatch(AUDIENCE_PATTERNS, String(query || '').normalize('NFKC'));
}

export function extractApparelSleeve(query) {
  return firstMatch(SLEEVE_PATTERNS, String(query || '').normalize('NFKC'));
}

export function extractApparelFeatures(query) {
  const text = String(query || '').normalize('NFKC');
  return FEATURE_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

// Collapses Japanese/ASCII sentence punctuation into spaces so a raw,
// punctuated query ("楽で涼しいカットソー。袖長めで色は白系。女性向け
// おしゃれ") becomes a plain space-separated search string
// ("楽で涼しいカットソー 袖長めで色は白系 女性向けおしゃれ") without
// altering the wording itself.
export function stripSentencePunctuation(query) {
  return String(query || '')
    .normalize('NFKC')
    // The ASCII period needs a digit-aware exception so decimal
    // measurements ("6.1インチ") are not split into "6" and "1".
    .replace(/[。、！？；：,;:!?]|(?<!\d)\.(?!\d)/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

// Builds the "条件整理検索" (organized-conditions) candidate: audience +
// known category label + sleeve + color + features, e.g.
// "レディース カットソー 長袖 白 涼しい おしゃれ". Returns '' when nothing
// apparel-specific was found, so callers can skip adding a useless
// duplicate candidate.
// search-intelligence.mjs's semanticSearchGroups() only exposes the
// detected color as English labels (COLOR_RULES' output terms). This maps
// them back to a Japanese label for the organized-conditions candidate,
// which targets Japanese marketplaces.
const COLOR_ENGLISH_TO_JA = {
  black: '黒', white: '白', green: '緑', blue: '青', aqua: '水色', pink: 'ピンク',
  silver: '銀', gold: 'ゴールド', brown: '茶色', yellow: '黄色', red: '赤',
  purple: '紫', orange: 'オレンジ', beige: 'ベージュ', gray: 'グレー',
  clear: '透明', transparent: '透明'
};

export function colorLabelFromEnglishTerms(terms = []) {
  for (const term of terms) {
    const label = COLOR_ENGLISH_TO_JA[String(term || '').toLowerCase()];
    if (label) return label;
  }
  return '';
}

export function buildOrganizedApparelQuery(query, { categoryLabel = '', colorLabel = '' } = {}) {
  const text = String(query || '').normalize('NFKC');
  const audience = extractApparelAudience(text);
  const sleeve = extractApparelSleeve(text);
  const features = extractApparelFeatures(text);
  const parts = [audience, categoryLabel, sleeve, colorLabel, ...features].filter(Boolean);
  return [...new Set(parts)].join(' ');
}

// A short list of noun-like content words pulled straight from the query
// (2+ char CJK runs, or 3+ char Latin words), used for the "原文語一致"
// scoring component - a coarse proxy for "does the candidate mention
// something from the user's own text" without a real tokenizer.
function contentWords(text) {
  return (String(text || '').normalize('NFKC')
    .match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{2,}|[A-Za-z][A-Za-z0-9-]{2,}/gu) || [])
    .filter((word) => !AUDIENCE_PATTERNS.some(([, pattern]) => pattern.test(word)));
}

// Apparel-domain relevance score (0-100), matching the rubric requested for
// the 2026-08-05 v3.0 instructions: category 40 / product-type 20 /
// audience 10 / color 10 / sleeve 5 / feature 5 / use-case-or-season 5 /
// raw-query-word 5. Category itself is scored by the caller (it already has
// requested/inferCandidateCategory available); this function scores the
// other seven components given the raw query text and a candidate's text.
// use-case/season has no extraction implemented yet (see
// docs/HOSHILU_SEARCH_PIPELINE_VOL2_DESIGN_2026-08-05.md) and always scores
// 0 - it is not silently counted as a match.
export function scoreApparelAttributeMatch(query, candidateText, { colorPatterns = [] } = {}) {
  const queryText = String(query || '').normalize('NFKC');
  const text = String(candidateText || '').normalize('NFKC');
  let score = 0;

  const queryAudience = extractApparelAudience(queryText);
  if (queryAudience && extractApparelAudience(text) === queryAudience) score += 10;

  if (colorPatterns.length && colorPatterns.some((pattern) => pattern.test(text))) score += 10;

  const querySleeve = extractApparelSleeve(queryText);
  if (querySleeve && extractApparelSleeve(text) === querySleeve) score += 5;

  const queryFeatures = extractApparelFeatures(queryText);
  if (queryFeatures.length && extractApparelFeatures(text).some((feature) => queryFeatures.includes(feature))) {
    score += 5;
  }

  const queryWords = contentWords(queryText);
  if (queryWords.length && queryWords.some((word) => text.includes(word))) score += 5;

  return score;
}
