import { sellerPageResponse } from './seller-page.mjs';
import { handleSellerBillingRoutes } from './seller-billing.mjs';
import { spApiSellerPageResponse } from './sp-api-seller-page.mjs';
import { readBoundedJson } from './bounded-json.mjs';
import {
  changeSellerPriority, sellerPriorityClientError
} from './seller-priority-console.mjs';
import {
  sellerLoginFingerprint, sellerLoginLocked, recordSellerLoginFailure,
  recordSellerLoginLocked, recordSellerLoginSuccess, recordSellerLogout
} from './seller-login-guard.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SELLER_COOKIE = '__Host-hoshilu_seller_session';
const LEGACY_SELLER_COOKIE = 'hoshilu_seller_session';
const unsafeExampleValue = (value) =>
  /replace[-_ ]?with|change[-_ ]?me|changeme|placeholder/i.test(String(value || ''));
const configuredSellerTenants = (env) => [...new Set(
  String(env.SELLER_ALLOWED_TENANTS || env.SELLER_TENANT || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[a-z0-9_-]{1,32}$/.test(value))
)].slice(0, 20);
const sellerConfigured = (env) =>
  String(env.SELLER_AUTH_ID || '').length >= 3 &&
  String(env.SELLER_AUTH_PASSWORD || '').length >= 12 &&
  String(env.AUTH_SESSION_SECRET || '').length >= 64 &&
  configuredSellerTenants(env).length > 0 &&
  !unsafeExampleValue(env.SELLER_AUTH_ID) &&
  !unsafeExampleValue(env.SELLER_AUTH_PASSWORD) &&
  !unsafeExampleValue(env.AUTH_SESSION_SECRET);
