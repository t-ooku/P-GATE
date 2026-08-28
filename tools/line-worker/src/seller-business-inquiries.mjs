import { authorizeAdminRequest } from './admin-auth.mjs';

const TYPES = new Set(['CONSULTATION', 'ACCOUNT_APPLICATION']);
const ORGANIZATION_TYPES = new Set(['MAKER', 'SELLER', 'BOTH', 'OTHER']);
const ORDER_RANGES = new Set(['', 'BEFORE_LAUNCH', '1_49', '50_199', '200_999', '1000_PLUS']);
const PLAN_INTERESTS = new Set(['', 'NATURAL_LISTING', 'PRIORITY_LISTING', 'BUSINESS', 'API', 'UNDECIDED']);
const PAYMENT_PREFERENCES = new Set(['', 'CARD', 'BANK_TRANSFER', 'INVOICE', 'UNDECIDED']);
const MARKETPLACES = new Set(['AMAZON', 'RAKUTEN', 'YAHOO', 'QOO10', 'OWN_STORE', 'OTHER']);

function clean(value, max) {
  return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/gu, '').slice(0, max);
}

function json(value, status = 200) {
  return Response.json(value, { status, headers: {
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff'
  } });
}

function sameOrigin(request) {
  try { return new URL(request.headers.get('origin')).origin === new URL(request.url).origin; }
  catch { return false; }
}

async function verifyTurnstile(request, env, token) {
  if (typeof env.TURNSTILE_VERIFY === 'function') return env.TURNSTILE_VERIFY(token);
  const secret = String(env.TURNSTILE_SECRET_KEY || '');
  if (!secret || !token) return false;
  const body = new URLSearchParams({ secret, response: clean(token, 2048) });
  const remoteIp = clean(request.headers.get('cf-connecting-ip'), 64);
  if (remoteIp) body.set('remoteip', remoteIp);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body, redirect: 'manual', signal: controller.signal
    });
    const result = await response.json();
    return response.ok && result.success === true;
  } catch { return false; } finally { clearTimeout(timer); }
}

function httpsUrl(value) {
  const raw = clean(value, 500);
  if (!raw) return '';
  try { const url = new URL(raw); return url.protocol === 'https:' ? url.toString() : ''; }
  catch { return ''; }
}

export function normalizeSellerBusinessInquiry(input = {}) {
  const inquiryType = clean(input.inquiry_type, 32).toUpperCase();
  const organizationType = clean(input.organization_type, 16).toUpperCase();
  const email = clean(input.contact_email, 320).toLowerCase();
  const rawStorefront = clean(input.storefront_url, 500);
  const marketplaces = [...new Set((Array.isArray(input.marketplaces) ? input.marketplaces : [])
    .map(value => clean(value, 24).toUpperCase()).filter(value => MARKETPLACES.has(value)))];
  const result = {
    inquiry_type: TYPES.has(inquiryType) ? inquiryType : '',
    organization_type: ORGANIZATION_TYPES.has(organizationType) ? organizationType : '',
    organization_name: clean(input.organization_name, 160),
    contact_name: clean(input.contact_name, 120),
    contact_email: email,
    storefront_url: httpsUrl(rawStorefront),
    marketplaces,
    monthly_order_range: ORDER_RANGES.has(input.monthly_order_range) ? input.monthly_order_range : '',
    plan_interest: PLAN_INTERESTS.has(input.plan_interest) ? input.plan_interest : '',
    payment_preference: PAYMENT_PREFERENCES.has(input.payment_preference) ? input.payment_preference : '',
    message: clean(input.message, 2000),
    privacy_consent: input.privacy_consent === true,
    company_website: clean(input.company_website, 200)
  };
  const errors = [];
  if (!result.inquiry_type) errors.push('INQUIRY_TYPE_REQUIRED');
  if (!result.organization_type) errors.push('ORGANIZATION_TYPE_REQUIRED');
  if (!result.organization_name) errors.push('ORGANIZATION_NAME_REQUIRED');
  if (!result.contact_name) errors.push('CONTACT_NAME_REQUIRED');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(result.contact_email)) errors.push('CONTACT_EMAIL_INVALID');
  if (rawStorefront && !result.storefront_url) errors.push('STOREFRONT_URL_INVALID');
  if (!result.privacy_consent) errors.push('PRIVACY_CONSENT_REQUIRED');
  return { value: result, errors };
}

export async function createSellerBusinessInquiry(env, input, now = new Date()) {
  const { value, errors } = normalizeSellerBusinessInquiry(input);
  if (value.company_website) return { accepted: true, inquiry_id: '' };
  if (errors.length) return { accepted: false, errors };
  const id = `SBI_${crypto.randomUUID()}`;
  const timestamp = now.toISOString();
  await env.PRODUCT_DB.prepare(`INSERT INTO seller_business_inquiries
    (inquiry_id,inquiry_type,organization_type,organization_name,contact_name,contact_email,
     storefront_url,marketplaces,monthly_order_range,plan_interest,payment_preference,message,
     status,source,created_at,updated_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'NEW','FOR_SELLERS',?13,?13)`)
    .bind(id, value.inquiry_type, value.organization_type, value.organization_name,
      value.contact_name, value.contact_email, value.storefront_url, JSON.stringify(value.marketplaces),
      value.monthly_order_range, value.plan_interest, value.payment_preference, value.message, timestamp).run();
  return { accepted: true, inquiry_id: id };
}

export async function handleSellerBusinessInquiryRoutes(request, env) {
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/api/seller-business/inquiries') {
    if (!sameOrigin(request)) return json({ ok: false, error: 'ORIGIN_REQUIRED' }, 403);
    if (!env.PRODUCT_DB) return json({ ok: false, error: 'INQUIRY_STORE_UNAVAILABLE' }, 503);
    const size = Number(request.headers.get('content-length') || 0);
    if (size > 16_384) return json({ ok: false, error: 'REQUEST_TOO_LARGE' }, 413);
    let input;
    try { input = await request.json(); } catch { return json({ ok: false, error: 'INVALID_JSON' }, 400); }
    if (!await verifyTurnstile(request, env, input.turnstile_token)) {
      return json({ ok: false, error: 'TURNSTILE_FAILED' }, 403);
    }
    const result = await createSellerBusinessInquiry(env, input);
    if (!result.accepted) return json({ ok: false, error: 'VALIDATION_FAILED', fields: result.errors }, 400);
    return json({ ok: true, inquiry_id: result.inquiry_id, status: 'RECEIVED' }, 201);
  }
  if (request.method === 'GET' && url.pathname === '/api/admin/seller-business/inquiries') {
    if (!await authorizeAdminRequest(request, env)) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
    if (!env.PRODUCT_DB) return json({ ok: false, error: 'INQUIRY_STORE_UNAVAILABLE' }, 503);
    const result = await env.PRODUCT_DB.prepare(`SELECT inquiry_id,inquiry_type,organization_type,
      organization_name,contact_name,contact_email,storefront_url,marketplaces,monthly_order_range,
      plan_interest,payment_preference,message,status,created_at,updated_at
      FROM seller_business_inquiries ORDER BY created_at DESC LIMIT 100`).all();
    return json({ ok: true, inquiries: result.results || [] });
  }
  return null;
}
