// 2026-09-19 大隆さん決定「楽天と Yahoo! 以外のモールで 0 件のときだけ公式 Google 検索」→
// 「楽天と Yahoo! で見つかっても、他のモールで見つかっていなければ Google 検索」。
// HOSHILU が商品データを持たない 11 モール（Amazon・Qoo10・SHEIN・ZOZOTOWN・BUYMA・SHOPLIST・
// MUSINSA・SNKRDUNK・ロフト・ハンズ・マツキヨ）は、Google Programmable Search（Custom Search JSON API、
// 大隆さんが 11 モールのドメインだけを登録した検索エンジン）の結果をカードで出す。
// SERP スクレイピング業者は使わない。楽天・Yahoo! は従来の API 検索のまま。
//
// 守ること:
// - 1 日の上限（既定 95。無料枠 100/日の手前）を D1 で予約してから呼ぶ。超えたら静かに出さない
// - 同じ検索語は 24 時間 Cache API に置く（上限を消費しない）
// - 価格は pagemap に載っている時だけ「ページ記載の価格（確認時点）」として返す。API 確認価格と混ぜない
// - 検索語以外（個人情報・セッション）は Google に送らない
// - 失敗しても本検索は止めない（呼び出し側は必ず try/catch）

const DEFAULT_DAILY_LIMIT = 95;
const MAX_DAILY_LIMIT = 10000;
const RESULT_LIMIT = 8;
const CACHE_TTL_SECONDS = 86400;
const REQUEST_TIMEOUT_MS = 2500;

// 検索エンジンに登録したホストと表示名。ここに無いホストの結果は捨てる（Google 側の設定ミスや
// 広告ドメインが混ざっても、13 モール以外へは送客しない）。
export const GOOGLE_MALL_HOSTS = Object.freeze([
  { host: 'amazon.co.jp', marketplace: 'AMAZON_JP', label: 'Amazon' },
  { host: 'qoo10.jp', marketplace: 'QOO10_JP', label: 'Qoo10' },
  { host: 'shein.com', marketplace: 'SHEIN_JP', label: 'SHEIN' },
  { host: 'zozo.jp', marketplace: 'ZOZOTOWN_JP', label: 'ZOZOTOWN' },
  { host: 'buyma.com', marketplace: 'BUYMA_JP', label: 'BUYMA' },
  { host: 'shop-list.com', marketplace: 'SHOPLIST_JP', label: 'SHOPLIST' },
  { host: 'musinsa.com', marketplace: 'MUSINSA_JP', label: 'MUSINSA' },
  { host: 'snkrdunk.com', marketplace: 'SNKRDUNK_JP', label: 'スニーカーダンク' },
  { host: 'loft.co.jp', marketplace: 'LOFT_JP', label: 'ロフト' },
  { host: 'hands.net', marketplace: 'HANDS_JP', label: 'ハンズ' },
  { host: 'matsukiyo.co.jp', marketplace: 'MATSUKIYO_JP', label: 'マツキヨ' },
  { host: 'matsukiyococokara-online.com', marketplace: 'MATSUKIYO_JP', label: 'マツキヨココカラ' }
]);

const NON_PRODUCT_PATH = /(?:\/search|\/s\/?$|\/s\?|\/ranking|\/category|\/categories|\/brand\/?$|\/shop\/?$|\/help|\/guide|\/campaign|\/event|\/news|\/feature|\/tag\/|\/list\/?$)/iu;

export function googleMallSearchConfigured(env = {}) {
  return String(env.GOOGLE_CSE_ID || '').trim().length >= 8
    && String(env.GOOGLE_CSE_KEY || '').trim().length >= 20
    && String(env.GOOGLE_MALL_SEARCH_ENABLED ?? 'true').toLowerCase() !== 'false';
}

export function googleMallSearchDailyLimit(env = {}) {
  const configured = Number(env.GOOGLE_MALL_SEARCH_DAILY_LIMIT);
  return Number.isInteger(configured) && configured >= 1 && configured <= MAX_DAILY_LIMIT
    ? configured : DEFAULT_DAILY_LIMIT;
}

// Google の無料枠は太平洋時間の日付で切り替わる（Cloud の課金日）。UTC で数えると最大 8 時間ずれる。
export function googleBillingDayKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  const key = `${pick('year')}-${pick('month')}-${pick('day')}`;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(key)) throw new Error('GOOGLE_MALL_SEARCH_DAY_UNAVAILABLE');
  return key;
}

export function mallForHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/u, '');
  return GOOGLE_MALL_HOSTS.find((item) => host === item.host || host.endsWith(`.${item.host}`)) || null;
}

function cleanText(value, limit) {
  return String(value || '').normalize('NFKC').replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, limit);
}

