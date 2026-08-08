import { isMarketplaceProductUrl } from './marketplace-product-url-policy.mjs';

const API_URL = 'https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch';

export function yahooShoppingApiConfigured(env = {}) {
  return Boolean(String(env.YAHOO_SHOPPING_CLIENT_ID || '').trim());
}

function validJan(value) {
  const jan = String(value || '').replace(/\D/g, '');
  return /^(?:\d{8}|\d{13})$/.test(jan) ? jan : '';
}

function deliveryDays(value) {
  const days = Number(value);
  return Number.isInteger(days) && days >= 0 && days <= 365 ? days : 0;
}

export function normalizeYahooShoppingItems(payload = {}) {
  const hits = Array.isArray(payload.hits) ? payload.hits : [];
  return hits.slice(0, 30).map((item, index) => {
    const productUrl = String(item?.url || '').trim();
    const name = String(item?.name || '').trim();
    const price = Number(item?.price || 0);
    const shippingIncluded = Number(item?.shipping?.code) === 2;
    const jan = validJan(item?.janCode);
    const code = String(item?.code || '').trim();
    const image = String(item?.exImage?.url || item?.image?.medium || item?.image?.small || '').trim();
    return {
      rank: index + 1,
      record_key: jan ? `JAN:${jan}` : `YAHOO:${code || productUrl}`,
      product_name: name,
      display_name: name,
      description: String(item?.description || item?.headline || '').trim().slice(0, 500),
      image,
      image_url: image,
      image_urls: /^https:\/\//i.test(image) ? [image] : [],
      stock: productUrl ? 1 : 0,
      marketplace_source: 'YAHOO_SHOPPING_API',
      offers: productUrl && price > 0 ? [{
        marketplace: 'YAHOO_JP',
        product_url: productUrl,
        price,
        shipping_fee: shippingIncluded ? 0 : null,
        total_cost: shippingIncluded ? price : 0,
        shipping_fee_confirmed: shippingIncluded,
        currency: 'JPY',
        stock_status: 'IN_STOCK',
        delivery_days: deliveryDays(item?.delivery?.day),
        source: 'yahoo_shopping_api'
      }] : [],
      evidence: { matched_terms: [], information_score: 0 }
    };
  }).filter((item) => item.product_name && item.offers.length
    && isMarketplaceProductUrl('YAHOO_JP', item.offers[0].product_url));
}

export async function searchYahooShopping(env, keywords, fetcher = fetch) {
  if (!yahooShoppingApiConfigured(env)) return [];
  const query = String(keywords || '').normalize('NFKC').trim().slice(0, 200);
  if (!query) return [];
  const url = new URL(API_URL);
  url.searchParams.set('appid', String(env.YAHOO_SHOPPING_CLIENT_ID).trim());
  url.searchParams.set('query', query);
  url.searchParams.set('results', '30');
  url.searchParams.set('in_stock', 'true');
  const response = await fetcher(url.toString(), { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('YAHOO_SHOPPING_SEARCH_FAILED');
  return normalizeYahooShoppingItems(await response.json());
}
