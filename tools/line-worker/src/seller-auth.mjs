import { sellerPageResponse } from './seller-page.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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
function sellerIdentity(env) {
  const plan = String(env.SELLER_PLAN || 'LITE').toUpperCase();
  return {
    account: String(env.SELLER_ACCOUNT_NAME || env.SELLER_AUTH_ID || 'Seller').slice(0, 100),
    tenants: String(env.SELLER_ALLOWED_TENANTS || env.SELLER_TENANT || 'itg')
      .split(',').map((value) => value.trim()).filter(Boolean).slice(0, 20),
    plan: ['PARTNER', 'PRO', 'GROWTH', 'LITE'].includes(plan) ? plan : 'LITE'
  };
}
async function createSellerSession(env, nowSeconds = Math.floor(Date.now() / 1000)) {
  const payload = toBase64Url(bytesToBase64(encoder.encode(JSON.stringify({
    role: 'seller', exp: nowSeconds + 60 * 60 * 12, nonce: crypto.randomUUID(), ...sellerIdentity(env)
  }))));
  const signature = toBase64Url(bytesToBase64(await hmac(payload, env.AUTH_SESSION_SECRET)));
  return `${payload}.${signature}`;
}
export async function readSellerSession(request, env, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!env.AUTH_SESSION_SECRET) return null;
  try {
    const [payload, signature, extra] = cookieValue(request, 'hoshilu_seller_session').split('.');
    if (!payload || !signature || extra) return null;
    const expected = toBase64Url(bytesToBase64(await hmac(payload, env.AUTH_SESSION_SECRET)));
    if (!constantTimeEqual(signature, expected)) return null;
    const data = JSON.parse(decoder.decode(base64ToBytes(fromBase64Url(payload))));
    if (data.role !== 'seller' || Number(data.exp) < nowSeconds) return null;
    return {
      account: safeSessionText(data.account, 'Seller'),
      tenants: Array.isArray(data.tenants) ? data.tenants.map((value) => safeSessionText(value, '')).filter(Boolean) : ['itg'],
      plan: ['PARTNER', 'PRO', 'GROWTH', 'LITE'].includes(data.plan) ? data.plan : 'LITE'
    };
  } catch {
    return null;
  }
}
export async function verifySellerSession(request, env, nowSeconds = Math.floor(Date.now() / 1000)) {
  return Boolean(await readSellerSession(request, env, nowSeconds));
}
async function handleLogin(request, env) {
  if (!env.SELLER_AUTH_ID || !env.SELLER_AUTH_PASSWORD || !env.AUTH_SESSION_SECRET) {
    return Response.json({ ok: false, error: 'SELLER_AUTH_NOT_CONFIGURED' }, { status: 503 });
  }
  const requestOrigin = request.headers.get('origin');
  const ownOrigin = new URL(request.url).origin;
  if (requestOrigin && requestOrigin !== ownOrigin) return Response.json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 2000) return Response.json({ ok: false, error: 'REQUEST_TOO_LARGE' }, { status: 413 });
  const input = await request.json();
  const id = String(input.id || '').trim();
  const password = String(input.password || '');
  const valid = id.length >= 3 && id.length <= 100 && password.length >= 12 && password.length <= 200
    && constantTimeEqual(id, env.SELLER_AUTH_ID) && constantTimeEqual(password, env.SELLER_AUTH_PASSWORD);
  if (!valid) return Response.json({ ok: false, error: 'LOGIN_FAILED' }, { status: 401 });
  const session = await createSellerSession(env);
  return Response.json({ ok: true }, { headers: {
    'cache-control': 'no-store',
    'set-cookie': `hoshilu_seller_session=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`
  } });
}
export async function handleSellerRoutes(request, env) {
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/api/seller/login') return handleLogin(request, env);
  if (request.method === 'GET' && url.pathname === '/api/seller/session') {
    const seller = await readSellerSession(request, env);
    return Response.json({ ok: Boolean(seller), seller }, { status: seller ? 200 : 401, headers: { 'cache-control': 'no-store' } });
  }
  if (request.method === 'POST' && url.pathname === '/api/seller/logout') {
    return Response.json({ ok: true }, { headers: {
      'set-cookie': 'hoshilu_seller_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
    } });
  }
  if (request.method === 'GET' && (url.pathname === '/seller' || url.pathname === '/seller.html')) {
    const seller = await readSellerSession(request, env);
    if (!seller) return Response.redirect(`${url.origin}/seller-login.html`, 302);
    return sellerPageResponse(env, seller);
  }
  if (url.pathname.startsWith('/seller-shell')) return new Response('not found', { status: 404 });
  return null;
}
