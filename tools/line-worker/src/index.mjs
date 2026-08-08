import { handleSellerRoutes } from './seller-auth.mjs';
import { handleAdminAuthRoutes } from './admin-auth.mjs';
import { purgeAdminAuthRecords } from './admin-login-guard.mjs';
import { purgeSellerAuthRecords } from './seller-login-guard.mjs';
import { handleMemberRoutes, lineLoginConfigured } from './member-auth.mjs';
import { emailLoginConfigured } from './member-email-auth.mjs';
import { syncProducts } from './product-index-v2.mjs';
import { applyIndexedSearchPolicy, filterCategoryMismatches, rankMerchantCandidates, suggestedKeywordOptions, teacherDatasetExclusionCount } from './knowledge-search.mjs';
import { lookupTeacherDatasetEntry } from './search-quality/teacher-dataset-lookup.mjs';
import { creatorsApiConfigured, searchAmazonCreators } from './amazon-creators-api.mjs';
import {
  buildDeviceAccessorySearchKeywords,
  buildMarketplaceSearchKeywords
} from '../public/marketplace-search-keywords-v2.mjs';
import {
  rakutenApiConfigured,
  searchRakutenMarketplaceWithFallback
} from './rakuten-marketplace-api.mjs';
import { searchYahooShopping, yahooShoppingApiConfigured } from './yahoo-shopping-api.mjs';
import { marketplaceForProductUrl, PRODUCT_MARKETPLACES as PRODUCT_MARKETPLACE_LIST } from './marketplace-product-url-policy.mjs';
import { marketplaceOfferStats, syncMarketplaceOffers } from './marketplace-offer-feed.mjs';
import { discoverProductsWithAi } from './ai-product-discovery.mjs';
import { knownRefinementDimensions, refinementDimensionLabel, suggestRefinementChips } from './search-refinement-policy.mjs';
import { analyzeChatTurn } from './ai-chat-intent.mjs';
import { buildPriceComparison, realPriceRows, requestAiPriceEstimates } from './ai-price-comparison.mjs';
import { recordOutboundCommerceEvent } from './outbound-commerce-event.mjs';
import { buildApparelMarketplaceDestinations } from './apparel-marketplaces.mjs';
import { handleMemberWishRoutes } from './member-wish-v2.mjs';
import { deliverDueWebNotifications, handleMywatchRoutes } from './mywatch-routes.mjs';
import { handleInsightRoutes } from './insight-routes.mjs';
import { deliverDueMemberNotifications } from './member-notification-delivery.mjs';
import { handleUnmetDemandRoutes } from './unmet-demand-routes.mjs';
import { handleContractPolicySyncRoutes } from './contract-policy-routes.mjs';
import { decideContractPolicy, findContractInD1, jstDateKey, knowledgeKeyForQuery } from './contract-policy.mjs';
import { handleMultilingualSyncRoutes } from './multilingual-seo-routes.mjs';
import { attachMultilingualContent } from './multilingual-seo.mjs';
import { handleProductIdentifierSyncRoutes } from './product-identifier-routes.mjs';
import { recordEvents as recordKpiEvents } from './measurement.mjs';
import { recordEvents as recordMarketplaceKpiEvents, refreshMarketplaceKpiSummary } from './marketplace-measurement.mjs';
import { refreshAnonymousBenchmark } from './benchmark.mjs';
import {
  runSpApiScheduledSync, spApiConfiguredTenants
} from './sp-api-d1-repository.mjs';
import { handleSpApiAdminRoutes } from './sp-api-admin-routes.mjs';
import { handleSpApiSellerRoutes } from './sp-api-seller-routes.mjs';
import { requestedColorPatterns, semanticSearchGroups } from './search-intelligence.mjs';
import { expandSearchQuery } from './query-expansion.mjs';
import { APPAREL_CATEGORY_JA_LABELS } from './apparel-vocabulary.mjs';
import {
  buildOrganizedApparelQuery, colorLabelFromEnglishTerms, stripSentencePunctuation,
  extractApparelProductType, ensureApparelProductTypeTerm
} from './apparel-query-attributes.mjs';
import {
  handleSocialAdminRoutes, runDueSocialPosts, socialPublisherReadiness
} from './social-publisher.mjs';
import { renderSeoPage } from './seo-pages.mjs';
import { searchModeForMarketplace } from './marketplace-search-mode.mjs';
import { classifyGrowthTraffic, handleGrowthEvent } from './growth-events.mjs';
import {
  runMarketplaceContentCycle, handleMarketplaceSaleRoutes
} from './marketplace-sales.mjs';
const encoder = new TextEncoder();
const ALLOWED_DESTINATION_DOMAINS = [
  'amazon.co.jp', 'amazon.com', 'rakuten.co.jp',
  'shopping.yahoo.co.jp', 'store.shopping.yahoo.co.jp',
  'qoo10.jp', 'shein.com', 'zozo.jp', 'shop-list.com',
  'musinsa.com', 'buyma.com', 'snkrdunk.com',
  // v4.2 項目14: 新規5モール(ロフト/ハンズ/マツキヨココカラ/@cosme/ABC-MART)。
  'loft.co.jp', 'hands.net', 'matsukiyococokara-online.com',
  'cosme.com', 'abc-mart.net'
];
// v4.2 項目17 / v4.3 項目18: マーケットプレイスごとの検索モード。
// 'integrated' はHOSHILUが実際に商品データを取得できるAPI連携先
// (Amazon/Rakuten/Yahoo)、'direct' はHOSHILUが商品データを持たず、その
// モール自身の検索結果ページへディープリンクするだけの先。UI側(app.js)が
// この区分をハードコードし直さなくて済むよう、/api/knowledge のレスポンスに
// 各リンクの mode を載せる(signedMarketplaceSearchLinks参照)。
// marketplace-search-mode.mjs がここが唯一の判定元(v4.3のAI最安比較
// (ai-price-comparison.mjs)も同じ定義を再利用する)。
const RELEASE = '1.18.0';
const REQUIRED_ENV = [
  'GAS_BACKEND_URL', 'GAS_BRIDGE_SECRET', 'LINK_SIGNING_SECRET',
  'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY',
  'ADMIN_AUTH_ID', 'ADMIN_AUTH_PASSWORD', 'ADMIN_SESSION_SECRET',
  'SELLER_AUTH_ID', 'SELLER_AUTH_PASSWORD', 'AUTH_SESSION_SECRET',
  'SELLER_ALLOWED_TENANTS'
];
const unsafeExampleValue = (value) =>
  /replace[-_ ]?with|change[-_ ]?me|changeme|placeholder/i.test(String(value || ''));

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toBase64Url(value) {
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', key, encoder.encode(value));
}

export async function verifyLineSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  try {
    const expected = new Uint8Array(await hmac(rawBody, secret));
    const received = base64ToBytes(signature);
    if (expected.length !== received.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i += 1) mismatch |= expected[i] ^ received[i];
    return mismatch === 0;
  } catch {
    return false;
  }
}

export async function createTrackToken(payload, secret) {
  const body = toBase64Url(bytesToBase64(encoder.encode(JSON.stringify(payload))));
  const signature = toBase64Url(bytesToBase64(await hmac(body, secret)));
  return `${body}.${signature}`;
}

export async function verifyTrackToken(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) throw new Error('TRACK_TOKEN_FORMAT_INVALID');
  const expected = new Uint8Array(await hmac(parts[0], secret));
  const received = base64ToBytes(fromBase64Url(parts[1]));
  if (expected.length !== received.length) throw new Error('TRACK_TOKEN_SIGNATURE_INVALID');
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) mismatch |= expected[i] ^ received[i];
  if (mismatch !== 0) throw new Error('TRACK_TOKEN_SIGNATURE_INVALID');
  const payload = JSON.parse(new TextDecoder().decode(base64ToBytes(fromBase64Url(parts[0]))));
  if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) < nowSeconds) throw new Error('TRACK_TOKEN_EXPIRED');
  return payload;
}

export function isAllowedDestination(destination) {
  try {
    const url = new URL(destination);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    return url.protocol === 'https:' && !url.username && !url.password
      && ALLOWED_DESTINATION_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

const SELLER_PLAN_PRIORITY = Object.freeze({
  PARTNER: 0,
  PRO: 1,
  GROWTH: 2,
  LITE: 3
});

function offerIsActive(offer) {
  const state = String(
    offer?.listing_status || offer?.status || offer?.seller_status || ''
  ).toUpperCase();
  return offer?.active !== false
    && !['INACTIVE','REMOVED','DELETED','SUSPENDED','CLOSED'].includes(state)
    && !['OUT_OF_STOCK','UNAVAILABLE'].includes(String(offer?.stock_status || 'UNKNOWN').toUpperCase())
    && isAllowedDestination(offer?.product_url);
}

export function rankSellerOffers(offers = []) {
  return (Array.isArray(offers) ? offers : [])
    .map((offer, index) => ({ offer, index }))
    .filter(({ offer }) => offerIsActive(offer))
    .sort((left, right) => {
      const leftPlan = SELLER_PLAN_PRIORITY[String(left.offer?.seller_plan || left.offer?.plan || 'LITE').toUpperCase()] ?? SELLER_PLAN_PRIORITY.LITE;
      const rightPlan = SELLER_PLAN_PRIORITY[String(right.offer?.seller_plan || right.offer?.plan || 'LITE').toUpperCase()] ?? SELLER_PLAN_PRIORITY.LITE;
      const leftTime = Date.parse(left.offer?.registered_at || left.offer?.created_at || '') || Number.MAX_SAFE_INTEGER;
      const rightTime = Date.parse(right.offer?.registered_at || right.offer?.created_at || '') || Number.MAX_SAFE_INTEGER;
      return leftPlan - rightPlan || leftTime - rightTime || left.index - right.index;
    })
    .map(({ offer }) => offer);
}

export function candidateDestination(candidate) {
  const approvedOffer = rankSellerOffers(candidate?.offers)[0];
  if (approvedOffer) return { url: approvedOffer.product_url, offer: approvedOffer };
  return { url: '', offer: null };
}

export function marketplaceForDestination(destination) {
  const productMarketplace = marketplaceForProductUrl(destination);
  if (productMarketplace) return productMarketplace;
  try {
    const host = new URL(destination).hostname.toLowerCase().replace(/\.$/, '');
    if (host === 'amazon.co.jp' || host.endsWith('.amazon.co.jp') || host === 'amazon.com' || host.endsWith('.amazon.com')) return 'AMAZON_JP';
    if (host === 'rakuten.co.jp' || host.endsWith('.rakuten.co.jp')) return 'RAKUTEN_JP';
    if (host === 'qoo10.jp' || host.endsWith('.qoo10.jp')) return 'QOO10_JP';
    if (host === 'shein.com' || host.endsWith('.shein.com')) return 'SHEIN_JP';
    if (host === 'shopping.yahoo.co.jp' || host.endsWith('.shopping.yahoo.co.jp') || host === 'store.shopping.yahoo.co.jp' || host.endsWith('.store.shopping.yahoo.co.jp')) return 'YAHOO_JP';
  } catch {}
  return '';
}

const PRODUCT_MARKETPLACES = new Set(PRODUCT_MARKETPLACE_LIST);

// 2026-08-07: the results area is now two rows - the upper row holds
// candidates whose total cost including shipping was actually confirmed on a
// connected marketplace, the lower row holds candidates that really exist but
// whose price/stock could not be confirmed. Each row shows up to 30, so the
// worker has to be allowed to send up to 60. This was 30 for a single row;
// leaving it there meant the lower row could only ever be filled by starving
// the upper one.
export const CLIENT_CANDIDATE_LIMIT = 60;
export const CLIENT_CANDIDATE_ROW_LIMIT = 30;

export function isProductDetailDestination(destination) {
  return isAllowedDestination(destination) && Boolean(marketplaceForProductUrl(destination));
}

export function productMarketplaceOffers(offers = []) {
  const seen = new Set();
  return rankSellerOffers(offers).filter((offer) => {
    const marketplace = offer?.marketplace || marketplaceForDestination(offer?.product_url);
    if (!PRODUCT_MARKETPLACES.has(marketplace) || seen.has(marketplace) || !isProductDetailDestination(offer?.product_url)) return false;
    seen.add(marketplace);
    return true;
  }).map((offer) => ({ ...offer, marketplace: offer.marketplace || marketplaceForDestination(offer.product_url) })).slice(0, 10);
}

export function legacyAmazonProductLead(candidate = {}) {
  const asin = String(candidate.asin || '').trim().toUpperCase();
  const destination = String(candidate.amazon_jp_url || '').trim();
  if (!/^[A-Z0-9]{10}$/.test(asin) || !isProductDetailDestination(destination)) return '';
  if (marketplaceForDestination(destination) !== 'AMAZON_JP') return '';
  return new RegExp(`/(?:dp|gp/product)/${asin}(?:[/?]|$)`, 'i').test(new URL(destination).pathname)
    ? destination : '';
}

function offerSummary(offer) {
  if (!offer) return '';
  const labels = { AMAZON_JP: 'Amazon', RAKUTEN_JP: '楽天市場', YAHOO_JP: 'Yahoo!ショッピング' };
  const marketplace = labels[offer.marketplace] || offer.marketplace || '';
  const total = Number(offer.total_cost ?? (Number(offer.price || 0) + Number(offer.shipping_fee || 0)));
  const price = Number.isFinite(total) && total > 0
    ? `${offer.currency || 'JPY'} ${Math.round(total).toLocaleString('ja-JP')}` : '';
  const delivery = Number(offer.delivery_days || 0) > 0 ? `配送目安 ${Number(offer.delivery_days)}日` : '';
  return [marketplace, price, delivery].filter(Boolean).join(' / ');
}

export function validateKnowledgeRequest(payload) {
  payload = payload || {};
  const query = String(payload.query || '').trim();
  const sessionId = String(payload.session_id || '').trim();
  const turnstileToken = String(payload.turnstile_token || '').trim();
  if (payload.consent !== true) throw new Error('CONSENT_REQUIRED');
  if (query.length < 2 || query.length > 200) throw new Error('QUERY_LENGTH_INVALID');
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(sessionId)) throw new Error('SESSION_ID_INVALID');
  if (!turnstileToken || turnstileToken.length > 2048) throw new Error('TURNSTILE_TOKEN_INVALID');
  const language = ['JA','EN','ZH','KO'].includes(payload.language) ? payload.language : 'JA';
  const searchAttempt = Number.isInteger(payload.search_attempt)
    ? Math.min(2, Math.max(1, payload.search_attempt)) : 1;
  const cleanAttribution = (value) => String(value || '').trim()
    .replace(/[^\p{L}\p{N}_.-]/gu, '').slice(0, 80);
  const attribution = {
    source: cleanAttribution(payload.source),
    medium: cleanAttribution(payload.medium),
    campaign: cleanAttribution(payload.campaign),
    content: cleanAttribution(payload.content)
  };
  return {
    query, session_id: sessionId, turnstile_token: turnstileToken, language, search_attempt: searchAttempt,
    consent: true, attribution,
    traffic_class: classifyGrowthTraffic(attribution)
  };
}

// HOSHILU AI Chat (2026-08-05): shares the same session/Turnstile/consent
// gate as /api/knowledge rather than inventing a separate auth path.
export function validateChatRequest(payload) {
  payload = payload || {};
  const sessionId = String(payload.session_id || '').trim();
  const turnstileToken = String(payload.turnstile_token || '').trim();
  if (payload.consent !== true) throw new Error('CONSENT_REQUIRED');
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(sessionId)) throw new Error('SESSION_ID_INVALID');
  if (!turnstileToken || turnstileToken.length > 2048) throw new Error('TURNSTILE_TOKEN_INVALID');
  const history = Array.isArray(payload.history) ? payload.history.slice(0, 8) : [];
  if (!history.length) throw new Error('CHAT_HISTORY_EMPTY');
  const language = ['JA','EN','ZH','KO'].includes(payload.language) ? payload.language : 'JA';
  return { history, session_id: sessionId, turnstile_token: turnstileToken, language, consent: true };
}