function firstImage(pagemap = {}) {
  const candidates = [
    pagemap?.cse_image?.[0]?.src,
    pagemap?.metatags?.[0]?.['og:image'],
    pagemap?.metatags?.[0]?.['twitter:image'],
    pagemap?.product?.[0]?.image,
    pagemap?.cse_thumbnail?.[0]?.src
  ];
  for (const value of candidates) {
    const text = String(value || '').trim();
    if (/^https:\/\/[^\s"'<>]+$/iu.test(text) && text.length <= 1000) return text;
  }
  return '';
}

// pagemap の価格は「ページに書いてあった値」であって API 確認価格ではない。数字だけ拾い、通貨が円で
// 無い場合は捨てる（SHEIN 等は USD で載ることがある）。
function pageListedPrice(pagemap = {}) {
  const meta = pagemap?.metatags?.[0] || {};
  const rows = [
    [pagemap?.offer?.[0]?.price, pagemap?.offer?.[0]?.pricecurrency],
    [pagemap?.product?.[0]?.price, pagemap?.product?.[0]?.pricecurrency],
    [meta['product:price:amount'], meta['product:price:currency']],
    [meta['og:price:amount'], meta['og:price:currency']]
  ];
  for (const [amount, currency] of rows) {
    const text = String(amount || '').replace(/[,，¥￥円\s]/gu, '');
    if (!/^\d{2,8}(?:\.\d{1,2})?$/u.test(text)) continue;
    const code = String(currency || 'JPY').toUpperCase();
    if (code !== 'JPY') continue;
    const value = Math.round(Number(text));
    if (value >= 10 && value <= 100000000) return value;
  }
  return 0;
}

export function parseGoogleMallItems(payload = {}) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const seen = new Set();
  const products = [];
  const others = [];
  for (const item of items) {
    let url;
    try { url = new URL(String(item?.link || '')); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password) continue;
    const mall = mallForHost(url.hostname);
    if (!mall) continue;
    url.hash = '';
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = {
      title: cleanText(item?.title, 200),
      snippet: cleanText(item?.snippet, 300),
      url: key,
      marketplace: mall.marketplace,
      mall_label: mall.label,
      image_url: firstImage(item?.pagemap),
      listed_price_jpy: pageListedPrice(item?.pagemap)
    };
    if (!entry.title) continue;
    (NON_PRODUCT_PATH.test(url.pathname + url.search) ? others : products).push(entry);
  }
  return products.concat(others).slice(0, RESULT_LIMIT);
}

export async function reserveGoogleMallSearchRequest(env = {}, now = new Date()) {
  if (!env.PRODUCT_DB?.prepare) return Object.freeze({ allowed: false, reason: 'BUDGET_GUARD_UNAVAILABLE' });
  let day;
  try { day = googleBillingDayKey(now); } catch { return Object.freeze({ allowed: false, reason: 'BUDGET_GUARD_UNAVAILABLE' }); }
  const limit = googleMallSearchDailyLimit(env);
  const timestamp = now.toISOString();
  try {
    const row = await env.PRODUCT_DB.prepare(
      `INSERT INTO google_mall_search_usage_daily
      (usage_day,reserved_requests,daily_limit,created_at,updated_at)
      VALUES(?1,1,?2,?3,?3)
      ON CONFLICT(usage_day) DO UPDATE SET
        reserved_requests=reserved_requests+1,daily_limit=?2,updated_at=?3
      WHERE reserved_requests<?2
      RETURNING reserved_requests,daily_limit`
    ).bind(day, limit, timestamp).first();
    if (!row) return Object.freeze({ allowed: false, reason: 'DAILY_LIMIT_REACHED' });
    return Object.freeze({ allowed: true, reason: '', request_count: Number(row.reserved_requests) || 1, daily_limit: limit });
  } catch {
    return Object.freeze({ allowed: false, reason: 'BUDGET_GUARD_UNAVAILABLE' });
  }
}

export function normalizeGoogleMallQuery(query) {
  return String(query || '').normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, 120);
}

function cacheKeyFor(query) {
  return `https://google-mall-search.hoshilu.internal/v1?q=${encodeURIComponent(query)}`;
}

// 戻り値: { items, source: 'cache'|'live'|'disabled'|'limit'|'error', reason }
export async function searchGoogleMalls(env = {}, rawQuery, options = {}) {
  const fetchImpl = options.fetch || fetch;
  const now = options.now || new Date();
  const query = normalizeGoogleMallQuery(rawQuery);
  if (!query) return { items: [], source: 'disabled', reason: 'EMPTY_QUERY' };
  if (!googleMallSearchConfigured(env)) return { items: [], source: 'disabled', reason: 'NOT_CONFIGURED' };
  const cache = options.cache === null ? null : (options.cache || (globalThis.caches?.default ?? null));
  const cacheRequest = new Request(cacheKeyFor(query));
  if (cache) {
    try {
      const hit = await cache.match(cacheRequest);
      if (hit) {
        const cached = await hit.json();
        if (Array.isArray(cached?.items)) return { items: cached.items, source: 'cache', reason: '' };
      }
    } catch {}
  }
  const budget = await reserveGoogleMallSearchRequest(env, now);
  if (!budget.allowed) return { items: [], source: 'limit', reason: budget.reason };
  const endpoint = new URL('https://www.googleapis.com/customsearch/v1');
  endpoint.searchParams.set('key', String(env.GOOGLE_CSE_KEY).trim());
  endpoint.searchParams.set('cx', String(env.GOOGLE_CSE_ID).trim());
  endpoint.searchParams.set('q', query);
  endpoint.searchParams.set('num', '10');
  endpoint.searchParams.set('hl', 'ja');
  endpoint.searchParams.set('gl', 'jp');
  endpoint.searchParams.set('safe', 'active');
  endpoint.searchParams.set('fields', 'items(title,link,snippet,pagemap(cse_image,cse_thumbnail,metatags,product,offer))');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(endpoint.toString(), { method: 'GET', signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) return { items: [], source: 'error', reason: `HTTP_${response.status}` };
    const payload = await response.json();
    const items = parseGoogleMallItems(payload);
    if (cache) {
      try {
        await cache.put(cacheRequest, new Response(JSON.stringify({ items, cached_at: now.toISOString() }), {
          headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` }
        }));
      } catch {}
    }
    return { items, source: 'live', reason: '' };
  } catch (error) {
    return { items: [], source: 'error', reason: error?.name === 'AbortError' ? 'TIMEOUT' : 'FETCH_FAILED' };
  } finally {
    clearTimeout(timer);
  }
}
