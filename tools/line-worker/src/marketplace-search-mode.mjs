// v4.2 項目17 / v4.3 項目18: マーケットプレイスごとの検索モードの唯一の
// 判定元。'integrated' はHOSHILUが実際に商品データを取得できるAPI連携先
// (Amazon/Rakuten/Yahoo)、'direct' はHOSHILUが商品データを持たず、その
// モール自身の検索結果ページへディープリンクするだけの先。
//
// src/index.mjs (通常検索の signedMarketplaceSearchLinks) と
// src/ai-price-comparison.mjs (v4.3 AI最安比較) の両方がこのモジュールを
// 参照する。二重定義してドリフトさせないための抽出(元は src/index.mjs 内に
// 直接定義されていた)。

export const INTEGRATED_MARKETPLACES = new Set(['AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP']);

export function searchModeForMarketplace(marketplace) {
  return INTEGRATED_MARKETPLACES.has(String(marketplace || '').toUpperCase()) ? 'integrated' : 'direct';
}

export function isIntegratedMarketplace(marketplace) {
  return searchModeForMarketplace(marketplace) === 'integrated';
}
