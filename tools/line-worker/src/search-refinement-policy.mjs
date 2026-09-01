/**
 * One-tap refinement suggestions for HOSHILU.
 *
 * The original memory fragment is preserved. Users choose a small number of
 * chips instead of rewriting their query.
 */

const MEN_SHOE_SIZES = Object.freeze([
  ["cm_23_5_or_less", "23.5", "less"],
  ...["24", "24.5", "25", "25.5", "26", "26.5", "27", "27.5", "28", "28.5", "29", "29.5", "30", "30.5"].map((value) => [`cm_${value.replace(".", "_")}`, value, "exact"]),
  ["cm_31_or_more", "31", "more"],
]);

const WOMEN_SHOE_SIZES = Object.freeze([
  ["cm_20_or_less", "20", "less"],
  ...["20.5", "21", "21.5", "22", "22.5", "23", "23.5", "24", "24.5", "25", "25.5", "26", "26.5", "27"].map((value) => [`cm_${value.replace(".", "_")}`, value, "exact"]),
  ["cm_27_5_or_more", "27.5", "more"],
]);

const KIDS_APPAREL_SIZES = Object.freeze(
  ["100", "110", "120", "130", "140", "150", "160"].map((value) => [`cm_${value}`, value, "exact"]),
);

const BABY_APPAREL_SIZES = Object.freeze(
  ["60", "70", "80", "90", "95"].map((value) => [`cm_${value}`, value, "exact"]),
);

const BABY_KIDS_SHOE_SIZES = Object.freeze([
  ["cm_10_5_or_less", "10.5", "less"],
  ["cm_11_11_5", "11 / 11.5", "pair"],
  ["cm_12_12_5", "12 / 12.5", "pair"],
  ["cm_13_13_5", "13 / 13.5", "pair"],
  ["cm_14_14_5", "14 / 14.5", "pair"],
  ["cm_15_15_5", "15 / 15.5", "pair"],
  ["cm_16_16_5", "16 / 16.5", "pair"],
  ["cm_17_or_more", "17", "more"],
]);