export function getEnvironmentReadiness(env = {}) {
  const missing = REQUIRED_ENV.filter((name) => !String(env[name] || '').trim());
  const weak = ['GAS_BRIDGE_SECRET', 'LINK_SIGNING_SECRET'].filter((name) => {
    const value = String(env[name] || '');
    return value && value.length < 32;
  });
  if (env.ADMIN_AUTH_ID && String(env.ADMIN_AUTH_ID).length < 3) weak.push('ADMIN_AUTH_ID');
  if (env.ADMIN_AUTH_PASSWORD && String(env.ADMIN_AUTH_PASSWORD).length < 16) {
    weak.push('ADMIN_AUTH_PASSWORD');
  }
  if (env.ADMIN_SESSION_SECRET && String(env.ADMIN_SESSION_SECRET).length < 64) {
    weak.push('ADMIN_SESSION_SECRET');
  }
  if (env.SELLER_AUTH_ID && String(env.SELLER_AUTH_ID).length < 3) weak.push('SELLER_AUTH_ID');
  if (env.SELLER_AUTH_PASSWORD && String(env.SELLER_AUTH_PASSWORD).length < 12) {
    weak.push('SELLER_AUTH_PASSWORD');
  }
  if (env.AUTH_SESSION_SECRET && String(env.AUTH_SESSION_SECRET).length < 64) {
    weak.push('AUTH_SESSION_SECRET');
  }
  const sellerTenantValue = String(env.SELLER_ALLOWED_TENANTS || env.SELLER_TENANT || '').trim();
  const sellerTenantsValid = sellerTenantValue
    .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
    .every((value) => /^[a-z0-9_-]{1,32}$/.test(value));
  if (sellerTenantValue && !sellerTenantsValid) weak.push('SELLER_ALLOWED_TENANTS');
  for (const name of REQUIRED_ENV) {
    if (env[name] && unsafeExampleValue(env[name]) && !weak.includes(name)) weak.push(name);
  }
  for (const name of ['SELLER_AUTH_ID', 'SELLER_AUTH_PASSWORD', 'AUTH_SESSION_SECRET']) {
    if (env[name] && unsafeExampleValue(env[name]) && !weak.includes(name)) weak.push(name);
  }
  let backendUrlValid = false;
  try {
    const url = new URL(String(env.GAS_BACKEND_URL || ''));
    backendUrlValid = url.protocol === 'https:' && !url.username && !url.password &&
      !unsafeExampleValue(url.href);
  } catch {}
  const lineSecret = Boolean(String(env.LINE_CHANNEL_SECRET || '').trim());
  const lineToken = Boolean(String(env.LINE_CHANNEL_ACCESS_TOKEN || '').trim());
  const lineConfigured = lineSecret && lineToken;
  const linePartial = lineSecret !== lineToken;
  const mywatchSecret = String(env.MYWATCH_CRON_SECRET || '');
  const unmetDemandSecret = String(env.UNMET_DEMAND_SYNC_SECRET || '');
  const spApiClientId = Boolean(String(env.SPAPI_LWA_CLIENT_ID || '').trim());
  const spApiClientSecret = Boolean(String(env.SPAPI_LWA_CLIENT_SECRET || '').trim());
  const spApiTenants = spApiConfiguredTenants(env);
  const spApiRefreshConfigured = ['ITG','ITT','MC2'].filter((tenant) =>
    Boolean(String(env[`SPAPI_REFRESH_TOKEN_${tenant}`] || '').trim()));
  const adminConfigured = ['ADMIN_AUTH_ID', 'ADMIN_AUTH_PASSWORD', 'ADMIN_SESSION_SECRET']
    .every((name) => Boolean(String(env[name] || '').trim()));
  const sellerAuthNames = ['SELLER_AUTH_ID', 'SELLER_AUTH_PASSWORD', 'AUTH_SESSION_SECRET'];
  const sellerAuthValuesPresent = sellerAuthNames.filter((name) => Boolean(String(env[name] || '').trim()));
  const sellerAuthConfigured = sellerAuthValuesPresent.length === sellerAuthNames.length &&
    Boolean(sellerTenantValue) && sellerTenantsValid;
  const sellerAuthPartial = (sellerAuthValuesPresent.length > 0 || Boolean(sellerTenantValue)) &&
    !sellerAuthConfigured;
  const adminValues = [
    env.ADMIN_AUTH_ID, env.ADMIN_AUTH_PASSWORD, env.ADMIN_SESSION_SECRET,
    env.SELLER_AUTH_ID, env.SELLER_AUTH_PASSWORD, env.AUTH_SESSION_SECRET,
    env.SOCIAL_ADMIN_SECRET, env.GAS_BRIDGE_SECRET, env.LINK_SIGNING_SECRET
  ].filter((value) => Boolean(String(value || ''))).map(String);
  const adminCredentialsDistinct = adminConfigured &&
    new Set(adminValues).size === adminValues.length;
  const ready = missing.length === 0 && weak.length === 0 && backendUrlValid &&
    !linePartial && !sellerAuthPartial && adminCredentialsDistinct;
  return {
    ready,
    release: RELEASE,
    missing,
    weak,
    checks: {
      gas_backend_https: backendUrlValid,
      pwa_configured: missing.length === 0 && weak.length === 0 && backendUrlValid,
      line_configured: lineConfigured,
      line_partial: linePartial,
      mywatch_configured: mywatchSecret.length >= 32,
      mywatch_weak: Boolean(mywatchSecret) && mywatchSecret.length < 32,
      unmet_demand_sync_configured: unmetDemandSecret.length >= 32,
      unmet_demand_sync_weak: Boolean(unmetDemandSecret) && unmetDemandSecret.length < 32,
      sp_api_base_configured: spApiClientId && spApiClientSecret,
      sp_api_partial: spApiClientId !== spApiClientSecret ||
        (spApiRefreshConfigured.length > 0 && !(spApiClientId && spApiClientSecret)),
      sp_api_configured_tenants: spApiTenants,
      sp_api_configured_tenant_count: spApiTenants.length,
      admin_auth_configured: adminConfigured,
      admin_auth_weak: weak.some((name) => name.startsWith('ADMIN_')),
      admin_credentials_distinct: adminCredentialsDistinct,
      seller_auth_configured: sellerAuthConfigured,
      seller_auth_partial: sellerAuthPartial,
      seller_auth_weak: weak.some((name) =>
        sellerAuthNames.includes(name) || name === 'SELLER_ALLOWED_TENANTS'),
      amazon_creators_configured: creatorsApiConfigured(env),
      rakuten_marketplace_configured: rakutenApiConfigured(env),
      yahoo_shopping_configured: yahooShoppingApiConfigured(env)
    }
  };
}

async function verifyTurnstile(token, env, remoteIp) {
  if (!env.TURNSTILE_SECRET_KEY) throw new Error('TURNSTILE_NOT_CONFIGURED');
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: remoteIp || undefined })
  });
  if (!response.ok) throw new Error('TURNSTILE_HTTP_ERROR');
  const result = await response.json();
  if (!result.success) throw new Error('TURNSTILE_VERIFICATION_FAILED');
}

