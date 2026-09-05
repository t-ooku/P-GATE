// 2026-09-05 大隆さん指示: インフルエンサー（クリエイター）を直接募集する。
// /for-creators の応募・問い合わせフォームの受け口。セラー相談（seller-business-inquiries.mjs）と
// 同じ守り（同一Origin・16KiB・ハニーポット・Turnstile＋件数制限付きフォールバック）で受け、
// D1 creator_inquiries に保存し、大隆さんの Gmail（SELLER_INQUIRY_NOTIFY_EMAIL と同じ宛先）へ
// Resend で1通送る。通知に失敗しても応募自体は受け付ける。
import { authorizeAdminRequest } from './admin-auth.mjs';

const TYPES = new Set(['APPLY', 'REPORT_POST', 'QUESTION']);
const PLATFORMS = new Set(['INSTAGRAM', 'X', 'TIKTOK']);
const FOLLOWER_RANGES = new Set(['', 'UNDER_1000', '1000_4999', '5000_19999', '20000_99999', '100000_PLUS']);
const GENRES = new Set(['', 'MOM_KIDS', 'BEAUTY', 'FASHION', 'HOME_KITCHEN', 'GADGET', 'DEALS', 'OTHER']);

export const CREATOR_REWARDS_JPY = Object.freeze({ INSTAGRAM: 1500, X: 1000, TIKTOK: 1000 });

function clean(value, max) {
  return String(value || '').trim().replace(/\p{Cc}/gu, '').slice(0, max);
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

export function normalizeCreatorInquiry(input = {}) {
  const inquiryType = clean(input.inquiry_type, 24).toUpperCase();
  const email = clean(input.contact_email, 320).toLowerCase();
  const platforms = [...new Set((Array.isArray(input.platforms) ? input.platforms : [])
    .map(value => clean(value, 16).toUpperCase()).filter(value => PLATFORMS.has(value)))];
  const rawAccount = clean(input.account_url, 500);
  const rawPost = clean(input.post_url, 500);
  const result = {
    inquiry_type: TYPES.has(inquiryType) ? inquiryType : '',
    creator_name: clean(input.creator_name, 120),
    contact_email: email,
    platforms,
    account_url: httpsUrl(rawAccount),
    follower_range: FOLLOWER_RANGES.has(input.follower_range) ? input.follower_range : '',
    genre: GENRES.has(input.genre) ? input.genre : '',
    post_url: httpsUrl(rawPost),
    message: clean(input.message, 2000),
    terms_consent: input.terms_consent === true,
    privacy_consent: input.privacy_consent === true,
    company_website: clean(input.company_website, 200)
  };
  const errors = [];
  if (!result.inquiry_type) errors.push('INQUIRY_TYPE_REQUIRED');
  if (!result.creator_name) errors.push('CREATOR_NAME_REQUIRED');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(result.contact_email)) errors.push('CONTACT_EMAIL_INVALID');
  if (result.inquiry_type !== 'QUESTION' && !result.platforms.length) errors.push('PLATFORMS_REQUIRED');
  if (result.inquiry_type !== 'QUESTION' && !result.account_url) errors.push('ACCOUNT_URL_REQUIRED');
  if (rawAccount && !result.account_url) errors.push('ACCOUNT_URL_INVALID');
  if (result.inquiry_type === 'REPORT_POST' && !result.post_url) errors.push('POST_URL_REQUIRED');
  if (rawPost && !result.post_url) errors.push('POST_URL_INVALID');
  if (!result.terms_consent) errors.push('TERMS_CONSENT_REQUIRED');
  if (!result.privacy_consent) errors.push('PRIVACY_CONSENT_REQUIRED');
  return { value: result, errors };
}

const TYPE_LABELS = { APPLY: '応募', REPORT_POST: '投稿の報告', QUESTION: '質問' };

export function creatorInquiryNotificationText(id, value, timestamp, verified = true) {
  const labels = [
    ['受付ID', id],
    ['受付日時(UTC)', timestamp],
    ['確認欄', verified ? '通過' : '未通過(確認欄が動かない環境からの送信)'],
    ['種別', TYPE_LABELS[value.inquiry_type] || value.inquiry_type],
    ['名前・活動名', value.creator_name],
    ['メール', value.contact_email],
    ['媒体', value.platforms.length ? value.platforms.join(', ') : '(未入力)'],
    ['アカウントURL', value.account_url || '(未入力)'],
    ['フォロワー規模', value.follower_range || '(未入力)'],
    ['ジャンル', value.genre || '(未入力)'],
    ['投稿URL', value.post_url || '(未入力)']
  ];
  return [
    'HOSHILUのクリエイター募集フォームに新しい送信が届きました。',
    '',
    ...labels.map(([key, text]) => `${key}: ${text}`),
    '',
    '本文:',
    value.message || '(本文なし)',
    '',
    '報酬の目安(税抜): Instagram 1,500円 / X 1,000円 / TikTok 1,000円（投稿と認めた日の属する月の月末締め・翌月末払い・請求書に対する振込）',
    '一覧: https://hoshilu.app/api/admin/creators/inquiries'
  ].join('\n');
}

