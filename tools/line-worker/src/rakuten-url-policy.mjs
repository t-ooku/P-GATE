function parseHttpsUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function isRakutenDirectProductUrl(value) {
  const url = parseHttpsUrl(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host !== 'item.rakuten.co.jp' && host !== 'product.rakuten.co.jp') return false;
  return url.pathname.split('/').filter(Boolean).length >= 2;
}

export function rakutenAffiliateProductTarget(value) {
  const url = parseHttpsUrl(value);
  if (!url) return '';
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host !== 'hb.afl.rakuten.co.jp' || !url.pathname.startsWith('/hgc/')) return '';
  const target = url.searchParams.get('pc') || '';
  return isRakutenDirectProductUrl(target) ? target : '';
}

export function isRakutenAffiliateProductUrl(value) {
  return Boolean(rakutenAffiliateProductTarget(value));
}

export function isRakutenProductUrl(value) {
  return isRakutenDirectProductUrl(value) || isRakutenAffiliateProductUrl(value);
}
