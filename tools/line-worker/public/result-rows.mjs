// 2026-08-07 Phase C 項目A: 提示欄の上下2段構成。
//
// API連携できたモール（Amazon / 楽天 / Yahoo!）の商品だけを提示していると、
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
  return {
    confirmed: all.filter(candidateHasConfirmedPrice).slice(0, limit),
    unconfirmed: all.filter((candidate) => !candidateHasConfirmedPrice(candidate)).slice(0, limit)
  };
}

export const resultRowCopy = {
  JA: {
    confirmedTitle: '価格まで確認できた商品',
    confirmedNote: '接続済みモールで、送料込みの合計金額を確認できました。',
    unconfirmedTitle: '商品は見つかりましたが、価格・在庫は未確認',
    unconfirmedNote: 'HOSHILUは価格を推測しません。金額と在庫は各モールの商品ページでご確認ください。',
    badge: '価格・在庫は未確認'
  },
  EN: {
    confirmedTitle: 'Products with a verified total price',
    confirmedNote: 'The total including shipping was confirmed on a connected marketplace.',
    unconfirmedTitle: 'Products found, price and stock not verified',
    unconfirmedNote: 'HOSHILU never estimates a price. Check the amount and availability on each marketplace page.',
    badge: 'Price and stock unverified'
  },
  ZH: {
    confirmedTitle: '已确认价格的商品',
    confirmedNote: '已在已接入的商城确认含运费的合计金额。',
    unconfirmedTitle: '已找到商品，但价格与库存未确认',
    unconfirmedNote: 'HOSHILU不会推测价格。请在各商城的商品页面确认金额与库存。',
    badge: '价格与库存未确认'
  },
  KO: {
    confirmedTitle: '가격까지 확인된 상품',
    confirmedNote: '연결된 쇼핑몰에서 배송비 포함 합계 금액을 확인했습니다.',
    unconfirmedTitle: '상품은 찾았지만 가격·재고는 미확인',
    unconfirmedNote: 'HOSHILU는 가격을 추측하지 않습니다. 금액과 재고는 각 쇼핑몰 상품 페이지에서 확인하세요.',
    badge: '가격·재고 미확인'
  }
};

export function resultRowCopyFor(language) {
  return resultRowCopy[language] || resultRowCopy.JA;
}
