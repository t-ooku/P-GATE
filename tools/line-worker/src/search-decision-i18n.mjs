/**
 * Four-language presentation layer for search decisions.
 * Business logic remains in search-decision-policy.mjs; this file only localizes
 * user-facing strings so metrics and behavior stay language independent.
 */

export const SEARCH_DECISION_LOCALES = Object.freeze(["ja", "en", "zh", "ko"]);

const COPY = Object.freeze({
  ja: {
    save_insufficient:
      "今の記憶だけでは商品を特定できません。ほしっとくに保存して、商品追加時にもう一度照合します。",
    save_context:
      "色や見た場所だけでは断定できません。ほしっとくに保存して、後日もう一度照合します。",
    questions: {
      category_branch: "どちらに近いですか？",
      category_confirm: "この種類に近いですか？",
      usage_scene: "どこで、どんな場面に使う物でしたか？",
      shape_or_function: "形と使い方では、どちらをもう少し覚えていますか？",
      size: "大きさはどれに近いですか？",
    },
    options: {
      yes: "はい",
      no: "いいえ",
      unsure: "分からない",
      other: "その他",
      shape: "見た目・形",
      function: "使い方",
      neither: "どちらも曖昧",
      home: "家の中",
      work: "仕事・学校",
      outdoor: "屋外",
      body: "身につける",
      vehicle: "車・バイク",
      palm: "手のひらサイズ",
      bag: "バッグに入る",
      tabletop: "卓上サイズ",
      large: "大型",
      beauty: "美容・化粧品",
      food: "食べ物・飲み物",
      kitchen: "キッチン・食卓",
      electronics: "電気・電池を使う物",
      fashion: "身につける物",
      pet: "ペット用",
      auto: "車・バイク用",
      toy: "おもちゃ・ホビー",
    },
  },
  en: {
    save_insufficient:
      "There is not enough information to identify it yet. Save it to Hoshittoku and we will match it again when new products are added.",
    save_context:
      "Color or where you saw it is not enough to identify it confidently. Save it to Hoshittoku for a later match.",
    questions: {
      category_branch: "Which is it closer to?",
      category_confirm: "Is it close to this type?",
      usage_scene: "Where and in what situation was it used?",
      shape_or_function: "Do you remember more about its shape or how it was used?",
      size: "Which size was it closest to?",
    },
    options: {
      yes: "Yes",
      no: "No",
      unsure: "Not sure",
      other: "Other",
      shape: "Appearance or shape",
      function: "How it was used",
      neither: "Both are vague",
      home: "At home",
      work: "Work or school",
      outdoor: "Outdoors",
      body: "Worn on the body",
      vehicle: "Car or motorcycle",
      palm: "Palm-sized",
      bag: "Fits in a bag",
      tabletop: "Tabletop size",
      large: "Large",
      beauty: "Beauty or cosmetics",
      food: "Food or drink",
      kitchen: "Kitchen or dining",
      electronics: "Electric or battery-powered",
      fashion: "Something to wear",
      pet: "For pets",
      auto: "For cars or motorcycles",
      toy: "Toys or hobbies",
    },
  },
  zh: {
    save_insufficient:
      "目前的信息还不足以确定商品。请保存到“先记下来”，添加新商品时我们会再次匹配。",
    save_context:
      "仅凭颜色或看到的地点还无法准确确定。请保存到“先记下来”，以后再次匹配。",
    questions: {
      category_branch: "更接近哪一种？",
      category_confirm: "接近这种类型吗？",
      usage_scene: "它是在什么地点、什么场景使用的？",
      shape_or_function: "外形和用途，你对哪一方面记得更多？",
      size: "大小更接近哪一种？",
    },
    options: {
      yes: "是",
      no: "否",
      unsure: "不确定",
      other: "其他",
      shape: "外观或形状",
      function: "使用方式",
      neither: "两者都很模糊",
      home: "家中",
      work: "工作或学校",
      outdoor: "户外",
      body: "佩戴在身上",
      vehicle: "汽车或摩托车",
      palm: "手掌大小",
      bag: "可以放进包里",
      tabletop: "桌面大小",
      large: "大型",
      beauty: "美容或化妆品",
      food: "食品或饮料",
      kitchen: "厨房或餐桌",
      electronics: "用电或电池",
      fashion: "穿戴用品",
      pet: "宠物用品",
      auto: "汽车或摩托车用品",
      toy: "玩具或兴趣用品",
    },
  },
  ko: {
    save_insufficient:
      "현재 기억만으로는 상품을 특정하기 어렵습니다. 호싯토쿠에 저장하면 새 상품이 추가될 때 다시 대조합니다.",
    save_context:
      "색이나 본 장소만으로는 확정하기 어렵습니다. 호싯토쿠에 저장해 나중에 다시 대조하세요.",
    questions: {
      category_branch: "어느 쪽에 더 가깝나요?",
      category_confirm: "이 종류에 가까운가요?",
      usage_scene: "어디에서 어떤 상황에 사용하는 물건이었나요?",
      shape_or_function: "모양과 사용법 중 어느 쪽을 더 기억하나요?",
      size: "크기는 어느 것에 가까웠나요?",
    },
    options: {
      yes: "예",
      no: "아니요",
      unsure: "잘 모르겠어요",
      other: "기타",
      shape: "외형 또는 모양",
      function: "사용 방법",
      neither: "둘 다 모호함",
      home: "집 안",
      work: "직장 또는 학교",
      outdoor: "야외",
      body: "몸에 착용",
      vehicle: "자동차 또는 오토바이",
      palm: "손바닥 크기",
      bag: "가방에 들어가는 크기",
      tabletop: "탁상 크기",
      large: "대형",
      beauty: "미용 또는 화장품",
      food: "음식 또는 음료",
      kitchen: "주방 또는 식탁",
      electronics: "전기 또는 배터리 사용",
      fashion: "착용하는 물건",
      pet: "반려동물용",
      auto: "자동차 또는 오토바이용",
      toy: "장난감 또는 취미",
    },
  },
});

export function normalizeDecisionLocale(locale) {
  const language = String(locale || "ja")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];
  return SEARCH_DECISION_LOCALES.includes(language) ? language : "ja";
}

export function localizeSearchDecision(decision, locale) {
  const normalizedLocale = normalizeDecisionLocale(locale);
  const copy = COPY[normalizedLocale];
  const result = {
    ...decision,
    locale: normalizedLocale,
  };

  if (decision?.action === "save_to_wish") {
    result.message =
      decision?.reason === "context_only_low_confidence"
        ? copy.save_context
        : copy.save_insufficient;
  }

  if (decision?.action === "clarify" && decision?.question) {
    const questionId = decision.question.id || "usage_scene";
    result.question = {
      ...decision.question,
      text: copy.questions[questionId] || copy.questions.usage_scene,
      options: (decision.question.options || []).map((value) => ({
        value,
        label: copy.options[value] || String(value),
      })),
    };
  }

  return result;
}