async function hashUser(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value || '')));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// HOSHILU GAS→Web移行 (docs/HOSHILU_GAS_TO_WEB_MIGRATION_BRIEF_2026-08-06.md §3,
// gas/MeasurementEngine.gs, gas/MarketplaceMeasurementEngine.gs): Worker→GASの
// callGas(env,'TRACK',...)は変更せず、その並走としてD1へも同じイベントを記録
// する。gas/LineIntegration.gs track()と同じくチャネルごとに1件だけ設定された
// 契約(env.LINE_CONTRACT_ID/env.PWA_CONTRACT_ID)からtenant/account_type/
// account_idを補い、campaign_idは`${channel}_PILOT`、experiment_variantは
// 'P_GATE'固定とする。契約が未設定・D1未同期の間は無条件でno-op。
async function recordMeasurementEventsToD1(env, channel, events) {
  if (!env.PRODUCT_DB || !Array.isArray(events) || !events.length) return;
  const contractId = String((channel === 'PWA' ? env.PWA_CONTRACT_ID : env.LINE_CONTRACT_ID) || '').trim();
  if (!contractId) return;
  try {
    const contract = await findContractInD1(env, contractId);
    if (!contract) return;
    const campaignId = `${channel}_PILOT`;
    const kpiEvents = events.map((event) => ({
      event_id: event.event_id, occurred_at: event.occurred_at, event_type: event.event_type,
      tenant: contract.tenant, account_type: contract.account_type, account_id: contract.account_id,
      session_id: event.user_hash, recommendation_id: event.recommendation_id, campaign_id: campaignId,
      experiment_variant: 'P_GATE', asin: event.asin, consent: true, source: channel
    }));
    await recordKpiEvents(env, kpiEvents);
    const marketplaceEvents = events.filter((event) => event.marketplace).map((event) => ({
      event_id: event.event_id, occurred_at: event.occurred_at, tenant: contract.tenant,
      account_type: contract.account_type, account_id: contract.account_id, session_id: event.user_hash,
      recommendation_id: event.recommendation_id, asin: event.asin, marketplace: event.marketplace,
      event_type: event.event_type, channel, consent: true
    }));
    if (marketplaceEvents.length) await recordMarketplaceKpiEvents(env, marketplaceEvents);
  } catch (error) {
    console.warn('KPI_D1_RECORD_FALLBACK', { channel, error: String(error.message || error) });
  }
}

async function callGas(env, action, body) {
  const timeoutMs = action === 'KNOWLEDGE' ? 2200 : action === 'EVENT' ? 3000 : 5000;
  const response = await fetch(env.GAS_BACKEND_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bridge_secret: env.GAS_BRIDGE_SECRET, action, ...body }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`GAS_HTTP_${response.status}`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error?.code || 'GAS_RESPONSE_ERROR');
  return payload.result;
}

export async function buildReplyMessages(result, origin, env, event) {
  const candidates = Array.isArray(result.candidates) ? result.candidates.slice(0, 3) : [];
  const messages = [{ type: 'text', text: String(result.message || '商品を見つけられませんでした。').slice(0, 5000) }];
  const userId = event.source?.userId || event.source?.groupId || event.source?.roomId || '';
  const userHash = await hashUser(userId || event.webhookEventId);
  for (const candidate of candidates) {
    const selected = candidateDestination(candidate);
    const destination = selected.url;
    let trackingUrl = '';
    if (isAllowedDestination(destination)) {
      const token = await createTrackToken({
        u: userHash, r: result.query_id || event.webhookEventId, a: candidate.asin,
        d: destination, exp: Math.floor(Date.now() / 1000) + 86400 * 7,
        j: `${event.webhookEventId}:${candidate.asin}`, c: 'LINE',
        m: selected.offer?.marketplace || marketplaceForDestination(destination)
      }, env.LINK_SIGNING_SECRET);
      trackingUrl = `${origin}/go?token=${encodeURIComponent(token)}`;
    }
    const lines = [
      `${candidate.rank || messages.length}. ${candidate.display_name || candidate.product_name || candidate.asin}`,
      candidate.description || '', offerSummary(selected.offer), trackingUrl
    ].filter(Boolean);
    messages.push({ type: 'text', text: lines.join('\n').slice(0, 5000) });
  }
  return messages.slice(0, 4);
}

async function replyToLine(replyToken, messages, env) {
  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ replyToken, messages })
  });
  if (!response.ok) throw new Error(`LINE_REPLY_${response.status}`);
}

async function pushToLine(userId, messages, env) {
  if (!userId || !messages.length) return;
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ to: userId, messages: messages.slice(0, 5) })
  });
  if (!response.ok) throw new Error(`LINE_PUSH_${response.status}`);
}

async function buildLineProductCards(result, origin, env, event) {
  const candidates = Array.isArray(result?.candidates) ? result.candidates.slice(0, 3) : [];
  if (!candidates.length) return [];
  const userId = event.source?.userId || '';
  const userHash = await hashUser(userId || event.webhookEventId);
  const bubbles = [];
  for (const candidate of candidates) {
    const selected = candidateDestination(candidate);
    if (!isAllowedDestination(selected.url)) continue;
    const token = await createTrackToken({
      u: userHash, r: result.query_id || event.webhookEventId, a: candidate.asin,
      d: selected.url, exp: Math.floor(Date.now() / 1000) + 86400 * 7,
      j: `${event.webhookEventId}:${candidate.asin}:PUSH`, c: 'LINE',
      m: selected.offer?.marketplace || marketplaceForDestination(selected.url)
    }, env.LINK_SIGNING_SECRET);
    const trackingUrl = `${origin}/go?token=${encodeURIComponent(token)}`;
    const bubble = {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type: 'text', text: String(candidate.display_name || candidate.product_name || candidate.asin), weight: 'bold', wrap: true, size: 'md' },
          { type: 'text', text: String(candidate.description || offerSummary(selected.offer) || '候補の商品です。'), wrap: true, size: 'sm', color: '#666666', maxLines: 3 }
        ]
      },
      footer: {
        type: 'box', layout: 'vertical',
        contents: [{ type: 'button', style: 'primary', color: '#6C4CFF', action: { type: 'uri', label: '商品を見る', uri: trackingUrl } }]
      }
    };
    const imageUrl = String(candidate.image_url || candidate.image || '').trim();
    if (/^https:\/\//i.test(imageUrl)) {
      bubble.hero = { type: 'image', url: imageUrl, size: 'full', aspectRatio: '1:1', aspectMode: 'cover' };
    }
    bubbles.push(bubble);
  }
  if (!bubbles.length) return [];
  return [
    { type: 'text', text: '商品候補が見つかりました。近いものを選んで確認できます。' },
    { type: 'flex', altText: 'HOSHILUの商品候補', contents: { type: 'carousel', contents: bubbles } }
  ];
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function pushCompletedLineSearch(event, origin, env) {
  const userId = event.source?.userId;
  if (!userId) return;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await delay(attempt === 0 ? 2500 : 3500);
    try {
      const result = await callGas(env, 'EVENT', { event });
      if (result?.status === 'PROCESSING') continue;
      const messages = await buildLineProductCards(result, origin, env, event);
      if (messages.length) await pushToLine(userId, messages, env);
      return;
    } catch (error) {
      console.error('LINE_ASYNC_SEARCH_FAILED', String(error?.message || error));
    }
  }
}

async function buildLineFallbackMessages(event, origin, env) {
  const query = String(event?.message?.text || '').trim().slice(0, 200);
  if (!query) {
    return [{ type: 'text', text: '探しているものを文章で送ってください。見た目・用途・見た場所など、覚えていることだけで大丈夫です。' }];
  }
  const isLightUpCase = /(?:スマホ|phone|iphone|携帯).*(?:ケース|case)|(?:ケース|case).*(?:スマホ|phone|iphone|携帯)/iu.test(query)
    && /(?:光|led|発光|蓄光|ネオン|luminous|glow)/iu.test(query);
  const directions = isLightUpCase
    ? [
        { label: 'LEDで光るケース', query: `${query} LED 電源式 発光` },
        { label: 'iPhone対応を探す', query: `${query} iPhone MagSafe 対応機種` },
        { label: '蓄光・ネオン系', query: `${query} 蓄光 夜光 ネオン glow in the dark` }
      ]
    : [
        { label: '条件に近い商品', query },
        { label: '特徴を重視して探す', query: `${query} 特徴` },
        { label: '似た商品まで広げる', query: `${query} 類似商品` }
      ];
  const bubbles = [];
  for (let index = 0; index < directions.length; index += 1) {
    const direction = directions[index];
    const destination = buildAmazonSearchDestination(direction.query, env.AMAZON_ASSOCIATE_TAG);
    let url = destination;
    try {
      const token = await signTrackToken({
        d: destination, m: 'AMAZON_SEARCH', s: 'LINE_FALLBACK',
        q: `${String(event.webhookEventId || crypto.randomUUID()).slice(0, 90)}:${index + 1}`,
        exp: Math.floor(Date.now() / 1000) + 60 * 30
      }, env.LINK_SIGNING_SECRET);
      url = `${origin}/go?token=${encodeURIComponent(token)}`;
    } catch {}
    bubbles.push({
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type: 'text', text: `候補 ${index + 1}`, size: 'xs', color: '#6C4CFF', weight: 'bold' },
          { type: 'text', text: direction.label, size: 'md', weight: 'bold', wrap: true },
          { type: 'text', text: buildAmazonSearchKeywords(direction.query), size: 'xs', color: '#777777', wrap: true, maxLines: 3 }
        ]
      },
      footer: {
        type: 'box', layout: 'vertical',
        contents: [{ type: 'button', style: 'primary', color: '#6C4CFF', action: { type: 'uri', label: 'Amazonで商品を見る', uri: url } }]
      }
    });
  }
  return [
    { type: 'text', text: `「${query}」から、近い商品を探せる3候補を作りました。横にスライドして選べます。`.slice(0, 5000) },
    { type: 'flex', altText: `「${query}」の商品検索候補3件`, contents: { type: 'carousel', contents: bubbles } },
    {
      type: 'text',
      text: 'さらに近づけるキーワードを選べます。覚えているものをタップしてください。',
      quickReply: {
        items: suggestedKeywordOptions(query, 'JA').map((keyword) => ({
          type: 'action',
          action: {
            type: 'message',
            label: String(keyword).slice(0, 20),
            text: `${query} / ${keyword}`.slice(0, 300)
          }
        }))
      }
    }
  ];
}

async function processLineEvent(event, origin, env, ctx) {
  try {
    const result = await callGas(env, 'EVENT', { event });
    if (result.status === 'PROCESSING') {
      await replyToLine(event.replyToken, await buildLineFallbackMessages(event, origin, env), env);
      await pushCompletedLineSearch(event, origin, env);
      return;
    }
    const messages = await buildReplyMessages(result, origin, env, event);
    await replyToLine(event.replyToken, messages, env);
    const userId = event.source?.userId || event.source?.groupId || event.source?.roomId || '';
    const events = impressionEvents(result, event, await hashUser(userId || event.webhookEventId));
    if (events.length) {
      ctx.waitUntil(callGas(env, 'TRACK', { events, channel: 'LINE' }));
      ctx.waitUntil(recordMeasurementEventsToD1(env, 'LINE', events));
    }
  } catch (error) {
    console.error('LINE_EVENT_FAILED', String(error?.message || error));
    await replyToLine(event.replyToken, await buildLineFallbackMessages(event, origin, env), env);
    await pushCompletedLineSearch(event, origin, env);
  }
}

function impressionEvents(result, event, userHash) {
  return (result.candidates || []).slice(0, 3).map((candidate) => ({
    event_id: `${event.webhookEventId}:IMPRESSION:${candidate.asin}`,
    occurred_at: new Date().toISOString(), user_hash: userHash,
    recommendation_id: result.query_id || event.webhookEventId,
    asin: candidate.asin, event_type: 'IMPRESSION'
  }));
}

async function handleWebhook(request, env, ctx) {
  const rawBody = await request.text();
  const valid = await verifyLineSignature(rawBody, request.headers.get('x-line-signature'), env.LINE_CHANNEL_SECRET);
  if (!valid) return new Response('unauthorized', { status: 401 });
  const payload = JSON.parse(rawBody);
  if (!Array.isArray(payload.events) || payload.events.length === 0) return new Response('ok');
  const origin = new URL(request.url).origin;
  const tasks = payload.events
    .filter((event) => event.replyToken)
    .map((event) => processLineEvent(event, origin, env, ctx));
  if (tasks.length) ctx.waitUntil(Promise.allSettled(tasks));
  return new Response('ok');
}

async function handleRedirect(request, env, ctx) {
  try {
    const token = new URL(request.url).searchParams.get('token');
    const payload = await verifyTrackToken(token, env.LINK_SIGNING_SECRET);
    if (!isAllowedDestination(payload.d)) return new Response('destination not allowed', { status: 400 });
    const occurredAt = new Date().toISOString();
    const events = trackingEventsForPayload(payload, occurredAt);
    const channel = payload.c === 'PWA' ? 'PWA' : 'LINE';
    if (payload.t === 'SEARCH_FALLBACK') {
      ctx.waitUntil(recordUnmetDemandEvent(env, payload, occurredAt, channel));
    }
    ctx.waitUntil(callGas(env, 'TRACK', { events, channel }));
    ctx.waitUntil(recordMeasurementEventsToD1(env, channel, events));
    // v4.3 Priority 5 (section 27-28): 送客計測基盤。既存の計測(callGas/
    // recordMeasurementEventsToD1)には一切手を加えず、追加でこのイベントも
    // 記録する。失敗してもリダイレクト自体は絶対に止めない(下のrecord
    // OutboundCommerceEvent内部で例外を握りつぶす設計)。
    ctx.waitUntil(recordOutboundCommerceEvent(env, payload, occurredAt));
    return Response.redirect(payload.d, 302);
  } catch (error) {
    return new Response(String(error.message || error), { status: 400 });
  }
}

