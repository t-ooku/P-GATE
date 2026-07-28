/**
 * One-tap refinement suggestions for HOSHILU.
 *
 * The original memory fragment is preserved. Users choose a small number of
 * chips instead of rewriting their query.
 */

const COPY = Object.freeze({
  ja: {
    category: {
      beauty: "美容・化粧品",
      food: "食べ物・飲み物",
      kitchen: "キッチン・食卓",
      electronics: "電気・電池を使う",
      fashion: "身につける",
      home: "家の中で使う",
      outdoor: "屋外で使う",
      pet: "ペット用",
      auto: "車・バイク用",
      toy: "おもちゃ・ホビー",
    },
    size: {
      tiny: "指先サイズ",
      palm: "手のひらサイズ",
      bag: "バッグに入る",
      tabletop: "卓上サイズ",
      large: "大型",
    },
    power: {
      none: "電源不要",
      usb: "USB充電",
      battery: "電池式",
      outlet: "コンセント式",
      compatible_jp: "日本で使える",
    },
    scene: {
      home: "家で使う",
      work: "仕事・学校",
      travel: "旅行中",
      outdoor: "屋外・キャンプ",
      car: "車の中",
      body: "身につける",
    },
    appearance: {
      white: "白",
      black: "黒",
      pink: "ピンク",
      transparent: "透明",
      round: "丸い",
      foldable: "折りたためる",
    },
  },
  en: {
    category: {
      beauty: "Beauty or cosmetics",
      food: "Food or drink",
      kitchen: "Kitchen or dining",
      electronics: "Electric or battery-powered",
      fashion: "Something to wear",
      home: "Used at home",
      outdoor: "Used outdoors",
      pet: "For pets",
      auto: "For cars or motorcycles",
      toy: "Toys or hobbies",
    },
    size: {
      tiny: "Fingertip-sized",
      palm: "Palm-sized",
      bag: "Fits in a bag",
      tabletop: "Tabletop size",
      large: "Large",
    },
    power: {
      none: "No power needed",
      usb: "USB rechargeable",
      battery: "Battery-powered",
      outlet: "Plug-in",
      compatible_jp: "Works in Japan",
    },
    scene: {
      home: "At home",
      work: "Work or school",
      travel: "While traveling",
      outdoor: "Outdoors or camping",
      car: "Inside a car",
      body: "Worn on the body",
    },
    appearance: {
      white: "White",
      black: "Black",
      pink: "Pink",
      transparent: "Transparent",
      round: "Round",
      foldable: "Foldable",
    },
  },
  zh: {
    category: {
      beauty: "美容或化妆品",
      food: "食品或饮料",
      kitchen: "厨房或餐桌",
      electronics: "用电或电池",
      fashion: "穿戴用品",
      home: "家中使用",
      outdoor: "户外使用",
      pet: "宠物用品",
      auto: "汽车或摩托车用品",
      toy: "玩具或兴趣用品",
    },
    size: {
      tiny: "指尖大小",
      palm: "手掌大小",
      bag: "可以放进包里",
      tabletop: "桌面大小",
      large: "大型",
    },
    power: {
      none: "无需电源",
      usb: "USB充电",
      battery: "电池供电",
      outlet: "插电式",
      compatible_jp: "可在日本使用",
    },
    scene: {
      home: "家中",
      work: "工作或学校",
      travel: "旅行",
      outdoor: "户外或露营",
      car: "车内",
      body: "佩戴在身上",
    },
    appearance: {
      white: "白色",
      black: "黑色",
      pink: "粉色",
      transparent: "透明",
      round: "圆形",
      foldable: "可折叠",
    },
  },
  ko: {
    category: {
      beauty: "미용 또는 화장품",
      food: "음식 또는 음료",
      kitchen: "주방 또는 식탁",
      electronics: "전기 또는 배터리 사용",
      fashion: "착용하는 물건",
      home: "집에서 사용",
      outdoor: "야외에서 사용",
      pet: "반려동물용",
      auto: "자동차 또는 오토바이용",
      toy: "장난감 또는 취미",
    },
    size: {
      tiny: "손가락 끝 크기",
      palm: "손바닥 크기",
      bag: "가방에 들어가는 크기",
      tabletop: "탁상 크기",
      large: "대형",
    },
    power: {
      none: "전원 불필요",
      usb: "USB 충전",
      battery: "배터리식",
      outlet: "콘센트식",
      compatible_jp: "일본에서 사용 가능",
    },
    scene: {
      home: "집",
      work: "직장 또는 학교",
      travel: "여행 중",
      outdoor: "야외 또는 캠핑",
      car: "차 안",
      body: "몸에 착용",
    },
    appearance: {
      white: "흰색",
      black: "검은색",
      pink: "분홍색",
      transparent: "투명",
      round: "둥근 모양",
      foldable: "접을 수 있음",
    },
  },
});

