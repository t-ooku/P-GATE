import { isMarketplaceProductUrl } from './marketplace-product-url-policy.mjs';
import { safeProviderErrorCode } from './provider-error-code.mjs';

const API_URL = 'https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch';
const HIGH_RATING_TREND_RANKING_API = 'https://shopping.yahooapis.jp/ShoppingWebService/V1/highRatingTrendRanking';

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
      review_average: Math.max(0, Math.min(5, Number(item?.review?.rate) || 0)),
      review_count: Math.max(0, Number(item?.review?.count) || 0),
      review_url: /^https:\/\//i.test(String(item?.review?.url || '')) ? String(item.review.url) : '',
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

function positivePrice(...values) {
  for (const value of values) {
    const price = Number(value || 0);
    if (Number.isFinite(price) && price > 0) return price;
  }
  return 0;
}

function yahooRankingUpdatedAt(payload = {}) {
  const value = String(payload?.high_rating_trend_ranking?.meta?.last_modified || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? `${value}T00:00:00+09:00` : '';
}

// Yahoo!ショッピングの公式「高評価トレンドランキング」だけを正規化する。
// 注文者数やレビュー評価を組み合わせた順位はAPIが決定し、HOSHILUは順位を
// 作り直さない。APIはレビュー本文を返さないため、評価・件数・公式URLだけを
// 公開候補へ保持する。
export function normalizeYahooHighRatingRanking(payload = {}) {
  const root = payload?.high_rating_trend_ranking || {};
  const rows = Array.isArray(root.ranking_data) ? root.ranking_data : [];
  const updatedAt = yahooRankingUpdatedAt(payload);
  return rows.slice(0, 30).map((row, index) => {
    const item = row?.item_information || {};
    const review = row?.review || {};
    const productUrl = String(item.url || '').trim();
    const name = String(item.name || '').trim();
    // セール価格がある場合だけ通常価格より優先する。会員限定価格は利用者条件を
    // 確認できないため、一般向けの確認済み価格としては採用しない。
    const price = positivePrice(item.bargain_price, item.regular_price);
    const jan = validJan(item.jan_code);
    const code = String(item.code || '').trim();
    const image = String(row?.image?.medium || row?.image?.small || '').trim();
    const reviewUrl = String(review.url || '').trim();
    return {
      rank: Math.max(1, Number(row?.rank) || index + 1),
      record_key: jan ? `JAN:${jan}` : `YAHOO:${code || productUrl}`,
      product_name: name,
      display_name: name,
      image,
      image_url: image,
      image_urls: /^https:\/\//iu.test(image) ? [image] : [],
      stock: productUrl ? 1 : 0,
      marketplace_source: 'YAHOO_HIGH_RATING_TREND_RANKING_API',
      review_average: Math.max(0, Math.min(5, Number(review.rate) || 0)),
      review_count: Math.max(0, Number(review.count) || 0),
      review_url: /^https:\/\//iu.test(reviewUrl) ? reviewUrl : '',
      updated_at: updatedAt,
      offers: productUrl && price > 0 ? [{
        marketplace: 'YAHOO_JP',
        product_url: productUrl,
        price,
        total_cost: 0,
        shipping_fee: null,
        shipping_fee_confirmed: false,
        currency: 'JPY',
        stock_status: 'UNKNOWN',
        source: 'yahoo_high_rating_trend_ranking_api'
      }] : []
    };
  }).filter((item) => item.product_name && item.offers.length
    && isMarketplaceProductUrl('YAHOO_JP', item.offers[0].product_url));
}

export async function fetchYahooHighRatingRanking(env, query, fetcher = fetch) {
  if (!yahooShoppingApiConfigured(env)) return [];
  const normalizedQuery = String(query || '').normalize('NFKC').trim().slice(0, 200);
  if (!normalizedQuery) return [];
  const url = new URL(HIGH_RATING_TREND_RANKING_API);
  url.searchParams.set('appid', String(env.YAHOO_SHOPPING_CLIENT_ID).trim());
  url.searchParams.set('query', normalizedQuery);
  url.searchParams.set('offset', '1');
  url.searchParams.set('limit', '30');
  const response = await fetcher(url.toString(), {
    headers: { accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(2500)
  });
  if (!response.ok) {
    const error = new Error('YAHOO_HIGH_RATING_RANKING_FAILED');
    error.status = Number(response.status) || 0;
    throw error;
  }
  return normalizeYahooHighRatingRanking(await response.json());
}

export async function searchYahooShopping(env, keywords, fetcher = fetch, options = {}) {
  if (!yahooShoppingApiConfigured(env)) return [];
  const query = String(keywords || '').normalize('NFKC').trim().slice(0, 200);
  if (!query) return [];
  const url = new URL(API_URL);
  url.searchParams.set('appid', String(env.YAHOO_SHOPPING_CLIENT_ID).trim());
  url.searchParams.set('query', query);
  // seller_idを指定すると、その出店者(ストア)内だけを検索する。
  // Yahoo!ショッピング内のモール公式店(ZOZOTOWN等)を名指しで引くために使う。
  const sellerId = String(options.sellerId || '').trim();
  if (sellerId) {
    url.searchParams.set('seller_id', sellerId);
    url.searchParams.set('results', '10');
  } else {
    url.searchParams.set('results', '30');
  }
  // 既定のmedium画像は146px。公式APIのimage_size=600を指定すると
  // exImage.urlが600x600で返るため、カード寸法は変えず画像だけ鮮明にする。
  url.searchParams.set('image_size', '600');
  if (['-review_count', '-score'].includes(options.sort)) url.searchParams.set('sort', options.sort);
  url.searchParams.set('in_stock', 'true');
  const response = await fetcher(url.toString(), {
    headers: { accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(2500)
  });
  if (!response.ok) {
    const error = new Error('YAHOO_SHOPPING_SEARCH_FAILED');
    error.status = Number(response.status) || 0;
    // Never inspect/log provider error prose; it may echo the search query.
    error.providerCode = safeProviderErrorCode('', response.status, 'YAHOO_PROVIDER_FAILED');
    throw error;
  }
  return normalizeYahooShoppingItems(await response.json());
}