const sellerJson = (value, init = {}) => {
  const headers = new Headers(init.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return Response.json(value, { ...init, headers });
};
const sellerSessionHeaders = (session = '') => {
  const headers = new Headers();
  headers.append('set-cookie',
    `${SELLER_COOKIE}=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${session ? 43200 : 0}`
  );
  headers.append('set-cookie',
    `${LEGACY_SELLER_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
  );
  return headers;
};
const noStoreRedirect = (location) => new Response(null, {
  status: 302,
  headers: { location, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
});

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
function hex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function hmac(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, encoder.encode(value));
}
async function sellerCredentialVersion(env) {
  const value = `seller-credentials\n${env.SELLER_AUTH_ID}\n${env.SELLER_AUTH_PASSWORD}`;
  return toBase64Url(bytesToBase64(await hmac(value, env.AUTH_SESSION_SECRET)));
}
export async function sellerPasswordHash(password, secret) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(`${password}\n${secret}`)));
}
function constantTimeEqual(left, right) {
  const a = encoder.encode(String(left || ''));
  const b = encoder.encode(String(right || ''));
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}
function cookieValue(request, name) {
  for (const cookie of String(request.headers.get('cookie') || '').split(';')) {
    const separator = cookie.indexOf('=');
    if (separator >= 0 && cookie.slice(0, separator).trim() === name) return cookie.slice(separator + 1).trim();
  }
  return '';
}
function safeSessionText(value, fallback) {
  const normalized = String(value || '').trim().slice(0, 100);
  return normalized || fallback;
}
async function sellerAccountKey(env) {
  const value = `seller-account\n${env.SELLER_AUTH_ID}`;
  return toBase64Url(bytesToBase64(await hmac(value, env.AUTH_SESSION_SECRET))).slice(0, 43);
}
async function sellerIdentity(env) {
  const plan = String(env.SELLER_PLAN || 'LITE').toUpperCase();
  return {
    account: String(env.SELLER_ACCOUNT_NAME || env.SELLER_AUTH_ID || 'Seller').slice(0, 100),
    tenants: configuredSellerTenants(env),
    plan: ['BUSINESS', 'SELLER', 'PARTNER', 'PRO', 'GROWTH', 'LITE'].includes(plan) ? plan : 'SELLER',
    seller_key: await sellerAccountKey(env)
  };
}
async function createSellerSession(env, nowSeconds = Math.floor(Date.now() / 1000)) {
  const payload = toBase64Url(bytesToBase64(encoder.encode(JSON.stringify({
    role: 'seller', exp: nowSeconds + 60 * 60 * 12, nonce: crypto.randomUUID(),
    auth_version: await sellerCredentialVersion(env), ...(await sellerIdentity(env))
  }))));
  const signature = toBase64Url(bytesToBase64(await hmac(payload, env.AUTH_SESSION_SECRET)));
  return `${payload}.${signature}`;
}
export async function readSellerSession(request, env, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!sellerConfigured(env)) return null;
  try {
    const [payload, signature, extra] = cookieValue(request, SELLER_COOKIE).split('.');
    if (!payload || !signature || extra) return null;
    const expected = toBase64Url(bytesToBase64(await hmac(payload, env.AUTH_SESSION_SECRET)));
    if (!constantTimeEqual(signature, expected)) return null;
    const data = JSON.parse(decoder.decode(base64ToBytes(fromBase64Url(payload))));
    if (data.role !== 'seller' || Number(data.exp) <= nowSeconds) return null;
    if (!constantTimeEqual(data.auth_version, await sellerCredentialVersion(env))) return null;
    const currentlyAllowed = new Set(configuredSellerTenants(env));
    const sessionTenants = Array.isArray(data.tenants)
      ? [...new Set(data.tenants
        .map((value) => safeSessionText(value, '').toLowerCase())
        .filter((value) => currentlyAllowed.has(value)))]
      : [];
    if (sessionTenants.length === 0) return null;
    const currentIdentity = await sellerIdentity(env);
    return {
      account: currentIdentity.account,
      tenants: sessionTenants,
      plan: currentIdentity.plan,
      seller_key: currentIdentity.seller_key
    };
  } catch {
    return null;
  }
}
export async function verifySellerSession(request, env, nowSeconds = Math.floor(Date.now() / 1000)) {
  return Boolean(await readSellerSession(request, env, nowSeconds));
}
async function handleLogin(request, env) {
  if (!sellerConfigured(env)) {
    return sellerJson({ ok: false, error: 'SELLER_AUTH_NOT_CONFIGURED' }, { status: 503 });
  }
  const requestOrigin = request.headers.get('origin');
  const ownOrigin = new URL(request.url).origin;
  if (requestOrigin !== ownOrigin) {
    return sellerJson({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
  }
  const parsed = await readBoundedJson(request, 2000);
  if (!parsed.ok) return sellerJson({ ok: false, error: parsed.error }, {
    status: parsed.error === 'REQUEST_TOO_LARGE' ? 413 : 400
  });
  const input = parsed.value;
  if (!env.PRODUCT_DB) {
    return sellerJson({ ok: false, error: 'SELLER_LOGIN_GUARD_UNAVAILABLE' }, { status: 503 });
  }
  let fingerprint;
  try {
    fingerprint = await sellerLoginFingerprint(request, env.AUTH_SESSION_SECRET);
    if (await sellerLoginLocked(env.PRODUCT_DB, fingerprint)) {
      await recordSellerLoginLocked(env.PRODUCT_DB, fingerprint);
      return sellerJson({ ok: false, error: 'LOGIN_RATE_LIMITED' }, {
        status: 429, headers: { 'retry-after': '900' }
      });
    }
  } catch {
    return sellerJson({ ok: false, error: 'SELLER_LOGIN_GUARD_UNAVAILABLE' }, { status: 503 });
  }
  const id = String(input.id || '').trim();
  const password = String(input.password || '');
  const valid = id.length >= 3 && id.length <= 100 && password.length >= 12 && password.length <= 200
    && constantTimeEqual(id, env.SELLER_AUTH_ID) && constantTimeEqual(password, env.SELLER_AUTH_PASSWORD);
  if (!valid) {
    try {
      await recordSellerLoginFailure(env.PRODUCT_DB, fingerprint);
    } catch {
      return sellerJson({ ok: false, error: 'SELLER_LOGIN_GUARD_UNAVAILABLE' }, { status: 503 });
    }
    return sellerJson({ ok: false, error: 'LOGIN_FAILED' }, { status: 401 });
  }
  try {
    await recordSellerLoginSuccess(env.PRODUCT_DB, fingerprint);
  } catch {
    return sellerJson({ ok: false, error: 'SELLER_LOGIN_GUARD_UNAVAILABLE' }, { status: 503 });
  }
  const session = await createSellerSession(env);
  return sellerJson({ ok: true }, { headers: sellerSessionHeaders(session) });
}
async function handlePriorityMutation(request, env) {
  const url = new URL(request.url);
  if (request.headers.get('origin') !== url.origin) {
    return sellerJson({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
  }
  const seller = await readSellerSession(request, env);
  if (!seller) return sellerJson({ ok: false, error: 'SELLER_AUTH_REQUIRED' }, { status: 401 });
  const parsed = await readBoundedJson(request, 4000);
  if (!parsed.ok) return sellerJson({ ok: false, error: parsed.error }, {
    status: parsed.error === 'REQUEST_TOO_LARGE' ? 413 : 400
  });
  try {
    const result = await changeSellerPriority(env, seller, parsed.value);
    return sellerJson(result);
  } catch (error) {
    const code = String(error?.message || 'SELLER_PRIORITY_UPDATE_FAILED');
    console.error(JSON.stringify({ message: 'seller priority update failed', code }));
    return sellerJson({ ok: false, error: code }, {
      status: sellerPriorityClientError(error) ? 400 : 503
    });
  }
}
export async function handleSellerRoutes(request, env) {
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/api/seller/login') return handleLogin(request, env);
  if (request.method === 'GET' && url.pathname === '/api/seller/session') {
    const seller = await readSellerSession(request, env);
    const publicSeller = seller ? {
      account: seller.account, tenants: seller.tenants, plan: seller.plan
    } : null;
    return sellerJson({ ok: Boolean(seller), seller: publicSeller }, { status: seller ? 200 : 401 });
  }
  if (request.method === 'POST' && url.pathname === '/api/seller/logout') {
    if (request.headers.get('origin') !== url.origin) {
      return sellerJson({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
    }
    if (await readSellerSession(request, env) && env.PRODUCT_DB) {
      try {
        const fingerprint = await sellerLoginFingerprint(request, env.AUTH_SESSION_SECRET);
        await recordSellerLogout(env.PRODUCT_DB, fingerprint);
      } catch {
        // Logout must still invalidate the browser cookie if audit storage fails.
      }
    }
    return sellerJson({ ok: true }, { headers: sellerSessionHeaders() });
  }
  if (request.method === 'POST' && url.pathname === '/api/seller/priority-rules') {
    return handlePriorityMutation(request, env);
  }
  // 2026-09-04 請求・決済（前払い）: 残高・チャージ・月額・自動チャージ。
  if (url.pathname.startsWith('/api/seller/billing')) {
    if (request.method !== 'GET' && request.headers.get('origin') !== url.origin) {
      return sellerJson({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
    }
    const seller = await readSellerSession(request, env);
    return handleSellerBillingRoutes(request, env, seller);
  }
  if (request.method === 'GET' && (url.pathname === '/seller' || url.pathname === '/seller.html')) {
    const seller = await readSellerSession(request, env);
    if (!seller) return noStoreRedirect(`${url.origin}/seller-login.html`);
    return sellerPageResponse(env, seller, url.searchParams);
  }
  if (request.method === 'GET' && url.pathname === '/seller/sp-api') {
    const seller = await readSellerSession(request, env);
    if (!seller) return noStoreRedirect(`${url.origin}/seller-login.html`);
    return spApiSellerPageResponse(seller);
  }
  if (url.pathname.startsWith('/seller-shell')) return new Response('not found', { status: 404 });
  return null;
}
