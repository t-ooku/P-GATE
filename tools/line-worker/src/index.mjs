import { handleSellerRoutes } from './seller-auth.mjs';
import { handleAdminAuthRoutes } from './admin-auth.mjs';
import { purgeAdminAuthRecords } from './admin-login-guard.mjs';
import { purgeSellerAuthRecords } from './seller-login-guard.mjs';
import { handleMemberRoutes, lineLoginConfigured } from './member-auth.mjs';
import { emailLoginConfigured } from './member-email-auth.mjs';
import { syncProducts } from './product-index-v2.mjs';
import { applyIndexedSearchPolicy, filterCategoryMismatches, rankMerchantCandidates, suggestedKeywordOptions } from './knowledge-search.mjs';
import { creatorsApiConfigured, searchAmazonCreators } from './amazon-creators-api.mjs';
import {
  buildDeviceAccessorySearchKeywords,
  buildMarketplaceSearchKeywords
} from '../public/marketplace-search-keywords-v2.mjs';
import {
  rakutenApiConfigured,
  searchRakutenMarketplaceWithFallback
} from './rakuten-marketplace-api.mjs';
import { marketplaceForProductUrl, PRODUCT_MARKETPLACES as PRODUCT_MARKETPLACE_LIST } from './marketplace-product-url-policy.mjs';
import { marketplaceOfferStats, syncMarketplaceOffers } from './marketplace-offer-feed.mjs';
import { discoverProductsWithAi } from './ai-product-discovery.mjs';
import { buildApparelMarketplaceDestinations } from './apparel-marketplaces.mjs';
import { handleMemberWishRoutes } from './member-wish-v2.mjs';
import { deliverDueWebNotifications, handleMywatchRoutes } from './mywatch-routes.mjs';
import { deliverDueMemberNotifications } from './member-notification-delivery.mjs';
import { handleUnmetDemandRoutes } from './unmet-demand-routes.mjs';
import {
  runSpApiScheduledSync, spApiConfiguredTenants
} from './sp-api-d1-repository.mjs';
import { handleSpApiAdminRoutes } from './sp-api-admin-routes.mjs';
import { handleSpApiSellerRoutes } from './sp-api-seller-routes.mjs';
import { semanticSearchGroups } from './search-intelligence.mjs';
import {
  handleSocialAdminRoutes, runDueSocialPosts, socialPublisherReadiness
} from './social-publisher.mjs';
import { renderSeoPage } from './seo-pages.mjs';
import { classifyGrowthTraffic, handleGrowthEvent } from './growth-events.mjs';
import {
  runMarketplaceContentCycle, handleMarketplaceSaleRoutes
} from './marketplace-sales.mjs';
const encoder = new TextEncoder();
const ALLOWED_DESTINATION_DOMAINS = [
  'amazon.co.jp', 'amazon.com', 'rakuten.co.jp',
  'shopping.yahoo.co.jp', 'store.shopping.yahoo.co.jp',
  'qoo10.jp', 'shein.com', 'zozo.jp', 'shop-list.com',
  'musinsa.com', 'buyma.com', 'snkrdunk.com'
];
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
      rakuten_marketplace_configured: rakutenApiConfigured(env)
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
    if (events.length) ctx.waitUntil(callGas(env, 'TRACK', { events, channel: 'LINE' }));
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
  const cleaned = redactSearchPersonalData(query);
  if (!cleaned) return '';
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
  const semanticTerms = semanticSearchGroups(cleaned)
    .flatMap((group) => group.terms || [])
    .map((term) => String(term).toLowerCase().trim())
    .filter(Boolean);
  const directTerms = cleaned
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{2,}/g) || [];
  const localizedTerms = AMAZON_JP_QUERY_ALIASES
    .filter(([pattern]) => pattern.test(cleaned))
    .flatMap(([, terms]) => terms);
  const optimized = [...new Set([...asinTerms.map((term) => term.toLowerCase()), ...localizedTerms, ...semanticTerms, ...directTerms])]
    .filter((term) => !['with', 'from', 'that', 'this', 'type', 'size'].includes(term))
    .slice(0, 12);
  return optimized.length ? optimized.join(' ') : cleaned;
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
  let cleaned = redactSearchPersonalData(query)
    .replace(/\bB[A-Z0-9]{9}\b/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!cleaned) return '';
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(cleaned)) {
    cleaned = cleaned
      .replace(/\b[a-z][a-z-]{2,}\b/g, ' ')
      .replace(/\s+/gu, ' ')
      .trim();
  }
  const structuredTerms = structuredMarketplaceTerms(cleaned);
  if (structuredTerms.length) return structuredTerms.join(' ');
  return buildMarketplaceSearchKeywords(cleaned, 'RAKUTEN_JP') || cleaned;
}

