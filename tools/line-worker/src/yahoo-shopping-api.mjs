import { isMarketplaceProductUrl } from './marketplace-product-url-policy.mjs';
import { safeProviderErrorCode } from './provider-error-code.mjs';
import {
  buildYahooProviderUrl, YAHOO_PROXY_RESULT_HEADER, YAHOO_REQUEST_INTERVAL_MS
} from './yahoo-request-coordinator.mjs';

const YAHOO_REQUEST_GATE = Symbol('YAHOO_REQUEST_GATE');
// Yahoo! Shopping itemSearch v3 documents both one query per second and 30
// requests per minute per application ID. Keep every production Yahoo!
// request in the same Worker invocation on one queue, including catalog, ranking,
// official-store, watch, and canary traffic. A 2.1-second interval stays below
// the stricter per-minute ceiling with a scheduling margin.
const YAHOO_MIN_REQUEST_INTERVAL_MS = YAHOO_REQUEST_INTERVAL_MS;
const YAHOO_COORDINATOR_OBJECT_NAME = 'yahoo-shopping-application-global';
const YAHOO_COORDINATOR_URL = 'https://yahoo-request-coordinator.internal/proxy';

function boundedRequestSignal(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(Math.max(100, Math.min(2500, Number(timeoutMs) || 2500)));
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function boundedInternalSignal(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(Math.max(500, Math.min(22000, Number(timeoutMs) || 11000)));
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function createYahooRequestGate({
  intervalMs = YAHOO_MIN_REQUEST_INTERVAL_MS,
  clock = Date.now,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
} = {}) {
  let tail = Promise.resolve();
  let nextStartAt = 0;
  return async (request) => {
    const previous = tail;
    let release;
    tail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      const now = Number(clock());
      const waitMs = Math.max(0, nextStartAt - (Number.isFinite(now) ? now : Date.now()));
      if (waitMs > 0) await sleep(waitMs);
      const startedAt = Number(clock());
      nextStartAt = (Number.isFinite(startedAt) ? startedAt : Date.now()) + intervalMs;
      return await request();
    } finally {
      release();
    }
  };
}

// Cloudflare request I/O must not leak through module-global promises. Create
// one gate per fetch/cron invocation and carry it on a private symbol instead
// of sharing a queue across requests or exposing it in health/log output.
export function withYahooRequestGate(env = {}, gateOptions = {}) {
  return { ...env, [YAHOO_REQUEST_GATE]: createYahooRequestGate(gateOptions) };
}

function coordinatorError() {
  const error = new Error('YAHOO_REQUEST_COORDINATOR_UNAVAILABLE');
  // Internal coordination failure is an immediate control failure, not a
  // provider transient. It remains privacy-safe through canonical code mapping.
  error.status = 400;
  return error;
}

function fixedTransportError(error, failureMessage) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    const fixed = new Error('YAHOO_PROVIDER_TIMEOUT');
    fixed.name = error.name;
    fixed.status = 408;
    return fixed;
  }
  return new TypeError(`${failureMessage}_NETWORK`);
}

function coordinatorOutcomeError(result) {
  if (result === 'provider_timeout') {
    const error = new Error('YAHOO_PROVIDER_TIMEOUT');
    error.name = 'TimeoutError';
    error.status = 408;
    return error;
  }
  if (result === 'provider_fetch_network') return new TypeError('YAHOO_PROVIDER_FETCH_NETWORK_FAILED');
  if (result === 'provider_body_network') return new TypeError('YAHOO_PROVIDER_BODY_NETWORK_FAILED');
  if (result === 'provider_network') return new TypeError('YAHOO_PROVIDER_NETWORK_FAILED');
  return coordinatorError();
}

