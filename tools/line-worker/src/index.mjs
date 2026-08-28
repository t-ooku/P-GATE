import { handleSellerRoutes } from './seller-auth.mjs';
import { handleSellerBusinessInquiryRoutes } from './seller-business-inquiries.mjs';
import { handleAdminAuthRoutes } from './admin-auth.mjs';
import { handlePromotionDashboardRoutes } from './promotion-dashboard.mjs';
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
  searchRakutenMarketplace,
  searchRakutenMarketplaceWithFallback
} from './rakuten-marketplace-api.mjs';
import { fetchYahooHighRatingRanking, searchYahooShopping, yahooShoppingApiConfigured } from './yahoo-shopping-api.mjs';
import { marketplaceForProductUrl, PRODUCT_MARKETPLACES as PRODUCT_MARKETPLACE_LIST } from './marketplace-product-url-policy.mjs';
import { marketplaceOfferStats, syncMarketplaceOffers } from './marketplace-offer-feed.mjs';
import { discoverProductsWithAi } from './ai-product-discovery.mjs';
import { knownRefinementDimensions, refinementDimensionLabel, suggestRefinementChips } from './search-refinement-policy.mjs';
import { analyzeChatTurn, chatIntentConfigured, refineMarketplaceSearchQuery } from './ai-chat-intent.mjs';
import {
  analyzeSearchInput, normalizeInlineSearchImage, normalizeSocialPostUrl,
  searchInputAnalysisConfigured, isIndependentSearchText as isIndependentSearchInputText
} from './search-input-analysis.mjs';
import { sanitizeAiOutputList, sanitizeAiOutputText } from './ai-output-safety.mjs';
import { readBoundedJson } from './bounded-json.mjs';
import { safeProviderErrorCode } from './provider-error-code.mjs';
import { MARKETPLACE_RANKING_CAPABILITIES, marketplaceRankingResult, rankingCategoryConfirmationResult } from './marketplace-ranking.mjs';
import { buzzShelfResult, recordBuzzSnapshots } from './buzz-shelf.mjs';
import { handleBuzzNotificationRoutes, queueBuzzThemeNotifications } from './buzz-notifications.mjs';
import { filterRankingCategoryCandidates } from './ranking-category-eligibility.mjs';
import {
  relatedProductRecommendationQueries, resolveRelatedProductRecommendationQueries
} from './related-product-recommendations.mjs';
import { rankHoshiluPopularity } from './hoshilu-popularity-ranking.mjs';
import {
  buildAiCheapestRanking, buildPriceComparison, realPriceRows,
  priceComparisonConfigured, requestAiCandidatePriceEstimates, requestAiPriceEstimates
} from './ai-price-comparison.mjs';
import { recordOutboundCommerceEvent } from './outbound-commerce-event.mjs';
import { buildApparelMarketplaceDestinations } from './apparel-marketplaces.mjs';
import { handleMemberWishRoutes } from './member-wish-v2.mjs';
import { deliverDueWebNotifications, handleMywatchRoutes } from './mywatch-routes.mjs';
import { handleInsightRoutes, runInsightScan } from './insight-routes.mjs';
import { runTargetPriceScan } from './target-price-watch.mjs';
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
  extractApparelProductType, ensureApparelProductTypeTerm, BROAD_APPAREL_CATEGORIES,
  ensureApparelQualifierTerms
} from './apparel-query-attributes.mjs';
import {
  handleSocialAdminRoutes, runDueSocialPosts, socialPublisherReadinessWithStoredCredentials
} from './social-publisher.mjs';
import { handleInstagramOAuthRoutes, instagramOAuthReadiness } from './instagram-oauth.mjs';
import { handleXOAuthRoutes, xOAuthReadiness } from './x-oauth.mjs';
import { runSocialAutopilotCycle } from './social-autopilot.mjs';
import {
  handleRunwayGenerationRoutes, runRunwayGenerationCycle, runwayGenerationReadiness
} from './runway-generation.mjs';
import { handleRunwayMediaRoute } from './social-media-r2.mjs';
import { renderSeoPage, seoHubPaths, seoPagePaths } from './seo-pages.mjs';
import { searchModeForMarketplace } from './marketplace-search-mode.mjs';
import {
  classifyGrowthTraffic, handleGrowthEvent, recordSearchOperationalFailure,
  recordSearchProviderDegradation
} from './growth-events.mjs';
import {
  applySellerPriority, sellerPriorityContext
} from './seller-priority-console.mjs';
import {
  runMarketplaceContentCycle, handleMarketplaceSaleRoutes
} from './marketplace-sales.mjs';
import { runDeepCanaryCycle, runMarketplaceCanaryCatchup } from './deep-canary.mjs';
import { runReliabilityControlledCron } from './reliability-control.mjs';
import { OFFICIAL_STORE_SEARCHES, officialStoreForProductUrl } from './official-mall-stores.mjs';
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
// (Rakuten/Yahoo)、'direct' はHOSHILUが商品データを持たず、その
// モール自身の検索結果ページへディープリンクするだけの先。UI側(app.js)が
// この区分をハードコードし直さなくて済むよう、/api/knowledge のレスポンスに
// 各リンクの mode を載せる(signedMarketplaceSearchLinks参照)。
// marketplace-search-mode.mjs がここが唯一の判定元(v4.3のAI最安比較
// (ai-price-comparison.mjs)も同じ定義を再利用する)。
const RELEASE = '1.20.0';
const CANONICAL_HOST = 'hoshilu.app';
const CANONICAL_CONTENT_PATHS = new Set([...seoPagePaths, ...seoHubPaths, '/for-sellers']);
const DOCUMENT_SECURITY_HEADERS = Object.freeze({
  'content-security-policy': "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data: https:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'",
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY'
});
const REQUIRED_ENV = [
  'GAS_BACKEND_URL', 'GAS_BRIDGE_SECRET', 'LINK_SIGNING_SECRET',
  'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY',
  'GEMINI_API_KEY',
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

const hmacKeyPromises = new Map();

async function hmacKey(secret) {
  const cacheKey = String(secret || '');
  if (!hmacKeyPromises.has(cacheKey)) {
    // Production uses only a small fixed set of signing secrets. Keep the map
    // bounded so malformed/test inputs cannot grow isolate memory forever.
    if (hmacKeyPromises.size >= 8) hmacKeyPromises.clear();
    hmacKeyPromises.set(cacheKey, crypto.subtle.importKey(
      'raw', encoder.encode(cacheKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    ));
  }
  return hmacKeyPromises.get(cacheKey);
}

async function hmac(value, secret) {
  const key = await hmacKey(secret);
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

export function decorateAmazonAssociateDestination(destination, associateTag = '') {
  const source = String(destination || '');
  const tag = String(associateTag || '').trim();
  try {
    const url = new URL(source);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    // 2026-08-17: 以前は /s と /dp・/gp/product だけをタグ付け対象にしていた
    // ため、Amazon公式のセール系ページ(/deals、/gp/goldbox、公式情報フィードが
    // 収集した各種キャンペーンURL)へ送客してもアフィリエイトタグが付かず、
    // クリックが発生しても適格販売になりようがなかった。
    // Amazonアソシエイトは対象ページの種類を限定していないので、
    // amazon.co.jp 配下は一律でタグ付けする。
    //
    // amazon.com は対象外のまま。アソシエイトは国ごとに別アカウントで、
    // JP用のタグ(hoshilu00-22)を .com へ付けても報酬は発生しない
    // (跨ぐにはOneLinkと各国アカウントが要る)。付けても無意味なうえ、
    // 「タグ付き=収益化済み」という誤解を生むので付けない。
    if (url.protocol !== 'https:' || (host !== 'amazon.co.jp' && !host.endsWith('.amazon.co.jp'))) {
      return source;
    }
    if (!/^[a-z0-9][a-z0-9-]{1,49}$/i.test(tag)) {
      url.searchParams.delete('tag');
      return url.toString();
    }
    url.searchParams.set('tag', tag);
    return url.toString();
  } catch {
    return source;
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
      const priority = Number(right.offer?.priority_listing === true) - Number(left.offer?.priority_listing === true);
      if (priority) return priority;
      if (left.offer?.priority_listing === true && right.offer?.priority_listing === true) {
        const leftPriorityTime = Date.parse(left.offer?.priority_started_at || '') || Number.MAX_SAFE_INTEGER;
        const rightPriorityTime = Date.parse(right.offer?.priority_started_at || '') || Number.MAX_SAFE_INTEGER;
        if (leftPriorityTime !== rightPriorityTime) return leftPriorityTime - rightPriorityTime;
      }
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

export function isUsableProductQuery(query) {
  const value = String(query || '').normalize('NFKC').trim();
  return value.length >= 2 || /^[\p{Script=Han}\p{Script=Katakana}]$/u.test(value);
}

// A deictic phrase such as "これ" only makes sense together with the image or
// post. If multimodal interpretation fails, searching that phrase across
// marketplaces would look like success while returning unrelated products.
export function isIndependentSearchText(query) {
  return isIndependentSearchInputText(query);
}

// General shopper APIs only need proof that the processing notice was shown;
// they do not collect an affirmative consent checkbox. `consent: true` remains
// accepted during the rolling upgrade so an older cached PWA can still search.
// Seller and measurement consent use separate validators and must not call this.
export function requireProcessingNotice(payload = {}) {
  const input = payload && typeof payload === 'object' ? payload : {};
  if (input.processing_notice_shown === true || input.consent === true) return true;
  throw new Error('PROCESSING_NOTICE_REQUIRED');
}

async function readPublicApiJson(request, maximumBytes) {
  const parsed = await readBoundedJson(request, maximumBytes);
  if (parsed.ok) return parsed.value;
  throw new Error(parsed.error === 'REQUEST_TOO_LARGE'
    ? 'REQUEST_TOO_LARGE' : 'REQUEST_JSON_INVALID');
}

function publicApiErrorStatus(code, clientErrors, fallbackStatus = 500) {
  if (code === 'REQUEST_TOO_LARGE') return 413;
  if (code === 'REQUEST_JSON_INVALID' || clientErrors.includes(code)) return 400;
  return fallbackStatus;
}

export function validateKnowledgeRequest(payload) {
  payload = payload || {};
  const query = String(payload.query || '').trim();
  const socialUrl = normalizeSocialPostUrl(payload.social_url);
  const searchImage = normalizeInlineSearchImage(payload.image);
  const sessionId = String(payload.session_id || '').trim();
  const turnstileToken = String(payload.turnstile_token || '').trim();
  requireProcessingNotice(payload);
  if (query.length > 200 || (!isUsableProductQuery(query) && !socialUrl && !searchImage)) {
    throw new Error('QUERY_LENGTH_INVALID');
  }
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
  const rawAiCandidate = payload.ai_candidate_fallback && typeof payload.ai_candidate_fallback === 'object'
    ? payload.ai_candidate_fallback : null;
  const cleanCandidateText = (value, max) => sanitizeAiOutputText(
    redactSearchPersonalData(String(value || '')), max
  );
  const aiCandidateName = cleanCandidateText(rawAiCandidate?.name, 160);
  const aiCandidateFallback = aiCandidateName ? {
    name: aiCandidateName,
    brand: cleanCandidateText(rawAiCandidate?.brand, 120),
    reason: cleanCandidateText(rawAiCandidate?.reason, 300),
    matched_features: sanitizeAiOutputList(
      (Array.isArray(rawAiCandidate?.matched_features) ? rawAiCandidate.matched_features : [])
        .map((value) => redactSearchPersonalData(String(value || ''))),
      8, 100
    ),
    match_score: Math.max(0, Math.min(100, Math.round(Number(rawAiCandidate?.match_score) || 0)))
  } : null;
  return {
    query, session_id: sessionId, turnstile_token: turnstileToken, language, search_attempt: searchAttempt,
    processing_notice_shown: true, attribution, ai_candidate_fallback: aiCandidateFallback,
    social_url: socialUrl, search_image: searchImage,
    traffic_class: classifyGrowthTraffic(attribution)
  };
}

export function mergeAiRefinedSearchQuery(originalQuery, refinedQuery) {
  const original = redactSearchPersonalData(originalQuery).replace(/\s+/gu, ' ').trim().slice(0, 200);
  const refined = redactSearchPersonalData(refinedQuery).replace(/\s+/gu, ' ').trim().slice(0, 200);
  if (refined.length < 2 || refined.toLocaleLowerCase() === original.toLocaleLowerCase()) return original;
  // 「これ」「it」のような指示語は画像・投稿URLが解析できた後には検索条件に
  // ならない。解析結果へ併記するとモールのAND検索を狭めるため、意味を単独で
  // 持たない原文だけは捨てる。色・サイズなど独立した制約は従来どおり残す。
  if (!isIndependentSearchText(original)) return refined;
  // AIが元条件を落としても検索条件を失わないよう、意味のある原文を併記する。
  if (refined.toLocaleLowerCase().includes(original.toLocaleLowerCase())) return refined;
  const refinedBudget = Math.max(0, 199 - original.length);
  const prefix = refined.slice(0, refinedBudget).trim();
  return prefix ? `${prefix} ${original}` : original;
}

// HOSHILU AI Chat (2026-08-05): shares the same session/Turnstile/processing-
// notice gate as /api/knowledge rather than inventing a separate auth path.
export function validateChatRequest(payload) {
  payload = payload || {};
  const sessionId = String(payload.session_id || '').trim();
  const turnstileToken = String(payload.turnstile_token || '').trim();
  requireProcessingNotice(payload);
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(sessionId)) throw new Error('SESSION_ID_INVALID');
  if (!turnstileToken || turnstileToken.length > 2048) throw new Error('TURNSTILE_TOKEN_INVALID');
  const history = Array.isArray(payload.history) ? payload.history.slice(0, 8) : [];
  if (!history.length) throw new Error('CHAT_HISTORY_EMPTY');
  const language = ['JA','EN','ZH','KO'].includes(payload.language) ? payload.language : 'JA';
  const mode = payload.mode === 'IDENTIFY' ? 'IDENTIFY' : 'REFINE';
  return { history, session_id: sessionId, turnstile_token: turnstileToken, language, mode, processing_notice_shown: true };
}

export function getEnvironmentReadiness(env = {}) {
  const missing = REQUIRED_ENV.filter((name) => !String(env[name] || '').trim());
  const weak = ['GAS_BRIDGE_SECRET', 'LINK_SIGNING_SECRET'].filter((name) => {
    const value = String(env[name] || '');
    return value && value.length < 32;
  });
  if (env.ADMIN_AUTH_ID && String(env.ADMIN_AUTH_ID).length < 3) weak.push('ADMIN_AUTH_ID');
  if (env.ADMIN_AUTH_PASSWORD && String(env.ADMIN_AUTH_PASSWORD).length < 8) {
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
    const url = trustedGasUrl(env.GAS_BACKEND_URL);
    backendUrlValid = !unsafeExampleValue(url.href);
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
  const searchInputConfigured = searchInputAnalysisConfigured(env);
  if (env.GEMINI_API_KEY && !searchInputConfigured && !weak.includes('GEMINI_API_KEY')) {
    weak.push('GEMINI_API_KEY');
  }
  const ready = missing.length === 0 && weak.length === 0 && backendUrlValid &&
    !linePartial && !sellerAuthPartial && adminCredentialsDistinct && searchInputConfigured;
  return {
    ready,
    release: RELEASE,
    missing,
    weak,
    checks: {
      gas_backend_https: backendUrlValid,
      gas_backend_trusted: backendUrlValid,
      pwa_configured: missing.length === 0 && weak.length === 0 && backendUrlValid &&
        searchInputConfigured,
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
      amazon_associate_link_configured: String(env.AMAZON_ASSOCIATE_TAG || '').trim() === 'hoshilu00-22',
      amazon_creators_configured: creatorsApiConfigured(env),
      rakuten_marketplace_configured: rakutenApiConfigured(env),
      yahoo_shopping_configured: yahooShoppingApiConfigured(env),
      social_autopilot_enabled: env.SOCIAL_AUTOPILOT_ENABLED === 'true',
      // 診断用（2026-08-08追加）: verifyTurnstile()はTURNSTILE_SECRET_KEY未設定だと
      // TURNSTILE_NOT_CONFIGURED を投げるが、そのエラーコードはhandleAiChatApi等の
      // clientErrors許可リストに含まれていないため、本番でTURNSTILE_SECRET_KEYが
      // 未設定だとAIチャット系エンドポイントが全件HTTP 500になる。この仮説を
      // /health だけで即座に確認できるようにする。
      turnstile_configured: Boolean(String(env.TURNSTILE_SECRET_KEY || '').trim()),
      search_input_analysis_configured: searchInputConfigured,
      ai_chat_configured: chatIntentConfigured(env),
      ai_price_comparison_configured: priceComparisonConfigured(env)
    }
  };
}

async function verifyTurnstile(token, env, remoteIp) {
  if (!env.TURNSTILE_SECRET_KEY) throw new Error('TURNSTILE_NOT_CONFIGURED');
  let response;
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: remoteIp || undefined }),
      redirect: 'manual',
      signal: AbortSignal.timeout(5000)
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error('TURNSTILE_TIMEOUT');
    throw error;
  }
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

const TRUSTED_GAS_HOSTS = new Set(['script.google.com', 'script.googleusercontent.com']);
const GAS_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const GAS_MAX_REDIRECTS = 2;

function trustedGasUrl(value) {
  let url;
  try { url = new URL(String(value || '')); } catch { throw new Error('GAS_URL_INVALID'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password ||
      !TRUSTED_GAS_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('GAS_URL_NOT_TRUSTED');
  }
  if (!url.pathname.startsWith('/macros/')) throw new Error('GAS_URL_NOT_TRUSTED');
  return url;
}

export async function fetchTrustedGasBackend(urlValue, init, fetchImpl = fetch) {
  let url = trustedGasUrl(urlValue);
  const options = { ...init, redirect: 'manual' };
  for (let redirectCount = 0; ; redirectCount += 1) {
    const response = await fetchImpl(url.toString(), options);
    if (!GAS_REDIRECT_STATUSES.has(response.status)) return response;
    if (redirectCount >= GAS_MAX_REDIRECTS) throw new Error('GAS_REDIRECT_LIMIT');
    const location = response.headers.get('location');
    if (!location) throw new Error('GAS_REDIRECT_INVALID');
    try {
      url = trustedGasUrl(new URL(location, url).toString());
    } catch {
      throw new Error('GAS_REDIRECT_NOT_TRUSTED');
    }
  }
}

async function callGas(env, action, body) {
  const timeoutMs = action === 'KNOWLEDGE' ? 1500 : action === 'EVENT' ? 3000 : 5000;
  const response = await fetchTrustedGasBackend(env.GAS_BACKEND_URL, {
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
    body: JSON.stringify({ replyToken, messages }),
    redirect: 'manual'
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
    body: JSON.stringify({ to: userId, messages: messages.slice(0, 5) }),
    redirect: 'manual'
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

export async function buildLineFallbackMessages(event, origin, env) {
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
  const userId = event.source?.userId || event.source?.groupId || event.source?.roomId || '';
  const userHash = await hashUser(userId || event.webhookEventId || crypto.randomUUID());
  const recommendationId = String(event.webhookEventId || crypto.randomUUID());
  const bubbles = [];
  for (let index = 0; index < directions.length; index += 1) {
    const direction = directions[index];
    const destination = buildAmazonSearchDestination(direction.query, env.AMAZON_ASSOCIATE_TAG);
    let url = destination;
    try {
      const token = await createTrackToken({
        u: userHash, r: recommendationId, a: '', d: destination,
        exp: Math.floor(Date.now() / 1000) + 60 * 30,
        j: `${recommendationId}:LINE_FALLBACK:${index + 1}`,
        c: 'LINE', m: 'AMAZON_JP', t: 'SEARCH_FALLBACK',
        g: 'unclassified', x: 'UNATTRIBUTED'
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
    {
      type: 'text',
      text: `広告：以下はAmazonアソシエイトリンクです。Amazonのアソシエイトとして、HOSHILUは適格販売により収入を得ています。\n「${query}」から、近い商品を探せる3候補を作りました。横にスライドして選べます。`.slice(0, 5000)
    },
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
    const destination = decorateAmazonAssociateDestination(payload.d, env.AMAZON_ASSOCIATE_TAG);
    return Response.redirect(destination, 302);
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
  // 2026-08-08 report: 「ブラウス 夏用 丈長め おしゃれ」 dropped every
  // qualifying word except the product noun. ensureApparelQualifierTerms
  // restores the season/style/length words GENERIC_ATTRIBUTES never knew
  // about (see its doc comment in apparel-query-attributes.mjs).
  const primaryText = ensureApparelQualifierTerms(
    cleaned,
    ensureApparelProductTypeTerm(cleaned, specializedKeywords || cleaned)
  );
  // 2026-08-08 再発報告: 「夏用、丈長め、おしゃれ、ブラウス」がAmazonで
  // 「ブラウス トップス」として届いていた。ensureApparelProductTypeTerm は
  // primaryText から広いカテゴリ語(トップス等)を落とすが、この
  // categoryJapaneseLabels 補完は RULES テーブル由来のカテゴリ語を
  // primaryText への部分文字列一致だけで足すため、落としたばかりの
  // 広いカテゴリ語を無条件に積み直してしまっていた。具体的な商品種別
  // (extractApparelProductType)が取れており、かつユーザー自身がその
  // 広いカテゴリ語を書いていない場合は、ensureApparelProductTypeTerm と
  // 同じ基準で補完しない。
  const detectedProductType = extractApparelProductType(cleaned);
  const categoryJapaneseLabels = semanticGroups
    .map((group) => APPAREL_CATEGORY_JA_LABELS.get(group.category))
    .filter((label) => label && !primaryText.includes(label))
    .filter((label) => !(
      detectedProductType && BROAD_APPAREL_CATEGORIES.includes(label) && !cleaned.includes(label)
    ));
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
  const rakutenKeywords = ensureApparelQualifierTerms(
    cleaned,
    ensureApparelProductTypeTerm(cleaned, buildMarketplaceSearchKeywords(cleaned, 'RAKUTEN_JP') || cleaned)
  );
  const missingPriceConstraint = extractMissingPriceConstraint(cleaned, rakutenKeywords);
  return missingPriceConstraint ? `${rakutenKeywords} ${missingPriceConstraint}` : rakutenKeywords;
}

export function buildRakutenSearchKeywordCandidates(query, fallbackQuery = '') {
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
  // AIが特定したブランド識別子を長い文章の中へ埋めたままだと、モール側の
  // AND検索で0件になり得る。英数字の商品・ブランド識別子を第2候補として
  // 単独検索し、LILMOON等に限らず同じ形の失敗へ一般化して対応する。
  const identifier = String(query || '').normalize('NFKC').match(/\b[A-Za-z][A-Za-z0-9-]{2,}\b/u)?.[0] || '';
  // AI変換語で該当商品が0件だった時だけ使う原文側の安全網。先頭候補の
  // 成功時は呼ばれないため、通常の検索速度を落とさない。
  const fallback = fallbackQuery && String(fallbackQuery).normalize('NFKC') !== String(query).normalize('NFKC')
    ? buildRakutenSearchKeywords(fallbackQuery) : '';
  // 再検索は最大3回に抑えつつ、AI変換語・AIが見つけた識別子の次に
  // 必ずAI前の検索条件へ到達できる順序にする。従来の商品語フォールバックは
  // AI変換が無い検索ではこれまでどおり第2候補に残る。
  return [...new Set([primary, identifier, fallback, rememberedProduct, broadProduct].filter(Boolean))].slice(0, 3);
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

export function buildMarketplaceApiKeywordCandidates(query, primaryKeywords = '', fallbackKeywords = '') {
  const rakutenCandidates = buildRakutenSearchKeywordCandidates(query);
  const organized = organizedApparelCandidate(query);
  const identifier = String(query || '').normalize('NFKC').match(/\b[A-Za-z][A-Za-z0-9-]{2,}\b/u)?.[0] || '';
  return [...new Set([primaryKeywords, organized, identifier, fallbackKeywords, ...rakutenCandidates].map((value) =>
    String(value || '').normalize('NFKC').trim()).filter(Boolean))].slice(0, 5);
}

// AI変換語を主経路にしつつ、変換語で適合商品が1件も残らない場合だけ
// AI前の検索条件へ戻す。両方をAND連結しないので、人物名などの曖昧な手掛かりが
// 正しい商品名検索を0件化する問題も避ける。
export function filterSearchCandidatesWithFallback(refinedQuery, fallbackQuery, candidates = []) {
  const refined = filterCategoryMismatches(refinedQuery, candidates);
  if (refined.length || !fallbackQuery || fallbackQuery === refinedQuery) return refined;
  return filterCategoryMismatches(fallbackQuery, candidates);
}

export function summarizeMarketplaceSearchOutcomes(searches = [], outcomes = [], acceptedCounts = []) {
  const sources = searches.map((search, index) => {
    const outcome = outcomes[index];
    const fulfilled = outcome?.status === 'fulfilled';
    const returned = fulfilled && Array.isArray(outcome.value) ? outcome.value.length : 0;
    const accepted = Math.max(0, Number(acceptedCounts[index]) || 0);
    return {
      source: String(search?.key || ''),
      status: fulfilled ? (returned ? (accepted ? 'AVAILABLE' : 'FILTERED_OUT') : 'NO_RESULTS') : 'REQUEST_FAILED',
      returned,
      accepted
    };
  });
  return {
    checked: sources.length > 0,
    all_requests_failed: sources.length > 0 && sources.every((source) => source.status === 'REQUEST_FAILED'),
    any_request_succeeded: sources.some((source) => source.status !== 'REQUEST_FAILED'),
    sources
  };
}

// query is optional: when provided, a keyword candidate is only accepted if
// at least one of its results survives filterCategoryMismatches, not just
// if the raw response was non-empty. Without this, a marketplace that
// returns some non-empty but entirely category-mismatched results for the
// first (broadest) keyword candidate would stop the cascade there and never
// try the cleaner, more specific candidates that follow.
async function searchMarketplaceApiWithFallback(searcher, keywordCandidates, query = '', fallbackQuery = '') {
  // Run the bounded three-variant set concurrently, then evaluate responses
  // in preference order. This preserves primary/fallback selection while
  // reducing the provider critical path from two timeout windows to one.
  const variants = [...new Set((keywordCandidates || [])
    .map((value) => String(value || '').normalize('NFKC').trim())
    .filter(Boolean))].slice(0, 3);
  const outcomes = await Promise.allSettled(variants.map((keywords) => searcher(keywords)));
  let firstFailure = null;
  for (const outcome of outcomes) {
    if (outcome.status !== 'fulfilled') {
      firstFailure ||= outcome.reason;
      continue;
    }
    const candidates = Array.isArray(outcome.value) ? outcome.value : [];
    if (!candidates.length) continue;
    if (!query || filterSearchCandidatesWithFallback(query, fallbackQuery, candidates).length) return candidates;
  }
  // Preserve the distinction between a genuine zero-result response and a
  // provider/network failure.  If every useful variant failed, bubble one
  // sanitized provider error into marketplace_search_status.
  if (firstFailure && outcomes.every((outcome) => outcome.status === 'rejected')) throw firstFailure;
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
  // specific garment the user typed ("ブラウス"). ensureApparelQualifierTerms
  // additionally restores season/style/length words (2026-08-08 report:
  // 「ブラウス 夏用 丈長め おしゃれ」 reached Qoo10 as just 「ブラウス」).
  const compactTerms = ensureApparelQualifierTerms(
    cleaned,
    ensureApparelProductTypeTerm(cleaned, buildMarketplaceSearchKeywords(cleaned, 'QOO10_JP'))
  );
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
  // ensureApparelQualifierTerms additionally restores season/style/length
  // words (reported 2026-08-08: 「ブラウス 夏用 丈長め おしゃれ」 reached
  // SHEIN as just 「ブラウス」).
  const keywords = ensureApparelQualifierTerms(
    cleaned,
    ensureApparelProductTypeTerm(cleaned, buildMarketplaceSearchKeywords(cleaned, 'SHEIN_JP'))
  );
  if (!keywords) return '';
  return `https://jp.shein.com/pdsearch/${encodeURIComponent(keywords)}/`;
}

export function buildYahooShoppingSearchDestination(query) {
  const cleaned = redactSearchPersonalData(query);
  // ensureApparelProductTypeTerm: buildMarketplaceSearchKeywords collapses
  // "ブラウス" to "トップス", so without this Yahoo received only the broad
  // category and lost the word that actually narrows the search (reported
  // 2026-08-07, still present for Yahoo specifically as of 2026-08-08 - the
  // Amazon/Rakuten/SHEIN builders already call this, Yahoo never did).
  // ensureApparelQualifierTerms restores season/style/length words on top.
  const keywords = ensureApparelQualifierTerms(
    cleaned,
    ensureApparelProductTypeTerm(cleaned, buildMarketplaceSearchKeywords(cleaned, 'YAHOO_JP'))
  );
  if (!keywords) return '';
  const url = new URL('https://shopping.yahoo.co.jp/search');
  url.searchParams.set('p', keywords);
  return url.toString();
}

export function marketplaceSearchDestinations(query, env = {}, options = {}) {
  // モール横断ボタンは「同じ条件を各店で確認する」導線。検索語の意味まで
  // 店ごとに書き換えると比較できないため、HOSHILUが一度だけ整理した共通語を
  // URLパラメータ名・文字コードだけ各店仕様に合わせて渡す。
  const amazonKeywords = buildAmazonSearchKeywords(query);
  if (!amazonKeywords) return [];
  // ASINはAmazon内では有効な商品識別子だが、他モールでは検索ノイズになる。
  // 共通条件は維持しつつ、Amazon以外へ渡す入口で一度だけ除去する。
  const sharedKeywords = amazonKeywords.replace(/\bB[A-Z0-9]{9}\b/giu, ' ').replace(/\s+/g, ' ').trim();
  const amazon = new URL('https://www.amazon.co.jp/s');
  amazon.searchParams.set('k', amazonKeywords);
  const priceAscending = options.sort === 'PRICE_ASC';
  if (priceAscending) amazon.searchParams.set('s', 'price-asc-rank');
  const associateTag = String(env.AMAZON_ASSOCIATE_TAG || '').trim();
  if (/^[a-z0-9][a-z0-9-]{1,49}$/i.test(associateTag)) amazon.searchParams.set('tag', associateTag);
  const destinations = [
    { marketplace: 'AMAZON_JP', label: 'Amazonで探す', destination: amazon.toString(), sort_applied: priceAscending }
  ];
  // ASINだけの入力では、意味のない空検索を他12モールへ作らない。
  if (!sharedKeywords) return destinations;
  const yahoo = new URL('https://shopping.yahoo.co.jp/search');
  yahoo.searchParams.set('p', sharedKeywords);
  if (priceAscending) yahoo.searchParams.set('X', '2');
  const qoo10 = new URL('https://www.qoo10.jp/s/');
  qoo10.searchParams.set('keyword', sharedKeywords);
  if (priceAscending) qoo10.searchParams.set('sortType', 'SORT_PRICE_ASC');
  const rakuten = new URL(`https://search.rakuten.co.jp/search/mall/${encodeURIComponent(sharedKeywords)}/`);
  if (priceAscending) rakuten.searchParams.set('s', '2');
  const shein = new URL(`https://jp.shein.com/pdsearch/${encodeURIComponent(sharedKeywords)}/`);
  if (priceAscending) shein.searchParams.set('sort', 'price_asc');
  return destinations.concat([
    { marketplace: 'RAKUTEN_JP', label: '楽天市場で探す', destination: rakuten.toString(), sort_applied: priceAscending },
    { marketplace: 'YAHOO_JP', label: 'Yahoo!ショッピングで探す', destination: yahoo.toString(), sort_applied: priceAscending },
    { marketplace: 'QOO10_JP', label: 'Qoo10で探す', destination: qoo10.toString(), sort_applied: priceAscending },
    { marketplace: 'SHEIN_JP', label: 'SHEINで探す', destination: shein.toString(), sort_applied: priceAscending }
  ], buildApparelMarketplaceDestinations(query, sharedKeywords, options));
}

async function signedMarketplaceSearchLinks(query, context) {
  const destinations = marketplaceSearchDestinations(query, context.env, { sort: context.sort })
    .filter((item) => isAllowedDestination(item.destination));
  return Promise.all(destinations.map(async (item) => {
    const token = await createTrackToken({
      u: context.sessionHash, r: context.seed, a: context.asin || '', d: item.destination,
      exp: Math.floor(Date.now() / 1000) + 86400 * 7,
      j: `${context.seed}:${context.asin || 'QUERY'}:${item.marketplace}_SEARCH`,
      c: 'PWA', m: item.marketplace, t: 'SEARCH_FALLBACK', g: context.category,
      x: context.trafficClass
    }, context.env.LINK_SIGNING_SECRET);
    return {
      marketplace: item.marketplace, label: item.label,
      url: `${context.origin}/go?token=${encodeURIComponent(token)}`,
      mode: searchModeForMarketplace(item.marketplace),
      ...(context.sort === 'PRICE_ASC' ? { sort: item.sort_applied === true ? 'PRICE_ASC' : '' } : {})
    };
  }));
}

async function decoratedRelatedCategoryGroups(groups, context) {
  return Promise.all((Array.isArray(groups) ? groups : []).slice(0, 3).map(async (group, index) => ({
    query: String(group?.query || '').trim().slice(0, 100),
    reason: String(group?.reason || '').trim().slice(0, 200),
    marketplace_search_links: await signedMarketplaceSearchLinks(group?.query, {
      ...context, seed: `${context.seed}:RELATED_CATEGORY_${index}`
    })
  })));
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
  const priorityContext = await sellerPriorityContext(env, displayCandidates);
  for (const candidate of displayCandidates) {
    const copy = sanitizePublicCandidate(candidate);
    const productOffers = productMarketplaceOffers(
      applySellerPriority(candidate, candidate.offers, priorityContext)
    );
    const selected = productOffers.length ? { url: productOffers[0].product_url, offer: productOffers[0] } : { url: '', offer: null };
    const destination = selected.url;
    copy.offers = [];
    for (const [offerIndex, offer] of productOffers.entries()) {
      const publicOffer = sanitizePublicOffer(offer);
      const offerToken = await createTrackToken({
        u: sessionHash, r: seed, a: candidate.asin, d: offer.product_url,
        exp: Math.floor(Date.now() / 1000) + 86400 * 7,
        j: `${seed}:${candidate.asin}:${offer.marketplace || offerIndex}`, c: 'PWA',
        m: offer.marketplace || marketplaceForDestination(offer.product_url),
        sid: offer.seller_id || '', hpid: candidate.hoshilu_product_id || '',
        sp: offer.priority_listing === true, so: 'HOSHILU'
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
        m: selected.offer?.marketplace || marketplaceForDestination(destination),
        sid: selected.offer?.seller_id || '', hpid: candidate.hoshilu_product_id || '',
        sp: selected.offer?.priority_listing === true, so: 'HOSHILU'
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
  // 2026-08-15: limit raised 40->60. The new "color" dimension alone has 16
  // values, and category(6)+color(16)+scene(6)+size(5)+power(5)+appearance(3)
  // = 41 total chips when nothing is already known, which the old 40 cap
  // would have silently truncated by one color swatch.
  for (const chip of suggestRefinementChips(context, locale, 60)) {
    if (!groups.has(chip.dimension)) {
      groups.set(chip.dimension, {
        dimension: chip.dimension,
        label: refinementDimensionLabel(chip.dimension, locale),
        values: []
      });
    }
    groups.get(chip.dimension).values.push({
      value: chip.value,
      label: chip.label,
      ...(chip.swatch ? { swatch: chip.swatch } : {})
    });
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
  const source = candidate || {};
  const publicText = (value, limit) => String(value || '').trim().slice(0, limit);
  // 公開境界はdenylist（既知の内部項目だけ削除）にしない。候補生成元へ将来
  // 仕入原価・社内スコア等が追加されても、ここへ明示しない限りAPIへ流れない。
  const copy = {
    rank: Math.max(0, Number(source.rank) || 0),
    asin: publicText(source.asin, 32),
    product_name: publicText(source.product_name, 500),
    display_name: publicText(source.display_name, 500),
    manufacturer: publicText(source.manufacturer, 200),
    related_category: publicText(source.related_category, 100),
    recommendation_reason: publicText(source.recommendation_reason, 200),
    review_average: Math.max(0, Math.min(5, Number(source.review_average) || 0)),
    review_count: Math.max(0, Number(source.review_count) || 0),
    review_url: /^https:\/\//i.test(String(source.review_url || '')) ? publicText(source.review_url, 1000) : '',
    hoshilu_popularity_rank: Math.max(0, Number(source.hoshilu_popularity_rank) || 0),
    hoshilu_popularity_score: Math.max(0, Number(source.hoshilu_popularity_score) || 0),
    hoshilu_popularity_confidence: Math.max(0, Math.min(100, Number(source.hoshilu_popularity_confidence) || 0)),
    ai_cheapest_rank: Math.max(0, Number(source.ai_cheapest_rank) || 0),
    ai_cheapest_price_source: ['CONFIRMED_TOTAL', 'OBSERVED_ITEM_PRICE', 'AI_ESTIMATE'].includes(String(source.ai_cheapest_price_source || '')) ? String(source.ai_cheapest_price_source) : '',
    ai_cheapest_price_min: Math.max(0, Number(source.ai_cheapest_price_min) || 0),
    ai_cheapest_price_max: Math.max(0, Number(source.ai_cheapest_price_max) || 0),
    ai_cheapest_price_confidence: ['HIGH', 'MEDIUM', 'LOW'].includes(String(source.ai_cheapest_price_confidence || '')) ? String(source.ai_cheapest_price_confidence) : '',
    description: publicText(source.description, 1000),
    available: Number(source.stock || 0) > 0,
    tracking_url: ''
  };
  const imageUrls = [...(Array.isArray(source.image_urls) ? source.image_urls : []), source.image, source.image_url]
    .map((value) => String(value || '').trim())
    .filter((value) => /^https:\/\//i.test(value));
  copy.image_urls = [...new Set(imageUrls)].slice(0, 8);
  copy.image = copy.image_urls[0] || '';
  copy.image_url = copy.image_urls[0] || '';
  copy.offers = (Array.isArray(source.offers) ? source.offers : []).slice(0, 10).map(sanitizePublicOffer);
  if (source.evidence) {
    copy.evidence = {
      matched_terms: Array.isArray(source.evidence.matched_terms)
        ? source.evidence.matched_terms.map((value) => publicText(value, 100)).filter(Boolean).slice(0, 6) : [],
      information_score: Number(source.evidence.information_score || 0)
    };
  }
  return copy;
}

export function popularitySignalsForObservedCandidate(candidate, index, total, priceRange = {}) {
  const reviewCount = Math.max(0, Number(candidate.review_count) || 0);
  const reviewAverage = Math.max(0, Math.min(5, Number(candidate.review_average) || 0));
  const rank = Math.max(1, Number(candidate.rank) || index + 1);
  const price = Number(candidate.offers?.[0]?.total_cost || candidate.offers?.[0]?.price || 0);
  const observedMarketplaces = new Set((candidate.offers || []).map((offer) => String(offer.marketplace || '')).filter(Boolean));
  const hasMarketplacePopularity = /RANKING_API|YAHOO_SHOPPING_API/u.test(String(candidate.marketplace_source || ''));
  const low = Number(priceRange.low) || 0; const high = Number(priceRange.high) || 0;
  const priceSignal = price > 0 ? (high > low ? 1 - (price - low) / (high - low) : 0.5) : null;
  const observedTimes = [candidate.observed_at, candidate.updated_at, ...(candidate.offers || []).map((offer) => offer.observed_at)]
    .map((value) => Date.parse(String(value || ''))).filter(Number.isFinite);
  const newestObservedAt = observedTimes.length ? Math.max(...observedTimes) : null;
  const ageDays = newestObservedAt === null ? null : Math.max(0, (Date.now() - newestObservedAt) / 86400000);
  return {
    marketplace_popularity: hasMarketplacePopularity ? Math.max(0, 1 - (rank - 1) / Math.max(1, total)) : null,
    review_confidence: reviewCount ? (reviewAverage / 5) * Math.min(1, Math.log10(reviewCount + 1) / 3) : null,
    marketplace_coverage: observedMarketplaces.size ? Math.min(1, observedMarketplaces.size / 3) : null,
    price_competitiveness: priceSignal,
    hoshilu_demand: Number.isFinite(Number(candidate.hoshilu_demand_signal)) ? Number(candidate.hoshilu_demand_signal) : null,
    // API由来か否かではなく、正規に観測した時刻だけで鮮度を評価する。
    // 30日を超えるデータは0点だが、日時自体は根拠として明示される。
    freshness: ageDays === null ? null : Math.max(0, 1 - ageDays / 30)
  };
}

function rankingCandidateKey(candidate = {}) {
  const identifier = String(candidate.hoshilu_product_id || candidate.record_key || candidate.asin || '').trim().toUpperCase();
  return identifier || String(candidate.product_name || candidate.display_name || '').normalize('NFKC').toLowerCase().replace(/\s+/gu, '').slice(0, 160);
}

function mergeObservedRankingCandidates(groups = []) {
  const merged = new Map();
  for (const candidate of groups.flat()) {
    const key = rankingCandidateKey(candidate); if (!key) continue;
    const existing = merged.get(key);
    if (!existing) { merged.set(key, candidate); continue; }
    const offers = [...(existing.offers || []), ...(candidate.offers || [])];
    const seen = new Set();
    merged.set(key, { ...existing, ...candidate,
      review_average: Math.max(Number(existing.review_average) || 0, Number(candidate.review_average) || 0),
      review_count: Math.max(Number(existing.review_count) || 0, Number(candidate.review_count) || 0),
      image_urls: [...new Set([...(existing.image_urls || []), ...(candidate.image_urls || [])])].slice(0, 8),
      offers: offers.filter((offer) => { const offerKey = `${offer.marketplace}:${offer.product_url}`; if (seen.has(offerKey)) return false; seen.add(offerKey); return true; })
    });
  }
  return [...merged.values()];
}

async function handleHoshiluRankingApi(request, env) {
  try {
    const payload = await readPublicApiJson(request, 4000);
    const input = validateRankingRequest({ ...payload, marketplace: 'RAKUTEN_JP' });
    await verifyTurnstile(input.turnstile_token, env, request.headers.get('cf-connecting-ip'));
    if (input.confirmation_only && !input.category_selection) {
      const result = await rankingCategoryConfirmationResult(env, input.query, fetch);
      return Response.json({ ok: true, result }, { headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
    }
    const rankingQuery = String(input.category_selection?.label || input.query).split('›').pop().trim();
    const [rakutenOutcome, yahooOutcome, indexedOutcome] = await Promise.allSettled([
      marketplaceRankingResult(env, input.query, 'RAKUTEN_JP', fetch, input.category_selection),
      yahooShoppingApiConfigured(env)
        ? fetchYahooHighRatingRanking(env, rankingQuery, fetch).catch((error) => {
          console.warn('YAHOO_HIGH_RATING_RANKING_FALLBACK', {
            status: Number(error?.status) || 0,
            code: String(error?.message || 'YAHOO_HIGH_RATING_RANKING_FAILED').slice(0, 80)
          });
          return searchYahooShopping(env, rankingQuery, fetch, { sort: '-review_count' });
        })
        : [],
      applyIndexedSearchPolicy({ candidates: [] }, env, rankingQuery, 'JA', { force_product_presentation: true })
    ]);
    if (rakutenOutcome.status !== 'fulfilled') throw rakutenOutcome.reason;
    const resolution = rakutenOutcome.value;
    if (resolution.mode === 'clarification') return Response.json({ ok: true, result: resolution });
    // API接続の有無でモールを除外しない。楽天/Yahoo!の公式API候補に加え、
    // D1へ正規に取り込まれた全モールの商品・オファーを候補母集団へ含める。
    // データが無いモールの商品をAIで創作することはしない。
    const mergedObserved = mergeObservedRankingCandidates([
      (resolution.candidates || []).map((candidate) => ({ ...candidate, ranking_category_verified: true })),
      yahooOutcome.status === 'fulfilled' ? yahooOutcome.value : [],
      indexedOutcome.status === 'fulfilled' ? indexedOutcome.value?.candidates || [] : []
    ]);
    // 価格順へ並べる前に、小ジャンルの商品本体だけへ絞る。レコメンド商品や
    // 説明文・SEO用ハッシュタグだけが一致した周辺商品を、安さだけで上位へ
    // 押し上げない。楽天公式genre内の商品は構造化カテゴリを根拠にし、
    // その他モールは商品名そのものの小ジャンル一致を必須にする。
    const categoryQuery = String(resolution.category.label || rankingQuery).split('›').pop().trim();
    const observed = filterCategoryMismatches(
      categoryQuery,
      filterRankingCategoryCandidates(mergedObserved, resolution.category)
    );
    const prices = observed.map((candidate) => Number(candidate.offers?.[0]?.total_cost || candidate.offers?.[0]?.price || 0)).filter((price) => price > 0);
    const priceRange = { low: prices.length ? Math.min(...prices) : 0, high: prices.length ? Math.max(...prices) : 0 };
    const ranked = rankHoshiluPopularity(observed.map((candidate, index) => ({
      ...candidate,
      popularity_signals: popularitySignalsForObservedCandidate(candidate, index, observed.length, priceRange)
    }))).slice(0, 30);
    // 実価格が無い候補だけを最大8件、1回のAI呼び出しで価格帯推定する。
    // 実価格と推定価格は同じ値として扱わず、sourceを公開レスポンスまで保持する。
    const aiPriceResult = await requestAiCandidatePriceEstimates(ranked, env, fetch, 'JA');
    const priceRanked = buildAiCheapestRanking(ranked, aiPriceResult.estimates).slice(0, 30);
    const priceByKey = new Map(priceRanked.map((candidate) => [rankingCandidateKey(candidate), candidate]));
    const enriched = ranked.map((candidate) => priceByKey.get(rankingCandidateKey(candidate)) || candidate);
    const decorated = await decoratePwaResult({ query_id: crypto.randomUUID(), candidates: enriched }, request, env, await hashUser(input.session_id), rankingQuery, 'JA');
    const aiCheapestCandidates = decorated.candidates
      .filter((candidate) => Number(candidate.ai_cheapest_rank) > 0)
      .sort((a, b) => a.ai_cheapest_rank - b.ai_cheapest_rank);
    return Response.json({ ok: true, result: {
      mode: 'hoshilu_organic', category: resolution.category,
      ranking_type: 'HOSHILU総合人気ランキング',
      methodology: 'API接続の有無を問わず、HOSHILUが正規に観測できた商品・モール順位・口コミ・価格・モール横断性を合成。未取得データは加点せず、スポンサーは順位へ混ぜません。',
      marketplace_scope: MARKETPLACE_RANKING_CAPABILITIES.map(({ marketplace_id, label }) => ({ marketplace_id, label })),
      candidates: decorated.candidates,
      ai_cheapest: {
        ranking_type: 'HOSHILU最安値ランキング',
        methodology: '選択した小ジャンルの商品本体だけに絞り、確認できた実価格を優先。価格未取得の商品だけAI推定価格帯の中央値で参考順を作成します。',
        disclaimer: 'AI推定価格を含む参考ランキングです。実際の販売価格・送料・在庫は各モールで確認してください。',
        candidates: aiCheapestCandidates,
        estimated_count: aiCheapestCandidates.filter((candidate) => candidate.ai_cheapest_price_source === 'AI_ESTIMATE').length,
        unpriced_count: Math.max(0, ranked.length - aiCheapestCandidates.length)
      },
      sponsors: []
    } }, { headers: { 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });
  } catch (error) {
    const code = String(error.message || 'HOSHILU_RANKING_FAILED');
    const client = ['PROCESSING_NOTICE_REQUIRED','CONSENT_REQUIRED','RANKING_QUERY_REQUIRED','RANKING_CATEGORY_SELECTION_INVALID','SESSION_ID_INVALID','TURNSTILE_TOKEN_INVALID','TURNSTILE_VERIFICATION_FAILED'];
    return Response.json({ ok: false, error: code }, { status: publicApiErrorStatus(code, client, 502) });
  }
}

function sanitizePublicOffer(offer) {
  const shippingFeeConfirmed = offer?.shipping_fee_confirmed === true
    || Number(offer?.shipping_fee_confirmed) === 1
    || (offer?.shipping_fee !== undefined && offer?.shipping_fee !== null
      && offer?.total_cost !== undefined && offer?.total_cost !== null);
  // 楽天/Yahoo!内のモール公式店(ZOZOTOWN・ハンズ・マツキヨ・@cosme・
  // ABC-MART)なら、その旨をUI表示用に付ける。順位には使わない。
  // 詳細は official-mall-stores.mjs のコメント参照。
  const officialStore = officialStoreForProductUrl(offer?.product_url);
  return {
    marketplace: String(offer?.marketplace || ''),
    price: Number(offer?.price || 0),
    shipping_fee: Number(offer?.shipping_fee || 0),
    total_cost: shippingFeeConfirmed
      ? Number(offer?.total_cost ?? (Number(offer?.price || 0) + Number(offer?.shipping_fee || 0))) : 0,
    shipping_fee_confirmed: shippingFeeConfirmed,
    currency: String(offer?.currency || 'JPY'),
    stock_status: String(offer?.stock_status || 'UNKNOWN'),
    delivery_days: Number(offer?.delivery_days || 0),
    priority_listing: offer?.priority_listing === true,
    ...(officialStore ? { official_store: officialStore } : {})
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
// 希望にそう商品を提示"): REFINEは検索語だけ、IDENTIFYは確認用の商品仮説を
// 1件だけ返す。どちらも価格・在庫・URLは返さず、YES後の商品実在確認は既存の
// /api/knowledge（モールAPI/D1）だけが行う。質問本文はログへ保存しない。
function queueSearchProviderDegradation(env, ctx, requestId, degradation) {
  const record = recordSearchProviderDegradation(env, {
    requestId,
    component: degradation?.component,
    provider: degradation?.provider,
    code: degradation?.code
  }).catch((error) => {
    console.error('SEARCH_PROVIDER_DEGRADATION_TELEMETRY_FAILED', {
      requestId,
      code: String(error?.message || error).toUpperCase().replace(/[^A-Z0-9_]/gu, '_').slice(0, 80)
    });
  });
  if (ctx?.waitUntil) ctx.waitUntil(record); else void record;
}

async function handleAiChatApi(request, env, ctx) {
  const requestId = crypto.randomUUID();
  try {
    const requestOrigin = request.headers.get('origin');
    const ownOrigin = new URL(request.url).origin;
    if (requestOrigin && requestOrigin !== ownOrigin) return Response.json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
    const body = await readPublicApiJson(request, 4000);
    const input = validateChatRequest(body);
    await verifyTurnstile(input.turnstile_token, env, request.headers.get('cf-connecting-ip'));
    let result = await analyzeChatTurn(input.history, input.language, env, fetch, {
      mode: input.mode,
      telemetryComponent: 'ai_chat',
      onProviderDegraded: (degradation) => queueSearchProviderDegradation(
        env, ctx, requestId, degradation
      )
    });
    if (input.mode === 'IDENTIFY' && result.candidate_name) {
      const candidateQuery = result.refined_query || result.candidate_name;
      const category = semanticSearchGroups(candidateQuery)
        .map((group) => group.category).find((value) => value && value !== 'color') || 'unclassified';
      const marketplaceSearchLinks = await signedMarketplaceSearchLinks(candidateQuery, {
        env, origin: ownOrigin, sessionHash: await hashUser(input.session_id),
        seed: `AI_CHAT:${crypto.randomUUID()}`, category, trafficClass: 'UNATTRIBUTED'
      });
      result = { ...result, marketplace_search_links: marketplaceSearchLinks };
    }
    return Response.json({ ok: true, result, request_id: requestId }, {
      headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-request-id': requestId }
    });
  } catch (error) {
    const code = String(error.message || 'CHAT_FAILED').slice(0, 80);
    const clientErrors = ['PROCESSING_NOTICE_REQUIRED', 'CONSENT_REQUIRED', 'SESSION_ID_INVALID', 'TURNSTILE_TOKEN_INVALID', 'CHAT_HISTORY_EMPTY', 'TURNSTILE_VERIFICATION_FAILED'];
    const status = publicApiErrorStatus(code, clientErrors, 500);
    console.error('AI_CHAT_REQUEST_FAILED', { requestId, code, status });
    if (status >= 500) {
      const record = recordSearchOperationalFailure(env, { requestId, code, component: 'ai_chat' }).catch((telemetryError) => {
        console.error('AI_CHAT_OPERATIONAL_TELEMETRY_FAILED', {
          requestId, code: String(telemetryError?.message || telemetryError).slice(0, 80)
        });
      });
      if (ctx?.waitUntil) ctx.waitUntil(record); else void record;
    }
    return Response.json({ ok: false, error: code, request_id: requestId }, {
      status, headers: { 'cache-control': 'no-store', 'x-request-id': requestId }
    });
  }
}

// v4.3 指示書 Priority 3 (section 12-18): AI最安比較。/api/knowledge が既に
// 返した実オファー(candidate.offers、Integratedモールの確認済み価格)と、
// Directモールに対するAI推定価格帯を1つの比較結果へ合成して返す。
// AI呼び出しはこのエンドポイントに限定され、通常検索(/api/knowledge)側の
// 商品カード・MATCHESには一切影響しない(section 11: この機能のみの例外)。
// 2026-08-17: AMAZON_JPを追加した。それまでAmazonはこの一覧から漏れており、
// AI最安比較にAmazonの行が一切出ない状態だった。根拠になっていたのは
// test/price-comparison-api.test.mjs に残る「AMAZON_JPはIntegratedなので
// direct一覧には残らない」という前提だが、これは古い。
// src/marketplace-search-mode.mjs(モール分類の唯一の判定元)は
// INTEGRATED_MARKETPLACES = {RAKUTEN_JP, YAHOO_JP} と定義し、
// 「Amazonは公式API未接続のため外部検索導線として扱う」と明記している。
// つまりAmazonはdirect側であり、integratedでもdirectでもない隙間に落ちていた。
// Amazonアソシエイトは2027-02-09までに適格販売3件が必要で
// (claude/hoshilu_amazon_status_2026-08-17.md)、最安比較は購入意図が最も
// 高い場面なので、ここに出ないことの実害が大きい。
//
// 価格は捏造しない: 実価格はAPI未接続で取得できないため、Amazonの行は
// AI推定(免責文つき)か「価格推定できません」+価格の安い順検索リンクの
// どちらかにしかならない。section17の方針をそのまま踏襲する。
const KNOWN_DIRECT_MARKETPLACES = new Set([
  'AMAZON_JP',
  'QOO10_JP', 'SHEIN_JP', 'ZOZOTOWN_JP', 'SHOPLIST_JP', 'MUSINSA_JP', 'BUYMA_JP',
  'SNKRDUNK_JP', 'LOFT_JP', 'HANDS_JP', 'MATSUKIYO_JP', 'COSME_JP', 'ABCMART_JP'
]);
// 6→7。directモールは先頭から上限件数だけ採用されるので、6のままAmazonを
// 足すと既存モールが1つ押し出される。既存の比較内容を減らさずAmazonを
// 加えるために1枠だけ広げた。
const MAX_PRICE_COMPARISON_DIRECT_MARKETPLACES = 7;

export function validatePriceComparisonRequest(payload) {
  payload = payload || {};
  const sessionId = String(payload.session_id || '').trim();
  const turnstileToken = String(payload.turnstile_token || '').trim();
  requireProcessingNotice(payload);
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(sessionId)) throw new Error('SESSION_ID_INVALID');
  if (!turnstileToken || turnstileToken.length > 2048) throw new Error('TURNSTILE_TOKEN_INVALID');
  const title = String(payload.product?.title || '').trim().slice(0, 200);
  if (!title) throw new Error('PRICE_COMPARISON_PRODUCT_TITLE_REQUIRED');
  const brand = String(payload.product?.brand || '').trim().slice(0, 100);
  const category = String(payload.product?.category || '').trim().slice(0, 100);
  const searchQuery = finalPriceComparisonSearchQuery(payload.search_query, { title, category });
  const realOffers = (Array.isArray(payload.real_offers) ? payload.real_offers : []).slice(0, 10);
  const directMarketplaces = [...new Set(
    (Array.isArray(payload.direct_marketplaces) ? payload.direct_marketplaces : [])
      .map((item) => String(item || '').trim().toUpperCase())
      .filter((item) => KNOWN_DIRECT_MARKETPLACES.has(item))
  )].slice(0, MAX_PRICE_COMPARISON_DIRECT_MARKETPLACES);
  const language = ['JA', 'EN', 'ZH', 'KO'].includes(payload.language) ? payload.language : 'JA';
  return {
    product: { title, brand, category },
    search_query: searchQuery || title,
    real_offers: realOffers,
    direct_marketplaces: directMarketplaces,
    language,
    session_id: sessionId,
    turnstile_token: turnstileToken,
    processing_notice_shown: true
  };
}

// ランキングの表示名（例: 「コンタクトレンズ・ケア用品 › カラーコンタクト
// レンズ」）を、そのままモールの検索欄へ渡さない。最終小分類だけを使い、
// 末尾が階層記号で終わる不完全値は商品カテゴリ、最後に商品名へ戻す。
export function finalPriceComparisonSearchQuery(value, product = {}) {
  const clean = (input, limit = 200) => redactSearchPersonalData(input)
    .normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, limit);
  const leaf = (input) => clean(input).split(/[>›»→]/u).map((part) => part.trim()).filter(Boolean).at(-1) || '';
  const raw = clean(value);
  const incompleteHierarchy = /[>›»→]\s*$/u.test(raw);
  const categoryLeaf = leaf(product.category);
  const selected = incompleteHierarchy ? (categoryLeaf || clean(product.title)) : (leaf(raw) || categoryLeaf || clean(product.title));
  return selected.slice(0, 200);
}

async function handlePriceComparisonApi(request, env) {
  try {
    const requestOrigin = request.headers.get('origin');
    const ownOrigin = new URL(request.url).origin;
    if (requestOrigin && requestOrigin !== ownOrigin) return Response.json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
    const input = validatePriceComparisonRequest(await readPublicApiJson(request, 6000));
    await verifyTurnstile(input.turnstile_token, env, request.headers.get('cf-connecting-ip'));
    const real = realPriceRows(input.real_offers);
    // 既に実価格が確認できているDirectモールは無い(realPriceRowsはIntegrated
    // のみを返す)ため、依頼されたdirect_marketplacesは常にそのままAI推定の
    // 対象になる。
    const aiPromise = requestAiPriceEstimates(
        {
          title: input.product.title,
          brand: input.product.brand,
          category: input.product.category,
          language: input.language,
          // 同じ商品についてAPIで確認できた実価格を、AIが広い参考価格帯を
          // 作るための根拠として渡す。実価格をそのまま複製する指示ではない。
          referencePriceHint: real[0]?.total_cost || 0
        },
        input.direct_marketplaces, env, fetch
      ).catch((error) => {
      console.warn('AI_PRICE_COMPARISON_ESTIMATE_UNAVAILABLE', { status: Number(error?.status) || 0 });
      return { estimates: [], provider: null };
    });
    // 署名付き検索リンクはAI推定を待つ必要がないため並列に生成する。
    const linksPromise = signedMarketplaceSearchLinks(input.search_query, {
      env,
      origin: ownOrigin,
      sessionHash: await hashUser(input.session_id),
      seed: `PRICE_COMPARE:${crypto.randomUUID()}`,
      category: 'price_comparison',
      trafficClass: 'UNATTRIBUTED',
      sort: 'PRICE_ASC'
    });
    const [aiResult, signedLinks] = await Promise.all([aiPromise, linksPromise]);
    const comparisonMarketplaces = new Set([...input.direct_marketplaces, ...real.map((row) => row.marketplace)]);
    const comparison = buildPriceComparison({
      real,
      aiEstimates: aiResult.estimates,
      requestedDirectMarketplaces: input.direct_marketplaces,
      searchLinks: signedLinks.filter((link) => comparisonMarketplaces.has(link.marketplace))
        .map((link) => ({ ...link, search_query: buildAmazonSearchKeywords(input.search_query), search_sort: link.sort })),
      language: input.language
    });
    return Response.json({ ok: true, result: comparison }, {
      headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
    });
  } catch (error) {
    const code = String(error.message || 'PRICE_COMPARISON_FAILED');
    const clientErrors = ['PROCESSING_NOTICE_REQUIRED', 'CONSENT_REQUIRED', 'SESSION_ID_INVALID', 'TURNSTILE_TOKEN_INVALID', 'TURNSTILE_VERIFICATION_FAILED', 'PRICE_COMPARISON_PRODUCT_TITLE_REQUIRED'];
    const status = publicApiErrorStatus(code, clientErrors, 500);
    return Response.json({ ok: false, error: code }, { status });
  }
}

export function validateRankingRequest(payload = {}) {
  requireProcessingNotice(payload);
  const query = redactSearchPersonalData(payload.query).slice(0, 200).trim();
  if (!isUsableProductQuery(query)) throw new Error('RANKING_QUERY_REQUIRED');
  const marketplace = String(payload.marketplace || '').trim().toUpperCase();
  if (!MARKETPLACE_RANKING_CAPABILITIES.some((item) => item.marketplace_id === marketplace)) throw new Error('RANKING_MARKETPLACE_INVALID');
  const sessionId = String(payload.session_id || '').trim();
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(sessionId)) throw new Error('SESSION_ID_INVALID');
  const turnstileToken = String(payload.turnstile_token || '').trim();
  if (!turnstileToken || turnstileToken.length > 2048) throw new Error('TURNSTILE_TOKEN_INVALID');
  let categorySelection = null;
  if (payload.category_selection !== undefined && payload.category_selection !== null) {
    const value = payload.category_selection;
    const genreId = String(value?.genre_id || '').trim();
    const id = String(value?.id || value?.value || '').trim();
    const label = redactSearchPersonalData(value?.label).slice(0, 100).trim();
    const source = String(value?.source || '').trim();
    if (!/^\d{3,12}$/u.test(genreId) || !/^[a-z0-9_]{3,80}$/u.test(id) || label.length < 1 || !['STATIC_REGISTRY','RAKUTEN_GENRE_API'].includes(source)) throw new Error('RANKING_CATEGORY_SELECTION_INVALID');
    categorySelection = { genre_id: genreId, id, label, source };
  }
  return { query, marketplace, session_id: sessionId, turnstile_token: turnstileToken,
    processing_notice_shown: true, category_selection: categorySelection,
    confirmation_only: payload.confirmation_only === true };
}

async function handleRankingApi(request, env) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return Response.json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
    const input = validateRankingRequest(await readPublicApiJson(request, 4000));
    await verifyTurnstile(input.turnstile_token, env, request.headers.get('cf-connecting-ip'));
    let result = await marketplaceRankingResult(env, input.query, input.marketplace, fetch, input.category_selection);
    // 専用ランキングAPI/ページを確認できないモールは、架空順位や未検証URLを
    // 作らず、既存の検証済み検索URLビルダーへフォールバックする。
    if (result.mode === 'direct_link') {
      const direct = marketplaceSearchDestinations(input.query, env).find((item) => item.marketplace === input.marketplace);
      if (direct && isAllowedDestination(direct.destination)) result = { ...result, direct_url: direct.destination, direct_label: `${result.marketplace.label}で${result.category.label}を探す` };
    }
    return Response.json({ ok: true, result }, { headers: { 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });
  } catch (error) {
    const code = String(error.message || 'RANKING_FAILED');
    const client = ['PROCESSING_NOTICE_REQUIRED','CONSENT_REQUIRED','RANKING_QUERY_REQUIRED','RANKING_MARKETPLACE_INVALID','RANKING_CATEGORY_SELECTION_INVALID','SESSION_ID_INVALID','TURNSTILE_TOKEN_INVALID','TURNSTILE_VERIFICATION_FAILED'];
    return Response.json({ ok: false, error: code }, { status: publicApiErrorStatus(code, client, 502) });
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

function confirmedAiCandidateDiscovery(candidate, query) {
  if (!candidate?.name) return null;
  return {
    triggered: true,
    configured: true,
    provider: 'AI_CHAT_CONFIRMED',
    candidates: [],
    analysis: {
      category: '',
      intent_summary: '',
      features: candidate.matched_features || [],
      product_candidates: [{ ...candidate, search_keywords: [query || candidate.name], selected_by_user: true }],
      search_keywords: [query || candidate.name],
      multilingual_keywords: { ja: [], en: [], zh: [], ko: [] }
    }
  };
}

export function interpretedSearchInputDiscovery(candidate, query, provider = 'GEMINI_MULTIMODAL_SEARCH_INPUT') {
  if (!candidate?.name) return null;
  return {
    triggered: true,
    configured: true,
    provider,
    candidates: [],
    analysis: {
      category: '',
      intent_summary: '',
      features: candidate.matched_features || [],
      product_candidates: [{
        ...candidate,
        search_keywords: [query || candidate.name],
        selected_by_user: false,
        identification_status: 'AI_HYPOTHESIS'
      }],
      search_keywords: [query || candidate.name],
      multilingual_keywords: { ja: [], en: [], zh: [], ko: [] }
    }
  };
}

async function safeAiProductDiscovery(query, language, env) {
  try {
    return await discoverProductsWithAi(query, language, env);
  } catch (error) {
    console.warn('AI_PRODUCT_DISCOVERY_UNAVAILABLE', {
      status: Number(error?.status) || 0,
      provider_code: safeProviderErrorCode(error?.providerCode, error?.status)
    });
    return { triggered: true, configured: true, candidates: [], unavailable: true };
  }
}

async function handleKnowledgeApi(request, env, ctx) {
  // Create this before validation so even rejected requests can be matched
  // to a Worker log without retaining the user's query text.
  const requestId = crypto.randomUUID();
  try {
    const requestOrigin = request.headers.get('origin');
    const ownOrigin = new URL(request.url).origin;
    if (requestOrigin && requestOrigin !== ownOrigin) return Response.json({ ok: false, error: 'ORIGIN_NOT_ALLOWED', request_id: requestId }, { status: 403, headers: { 'x-request-id': requestId } });
    // One client-compressed screenshot may be included as base64. The image
    // validator still caps decoded bytes at 2 MiB; this ceiling only accounts
    // for base64 and JSON overhead.
    const parsedBody = await readBoundedJson(request, 3100000);
    if (!parsedBody.ok) {
      const tooLarge = parsedBody.error === 'REQUEST_TOO_LARGE';
      return Response.json({ ok: false, error: tooLarge ? 'REQUEST_TOO_LARGE' : 'REQUEST_JSON_INVALID', request_id: requestId }, {
        status: tooLarge ? 413 : 400,
        headers: { 'cache-control': 'no-store', 'x-request-id': requestId }
      });
    }
    const body = parsedBody.value;
    const validatedInput = validateKnowledgeRequest(body);
    await verifyTurnstile(validatedInput.turnstile_token, env, request.headers.get('cf-connecting-ip'));
    const submittedQuery = validatedInput.query;
    const hasMultimodalInput = Boolean(validatedInput.social_url || validatedInput.search_image);
    let searchInputAnalysis = null;
    if (hasMultimodalInput) {
      try {
        searchInputAnalysis = await analyzeSearchInput({
          query: submittedQuery,
          social_url: validatedInput.social_url,
          image: validatedInput.search_image
        }, validatedInput.language, env, fetch);
      } catch (error) {
        // An independently meaningful phrase can still reach the real
        // marketplace search if vision/grounding is temporarily unavailable.
        // Screenshot/URL-only requests and deictic text such as "これ" cannot
        // be interpreted without that evidence, so they fail explicitly.
        if (!isIndependentSearchText(submittedQuery)) throw error;
        queueSearchProviderDegradation(env, ctx, requestId, {
          component: 'search_input_analysis', provider: 'gemini',
          code: String(error?.message || 'SEARCH_INPUT_ANALYSIS_FAILED').slice(0, 80)
        });
      }
    }
    const analyzedQuery = searchInputAnalysis?.refined_query || '';
    const originalQuery = analyzedQuery
      ? mergeAiRefinedSearchQuery(submittedQuery, analyzedQuery) : submittedQuery;
    const analysisCandidate = searchInputAnalysis?.candidate_name ? {
      name: searchInputAnalysis.candidate_name,
      brand: searchInputAnalysis.candidate_brand,
      reason: searchInputAnalysis.candidate_reason,
      matched_features: searchInputAnalysis.matched_features,
      match_score: searchInputAnalysis.match_score
    } : null;
    // v4.2 項目1・2・3: 商品名を知らなくても探せる検索。ここで1回だけ展開
    // すれば、D1検索・3モールのキーワード生成・filterCategoryMismatches・
    // semanticSearchGroups が下流ですべて自動的に恩恵を受ける(詳細は
    // query-expansion.mjs のコメント参照)。該当ルールが無ければ
    // input.query は元のまま変わらない。
    const expandedQuery = expandSearchQuery(originalQuery);
    // Do not retain or pass the raw inline image/social URL farther down the
    // product-search pipeline after it has been interpreted.
    let input = {
      ...validatedInput,
      query: expandedQuery.query,
      social_url: '',
      search_image: null,
      ai_candidate_fallback: validatedInput.ai_candidate_fallback
    };
    // v3.4 CTO instruction: every checkpoint in the marketplace search trace
    // (API送信/レスポンス件数/accepted件数/Teacher Dataset補正件数/ranking
    // 入力・出力件数/モール別件数/UI送信件数) must share one requestId so the
    // full path for a single search can be reconstructed from logs alone.
    // v4.2 項目12 プライバシー監査: 同意画面は「質問本文はサーバーログへ
    // 保存しません」と明示しているため、ユーザーの検索文そのもの(query /
    // original_query)はここを含むどのSEARCH_TRACEにも出力しない。段階の
    // 追跡に必要な情報(文字数・展開の有無・展開ルールID)だけを残す。
    console.info('SEARCH_TRACE', {
      requestId,
      stage: '0_request_received',
      query_length: input.query.length,
      query_expanded: expandedQuery.expanded,
      query_expansion_rule: expandedQuery.expansion?.rule_id || null,
      input_text: Boolean(submittedQuery),
      input_social_url: Boolean(validatedInput.social_url),
      input_image: Boolean(validatedInput.search_image),
      input_image_bytes: validatedInput.search_image?.byte_length || 0
    });
    // 通常検索でもAIを検索語変換器として使う。ただし既存DB/GAS検索と並列に
    // 走らせるため、Gemini待ちを丸ごと検索時間へ上乗せしない。
    const aiRefinementTask = input.ai_candidate_fallback || searchInputAnalysis
      ? Promise.resolve({
        needs_clarification: false,
        refined_query: input.query,
        configured: true,
        provider: searchInputAnalysis ? searchInputAnalysis.provider : 'AI_CHAT_CONFIRMED'
      })
      : refineMarketplaceSearchQuery(originalQuery, input.language, env, fetch, {
        onProviderDegraded: (degradation) => queueSearchProviderDegradation(
          env, ctx, requestId, degradation
        )
      });
    const [gasOutcome, indexedOutcome, aiRefinementOutcome] = await Promise.allSettled([
      callGas(env, 'KNOWLEDGE', { request: { query: input.query, consent: true } }),
      applyIndexedSearchPolicy({ candidates: [] }, env, input.query, input.language, {
        force_product_presentation: true
      }),
      aiRefinementTask
    ]);
    const aiRefinement = aiRefinementOutcome.status === 'fulfilled' ? aiRefinementOutcome.value : null;
    // AIが作った短い検索語を主検索へ使い、元の文章は先行して実行済みの
    // GAS/D1結果として残す。両方を1本のAND検索文へ連結すると、人物名など
    // 商品タイトルに無い手掛かりまで必須語になり0件化するため。
    const aiRefinedQuery = aiRefinement && !aiRefinement.needs_clarification
      ? redactSearchPersonalData(aiRefinement.refined_query).replace(/\s+/gu, ' ').trim().slice(0, 200) : '';
    const aiExpandedQuery = expandSearchQuery(aiRefinedQuery || originalQuery);
    const queryWasAiRefined = aiExpandedQuery.query !== expandedQuery.query;
    input = { ...input, query: queryWasAiRefined ? aiExpandedQuery.query : expandedQuery.query };
    const gasResult = gasOutcome.status === 'fulfilled' ? gasOutcome.value : { candidates: [], message: '' };
    let result = indexedOutcome.status === 'fulfilled' ? indexedOutcome.value : gasResult;
    if (indexedOutcome.status === 'fulfilled' && (gasResult?.candidates || []).length) {
      result = {
        ...gasResult,
        ...result,
        candidates: rankMerchantCandidates(result.candidates, gasResult.candidates, input.query)
      };
    }
    // Preserve the conventional HOSHILU lane before the Gemini-refined lane
    // adds candidates. Users make frequent, preference-heavy searches (bags,
    // materials, shapes), so neither lane may overwrite the other.
    const originalSearchCandidates = filterCategoryMismatches(
      expandedQuery.query, result?.candidates || []
    );
    // AIがブランド/商品名を補った場合はD1も短い再検索を行う。外部APIだけ
    // でなく、HOSHILU内の確認済み商品データにもAI変換を反映する。
    if (queryWasAiRefined) {
      try {
        const refinedIndexed = await applyIndexedSearchPolicy({ candidates: [] }, env, input.query, input.language, {
          force_product_presentation: true
        });
        result = { ...result, candidates: rankMerchantCandidates(
          result.candidates || [], refinedIndexed.candidates || [], input.query
        ) };
      } catch {}
    }
    result = { ...result, ai_query_refinement: {
      applied: queryWasAiRefined,
      provider: queryWasAiRefined ? String(aiRefinement?.provider || '') : '',
      configured: aiRefinement?.configured === true,
      // 同じ利用者の画面へだけ返し、検索窓と実際のAPI送信語を一致させる。
      effective_query: input.query !== submittedQuery ? input.query : ''
    } };
    if (searchInputAnalysis) {
      result.search_input_analysis = {
        applied: true,
        provider: searchInputAnalysis.provider,
        candidate_name: searchInputAnalysis.candidate_name,
        candidate_brand: searchInputAnalysis.candidate_brand,
        candidate_reason: searchInputAnalysis.candidate_reason,
        matched_features: searchInputAnalysis.matched_features,
        match_score: searchInputAnalysis.match_score,
        sources: {
          text: Boolean(submittedQuery),
          social_url: Boolean(validatedInput.social_url),
          image: Boolean(validatedInput.search_image)
        }
      };
    }
    result = await applyD1MultilingualContent(env, result, input.language);
    result = await applyD1ContractPolicy(env, result, input.query, requestId);
    const confirmedDiscovery = confirmedAiCandidateDiscovery(input.ai_candidate_fallback, input.query);
    const interpretedDiscovery = interpretedSearchInputDiscovery(
      analysisCandidate,
      input.query,
      searchInputAnalysis?.provider
    );
    let aiDiscoveryPromise = null;
    if (!confirmedDiscovery && !interpretedDiscovery
      && !(result?.candidates || []).length) {
      // When local/GAS data has no candidate, start AI fallback while Rakuten
      // and Yahoo are searched. This removes a full AI round-trip from the
      // zero-result critical path without spending AI calls when local data
      // already has products.
      aiDiscoveryPromise = safeAiProductDiscovery(originalQuery, input.language, env);
    }
    // 2026-08-10正式運用: 公開検索でAPI取得するのは楽天・Yahoo!のみ。
    // Amazon Creators API実装は接続審査後に再有効化できる形で残すが、
    // 未接続の現在はAmazonを他の外部モールと同じ検索リンクとして扱う。
    const shouldSearchMarketplaces = rakutenApiConfigured(env) || yahooShoppingApiConfigured(env);
    if (shouldSearchMarketplaces) {
      const marketplaceSearches = [];
      if (rakutenApiConfigured(env)) marketplaceSearches.push({
        key: 'rakuten_catalog_connected',
        run: searchRakutenMarketplaceWithFallback(
          env,
          buildRakutenSearchKeywordCandidates(input.query, expandedQuery.query),
          fetch,
          input.query,
          requestId,
          expandedQuery.query
        )
      });
      if (yahooShoppingApiConfigured(env)) marketplaceSearches.push({
        key: 'yahoo_catalog_connected',
        run: searchMarketplaceApiWithFallback(
          (keywords) => searchYahooShopping(env, keywords),
          // ensureApparelProductTypeTerm: buildMarketplaceSearchKeywords with
          // no marketplace code collapses "ブラウス" to the broad category
          // "トップス" alone, dropping the specific noun entirely (reported
          // 2026-08-07/2026-08-08). Amazon/Rakuten/SHEIN/Yahoo destination
          // link building already restore it; this is the Yahoo catalog API
          // search path, which did not.
          buildMarketplaceApiKeywordCandidates(
            input.query,
            ensureApparelQualifierTerms(
              input.query,
              ensureApparelProductTypeTerm(input.query, buildMarketplaceSearchKeywords(input.query))
            ),
            ensureApparelQualifierTerms(
              expandedQuery.query,
              ensureApparelProductTypeTerm(expandedQuery.query, buildMarketplaceSearchKeywords(expandedQuery.query))
            )
          ),
          input.query,
          expandedQuery.query
        )
      });
      // 2026-08-18のユーザー指摘「楽天市場とYahoo!ショッピングしか出ないね」への対応。
      // 楽天のshopCode / Yahoo!のseller_idでモール公式店を名指しし、そのモールの
      // 商品を確実に検索結果へ載せる。
      //
      // ここで足すだけでよいのは、この直後の合流処理が
      //   ・Promise.allSettled で個別の失敗を握りつぶす
      //   ・提供元ごとにラウンドロビンで混ぜてから一度だけ順位付けする
      // という作りになっているため。1店舗が429や遅延で落ちても本体検索には
      // 影響せず、順位付けもモール中立のまま(ユーザー指示「提示反映基準は
      // ルールに基づき平等に」)。
      //
      // 検索語は本体と同じ展開後クエリを使い、店舗ごとの絞り込み段階は
      // 持たない(1店舗あたり必ず1回の呼び出しに収める)。
      // OFFICIAL_STORE_SEARCH_ENABLED='false' でコード変更なしに止められる。
      if (env.OFFICIAL_STORE_SEARCH_ENABLED !== 'false') {
        const officialStoreKeywords = ensureApparelQualifierTerms(
          input.query,
          ensureApparelProductTypeTerm(input.query, buildMarketplaceSearchKeywords(input.query))
        ) || expandedQuery.query || input.query;
        for (const store of OFFICIAL_STORE_SEARCHES) {
          if (store.platform === 'RAKUTEN' && !rakutenApiConfigured(env)) continue;
          if (store.platform === 'YAHOO' && !yahooShoppingApiConfigured(env)) continue;
          marketplaceSearches.push({
            key: store.key,
            run: store.platform === 'RAKUTEN'
              ? searchRakutenMarketplace(env, officialStoreKeywords, fetch, requestId, { shopCode: store.shopCode })
              : searchYahooShopping(env, officialStoreKeywords, fetch, { sellerId: store.sellerId })
          });
        }
      }
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
      const acceptedCounts = [];
      outcomes.forEach((outcome, index) => {
        const source = marketplaceSearches[index];
        result = { ...(result || {}), [source.key]: outcome.status === 'fulfilled' };
        if (outcome.status !== 'fulfilled') {
          console.warn('MARKETPLACE_PRODUCT_SEARCH_FAILED', {
            requestId,
            source: source.key,
            status: Number(outcome.reason?.status) || 0,
            provider_code: safeProviderErrorCode(outcome.reason?.providerCode, outcome.reason?.status)
          });
          perSourceCandidates.push({ key: source.key, candidates: [] });
          acceptedCounts.push(0);
          return;
        }
        const returnedCount = Array.isArray(outcome.value) ? outcome.value.length : 0;
        const candidates = filterSearchCandidatesWithFallback(input.query, expandedQuery.query, outcome.value);
        const teacherExcluded = teacherDatasetExclusionCount(input.query, outcome.value);
        console.info('MARKETPLACE_PRODUCT_SEARCH_RESULT', {
          requestId,
          source: source.key,
          returned: returnedCount,
          accepted: candidates.length,
          teacher_dataset_excluded: teacherExcluded
        });
        perSourceCandidates.push({ key: source.key, candidates });
        acceptedCounts.push(candidates.length);
      });
      result.marketplace_search_status = summarizeMarketplaceSearchOutcomes(
        marketplaceSearches, outcomes, acceptedCounts
      );
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
    const refinedCandidates = filterSearchCandidatesWithFallback(
      input.query, expandedQuery.query, result?.candidates || []
    );
    const originalLaneCandidates = filterCategoryMismatches(
      expandedQuery.query, originalSearchCandidates
    );
    const combinedSearchCandidates = rankMerchantCandidates(
      [], interleaveCandidatesBySource([refinedCandidates, originalLaneCandidates]), expandedQuery.query
    );
    result = {
      ...(result || {}),
      traffic_class: input.traffic_class,
      search_lanes: {
        gemini_refined_count: refinedCandidates.length,
        hoshilu_original_count: originalLaneCandidates.length
      },
      candidates: combinedSearchCandidates.slice(0, CLIENT_CANDIDATE_LIMIT)
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
      if (result.marketplace_search_status?.all_requests_failed) {
        result.message = {
          JA: '楽天市場・Yahoo!ショッピングとの接続に失敗しました。時間をおいてもう一度お試しください。',
          EN: 'Could not connect to Rakuten or Yahoo! Shopping. Please try again later.',
          ZH: '无法连接乐天市场或Yahoo!购物，请稍后重试。',
          KO: '라쿠텐 또는 Yahoo! 쇼핑에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'
        }[input.language] || 'Marketplace connection failed. Please try again later.';
      }
      result.ai_discovery = confirmedDiscovery || interpretedDiscovery
        || await (aiDiscoveryPromise || safeAiProductDiscovery(input.query, input.language, env));
    } else if (aiDiscoveryPromise) {
      // The marketplace search found products after the fallback had already
      // started. Keep the Promise attached to the request lifecycle.
      ctx.waitUntil(aiDiscoveryPromise);
    }
    const sessionHash = await hashUser(input.session_id);
    let decorated = await decoratePwaResult(
      result,
      request,
      env,
      sessionHash,
      input.query,
      input.language
    );
    // A verified-product recommendation request needs a fresh Turnstile token
    // and marketplace call. Put the safe rule-based category shelf in the main
    // response so mobile users see a horizontal recommendation immediately;
    // the async endpoint replaces it with real marketplace products when ready.
    const immediateRelatedGroups = relatedProductRecommendationQueries(input.query);
    if (immediateRelatedGroups.length) {
      try {
        decorated = { ...decorated, related_category_recommendations: await decoratedRelatedCategoryGroups(
          immediateRelatedGroups,
          { env, origin: ownOrigin, sessionHash, seed: requestId, category: 'related_product',
            trafficClass: input.traffic_class }
        ) };
      } catch (error) {
        // Recommendations are additive. A signing/configuration issue must
        // never turn a successful main product search into an HTTP 500.
        console.warn('RELATED_CATEGORY_FALLBACK_UNAVAILABLE', {
          requestId, code: String(error?.message || 'RELATED_CATEGORY_FAILED').toUpperCase()
            .replace(/[^A-Z0-9_]/gu, '_').slice(0, 80)
        });
      }
    }
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
    const clientErrors = [
      'PROCESSING_NOTICE_REQUIRED', 'CONSENT_REQUIRED', 'QUERY_LENGTH_INVALID', 'SESSION_ID_INVALID', 'TURNSTILE_TOKEN_INVALID',
      'TURNSTILE_VERIFICATION_FAILED', 'SOCIAL_URL_INVALID', 'SOCIAL_URL_UNSUPPORTED',
      'SEARCH_IMAGE_INVALID', 'SEARCH_IMAGE_TYPE_UNSUPPORTED', 'SEARCH_IMAGE_SIGNATURE_INVALID',
      'SEARCH_IMAGE_TOO_LARGE'
    ];
    const status = clientErrors.includes(code) ? 400
      : code.startsWith('SEARCH_INPUT_ANALYSIS_') ? 503 : 500;
    console.error('KNOWLEDGE_SEARCH_FAILED', { requestId, code: code.slice(0, 80), status });
    if (status >= 500) {
      const record = recordSearchOperationalFailure(env, { requestId, code }).catch((telemetryError) => {
        console.error('SEARCH_OPERATIONAL_TELEMETRY_FAILED', {
          requestId, code: String(telemetryError?.message || telemetryError).slice(0, 80)
        });
      });
      if (ctx?.waitUntil) ctx.waitUntil(record); else void record;
    }
    return Response.json({ ok: false, error: code, request_id: requestId }, {
      status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-request-id': requestId }
    });
  }
}

export function validateRelatedRecommendationsRequest(payload = {}) {
  const input = validateKnowledgeRequest({ ...payload, search_attempt: 1 });
  return { query: input.query, language: input.language, session_id: input.session_id,
    turnstile_token: input.turnstile_token, processing_notice_shown: true };
}

// 関連商品は本検索の「価格不明品」ではない。スマホカバー→充電器・
// ストラップのような別カテゴリを、主結果描画後に独立取得する。本検索へ
// 外部API呼び出しを混ぜると初回表示の待ち時間・失敗率・API消費を増やすため、
// 専用エンドポイントに分離する。
async function searchRelatedCategory(env, query, requestId) {
  const providers = [
    rakutenApiConfigured(env) && (() => searchRakutenMarketplaceWithFallback(
      env, buildRakutenSearchKeywordCandidates(query), fetch, query, requestId
    )),
    yahooShoppingApiConfigured(env) && (() => searchMarketplaceApiWithFallback(
      (keywords) => searchYahooShopping(env, keywords),
      buildMarketplaceApiKeywordCandidates(query, buildMarketplaceSearchKeywords(query)), query
    ))
  ].filter(Boolean);
  for (const run of providers) {
    try {
      const candidates = filterCategoryMismatches(query, await run());
      if (candidates.length) return rankMerchantCandidates([], candidates, query).slice(0, 10);
    } catch (error) {
      console.warn('RELATED_RECOMMENDATION_PROVIDER_FAILED', {
        requestId, status: Number(error?.status) || 0,
        provider_code: safeProviderErrorCode(error?.providerCode, error?.status)
      });
    }
  }
  return [];
}

async function handleRelatedRecommendationsApi(request, env) {
  try {
    const requestOrigin = request.headers.get('origin');
    const ownOrigin = new URL(request.url).origin;
    if (requestOrigin && requestOrigin !== ownOrigin) return Response.json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
    const input = validateRelatedRecommendationsRequest(await readPublicApiJson(request, 10000));
    await verifyTurnstile(input.turnstile_token, env, request.headers.get('cf-connecting-ip'));
    const requestId = crypto.randomUUID();
    const sessionHash = await hashUser(input.session_id);
    // 3→6。2026-08-18のユーザー指示「『その商品と一緒に使うもの』と横展開
    // どちらも提示して良いよ」「レコメンド30商品の中に織り交ぜて」に対応。
    // 横展開が最大3件、補完提案が最大3件なので、3のままだと横展開だけで
    // 埋まって補完提案が一件も出ない。両方を通したうえで、下の
    // interleaveCandidatesBySource が提案元をラウンドロビンで混ぜ、
    // 30件の中に交互に並ぶようにする。
    const groups = (await resolveRelatedProductRecommendationQueries(input.query, input.language, env)).slice(0, 6);
    const categories = await decoratedRelatedCategoryGroups(groups, {
      env, origin: ownOrigin, sessionHash, seed: requestId, category: 'related_product',
      trafficClass: 'UNATTRIBUTED'
    });
    const decoratedGroups = await Promise.all(groups.map(async (group, index) => {
      const candidates = (await searchRelatedCategory(env, group.query, requestId))
        .map((candidate) => ({ ...candidate, related_category: group.query, recommendation_reason: group.reason }));
      if (!candidates.length) return [];
      const publicResult = await decoratePwaResult(
        { candidates, query_id: `${requestId}:RELATED:${index}` }, request, env,
        sessionHash, group.query, input.language
      );
      return publicResult.candidates.map((candidate) => ({
        ...candidate, related_category: group.query, recommendation_reason: group.reason
      }));
    }));
    return Response.json({ ok: true, result: {
      recommendations: interleaveCandidatesBySource(decoratedGroups).slice(0, 30),
      categories
    } }, { headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-request-id': requestId } });
  } catch (error) {
    const code = String(error.message || error);
    const clientErrors = ['PROCESSING_NOTICE_REQUIRED','CONSENT_REQUIRED','QUERY_LENGTH_INVALID','SESSION_ID_INVALID','TURNSTILE_TOKEN_INVALID','TURNSTILE_VERIFICATION_FAILED'];
    return Response.json({ ok: false, error: code }, {
      status: publicApiErrorStatus(code, clientErrors, 502),
      headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
    });
  }
}

function handlePublicConfig(env) {
  const siteKey = String(env.TURNSTILE_SITE_KEY || '');
  return Response.json({
    turnstile_site_key: siteKey,
    line_login_configured: lineLoginConfigured(env),
    email_login_configured: emailLoginConfigured(env),
    sms_login_configured: false
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
  'member_sale_preferences', 'member_buzz_preferences',
  'contracts', 'contract_decisions',
  'product_aliases', 'localized_product_content',
  'kpi_events', 'kpi_summary', 'kpi_uplift',
  'marketplace_kpi_events', 'marketplace_kpi_summary',
  'anonymous_benchmark',
  'social_knowledge_inbox', 'social_knowledge_aggregates', 'social_hashtag_aggregates',
  'product_identifiers', 'instagram_oauth_credentials', 'x_oauth_credentials',
  'runway_budget_policy', 'runway_budget_periods', 'runway_generation_jobs',
  'runway_generation_attempts', 'runway_cost_reservations',
  'runway_provider_usage_daily', 'runway_approval_grants', 'runway_audit_log'
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
  const instagramOAuth = await instagramOAuthReadiness(env);
  const xOAuth = await xOAuthReadiness(env);
  return Response.json({
    ok: readiness.ready,
    release: readiness.release,
    missing: readiness.missing,
    weak: readiness.weak,
    checks: {
      ...readiness.checks,
      database_features: databaseFeatures,
      social_publishers: await socialPublisherReadinessWithStoredCredentials(env),
      instagram_oauth: instagramOAuth,
      x_oauth: xOAuth,
      runway_video_generation: runwayGenerationReadiness(env)
    }
  }, {
    status: readiness.ready ? 200 : 503,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}

export function canonicalRequestRedirect(requestUrl) {
  const target = new URL(requestUrl);
  const hostname = target.hostname.toLowerCase().replace(/\.$/u, '');
  if (![CANONICAL_HOST, `www.${CANONICAL_HOST}`].includes(hostname)) return null;
  let changed = false;
  if (target.protocol !== 'https:') {
    target.protocol = 'https:';
    changed = true;
  }
  if (hostname !== CANONICAL_HOST) {
    target.hostname = CANONICAL_HOST;
    target.port = '';
    changed = true;
  }
  const cleanLegacyPaths = new Map([
    ['/index.html', '/'], ['/privacy.html', '/privacy'], ['/terms.html', '/terms'],
    ['/for-sellers.html', '/for-sellers']
  ]);
  if (cleanLegacyPaths.has(target.pathname)) {
    target.pathname = cleanLegacyPaths.get(target.pathname);
    changed = true;
  } else if (target.pathname.length > 1 && target.pathname.endsWith('/')) {
    const withoutTrailingSlash = target.pathname.slice(0, -1);
    if (CANONICAL_CONTENT_PATHS.has(withoutTrailingSlash)) {
      target.pathname = withoutTrailingSlash;
      changed = true;
    }
  }
  return changed ? target.toString() : null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const canonicalTarget = canonicalRequestRedirect(url);
    if (canonicalTarget) return new Response(null, {
      status: 308,
      headers: {
        location: canonicalTarget,
        'cache-control': 'public, max-age=86400',
        'x-content-type-options': 'nosniff'
      }
    });
    const instagramOAuthResponse = await handleInstagramOAuthRoutes(request, env);
    if (instagramOAuthResponse) return instagramOAuthResponse;
    const xOAuthResponse = await handleXOAuthRoutes(request, env);
    if (xOAuthResponse) return xOAuthResponse;
    const runwayMediaResponse = await handleRunwayMediaRoute(request, env);
    if (runwayMediaResponse) return runwayMediaResponse;
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
    const runwayGenerationResponse = await handleRunwayGenerationRoutes(request, env);
    if (runwayGenerationResponse) return runwayGenerationResponse;
    const socialResponse = await handleSocialAdminRoutes(request, env);
    if (socialResponse) return socialResponse;
    const promotionDashboardResponse = await handlePromotionDashboardRoutes(request, env);
    if (promotionDashboardResponse) return promotionDashboardResponse;
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
    const buzzNotificationResponse = await handleBuzzNotificationRoutes(request, env);
    if (buzzNotificationResponse) return buzzNotificationResponse;
    const mywatchResponse = await handleMywatchRoutes(request, env);
    if (mywatchResponse) return mywatchResponse;
    const insightResponse = await handleInsightRoutes(request, env);
    if (insightResponse) return insightResponse;
    const memberResponse = await handleMemberRoutes(request, env);
    if (memberResponse) return memberResponse;
    const sellerResponse = await handleSellerRoutes(request, env);
    if (sellerResponse) return sellerResponse;
    const sellerBusinessInquiryResponse = await handleSellerBusinessInquiryRoutes(request, env);
    if (sellerBusinessInquiryResponse) return sellerBusinessInquiryResponse;
    if (request.method === 'POST' && url.pathname === '/webhook') return handleWebhook(request, env, ctx);
    if (request.method === 'POST' && url.pathname === '/api/knowledge') return handleKnowledgeApi(request, env, ctx);
    if (request.method === 'POST' && url.pathname === '/api/related-recommendations') return handleRelatedRecommendationsApi(request, env);
    if (request.method === 'POST' && url.pathname === '/api/ai-chat') return handleAiChatApi(request, env, ctx);
    if (request.method === 'POST' && url.pathname === '/api/price-comparison') return handlePriceComparisonApi(request, env);
    if (request.method === 'POST' && url.pathname === '/api/rankings') return handleRankingApi(request, env);
    if (request.method === 'POST' && url.pathname === '/api/hoshilu-rankings') return handleHoshiluRankingApi(request, env);
    if (request.method === 'GET' && url.pathname === '/api/ranking-capabilities') return Response.json({ ok: true, marketplaces: MARKETPLACE_RANKING_CAPABILITIES }, { headers: { 'cache-control': 'public, max-age=3600' } });
    if (request.method === 'GET' && url.pathname === '/api/buzz/shelf') {
      // HOSHILU BUZZ棚(Phase 1)。順位根拠はモール公式ランキングAPIのみ。
      // 上流はmarketplace_ranking_cache(D1・5分)で保護し、レスポンスも5分キャッシュ。
      try {
        const result = await buzzShelfResult(env, fetch);
        // v3.1 §11-14/§17/§30: 商品の発見と購入先の解決を分離する。各ジャンル棚へ
        // 「◯◯で探す」検索フォールバック(署名付き/goリンク=モールクリック計測§33)
        // を付与。検索語は検証済み小ジャンル名。「見る」(直接商品URL)とは表示を
        // 混同しない(§14はラベル生成側で「◯◯で探す」固定)。
        const buzzLinkContext = {
          env, origin: url.origin, sessionHash: 'BUZZ_SHELF', seed: 'buzz-shelf',
          asin: '', category: 'BUZZ_SHELF', trafficClass: undefined, sort: undefined
        };
        for (const shelf of result.shelves) {
          if (!shelf.search_keyword) continue;
          // 署名Secret未設定等でリンクを作れなくても、棚表示自体は止めない。
          shelf.search_links = await signedMarketplaceSearchLinks(shelf.search_keyword, buzzLinkContext).catch(() => []);
        }
        return Response.json({ ok: true, result }, { headers: { 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });
      } catch (error) {
        return Response.json({ ok: false, error: String(error?.message || 'BUZZ_SHELF_FAILED').slice(0, 80) }, { status: 502, headers: { 'cache-control': 'no-store' } });
      }
    }
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
    if (request.method === 'GET' || request.method === 'HEAD') {
      const seoPage = renderSeoPage(url.pathname);
      if (seoPage) return new Response(request.method === 'HEAD' ? null : seoPage, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=300',
          ...DOCUMENT_SECURITY_HEADERS
        }
      });
    }
    if (url.pathname.startsWith('/api/')) return Response.json({ ok: false, error: 'NOT_FOUND' }, {
      status: 404,
      headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
    });
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('not found', { status: 404, headers: DOCUMENT_SECURITY_HEADERS });
  },
  async scheduled(controller, env, ctx) {
    const scheduledAt = new Date(controller.scheduledTime);
    // Deep canary uses its own offset trigger so its provider requests never
    // compete with the existing scheduled jobs for Worker outbound sockets.
    if (controller.cron === '7,22,37,52 * * * *') {
      ctx.waitUntil(runReliabilityControlledCron(
        env,
        'cloudflare_deep',
        () => runDeepCanaryCycle(env, scheduledAt)
      ));
      return;
    }
    ctx.waitUntil(runReliabilityControlledCron(
      env,
      'cloudflare_regular',
      async () => {
        // If the isolated deep cron is delayed, retry only stale free
        // marketplace canaries before the regular fanout. Paid AI probes are
        // never authorized by this catch-up path.
        try {
          await runMarketplaceCanaryCatchup(env, scheduledAt);
        } catch {
          // A diagnostic retry must never suppress the established production
          // jobs. Keep the log privacy-safe: no provider response or request data.
          console.error('MARKETPLACE_CANARY_CATCHUP_FAILED');
        }
        return Promise.allSettled([
        // 大隆さんの2026-08-09承認に基づく販促自動運用。先に14日先までの
        // 権利確認済み投稿を冪等補充し、その後に期限到来分を配信する。
        runSocialAutopilotCycle(env, scheduledAt),
        // Runway is isolated from publishing: a successful generation is persisted
        // to R2 and stops at REVIEW_REQUIRED. It never bypasses the existing APPROVED
        // publication gate, and a failure cannot block either Instagram or X.
        runRunwayGenerationCycle(env, scheduledAt),
        queueBuzzThemeNotifications(env, scheduledAt).then(() => Promise.all([
          deliverDueWebNotifications(env, scheduledAt),
          deliverDueMemberNotifications(env, scheduledAt)
        ])),
        runMarketplaceContentCycle(env, scheduledAt),
        runSpApiScheduledSync(env, scheduledAt),
        purgeAdminAuthRecords(env, scheduledAt),
        purgeSellerAuthRecords(env, scheduledAt),
        refreshMarketplaceKpiSummary(env),
        // refreshAnonymousBenchmark()はkpi_summaryを読む前に自分でrefreshKpiSummary()
        // を呼ぶ(gas/BenchmarkEngine.gs同様、KPI集計→ベンチマーク算出の順で依存する)。
        // ここで別途refreshKpiSummary(env)を並列実行すると、同じkpi_summaryテーブルへの
        // DELETE+INSERTが競合しPRIMARY KEY衝突を起こすため呼ばない。
        refreshAnonymousBenchmark(env),
        // HOSHILU INSIGHT v1.0 (2026-08-08 cron配線): 保存した検索条件の新着
        // スキャン。D1索引検索のみでAI呼び出しは発生しないため、mywatchの
        // 価格監視(まだ存在しない外部パイプライン頼み)と違い自己完結して
        // 定期実行できる。1回あたりの件数上限は insight-routes.mjs 側で管理。
        runInsightScan(env, scheduledAt.toISOString()),
        // APIで確認できた価格だけを購入希望額と比較する。AI推定価格は使わない。
        runTargetPriceScan(env, scheduledAt.toISOString()),
        // HOSHILU BUZZ「急上昇」用の公式ランキング順位スナップショット。
        // 6時間ごとに1回だけ実記録し、migration 0057 未適用なら静かにスキップ。
        recordBuzzSnapshots(env, fetch, scheduledAt.getTime())
        ]);
      }
    ));
  }
};
