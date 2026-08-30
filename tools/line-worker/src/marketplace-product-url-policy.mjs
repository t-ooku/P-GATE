import { isRakutenProductUrl } from './rakuten-url-policy.mjs';

export const PRODUCT_MARKETPLACES = Object.freeze([
  'AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP', 'QOO10_JP', 'SHEIN_JP',
  'ZOZOTOWN_JP', 'SHOPLIST_JP', 'MUSINSA_JP', 'BUYMA_JP', 'SNKRDUNK_JP'
]);

const hostMatches = (host, domain) => host === domain || host.endsWith(`.${domain}`);

function marketplaceForDirectProductUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    const path = url.pathname;
    const lowerPath = path.toLowerCase();
    if ((hostMatches(host, 'amazon.co.jp') || hostMatches(host, 'amazon.com'))
      && /\/(?:dp|gp\/product)\/[a-z0-9]{10}(?:[/?]|$)/i.test(path)) return 'AMAZON_JP';
    if (hostMatches(host, 'rakuten.co.jp') && isRakutenProductUrl(value)) return 'RAKUTEN_JP';
    if (hostMatches(host, 'store.shopping.yahoo.co.jp') && /^\/[^/]+\/[^/]+\.html$/i.test(lowerPath)) return 'YAHOO_JP';
    if (hostMatches(host, 'qoo10.jp') && ((/\/gmkt\.inc\/goods\/goods\.aspx$/i.test(lowerPath)
      && /^\d+$/.test(url.searchParams.get('goodscode') || ''))
      || (/^\/item\//i.test(lowerPath) && /\/\d+\/?$/.test(lowerPath)))) return 'QOO10_JP';
    if (hostMatches(host, 'shein.com') && /-p-\d+\.html$/i.test(lowerPath)) return 'SHEIN_JP';
    if (hostMatches(host, 'zozo.jp') && /\/goods\/\d+\/?$/i.test(lowerPath)) return 'ZOZOTOWN_JP';
    if (hostMatches(host, 'shop-list.com') && /^\/(?:women|men|kids)\/.+\/[a-z0-9_-]+\/?$/i.test(lowerPath)
      && !/\/(?:search|category|brand)\/?$/i.test(lowerPath)) return 'SHOPLIST_JP';
    if (hostMatches(host, 'musinsa.com') && /\/(?:goods|products?)\/\d+\/?$/i.test(lowerPath)) return 'MUSINSA_JP';
    if (hostMatches(host, 'buyma.com') && /^\/item\/\d+\/?$/i.test(lowerPath)) return 'BUYMA_JP';
    if (hostMatches(host, 'snkrdunk.com') && /^\/products\/\d+\/?$/i.test(lowerPath)) return 'SNKRDUNK_JP';
  } catch {}
  return '';
}

// ValueCommerce's Product API returns a measured affiliate redirect whose
// vc_url parameter contains the advertiser's original product URL.  Trust the
// redirect only when both the tracking endpoint and the embedded destination
// are exact.  This prevents an arbitrary open redirect from being displayed as
// a verified marketplace product link.
export function marketplaceForValueCommerceUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    if (url.hostname.toLowerCase().replace(/\.$/, '') !== 'ck.jp.ap.valuecommerce.com') return '';
    if (url.pathname !== '/servlet/referral') return '';
    if (!/^[A-Za-z0-9_-]{1,64}$/u.test(url.searchParams.get('vs') || '')) return '';
    if (!/^[A-Za-z0-9_-]{1,64}$/u.test(url.searchParams.get('vp') || '')) return '';
    const destination = String(url.searchParams.get('vc_url') || '').trim();
    return marketplaceForDirectProductUrl(destination);
  } catch {}
  return '';
}

export function marketplaceForProductUrl(value) {
  return marketplaceForDirectProductUrl(value) || marketplaceForValueCommerceUrl(value);
}

export function isMarketplaceProductUrl(marketplace, value) {
  return PRODUCT_MARKETPLACES.includes(marketplace)
    && marketplaceForProductUrl(value) === marketplace;
}

export function isValueCommerceAffiliateProductUrl(marketplace, value) {
  return PRODUCT_MARKETPLACES.includes(marketplace)
    && marketplaceForValueCommerceUrl(value) === marketplace;
}
