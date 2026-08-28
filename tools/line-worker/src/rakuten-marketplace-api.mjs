import {
  isRakutenAffiliateProductUrl,
  isRakutenDirectProductUrl
} from './rakuten-url-policy.mjs';
import { filterCategoryMismatches } from './knowledge-search.mjs';
import { safeProviderErrorCode } from './provider-error-code.mjs';

const API_URL = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
// The migrated Rakuten endpoint regularly needs more than 2.5 seconds before
// the first response byte (live observations on 2026-08-20: 3.8-6.5s). Keep
// the provider budget below the public /api/knowledge 15s fetch deadline, but
// long enough that a healthy Rakuten response is not discarded as a timeout.
export const RAKUTEN_REQUEST_TIMEOUT_MS = 7000;

export function rakutenApiConfigured(env = {}) {
  return Boolean(String(env.RAKUTEN_APPLICATION_ID || '').trim() && String(env.RAKUTEN_ACCESS_KEY || '').trim());
}

function unwrapItem(value) {
  return value?.Item || value?.item || value || {};
}

export function normalizeRakutenItems(payload = {}) {
  const values = payload.items || payload.Items || [];
  return values.slice(0, 30).map((value, index) => {
    const item = unwrapItem(value);
    const affiliateUrl = String(item.affiliateUrl || '').trim();
    const regularUrl = String(item.itemUrl || item.itemUrlPC || '').trim();
    const productUrl = isRakutenAffiliateProductUrl(affiliateUrl)
      ? affiliateUrl
      : (isRakutenDirectProductUrl(regularUrl) ? regularUrl : '');
    const imageUrls = [...(Array.isArray(item.mediumImageUrls) ? item.mediumImageUrls : []), ...(Array.isArray(item.smallImageUrls) ? item.smallImageUrls : [])]
      .map((value) => String(value?.imageUrl || value || '').trim())
      .filter((value) => /^https:\/\//i.test(value));
    const uniqueImageUrls = [...new Set(imageUrls)].slice(0, 8);
    const image = uniqueImageUrls[0] || '';
    const itemCode = String(item.itemCode || item.productId || '').trim();
    const name = String(item.itemName || item.productName || '').trim();
    const price = Number(item.itemPrice || item.minPrice || 0);
    const shippingIncluded = Number(item.postageFlag) === 0;
    return {
      rank: index + 1,
      record_key: itemCode ? `RAKUTEN:${itemCode}` : `RAKUTEN:${productUrl}`,
      product_name: name,
      display_name: name,
      description: String(item.catchcopy || item.itemCaption || '').trim().slice(0, 500),
      image,
      image_url: image,
      image_urls: uniqueImageUrls,
      stock: productUrl ? 1 : 0,
      marketplace_source: 'RAKUTEN_ICHIBA_API',
      offers: productUrl ? [{
        marketplace: 'RAKUTEN_JP',
        product_url: productUrl,
        price,
        shipping_fee: shippingIncluded ? 0 : null,
        total_cost: shippingIncluded ? price : 0,
        shipping_fee_confirmed: shippingIncluded,
        currency: 'JPY',
        stock_status: item.availability === 0 ? 'OUT_OF_STOCK' : 'IN_STOCK',
        source: 'rakuten_ichiba_api'
      }] : [],
      evidence: { matched_terms: [], information_score: 0 }
    };
  }).filter((item) => item.product_name && item.offers.length);
}

export async function searchRakutenMarketplace(env, keywords, fetcher = fetch, requestId = '', options = {}) {
  if (!rakutenApiConfigured(env)) return [];
  const query = String(keywords || '').normalize('NFKC').trim().slice(0, 200);
  if (!query) return [];
  const url = new URL(API_URL);
  url.searchParams.set('applicationId', String(env.RAKUTEN_APPLICATION_ID).trim());
  url.searchParams.set('accessKey', String(env.RAKUTEN_ACCESS_KEY).trim());
  url.searchParams.set('keyword', query);
  // shopCodeは公式ドキュメントでkeywordと併用可と明記されている
  // (「検索キーワード・ジャンルID・商品コード・ショップコードのいずれかが必須」)。
  // 楽天市場内のモール公式店(ハンズ/マツキヨ/@cosme/ABC-MART)を名指しで
  // 引くために使う。
  const shopCode = String(options.shopCode || '').trim();
  if (shopCode) {
    url.searchParams.set('shopCode', shopCode);
    // 1店舗内の検索なので30件も要らない。呼び出し1回あたりの負荷を下げる。
    url.searchParams.set('hits', '10');
  } else {
    url.searchParams.set('hits', '30');
  }
  url.searchParams.set('formatVersion', '2');
  url.searchParams.set('elements', 'itemName,itemCode,itemPrice,itemUrl,affiliateUrl,mediumImageUrls,smallImageUrls,catchcopy,itemCaption,availability,postageFlag');
  const affiliateId = String(env.RAKUTEN_AFFILIATE_ID || '').trim();
  if (affiliateId) url.searchParams.set('affiliateId', affiliateId);
  // 2026-08 Rakuten platform migration: the new openapi.rakuten.co.jp
  // endpoint enforces the app's registered "許可されたウェブサイト" (allowed
  // website) via the request's HTTP Referer, rejecting server-to-server
  // calls with no Referer as 403 REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING
  // (reproduced directly against this exact endpoint/credentials). A backend
  // fetch has no natural Referer, so both Referer and Origin must be set
  // explicitly to the app's registered hoshilu.app website.
  const request = async (requestUrl) => {
    const response = await fetcher(requestUrl.toString(), {
      headers: { accept: 'application/json', referer: 'https://hoshilu.app/', origin: 'https://hoshilu.app' },
      redirect: 'manual',
      signal: AbortSignal.timeout(RAKUTEN_REQUEST_TIMEOUT_MS)
    });
    if (response.ok) return response.json();
    const error = new Error('RAKUTEN_MARKETPLACE_SEARCH_FAILED');
    error.status = Number(response.status) || 0;
    // Never inspect/log provider error prose; it may echo the search query.
    error.providerCode = safeProviderErrorCode('', response.status, 'RAKUTEN_PROVIDER_FAILED');
    throw error;
  };
  // v3.2/v3.4 CTO instruction: 楽天だけの①API送信/②レスポンス件数を、同一
  // requestIdで必ずログ出力する。
  // v4.2 項目12 プライバシー監査: 同意画面の「質問本文はサーバーログへ
  // 保存しません」という約束を守るため、ユーザーの検索文に由来する
  // keywords文字列そのものはログへ出さず、文字数だけを残す。
  console.info('RAKUTEN_PIPELINE_TRACE', { requestId, stage: '1_api_request', keywords_length: String(query || '').length, affiliate_id_present: Boolean(affiliateId) });
  const payload = await request(url);
  const rawItemCount = (payload?.items || payload?.Items || []).length;
  const normalized = normalizeRakutenItems(payload);
  console.info('RAKUTEN_PIPELINE_TRACE', {
    requestId,
    stage: '2_api_response',
    keywords_length: String(query || '').length,
    raw_item_count: rawItemCount,
    normalized_item_count: normalized.length,
    dropped_by_normalization: rawItemCount - normalized.length
  });
  if (normalized.length || !rawItemCount || !affiliateId) {
    return normalized;
  }

  // If Rakuten changes its affiliate redirect shape, never expose an unverified
  // redirect. Re-fetch the same confirmed items as direct official product URLs.
  url.searchParams.delete('affiliateId');
  console.info('RAKUTEN_PIPELINE_TRACE', { requestId, stage: '2b_api_retry_without_affiliate', keywords_length: String(query || '').length });
  const retried = normalizeRakutenItems(await request(url));
  console.info('RAKUTEN_PIPELINE_TRACE', { requestId, stage: '2c_api_retry_response', keywords_length: String(query || '').length, normalized_item_count: retried.length });
  return retried;
}

// query is optional: when provided, a keyword candidate is only accepted if
// at least one result survives filterCategoryMismatches (see the matching
// change in index.mjs's searchMarketplaceApiWithFallback for why - a
// non-empty but entirely category-mismatched response must not stop the
// fallback cascade before a cleaner candidate is tried).
export async function searchRakutenMarketplaceWithFallback(
  env,
  keywordCandidates,
  fetcher = fetch,
  query = '',
  requestId = '',
  fallbackQuery = ''
) {
  const candidates = [...new Set(
    (Array.isArray(keywordCandidates) ? keywordCandidates : [keywordCandidates])
      .map((value) => String(value || '').normalize('NFKC').trim())
      .filter(Boolean)
  )].slice(0, 3);
  // Run all bounded variants concurrently, then inspect them in preference
  // order. Selection quality is unchanged, while latency is capped at one
  // provider timeout window instead of primary + fallback windows.
  const outcomes = await Promise.allSettled(candidates.map((keywords) =>
    searchRakutenMarketplace(env, keywords, fetcher, requestId)));
  let firstFailure = null;
  for (const outcome of outcomes) {
    if (outcome.status !== 'fulfilled') {
      firstFailure ||= outcome.reason;
      continue;
    }
    const results = Array.isArray(outcome.value) ? outcome.value : [];
    if (!results.length) continue;
    if (!query || filterCategoryMismatches(query, results).length) return results;
    // AI変換語に一致しない結果でも、AI前の検索条件には適合するなら採用する。
    // 原文とAI語をAND結合しないため、誤変換時にも正しい商品を救済できる。
    if (fallbackQuery && fallbackQuery !== query && filterCategoryMismatches(fallbackQuery, results).length) return results;
  }
  if (firstFailure && outcomes.every((outcome) => outcome.status === 'rejected')) throw firstFailure;
  return [];
}
