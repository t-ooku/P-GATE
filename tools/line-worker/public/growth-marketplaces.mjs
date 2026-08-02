export const GROWTH_MARKETPLACES = Object.freeze([
  'AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP', 'QOO10_JP', 'SHEIN_JP',
  'ZOZOTOWN_JP', 'SHOPLIST_JP', 'MUSINSA_JP', 'BUYMA_JP', 'SNKRDUNK_JP'
]);

const LABELS = Object.freeze([
  ['AMAZON', 'AMAZON_JP'], ['楽天', 'RAKUTEN_JP'], ['RAKUTEN', 'RAKUTEN_JP'],
  ['YAHOO', 'YAHOO_JP'], ['QOO10', 'QOO10_JP'], ['SHEIN', 'SHEIN_JP'],
  ['ZOZOTOWN', 'ZOZOTOWN_JP'], ['SHOPLIST', 'SHOPLIST_JP'],
  ['MUSINSA', 'MUSINSA_JP'], ['BUYMA', 'BUYMA_JP'], ['SNKRDUNK', 'SNKRDUNK_JP']
]);

export function growthMarketplace(value, label = '') {
  const explicit = String(value || '').trim().toUpperCase();
  if (GROWTH_MARKETPLACES.includes(explicit)) return explicit;
  const normalizedLabel = String(label || '').trim().toUpperCase();
  return LABELS.find(([needle]) => normalizedLabel.includes(needle))?.[1] || '';
}
