export const GROWTH_MARKETPLACES = Object.freeze([
  'AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP', 'QOO10_JP', 'SHEIN_JP',
  'ZOZOTOWN_JP', 'SHOPLIST_JP', 'MUSINSA_JP', 'BUYMA_JP', 'SNKRDUNK_JP',
  // v4.2 項目14で追加された5モール。
  'LOFT_JP', 'HANDS_JP', 'MATSUKIYO_JP', 'COSME_JP', 'ABCMART_JP'
]);

const LABELS = Object.freeze([
  ['AMAZON', 'AMAZON_JP'], ['楽天', 'RAKUTEN_JP'], ['RAKUTEN', 'RAKUTEN_JP'],
  ['YAHOO', 'YAHOO_JP'], ['QOO10', 'QOO10_JP'], ['SHEIN', 'SHEIN_JP'],
  ['ZOZOTOWN', 'ZOZOTOWN_JP'], ['SHOPLIST', 'SHOPLIST_JP'],
  ['MUSINSA', 'MUSINSA_JP'], ['BUYMA', 'BUYMA_JP'], ['SNKRDUNK', 'SNKRDUNK_JP'],
  ['ロフト', 'LOFT_JP'], ['LOFT', 'LOFT_JP'], ['ハンズ', 'HANDS_JP'], ['HANDS', 'HANDS_JP'],
  ['マツキヨ', 'MATSUKIYO_JP'], ['COSME', 'COSME_JP'], ['ABC-MART', 'ABCMART_JP'], ['ABCMART', 'ABCMART_JP']
]);

export function growthMarketplace(value, label = '') {
  const explicit = String(value || '').trim().toUpperCase();
  if (GROWTH_MARKETPLACES.includes(explicit)) return explicit;
  const normalizedLabel = String(label || '').trim().toUpperCase();
  return LABELS.find(([needle]) => normalizedLabel.includes(needle))?.[1] || '';
}
