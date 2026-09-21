// 2026-09-20 GPT 指示書（大隆さん承認）§12〜§16: 楽天・Yahoo! は API 検索のまま。その他のモールは、
// 「そのモールから HOSHILU 自身の結果が 0 件」のときだけ Google 公式の Agent Search（Website Search、
// 大隆さんが 11 モールのドメインを登録した検索アプリ）へフォールバックする。
// Custom Search JSON API（新規利用停止・2027-01-01 廃止）と SERP スクレイピング業者は使わない。
//
// 守ること:
// - 不足モールをまとめて 1 リクエスト。同じ検索語は 24 時間 Cache API（上限を消費しない）
// - 1 日の上限（既定 300 ≒ 月 9,000。無料枠 10,000/月の手前）を D1 で予約してから呼ぶ。超えたら静かに出さない
// - 商品詳細 URL 候補だけ残す（カテゴリ・検索一覧・店舗・ブランド TOP・記事・ランキング等は除外）
// - 価格は pagemap に載っている時だけ「ページ記載の価格（確認時点）」。API 確認価格と混ぜない。JPY 以外は捨てる
// - 検索語以外（個人情報・セッション）は Google に送らない
// - 失敗しても本検索は止めない（呼び出し側は必ず try/catch）

import { rerankGoogleMallItems } from './google-mall-brand-ranking.mjs';

const DEFAULT_DAILY_LIMIT = 300;
const MAX_DAILY_LIMIT = 10000;
const RESULT_LIMIT = 20;
const CACHE_TTL_SECONDS = 86400;
// 2026-09-20 大隆さん報告で確定: 0 件の結果まで 24 時間キャッシュしていたため、綴り補正を入れた後も
// 同じ検索語は空のキャッシュに当たり続けた（本番ログ cache:RAW_0=4）。0 件は 10 分だけ。
const EMPTY_CACHE_TTL_SECONDS = 600;
// 2026-09-20: Agent Search の初回応答は 3 秒を超えることがあり TIMEOUT で枠が出なかった。本検索と並行なので 7 秒まで待つ。
const REQUEST_TIMEOUT_MS = 7000;
const TOKEN_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SEARCH_ENDPOINT = 'https://discoveryengine.googleapis.com/v1';

// 検索アプリに登録したホストと表示名。ここに無いホストの結果は捨てる（Google 側の設定ミスや
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

// §16: 商品詳細ページ以外は落とす。パス・クエリの型で判定（店ごとの細かい規則は追って足す）。
const NON_PRODUCT_PATH = /(?:\/search|\/s\/?$|\/s\?|\/ranking|\/category|\/categories|\/brand\/?$|\/brands?\/|\/shop\/?$|\/help|\/guide|\/campaign|\/event|\/news|\/feature|\/tag\/|\/list\/?$|\/blog|\/magazine|\/article|\/faq|\/about|\/kids-category|\/women-category|\/men-category|[?&](?:k|q|keyword|p|s)=)/iu;