const DIMENSION_ORDER = Object.freeze([
  "category",
  "scene",
  "size",
  "power",
  "appearance",
]);

const DEFAULT_VALUES = Object.freeze({
  category: ["kitchen", "electronics", "beauty", "home", "fashion", "food"],
  scene: ["home", "work", "travel", "outdoor", "car", "body"],
  size: ["palm", "bag", "tabletop", "tiny", "large"],
  power: ["none", "usb", "battery", "outlet", "compatible_jp"],
  appearance: ["white", "black", "pink", "transparent", "round", "foldable"],
});

function localeKey(locale) {
  const key = String(locale || "ja").toLowerCase().split(/[-_]/)[0];
  return Object.hasOwn(COPY, key) ? key : "ja";
}

function presentDimensions(context) {
  const dimensions = new Set();
  for (const type of context?.query_types || []) {
    if (type === "shape_function" || type === "color_package") dimensions.add("appearance");
    if (type === "usage_scene" || type === "place_memory") dimensions.add("scene");
    if (type === "compatibility") dimensions.add("power");
    if (type === "category_branch") dimensions.add("category");
  }
  for (const dimension of context?.known_dimensions || []) dimensions.add(dimension);
  return dimensions;
}

function candidateValues(dimension, context) {
  const supplied = context?.suggested_values?.[dimension];
  if (Array.isArray(supplied) && supplied.length) return supplied;
  if (dimension === "category" && Array.isArray(context?.candidate_categories)) {
    return context.candidate_categories;
  }
  return DEFAULT_VALUES[dimension] || [];
}

export function suggestRefinementChips(context = {}, locale = "ja", limit = 10) {
  const lang = localeKey(locale);
  const known = presentDimensions(context);
  const chips = [];
  for (const dimension of DIMENSION_ORDER) {
    if (known.has(dimension) && !context?.force_dimensions?.includes(dimension)) continue;
    for (const value of candidateValues(dimension, context)) {
      const normalized = String(value);
      const label = COPY[lang]?.[dimension]?.[normalized];
      if (!label) continue;
      chips.push({
        id: `${dimension}:${normalized}`,
        dimension,
        value: normalized,
        label,
      });
      if (chips.length >= Math.max(1, Number(limit) || 10)) return chips;
    }
  }
  return chips;
}

export function applyRefinementChips(query, chips, locale = "ja") {
  const lang = localeKey(locale);
  const base = String(query || "").trim();
  const additions = [];
  const seenDimensions = new Set();
  for (const chip of Array.isArray(chips) ? chips : []) {
    const dimension = String(chip?.dimension || "");
    const value = String(chip?.value || "");
    if (!dimension || !value || seenDimensions.has(dimension)) continue;
    const label = COPY[lang]?.[dimension]?.[value];
    if (!label) continue;
    seenDimensions.add(dimension);
    additions.push(label);
  }
  return [base, ...additions].filter(Boolean).join(" / ");
}

export function refinementRequest(query, selectedChips, context = {}, locale = "ja") {
  const refinedQuery = applyRefinementChips(query, selectedChips, locale);
  return {
    original_query: String(query || "").trim(),
    refined_query: refinedQuery,
    locale: localeKey(locale),
    refinements: (Array.isArray(selectedChips) ? selectedChips : []).map((chip) => ({
      dimension: chip.dimension,
      value: chip.value,
    })),
    continuation: true,
    prior_search_id: String(context?.search_id || ""),
  };
}