export function buildRakutenSearchKeywordCandidates(query) {
  const primary = buildRakutenSearchKeywords(query);
  const rememberedProduct = buildRakutenSearchKeywords(
    String(query || '').split('/')[0]
  );
  return [...new Set([primary, rememberedProduct].filter(Boolean))].slice(0, 2);
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
  const cleaned = redactSearchPersonalData(query)
    .replace(/\bB[A-Z0-9]{9}\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const deviceAccessoryTerms = buildDeviceAccessorySearchKeywords(cleaned);
  if (deviceAccessoryTerms) return deviceAccessoryTerms;
  const compactTerms = buildMarketplaceSearchKeywords(cleaned, 'QOO10_JP');
  if (compactTerms !== cleaned) return compactTerms;
  const structuredTerms = structuredMarketplaceTerms(cleaned);
  if (structuredTerms.length) return structuredTerms.join(' ');
  const semanticTerms = semanticSearchGroups(cleaned)
    .flatMap((group) => group.terms || [])
    .map((term) => String(term).toLowerCase().trim())
    .filter(Boolean);
  const directTerms = cleaned
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{2,}/g) || [];
  const localizedTerms = QOO10_QUERY_ALIASES
    .filter(([pattern]) => pattern.test(cleaned))
    .flatMap(([, terms]) => terms);
  if (localizedTerms.length) return localizedTerms[0];
  const optimized = [...new Set([...semanticTerms, ...directTerms])]
    .filter((term) => !['with', 'from', 'that', 'this', 'type', 'size'].includes(term))
    .slice(0, 4);
  return optimized.length ? optimized.join(' ') : cleaned;
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
  const keywords = buildMarketplaceSearchKeywords(cleaned, 'SHEIN_JP');
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
    links.push({ marketplace: item.marketplace, label: item.label, url: `${context.origin}/go?token=${encodeURIComponent(token)}` });
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

async function decoratePwaResult(result, request, env, sessionHash, query = '') {
  const origin = new URL(request.url).origin;
  const seed = result.query_id || crypto.randomUUID();
  const candidates = [];
  const displayCandidates = filterCategoryMismatches(query, result.candidates || []).slice(0, 10);
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
    copy.selected_offer = selected.offer ? copy.offers[0] || sanitizePublicOffer(selected.offer) : null;
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
  return {
    ...result,
    candidates,
    amazon_search_url: amazonSearchUrl,
    amazon_search_keywords: buildAmazonSearchKeywords(query),
    search_keywords: buildAmazonSearchKeywords(query),
    marketplace_search_links: marketplaceSearchLinks
  };
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
  return {
    marketplace: String(offer?.marketplace || ''),
    price: Number(offer?.price || 0),
    shipping_fee: Number(offer?.shipping_fee || 0),
    total_cost: Number(offer?.total_cost ?? (Number(offer?.price || 0) + Number(offer?.shipping_fee || 0))),
    currency: String(offer?.currency || 'JPY'),
    stock_status: String(offer?.stock_status || 'UNKNOWN'),
    delivery_days: Number(offer?.delivery_days || 0)
  };
}

async function handleKnowledgeApi(request, env, ctx) {
  try {
    const requestOrigin = request.headers.get('origin');
    const ownOrigin = new URL(request.url).origin;
    if (requestOrigin && requestOrigin !== ownOrigin) return Response.json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
    const length = Number(request.headers.get('content-length') || 0);
    if (length > 10000) return Response.json({ ok: false, error: 'REQUEST_TOO_LARGE' }, { status: 413 });
    const input = validateKnowledgeRequest(await request.json());
    await verifyTurnstile(input.turnstile_token, env, request.headers.get('cf-connecting-ip'));
    const [gasOutcome, indexedOutcome] = await Promise.allSettled([
      callGas(env, 'KNOWLEDGE', { request: { query: input.query, consent: true } }),
      applyIndexedSearchPolicy({ candidates: [] }, env, input.query, input.language, {
        force_product_presentation: input.search_attempt >= 2
      })
    ]);
    const gasResult = gasOutcome.status === 'fulfilled' ? gasOutcome.value : { candidates: [], message: '' };
    let result = indexedOutcome.status === 'fulfilled' ? indexedOutcome.value : gasResult;
    if (indexedOutcome.status === 'fulfilled' && (gasResult?.candidates || []).length) {
      result = {
        ...gasResult,
        ...result,
        candidates: rankMerchantCandidates(result.candidates, gasResult.candidates)
      };
    }
    const shouldSearchMarketplaces = input.search_attempt >= 2 || String(input.query).includes(' / ') || !(result?.candidates || []).length;
    if (shouldSearchMarketplaces) {
      const marketplaceSearches = [];
      if (creatorsApiConfigured(env)) marketplaceSearches.push({
        key: 'amazon_catalog_connected',
        run: searchAmazonCreators(env, buildAmazonSearchKeywords(input.query))
      });
      if (rakutenApiConfigured(env)) marketplaceSearches.push({
        key: 'rakuten_catalog_connected',
        run: searchRakutenMarketplaceWithFallback(
          env,
          buildRakutenSearchKeywordCandidates(input.query)
        )
      });
      const outcomes = await Promise.allSettled(marketplaceSearches.map((item) => item.run));
      outcomes.forEach((outcome, index) => {
        const source = marketplaceSearches[index];
        result = { ...(result || {}), [source.key]: outcome.status === 'fulfilled' };
        if (outcome.status !== 'fulfilled') return;
        const candidates = filterCategoryMismatches(input.query, outcome.value);
        result.candidates = rankMerchantCandidates(result.candidates || [], candidates).slice(0, 10);
      });
    }
    result = {
      ...(result || {}),
      traffic_class: input.traffic_class,
      candidates: filterCategoryMismatches(input.query, result?.candidates || []).slice(0, 10)
    };
    if (input.search_attempt >= 2) {
      result.clarification = { ...(result.clarification || {}), required: false, options: [] };
      result.search_guidance = {
        ...(result.search_guidance || {}),
        product_presentation_required: true,
        product_presentation_met: result.candidates.length > 0
      };
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
    }
    const sessionHash = await hashUser(input.session_id);
    const decorated = await decoratePwaResult(
      result,
      request,
      env,
      sessionHash,
      input.query
    );
    const events = (decorated.candidates || []).map((candidate) => ({
      event_id: `${decorated.query_id}:IMPRESSION:${candidate.asin}`,
      occurred_at: new Date().toISOString(), user_hash: sessionHash,
      recommendation_id: decorated.query_id, asin: candidate.asin, event_type: 'IMPRESSION'
    }));
    if (events.length) ctx.waitUntil(callGas(env, 'TRACK', { events, channel: 'PWA' }));
    return Response.json({ ok: true, result: decorated }, {
      headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
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
  return Response.json({ turnstile_site_key: siteKey, line_login_configured: lineLoginConfigured(env), email_login_configured: emailLoginConfigured(env), sms_login_configured: false }, {
    status: siteKey ? 200 : 503,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}

async function databaseFeatureChecks(env) {
  const expected = [
    'mywatch_notifications', 'import_restriction_knowledge',
    'sp_api_listings', 'sp_api_sync_audit', 'marketplace_sale_events',
    'member_sale_preferences'
  ];
  if (!env.PRODUCT_DB) return Object.fromEntries(expected.map((name) => [name, false]));
  try {
    const result = await env.PRODUCT_DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table'
      AND name IN ('mywatch_notifications','import_restriction_knowledge',
      'sp_api_listings','sp_api_sync_audit','marketplace_sale_events',
      'member_sale_preferences')`
    ).all();
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
    const memberResponse = await handleMemberRoutes(request, env);
    if (memberResponse) return memberResponse;
    const sellerResponse = await handleSellerRoutes(request, env);
    if (sellerResponse) return sellerResponse;
    if (request.method === 'POST' && url.pathname === '/webhook') return handleWebhook(request, env, ctx);
    if (request.method === 'POST' && url.pathname === '/api/knowledge') return handleKnowledgeApi(request, env, ctx);
    if (request.method === 'GET' && url.pathname === '/api/config') return handlePublicConfig(env);
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
      purgeSellerAuthRecords(env, scheduledAt)
    ]));
  }
};
