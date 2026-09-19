// 2026-09-19 大隆さん指示「HOSHILU Seller収益化・需要マッチ改修」§2〜§4・§13〜§14
//
// Demand Match Click = 「その商品を探していた人を HOSHILU が Seller へ戻した時」だけ 1有効クリック 50円。
//   ユーザーが探す → 一致なし → ホシっとく（探し中需要）→ Seller が需要に商品を登録 → HOSHILU が再照合
//   → 条件一致 → HOSHILU が本人へ通知（署名付きリンク）→ 本人が通知から商品ページを開く ← ここで初めて 50円
// 通常の商品クリック・検索流入・ページ再読み込み・通知を開かずに来た流入には課金しない。
//
// 有効クリックの条件（§3）:
//   - 通知に埋めた署名付きトークン（demand_id・asin・member）が検証できること
//   - bot / crawler / QA / 管理者 / Seller 本人 / 内部テストは除外（EXCLUDED として記録は残す）
//   - 同一需要 × 同一商品は JST 1 日 1 回（source_event_id で冪等）
//   - 予算上限（seller_demand_match_budgets、初期値 3,000円/月）を超える分は課金しない（BUDGET_CAP）
// 課金判定は seller_demand_match_clicks に必ず行として残す（VALID / EXCLUDED と固定理由）。
import { chargeReferralFromWallet, getBillingAccount, jstDateKey, jstMonthKey } from './seller-billing.mjs';
import { isCrawlerUserAgent } from './growth-events.mjs';

export const DEMAND_MATCH_CLICK_JPY = 50;
export const DEMAND_MATCH_DEFAULT_CAP_JPY = 3000;
export const DEMAND_MATCH_CAP_PRESETS_JPY = Object.freeze([0, 1000, 3000, 5000, 10000]);
export const DEMAND_MATCH_CAP_MAX_JPY = 300000;
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();

function clean(value, max = 120) {
  return String(value ?? '').normalize('NFKC').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function b64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromB64url(value) {
  const padded = String(value || '').replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (String(value || '').length % 4)) % 4);
  try { return atob(padded); } catch { return ''; }
}
function secretOf(env = {}) {
  const value = String(env.MEMBER_SESSION_SECRET || env.LINK_SIGNING_SECRET || '');
  if (value.length < 32) throw new Error('DEMAND_MATCH_SECRET_REQUIRED');
  return value;
}
async function hmac(env, text) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secretOf(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text))));
}
export async function memberHash(env, memberId) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`hoshilu-demand-match:${secretOf(env)}:${String(memberId || '')}`));
  return b64url(new Uint8Array(digest)).slice(0, 32);
}

// 通知に埋める署名付きトークン。member_id は入れず、片方向ハッシュだけを持つ（URL から個人を辿れない）。
export async function signDemandMatchToken(env, { demandId, asin, memberId, sellerKey, nowSeconds = Math.floor(Date.now() / 1000) }) {
  const payload = {
    d: clean(demandId, 64), a: clean(asin, 20).toUpperCase(), m: await memberHash(env, memberId), s: clean(sellerKey, 120),
    exp: nowSeconds + TOKEN_TTL_SECONDS
  };
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const signature = await hmac(env, body);
  return `${body}.${signature}`;
}

export async function verifyDemandMatchToken(env, token, nowSeconds = Math.floor(Date.now() / 1000)) {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) return null;
  let expected = '';
  try { expected = await hmac(env, body); } catch { return null; }
  if (expected.length !== signature.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (diff !== 0) return null;
  let payload;
  try { payload = JSON.parse(fromB64url(body)); } catch { return null; }
  if (!payload?.d || !payload?.a || !payload?.m || !payload?.s) return null;
  if (Number(payload.exp || 0) < nowSeconds) return null;
  return { demand_id: String(payload.d), asin: String(payload.a), member_hash: String(payload.m), seller_key: String(payload.s) };
}

export async function demandMatchProductUrl(env, { origin = 'https://hoshilu.app', slug, asin, demandId, memberId, sellerKey }) {
  const token = await signDemandMatchToken(env, { demandId, asin, memberId, sellerKey });
  return `${origin}/shop/${encodeURIComponent(slug)}/product/${encodeURIComponent(clean(asin, 20).toUpperCase())}?dm=${encodeURIComponent(token)}`;
}

export async function getDemandMatchBudget(db, sellerKey) {
  try {
    const row = await db.prepare('SELECT monthly_cap_jpy FROM seller_demand_match_budgets WHERE seller_key=?1').bind(sellerKey).first();
    if (row) return Number(row.monthly_cap_jpy || 0);
  } catch {}
  return DEMAND_MATCH_DEFAULT_CAP_JPY;
}

