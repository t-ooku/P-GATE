const MARKETPLACE = 'www.amazon.co.jp';
const API_URL = 'https://creatorsapi.amazon/catalog/v1/searchItems';
const TOKEN_ENDPOINTS = {
  '2.3': 'https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token',
  '3.3': 'https://api.amazon.co.jp/auth/o2/token'
};
const VALID_CREDENTIAL_VERSIONS = new Set(Object.keys(TOKEN_ENDPOINTS));
const PRODUCT_CACHE_TTL_MS = 60 * 60 * 1000;
const PRODUCT_CACHE_MAX_ENTRIES = 32;
const MAX_TRANSIENT_RETRIES = 2;

let cachedToken = { key: '', value: '', expiresAt: 0 };
const productCache = new Map();

export function creatorsApiConfigured(env = {}) {
  return Boolean(
    String(env.AMAZON_CREATORS_CREDENTIAL_ID || '').trim() &&
    String(env.AMAZON_CREATORS_CREDENTIAL_SECRET || '').trim() &&
    VALID_CREDENTIAL_VERSIONS.has(String(env.AMAZON_CREATORS_CREDENTIAL_VERSION || '').trim()) &&
    String(env.AMAZON_ASSOCIATE_TAG || '').trim()
  );
}

function credentialVersion(env) {
  const value = String(env.AMAZON_CREATORS_CREDENTIAL_VERSION || '').trim();
  if (!VALID_CREDENTIAL_VERSIONS.has(value)) {
    throw new Error('AMAZON_CREATORS_CREDENTIAL_VERSION_INVALID');
  }
  return value;
}

function tokenCacheKey(env, version) {
  return `${String(env.AMAZON_CREATORS_CREDENTIAL_ID || '').trim()}:${version}`;
}

function invalidateToken(env, version) {
  if (cachedToken.key === tokenCacheKey(env, version)) {
    cachedToken = { key: '', value: '', expiresAt: 0 };
  }
}

async function accessToken(env, fetcher = fetch, now = Date.now) {
  const id = String(env.AMAZON_CREATORS_CREDENTIAL_ID || '').trim();
  const secret = String(env.AMAZON_CREATORS_CREDENTIAL_SECRET || '').trim();
  const version = credentialVersion(env);
  const cacheKey = tokenCacheKey(env, version);
  if (cachedToken.key === cacheKey && cachedToken.value && cachedToken.expiresAt > now() + 60_000) {
    return cachedToken.value;
  }
  const isV3 = version === '3.3';
  const response = await fetcher(TOKEN_ENDPOINTS[version], {
    method: 'POST',
    headers: { 'content-type': isV3 ? 'application/json' : 'application/x-www-form-urlencoded' },
    body: isV3
      ? JSON.stringify({ grant_type: 'client_credentials', client_id: id, client_secret: secret, scope: 'creatorsapi::default' })
      : new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret, scope: 'creatorsapi/default' }),
    redirect: 'error'
  });
  if (!response.ok) throw new Error('AMAZON_CREATORS_TOKEN_FAILED');
  const payload = await response.json();
  if (!payload.access_token) throw new Error('AMAZON_CREATORS_TOKEN_INVALID');
  cachedToken = {
    key: cacheKey,
    value: payload.access_token,
    expiresAt: now() + Math.max(60, Number(payload.expires_in) || 3600) * 1000
  };
  return cachedToken.value;
}

function imageUrlsFor(item) {
  // Amazon Creators API公式Images resourceはprimaryとvariantsを返す。
  // https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/resources/images
  // 取得元に存在する画像だけを使い、HOSHILU側で画像を生成・推測しない。
  const images = item?.images || {};
  const values = [images.primary, ...(Array.isArray(images.variants) ? images.variants : [])]
    .map((image) => image?.large?.url || image?.medium?.url || image?.small?.url || '')
    .map((value) => String(value || '').trim())
    .filter((value) => /^https:\/\//i.test(value));
  return [...new Set(values)].slice(0, 8);
}

function listingFor(item) {
  return item?.offersV2?.listings?.[0] || item?.offers?.listings?.[0] || null;
}

function listingAvailability(listing) {
  if (!listing) return 'UNKNOWN';
  const availability = listing.availability || {};
  if (availability.isInStock === true || listing.isBuyable === true) return 'IN_STOCK';
  if (availability.isInStock === false || listing.isBuyable === false) return 'OUT_OF_STOCK';
  const text = String(
    availability.type ||
    availability.value ||
    availability.displayValue ||
    availability.message ||
    listing.availabilityType ||
    ''
  ).toUpperCase();
  if (/(?:IN_STOCK|AVAILABLE|NOW)/.test(text)) return 'IN_STOCK';
  if (/(?:OUT_OF_STOCK|UNAVAILABLE|NOT_AVAILABLE)/.test(text)) return 'OUT_OF_STOCK';
  return 'UNKNOWN';
}

function listingPrice(listing) {
  const price = listing?.price || {};
  const money = price.money || price;
  return {
    amount: Number(money.amount ?? price.amount ?? 0),
    currency: String(money.currency || money.currencyCode || price.currency || price.currencyCode || 'JPY')
  };
}

export function normalizeCreatorsItems(payload = {}) {
  const items = payload?.itemsResult?.items || payload?.searchResult?.items || [];
  return items.slice(0, 30).map((item, index) => {
    const listing = listingFor(item);
    const stockStatus = listingAvailability(listing);
    const price = listingPrice(listing);
    const productUrl = String(item.detailPageURL || '');
    const imageUrls = imageUrlsFor(item);
    return {
      rank: index + 1,
      asin: String(item.asin || ''),
      product_name: String(item?.itemInfo?.title?.displayValue || item.asin || ''),
      display_name: String(item?.itemInfo?.title?.displayValue || item.asin || ''),
      description: (item?.itemInfo?.features?.displayValues || []).slice(0, 2).join(' '),
      image: imageUrls[0] || '',
      image_url: imageUrls[0] || '',
      image_urls: imageUrls,
      stock: stockStatus === 'IN_STOCK' ? 1 : 0,
      amazon_jp_url: productUrl,
      offers: productUrl ? [{
        marketplace: 'AMAZON_JP',
        product_url: productUrl,
        price: price.amount,
        total_cost: price.amount,
        currency: price.currency,
        stock_status: stockStatus,
        source: 'amazon_creators_api'
      }] : [],
      marketplace_source: 'AMAZON_CREATORS_API',
      evidence: { matched_terms: [], information_score: Number(item.score || 0) }
    };
  }).filter((item) => item.asin && item.product_name);
}

function retryAfterMs(response, now = Date.now) {
  const value = String(response.headers.get('retry-after') || '').trim();
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now()) : 0;
}

