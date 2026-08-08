// HOSHILU INSIGHT 通知仕様変更指示書 v1.0
// (HOSHILU INSIGHT 検索条件監視 SSoT v1.0)
//
// HOSHILU INSIGHT = 保存した検索条件を監視し、その条件に新しく一致する
// 商品が見つかった時だけ通知する。「値下げ通知」の概念は一切持たない
// (section 3・5)。
//
// これはAIウォッチ(個別商品の価格・在庫・クーポン・セール開始監視、
// mywatch-policy.mjs/mywatch-routes.mjs)や、SALE RADAR(市場全体のセール・
// キャンペーン監視、marketplace-sales.mjs)とは完全に別の責務であり、この
// モジュールはそのどちらにも一切触れない(section 11・12)。
//
// このファイルは通信を一切行わない純粋関数のみで構成する(section 16の
// 「単純な部分文字列一致を使ってはいけない」を満たすため、実際のマッチング
// 品質基盤(knowledge-search.mjs)を通過済みの候補だけを受け取る前提)。

import { productIdentityKey } from './seller-pricing-policy.mjs';

export const INSIGHT_EVENT_TYPE = 'INSIGHT_NEW_MATCH';

function clip(value, max) {
  return String(value || '').slice(0, max);
}

// section 6: 保存する検索条件は最低限これらのフィールドを持つ。
// 「元の検索文/正規化した検索文/AIが理解した検索意図/カテゴリ/主要属性/
// 価格条件/モール条件」。将来の条件チップUI(今回は実装しない、section
// 6・20)のためにデータ構造だけを拡張可能にしておく。未設定の項目は
// null/空のままで良い。
export function buildConditionSnapshot({
  queryText = '',
  normalizedQueryText = '',
  searchIntent = null,
  category = '',
  keyAttributes = [],
  priceCondition = null,
  marketplaceCondition = null
} = {}) {
  return {
    query_text: clip(queryText, 200),
    normalized_query_text: clip(normalizedQueryText || queryText, 200),
    search_intent: searchIntent && typeof searchIntent === 'object' ? searchIntent : null,
    category: clip(category, 80),
    key_attributes: Array.isArray(keyAttributes)
      ? keyAttributes.map((value) => clip(value, 60)).filter(Boolean).slice(0, 20)
      : [],
    price_condition: priceCondition && typeof priceCondition === 'object' ? priceCondition : null,
    marketplace_condition: marketplaceCondition && typeof marketplaceCondition === 'object' ? marketplaceCondition : null
  };
}

export function serializeConditionSnapshot(snapshot) {
  try {
    return JSON.stringify(snapshot);
  } catch {
    return null;
  }
}

export function parseConditionSnapshot(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// section 3・4: 候補商品に一意な商品識別子を付与する。ASIN/モールの商品ID
// ベースであり、商品タイトルの文字列には一切依存しない - タイトルが微妙に
// 変わっただけでは別商品として扱われず、再通知もされない。
export function candidateIdentityKey(candidate = {}) {
  const offer = Array.isArray(candidate.offers) ? candidate.offers[0] : candidate.selected_offer;
  return productIdentityKey({
    marketplace: candidate.marketplace || offer?.marketplace,
    external_product_id: candidate.asin || candidate.product_id || candidate.external_product_id,
    variant_id: candidate.variant_id
  });
}

// section 3・4・17: 既に通知済み(alreadyMatchedKeys)の商品を除外し、
// 「新しく見つかった」商品だけを返す。0件は正常系(何も通知しない) -
// 精度優先であり、水増しのために低関連度の商品を混ぜたりしない。
// 識別子を持たない候補(=商品として特定できない)は安全側に倒して通知
// 対象にしない。
export function filterNewMatches(candidates = [], alreadyMatchedKeys = new Set()) {
  const seenThisRun = new Set();
  const fresh = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const key = candidateIdentityKey(candidate);
    if (!key) continue;
    if (alreadyMatchedKeys.has(key) || seenThisRun.has(key)) continue;
    seenThisRun.add(key);
    fresh.push({ ...candidate, product_identity_key: key });
  }
  return fresh;
}

const NOTIFICATION_COPY = {
  JA: (query, count) => ({
    title: `条件に合う商品が見つかりました「${query}」`,
    body: `新しく${count}商品見つかりました。`
  }),
  EN: (query, count) => ({
    title: `New matches found for "${query}"`,
    body: `${count} new product(s) found.`
  }),
  ZH: (query, count) => ({
    title: `找到符合条件的商品「${query}」`,
    body: `新发现 ${count} 件商品。`
  }),
  KO: (query, count) => ({
    title: `조건에 맞는 상품을 찾았습니다「${query}」`,
    body: `새로 ${count}개 상품을 찾았습니다.`
  })
};

// section 7・8: 複数の新着商品は1件のバッチ通知にまとめる(商品ごとに個別
// 通知は作らない)。代表画像は先頭の新着商品のものを使う。結果一覧への
// リンク(resultUrl)を必ず持たせる。
export function buildInsightMatchNotification({
  memberId, wishId, queryText, newMatches = [], language = 'JA', resultUrl = ''
} = {}) {
  if (!memberId || !wishId || !newMatches.length) return null;
  const build = NOTIFICATION_COPY[language] || NOTIFICATION_COPY.JA;
  const copy = build(queryText, newMatches.length);
  const representative = newMatches[0] || {};
  const representativeOffer = Array.isArray(representative.offers) ? representative.offers[0] : representative.selected_offer;
  const sortedKeys = newMatches.map((match) => match.product_identity_key).sort();
  return {
    event_type: INSIGHT_EVENT_TYPE,
    member_id: memberId,
    wish_id: wishId,
    event_key: clip(`INSIGHT:${wishId}:${sortedKeys.join(',')}`, 160),
    title: clip(copy.title, 120),
    body: clip(copy.body, 500),
    image_url: clip(representative.image_url || representative.image || representativeOffer?.image_url || '', 500),
    asin: clip(representative.asin || '', 20),
    marketplace: clip(representative.marketplace || representativeOffer?.marketplace || '', 20),
    result_url: clip(resultUrl, 500),
    match_count: newMatches.length,
    matched_product_identity_keys: sortedKeys
  };
}

// section 3・4・17全体のオーケストレーション(通信なしの純粋関数)。呼び出し
// 側は、既に実際の検索/マッチング品質基盤(knowledge-search.mjs)を通過
// させた候補(candidates)と、その条件に対して既に通知済みの識別子
// (alreadyMatchedKeys)を渡す。0件マッチは正常系であり、notificationは
// nullを返す(何も送らない)。
export function detectNewMatchesForWish({
  memberId, wishId, queryText, candidates = [], alreadyMatchedKeys = new Set(), language = 'JA', resultUrl = ''
} = {}) {
  const newMatches = filterNewMatches(candidates, alreadyMatchedKeys);
  if (!newMatches.length) return { notification: null, newMatches: [] };
  const notification = buildInsightMatchNotification({ memberId, wishId, queryText, newMatches, language, resultUrl });
  return { notification, newMatches };
}