export function normalizeCapJpy(value) {
  const cap = Math.trunc(Number(value));
  if (!Number.isFinite(cap) || cap < 0 || cap > DEMAND_MATCH_CAP_MAX_JPY) throw new Error('CAP_INVALID');
  return cap;
}

export async function setDemandMatchBudget(db, sellerKey, capJpy, now = new Date().toISOString()) {
  const cap = normalizeCapJpy(capJpy);
  await db.prepare(`INSERT INTO seller_demand_match_budgets(seller_key,monthly_cap_jpy,updated_at) VALUES(?1,?2,?3)
    ON CONFLICT(seller_key) DO UPDATE SET monthly_cap_jpy=excluded.monthly_cap_jpy,updated_at=excluded.updated_at`).bind(sellerKey, cap, now).run();
  return cap;
}

export async function demandMatchMonthUsage(db, sellerKey, month) {
  const row = await db.prepare(`SELECT COUNT(*) AS clicks, COALESCE(SUM(amount_jpy),0) AS amount_jpy
    FROM seller_demand_match_clicks WHERE seller_key=?1 AND jst_month=?2 AND status='VALID'`).bind(sellerKey, month).first();
  return { clicks: Number(row?.clicks || 0), amount_jpy: Number(row?.amount_jpy || 0) };
}

// 契約者画面 §14: 通知数・有効クリック数・費用・予算を一目で。
export function demandMatchChargeEnabled(env = {}) {
  return String(env?.DEMAND_MATCH_CHARGE_ENABLED || '').trim().toLowerCase() === 'true';
}
// 2026-09-19 大隆さん決定: ITG（自社）のアカウントは無料。Demand Match Click は判定・件数を記録するが 0円（FREE_ACCOUNT）。
export function demandMatchFreeSellerKeys(env = {}) {
  return new Set(String(env?.DEMAND_MATCH_FREE_SELLER_KEYS || '').split(',').map((v) => v.trim()).filter(Boolean));
}
export function isDemandMatchFreeSeller(env, sellerKey) {
  return demandMatchFreeSellerKeys(env).has(String(sellerKey || ''));
}

export async function demandMatchSummary(env, sellerKey, now = new Date()) {
  const db = env.PRODUCT_DB;
  const month = jstMonthKey(now);
  const usage = await demandMatchMonthUsage(db, sellerKey, month);
  const cap = await getDemandMatchBudget(db, sellerKey);
  let excluded = 0;
  let notified = 0;
  try {
    const row = await db.prepare(`SELECT COUNT(*) AS n FROM seller_demand_match_clicks WHERE seller_key=?1 AND jst_month=?2 AND status='EXCLUDED'`).bind(sellerKey, month).first();
    excluded = Number(row?.n || 0);
  } catch {}
  try {
    const row = await db.prepare(`SELECT COUNT(*) AS n FROM shop_demand_requests WHERE matched_seller_key=?1 AND matched_at>=?2`).bind(sellerKey, `${month}-01`).first();
    notified = Number(row?.n || 0);
  } catch {}
  return {
    month, unit_jpy: DEMAND_MATCH_CLICK_JPY, charge_enabled: demandMatchChargeEnabled(env), free_account: isDemandMatchFreeSeller(env, sellerKey), notified, valid_clicks: usage.clicks, excluded_clicks: excluded,
    amount_jpy: usage.amount_jpy, cap_jpy: cap, cap_reached: cap > 0 ? usage.amount_jpy + DEMAND_MATCH_CLICK_JPY > cap : true,
    cap_presets_jpy: [...DEMAND_MATCH_CAP_PRESETS_JPY]
  };
}

