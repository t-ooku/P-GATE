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

// "丈"(着丈・スカート丈などの長さ)。2026-08-08報告: 「夏用、丈長め、
// おしゃれ、ブラウス」のうち「丈長め」がどのモールの検索語にも一切現れて
// いなかった - このリポジトリのどこにも「丈」の長さを表すパターンが存在
// していなかったため。
const LENGTH_PATTERNS = [
  ['ロング丈', /(?:丈\s*長め|ロング丈|マキシ丈|くるぶし丈|ロングスカート|ロングワンピース|long\s*length|maxi[- ]?length|长款|長款|롱\s*기장)/iu],
  ['ショート丈', /(?:丈\s*短め|ショート丈|ミニ丈|ミニスカート|クロップド丈|クロップド|short\s*length|mini[- ]?length|cropped|短款|크롭\s*기장|미니\s*기장)/iu],
  ['ミモレ丈', /(?:ミモレ丈|ミディ丈|midi[- ]?length|중기장)/iu]
];

// "用途" (use-case, scored separately from 特徴/style below per the
// 2026-08-05 v4.0 rubric): climate/season-oriented purpose words.
//
// 2026-08-07: "夏用"/"冬用" added. A season word is the most common way a
// user states this purpose, and it was not matched at all - only indirect
// wordings like "涼しい" were.
const USE_CASE_PATTERNS = [
  ['涼しい', /(?:涼しい|涼感|接触冷感|ひんやり|通気性|薄手|夏用|夏物|春夏|夏|cool(?:ing)?|breathable|summer|凉感|凉爽|透气|夏季|시원한|통기성|여름)/iu],
  ['暖かい', /(?:暖かい|温かい|あったか|防寒|保温|厚手|冬用|冬物|秋冬|冬|warm|insulated|winter|保暖|冬季|따뜻한|보온|겨울)/iu]
];

// TPO (2026-08-07). Reported: searching 「夏用、丈長め、おしゃれ、ブラウス」
// put business blouses first and pushed casual ones to 6th and below. The
// rubric had no axis for this at all - nothing separated a recruit-suit
// blouse from a weekend one - so a business listing that matched product
// type and audience simply outscored the casual listing the user wanted.
//
// Unlike the other axes this one is scored as a MISMATCH rather than a
// match. Most casual clothing does not announce itself as casual, so
// rewarding the word "カジュアル" would favour listings that happen to use
// it. What is reliable is the opposite: business wear does say so
// (リクルート, 就活, 事務服, 制服), because that is its selling point. So a
// query asking for casual is protected by pushing the explicitly-business
// listings down, not by lifting the ones that self-describe as casual.
const TPO_BUSINESS = /(?:ビジネス|オフィス|通勤|就活|リクルート|事務服|制服|スーツ|フォーマル|礼装|冠婚葬祭|business|formal|office\s*wear|recruit|商务|商務|正装|정장|비즈니스)/iu;
const TPO_CASUAL = /(?:カジュアル|普段着|私服|デイリー|休日|タウン|おしゃれ|オシャレ|お洒落|デート|遊び|casual|everyday|street|休闲|休閒|캐주얼|데일리)/iu;

export function apparelTpo(text) {
  const value = String(text || '').normalize('NFKC');
  const business = TPO_BUSINESS.test(value);
  const casual = TPO_CASUAL.test(value);
  // Both present means the listing covers either occasion; that is not a
  // conflict with anything, so it is treated as unspecified.
  if (business === casual) return null;
  return business ? 'business' : 'casual';
}

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

