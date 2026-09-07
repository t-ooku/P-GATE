// Public marketplace identifiers only. Never expose arbitrary internal record keys,
// tenant/SKU identifiers, or URL fallbacks (which may contain affiliate tokens).
export function targetPriceProductKey(candidate = {}) {
  const key = String(candidate.record_key || '').trim();
  if (/^JAN:(?:\d{8}|\d{13})$/.test(key)) return key;
  if (/^(?:RAKUTEN|YAHOO):[A-Za-z0-9][A-Za-z0-9_.:-]{0,145}$/.test(key)) return key;
  const asin = String(candidate.asin || '').trim().toUpperCase();
  return /^[A-Z0-9]{10}$/.test(asin) ? asin : '';
}
