// Stripe REST API の薄いクライアント（Cloudflare Workers 用・SDK不使用）。
// - form-encoded で送る（Stripe の要求）。ネストは a[b][c]=v、配列は a[0]=v。
// - Idempotency-Key を付けて二重作成を防ぐ。
// - Webhook は Stripe-Signature（t=..., v1=...）を HMAC-SHA256 で検証する。
// 秘密鍵・署名シークレット・レスポンス本文はログに出さない。

const STRIPE_API = 'https://api.stripe.com/v1';
const encoder = new TextEncoder();

export function stripeConfigured(env = {}) {
  const key = String(env.STRIPE_SECRET_KEY || '');
  return /^(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}$/u.test(key);
}

export function stripeWebhookConfigured(env = {}) {
  return /^whsec_[A-Za-z0-9]{16,}$/u.test(String(env.STRIPE_WEBHOOK_SECRET || ''));
}

export function stripeMode(env = {}) {
  const key = String(env.STRIPE_SECRET_KEY || '');
  if (/^(?:sk|rk)_live_/u.test(key)) return 'live';
  if (/^(?:sk|rk)_test_/u.test(key)) return 'test';
  return 'unconfigured';
}

export function encodeStripeForm(input, prefix = '', out = []) {
  if (input === undefined || input === null) return out;
  if (Array.isArray(input)) {
    input.forEach((value, index) => encodeStripeForm(value, `${prefix}[${index}]`, out));
    return out;
  }
  if (typeof input === 'object') {
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined || value === null) continue;
      encodeStripeForm(value, prefix ? `${prefix}[${key}]` : key, out);
    }
    return out;
  }
  out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(input))}`);
  return out;
}

export class StripeError extends Error {
  constructor(message, { status = 0, code = '', type = '' } = {}) {
    super(message);
    this.name = 'StripeError';
    this.status = status;
    this.code = code;
    this.type = type;
  }
}

export async function stripeRequest(env, method, path, body = null, { idempotencyKey = '', query = null } = {}) {
  if (!stripeConfigured(env)) throw new StripeError('STRIPE_NOT_CONFIGURED', { code: 'not_configured' });
  const url = new URL(`${STRIPE_API}${path}`);
  if (query) for (const pair of encodeStripeForm(query)) {
    const [k, v] = pair.split('=');
    url.searchParams.append(decodeURIComponent(k), decodeURIComponent(v));
  }
  const headers = {
    authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    'stripe-version': '2024-06-20',
    'user-agent': 'hoshilu-worker/1.0'
  };
  let payload;
  if (body && method !== 'GET') {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    payload = encodeStripeForm(body).join('&');
  }
  if (idempotencyKey) headers['idempotency-key'] = String(idempotencyKey).slice(0, 255);
  const fetcher = env.STRIPE_FETCH || fetch;
  const response = await fetcher(url.toString(), { method, headers, body: payload, redirect: 'manual' });
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) {
    const error = data?.error || {};
    throw new StripeError(String(error.message || `STRIPE_HTTP_${response.status}`).slice(0, 200), {
      status: response.status, code: String(error.code || ''), type: String(error.type || '')
    });
  }
  return data;
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a, b) {
  const left = encoder.encode(String(a));
  const right = encoder.encode(String(b));
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

export async function computeStripeSignature(secret, timestamp, rawBody) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`)));
}

// 署名検証。tolerance 秒より古いタイムスタンプは再生攻撃として拒否する。
export async function verifyStripeWebhook(rawBody, signatureHeader, secret, { now = Date.now(), toleranceSeconds = 300 } = {}) {
  if (!/^whsec_/u.test(String(secret || ''))) throw new StripeError('STRIPE_WEBHOOK_NOT_CONFIGURED', { code: 'not_configured' });
  const parts = String(signatureHeader || '').split(',').map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2) || '';
  const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!/^\d+$/u.test(timestamp) || !signatures.length) throw new StripeError('STRIPE_SIGNATURE_MALFORMED', { code: 'signature' });
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > toleranceSeconds) {
    throw new StripeError('STRIPE_SIGNATURE_EXPIRED', { code: 'signature' });
  }
  const expected = await computeStripeSignature(secret, timestamp, rawBody);
  if (!signatures.some((candidate) => constantTimeEqual(candidate, expected))) {
    throw new StripeError('STRIPE_SIGNATURE_INVALID', { code: 'signature' });
  }
  return JSON.parse(rawBody);
}
