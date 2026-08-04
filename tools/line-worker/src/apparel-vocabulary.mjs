// Shared Japanese labels for the apparel-adjacent categories detected by
// search-intelligence.mjs's RULES table.
//
// Scope note: HOSHILU currently maintains apparel terms in four independent
// places (search-intelligence.mjs RULES, apparel-marketplaces.mjs
// APPAREL_TERMS, marketplace-search-keywords-v2.mjs GENERIC_PRODUCTS, and
// knowledge-search.mjs's display-label dictionary). Unifying all four is a
// larger follow-up that touches a 150-entry table and a 1700-line file this
// fix intentionally does not risk. This module only covers the narrow,
// additive piece needed to stop Amazon/Qoo10 keyword building from
// discarding the original Japanese text in favor of English category words
// (see buildAmazonSearchKeywords / buildQoo10SearchKeywords in index.mjs).
export const APPAREL_CATEGORY_JA_LABELS = new Map([
  ['tops', 'トップス'],
  ['t-shirt', 'Tシャツ'],
  ['jacket', 'ジャケット'],
  ['coat', 'コート'],
  ['hoodie', 'パーカー'],
  ['pants', 'パンツ'],
  ['skirt', 'スカート'],
  ['dress', 'ワンピース'],
  ['bag', 'バッグ'],
  ['hat', '帽子'],
  ['shoes', 'シューズ'],
  ['socks', '靴下']
]);