// 2026-09-21 大隆さん報告（スクリーンショット「Amazon.co.jp: 燃焼系サプリメント - ダイエットサプリメント」）:
// Amazon のカテゴリ（ブラウズノード）ページが商品として出ていた。Amazon は商品ページの形が
// はっきりしている（/dp/ASIN か /gp/product/ASIN）ので、その形でなければ商品詳細とみなさない。
// 形の分かるモールだけ、この厳しい判定を足す（推測はしない）。
const STRICT_PRODUCT_PATH = Object.freeze({
  AMAZON_JP: /\/(?:dp|gp\/product|gp\/aw\/d)\/[A-Z0-9]{10}(?:[/?#]|$)/iu
});

export function isGoogleMallProductPage(marketplace, pathAndSearch) {
  const target = String(pathAndSearch || '');
  const strict = STRICT_PRODUCT_PATH[String(marketplace || '')];
  if (strict) return strict.test(target);
  return !NON_PRODUCT_PATH.test(target);
}

export function googleMallSearchConfigured(env = {}) {
  return String(env.GOOGLE_AGENT_SEARCH_SA_JSON || '').trim().length >= 100
    && /^projects\/[0-9a-z-]+\/locations\/[a-z0-9-]+\/collections\/[a-z0-9_-]+\/engines\/[a-z0-9_-]+$/iu.test(String(env.GOOGLE_AGENT_SEARCH_ENGINE || '').trim())
    && String(env.GOOGLE_MALL_SEARCH_ENABLED ?? 'true').toLowerCase() !== 'false';
}

export function googleMallSearchDailyLimit(env = {}) {
  const configured = Number(env.GOOGLE_MALL_SEARCH_DAILY_LIMIT);
  return Number.isInteger(configured) && configured >= 1 && configured <= MAX_DAILY_LIMIT
    ? configured : DEFAULT_DAILY_LIMIT;
}

// Google Cloud の無料枠は太平洋時間の日付・月で切り替わる（課金日）。UTC で数えると最大 8 時間ずれる。
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
  return String(value || '').normalize('NFKC').replace(/<[^>]*>/gu, ' ').replace(/&nbsp;/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, limit);
}

// 2026-09-21 大隆さん報告「画像出てないよ」: Amazon・マツキヨのカードに商品写真ではなく
// モールのロゴが出ていた。og:image はページが商品ページでもサイト共通のロゴを返すことが多く、
// それを商品画像として出すと、その商品の見た目を偽って伝えることになる。
// 商品として構造化された画像（product.image）を最優先し、ロゴ・既定 OGP 画像・アイコンと
// 分かる URL は捨てる。捨てた結果 画像が無ければ、画面側はモール名のタイルへ落ちる。
// ロゴを商品写真のふりをさせない。画像 URL の推測生成もしない。
const NON_PRODUCT_IMAGE = /(?:social_share|[/_-]logo[/_.-]|logo\.(?:png|jpe?g|svg|webp)|ogp?[_-]?default|default[_-]ogp?|no[_-]?image|noimg|placeholder|apple-touch-icon|favicon|sprite)/iu;

export function usableGoogleMallImage(value) {
  const text = String(value || '').trim();
  if (!/^https:\/\/[^\s"'<>]+$/iu.test(text) || text.length > 1000) return '';
  return NON_PRODUCT_IMAGE.test(text) ? '' : text;
}

function firstImage(pagemap = {}) {
  const candidates = [
    // 商品として構造化された画像が最も確からしい。og:image より先に見る。
    pagemap?.product?.[0]?.image,
    pagemap?.cse_image?.[0]?.src,
    pagemap?.metatags?.[0]?.['og:image'],
    pagemap?.metatags?.[0]?.['twitter:image'],
    pagemap?.cse_thumbnail?.[0]?.src
  ];
  for (const value of candidates) {
    const usable = usableGoogleMallImage(value);
    if (usable) return usable;
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

// Agent Search（Discovery Engine）の応答を、{title, link, snippet, pagemap} の並びに揃える。
export function normalizeAgentSearchResponse(payload = {}) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results.map((row) => {
    const data = row?.document?.derivedStructData || {};
    return {
      title: data.title || data.htmlTitle || '',
      link: data.link || '',
      snippet: Array.isArray(data.snippets) ? (data.snippets[0]?.snippet || '') : '',
      pagemap: data.pagemap || {}
    };
  });
}

// Diagnostic output is deliberately aggregate-only. Never expose correctedQuery,
// document contents, URLs, tokens, or search-unit IDs through this hook.
export function summarizeGoogleMallResponse(payload = {}) {
  return {
    result_count: Array.isArray(payload?.results) ? payload.results.length : 0,
    corrected_query_present: typeof payload?.correctedQuery === 'string' && Boolean(payload.correctedQuery.trim()),
    total_size: Number.isSafeInteger(payload?.totalSize) && payload.totalSize >= 0 ? payload.totalSize : null
  };
}

async function observeResponse(options, payload, attempt) {
  if (typeof options.onResponse !== 'function') return;
  try { await options.onResponse({ attempt, ...summarizeGoogleMallResponse(payload) }); } catch {}
}

export function parseGoogleMallItems(rows = []) {
  const list = Array.isArray(rows) ? rows : Array.isArray(rows?.items) ? rows.items : [];
  const seen = new Set();
  const products = [];
  const others = [];
  for (const item of list) {
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
      listed_price_jpy: pageListedPrice(item?.pagemap),
      product_page: isGoogleMallProductPage(mall.marketplace, url.pathname + url.search)
    };
    if (!entry.title) continue;
    (entry.product_page ? products : others).push(entry);
  }
  // §16: 商品詳細 URL 候補だけ残す。商品ページが 1 件も無い時だけ、案内として一覧ページを最大 2 件残す。
  return (products.length ? products : others.slice(0, 2)).slice(0, RESULT_LIMIT);
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

// 2026-09-20 大隆さん報告「韓国 頭皮ケア リリーブ」: Agent Search（サイト限定）は綴り補正 AUTO でも 0 件だった
// （live:RAW_0）。0 件のときだけ 1 回、ブランド名らしい語（カタカナだけ・英数字だけの語）を外して探し直す。
// 「韓国 頭皮ケア LILIB リリーブ lilib」→「韓国 頭皮ケア」。外す語が無い／全部外れる／変わらないときは null。
export function broadenGoogleMallQuery(query) {
  const tokens = normalizeGoogleMallQuery(query).split(' ').filter(Boolean);
  if (tokens.length < 2) return null;
  const brandLike = (token) => /^[\p{Script=Katakana}ー・]+$/u.test(token) || /^[A-Za-z0-9][A-Za-z0-9&.\-']*$/u.test(token);
  const kept = tokens.filter((token) => !brandLike(token));
  if (!kept.length || kept.length === tokens.length) return null;
  return { query: kept.join(' '), droppedTokens: tokens.filter(brandLike) };
}

function cacheKeyFor(query) {
  // v4: discard pre-reranking results so a cached broad search cannot mask this fix.
  return `https://google-mall-search.hoshilu.internal/v4?q=${encodeURIComponent(query)}`;
}

// ---- サービスアカウント → アクセストークン（RS256 JWT → OAuth2）。Worker のメモリに 50 分キャッシュ ----
const base64url = (input) => {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
};

function pemToArrayBuffer(pem) {
  const body = String(pem || '').replace(/-----BEGIN [A-Z ]+-----/gu, '').replace(/-----END [A-Z ]+-----/gu, '').replace(/\s+/gu, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function parseServiceAccount(env = {}) {
  try {
    const parsed = JSON.parse(String(env.GOOGLE_AGENT_SEARCH_SA_JSON || ''));
    if (parsed?.type !== 'service_account') return null;
    if (!/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/u.test(String(parsed.client_email || ''))) return null;
    if (!/-----BEGIN PRIVATE KEY-----/u.test(String(parsed.private_key || ''))) return null;
    return { client_email: parsed.client_email, private_key: parsed.private_key, token_uri: parsed.token_uri || TOKEN_ENDPOINT };
  } catch {
    return null;
  }
}

let cachedToken = { value: '', expiresAt: 0, email: '' };

export function resetGoogleAccessTokenCache() { cachedToken = { value: '', expiresAt: 0, email: '' }; }

export async function googleAccessToken(env = {}, options = {}) {
  const fetchImpl = options.fetch || fetch;
  const now = options.now || new Date();
  const account = parseServiceAccount(env);
  if (!account) throw new Error('GOOGLE_AGENT_SEARCH_SA_INVALID');
  if (cachedToken.value && cachedToken.email === account.client_email && cachedToken.expiresAt > now.getTime() + 60000) return cachedToken.value;
  const issued = Math.floor(now.getTime() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({ iss: account.client_email, scope: TOKEN_SCOPE, aud: account.token_uri, iat: issued, exp: issued + 3600 }));
  const key = await crypto.subtle.importKey('pkcs8', pemToArrayBuffer(account.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const assertion = `${header}.${claims}.${base64url(signature)}`;
  const response = await fetchImpl(account.token_uri, {
    method: 'POST',
    signal: options.signal,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString()
  });
  if (!response.ok) throw new Error(`GOOGLE_TOKEN_HTTP_${response.status}`);
  const payload = await response.json();
  const token = String(payload?.access_token || '');
  if (!token) throw new Error('GOOGLE_TOKEN_EMPTY');
  const ttl = Math.max(300, Math.min(3600, Number(payload?.expires_in) || 3600));
  cachedToken = { value: token, email: account.client_email, expiresAt: now.getTime() + (ttl - 600) * 1000 };
  return token;
}

// 戻り値: { items, source: 'cache'|'live'|'disabled'|'limit'|'error', reason }
// options.excludeMarketplaces: HOSHILU 自身の結果が既にあるモール（§13: モール単位で判定。そのモールは Google で出さない）
// Privacy boundary: 検索本文・検索単位のIDはD1へ記録しない。原因コードは呼び出し元の
// 集計済みprovider degradationだけで扱い、ここでは結果と固定コードだけを返す。
// 既存cronとの互換用。過去行の削除は本番D1の破壊的変更になるため自動実行しない。
export async function purgeGoogleMallSearchLog() {}
// 集計だけ（migration 0083 の bucket_at/source/reason/request_count）。失敗しても検索を止めない。
export async function countGoogleMallOutcome(env, now, source, reason) {
  if (!env.PRODUCT_DB?.prepare) return;
  try {
    const bucket = new Date(now).toISOString().slice(0, 13) + ':00:00Z';
    await env.PRODUCT_DB.prepare(`INSERT INTO google_mall_search_log(bucket_at,source,reason,request_count) VALUES(?1,?2,?3,1)
      ON CONFLICT(bucket_at,source,reason) DO UPDATE SET request_count=request_count+1`).bind(bucket, String(source || ''), String(reason || '').slice(0, 40)).run();
  } catch {}
}

export async function searchGoogleMalls(env = {}, rawQuery, options = {}) {
  const fetchImpl = options.fetch || fetch;
  const now = options.now || new Date();
  const query = normalizeGoogleMallQuery(rawQuery);
  const exclude = new Set((options.excludeMarketplaces || []).map((value) => String(value || '').toUpperCase()));
  // 2026-09-20: 検索本文・ID は残さない（Codex の privacy boundary に従う）。残すのは 1 時間バケットごとの
  // 「結果の種類」の件数だけ: SHOWN / ALL_EXCLUDED / NO_PRODUCT_PAGES / RAW_0 / TIMEOUT / HTTP_xxx …。
  // await する（Workers はレスポンス後の未完了 Promise を打ち切る）。
  const finish = async (items, source, reason = '') => {
    const kept = items.filter((item) => !exclude.has(item.marketplace));
    const outcome = kept.length ? 'SHOWN' : items.length ? 'ALL_EXCLUDED' : rawCount ? 'NO_PRODUCT_PAGES' : 'RAW_0';
    if (options.recordOutcome !== false) await countGoogleMallOutcome(env, now, source, outcome);
    return { items: kept, source, reason };
  };
  const fail = async (source, reason) => { if (options.recordOutcome !== false) await countGoogleMallOutcome(env, now, source, reason); return { items: [], source, reason }; };
  let rawCount = 0;
  if (!query) return { items: [], source: 'disabled', reason: 'EMPTY_QUERY' };
  if (!googleMallSearchConfigured(env)) return { items: [], source: 'disabled', reason: 'NOT_CONFIGURED' };
  const cache = options.cache === null ? null : (options.cache || (globalThis.caches?.default ?? null));
  const cacheRequest = new Request(cacheKeyFor(query));
  if (cache) {
    try {
      const hit = await cache.match(cacheRequest);
      if (hit) {
        const cached = await hit.json();
        if (Array.isArray(cached?.items)) return await finish(cached.items, 'cache');
      }
    } catch {}
  }
  const budget = await reserveGoogleMallSearchRequest(env, now);
  if (!budget.allowed) return await fail('limit', budget.reason);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    const token = await googleAccessToken(env, { fetch: fetchImpl, now, signal: controller.signal });
    const engine = String(env.GOOGLE_AGENT_SEARCH_ENGINE).trim();
    const response = await fetchImpl(`${SEARCH_ENDPOINT}/${engine}/servingConfigs/default_search:search`, {
      method: 'POST',
      signal: controller.signal,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
      // 検索語以外は送らない（userPseudoId 等は付けない）。
      // 2026-09-20 大隆さん報告「リリーブ」: 通常の Google は「リリーイブ」に自動補正して出す。Agent Search にも
      // 綴り補正（AUTO）と、結果が少ない時の検索語拡張（AUTO）を明示して同じ挙動に寄せる。
      body: JSON.stringify({ query, pageSize: 20, languageCode: 'ja', safeSearch: true, spellCorrectionSpec: { mode: 'AUTO' }, queryExpansionSpec: { condition: 'AUTO' } })
    });
    if (!response.ok) return await fail('error', `HTTP_${response.status}`);
    const payload = await response.json();
    await observeResponse(options, payload, 'primary');
    const normalized = normalizeAgentSearchResponse(payload);
    rawCount = Array.isArray(normalized) ? normalized.length : 0;
    let items = parseGoogleMallItems(normalized);
    // 0 件なら 1 回だけ、ブランド名らしい語を外して探し直す（要求は最大 +1、予算枠を 1 つ余分に使う）。
    const broadened = rawCount ? null : broadenGoogleMallQuery(query);
    if (broadened && options.broaden !== false) {
      const retryBudget = await reserveGoogleMallSearchRequest(env, now);
      if (retryBudget.allowed) {
        const retryController = new AbortController();
        const retryTimer = setTimeout(() => retryController.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
        try {
        const retry = await fetchImpl(`${SEARCH_ENDPOINT}/${engine}/servingConfigs/default_search:search`, {
          method: 'POST',
          signal: retryController.signal,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ query: broadened.query, pageSize: 20, languageCode: 'ja', safeSearch: true, spellCorrectionSpec: { mode: 'AUTO' }, queryExpansionSpec: { condition: 'AUTO' } })
        });
        if (retry.ok) {
          const retryPayload = await retry.json();
          await observeResponse(options, retryPayload, 'broadened');
          const retryNormalized = normalizeAgentSearchResponse(retryPayload);
          rawCount = Array.isArray(retryNormalized) ? retryNormalized.length : 0;
          items = parseGoogleMallItems(retryNormalized);
          const ranked = rerankGoogleMallItems(items, broadened.droppedTokens);
          const visibleBefore = items.filter((item) => !exclude.has(item.marketplace));
          const reordered = ranked.filter((item) => !exclude.has(item.marketplace))
            .some((item, index) => item !== visibleBefore[index]);
          items = ranked;
          if (options.recordOutcome !== false) {
            await countGoogleMallOutcome(env, now, 'live', rawCount ? 'BROADENED' : 'BROADENED_0');
            if (reordered) await countGoogleMallOutcome(env, now, 'live', 'BROADENED_RERANKED');
          }
        }
        } catch {} finally { clearTimeout(retryTimer); }
      }
    }
    if (cache) {
      try {
        await cache.put(cacheRequest, new Response(JSON.stringify({ items, cached_at: now.toISOString() }), {
          headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${items.length ? CACHE_TTL_SECONDS : EMPTY_CACHE_TTL_SECONDS}` }
        }));
      } catch {}
    }
    return await finish(items, 'live');
  } catch (error) {
    const message = String(error?.message || '');
    return await fail('error', error?.name === 'AbortError' ? 'TIMEOUT' : (message.startsWith('GOOGLE_') ? message : 'FETCH_FAILED'));
  } finally {
    clearTimeout(timer);
  }
}