// 商品ページが署名付きリンクで開かれた時に呼ぶ。判定結果を必ず 1 行残す（同じ日の同じ需要×商品は 1 行）。
export async function recordDemandMatchClick(env, {
  token, request, memberId = '', viewerSellerKey = '', viewerIsAdmin = false, trafficClass = 'ATTRIBUTED',
  productUrl = '', notificationId = '', now = new Date()
} = {}) {
  const db = env?.PRODUCT_DB;
  if (!db) return { recorded: false, reason: 'NO_DB' };
  const claim = await verifyDemandMatchToken(env, token, Math.floor(now.getTime() / 1000));
  if (!claim) return { recorded: false, reason: 'TOKEN_INVALID' };
  const nowIso = now.toISOString();
  const day = jstDateKey(now);
  const sourceEventId = `dm:${claim.demand_id}:${claim.asin}:${day}`;
  let demand = null;
  try { demand = await db.prepare('SELECT demand_id,demand_key,member_id,matched_seller_key,notification_id FROM shop_demand_requests WHERE demand_id=?1').bind(claim.demand_id).first(); } catch {}
  if (!demand) return { recorded: false, reason: 'DEMAND_NOT_FOUND' };
  const reasons = [];
  if (request && (request.method === 'HEAD' || isCrawlerUserAgent(request.headers?.get?.('user-agent') || ''))) reasons.push('BOT');
  if (trafficClass === 'QA') reasons.push('QA');
  if (viewerIsAdmin) reasons.push('ADMIN');
  if (viewerSellerKey && viewerSellerKey === claim.seller_key) reasons.push('SELF');
  if (!memberId) reasons.push('NOT_LOGGED_IN');
  else if ((await memberHash(env, memberId)) !== claim.member_hash || String(demand.member_id || '') !== String(memberId)) reasons.push('MEMBER_MISMATCH');
  if (String(demand.matched_seller_key || '') !== claim.seller_key) reasons.push('SELLER_MISMATCH');
  const account = await getBillingAccount(db, claim.seller_key);
  if (!account || account.status !== 'ACTIVE') reasons.push('ACCOUNT_NOT_ACTIVE');
  const month = jstMonthKey(now);
  let capReason = '';
  if (!reasons.length) {
    const cap = await getDemandMatchBudget(db, claim.seller_key);
    const usage = await demandMatchMonthUsage(db, claim.seller_key, month);
    if (usage.amount_jpy + DEMAND_MATCH_CLICK_JPY > cap) capReason = 'BUDGET_CAP';
  }
  const status = reasons.length || capReason ? 'EXCLUDED' : 'VALID';
  const free = status === 'VALID' && isDemandMatchFreeSeller(env, claim.seller_key);
  const reason = reasons[0] || capReason || (free ? 'FREE_ACCOUNT' : '');
  const amountJpy = status === 'VALID' && !free ? DEMAND_MATCH_CLICK_JPY : 0;
  const clickId = crypto.randomUUID();
  const inserted = await db.prepare(`INSERT INTO seller_demand_match_clicks
    (click_id,source_event_id,seller_key,demand_id,demand_key,asin,product_url,member_hash,notification_id,amount_jpy,status,reason,settled,jst_month,occurred_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'PENDING',?13,?14) ON CONFLICT(source_event_id) DO NOTHING`)
    .bind(clickId, sourceEventId, claim.seller_key, claim.demand_id, String(demand.demand_key || ''), claim.asin, clean(productUrl, 500), claim.member_hash,
      clean(notificationId || demand.notification_id, 80), amountJpy, status, reason, month, nowIso).run();
  if (Number(inserted?.meta?.changes || 0) !== 1) return { recorded: false, reason: 'DUPLICATE', status: 'EXCLUDED', seller_key: claim.seller_key, demand_id: claim.demand_id };
  let settled = 'PENDING';
  // 課金の開始は大隆さん判断（§54 価格変更）。無効の間も判定・件数は本番データで記録し、残高からは引かない。
  if (amountJpy > 0 && demandMatchChargeEnabled(env)) {
    const charged = await chargeReferralFromWallet(db, { sellerKey: claim.seller_key, amountJpy: DEMAND_MATCH_CLICK_JPY, sourceEventId, note: `Demand Match Click ${DEMAND_MATCH_CLICK_JPY}円`, now: nowIso });
    settled = charged ? 'WALLET' : 'PENDING';
    if (charged) await db.prepare(`UPDATE seller_demand_match_clicks SET settled='WALLET' WHERE click_id=?1`).bind(clickId).run();
  }
  return { recorded: true, status, reason, settled, amount_jpy: amountJpy, seller_key: claim.seller_key, demand_id: claim.demand_id, asin: claim.asin };
}

// /api/seller/demand-match（GET: 集計、PUT /budget: 予算上限）
export async function handleSellerDemandMatchRoutes(request, env, seller) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/seller/demand-match')) return null;
  const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
  if (!seller?.seller_key) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
  if (!env.PRODUCT_DB) return json({ ok: false, error: 'NO_DB' }, 503);
  if (request.method === 'GET' && url.pathname === '/api/seller/demand-match') {
    return json({ ok: true, demand_match: await demandMatchSummary(env, seller.seller_key) });
  }
  if (request.method === 'PUT' && url.pathname === '/api/seller/demand-match/budget') {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: 'BODY_INVALID' }, 400); }
    try {
      const cap = await setDemandMatchBudget(env.PRODUCT_DB, seller.seller_key, body?.monthly_cap_jpy);
      return json({ ok: true, monthly_cap_jpy: cap, demand_match: await demandMatchSummary(env, seller.seller_key) });
    } catch (error) {
      return json({ ok: false, error: String(error?.message || 'CAP_INVALID') }, 400);
    }
  }
  return json({ ok: false, error: 'NOT_FOUND' }, 404);
}
