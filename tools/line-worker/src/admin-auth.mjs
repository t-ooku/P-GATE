import { adminLoginPageResponse, adminSpApiPageResponse } from './admin-sp-api-page.mjs';
import {
  adminLoginFingerprint, adminLoginLocked, recordAdminLoginFailure,
  recordAdminLoginLocked, recordAdminLoginSuccess, recordAdminLogout
} from './admin-login-guard.mjs';
import { readBoundedJson } from './bounded-json.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const COOKIE = '__Host-hoshilu_admin_session';
const MAX_AGE_SECONDS = 30 * 60;
const unsafeExampleValue = (value) =>
  /replace[-_ ]?with|change[-_ ]?me|changeme|placeholder/i.test(String(value || ''));
const adminConfigured = (env) =>
  String(env.ADMIN_AUTH_ID || '').length >= 3 &&
  String(env.ADMIN_AUTH_PASSWORD || '').length >= 16 &&
  String(env.ADMIN_SESSION_SECRET || '').length >= 64 &&
  !unsafeExampleValue(env.ADMIN_AUTH_ID) &&
  !unsafeExampleValue(env.ADMIN_AUTH_PASSWORD) &&
  !unsafeExampleValue(env.ADMIN_SESSION_SECRET);
const adminJson = (value, init = {}) => {
  const headers = new Headers(init.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return Response.json(value, { ...init, headers });
};
const noStoreRedirect = (location) => new Response(null, {
  status: 302,
  headers: {
    location,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  }
});

const bytesToBase64Url = (bytes) => {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};
const base64UrlToBytes = (value) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};
const cookieValue = (request) => String(request.headers.get('cookie') || '')
  .split(';')
  .map((value) => value.trim())
  .find((value) => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
const constantTimeEqual = (left, right) => {
  const a = encoder.encode(String(left || ''));
  const b = encoder.encode(String(right || ''));
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
};
async function signature(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return bytesToBase64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}
async function adminCredentialVersion(env) {
  return signature(
    `admin-credentials\n${env.ADMIN_AUTH_ID}\n${env.ADMIN_AUTH_PASSWORD}`,
    env.ADMIN_SESSION_SECRET
  );
}
async function createSession(env, nowSeconds = Math.floor(Date.now() / 1000)) {
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({
    role: 'operator', exp: nowSeconds + MAX_AGE_SECONDS, nonce: crypto.randomUUID(),
    auth_version: await adminCredentialVersion(env)
  })));
  return `${payload}.${await signature(payload, env.ADMIN_SESSION_SECRET)}`;
}
export async function readAdminSession(request, env, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!adminConfigured(env)) return null;
  try {
    const [payload, receivedSignature, extra] = cookieValue(request).split('.');
    if (!payload || !receivedSignature || extra) return null;
    const expectedSignature = await signature(payload, env.ADMIN_SESSION_SECRET);
    if (!constantTimeEqual(receivedSignature, expectedSignature)) return null;
    const session = JSON.parse(decoder.decode(base64UrlToBytes(payload)));
    if (session.role !== 'operator' || Number(session.exp) <= nowSeconds) return null;
    if (!constantTimeEqual(session.auth_version, await adminCredentialVersion(env))) return null;
    return { role: 'operator' };
  } catch {
    return null;
  }
}
export async function authorizeAdminRequest(request, env) {
  const expected = String(env.SOCIAL_ADMIN_SECRET || '');
  const received = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (expected.length >= 32 && constantTimeEqual(received, expected)) return { mode: 'bearer' };
  if (!await readAdminSession(request, env)) return null;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (origin !== new URL(request.url).origin) return null;
  }
  return { mode: 'session' };
}
export async function handleAdminAuthRoutes(request, env) {
  const url = new URL(request.url);
  if (request.method === 'GET' && ['/admin-login', '/admin-login.html'].includes(url.pathname)) {
    if (await readAdminSession(request, env)) {
      return noStoreRedirect(`${url.origin}/admin/sp-api`);
    }
    return adminLoginPageResponse();
  }
  if (request.method === 'GET' && url.pathname === '/admin/sp-api') {
    if (!await readAdminSession(request, env)) {
      return noStoreRedirect(`${url.origin}/admin-login`);
    }
    return adminSpApiPageResponse();
  }
  if (url.pathname.startsWith('/admin-shell')) return new Response('not found', { status: 404 });
  if (!url.pathname.startsWith('/api/admin/')) return null;
  if (request.method === 'POST' && url.pathname === '/api/admin/login') {
    if (!adminConfigured(env)) {
      return adminJson({ ok: false, error: 'ADMIN_AUTH_NOT_CONFIGURED' }, { status: 503 });
    }
    if (request.headers.get('origin') !== url.origin) {
      return adminJson({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
    }
    if (!env.PRODUCT_DB) {
      return adminJson({ ok: false, error: 'ADMIN_LOGIN_GUARD_UNAVAILABLE' }, { status: 503 });
    }
    const parsed = await readBoundedJson(request, 2000);
    if (!parsed.ok) return adminJson({ ok: false, error: parsed.error }, {
      status: parsed.error === 'REQUEST_TOO_LARGE' ? 413 : 400
    });
    const input = parsed.value;
    let fingerprint;
    try {
      fingerprint = await adminLoginFingerprint(request, env.ADMIN_SESSION_SECRET);
      if (await adminLoginLocked(env.PRODUCT_DB, fingerprint)) {
        await recordAdminLoginLocked(env.PRODUCT_DB, fingerprint);
        return adminJson({ ok: false, error: 'LOGIN_RATE_LIMITED' }, {
          status: 429, headers: { 'retry-after': '900', 'cache-control': 'no-store' }
        });
      }
    } catch {
      return adminJson({ ok: false, error: 'ADMIN_LOGIN_GUARD_UNAVAILABLE' }, { status: 503 });
    }
    if (!constantTimeEqual(String(input.id || '').trim(), env.ADMIN_AUTH_ID) ||
        !constantTimeEqual(String(input.password || ''), env.ADMIN_AUTH_PASSWORD)) {
      try {
        await recordAdminLoginFailure(env.PRODUCT_DB, fingerprint);
      } catch {
        return adminJson({ ok: false, error: 'ADMIN_LOGIN_GUARD_UNAVAILABLE' }, { status: 503 });
      }
      return adminJson({ ok: false, error: 'LOGIN_FAILED' }, { status: 401 });
    }
    try {
      await recordAdminLoginSuccess(env.PRODUCT_DB, fingerprint);
    } catch {
      return adminJson({ ok: false, error: 'ADMIN_LOGIN_GUARD_UNAVAILABLE' }, { status: 503 });
    }
    const session = await createSession(env);
    return adminJson({ ok: true }, { headers: {
      'set-cookie': `${COOKIE}=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE_SECONDS}`
    } });
  }
  if (request.method === 'GET' && url.pathname === '/api/admin/session') {
    const session = await readAdminSession(request, env);
    return adminJson({ ok: Boolean(session) }, {
      status: session ? 200 : 401,
    });
  }
  if (request.method === 'POST' && url.pathname === '/api/admin/logout') {
    if (request.headers.get('origin') !== url.origin) {
      return adminJson({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
    }
    if (await readAdminSession(request, env) && env.PRODUCT_DB) {
      try {
        const fingerprint = await adminLoginFingerprint(request, env.ADMIN_SESSION_SECRET);
        await recordAdminLogout(env.PRODUCT_DB, fingerprint);
      } catch {
        // Logout must still invalidate the browser cookie if audit storage fails.
      }
    }
    return adminJson({ ok: true }, { headers: {
      'set-cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
    } });
  }
  return adminJson({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
}