async function yahooProviderFetch(env, operation, fetcher, options, failureMessage) {
  const providerTimeoutMs = Math.max(100,
    Math.min(2500, Number(options.requestTimeoutMs) || 2500));
  const namespace = env?.YAHOO_REQUEST_COORDINATOR;
  if (namespace) {
    if (options.signal?.aborted) throw coordinatorError();
    const queueTimeoutMs = Math.max(500,
      Math.min(10000, Number(options.queueTimeoutMs) || 8000));
    let response;
    try {
      const id = namespace.idFromName(YAHOO_COORDINATOR_OBJECT_NAME);
      response = await namespace.get(id).fetch(YAHOO_COORDINATOR_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hoshilu-rate-deadline': String(Date.now() + queueTimeoutMs),
          'x-hoshilu-provider-timeout-ms': String(providerTimeoutMs)
        },
        body: JSON.stringify(operation),
        signal: boundedInternalSignal(options.signal,
          queueTimeoutMs + providerTimeoutMs + 500)
      });
    } catch {
      throw coordinatorError();
    }
    const result = String(response.headers.get(YAHOO_PROXY_RESULT_HEADER) || '');
    if (result === 'provider') return response;
    throw coordinatorOutcomeError(result);
  }
  if (env?.YAHOO_REQUEST_COORDINATOR_REQUIRED === 'true') throw coordinatorError();
  const providerUrl = buildYahooProviderUrl(operation, env?.YAHOO_SHOPPING_CLIENT_ID);
  if (!providerUrl) throw coordinatorError();
  const request = async () => {
    try {
      return await fetcher(providerUrl.toString(), {
        headers: { accept: 'application/json' },
        redirect: 'manual',
        signal: boundedRequestSignal(options.signal, providerTimeoutMs)
      });
    } catch (error) {
      throw fixedTransportError(error, failureMessage);
    }
  };
  const gate = options.requestGate || env?.[YAHOO_REQUEST_GATE] || null;
  return gate ? gate(request) : request();
}

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

export async function fetchYahooHighRatingRanking(env, query, fetcher = fetch, options = {}) {
  if (!yahooShoppingApiConfigured(env)) return [];
  const normalizedQuery = String(query || '').normalize('NFKC').trim().slice(0, 200);
  if (!normalizedQuery) return [];
  const response = await yahooProviderFetch(env, {
    v: 1, op: 'HIGH_RATING_TREND', query: normalizedQuery
  }, fetcher, options, 'YAHOO_HIGH_RATING_RANKING_FAILED');
  if (!response.ok) {
    const error = new Error('YAHOO_HIGH_RATING_RANKING_FAILED');
    error.status = Number(response.status) || 0;
    throw error;
  }
  try {
    return normalizeYahooHighRatingRanking(await response.json());
  } catch {
    throw new SyntaxError('YAHOO_PROVIDER_INVALID_JSON');
  }
}

export async function searchYahooShopping(env, keywords, fetcher = fetch, options = {}) {
  if (!yahooShoppingApiConfigured(env)) return [];
  const query = String(keywords || '').normalize('NFKC').trim().slice(0, 200);
  if (!query) return [];
  // seller_idを指定すると、その出店者(ストア)内だけを検索する。
  // Yahoo!ショッピング内のモール公式店(ZOZOTOWN等)を名指しで引くために使う。
  const sellerId = String(options.sellerId || '').trim();
  const response = await yahooProviderFetch(env, {
    v: 1,
    op: 'ITEM_SEARCH',
    query,
    seller_id: sellerId,
    sort: ['-review_count', '-score'].includes(options.sort) ? options.sort : ''
  }, fetcher, options, 'YAHOO_SHOPPING_SEARCH_FAILED');
  if (!response.ok) {
    const error = new Error('YAHOO_SHOPPING_SEARCH_FAILED');
    error.status = Number(response.status) || 0;
    // Never inspect/log provider error prose; it may echo the search query.
    error.providerCode = safeProviderErrorCode('', response.status, 'YAHOO_PROVIDER_FAILED');
    throw error;
  }
  try {
    return normalizeYahooShoppingItems(await response.json());
  } catch {
    throw new SyntaxError('YAHOO_PROVIDER_INVALID_JSON');
  }
}