async function notifyCreatorInquiry(env, id, value, timestamp, verified = true) {
  const to = String(env.CREATOR_INQUIRY_NOTIFY_EMAIL || env.SELLER_INQUIRY_NOTIFY_EMAIL || '').trim();
  const from = String(env.MEMBER_EMAIL_FROM || '').trim();
  if (!to || !from || !String(env.RESEND_API_KEY || '').startsWith('re_')) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: `HOSHILU <${from}>`,
      to: [to],
      reply_to: value.contact_email,
      subject: `${verified ? '【HOSHILU】' : '【HOSHILU・要確認】'}クリエイター${TYPE_LABELS[value.inquiry_type] || ''}: ${value.creator_name}`,
      text: creatorInquiryNotificationText(id, value, timestamp, verified)
    }),
    redirect: 'manual'
  });
  return response.ok;
}

const FALLBACK_SOURCE = 'FOR_CREATORS_FALLBACK';
const FALLBACK_HOURLY_LIMIT = 3;
const FALLBACK_DAILY_LIMIT = 10;

export async function fallbackCreatorInquiryAllowed(env, now = new Date()) {
  if (!env.PRODUCT_DB) return false;
  const hourAgo = new Date(now.getTime() - 3600_000).toISOString();
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const result = await env.PRODUCT_DB.prepare(`SELECT
      SUM(CASE WHEN created_at>=?2 THEN 1 ELSE 0 END) AS last_hour,
      COUNT(*) AS last_day
    FROM creator_inquiries WHERE source=?1 AND created_at>=?3`)
    .bind(FALLBACK_SOURCE, hourAgo, dayAgo).all();
  const row = (result?.results || [])[0];
  return Number(row?.last_hour || 0) < FALLBACK_HOURLY_LIMIT && Number(row?.last_day || 0) < FALLBACK_DAILY_LIMIT;
}

export async function createCreatorInquiry(env, input, now = new Date(), options = {}) {
  const { value, errors } = normalizeCreatorInquiry(input);
  if (value.company_website) return { accepted: true, inquiry_id: '' };
  if (errors.length) return { accepted: false, errors };
  const verified = options.verified !== false;
  const source = verified ? 'FOR_CREATORS' : FALLBACK_SOURCE;
  const id = `CRI_${crypto.randomUUID()}`;
  const timestamp = now.toISOString();
  await env.PRODUCT_DB.prepare(`INSERT INTO creator_inquiries
    (inquiry_id,inquiry_type,creator_name,contact_email,platforms,account_url,follower_range,genre,
     post_url,message,status,source,created_at,updated_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'NEW',?11,?12,?12)`)
    .bind(id, value.inquiry_type, value.creator_name, value.contact_email, JSON.stringify(value.platforms),
      value.account_url, value.follower_range, value.genre, value.post_url, value.message, source, timestamp).run();
  let notified = false;
  try { notified = await notifyCreatorInquiry(env, id, value, timestamp, verified); } catch { notified = false; }
  return { accepted: true, inquiry_id: id, notified, verified };
}

export async function handleCreatorInquiryRoutes(request, env) {
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/api/creators/inquiries') {
    if (!sameOrigin(request)) return json({ ok: false, error: 'ORIGIN_REQUIRED' }, 403);
    if (!env.PRODUCT_DB) return json({ ok: false, error: 'INQUIRY_STORE_UNAVAILABLE' }, 503);
    const size = Number(request.headers.get('content-length') || 0);
    if (size > 16_384) return json({ ok: false, error: 'REQUEST_TOO_LARGE' }, 413);
    let input;
    try { input = await request.json(); } catch { return json({ ok: false, error: 'INVALID_JSON' }, 400); }
    const verified = await verifyTurnstile(request, env, input.turnstile_token);
    if (!verified && !await fallbackCreatorInquiryAllowed(env)) {
      return json({ ok: false, error: 'TURNSTILE_FAILED' }, 403);
    }
    const result = await createCreatorInquiry(env, input, new Date(), { verified });
    if (!result.accepted) return json({ ok: false, error: 'VALIDATION_FAILED', fields: result.errors }, 400);
    return json({ ok: true, inquiry_id: result.inquiry_id, status: 'RECEIVED', verified }, 201);
  }
  if (request.method === 'GET' && url.pathname === '/api/admin/creators/inquiries') {
    if (!await authorizeAdminRequest(request, env)) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
    if (!env.PRODUCT_DB) return json({ ok: false, error: 'INQUIRY_STORE_UNAVAILABLE' }, 503);
    const result = await env.PRODUCT_DB.prepare(`SELECT inquiry_id,inquiry_type,creator_name,contact_email,
      platforms,account_url,follower_range,genre,post_url,message,status,source,created_at,updated_at
      FROM creator_inquiries ORDER BY created_at DESC LIMIT 200`).all();
    return json({ ok: true, inquiries: result.results || [] });
  }
  return null;
}