function redactSearchPersonalData(query) {
  return String(query || '')
    .normalize('NFKC')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, ' ')
    .replace(/(?:\+?81[-\s]?)?0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 200);
}

const AMAZON_JP_QUERY_ALIASES = [
  [/(?:手机壳|手機殼|휴대폰 케이스|스마트폰 케이스)/iu, ['スマホケース','phone','case']],
  [/(?:耳机|耳機|이어폰|헤드폰)/iu, ['イヤホン','earphones']],
  [/(?:充电器|充電器|充电宝|充電寶|충전기|보조 배터리)/iu, ['充電器','charger']],
  [/(?:水杯|水瓶|保温杯|保溫杯|물병|텀블러)/iu, ['水筒','bottle']],
  [/(?:雨伞|雨傘|折叠伞|折疊傘|우산|양산)/iu, ['折りたたみ傘','umbrella']],
  [/(?:风扇|風扇|선풍기|휴대용 팬)/iu, ['携帯扇風機','fan']],
  [/(?:灯|燈|조명|램프)/iu, ['ライト','lamp']],
  [/(?:发光|發光|会亮|會亮|빛나는|발광|light[- ]?up|glowing)/iu, ['LED','光る']],
  [/(?:蓄光|夜光|glow[- ]?in[- ]?the[- ]?dark)/iu, ['蓄光','夜光','glow in the dark']],
  [/(?:ネオン|neon)/iu, ['ネオン','neon']],
  [/(?:対応機種|機種対応|compatible)/iu, ['対応機種','compatible']],
  [/(?:透明|투명|clear|transparent)/iu, ['透明']],
  [/(?:小巧|小型|작은|소형|small|mini)/iu, ['小型']],
  [/(?:轻量|輕量|가벼운|경량|lightweight)/iu, ['軽量']],
  [/(?:折叠|折疊|접이식|foldable|folding)/iu, ['折りたたみ']]
];

function dedupeCaseInsensitive(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = String(value || '');
    const key = text.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(text);
  }
  return output;
}

// buildMarketplaceSearchKeywords()'s per-product builders (marketplace-
// search-keywords-v2.mjs) only recognize a narrow, product-specific
// attribute vocabulary (capacity, wattage, connector, etc.). A JPY budget
// phrase like "1万円以下" is not part of that vocabulary for most products,
// so it is silently dropped whenever the builder recognizes the product
// category (e.g. "1万円以下で軽いモバイルバッテリー" -> "モバイルバッテリー").
// This restores just the price constraint - not a full原文-vs-category
// rewrite - when it is missing from the specialized/compact result.
const PRICE_CONSTRAINT_PATTERN = /(?:¥|￥)?\s*\d[\d,]*\s*(?:万|千)?\s*円\s*(?:以下|未満|以内|まで)/u;

function extractMissingPriceConstraint(originalQuery, builtKeywords) {
  const match = String(originalQuery || '').match(PRICE_CONSTRAINT_PATTERN);
  if (!match) return '';
  return String(builtKeywords || '').includes(match[0]) ? '' : match[0];
}

// v3.5 real-report fix: marketplace-search-keywords-v2.mjs's GENERIC_PRODUCTS
// dictionary recognizes the broad category ("トップス") but not every
// specific garment noun (e.g. "カットソー" is not in that file at all, only
// in apparel-query-attributes.mjs's finer-grained PRODUCT_TYPE_PATTERNS). A
// query naming both ("カットソー トップス") builds specialized keywords from
// whichever term the dictionary recognizes and silently drops the other -
// so what the user typed and what actually gets searched on Rakuten/Amazon
// diverge. Reinserts the specific garment noun when it survived detection
// but not into the built keyword string.
// 実装は apparel-query-attributes.mjs に移動(全モールから使うため)。

function structuredMarketplaceTerms(query) {
  const segments = String(query || '')
    .split(/\s*(?:\/|／|\||｜)\s*/u)
    .map((segment) => segment.replace(/^[\s,、。・]+|[\s,、。・]+$/gu, '').trim())
    .filter((segment) => segment.length >= 2 && segment.length <= 80);
  if (segments.length < 2) return [];
  return [...new Set(segments)].slice(0, 6);
}
export function buildAmazonSearchKeywords(query) {
  const asinTerms = String(query || '').toUpperCase().match(/\bB[A-Z0-9]{9}\b/g) || [];
  const cleaned = stripSentencePunctuation(redactSearchPersonalData(query));
  if (!cleaned) return '';
  // Teacher Dataset connection (2026-08-05 v3.1): a query that exactly
  // matches a committed teacher-dataset entry (see
  // evaluation/teacher-dataset/*.json, compiled by
  // scripts/compile-teacher-dataset-rules.mjs) uses its GPT/human-authored
  // search terms directly instead of the regex-based builders below. This
  // only fires on an exact/normalized match, so it cannot change behavior
  // for any query that is not literally one of the authored teacher entries.
  const teacherEntry = lookupTeacherDatasetEntry(query);
  if (teacherEntry?.search_terms?.ja?.length) return teacherEntry.search_terms.ja.join(' ');
  const specializedKeywords = buildMarketplaceSearchKeywords(cleaned, 'AMAZON_JP');
  if (/バラン/u.test(specializedKeywords)) return specializedKeywords;
  const structuredTerms = structuredMarketplaceTerms(cleaned);
  if (structuredTerms.length) {
    const hasJapaneseTerms = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(cleaned);
    const isJapanesePortableUmbrella = hasJapaneseTerms &&
      /(?:日傘|折りたたみ(?:傘)?|晴雨兼用|携帯(?:用)?(?:傘)?)/u.test(cleaned);
    const structuredSemanticTerms = semanticSearchGroups(cleaned)
      .flatMap((group) => group.terms || [])
      .map((term) => String(term).toLowerCase().trim())
      .filter((term) => term && !isJapanesePortableUmbrella);
    const structuredLocalizedTerms = AMAZON_JP_QUERY_ALIASES
      .filter(([pattern]) => pattern.test(cleaned))
      .flatMap(([, terms]) => terms)
      .filter((term) =>
        !isJapanesePortableUmbrella ||
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(String(term))
      );
    return [...new Set([
      ...asinTerms.map((term) => term.toLowerCase()),
      ...structuredTerms,
      ...structuredLocalizedTerms,
      ...structuredSemanticTerms
    ])].slice(0, 12).join(' ');
  }
  const semanticGroups = semanticSearchGroups(cleaned);
  // specializedKeywords already preserves the original meaning while
  // stripping SNS/context filler ("SNSで見た" etc.) via the shared
  // marketplace-search-keywords-v2 fallback, so it is the primary text
  // rather than the raw cleaned string.
  const primaryText = ensureApparelProductTypeTerm(cleaned, specializedKeywords || cleaned);
  const categoryJapaneseLabels = semanticGroups
    .map((group) => APPAREL_CATEGORY_JA_LABELS.get(group.category))
    .filter((label) => label && !primaryText.includes(label));
  // The original text is always the primary search term (never dropped, see
  // the カットソー fix). A known Japanese category label is added alongside
  // it as a supplement. English category words are only added when we do
  // NOT already have a Japanese label for the matched category - otherwise
  // they would add nothing but risk narrowing an already-good Japanese
  // query with unrelated English AND-terms.
  const semanticTerms = categoryJapaneseLabels.length ? [] : semanticGroups
    .flatMap((group) => group.terms || [])
    .map((term) => String(term).toLowerCase().trim())
    .filter(Boolean);
  const directTerms = cleaned
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{2,}/g) || [];
  const localizedTerms = AMAZON_JP_QUERY_ALIASES
    .filter(([pattern]) => pattern.test(cleaned))
    .flatMap(([, terms]) => terms);
  const missingPriceConstraint = extractMissingPriceConstraint(cleaned, primaryText);
  const optimized = dedupeCaseInsensitive([
    primaryText,
    ...(missingPriceConstraint ? [missingPriceConstraint] : []),
    ...asinTerms.map((term) => term.toLowerCase()),
    ...localizedTerms,
    ...categoryJapaneseLabels,
    ...directTerms,
    ...semanticTerms
  ])
    .filter((term) => !['with', 'from', 'that', 'this', 'type', 'size'].includes(term.toLowerCase()))
    .slice(0, 12);
  return optimized.join(' ');
}

export function buildAmazonSearchDestination(query, associateTag = '') {
  const keywords = buildAmazonSearchKeywords(query);
  if (!keywords) return '';
  const url = new URL('https://www.amazon.co.jp/s');
  url.searchParams.set('k', keywords);
  const tag = String(associateTag || '').trim();
  if (/^[a-z0-9][a-z0-9-]{1,49}$/i.test(tag)) url.searchParams.set('tag', tag);
  return url.toString();
}

export function buildRakutenSearchKeywords(query) {
  let cleaned = stripSentencePunctuation(redactSearchPersonalData(query)
    .replace(/\bB[A-Z0-9]{9}\b/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim());
  if (!cleaned) return '';
  // Teacher Dataset connection (2026-08-05 v3.1) - see the matching comment
  // in buildAmazonSearchKeywords above.
  const teacherEntry = lookupTeacherDatasetEntry(query);
  if (teacherEntry?.search_terms?.ja?.length) return teacherEntry.search_terms.ja.join(' ');
  const specializedKeywords = buildMarketplaceSearchKeywords(cleaned, 'RAKUTEN_JP');
  if (/バラン/u.test(specializedKeywords)) return specializedKeywords;
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(cleaned)) {
    cleaned = cleaned
      .replace(/\b[a-z][a-z-]{2,}\b/g, ' ')
      .replace(/\s+/gu, ' ')
      .trim();
  }
  const structuredTerms = structuredMarketplaceTerms(cleaned);
  if (structuredTerms.length) return structuredTerms.join(' ');
  const rakutenKeywords = ensureApparelProductTypeTerm(
    cleaned,
    buildMarketplaceSearchKeywords(cleaned, 'RAKUTEN_JP') || cleaned
  );
  const missingPriceConstraint = extractMissingPriceConstraint(cleaned, rakutenKeywords);
  return missingPriceConstraint ? `${rakutenKeywords} ${missingPriceConstraint}` : rakutenKeywords;
}

export function buildRakutenSearchKeywordCandidates(query) {
  const primary = buildRakutenSearchKeywords(query);
  const rememberedProduct = buildRakutenSearchKeywords(
    String(query || '').split('/')[0]
  );
  const normalized = String(query || '').normalize('NFKC');
  const explicitProduct = [
    'カットソー', 'ローテーブル', 'センターテーブル', 'ダイニングテーブル',
    'サイドテーブル', 'Tシャツ', 'ブラウス', 'シャツ', 'ニット',
    'カーディガン', 'ワンピース', 'スカート', 'パンツ', 'ジャケット',
    'ソファ', 'チェア', 'デスク', 'ベッド', '本棚', 'ラック'
  ].find((term) => normalized.includes(term)) || '';
  const broadProduct = explicitProduct === 'ローテーブル' ? 'センターテーブル' : explicitProduct;
  return [...new Set([primary, rememberedProduct, broadProduct].filter(Boolean))].slice(0, 2);
}

