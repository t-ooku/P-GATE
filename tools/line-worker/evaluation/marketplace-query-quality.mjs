const SUPPORTED_LOCALES = ["ja", "en", "zh", "ko"];

const PRODUCTS = [
  { id: "earphones", expected: "イヤホン", ja: "イヤホン", en: "earbuds", zh: "耳机", ko: "이어폰" },
  { id: "humidifier", expected: "加湿器", ja: "加湿器", en: "humidifier", zh: "加湿机", ko: "가습기" },
  { id: "sunscreen", expected: "日焼け止め", ja: "日焼け止め", en: "sunscreen", zh: "防晒", ko: "선크림" },
  { id: "serum", expected: "美容液", ja: "美容液", en: "serum", zh: "精华液", ko: "세럼" },
  { id: "sheet_mask", expected: "シートマスク", ja: "シートマスク", en: "sheet mask", zh: "面膜", ko: "마스크팩" },
  { id: "wallet", expected: "財布", ja: "財布", en: "wallet", zh: "钱包", ko: "지갑" },
  { id: "laptop", expected: "ノートパソコン", ja: "ノートパソコン", en: "laptop", zh: "笔记本电脑", ko: "노트북" },
  { id: "necklace", expected: "ネックレス", ja: "ネックレス", en: "necklace", zh: "项链", ko: "목걸이" },
];

const ATTRIBUTES = [
  { id: "clear", expected: "透明", ja: "透明な", en: "clear", zh: "透明", ko: "투명" },
  { id: "black", expected: "黒", ja: "黒い", en: "black", zh: "黑色", ko: "검정" },
  { id: "white", expected: "白", ja: "白い", en: "white", zh: "白色", ko: "흰색" },
  { id: "small", expected: "小型", ja: "小型の", en: "compact", zh: "小巧", ko: "소형" },
  { id: "lightweight", expected: "軽量", ja: "軽量の", en: "lightweight", zh: "轻量", ko: "경량" },
];

const CONTEXTS = {
  ja: [
    (phrase) => phrase,
    (phrase) => `TikTokで見た${phrase}が欲しい`,
    (phrase) => `韓国で買った${phrase}を探したい`,
    (phrase) => `商品名が分からない ${phrase}`,
  ],
  en: [
    (phrase) => phrase,
    (phrase) => `looking for ${phrase}`,
    (phrase) => `I saw this on Instagram ${phrase}`,
    (phrase) => `I want ${phrase}`,
  ],
  zh: [
    (phrase) => phrase,
    (phrase) => `想找 ${phrase}`,
    (phrase) => `在SNS看到的 ${phrase}`,
    (phrase) => `不知道商品名 ${phrase}`,
  ],
  ko: [
    (phrase) => phrase,
    (phrase) => `SNS에서 본 ${phrase}`,
    (phrase) => `한국에서 본 ${phrase}`,
    (phrase) => `상품명은 모르지만 ${phrase}`,
  ],
};

export function buildMarketplaceQueryCorpus() {
  const cases = [];
  for (const locale of SUPPORTED_LOCALES) {
    for (const product of PRODUCTS) {
      for (const attribute of ATTRIBUTES) {
        const phrase = `${attribute[locale]} ${product[locale]}`;
        CONTEXTS[locale].forEach((wrap, contextIndex) => {
          cases.push({
            case_id: `${locale}-${product.id}-${attribute.id}-${contextIndex + 1}`,
            locale,
            category: product.id,
            input: wrap(phrase),
            required_tokens: [product.expected, attribute.expected],
            forbidden_tokens: [],
            max_length: 48,
          });
        });
      }
    }
  }
  return cases;
}

export const MARKETPLACE_QUERY_NEGATIVE_CASES = [
  {
    case_id: "ja-wired-earphones",
    locale: "ja",
    category: "earphones",
    input: "コード付きの黒い有線イヤホン",
    required_tokens: ["黒", "イヤホン"],
    forbidden_tokens: ["ワイヤレス", "完全ワイヤレス"],
    max_length: 48,
  },
  {
    case_id: "ja-iphone-charger-not-case",
    locale: "ja",
    category: "charger",
    input: "iPhone 15用のUSB-C充電器",
    required_tokens: ["iPhone 15", "充電器", "USB-C"],
    forbidden_tokens: ["ケース"],
    max_length: 48,
  },
  {
    case_id: "en-wired-earbuds",
    locale: "en",
    category: "earphones",
    input: "black wired earbuds with a cable",
    required_tokens: ["黒", "イヤホン"],
    forbidden_tokens: ["ワイヤレス", "完全ワイヤレス"],
    max_length: 48,
  },
  {
    case_id: "ja-unknown-context-compaction",
    locale: "ja",
    category: "unknown",
    input: "TikTokで見た机の下につける白い引き出しが欲しい",
    required_tokens: ["机の下につける白い引き出し"],
    forbidden_tokens: ["TikTok", "欲しい"],
    max_length: 48,
  },
];

function includesToken(output, token) {
  return output.toLocaleLowerCase().includes(String(token).toLocaleLowerCase());
}

export function scoreMarketplaceQueryCase(testCase, output) {
  const normalized = String(output || "").normalize("NFKC").trim();
  const missingRequired = testCase.required_tokens.filter(
    (token) => !includesToken(normalized, token),
  );
  const leakedForbidden = testCase.forbidden_tokens.filter(
    (token) => includesToken(normalized, token),
  );
  return {
    case_id: testCase.case_id,
    locale: testCase.locale,
    category: testCase.category,
    output: normalized,
    empty: normalized.length === 0,
    overlong: normalized.length > (testCase.max_length || 80),
    missing_required: missingRequired,
    leaked_forbidden: leakedForbidden,
    passed:
      normalized.length > 0
      && normalized.length <= (testCase.max_length || 80)
      && missingRequired.length === 0
      && leakedForbidden.length === 0,
  };
}

function summarize(scores) {
  const count = scores.length;
  const ratio = (predicate) =>
    count ? scores.filter(predicate).length / count : 0;
  return {
    cases: count,
    pass_rate: ratio((score) => score.passed),
    empty_rate: ratio((score) => score.empty),
    overlong_rate: ratio((score) => score.overlong),
    required_token_violation_rate: ratio(
      (score) => score.missing_required.length > 0,
    ),
    forbidden_token_leak_rate: ratio(
      (score) => score.leaked_forbidden.length > 0,
    ),
  };
}

function breakdown(scores, key) {
  const groups = new Map();
  for (const score of scores) {
    const value = score[key];
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(score);
  }
  return Object.fromEntries(
    [...groups.entries()].map(([value, group]) => [value, summarize(group)]),
  );
}

export function evaluateMarketplaceQueryCorpus(cases, transform) {
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error("marketplace query corpus is required");
  }
  if (typeof transform !== "function") {
    throw new Error("transform function is required");
  }
  const scores = cases.map((testCase) =>
    scoreMarketplaceQueryCase(testCase, transform(testCase.input, testCase)),
  );
  return {
    generated_at: new Date().toISOString(),
    overall: summarize(scores),
    by_locale: breakdown(scores, "locale"),
    by_category: breakdown(scores, "category"),
    failures: scores.filter((score) => !score.passed),
  };
}
