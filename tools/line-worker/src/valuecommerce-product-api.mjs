import { filterCategoryMismatches } from './knowledge-search.mjs';
import { isValueCommerceAffiliateProductUrl } from './marketplace-product-url-policy.mjs';
import { safeProviderErrorCode } from './provider-error-code.mjs';

const API_URL = 'https://webservice.valuecommerce.ne.jp/productdb/search';
export const VALUECOMMERCE_REQUEST_TIMEOUT_MS = 7000;

const MARKETPLACE_CONFIG = Object.freeze({
  YAHOO_JP: { ecCodeName: 'VALUECOMMERCE_YAHOO_EC_CODE', source: 'VALUECOMMERCE_YAHOO_PRODUCT_API' },
  QOO10_JP: { ecCodeName: 'VALUECOMMERCE_QOO10_EC_CODE', source: 'VALUECOMMERCE_QOO10_PRODUCT_API' }
});

function clean(value, max = 200) {
  return String(value || '').normalize('NFKC').trim().slice(0, max);
}

function validEcCode(value) {
  const code = clean(value, 64);
  return /^[A-Za-z0-9_-]{1,64}$/u.test(code) ? code : '';
}

export function valueCommerceMarketplaceConfigured(env = {}, marketplace = '') {
  const config = MARKETPLACE_CONFIG[String(marketplace || '').toUpperCase()];
  if (!config) return false;
  return Boolean(clean(env.VALUECOMMERCE_PRODUCT_API_TOKEN, 256) && validEcCode(env[config.ecCodeName]));
}

export function configuredValueCommerceMarketplaces(env = {}) {
  return Object.keys(MARKETPLACE_CONFIG).filter((marketplace) =>
    valueCommerceMarketplaceConfigured(env, marketplace));
}

function imageUrls(item = {}) {
  return [...new Set([
    item?.imageFree?.url, item?.imageLarge?.url, item?.imageSmall?.url,
    item?.image_free?.url, item?.image_large?.url, item?.image_small?.url
  ].map((value) => clean(value, 2000)).filter((value) => /^https:\/\//iu.test(value)))].slice(0, 8);
}

function validJan(value) {
  const jan = String(value || '').replace(/\D/gu, '');
  return /^(?:\d{8}|\d{13})$/u.test(jan) ? jan : '';
}

function payloadItems(payload = {}) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.Items)) return payload.Items;
  if (Array.isArray(payload?.channel?.items)) return payload.channel.items;
  if (Array.isArray(payload?.channel?.item)) return payload.channel.item;
  return [];
}

export function normalizeValueCommerceItems(payload = {}, marketplace = '') {
  const normalizedMarketplace = String(marketplace || '').toUpperCase();
  const config = MARKETPLACE_CONFIG[normalizedMarketplace];
  if (!config) return [];
  return payloadItems(payload).slice(0, 30).map((item, index) => {
    const productUrl = clean(item?.link, 4000);
    const name = clean(item?.title || item?.name, 500);
    const price = Number(item?.price || 0);
    const jan = validJan(item?.janCode || item?.jan_code);
    const productCode = clean(item?.productCode || item?.product_code || item?.guid, 300);
    const images = imageUrls(item);
    const image = images[0] || '';
    return {
      rank: index + 1,
      record_key: jan ? `JAN:${jan}` : `VALUECOMMERCE:${normalizedMarketplace}:${productCode || productUrl}`,
      product_name: name,
      display_name: name,
      description: clean(item?.description, 500),
      image,
      image_url: image,
      image_urls: images,
      stock: productUrl ? 1 : 0,
      marketplace_source: config.source,
      offers: productUrl && Number.isFinite(price) && price > 0 ? [{
        marketplace: normalizedMarketplace,
        product_url: productUrl,
        price,
        shipping_fee: null,
        total_cost: 0,
        shipping_fee_confirmed: false,
        currency: 'JPY',
        stock_status: 'UNKNOWN',
        source: 'valuecommerce_product_api'
      }] : [],
      evidence: { matched_terms: [], information_score: 0 }
    };
  }).filter((item) => item.product_name && item.offers.length
    && isValueCommerceAffiliateProductUrl(normalizedMarketplace, item.offers[0].product_url));
}

export async function searchValueCommerceMarketplace(env, marketplace, keywords, fetcher = fetch) {
  const normalizedMarketplace = String(marketplace || '').toUpperCase();
  const config = MARKETPLACE_CONFIG[normalizedMarketplace];
  if (!config || !valueCommerceMarketplaceConfigured(env, normalizedMarketplace)) return [];
  const query = clean(keywords);
  if (!query) return [];
  const url = new URL(API_URL);
  url.searchParams.set('token', clean(env.VALUECOMMERCE_PRODUCT_API_TOKEN, 256));
  url.searchParams.set('ecCode', validEcCode(env[config.ecCodeName]));
  url.searchParams.set('keyword', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('adult', 'n');
  url.searchParams.set('sort_by', 'score');
  url.searchParams.set('sort_order', 'desc');
  const response = await fetcher(url.toString(), {
    headers: { accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(VALUECOMMERCE_REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) {
    const error = new Error('VALUECOMMERCE_PRODUCT_SEARCH_FAILED');
    error.status = Number(response.status) || 0;
    error.providerCode = safeProviderErrorCode('', response.status, 'VALUECOMMERCE_PROVIDER_FAILED');
    throw error;
  }
  return normalizeValueCommerceItems(await response.json(), normalizedMarketplace);
}

export async function searchValueCommerceMarketplaceWithFallback(
  env,
  marketplace,
  keywordCandidates,
  fetcher = fetch,
  query = '',
  fallbackQuery = ''
) {
  const candidates = [...new Set(
    (Array.isArray(keywordCandidates) ? keywordCandidates : [keywordCandidates])
      .map((value) => clean(value))
      .filter(Boolean)
  )].slice(0, 3);
  const outcomes = await Promise.allSettled(candidates.map((keywords) =>
    searchValueCommerceMarketplace(env, marketplace, keywords, fetcher)));
  let firstFailure = null;
  for (const outcome of outcomes) {
    if (outcome.status !== 'fulfilled') {
      firstFailure ||= outcome.reason;
      continue;
    }
    const results = Array.isArray(outcome.value) ? outcome.value : [];
    if (!results.length) continue;
    if (!query || filterCategoryMismatches(query, results).length) return results;
    if (fallbackQuery && fallbackQuery !== query && filterCategoryMismatches(fallbackQuery, results).length) return results;
  }
  if (firstFailure && outcomes.every((outcome) => outcome.status === 'rejected')) throw firstFailure;
  return [];
}