function centimeterSizeCopy(entries, { prefix, less, more, separator = " ", unit = "cm", joiner = " / " }) {
  return Object.fromEntries(entries.map(([id, value, bound]) => {
    const measurements = value.split(" / ").map((item) => `${item}${separator}${unit}`).join(joiner);
    const qualifier = bound === "less" ? less : bound === "more" ? more : "";
    return [id, `${prefix}${measurements}${qualifier}`];
  }));
}

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
    apparel_size: {
      xxs_or_less: "洋服 XXSサイズ以下",
      xs: "洋服 XSサイズ（SS）",
      s: "洋服 Sサイズ",
      m: "洋服 Mサイズ",
      l: "洋服 Lサイズ",
      xl: "洋服 XLサイズ（LL）",
      xxl: "洋服 XXLサイズ（3L）",
      xxxl: "洋服 XXXLサイズ（4L）",
      xxxxl_or_more: "洋服 4XLサイズ（5L以上）",
      free: "洋服 フリーサイズ",
    },
    mens_shoe_size: centimeterSizeCopy(MEN_SHOE_SIZES, {
      prefix: "メンズ靴 ", less: "以下", more: "以上", separator: "", unit: "cm",
    }),
    womens_shoe_size: centimeterSizeCopy(WOMEN_SHOE_SIZES, {
      prefix: "レディース靴 ", less: "以下", more: "以上", separator: "", unit: "cm",
    }),
    kids_apparel_size: centimeterSizeCopy(KIDS_APPAREL_SIZES, {
      prefix: "キッズ服 ", less: "以下", more: "以上", separator: "", unit: "cm",
    }),
    baby_kids_shoe_size: centimeterSizeCopy(BABY_KIDS_SHOE_SIZES, {
      prefix: "ベビー・キッズ靴 ", less: "以下", more: "以上", separator: "", unit: "cm", joiner: "・",
    }),
    baby_apparel_size: centimeterSizeCopy(BABY_APPAREL_SIZES, {
      prefix: "ベビー服 ", less: "以下", more: "以上", separator: "", unit: "cm",
    }),
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
      transparent: "透明",
      round: "丸い",
      foldable: "折りたためる",
    },
    color: {
      black: "黒",
      charcoal: "チャコール",
      white: "白",
      ivory: "アイボリー",
      cream: "クリーム色",
      gray: "グレー",
      silver: "シルバー",
      navy: "ネイビー",
      blue: "ブルー",
      light_blue: "ライトブルー",
      turquoise: "ターコイズ",
      green: "グリーン",
      dark_green: "ダークグリーン",
      mint: "ミント",
      olive: "オリーブ",
      khaki: "カーキ",
      yellow: "イエロー",
      mustard: "マスタード",
      orange: "オレンジ",
      red: "レッド",
      wine: "ワイン",
      coral: "コーラル",
      pink: "ピンク",
      purple: "パープル",
      lavender: "ラベンダー",
      beige: "ベージュ",
      brown: "ブラウン",
      gold: "ゴールド",
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
    apparel_size: {
      xxs_or_less: "Clothing size XXS or below",
      xs: "Clothing size XS (SS)",
      s: "Clothing size S",
      m: "Clothing size M",
      l: "Clothing size L",
      xl: "Clothing size XL (LL)",
      xxl: "Clothing size 2XL (3L)",
      xxxl: "Clothing size 3XL (4L)",
      xxxxl_or_more: "Clothing size 4XL (5L) or above",
      free: "Clothing free size",
    },
    mens_shoe_size: centimeterSizeCopy(MEN_SHOE_SIZES, {
      prefix: "Men's shoes: ", less: " or below", more: " or above", separator: " ", unit: "cm",
    }),
    womens_shoe_size: centimeterSizeCopy(WOMEN_SHOE_SIZES, {
      prefix: "Women's shoes: ", less: " or below", more: " or above", separator: " ", unit: "cm",
    }),
    kids_apparel_size: centimeterSizeCopy(KIDS_APPAREL_SIZES, {
      prefix: "Kids' clothing: ", less: " or below", more: " or above", separator: " ", unit: "cm",
    }),
    baby_kids_shoe_size: centimeterSizeCopy(BABY_KIDS_SHOE_SIZES, {
      prefix: "Baby/kids' shoes: ", less: " or below", more: " or above", separator: " ", unit: "cm", joiner: "–",
    }),
    baby_apparel_size: centimeterSizeCopy(BABY_APPAREL_SIZES, {
      prefix: "Baby clothing: ", less: " or below", more: " or above", separator: " ", unit: "cm",
    }),
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
      transparent: "Transparent",
      round: "Round",
      foldable: "Foldable",
    },
    color: {
      black: "Black",
      charcoal: "Charcoal",
      white: "White",
      ivory: "Ivory",
      cream: "Cream color",
      gray: "Gray",
      silver: "Silver",
      navy: "Navy",
      blue: "Blue",
      light_blue: "Light blue",
      turquoise: "Turquoise",
      green: "Green",
      dark_green: "Dark green",
      mint: "Mint",
      olive: "Olive",
      khaki: "Khaki",
      yellow: "Yellow",
      mustard: "Mustard",
      orange: "Orange",
      red: "Red",
      wine: "Wine",
      coral: "Coral",
      pink: "Pink",
      purple: "Purple",
      lavender: "Lavender",
      beige: "Beige",
      brown: "Brown",
      gold: "Gold",
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
    apparel_size: {
      xxs_or_less: "服装尺码 XXS及以下",
      xs: "服装尺码 XS（SS）",
      s: "服装尺码 S",
      m: "服装尺码 M",
      l: "服装尺码 L",
      xl: "服装尺码 XL（LL）",
      xxl: "服装尺码 2XL（3L）",
      xxxl: "服装尺码 3XL（4L）",
      xxxxl_or_more: "服装尺码 4XL（5L）及以上",
      free: "服装均码",
    },
    mens_shoe_size: centimeterSizeCopy(MEN_SHOE_SIZES, {
      prefix: "男鞋：", less: "及以下", more: "及以上", separator: "", unit: "cm",
    }),
    womens_shoe_size: centimeterSizeCopy(WOMEN_SHOE_SIZES, {
      prefix: "女鞋：", less: "及以下", more: "及以上", separator: "", unit: "cm",
    }),
    kids_apparel_size: centimeterSizeCopy(KIDS_APPAREL_SIZES, {
      prefix: "童装：", less: "及以下", more: "及以上", separator: "", unit: "cm",
    }),
    baby_kids_shoe_size: centimeterSizeCopy(BABY_KIDS_SHOE_SIZES, {
      prefix: "婴童鞋：", less: "及以下", more: "及以上", separator: "", unit: "cm", joiner: "、",
    }),
    baby_apparel_size: centimeterSizeCopy(BABY_APPAREL_SIZES, {
      prefix: "婴儿服：", less: "及以下", more: "及以上", separator: "", unit: "cm",
    }),
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
      transparent: "透明",
      round: "圆形",
      foldable: "可折叠",
    },
    color: {
      black: "黑色",
      charcoal: "炭灰色",
      white: "白色",
      ivory: "象牙色",
      cream: "奶油色",
      gray: "灰色",
      silver: "银色",
      navy: "藏青色",
      blue: "蓝色",
      light_blue: "浅蓝色",
      turquoise: "青绿色",
      green: "绿色",
      dark_green: "深绿色",
      mint: "薄荷色",
      olive: "橄榄色",
      khaki: "卡其色",
      yellow: "黄色",
      mustard: "芥末黄",
      orange: "橙色",
      red: "红色",
      wine: "酒红色",
      coral: "珊瑚色",
      pink: "粉色",
      purple: "紫色",
      lavender: "薰衣草色",
      beige: "米色",
      brown: "棕色",
      gold: "金色",
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
    apparel_size: {
      xxs_or_less: "의류 사이즈 XXS 이하",
      xs: "의류 사이즈 XS (SS)",
      s: "의류 사이즈 S",
      m: "의류 사이즈 M",
      l: "의류 사이즈 L",
      xl: "의류 사이즈 XL (LL)",
      xxl: "의류 사이즈 2XL (3L)",
      xxxl: "의류 사이즈 3XL (4L)",
      xxxxl_or_more: "의류 사이즈 4XL (5L) 이상",
      free: "의류 프리 사이즈",
    },
    mens_shoe_size: centimeterSizeCopy(MEN_SHOE_SIZES, {
      prefix: "남성 신발 ", less: " 이하", more: " 이상", separator: "", unit: "cm",
    }),
    womens_shoe_size: centimeterSizeCopy(WOMEN_SHOE_SIZES, {
      prefix: "여성 신발 ", less: " 이하", more: " 이상", separator: "", unit: "cm",
    }),
    kids_apparel_size: centimeterSizeCopy(KIDS_APPAREL_SIZES, {
      prefix: "아동복 ", less: " 이하", more: " 이상", separator: "", unit: "cm",
    }),
    baby_kids_shoe_size: centimeterSizeCopy(BABY_KIDS_SHOE_SIZES, {
      prefix: "유아·아동 신발 ", less: " 이하", more: " 이상", separator: "", unit: "cm", joiner: "·",
    }),
    baby_apparel_size: centimeterSizeCopy(BABY_APPAREL_SIZES, {
      prefix: "유아복 ", less: " 이하", more: " 이상", separator: "", unit: "cm",
    }),
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
      transparent: "투명",
      round: "둥근 모양",
      foldable: "접을 수 있음",
    },
    color: {
      black: "검은색",
      charcoal: "차콜",
      white: "흰색",
      ivory: "아이보리",
      cream: "크림색",
      gray: "회색",
      silver: "은색",
      navy: "네이비",
      blue: "파란색",
      light_blue: "라이트 블루",
      turquoise: "터키석색",
      green: "초록색",
      dark_green: "다크 그린",
      mint: "민트",
      olive: "올리브",
      khaki: "카키색",
      yellow: "노란색",
      mustard: "머스터드",
      orange: "주황색",
      red: "빨간색",
      wine: "와인색",
      coral: "코랄",
      pink: "분홍색",
      purple: "보라색",
      lavender: "라벤더",
      beige: "베이지색",
      brown: "갈색",
      gold: "금색",
    },
  },
});