export function extractApparelLength(query) {
  return firstMatch(LENGTH_PATTERNS, String(query || '').normalize('NFKC'));
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
  charcoal: 'チャコール', ivory: 'アイボリー', cream: 'クリーム色',
  'light blue': 'ライトブルー', turquoise: 'ターコイズ', 'dark green': 'ダークグリーン',
  mint: 'ミント', olive: 'オリーブ', mustard: 'マスタード', wine: 'ワイン',
  coral: 'コーラル', lavender: 'ラベンダー', clear: '透明', transparent: '透明'
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
  const breakdown = { product_type: 0, audience: 0, color: 0, use_case: 0, feature: 0, raw_text: 0, tpo_mismatch: 0 };

  // Only fires when the query states an occasion AND the candidate states the
  // opposite one. Silence on either side is not a conflict, so ordinary
  // listings are untouched - this can only push down items that actively
  // advertise the occasion the user did not ask for.
  const queryTpo = apparelTpo(queryText);
  const candidateTpo = apparelTpo(text);
  if (queryTpo && candidateTpo && queryTpo !== candidateTpo) breakdown.tpo_mismatch = -20;

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

/**
 * Put the specific garment noun back into a built keyword string.
 *
 * GENERIC_PRODUCTS in marketplace-search-keywords-v2.mjs only knows broad
 * category nouns, so "ブラウス" collapses to "トップス" and "カットソー"
 * disappears entirely - the user's most specific word, the one that actually
 * narrows the search, is the one that gets dropped. Reported 2026-08-07:
 * searching 「夏用、丈長め、おしゃれ、ブラウス」 reached SHEIN as 「白 トップス」.
 *
 * This lived as a private helper in index.mjs and was only applied to the
 * Amazon and Rakuten keyword builders, which is why those two kept "ブラウス"
 * while SHEIN, Qoo10 and the five apparel malls lost it. It belongs next to
 * extractApparelProductType so every caller can reach it.
 */
// 広いカテゴリ語。具体的な衣類名が取れているとき、これらは絞り込みの役に
// 立たないどころか、モール側では余計な語として効いて結果を薄める。
// index.mjs の categoryJapaneseLabels 補完(RULES由来のカテゴリ語)が同じ
// 広いカテゴリ語を後から積み直してしまう問題(2026-08-08 Amazon再発報告)
// を防ぐため export する。
export const BROAD_APPAREL_CATEGORIES = ['トップス', 'ボトムス', 'アウター', 'インナー', 'ウェア', '服', '衣類'];

export function ensureApparelProductTypeTerm(query, keywords) {
  const productType = extractApparelProductType(query);
  const text = String(keywords || '').trim();
  if (!productType) return text;
  // 具体語が取れたら、辞書が補った広いカテゴリ語を落とす。
  // 2026-08-07 報告: 「ブラウス」を戻したあとも「トップス」が残り、モールへ
  // 「ブラウス トップス」として届いていた。ユーザーはブラウスを探しているの
  // であって、トップス全般を探しているわけではない。
  //
  // ただし落とすのは辞書が足した分だけで、ユーザー自身が「カットソー
  // トップス」と両方打った場合は両方残す。打った語を消すのは、辞書が語を
  // 足しすぎるのと同じくらい検索結果を歪める。
  const original = String(query || '').normalize('NFKC');
  const kept = text.split(/\s+/u)
    .filter(Boolean)
    .filter((word) => word === productType
      || !BROAD_APPAREL_CATEGORIES.includes(word)
      || original.includes(word));
  // 部分文字列で判定する。「楽で涼しいカットソー」のように長い語句の一部と
  // して既に入っている場合に前置すると、同じ語が二重に並ぶ。
  const result = kept.join(' ');
  if (result.includes(productType)) return result;
  return result ? `${productType} ${result}` : productType;
}

/**
 * Put back the descriptive qualifier words (season/use-case, style/fit
 * feature, hem length) that GENERIC_ATTRIBUTES in
 * marketplace-search-keywords-v2.mjs never knew about in the first place -
 * that dictionary is shared across every product category (electronics,
 * kitchen, etc.) and only recognizes colors, a handful of generic
 * attributes, and category-specific use-case words for OTHER categories
 * (通勤/アウトドア/浴室用/キッチン用). It has no season, style, or hem-length
 * vocabulary for apparel at all.
 *
 * Reported 2026-08-08: searching 「ブラウス 夏用 丈長め おしゃれ」 reached
 * every non-Amazon mall as just 「ブラウス」 - not merely missing the
 * product noun (that was 2026-08-07's ensureApparelProductTypeTerm fix),
 * but silently dropping every qualifying word that would have actually
 * narrowed the search. Unlike ensureApparelProductTypeTerm this only fires
 * when an apparel product type is present at all, so it never injects
 * apparel vocabulary into an unrelated (electronics/kitchen/etc.) query.
 */
// Only appends a label when neither the label text itself NOR the pattern
// that produced it already appears in `text`. Without the pattern check, a
// query like 「丈長めで色は白系」 whose cleaned text is passed through
// unchanged would get "ロング丈" appended even though "丈長め" already says
// the same thing in different words - a redundant, not missing, qualifier.
function missingQualifierLabels(patterns, original, text) {
  return patterns
    .filter(([, pattern]) => pattern.test(original))
    .map(([label]) => label)
    .filter((label, index, values) => values.indexOf(label) === index)
    .filter((label) => !text.includes(label))
    .filter((label) => !patterns.some(([patternLabel, pattern]) => patternLabel === label && pattern.test(text)));
}

export function ensureApparelQualifierTerms(query, keywords) {
  const text = String(keywords || '').trim();
  const productType = extractApparelProductType(query);
  if (!productType) return text;
  const original = String(query || '').normalize('NFKC');
  const missing = [
    ...missingQualifierLabels(USE_CASE_PATTERNS, original, text),
    ...missingQualifierLabels(FEATURE_PATTERNS, original, text),
    ...missingQualifierLabels(LENGTH_PATTERNS, original, text),
    ...missingQualifierLabels(SLEEVE_PATTERNS, original, text)
  ];
  if (!missing.length) return text;
  return [text, ...missing].filter(Boolean).join(' ');
}
