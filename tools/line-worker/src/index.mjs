const encoder = new TextEncoder();
const AMAZON_HOSTS = new Set(['amazon.co.jp', 'www.amazon.co.jp', 'amazon.com', 'www.amazon.com']);
const RELEASE = '1.11.0';
const REQUIRED_ENV = [
  'GAS_BACKEND_URL', 'GAS_BRIDGE_SECRET', 'LINK_SIGNING_SECRET',
  'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'
];

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
    return url.protocol === 'https:' && AMAZON_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
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
  return { query, session_id: sessionId, turnstile_token: turnstileToken, consent: true };
}

export function getEnvironmentReadiness(env = {}) {
  const missing = REQUIRED_ENV.filter((name) => !String(env[name] || '').trim());
  const weak = ['GAS_BRIDGE_SECRET', 'LINK_SIGNING_SECRET'].filter((name) => {
    const value = String(env[name] || '');
    return value && value.length < 32;
  });
  let backendUrlValid = false;
  try {
    const url = new URL(String(env.GAS_BACKEND_URL || ''));
    backendUrlValid = url.protocol === 'https:' && !url.username && !url.password;
  } catch {}
  const lineSecret = Boolean(String(env.LINE_CHANNEL_SECRET || '').trim());
  const lineToken = Boolean(String(env.LINE_CHANNEL_ACCESS_TOKEN || '').trim());
  const lineConfigured = lineSecret && lineToken;
  const linePartial = lineSecret !== lineToken;
  const ready = missing.length === 0 && weak.length === 0 && backendUrlValid && !linePartial;
  return {
    ready,
    release: RELEASE,
    missing,
    weak,
    checks: {
      gas_backend_https: backendUrlValid,
      pwa_configured: missing.length === 0 && weak.length === 0 && backendUrlValid,
      line_configured: lineConfigured,
      line_partial: linePartial
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
  const response = await fetch(env.GAS_BACKEND_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bridge_secret: env.GAS_BRIDGE_SECRET, action, ...body })
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
    const destination = candidate.amazon_jp_url || candidate.amazon_us_url || '';
    let trackingUrl = '';
    if (isAllowedDestination(destination)) {
      const token = await createTrackToken({
        u: userHash, r: result.query_id || event.webhookEventId, a: candidate.asin,
        d: destination, exp: Math.floor(Date.now() / 1000) + 86400 * 7,
        j: `${event.webhookEventId}:${candidate.asin}`, c: 'LINE'
      }, env.LINK_SIGNING_SECRET);
      trackingUrl = `${origin}/go?token=${encodeURIComponent(token)}`;
    }
    const lines = [
      `${candidate.rank || messages.length}. ${candidate.display_name || candidate.product_name || candidate.asin}`,
      candidate.description || '', trackingUrl
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
  for (const event of payload.events) {
    const result = await callGas(env, 'EVENT', { event });
    if (!event.replyToken || result.status === 'PROCESSING') continue;
    const messages = await buildReplyMessages(result, origin, env, event);
    await replyToLine(event.replyToken, messages, env);
    const userId = event.source?.userId || event.source?.groupId || event.source?.roomId || '';
    const events = impressionEvents(result, event, await hashUser(userId || event.webhookEventId));
    if (events.length) ctx.waitUntil(callGas(env, 'TRACK', { events, channel: 'LINE' }));
  }
  return new Response('ok');
}

async function handleRedirect(request, env, ctx) {
  try {
    const token = new URL(request.url).searchParams.get('token');
    const payload = await verifyTrackToken(token, env.LINK_SIGNING_SECRET);
    if (!isAllowedDestination(payload.d)) return new Response('destination not allowed', { status: 400 });
    const occurredAt = new Date().toISOString();
    const events = ['CLICK', 'OUTBOUND'].map((eventType) => ({
      event_id: `${payload.j}:${eventType}`, occurred_at: occurredAt, user_hash: payload.u,
      recommendation_id: payload.r, asin: payload.a, event_type: eventType
    }));
    const channel = payload.c === 'PWA' ? 'PWA' : 'LINE';
    ctx.waitUntil(callGas(env, 'TRACK', { events, channel }));
    return Response.redirect(payload.d, 302);
  } catch (error) {
    return new Response(String(error.message || error), { status: 400 });
  }
}

async function decoratePwaResult(result, request, env, sessionHash) {
  const origin = new URL(request.url).origin;
  const seed = result.query_id || crypto.randomUUID();
  const candidates = [];
  for (const candidate of (result.candidates || []).slice(0, 3)) {
    const copy = sanitizePublicCandidate(candidate);
    const destination = candidate.amazon_jp_url || candidate.amazon_us_url || '';
    copy.tracking_url = '';
    if (isAllowedDestination(destination)) {
      const token = await createTrackToken({
        u: sessionHash, r: seed, a: candidate.asin, d: destination,
        exp: Math.floor(Date.now() / 1000) + 86400 * 7,
        j: `${seed}:${candidate.asin}`, c: 'PWA'
      }, env.LINK_SIGNING_SECRET);
      copy.tracking_url = `${origin}/go?token=${encodeURIComponent(token)}`;
    }
    candidates.push(copy);
  }
  return { ...result, candidates };
}

export function sanitizePublicCandidate(candidate) {
  const copy = { ...(candidate || {}) };
  delete copy.sku;
  copy.available = Number(copy.stock || 0) > 0;
  delete copy.stock;
  delete copy.amazon_jp_url;
  delete copy.amazon_us_url;
  copy.tracking_url = '';
  if (copy.evidence) {
    copy.evidence = {
      matched_terms: Array.isArray(copy.evidence.matched_terms) ? copy.evidence.matched_terms.slice(0, 6) : [],
      information_score: Number(copy.evidence.information_score || 0)
    };
  }
  return copy;
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
    const result = await callGas(env, 'KNOWLEDGE', { request: { query: input.query, consent: true } });
    const sessionHash = await hashUser(input.session_id);
    const decorated = await decoratePwaResult(result, request, env, sessionHash);
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
  return Response.json({ turnstile_site_key: siteKey }, {
    status: siteKey ? 200 : 503,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}

function handleHealth(env) {
  const readiness = getEnvironmentReadiness(env);
  return Response.json({
    ok: readiness.ready,
    release: readiness.release,
    missing: readiness.missing,
    weak: readiness.weak,
    checks: readiness.checks
  }, {
    status: readiness.ready ? 200 : 503,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/webhook') return handleWebhook(request, env, ctx);
    if (request.method === 'POST' && url.pathname === '/api/knowledge') return handleKnowledgeApi(request, env, ctx);
    if (request.method === 'GET' && url.pathname === '/api/config') return handlePublicConfig(env);
    if (request.method === 'GET' && url.pathname === '/health') return handleHealth(env);
    if (request.method === 'GET' && url.pathname === '/go') return handleRedirect(request, env, ctx);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('not found', { status: 404 });
  }
};