/**
 * Hex swatches for the color dimension (Cowork独立QA, 2026-08-15 request:
 * "色のボタンを作って、タップしたら多種の色が出てきて、タップで検索に色を
 * 追加できるようにして" - a dedicated tap-to-pick color palette, because
 * color is a strong personal preference and the flat text chip "ピンク" is
 * slower to scan than an actual pink swatch). Locale-independent - a color is
 * the same hex regardless of language, so this is one dictionary instead of
 * four. `null` means "render as an outlined/no-fill swatch" (not used today
 * but kept as an escape hatch for a future value with no good flat color).
 */
export const COLOR_SWATCHES = Object.freeze({
  black: "#1c1c1e",
  charcoal: "#4a4a4a",
  white: "#ffffff",
  ivory: "#f5f0e6",
  cream: "#fff4d6",
  gray: "#9aa0a6",
  silver: "#c9ccd1",
  navy: "#1f2a55",
  blue: "#2f6fed",
  light_blue: "#7ec8e3",
  turquoise: "#35b6b4",
  green: "#2f9e5b",
  dark_green: "#1f5f3f",
  mint: "#a8e6cf",
  olive: "#6b7b3e",
  khaki: "#8a8a5c",
  yellow: "#f4d03f",
  mustard: "#d4a017",
  orange: "#ef8a34",
  red: "#e34848",
  wine: "#7a1f3d",
  coral: "#ff7f6e",
  pink: "#ef8bb0",
  purple: "#9b6bd9",
  lavender: "#b79ced",
  beige: "#e6d3b3",
  brown: "#8a5a3b",
  gold: "#cfa544",
});