async function productCacheKey(env, version, query) {
  const material = [
    String(env.AMAZON_CREATORS_CREDENTIAL_ID || '').trim(),
    version,
    String(env.AMAZON_ASSOCIATE_TAG || '').trim(),
    MARKETPLACE,
    query
  ].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function pruneProductCache(nowValue) {
  for (const [key, cached] of productCache) {
    if (!cached || cached.expiresAt <= nowValue) productCache.delete(key);
  }
  while (productCache.size > PRODUCT_CACHE_MAX_ENTRIES) {
    productCache.delete(productCache.keys().next().value);
  }
}

function cacheProducts(cacheKey, items, nowValue) {
  pruneProductCache(nowValue);
  productCache.delete(cacheKey);
  while (productCache.size >= PRODUCT_CACHE_MAX_ENTRIES) {
    productCache.delete(productCache.keys().next().value);
  }
  productCache.set(cacheKey, {
    items: structuredClone(items),
    expiresAt: nowValue + PRODUCT_CACHE_TTL_MS
  });
}

function validateCreatorsPayload(payload) {
  if (Array.isArray(payload?.errors) && payload.errors.length) {
    throw new Error('AMAZON_CREATORS_PARTIAL_ERROR');
  }
  return payload;
}

export async function searchAmazonCreators(env, keywords, fetcher = fetch, options = {}) {
  const hasCredentials = Boolean(
    String(env?.AMAZON_CREATORS_CREDENTIAL_ID || '').trim() &&
    String(env?.AMAZON_CREATORS_CREDENTIAL_SECRET || '').trim() &&
    String(env?.AMAZON_ASSOCIATE_TAG || '').trim()
  );
  if (!hasCredentials) return [];
  const version = credentialVersion(env);
  const query = String(keywords || '').normalize('NFKC').trim().slice(0, 200);
  if (!query) return [];
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const cacheNow = now();
  pruneProductCache(cacheNow);
  const cacheKey = await productCacheKey(env, version, query);
  const cached = productCache.get(cacheKey);
  if (cached && cached.expiresAt > cacheNow) {
    // Map insertion order is the LRU order; touching a hit moves it newest.
    productCache.delete(cacheKey);
    productCache.set(cacheKey, cached);
    return structuredClone(cached.items);
  }

  let authRetried = false;
  let transientRetries = 0;
  while (true) {
    const token = await accessToken(env, fetcher, now);
    const authorization = version === '2.3'
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
        languagesOfPreference: ['ja_JP'],
        currencyOfPreference: 'JPY',
        itemCount: 10,
        searchIndex: 'All',
        resources: [
          'images.primary.large',
          'images.primary.medium',
          'images.variants.large',
          'images.variants.medium',
          'itemInfo.title',
          'itemInfo.features',
          'offersV2.listings.availability',
          'offersV2.listings.price'
        ]
      }),
      redirect: 'error'
    });
    if (response.status === 401 && !authRetried) {
      authRetried = true;
      invalidateToken(env, version);
      continue;
    }
    if ((response.status === 429 || response.status >= 500) && transientRetries < MAX_TRANSIENT_RETRIES) {
      const delay = retryAfterMs(response, now) || 250 * (2 ** transientRetries);
      transientRetries += 1;
      await sleep(delay);
      continue;
    }
    if (!response.ok) throw new Error('AMAZON_CREATORS_SEARCH_FAILED');
    const items = normalizeCreatorsItems(validateCreatorsPayload(await response.json()));
    if (items.some((item) => item.offers.length)) {
      cacheProducts(cacheKey, items, now());
    }
    return items;
  }
}

export function resetCreatorsTokenForTest() {
  cachedToken = { key: '', value: '', expiresAt: 0 };
  productCache.clear();
}

export const amazonCreatorsCacheTest = {
  maxEntries: PRODUCT_CACHE_MAX_ENTRIES,
  snapshot: () => [...productCache].map(([key, value]) => ({ key, expiresAt: value.expiresAt })),
  prune: pruneProductCache
};
