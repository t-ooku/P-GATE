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
  ['長袖', /(?:長袖|袖長め|袖.{0,4}長め|袖が長い|七分袖|九分袖|long\s*sleeves?|长袖|長袖|긴팔)/iu],
  ['半袖', /(?:半袖|袖短め|袖が短い|short\s*sleeves?|短袖|短袖|반팔)/iu],
  ['袖なし', /(?:ノースリーブ|袖なし|sleeveless|无袖|無袖|민소매)/iu]
];

// "用途" (use-case, scored separately from 特徴/style below per the
// 2026-08-05 v4.0 rubric): climate/season-oriented purpose words.
const USE_CASE_PATTERNS = [
  ['涼しい', /(?:涼しい|涼感|接触冷感|ひんやり|通気性|薄手|cool(?:ing)?|breathable|凉感|凉爽|透气|시원한|통기성)/iu],
  ['暖かい', /(?:暖かい|温かい|あったか|防寒|保温|warm|insulated|保暖|따뜻한|보온)/iu]
];

// "特徴" (style/fit descriptors): a small, curated, non-exhaustive list of
// generic descriptive words commonly used in apparel search text.
const FEATURE_PATTERNS = [
  ['楽', /(?:楽な|楽に|着心地.{0,4}(?:良|いい|楽)|comfortable|舒适|舒適|편안한)/iu],
  ['おしゃれ', /(?:おしゃれ|オシャレ|お洒落|stylish|trendy|时尚|時尚|스타일리시)/iu],
  ['ゆったり', /(?:ゆったり|オーバーサイズ|大きめ|loose(?:\s*fit)?|oversized|宽松|寬鬆|루즈핏|오버사이즈)/iu],
  ['シンプル', /(?:シンプル|simple|minimal|简约|簡約|심플)/iu]
];

// "商品種別" (specific product-type noun, more granular than the
// RULES-table category the caller already scores separately). A candidate
// must name the same specific garment as the query, not merely fall in the
// same broad category (e.g. a シャツ should not score a 商品種別一致 for a
// カットソー query even though both are 'tops').
const PRODUCT_TYPE_PATTERNS = [
  ['カットソー', /(?:カットソー|cut[- ]?(?:and[- ]?)?sewn?|cutsew)/iu],
  ['トップス', /(?:トップス|\btops?\b|上衣|상의)/iu],
  ['Tシャツ', /(?:tシャツ|t[- ]?shirts?|t恤|티셔츠)/iu],
  ['ブラウス', /(?:ブラウス|blouse|衬衫|블라우스)/iu],
  ['シャツ', /(?:シャツ(?!ケース)|\bshirts?\b|衬衫|襯衫|셔츠)/iu],
  ['ニット', /(?:ニット|knit(?:wear)?|针织|針織|니트)/iu],
  ['カーディガン', /(?:カーディガン|cardigan|开衫|開衫|카디건)/iu],
  ['パーカー', /(?:パーカー|hoodie|连帽衫|連帽衫|후드)/iu],
  ['ワンピース', /(?:ワンピース|dress|连衣裙|連衣裙|원피스)/iu],
  ['スカート', /(?:スカート|skirts?|裙子|스커트|치마)/iu],
  ['パンツ', /(?:パンツ|デニム|ジーンズ|pants|jeans|trousers?|裤子|褲子|바지|청바지)/iu],
  ['バッグ', /(?:バッグ|かばん|鞄|トート|ショルダーバッグ|handbag|tote|bag|包|가방)/iu],
  ['スニーカー', /(?:スニーカー|sneakers?|运动鞋|運動鞋|스니커즈)/iu]
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

export function extractApparelUseCase(query) {
  const text = String(query || '').normalize('NFKC');
  return USE_CASE_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

export function extractApparelProductType(query) {
  return firstMatch(PRODUCT_TYPE_PATTERNS, String(query || '').normalize('NFKC'));
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
  const useCases = extractApparelUseCase(text);
  const features = extractApparelFeatures(text);
  const parts = [audience, categoryLabel, sleeve, colorLabel, ...useCases, ...features].filter(Boolean);
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

// Apparel-domain relevance score (2026-08-05 v4.0 rubric, 100 points total):
// category 40 (scored by the caller, which already has requested/
// inferCandidateCategory available) + product-type 20 + audience 10 +
// color 10 + use-case 10 + feature 5 + raw-query-word 5 = 60 here.
// Returns a breakdown object (not just a number) so callers/logs can show
// the score composition (袖丈/sleeve is extracted for the organized-query
// candidate but is not part of the v4.0 scoring rubric, so it is not
// included here).
export function scoreApparelAttributeMatch(query, candidateText, { colorPatterns = [] } = {}) {
  const queryText = String(query || '').normalize('NFKC');
  const text = String(candidateText || '').normalize('NFKC');
  const breakdown = { product_type: 0, audience: 0, color: 0, use_case: 0, feature: 0, raw_text: 0 };

  const queryProductType = extractApparelProductType(queryText);
  if (queryProductType && extractApparelProductType(text) === queryProductType) breakdown.product_type = 20;

  const queryAudience = extractApparelAudience(queryText);
  if (queryAudience && extractApparelAudience(text) === queryAudience) breakdown.audience = 10;

  if (colorPatterns.length && colorPatterns.some((pattern) => pattern.test(text))) breakdown.color = 10;

  const queryUseCases = extractApparelUseCase(queryText);
  if (queryUseCases.length && extractApparelUseCase(text).some((useCase) => queryUseCases.includes(useCase))) {
    breakdown.use_case = 10;
  }

  const queryFeatures = extractApparelFeatures(queryText);
  if (queryFeatures.length && extractApparelFeatures(text).some((feature) => queryFeatures.includes(feature))) {
    breakdown.feature = 5;
  }

  const queryWords = contentWords(queryText);
  if (queryWords.length && queryWords.some((word) => text.includes(word))) breakdown.raw_text = 5;

  const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  return { total, breakdown };
}
