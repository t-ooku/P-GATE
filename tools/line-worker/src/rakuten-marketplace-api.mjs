import {
  isRakutenAffiliateProductUrl,
  isRakutenDirectProductUrl
} from './rakuten-url-policy.mjs';

const API_URL = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';

export function rakutenApiConfigured(env = {}) {
  return Boolean(String(env.RAKUTEN_APPLICATION_ID || '').trim() && String(env.RAKUTEN_ACCESS_KEY || '').trim());
}

function unwrapItem(value) {
  return value?.Item || value?.item || value || {};
}

export function normalizeRakutenItems(payload = {}) {
  const values = payload.items || payload.Items || [];
  return values.slice(0, 10).map((value, index) => {
    const item = unwrapItem(value);
    const affiliateUrl = String(item.affiliateUrl || '').trim();
    const regularUrl = String(item.itemUrl || item.itemUrlPC || '').trim();
    const productUrl = isRakutenAffiliateProductUrl(affiliateUrl)
      ? affiliateUrl
      : (isRakutenDirectProductUrl(regularUrl) ? regularUrl : '');
    const image = String(item.mediumImageUrls?.[0]?.imageUrl || item.mediumImageUrls?.[0] || item.smallImageUrls?.[0]?.imageUrl || item.smallImageUrls?.[0] || '').trim();
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

export async function searchRakutenMarketplace(env, keywords, fetcher = fetch) {
  if (!rakutenApiConfigured(env)) return [];
  const query = String(keywords || '').normalize('NFKC').trim().slice(0, 200);
  if (!query) return [];
  const url = new URL(API_URL);
  url.searchParams.set('applicationId', String(env.RAKUTEN_APPLICATION_ID).trim());
  url.searchParams.set('accessKey', String(env.RAKUTEN_ACCESS_KEY).trim());
  url.searchParams.set('keyword', query);
  url.searchParams.set('hits', '10');
  url.searchParams.set('formatVersion', '2');
  url.searchParams.set('elements', 'itemName,itemCode,itemPrice,itemUrl,affiliateUrl,mediumImageUrls,smallImageUrls,catchcopy,itemCaption,availability,postageFlag');
  const affiliateId = String(env.RAKUTEN_AFFILIATE_ID || '').trim();
  if (affiliateId) url.searchParams.set('affiliateId', affiliateId);
  const request = async (requestUrl) => {
    const response = await fetcher(requestUrl.toString(), { headers: { accept: 'application/json' } });
    if (response.ok) return response.json();
    let providerCode = '';
    try {
      const payload = await response.json();
      providerCode = String(payload?.error || '').slice(0, 80);
    } catch {}
    const error = new Error('RAKUTEN_MARKETPLACE_SEARCH_FAILED');
    error.status = Number(response.status) || 0;
    error.providerCode = providerCode;
    throw error;
  };
  const payload = await request(url);
  const normalized = normalizeRakutenItems(payload);
  if (normalized.length || !(payload?.items || payload?.Items || []).length || !affiliateId) {
    return normalized;
  }

  // If Rakuten changes its affiliate redirect shape, never expose an unverified
  // redirect. Re-fetch the same confirmed items as direct official product URLs.
  url.searchParams.delete('affiliateId');
  return normalizeRakutenItems(await request(url));
}

export async function searchRakutenMarketplaceWithFallback(
  env,
  keywordCandidates,
  fetcher = fetch
) {
  const candidates = [...new Set(
    (Array.isArray(keywordCandidates) ? keywordCandidates : [keywordCandidates])
      .map((value) => String(value || '').normalize('NFKC').trim())
      .filter(Boolean)
  )].slice(0, 2);
  for (const keywords of candidates) {
    const results = await searchRakutenMarketplace(env, keywords, fetcher);
    if (results.length) return results;
  }
  return [];
}