// "条件整理検索" (organized-conditions) candidate: for apparel-body queries,
// reconstruct a clean "audience + category + sleeve + color + features"
// phrase (e.g. "レディース トップス 長袖 白 涼しい おしゃれ") as a second
// fallback tier between the raw-text candidate and the bare category-only
// candidate, so a marketplace whose relevance engine struggles with a long
// free-form sentence still gets a well-formed, condition-preserving query
// to try before falling back to a single bare category word.
function organizedApparelCandidate(query) {
  const groups = semanticSearchGroups(query);
  const category = groups.find((group) => group.category !== 'color')?.category;
  if (!category) return '';
  const categoryLabel = APPAREL_CATEGORY_JA_LABELS.get(category) || '';
  if (!categoryLabel) return '';
  const colorGroup = groups.find((group) => group.category === 'color');
  const colorLabel = colorGroup ? colorLabelFromEnglishTerms(colorGroup.terms) : '';
  return buildOrganizedApparelQuery(query, { categoryLabel, colorLabel });
}

export function buildMarketplaceApiKeywordCandidates(query, primaryKeywords = '') {
  const rakutenCandidates = buildRakutenSearchKeywordCandidates(query);
  const organized = organizedApparelCandidate(query);
  return [...new Set([primaryKeywords, organized, ...rakutenCandidates].map((value) =>
    String(value || '').normalize('NFKC').trim()).filter(Boolean))].slice(0, 4);
}

// query is optional: when provided, a keyword candidate is only accepted if
// at least one of its results survives filterCategoryMismatches, not just
// if the raw response was non-empty. Without this, a marketplace that
// returns some non-empty but entirely category-mismatched results for the
// first (broadest) keyword candidate would stop the cascade there and never
// try the cleaner, more specific candidates that follow.
async function searchMarketplaceApiWithFallback(searcher, keywordCandidates, query = '') {
  for (const keywords of keywordCandidates) {
    const candidates = await searcher(keywords);
    if (!candidates.length) continue;
    if (!query || filterCategoryMismatches(query, candidates).length) return candidates;
  }
  return [];
}

export function buildRakutenSearchDestination(query) {
  const keywords = buildRakutenSearchKeywords(query);
  if (!keywords) return '';
  return `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(keywords)}/`;
}
const QOO10_QUERY_ALIASES = [
  [/(?=.*\biphone\b)(?=.*(?:モバイルバッテリー|携帯バッテリー|power\s*bank|portable\s+(?:battery|charger)|充电宝|充電寶|移动电源|行動電源|보조\s*배터리))/isu, ['iPhone モバイルバッテリー']],
  [/(?=.*\biphone\b)(?=.*(?:充電ケーブル|充電コード|ライトニングケーブル|lightning\s*(?:cable|cord)|usb[- ]?c\s*(?:cable|cord)|charging\s*(?:cable|cord)|数据线|數據線|充电线|充電線|충전\s*케이블|라이트닝\s*케이블))/isu, ['iPhone ケーブル']],
  [/(?=.*\biphone\b)(?=.*(?:イヤホン|ヘッドホン|earphones?|earbuds?|headphones?|耳机|耳機|이어폰|헤드폰))/isu, ['iPhone イヤホン']],
  [/(?=.*\biphone\b)(?=.*(?:充電器|充電台|チャージャー|充電アダプター|acアダプター|charger|charging\s*station|power\s*adapter|充电器|充電器|充电座|充電座|충전기|충전\s*어댑터))/isu, ['iPhone 充電器']],
  [/(?=.*\biphone\b)(?=.*(?:保護フィルム|画面フィルム|ガラスフィルム|screen\s*protector|protective\s*film|tempered\s*glass|保护膜|保護膜|钢化膜|鋼化膜|보호\s*필름|강화\s*유리))/isu, ['iPhone 保護フィルム']],
  [/(?=.*\biphone\b)(?=.*(?:スマホスタンド|携帯スタンド|phone\s*stand|mobile\s*stand|phone\s*holder|支架|手机架|手機架|거치대|스탠드))/isu, ['iPhone スタンド']],
  [/(?=.*\biphone\b)(?=.*(?:ケース|カバー|case|cover|手机壳|手機殼|保护壳|保護殼|케이스|커버))/isu, ['iPhoneケース']],
  [/\bgalaxy\b/iu, ['Galaxy ケース']],
  [/\bpixel\b/iu, ['Google Pixel ケース']],
  [/\bcasetify\b|スマホ(?:ケース|カバー)|携帯(?:ケース|カバー)/iu, ['スマホケース']],
];

export function buildQoo10SearchKeywords(query) {
  const cleaned = stripSentencePunctuation(redactSearchPersonalData(query)
    .replace(/\bB[A-Z0-9]{9}\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim());
  if (!cleaned) return '';
  const deviceAccessoryTerms = buildDeviceAccessorySearchKeywords(cleaned);
  if (deviceAccessoryTerms) return deviceAccessoryTerms;
  // ensureApparelProductTypeTerm for the same reason as SHEIN above: the
  // compact builder returns the broad category ("トップス") and drops the
  // specific garment the user typed ("ブラウス").
  const compactTerms = ensureApparelProductTypeTerm(cleaned, buildMarketplaceSearchKeywords(cleaned, 'QOO10_JP'));
  if (compactTerms !== cleaned) {
    const missingPriceConstraint = extractMissingPriceConstraint(cleaned, compactTerms);
    return missingPriceConstraint ? `${compactTerms} ${missingPriceConstraint}` : compactTerms;
  }
  const structuredTerms = structuredMarketplaceTerms(cleaned);
  if (structuredTerms.length) return structuredTerms.join(' ');
  const localizedTerms = QOO10_QUERY_ALIASES
    .filter(([pattern]) => pattern.test(cleaned))
    .flatMap(([, terms]) => terms);
  if (localizedTerms.length) return dedupeCaseInsensitive([cleaned, localizedTerms[0]]).join(' ');
  const semanticGroups = semanticSearchGroups(cleaned);
  const categoryJapaneseLabels = semanticGroups
    .map((group) => APPAREL_CATEGORY_JA_LABELS.get(group.category))
    .filter((label) => label && !cleaned.includes(label));
  // Same principle as buildAmazonSearchKeywords: keep the original query as
  // the primary term and only ever supplement it, never replace it, with
  // category words. English category words are skipped when a Japanese
  // label already covers the same category.
  const semanticTerms = categoryJapaneseLabels.length ? [] : semanticGroups
    .flatMap((group) => group.terms || [])
    .map((term) => String(term).toLowerCase().trim())
    .filter(Boolean);
  const directTerms = cleaned
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{2,}/g) || [];
  const optimized = dedupeCaseInsensitive([cleaned, ...categoryJapaneseLabels, ...directTerms, ...semanticTerms])
    .filter((term) => !['with', 'from', 'that', 'this', 'type', 'size'].includes(term.toLowerCase()))
    .slice(0, 4);
  return optimized.join(' ');
}

export function buildQoo10SearchDestination(query) {
  const keywords = buildQoo10SearchKeywords(query);
  if (!keywords) return '';
  const url = new URL('https://www.qoo10.jp/s/');
  url.searchParams.set('keyword', keywords);
  return url.toString();
}

export function buildSheinSearchDestination(query) {
  const cleaned = redactSearchPersonalData(query)
    .replace(/\bB[A-Z0-9]{9}\b/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  // ensureApparelProductTypeTerm: buildMarketplaceSearchKeywords collapses
  // "ブラウス" to "トップス", so without this SHEIN receives the broad category
  // and loses the word that actually narrows the search (reported 2026-08-07).
  const keywords = ensureApparelProductTypeTerm(cleaned, buildMarketplaceSearchKeywords(cleaned, 'SHEIN_JP'));
  if (!keywords) return '';
  return `https://jp.shein.com/pdsearch/${encodeURIComponent(keywords)}/`;
}

export function buildYahooShoppingSearchDestination(query) {
  const keywords = buildMarketplaceSearchKeywords(redactSearchPersonalData(query), 'YAHOO_JP');
  if (!keywords) return '';
  const url = new URL('https://shopping.yahoo.co.jp/search');
  url.searchParams.set('p', keywords);
  return url.toString();
}

function marketplaceSearchDestinations(query, env = {}) {
  return [
    { marketplace: 'AMAZON_JP', label: 'Amazonで探す', destination: buildAmazonSearchDestination(query, env.AMAZON_ASSOCIATE_TAG) },
    { marketplace: 'RAKUTEN_JP', label: '楽天市場で探す', destination: buildRakutenSearchDestination(query) },
    { marketplace: 'YAHOO_JP', label: 'Yahoo!ショッピングで探す', destination: buildYahooShoppingSearchDestination(query) },
    { marketplace: 'QOO10_JP', label: 'Qoo10で探す', destination: buildQoo10SearchDestination(query) },
    { marketplace: 'SHEIN_JP', label: 'SHEINで探す', destination: buildSheinSearchDestination(query) }
  ].concat(buildApparelMarketplaceDestinations(query));
}

async function signedMarketplaceSearchLinks(query, context) {
  const links = [];
  for (const item of marketplaceSearchDestinations(query, context.env)) {
    if (!isAllowedDestination(item.destination)) continue;
    const token = await createTrackToken({
      u: context.sessionHash, r: context.seed, a: context.asin || '', d: item.destination,
      exp: Math.floor(Date.now() / 1000) + 86400 * 7,
      j: `${context.seed}:${context.asin || 'QUERY'}:${item.marketplace}_SEARCH`,
      c: 'PWA', m: item.marketplace, t: 'SEARCH_FALLBACK', g: context.category,
      x: context.trafficClass
    }, context.env.LINK_SIGNING_SECRET);
    links.push({
      marketplace: item.marketplace, label: item.label,
      url: `${context.origin}/go?token=${encodeURIComponent(token)}`,
      mode: searchModeForMarketplace(item.marketplace)
    });
  }
  return links;
}
export async function recordUnmetDemandEvent(
  env,
  payload,
  occurredAt,
  channel = 'PWA'
) {
  if (!env?.PRODUCT_DB || payload?.t !== 'SEARCH_FALLBACK') return false;
  const category = String(payload.g || 'unclassified')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 64) || 'unclassified';
  const demandHash = await hashUser(String(payload.d || ''));
  await env.PRODUCT_DB.prepare(`INSERT OR IGNORE INTO unmet_demand_events
    (event_id,occurred_at,user_hash,demand_hash,category,marketplace,
     destination_type,contract_match,demand_status,channel,traffic_class)
    VALUES(?1,?2,?3,?4,?5,?6,?7,0,'UNMET',?8,?9)`)
    .bind(
      String(payload.j || ''),
      occurredAt,
      String(payload.u || ''),
      demandHash,
      category,
      String(payload.m || 'AMAZON_JP'),
      'AMAZON_SEARCH_FALLBACK',
      channel,
      ['QA', 'ATTRIBUTED', 'UNATTRIBUTED'].includes(payload.x) ? payload.x : 'UNATTRIBUTED'
    )
    .run();
  return true;
}

export function trackingEventsForPayload(payload, occurredAt) {
  const searchFallback = payload?.t === 'SEARCH_FALLBACK';
  return ['CLICK', 'OUTBOUND'].map((eventType) => ({
    event_id: `${payload.j}:${eventType}`,
    occurred_at: occurredAt,
    user_hash: payload.u,
    recommendation_id: payload.r,
    asin: searchFallback ? 'SEARCHFALL' : payload.a,
    event_type: eventType,
    marketplace: payload.m || marketplaceForDestination(payload.d),
    destination_type: searchFallback ? 'AMAZON_SEARCH_FALLBACK' : 'PRODUCT_DETAIL',
    contract_match: searchFallback ? false : payload.cm !== false,
    demand_status: searchFallback ? 'UNMET' : 'MATCHED'
  }));
}