// "color" sits right after "category" (2026-08-15, 大隆さん指摘: "ユーザー
// 心理としては色で選ぶことが重要。ユーザーそれぞれ、色にこだわりや好みを
// 持っている") - order here is what/scene/size/power/appearance rows the
// panel renders in (refinementChipsForQuery groups chips in this same
// traversal order), so color needs to appear early to be prominent rather
// than buried after scene/size/power like a minor detail.
const DIMENSION_ORDER = Object.freeze([
  "category",
  "color",
  "scene",
  "size",
  "apparel_size",
  "mens_shoe_size",
  "womens_shoe_size",
  "kids_apparel_size",
  "baby_kids_shoe_size",
  "baby_apparel_size",
  "power",
  "appearance",
]);

export const WEARABLE_SIZE_DIMENSIONS = Object.freeze([
  "apparel_size",
  "mens_shoe_size",
  "womens_shoe_size",
  "kids_apparel_size",
  "baby_kids_shoe_size",
  "baby_apparel_size",
]);

const WEARABLE_SIZE_DIMENSION_SET = new Set(WEARABLE_SIZE_DIMENSIONS);

const DEFAULT_VALUES = Object.freeze({
  category: ["kitchen", "electronics", "beauty", "home", "fashion", "food"],
  color: [
    "black", "charcoal", "gray", "silver", "white", "ivory", "cream", "beige",
    "brown", "gold", "mustard", "yellow", "orange", "coral", "red", "wine",
    "pink", "purple", "lavender", "navy", "blue", "light_blue", "turquoise",
    "green", "dark_green", "mint", "olive", "khaki",
  ],
  scene: ["home", "work", "travel", "outdoor", "car", "body"],
  size: ["palm", "bag", "tabletop", "tiny", "large"],
  apparel_size: ["xxs_or_less", "xs", "s", "m", "l", "xl", "xxl", "xxxl", "xxxxl_or_more", "free"],
  mens_shoe_size: MEN_SHOE_SIZES.map(([id]) => id),
  womens_shoe_size: WOMEN_SHOE_SIZES.map(([id]) => id),
  kids_apparel_size: KIDS_APPAREL_SIZES.map(([id]) => id),
  baby_kids_shoe_size: BABY_KIDS_SHOE_SIZES.map(([id]) => id),
  baby_apparel_size: BABY_APPAREL_SIZES.map(([id]) => id),
  power: ["none", "usb", "battery", "outlet", "compatible_jp"],
  appearance: ["transparent", "round", "foldable"],
});

function localeKey(locale) {
  const key = String(locale || "ja").toLowerCase().split(/[-_]/)[0];
  return Object.hasOwn(COPY, key) ? key : "ja";
}

