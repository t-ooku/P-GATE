// 2026-08-07 Phase C 項目A: 提示欄の上下2段構成。
//
// API連携できたモール（楽天 / Yahoo!）の商品だけを提示していると、
// 1回の検索で数件しか出ないことがある。かといってHOSHILUは価格・在庫を推測
// しない。そこで表示を2段に分ける:
//
//   上段 (confirmed)   … 送料込みの合計金額が実際に確認できた商品
//   下段 (unconfirmed) … 商品としては実在するが、価格・在庫が未確認の商品
//
// 下段は「価格・在庫は未確認」と明示したうえで商品ページへのリンクだけを出す。
// 推測した金額を書かない限り、これは捏造にはあたらない。
//
// 分類ロジックだけをこのモジュールに置いてあるのは、app.js がDOM前提で
// テストできないため。ここは純粋関数なので node:test から直接検証できる。

export const RESULT_ROW_LIMIT = 30;

export function candidateOffers(candidate) {
  const source = candidate?.offers?.length ? candidate.offers : [candidate?.selected_offer];
  return Array.isArray(source) ? source.filter(Boolean) : [];
}

// 「確認できた」= 商品ページへ飛べる署名付きURLがあり、かつ合計金額が正の数。
// total_cost が 0 / null / undefined / 文字列で数値化できない場合はすべて未確認。
export function candidateHasConfirmedPrice(candidate) {
  return candidateOffers(candidate).some(
    (offer) => Boolean(offer?.tracking_url) && Number(offer?.total_cost) > 0
  );
}

export function splitCandidateRows(candidates, limit = RESULT_ROW_LIMIT) {
  const all = (Array.isArray(candidates) ? candidates : []).slice(0, limit * 2);
  const confirmed = all.filter(candidateHasConfirmedPrice).slice(0, limit);
  const unconfirmed = all.filter((candidate) => !candidateHasConfirmedPrice(candidate)).slice(0, limit);
  return { confirmed, unconfirmed };
}

function candidateIdentityKeys(candidate = {}) {
  const keys = [];
  for (const value of [candidate.hoshilu_product_id, candidate.record_key, candidate.asin]) {
    const key = String(value || '').normalize('NFKC').trim().toLocaleLowerCase();
    if (key) keys.push(`id:${key}`);
  }
  const name = String(candidate.display_name || candidate.product_name || candidate.name || '')
    .normalize('NFKC').replace(/[\s\p{P}\p{S}]+/gu, '').toLocaleLowerCase();
  if (name) keys.push(`name:${name}`);
  return keys;
}

export function excludePresentedCandidates(candidates, presented) {
  const blocked = new Set((Array.isArray(presented) ? presented : []).flatMap(candidateIdentityKeys));
  return (Array.isArray(candidates) ? candidates : []).filter(
    (candidate) => !candidateIdentityKeys(candidate).some((key) => blocked.has(key))
  );
}

// 関連商品APIが一時的に使えなくても、主検索ですでに実在確認できた商品を
// 横レコメンドへ回し、「関連キーワードだけで商品カードが無い」状態を作らない。
export function fallbackRecommendationCandidates(rows, limit = RESULT_ROW_LIMIT) {
  const unconfirmed = (Array.isArray(rows?.unconfirmed) ? rows.unconfirmed : []).slice(0, limit);
  if (unconfirmed.length) return { candidates: unconfirmed, confirmed: false };
  return { candidates: [], confirmed: false };
}

export function recommendationReason(candidate) {
  const matched = Array.isArray(candidate?.evidence?.matched_terms) ? candidate.evidence.matched_terms.filter(Boolean).slice(0, 3) : [];
  if (matched.length) return `検索条件と一致：${matched.join('・')}`;
  if (Number(candidate?.relevance_score) > 0) return '検索意図との関連性が高い候補';
  if (candidateOffers(candidate).some((offer) => Boolean(offer?.tracking_url))) return '関連商品として販売ページを確認できる候補';
  return '検索内容に関連する実在商品候補';
}

export const resultRowCopy = {
  JA: {
    confirmedTitle: '価格まで確認できた商品',
    confirmedNote: '接続済みモールで、送料込みの合計金額を確認できました。',
    unconfirmedTitle: 'HOSHILU AI選定レコメンド',
    unconfirmedNote: '検索意図に関連する実在商品を最大30品選定しました。価格・在庫は各モールの商品ページでご確認ください。',
    verifiedRecommendationTitle: '検索結果からのおすすめ商品',
    verifiedRecommendationNote: '接続済みモールで実在と価格を確認できた商品を、横スクロールで表示しています。',
    badge: '価格・在庫は未確認'
  },
  EN: {
    confirmedTitle: 'Products with a verified total price',
    confirmedNote: 'The total including shipping was confirmed on a connected marketplace.',
    unconfirmedTitle: 'HOSHILU AI-selected recommendations',
    unconfirmedNote: 'Up to 30 real products related to your search intent. Check current price and availability on each marketplace.',
    verifiedRecommendationTitle: 'Recommended from your results',
    verifiedRecommendationNote: 'Real products with verified prices from connected marketplaces, shown in a horizontal carousel.',
    badge: 'Price and stock unverified'
  },
  ZH: {
    confirmedTitle: '已确认价格的商品',
    confirmedNote: '已在已接入的商城确认含运费的合计金额。',
    unconfirmedTitle: 'HOSHILU AI精选推荐',
    unconfirmedNote: '最多推荐30件符合搜索意图的真实商品。价格与库存请在各商城确认。',
    verifiedRecommendationTitle: '搜索结果中的推荐商品',
    verifiedRecommendationNote: '横向展示已在接入商城确认真实存在及价格的商品。',
    badge: '价格与库存未确认'
  },
  KO: {
    confirmedTitle: '가격까지 확인된 상품',
    confirmedNote: '연결된 쇼핑몰에서 배송비 포함 합계 금액을 확인했습니다.',
    unconfirmedTitle: 'HOSHILU AI 선정 추천',
    unconfirmedNote: '검색 의도와 관련된 실제 상품을 최대 30개 선정합니다. 가격과 재고는 각 쇼핑몰에서 확인하세요.',
    verifiedRecommendationTitle: '검색 결과 추천 상품',
    verifiedRecommendationNote: '연결된 쇼핑몰에서 실재 여부와 가격을 확인한 상품을 가로로 표시합니다.',
    badge: '가격·재고 미확인'
  }
};

export function resultRowCopyFor(language) {
  return resultRowCopy[language] || resultRowCopy.JA;
}