async function decoratePwaResult(result, request, env, sessionHash, query = '', language = 'JA') {
  const origin = new URL(request.url).origin;
  const seed = result.query_id || crypto.randomUUID();
  const candidates = [];
  const displayCandidates = filterCategoryMismatches(query, result.candidates || []).slice(0, CLIENT_CANDIDATE_LIMIT);
  for (const candidate of displayCandidates) {
    const copy = sanitizePublicCandidate(candidate);
    const productOffers = productMarketplaceOffers(candidate.offers);
    const selected = productOffers.length ? { url: productOffers[0].product_url, offer: productOffers[0] } : { url: '', offer: null };
    const destination = selected.url;
    copy.offers = [];
    for (const [offerIndex, offer] of productOffers.entries()) {
      const publicOffer = sanitizePublicOffer(offer);
      const offerToken = await createTrackToken({
        u: sessionHash, r: seed, a: candidate.asin, d: offer.product_url,
        exp: Math.floor(Date.now() / 1000) + 86400 * 7,
        j: `${seed}:${candidate.asin}:${offer.marketplace || offerIndex}`, c: 'PWA',
        m: offer.marketplace || marketplaceForDestination(offer.product_url)
      }, env.LINK_SIGNING_SECRET);
      publicOffer.tracking_url = `${origin}/go?token=${encodeURIComponent(offerToken)}`;
      copy.offers.push(publicOffer);
    }
    if (!copy.offers.length) {
      const productLead = legacyAmazonProductLead(candidate);
      if (productLead) {
        const leadToken = await createTrackToken({
          u: sessionHash, r: seed, a: candidate.asin, d: productLead,
          exp: Math.floor(Date.now() / 1000) + 86400 * 7,
          j: `${seed}:${candidate.asin}:AMAZON_PRODUCT_LEAD`, c: 'PWA',
          m: 'AMAZON_JP', t: 'PRODUCT_LEAD', cm: false
        }, env.LINK_SIGNING_SECRET);
        copy.offers.push({
          marketplace: 'AMAZON_JP', price: 0, shipping_fee: 0, total_cost: 0,
          shipping_fee_confirmed: false, currency: 'JPY', stock_status: 'UNKNOWN',
          verification_status: 'UNVERIFIED',
          tracking_url: `${origin}/go?token=${encodeURIComponent(leadToken)}`
        });
      }
    }
    copy.selected_offer = selected.offer ? copy.offers[0] || sanitizePublicOffer(selected.offer) : null;
    if (!copy.selected_offer && copy.offers.length) copy.selected_offer = copy.offers[0];
    copy.tracking_url = '';
    if (isAllowedDestination(destination)) {
      const token = await createTrackToken({
        u: sessionHash, r: seed, a: candidate.asin, d: destination,
        exp: Math.floor(Date.now() / 1000) + 86400 * 7,
        j: `${seed}:${candidate.asin}`, c: 'PWA',
        m: selected.offer?.marketplace || marketplaceForDestination(destination)
      }, env.LINK_SIGNING_SECRET);
      copy.tracking_url = `${origin}/go?token=${encodeURIComponent(token)}`;
    }
    candidates.push(copy);
  }
  const demandCategory = semanticSearchGroups(query)
    .map((group) => group.category)
    .find((category) => category && category !== 'color') || 'unclassified';
  const marketplaceSearchLinks = await signedMarketplaceSearchLinks(query, {
    env, origin, sessionHash, seed, category: demandCategory,
    trafficClass: result.traffic_class || 'UNATTRIBUTED'
  });
  const amazonSearchUrl = marketplaceSearchLinks
    .find((link) => link.marketplace === 'AMAZON_JP')?.url || '';
  const aiDiscovery = await aiDiscoveryWithSignedCandidateLinks(result.ai_discovery, {
    env, origin, sessionHash, seed, category: demandCategory,
    trafficClass: result.traffic_class || 'UNATTRIBUTED'
  });
  return {
    ...result,
    candidates,
    amazon_search_url: amazonSearchUrl,
    amazon_search_keywords: buildAmazonSearchKeywords(query),
    search_keywords: buildAmazonSearchKeywords(query),
    marketplace_search_links: marketplaceSearchLinks,
    refinement_chips: refinementChipsForQuery(query, language),
    ...(aiDiscovery ? { ai_discovery: aiDiscovery } : {})
  };
}

// Condition search (Phase C item 11, 2026-08-07). search-refinement-policy
// has carried a complete, tested condition model since before this change,
// but nothing ever called it - the AI free-text box was the only way in.
// Surfacing its chips on the search response is what merges the two into one
// model: a chip's label is appended to the very same query string the AI
// search already reads, so "AI検索" and "条件検索" are two entry points to
// one condition, not two parallel search paths.
//
// Chips are grouped per dimension for the client, and dimensions the query
// already pins down are dropped so the panel narrows as conditions are added
// rather than re-offering a decision the user has made.
function refinementChipsForQuery(query, language) {
  const locale = String(language || 'JA').toLowerCase();
  const context = { known_dimensions: knownRefinementDimensions(query, locale) };
  const groups = new Map();
  for (const chip of suggestRefinementChips(context, locale, 40)) {
    if (!groups.has(chip.dimension)) {
      groups.set(chip.dimension, {
        dimension: chip.dimension,
        label: refinementDimensionLabel(chip.dimension, locale),
        values: []
      });
    }
    groups.get(chip.dimension).values.push({ value: chip.value, label: chip.label });
  }
  return [...groups.values()].filter((group) => group.label && group.values.length);
}

// AI Search v2 STEP2 (spec section 8): each AI-generated product candidate
// needs its own marketplace search buttons, not just the top candidate's
// match score/reason. Per [hoshilu-ssot] rule "商品URLは許可ドメイン・正規化・
// 追跡URL生成を経由する", these must be the same signed /go tracking links
// the whole-query fallback uses - never client-built raw marketplace URLs -
// so this reuses signedMarketplaceSearchLinks per candidate, keyed by that
// candidate's own AI-generated search_keywords (falling back to its name).
async function aiDiscoveryWithSignedCandidateLinks(aiDiscovery, context) {
  const candidates = aiDiscovery?.analysis?.product_candidates;
  if (!Array.isArray(candidates) || !candidates.length) return aiDiscovery;
  const decorated = [];
  for (const [index, candidate] of candidates.entries()) {
    const candidateQuery = candidate.search_keywords?.[0] || candidate.name;
    const marketplace_search_links = await signedMarketplaceSearchLinks(candidateQuery, {
      ...context, seed: `${context.seed}:CANDIDATE_${index}`
    });
    decorated.push({ ...candidate, marketplace_search_links });
  }
  return { ...aiDiscovery, analysis: { ...aiDiscovery.analysis, product_candidates: decorated } };
}

export const decoratePwaResultForTest = decoratePwaResult;

export function sanitizePublicCandidate(candidate) {
  const copy = { ...(candidate || {}) };
  delete copy.sku;
  copy.available = Number(copy.stock || 0) > 0;
  delete copy.stock;
  delete copy.amazon_jp_url;
  delete copy.amazon_us_url;
  delete copy.marketplace_search_links;
  delete copy.amazon_search_url;
  copy.offers = (Array.isArray(copy.offers) ? copy.offers : []).slice(0, 10).map(sanitizePublicOffer);
  copy.tracking_url = '';
  if (copy.evidence) {
    copy.evidence = {
      matched_terms: Array.isArray(copy.evidence.matched_terms) ? copy.evidence.matched_terms.slice(0, 6) : [],
      information_score: Number(copy.evidence.information_score || 0)
    };
  }
  return copy;
}

function sanitizePublicOffer(offer) {
  const shippingFeeConfirmed = offer?.shipping_fee_confirmed === true
    || Number(offer?.shipping_fee_confirmed) === 1
    || (offer?.shipping_fee !== undefined && offer?.shipping_fee !== null
      && offer?.total_cost !== undefined && offer?.total_cost !== null);
  return {
    marketplace: String(offer?.marketplace || ''),
    price: Number(offer?.price || 0),
    shipping_fee: Number(offer?.shipping_fee || 0),
    total_cost: shippingFeeConfirmed
      ? Number(offer?.total_cost ?? (Number(offer?.price || 0) + Number(offer?.shipping_fee || 0))) : 0,
    shipping_fee_confirmed: shippingFeeConfirmed,
    currency: String(offer?.currency || 'JPY'),
    stock_status: String(offer?.stock_status || 'UNKNOWN'),
    delivery_days: Number(offer?.delivery_days || 0)
  };
}

// Round-robin interleave across marketplace sources before ranking, so a
// single source's candidates never occupy every early tie-break "position"
// ahead of another equally-scored source (see MARKETPLACE_RANKING_RESULT
// comment above for the bug this fixes).
export function interleaveCandidatesBySource(groups = []) {
  const result = [];
  const maxLength = Math.max(0, ...groups.map((group) => (Array.isArray(group) ? group.length : 0)));
  for (let index = 0; index < maxLength; index += 1) {
    for (const group of groups) {
      if (Array.isArray(group) && group[index]) result.push(group[index]);
    }
  }
  return result;
}

// HOSHILU AI Chat (2026-08-05, CTO instruction: "少ないチャットで各モールから
// 希望にそう商品を提示"): the chat itself never returns a product - it only
// decides whether one more clarifying question is worth the cost, or hands
// back a refined_query for the client to submit to the existing, unchanged
// /api/knowledge pipeline (Teacher Dataset connection, ranking, all
// marketplaces). Question text is never logged, matching /api/knowledge's
// existing "question body is not stored in logs" policy.
async function handleAiChatApi(request, env) {
  try {
    const requestOrigin = request.headers.get('origin');
    const ownOrigin = new URL(request.url).origin;
    if (requestOrigin && requestOrigin !== ownOrigin) return Response.json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
    const length = Number(request.headers.get('content-length') || 0);
    if (length > 4000) return Response.json({ ok: false, error: 'REQUEST_TOO_LARGE' }, { status: 413 });
    const input = validateChatRequest(await request.json());
    await verifyTurnstile(input.turnstile_token, env, request.headers.get('cf-connecting-ip'));
    const result = await analyzeChatTurn(input.history, input.language, env, fetch);
    return Response.json({ ok: true, result }, {
      headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
    });
  } catch (error) {
    const clientErrors = ['CONSENT_REQUIRED', 'SESSION_ID_INVALID', 'TURNSTILE_TOKEN_INVALID', 'CHAT_HISTORY_EMPTY', 'TURNSTILE_VERIFICATION_FAILED'];
    const status = clientErrors.includes(error.message) ? 400 : 500;
    return Response.json({ ok: false, error: error.message || 'CHAT_FAILED' }, { status });
  }
}

// v4.3 指示書 Priority 3 (section 12-18): AI最安比較。/api/knowledge が既に
// 返した実オファー(candidate.offers、Integratedモールの確認済み価格)と、
// Directモールに対するAI推定価格帯を1つの比較結果へ合成して返す。
// AI呼び出しはこのエンドポイントに限定され、通常検索(/api/knowledge)側の
// 商品カード・MATCHESには一切影響しない(section 11: この機能のみの例外)。
const KNOWN_DIRECT_MARKETPLACES = new Set([
  'QOO10_JP', 'SHEIN_JP', 'ZOZOTOWN_JP', 'SHOPLIST_JP', 'MUSINSA_JP', 'BUYMA_JP',
  'SNKRDUNK_JP', 'LOFT_JP', 'HANDS_JP', 'MATSUKIYO_JP', 'COSME_JP', 'ABCMART_JP'
]);
const MAX_PRICE_COMPARISON_DIRECT_MARKETPLACES = 6;

export function validatePriceComparisonRequest(payload) {
  payload = payload || {};
  const sessionId = String(payload.session_id || '').trim();
  const turnstileToken = String(payload.turnstile_token || '').trim();
  if (payload.consent !== true) throw new Error('CONSENT_REQUIRED');
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(sessionId)) throw new Error('SESSION_ID_INVALID');
  if (!turnstileToken || turnstileToken.length > 2048) throw new Error('TURNSTILE_TOKEN_INVALID');
  const title = String(payload.product?.title || '').trim().slice(0, 200);
  if (!title) throw new Error('PRICE_COMPARISON_PRODUCT_TITLE_REQUIRED');
  const brand = String(payload.product?.brand || '').trim().slice(0, 100);
  const category = String(payload.product?.category || '').trim().slice(0, 100);
  const realOffers = (Array.isArray(payload.real_offers) ? payload.real_offers : []).slice(0, 10);
  const directMarketplaces = [...new Set(
    (Array.isArray(payload.direct_marketplaces) ? payload.direct_marketplaces : [])
      .map((item) => String(item || '').trim().toUpperCase())
      .filter((item) => KNOWN_DIRECT_MARKETPLACES.has(item))
  )].slice(0, MAX_PRICE_COMPARISON_DIRECT_MARKETPLACES);
  const language = ['JA', 'EN', 'ZH', 'KO'].includes(payload.language) ? payload.language : 'JA';
  return {
    product: { title, brand, category },
    real_offers: realOffers,
    direct_marketplaces: directMarketplaces,
    language,
    session_id: sessionId,
    turnstile_token: turnstileToken
  };
}