function presentDimensions(context) {
  const dimensions = new Set();
  for (const type of context?.query_types || []) {
    // color_package used to fold into "appearance" back when appearance held
    // both colors and shape words. Splitting color into its own dimension
    // means a query that already states a color must suppress "color", not
    // "appearance" - shape_function (round/foldable/etc.) is the one that
    // still maps to appearance.
    if (type === "shape_function") dimensions.add("appearance");
    if (type === "color_package") dimensions.add("color");
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
      const swatch = dimension === "color" ? COLOR_SWATCHES[normalized] : undefined;
      chips.push({
        id: `${dimension}:${normalized}`,
        dimension,
        value: normalized,
        label,
        ...(swatch ? { swatch } : {}),
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
  let wearableSizeSelected = false;
  for (const chip of Array.isArray(chips) ? chips : []) {
    const dimension = String(chip?.dimension || "");
    const value = String(chip?.value || "");
    if (!dimension || !value || seenDimensions.has(dimension)) continue;
    if (WEARABLE_SIZE_DIMENSION_SET.has(dimension) && wearableSizeSelected) continue;
    const label = COPY[lang]?.[dimension]?.[value];
    if (!label) continue;
    seenDimensions.add(dimension);
    if (WEARABLE_SIZE_DIMENSION_SET.has(dimension)) wearableSizeSelected = true;
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

/**
 * Group headings for the condition-search UI (Phase C item 11, 2026-08-07).
 *
 * suggestRefinementChips() returns a flat chip list tagged with `dimension`,
 * which was enough for a single "did you mean" strip but not for the grouped,
 * one-value-per-dimension panel the unified search needs. The headings live
 * here, next to the labels they head, so the client renders strings it is
 * handed rather than keeping a second copy of this dictionary that could
 * drift from it.
 */
const DIMENSION_LABELS = Object.freeze({
  ja: { category: "種類", color: "色", scene: "使う場所", size: "大きさ", apparel_size: "洋服サイズ", mens_shoe_size: "メンズ靴サイズ", womens_shoe_size: "レディース靴サイズ", kids_apparel_size: "キッズ服サイズ", baby_kids_shoe_size: "ベビー・キッズ靴サイズ", baby_apparel_size: "ベビー服サイズ", power: "電源", appearance: "見た目" },
  en: { category: "Type", color: "Color", scene: "Where you use it", size: "Physical size", apparel_size: "Clothing size", mens_shoe_size: "Men's shoe size", womens_shoe_size: "Women's shoe size", kids_apparel_size: "Kids' clothing size", baby_kids_shoe_size: "Baby/kids' shoe size", baby_apparel_size: "Baby clothing size", power: "Power", appearance: "Look" },
  zh: { category: "种类", color: "颜色", scene: "使用场所", size: "物品大小", apparel_size: "服装尺码", mens_shoe_size: "男鞋尺码", womens_shoe_size: "女鞋尺码", kids_apparel_size: "童装尺码", baby_kids_shoe_size: "婴童鞋尺码", baby_apparel_size: "婴儿服尺码", power: "电源", appearance: "外观" },
  ko: { category: "종류", color: "색상", scene: "사용 장소", size: "물건 크기", apparel_size: "의류 사이즈", mens_shoe_size: "남성 신발 사이즈", womens_shoe_size: "여성 신발 사이즈", kids_apparel_size: "아동복 사이즈", baby_kids_shoe_size: "유아·아동 신발 사이즈", baby_apparel_size: "유아복 사이즈", power: "전원", appearance: "외형" },
});

export function refinementDimensionLabel(dimension, locale = "ja") {
  return DIMENSION_LABELS[localeKey(locale)]?.[String(dimension || "")] || "";
}

/**
 * Dimensions the query already pins down, so the panel stops offering them.
 *
 * applyRefinementChips() appends a dimension's *label* to the query and
 * accepts only one chip per dimension, so a label already present in the
 * query means that dimension is decided. Matching on the same COPY strings
 * the chips are built from keeps the two in step: whatever a chip can add is
 * exactly what is detected here.
 */
export function knownRefinementDimensions(query, locale = "ja") {
  const lang = localeKey(locale);
  const text = String(query || "").toLocaleLowerCase();
  if (!text) return [];
  return DIMENSION_ORDER.filter((dimension) =>
    Object.values(COPY[lang]?.[dimension] || {})
      .some((label) => label && text.includes(String(label).toLocaleLowerCase()))
  );
}
