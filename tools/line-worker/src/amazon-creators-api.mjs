const MARKETPLACE = 'www.amazon.co.jp';
const API_URL = 'https://creatorsapi.amazon/catalog/v1/searchItems';
const TOKEN_ENDPOINTS = {
  '2.3': 'https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token',
  '3.3': 'https://api.amazon.co.jp/auth/o2/token'
};

let cachedToken = { key: '', value: '', expiresAt: 0 };

export function creatorsApiConfigured(env = {}) {
  return Boolean(
    String(env.AMAZON_CREATORS_CREDENTIAL_ID || '').trim() &&
    String(env.AMAZON_CREATORS_CREDENTIAL_SECRET || '').trim() &&
    String(env.AMAZON_ASSOCIATE_TAG || '').trim()
  );
}

function credentialVersion(env) {
  const value = String(env.AMAZON_CREATORS_CREDENTIAL_VERSION || '2.3').trim();
  return value === '3.3' ? value : '2.3';
}

async function accessToken(env, fetcher = fetch) {
  const id = String(env.AMAZON_CREATORS_CREDENTIAL_ID || '').trim();
  const secret = String(env.AMAZON_CREATORS_CREDENTIAL_SECRET || '').trim();
  const version = credentialVersion(env);
  const cacheKey = `${id}:${version}`;
  if (cachedToken.key === cacheKey && cachedToken.value && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const isV3 = version === '3.3';
  const response = await fetcher(TOKEN_ENDPOINTS[version], {
    method: 'POST',
    headers: { 'content-type': isV3 ? 'application/json' : 'application/x-www-form-urlencoded' },
    body: isV3
      ? JSON.stringify({ grant_type: 'client_credentials', client_id: id, client_secret: secret, scope: 'creatorsapi::default' })
      : new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret, scope: 'creatorsapi/default' })
  });
  if (!response.ok) throw new Error('AMAZON_CREATORS_TOKEN_FAILED');
  const payload = await response.json();
  if (!payload.access_token) throw new Error('AMAZON_CREATORS_TOKEN_INVALID');
  cachedToken = {
    key: cacheKey,
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in) || 3600) * 1000
  };
  return cachedToken.value;
}

function imageFor(item) {
  const primary = item?.images?.primary || {};
  return primary.large?.url || primary.medium?.url || primary.small?.url || '';
}

export function normalizeCreatorsItems(payload = {}) {
  const items = payload?.itemsResult?.items || payload?.searchResult?.items || [];
  return items.slice(0, 10).map((item, index) => ({
    rank: index + 1,
    asin: String(item.asin || ''),
    product_name: String(item?.itemInfo?.title?.displayValue || item.asin || ''),
    display_name: String(item?.itemInfo?.title?.displayValue || item.asin || ''),
    description: (item?.itemInfo?.features?.displayValues || []).slice(0, 2).join(' '),
    image: imageFor(item),
    image_url: imageFor(item),
    stock: 1,
    amazon_jp_url: String(item.detailPageURL || ''),
    marketplace_source: 'AMAZON_CREATORS_API',
    evidence: { matched_terms: [], information_score: Number(item.score || 0) }
  })).filter((item) => item.asin && item.product_name);
}

export async function searchAmazonCreators(env, keywords, fetcher = fetch) {
  if (!creatorsApiConfigured(env)) return [];
  const query = String(keywords || '').normalize('NFKC').trim().slice(0, 200);
  if (!query) return [];
  const version = credentialVersion(env);
  const token = await accessToken(env, fetcher);
  const authorization = version.startsWith('2.')
    ? `Bearer ${token}, Version ${version}`
    : `Bearer ${token}`;
  const response = await fetcher(API_URL, {
    method: 'POST',
    headers: {
      authorization,
      'content-type': 'application/json',
      'x-marketplace': MARKETPLACE
    },
    body: JSON.stringify({
      keywords: query,
      partnerTag: String(env.AMAZON_ASSOCIATE_TAG).trim(),
      marketplace: MARKETPLACE,
      itemCount: 10,
      searchIndex: 'All',
      resources: ['images.primary.medium', 'itemInfo.title', 'itemInfo.features']
    })
  });
  if (!response.ok) throw new Error('AMAZON_CREATORS_SEARCH_FAILED');
  return normalizeCreatorsItems(await response.json());
}

export function resetCreatorsTokenForTest() {
  cachedToken = { key: '', value: '', expiresAt: 0 };
}