async function handlePriceComparisonApi(request, env) {
  try {
    const requestOrigin = request.headers.get('origin');
    const ownOrigin = new URL(request.url).origin;
    if (requestOrigin && requestOrigin !== ownOrigin) return Response.json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
    const length = Number(request.headers.get('content-length') || 0);
    if (length > 6000) return Response.json({ ok: false, error: 'REQUEST_TOO_LARGE' }, { status: 413 });
    const input = validatePriceComparisonRequest(await request.json());
    await verifyTurnstile(input.turnstile_token, env, request.headers.get('cf-connecting-ip'));
    const real = realPriceRows(input.real_offers);
    // 既に実価格が確認できているDirectモールは無い(realPriceRowsはIntegrated
    // のみを返す)ため、依頼されたdirect_marketplacesは常にそのままAI推定の
    // 対象になる。
    let aiResult = { estimates: [], provider: null };
    try {
      aiResult = await requestAiPriceEstimates(
        { title: input.product.title, brand: input.product.brand, category: input.product.category, language: input.language },
        input.direct_marketplaces, env, fetch
      );
    } catch (error) {
      console.warn('AI_PRICE_COMPARISON_ESTIMATE_UNAVAILABLE', { status: Number(error?.status) || 0 });
    }
    const comparison = buildPriceComparison({
      real,
      aiEstimates: aiResult.estimates,
      requestedDirectMarketplaces: input.direct_marketplaces,
      language: input.language
    });
    return Response.json({ ok: true, result: comparison }, {
      headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
    });
  } catch (error) {
    const clientErrors = ['CONSENT_REQUIRED', 'SESSION_ID_INVALID', 'TURNSTILE_TOKEN_INVALID', 'TURNSTILE_VERIFICATION_FAILED', 'PRICE_COMPARISON_PRODUCT_TITLE_REQUIRED'];
    const status = clientErrors.includes(error.message) ? 400 : 500;
    return Response.json({ ok: false, error: error.message || 'PRICE_COMPARISON_FAILED' }, { status });
  }
}

// HOSHILU GAS→Web移行 (docs/HOSHILU_GAS_TO_WEB_MIGRATION_BRIEF_2026-08-06.md §3,
// gas/ContractPolicyEngine.gs): D1優先・GASフォールバックで走らせる契約ポリシー判定。
// callGas('KNOWLEDGE')はgas/LineIntegration.gs answerPublic()経由で既に
// ContractPolicyEngine.decide()を内部適用しているが、それはGAS自身が
// 返した候補にしか及ばない。D1索引検索(result.candidates)はGAS側のロジックを
// 経由しないため、ここでD1に同期済みの契約ポリシーを追加で適用する。
// env.PWA_CONTRACT_ID / env.PWA_DEFAULT_CATEGORY が未設定、または対象契約が
// まだ gas/ContractPolicySyncEngine.gs でD1へpushされていない間は無条件でno-op
// し、既存の(GAS側で判定済みの)結果をそのまま素通しする。
async function applyD1ContractPolicy(env, result, query, requestId) {
  const contractId = String(env.PWA_CONTRACT_ID || '').trim();
  const category = String(env.PWA_DEFAULT_CATEGORY || '').trim();
  const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
  if (!contractId || !category || candidates.length === 0) return result;
  try {
    const policy = await decideContractPolicy(env, {
      contract_id: contractId,
      category,
      date_jst: jstDateKey(),
      knowledge_key: await knowledgeKeyForQuery(query),
      answer_payload: candidates.map((candidate) => ({
        asin: candidate.asin, rank: candidate.rank, evidence: candidate.evidence?.source_hash || ''
      }))
    });
    if (!policy.allowed) {
      console.info('CONTRACT_POLICY_D1_BLOCKED', { requestId, reason: policy.reason });
      return { ...result, candidates: [], policy_reason: policy.reason, disclosure_required: false };
    }
    return { ...result, policy_reason: policy.reason, disclosure_required: policy.disclosure_required };
  } catch (error) {
    // D1未同期(CONTRACT_NOT_FOUND)やストア未設定・一時的なD1障害はすべて
    // フォールバック対象: GAS側で既に判定済みの結果をそのまま使い、
    // ここではブロックしない(段階移行中はGAS側を権威として残す)。
    console.warn('CONTRACT_POLICY_D1_FALLBACK', { requestId, error: String(error.message || error) });
    return result;
  }
}

// HOSHILU GAS→Web移行 (docs/HOSHILU_GAS_TO_WEB_MIGRATION_BRIEF_2026-08-06.md §3,
// gas/MultilingualSeoEngine.gs): D1索引検索由来の候補(candidate.tenantを持つ)
// へ、D1に同期済みの承認済み別名・多言語コンテンツを補う。GAS由来の候補は
// 既にgas/KnowledgeEngine.gs answer()内でMultilingualSeoEngine.attachAliases/
// attachLocalizedContent済み(=descriptionが入っている)なので上書きしない。
// D1未設定・クエリ失敗時はno-op。返却直前にtenant(内部専用フィールド)を除去する。
async function applyD1MultilingualContent(env, result, language) {
  const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
  const enriched = candidates.length ? await attachMultilingualContent(env, candidates, language) : candidates;
  const cleaned = enriched.map(({ tenant, ...candidate }) => candidate);
  return candidates.length ? { ...result, candidates: cleaned } : result;
}

async function handleKnowledgeApi(request, env, ctx) {
  try {
    const requestOrigin = request.headers.get('origin');
    const ownOrigin = new URL(request.url).origin;
    if (requestOrigin && requestOrigin !== ownOrigin) return Response.json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
    const length = Number(request.headers.get('content-length') || 0);
    if (length > 10000) return Response.json({ ok: false, error: 'REQUEST_TOO_LARGE' }, { status: 413 });
    const validatedInput = validateKnowledgeRequest(await request.json());
    // v4.2 項目1・2・3: 商品名を知らなくても探せる検索。ここで1回だけ展開
    // すれば、D1検索・3モールのキーワード生成・filterCategoryMismatches・
    // semanticSearchGroups が下流ですべて自動的に恩恵を受ける(詳細は
    // query-expansion.mjs のコメント参照)。該当ルールが無ければ
    // input.query は元のまま変わらない。
    const originalQuery = validatedInput.query;
    const expandedQuery = expandSearchQuery(originalQuery);
    const input = { ...validatedInput, query: expandedQuery.query };
    // v3.4 CTO instruction: every checkpoint in the marketplace search trace
    // (API送信/レスポンス件数/accepted件数/Teacher Dataset補正件数/ranking
    // 入力・出力件数/モール別件数/UI送信件数) must share one requestId so the
    // full path for a single search can be reconstructed from logs alone.
    const requestId = crypto.randomUUID();
    // v4.2 項目12 プライバシー監査: 同意画面は「質問本文はサーバーログへ
    // 保存しません」と明示しているため、ユーザーの検索文そのもの(query /
    // original_query)はここを含むどのSEARCH_TRACEにも出力しない。段階の
    // 追跡に必要な情報(文字数・展開の有無・展開ルールID)だけを残す。
    console.info('SEARCH_TRACE', {
      requestId,
      stage: '0_request_received',
      query_length: input.query.length,
      query_expanded: expandedQuery.expanded,
      query_expansion_rule: expandedQuery.expansion?.rule_id || null
    });
    await verifyTurnstile(input.turnstile_token, env, request.headers.get('cf-connecting-ip'));
    const [gasOutcome, indexedOutcome] = await Promise.allSettled([
      callGas(env, 'KNOWLEDGE', { request: { query: input.query, consent: true } }),
      applyIndexedSearchPolicy({ candidates: [] }, env, input.query, input.language, {
        force_product_presentation: true
      })
    ]);
    const gasResult = gasOutcome.status === 'fulfilled' ? gasOutcome.value : { candidates: [], message: '' };
    let result = indexedOutcome.status === 'fulfilled' ? indexedOutcome.value : gasResult;
    if (indexedOutcome.status === 'fulfilled' && (gasResult?.candidates || []).length) {
      result = {
        ...gasResult,
        ...result,
        candidates: rankMerchantCandidates(result.candidates, gasResult.candidates, input.query)
      };
    }
    result = await applyD1MultilingualContent(env, result, input.language);
    result = await applyD1ContractPolicy(env, result, input.query, requestId);
    const shouldSearchMarketplaces = creatorsApiConfigured(env) || rakutenApiConfigured(env)
      || yahooShoppingApiConfigured(env);
    if (shouldSearchMarketplaces) {
      const marketplaceSearches = [];
      if (creatorsApiConfigured(env)) marketplaceSearches.push({
        key: 'amazon_catalog_connected',
        run: searchMarketplaceApiWithFallback(
          (keywords) => searchAmazonCreators(env, keywords),
          buildMarketplaceApiKeywordCandidates(input.query, buildAmazonSearchKeywords(input.query)),
          input.query
        )
      });
      if (rakutenApiConfigured(env)) marketplaceSearches.push({
        key: 'rakuten_catalog_connected',
        run: searchRakutenMarketplaceWithFallback(
          env,
          buildRakutenSearchKeywordCandidates(input.query),
          fetch,
          input.query,
          requestId
        )
      });
      if (yahooShoppingApiConfigured(env)) marketplaceSearches.push({
        key: 'yahoo_catalog_connected',
        run: searchMarketplaceApiWithFallback(
          (keywords) => searchYahooShopping(env, keywords),
          buildMarketplaceApiKeywordCandidates(input.query, buildMarketplaceSearchKeywords(input.query)),
          input.query
        )
      });
      const outcomes = await Promise.allSettled(marketplaceSearches.map((item) => item.run));
      // v3.2 CTO diagnosis: this loop used to call
      // rankMerchantCandidates(...).slice(0, 10) on every iteration, so
      // whichever source was processed first (amazon_catalog_connected is
      // pushed before rakuten_catalog_connected/yahoo_catalog_connected
      // above) could already fill all 10 slots with equally-scored
      // candidates before a later source's candidates were even merged in -
      // and since rankMerchantCandidates ties on arrival position, a
      // later-processed source's candidates always lost that tie and were
      // sliced away, structurally starving Rakuten/Yahoo even when their
      // candidates were equally valid. Reproduced and confirmed with a
      // logged trace (10 equally-scored Amazon candidates + 1 accepted
      // Rakuten candidate -> Rakuten dropped every time). Fixed by
      // collecting every source's accepted candidates first, interleaving
      // them round-robin across sources (so no single source's candidates
      // occupy every early "position" tie-break slot), and ranking+slicing
      // exactly once after all sources have reported in.
      const perSourceCandidates = [];
      outcomes.forEach((outcome, index) => {
        const source = marketplaceSearches[index];
        result = { ...(result || {}), [source.key]: outcome.status === 'fulfilled' };
        if (outcome.status !== 'fulfilled') {
          console.warn('MARKETPLACE_PRODUCT_SEARCH_FAILED', {
            requestId,
            source: source.key,
            status: Number(outcome.reason?.status) || 0,
            provider_code: String(outcome.reason?.providerCode || '').slice(0, 80)
          });
          perSourceCandidates.push({ key: source.key, candidates: [] });
          return;
        }
        const returnedCount = Array.isArray(outcome.value) ? outcome.value.length : 0;
        const candidates = filterCategoryMismatches(input.query, outcome.value);
        const teacherExcluded = teacherDatasetExclusionCount(input.query, outcome.value);
        console.info('MARKETPLACE_PRODUCT_SEARCH_RESULT', {
          requestId,
          source: source.key,
          returned: returnedCount,
          accepted: candidates.length,
          teacher_dataset_excluded: teacherExcluded
        });
        perSourceCandidates.push({ key: source.key, candidates });
      });
      // v3.4 CTO diagnosis (real production evidence): amazon_creators_
      // configured was false in production - the live Amazon API never
      // even ran - yet results were still Amazon-only with zero Rakuten,
      // even though rakuten_marketplace_configured was true. Root cause:
      // this call previously passed `result.candidates` (the GAS/D1 base
      // pool, populated by applyIndexedSearchPolicy earlier and often
      // already Amazon-heavy) as rankMerchantCandidates' privileged
      // baseCandidates argument, ahead of the newly-fetched marketplace
      // pool in arrival order - the exact same tie-break-loses-late-
      // arrivals bug the interleaving fix above addresses, just one layer
      // higher up. Fixed by treating the base pool as one more source to
      // interleave rather than a privileged first pool.
      const interleavedCandidates = interleaveCandidatesBySource([
        result.candidates || [],
        ...perSourceCandidates.map((item) => item.candidates)
      ]);
      const beforeRankingCount = interleavedCandidates.length;
      const rankedAll = rankMerchantCandidates([], interleavedCandidates, input.query);
      const finalSlice = rankedAll.slice(0, CLIENT_CANDIDATE_LIMIT);
      const countByMarketplace = (list) => list.reduce((counts, item) => {
        const marketplace = String(item.record_key || '').startsWith('RAKUTEN:') ? 'RAKUTEN_JP'
          : String(item.offers?.[0]?.marketplace || (item.asin ? 'AMAZON_JP' : 'OTHER'));
        counts[marketplace] = (counts[marketplace] || 0) + 1;
        return counts;
      }, {});
      console.info('SEARCH_TRACE', {
        requestId,
        stage: '9_marketplace_ranking',
        query_length: input.query.length,
        ranking_input_count: beforeRankingCount,
        ranking_output_count: rankedAll.length,
        sent_to_client_count: finalSlice.length,
        by_marketplace_in_final: countByMarketplace(finalSlice),
        rakuten_accepted: perSourceCandidates.find((item) => item.key === 'rakuten_catalog_connected')?.candidates.length || 0,
        rakuten_in_final: finalSlice.filter((item) => String(item.record_key || '').startsWith('RAKUTEN:')).length
      });
      result.candidates = finalSlice;
    }
    result = {
      ...(result || {}),
      traffic_class: input.traffic_class,
      candidates: filterCategoryMismatches(input.query, result?.candidates || []).slice(0, CLIENT_CANDIDATE_LIMIT)
    };
    if (input.search_attempt >= 2) {
      result.clarification = { ...(result.clarification || {}), required: false, options: [] };
      result.search_guidance = {
        ...(result.search_guidance || {}),
        product_presentation_required: true,
        product_presentation_met: result.candidates.length > 0
      };
    }
    if (!result.candidates.length) {
      try {
        result.ai_discovery = await discoverProductsWithAi(input.query, input.language, env);
      } catch (error) {
        console.warn('AI_PRODUCT_DISCOVERY_UNAVAILABLE', {
          status: Number(error?.status) || 0,
          provider_code: String(error?.providerCode || '').slice(0, 80)
        });
        result.ai_discovery = { triggered: true, configured: true, candidates: [], unavailable: true };
      }
    }
    const sessionHash = await hashUser(input.session_id);
    const decorated = await decoratePwaResult(
      result,
      request,
      env,
      sessionHash,
      input.query,
      input.language
    );
    const events = (decorated.candidates || []).map((candidate) => ({
      event_id: `${decorated.query_id}:IMPRESSION:${candidate.asin}`,
      occurred_at: new Date().toISOString(), user_hash: sessionHash,
      recommendation_id: decorated.query_id, asin: candidate.asin, event_type: 'IMPRESSION'
    }));
    if (events.length) {
      ctx.waitUntil(callGas(env, 'TRACK', { events, channel: 'PWA' }));
      ctx.waitUntil(recordMeasurementEventsToD1(env, 'PWA', events));
    }
    console.info('SEARCH_TRACE', { requestId, stage: '10_ui_sent', query_length: input.query.length, ui_sent_count: (decorated.candidates || []).length });
    return Response.json({ ok: true, result: decorated }, {
      headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-request-id': requestId }
    });
  } catch (error) {
    const code = String(error.message || error);
    const clientErrors = ['CONSENT_REQUIRED', 'QUERY_LENGTH_INVALID', 'SESSION_ID_INVALID', 'TURNSTILE_TOKEN_INVALID', 'TURNSTILE_VERIFICATION_FAILED'];
    const status = clientErrors.includes(code) ? 400 : 500;
    return Response.json({ ok: false, error: code }, {
      status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
    });
  }
}

