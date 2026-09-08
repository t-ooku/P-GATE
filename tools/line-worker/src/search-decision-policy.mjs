/**
 * HOSHILU search decision policy.
 *
 * It prevents confident-looking wrong answers when evidence is weak.
 * The policy returns one of:
 * - answer: present ranked products;
 * - clarify: ask exactly one high-value question;
 * - save_to_wish: persist the memory fragment for later re-matching.
 */

const CONTEXT_ONLY_TYPES = new Set([
  "color_package",
  "place_memory",
  "social_context",
  "sensory_memory",
  "era_memory",
  "price_fragment",
]);

const CATEGORY_QUESTIONS = Object.freeze({
  beauty: "化粧品・美容用品に近いですか？",
  food: "食べ物・飲み物に近いですか？",
  kitchen: "キッチンや食卓で使う物ですか？",
  electronics: "電気や電池を使う物ですか？",
  fashion: "身につける物ですか？",
  home: "家の中で使う生活用品ですか？",
  outdoor: "屋外やキャンプで使う物ですか？",
  pet: "ペット用の商品ですか？",
  auto: "車やバイクで使う物ですか？",
  toy: "おもちゃ・ホビーに近いですか？",
});

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCategory(candidate) {
  return String(
    candidate?.category_id ||
      candidate?.categoryId ||
      candidate?.category ||
      "unknown",
  )
    .trim()
    .toLowerCase();
}

function normalizeScore(candidate) {
  return number(
    candidate?.confidence ??
      candidate?.score ??
      candidate?.relevance_score ??
      candidate?.relevanceScore,
    0,
  );
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function topCategories(candidates, limit = 3) {
  return unique(candidates.slice(0, 10).map(normalizeCategory))
    .filter((category) => category !== "unknown")
    .slice(0, limit);
}

function informationTypes(context) {
  return unique(
    Array.isArray(context?.query_types)
      ? context.query_types.map((value) => String(value).toLowerCase())
      : [],
  );
}

function contextOnly(types) {
  return Boolean(types.length && types.every((type) => CONTEXT_ONLY_TYPES.has(type)));
}

function categoryQuestion(categories) {
  const [first, second] = categories;
  const firstLabel = CATEGORY_QUESTIONS[first];
  const secondLabel = CATEGORY_QUESTIONS[second];
  if (firstLabel && secondLabel) {
    return {
      id: "category_branch",
      text: `${firstLabel.replace(/ですか？$/, "")}、それとも${secondLabel}`,
      options: [first, second, "other"],
    };
  }
  if (firstLabel) {
    return {
      id: "category_confirm",
      text: firstLabel,
      options: ["yes", "no", "unsure"],
    };
  }
  return {
    id: "usage_scene",
    text: "どこで、どんな場面に使う物でしたか？",
    options: ["home", "work", "outdoor", "body", "vehicle", "unsure"],
  };
}

function missingSignalQuestion(context) {
  const types = informationTypes(context);
  if (!types.includes("shape_function")) {
    return {
      id: "shape_or_function",
      text: "形と使い方では、どちらをもう少し覚えていますか？",
      options: ["shape", "function", "neither"],
    };
  }
  if (!types.includes("usage_scene")) {
    return {
      id: "usage_scene",
      text: "どこで、どんな場面に使う物でしたか？",
      options: ["home", "work", "outdoor", "body", "vehicle", "unsure"],
    };
  }
  return {
    id: "size",
    text: "大きさはどれに近いですか？",
    options: ["palm", "bag", "tabletop", "large", "unsure"],
  };
}

export function decideSearchResponse({
  candidates,
  context = {},
  thresholds = {},
}) {
  const ranked = Array.isArray(candidates)
    ? [...candidates].sort((a, b) => normalizeScore(b) - normalizeScore(a))
    : [];
  const answerThreshold = number(thresholds.answer, 0.72);
  const clarifyThreshold = number(thresholds.clarify, 0.38);
  const categoryGapThreshold = number(thresholds.categoryGap, 0.12);
  const topScore = normalizeScore(ranked[0]);
  const secondScore = normalizeScore(ranked[1]);
  const categories = topCategories(ranked);
  const splitAcrossCategories =
    categories.length >= 2 &&
    normalizeCategory(ranked[0]) !== normalizeCategory(ranked[1]) &&
    topScore - secondScore <= categoryGapThreshold;
  const types = informationTypes(context);
  const onlyContextualMemory = contextOnly(types);

  if (!ranked.length) {
    if (onlyContextualMemory || context?.information_level === "ultra_ambiguous") {
      return {
        action: "save_to_wish",
        reason: "insufficient_evidence",
        message:
          "今の記憶だけでは商品を特定できません。ほしっとくに保存して、商品追加時にもう一度照合します。",
        candidates: [],
      };
    }
    return {
      action: "clarify",
      reason: "no_candidates",
      question: missingSignalQuestion(context),
      candidates: [],
    };
  }

  if (splitAcrossCategories) {
    return {
      action: "clarify",
      reason: "category_branch",
      question: categoryQuestion(categories),
      candidates: ranked.slice(0, 10),
    };
  }

  if (topScore >= answerThreshold) {
    return {
      action: "answer",
      reason: "sufficient_confidence",
      candidates: ranked.slice(0, 10),
    };
  }

  if (topScore >= clarifyThreshold) {
    return {
      action: "clarify",
      reason: "low_confidence",
      question: missingSignalQuestion(context),
      candidates: ranked.slice(0, 10),
    };
  }

  if (onlyContextualMemory || context?.information_level === "ultra_ambiguous") {
    return {
      action: "save_to_wish",
      reason: "context_only_low_confidence",
      message:
        "色や見た場所だけでは断定できません。ほしっとくに保存して、後日もう一度照合します。",
      candidates: ranked.slice(0, 3),
    };
  }

  return {
    action: "clarify",
    reason: "very_low_confidence",
    question: missingSignalQuestion(context),
    candidates: ranked.slice(0, 3),
  };
}

export function appendClarificationToQuery(query, question, selectedOption) {
  const base = String(query || "").trim();
  const option = String(selectedOption || "").trim();
  if (!option) return base;
  const label = {
    beauty: "化粧品・美容用品",
    food: "食べ物・飲み物",
    kitchen: "キッチン・食卓",
    electronics: "電気・電池を使う",
    fashion: "身につける物",
    home: "家の中で使う生活用品",
    outdoor: "屋外・キャンプ",
    pet: "ペット用",
    auto: "車・バイク用",
    toy: "おもちゃ・ホビー",
    shape: "見た目・形を覚えている",
    function: "使い方を覚えている",
    palm: "手のひらサイズ",
    bag: "バッグに入るサイズ",
    tabletop: "卓上サイズ",
    large: "大型",
    yes: "はい",
    no: "いいえ",
  }[option] || option;
  const prefix = question?.id ? `${question.id}:` : "";
  return [base, `${prefix}${label}`].filter(Boolean).join(" / ");
}