function handlePublicConfig(env) {
  const siteKey = String(env.TURNSTILE_SITE_KEY || '');
  return Response.json({
    turnstile_site_key: siteKey,
    line_login_configured: lineLoginConfigured(env),
    email_login_configured: emailLoginConfigured(env),
    sms_login_configured: false,
    // RC2 verification-only flag (see mywatch-routes.mjs's test-seed route):
    // lets a logged-in member seed the 4 AI Watch notification types
    // (値下げ/クーポン/再入荷/販売開始) to verify the notification UI without
    // a live price/stock/coupon monitor, which is a separate future task.
    // Off by default; only true when an operator explicitly turns it on for
    // a verification window.
    mywatch_test_events_enabled: String(env.MYWATCH_TEST_EVENTS_ENABLED || '') === '1'
  }, {
    status: siteKey ? 200 : 503,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}

// gas/PreflightEngine.gs CORE_SHEETSの「必須シート」チェックのD1版。この
// migration一式(0037〜0041)で追加した各エンジンの索引テーブルもここに含め、
// デプロイ後にsqlite_master上で実在を横断確認できるようにする。
const CORE_D1_TABLES = [
  'mywatch_notifications', 'import_restriction_knowledge',
  'sp_api_listings', 'sp_api_sync_audit', 'marketplace_sale_events',
  'member_sale_preferences',
  'contracts', 'contract_decisions',
  'product_aliases', 'localized_product_content',
  'kpi_events', 'kpi_summary', 'kpi_uplift',
  'marketplace_kpi_events', 'marketplace_kpi_summary',
  'anonymous_benchmark',
  'social_knowledge_inbox', 'social_knowledge_aggregates', 'social_hashtag_aggregates',
  'product_identifiers'
];

async function databaseFeatureChecks(env) {
  const expected = CORE_D1_TABLES;
  if (!env.PRODUCT_DB) return Object.fromEntries(expected.map((name) => [name, false]));
  try {
    const placeholders = expected.map((_, index) => `?${index + 1}`).join(',');
    const result = await env.PRODUCT_DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders})`
    ).bind(...expected).all();
    const found = new Set((result?.results || []).map((row) => row.name));
    return Object.fromEntries(expected.map((name) => [name, found.has(name)]));
  } catch {
    return Object.fromEntries(expected.map((name) => [name, false]));
  }
}

async function handleHealth(env) {
  const readiness = getEnvironmentReadiness(env);
  const databaseFeatures = await databaseFeatureChecks(env);
  return Response.json({
    ok: readiness.ready,
    release: readiness.release,
    missing: readiness.missing,
    weak: readiness.weak,
    checks: {
      ...readiness.checks,
      database_features: databaseFeatures,
      social_publishers: socialPublisherReadiness(env)
    }
  }, {
    status: readiness.ready ? 200 : 503,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/og/hoshilu-x-v3.png' && env.ASSETS) {
      return env.ASSETS.fetch(new Request(new URL('/og-hoshilu.png', request.url), request));
    }
    if (request.method === 'POST' && url.pathname === '/api/internal/products/sync') return syncProducts(request, env);
    if (request.method === 'POST' && url.pathname === '/api/internal/marketplace-offers/sync') return syncMarketplaceOffers(request, env);
    const growthEventResponse = await handleGrowthEvent(request, env);
    if (growthEventResponse) return growthEventResponse;
    if (request.method === 'GET' && url.pathname === '/api/internal/marketplace-offers/stats') return marketplaceOfferStats(request, env);
    const unmetDemandResponse = await handleUnmetDemandRoutes(request, env);
    if (unmetDemandResponse) return unmetDemandResponse;
    const contractPolicySyncResponse = await handleContractPolicySyncRoutes(request, env);
    if (contractPolicySyncResponse) return contractPolicySyncResponse;
    const multilingualSyncResponse = await handleMultilingualSyncRoutes(request, env);
    if (multilingualSyncResponse) return multilingualSyncResponse;
    const productIdentifierSyncResponse = await handleProductIdentifierSyncRoutes(request, env);
    if (productIdentifierSyncResponse) return productIdentifierSyncResponse;
    const socialResponse = await handleSocialAdminRoutes(request, env);
    if (socialResponse) return socialResponse;
    const adminAuthResponse = await handleAdminAuthRoutes(request, env);
    if (adminAuthResponse) return adminAuthResponse;
    const spApiAdminResponse = await handleSpApiAdminRoutes(request, env);
    if (spApiAdminResponse) return spApiAdminResponse;
    const spApiSellerResponse = await handleSpApiSellerRoutes(request, env);
    if (spApiSellerResponse) return spApiSellerResponse;
    const wishResponse = await handleMemberWishRoutes(request, env);
    if (wishResponse) return wishResponse;
    const saleResponse = await handleMarketplaceSaleRoutes(request, env);
    if (saleResponse) return saleResponse;
    const mywatchResponse = await handleMywatchRoutes(request, env);
    if (mywatchResponse) return mywatchResponse;
    const insightResponse = await handleInsightRoutes(request, env);
    if (insightResponse) return insightResponse;
    const memberResponse = await handleMemberRoutes(request, env);
    if (memberResponse) return memberResponse;
    const sellerResponse = await handleSellerRoutes(request, env);
    if (sellerResponse) return sellerResponse;
    if (request.method === 'POST' && url.pathname === '/webhook') return handleWebhook(request, env, ctx);
    if (request.method === 'POST' && url.pathname === '/api/knowledge') return handleKnowledgeApi(request, env, ctx);
    if (request.method === 'POST' && url.pathname === '/api/ai-chat') return handleAiChatApi(request, env);
    if (request.method === 'POST' && url.pathname === '/api/price-comparison') return handlePriceComparisonApi(request, env);
    if (request.method === 'GET' && url.pathname === '/api/config') return handlePublicConfig(env);
    if (request.method === 'GET' && url.pathname === '/api/refinement-chips') {
      // Condition search moved into the search panel (2026-08-07 request):
      // the panel is now shown BEFORE a search runs, so its chips can no
      // longer ride along on the search response. Static per language and
      // safe to cache.
      return new Response(JSON.stringify({ ok: true, groups: refinementChipsForQuery('', url.searchParams.get('language') || 'JA') }), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' }
      });
    }
    if (request.method === 'GET' && url.pathname === '/health') return handleHealth(env);
    if (request.method === 'GET' && url.pathname === '/go') return handleRedirect(request, env, ctx);
    if (request.method === 'GET') {
      const seoPage = renderSeoPage(url.pathname);
      if (seoPage) return new Response(seoPage, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=300',
          'x-content-type-options': 'nosniff'
        }
      });
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('not found', { status: 404 });
  },
  async scheduled(controller, env, ctx) {
    const scheduledAt = new Date(controller.scheduledTime);
    ctx.waitUntil(Promise.allSettled([
      runDueSocialPosts(env, scheduledAt),
      deliverDueWebNotifications(env, scheduledAt),
      deliverDueMemberNotifications(env, scheduledAt),
      runMarketplaceContentCycle(env, scheduledAt),
      runSpApiScheduledSync(env, scheduledAt),
      purgeAdminAuthRecords(env, scheduledAt),
      purgeSellerAuthRecords(env, scheduledAt),
      refreshMarketplaceKpiSummary(env),
      // refreshAnonymousBenchmark()はkpi_summaryを読む前に自分でrefreshKpiSummary()
      // を呼ぶ(gas/BenchmarkEngine.gs同様、KPI集計→ベンチマーク算出の順で依存する)。
      // ここで別途refreshKpiSummary(env)を並列実行すると、同じkpi_summaryテーブルへの
      // DELETE+INSERTが競合しPRIMARY KEY衝突を起こすため呼ばない。
      refreshAnonymousBenchmark(env)
    ]));
  }
};
