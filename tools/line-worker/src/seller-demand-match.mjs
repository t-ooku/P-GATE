// 2026-09-21 大隆さん決定「クリック課金をやめる。料金は月額だけ。計測は残す」
//
// もともと Demand Match Click は 1有効クリック 50円だった。これを **やめた**。
// 理由は3つ、いずれも実装に効く:
//   1. 通知が押されるほど儲かる仕組みは、§38「通知を乱発しない」と利益が逆を向く
//   2. クリックは価値ではない。価値は売れたこと。売れた数はまだ取れていない
//   3. 残高が無い Seller の需要マッチを止めていたため、課金していないのに機会を止めていた
// 料金は HOSHILU Seller 月額4,980円だけ。ここから先、この経路でお金は動かない。
//
// ただし **計測は残す**。将来もし従量課金を考えるなら、1クリックが何を生んだかを
// 数字で見てから決める必要がある。そのための行を今から貯める。
//   ユーザーが探す → 一致なし → ホシっとく（探し中需要）→ Seller が需要に商品を登録
//   → HOSHILU が再照合 → 条件一致 → 本人へ通知（署名付きリンク）→ 本人が通知から商品を開く
// この最後の一歩だけを「有効クリック」として seller_demand_match_clicks に1行残す。
//
// 有効クリックの条件（課金しなくなった今も、数え方は変えない）:
//   - 通知に埋めた署名付きトークン（demand_id・asin・member）が検証できること
//   - bot / crawler / QA / 管理者 / Seller 本人 / 内部テストは除外（EXCLUDED として理由を残す）
//   - 同一需要 × 同一商品は JST 1 日 1 回（source_event_id で冪等）
// 署名は「誰の通知から来たか」を本人ハッシュで確かめるために残す（課金のためではない）。
import { jstDateKey, jstMonthKey } from './seller-billing.mjs';
import { isCrawlerUserAgent } from './growth-events.mjs';

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

export async function demandMatchMonthUsage(db, sellerKey, month) {
  try {
    const row = await db.prepare(`SELECT COUNT(*) AS clicks
      FROM seller_demand_match_clicks WHERE seller_key=?1 AND jst_month=?2 AND status='VALID'`).bind(sellerKey, month).first();
    return { clicks: Number(row?.clicks || 0) };
  } catch { return { clicks: 0 }; }
}

// 契約者画面: 通知した需要・有効クリック・除外件数だけ。金額も予算も出さない（月額だけなので）。
export async function demandMatchSummary(env, sellerKey, now = new Date()) {
  const db = env.PRODUCT_DB;
  const month = jstMonthKey(now);
  const usage = await demandMatchMonthUsage(db, sellerKey, month);
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
  // charged: false を必ず返す。画面が「いくらかかるか」を書けないようにする。
  return { month, charged: false, notified, valid_clicks: usage.clicks, excluded_clicks: excluded };
}

// 商品ページが署名付きリンクで開かれた時に呼ぶ。判定結果を必ず 1 行残す（同じ日の同じ需要×商品は 1 行）。
// **お金は動かさない。** amount_jpy は常に 0。
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
  const month = jstMonthKey(now);
  const status = reasons.length ? 'EXCLUDED' : 'VALID';
  const reason = reasons[0] || '';
  const clickId = crypto.randomUUID();
  // amount_jpy は 0 固定。amount_jpy / settled は課金をやっていた頃の名残の列で、もう意味を持たない。
  // 列を落とすのは不可逆なので（§54）、ここでは書き込みを 0 / 'PENDING' に固定するだけにする。
  const inserted = await db.prepare(`INSERT INTO seller_demand_match_clicks
    (click_id,source_event_id,seller_key,demand_id,demand_key,asin,product_url,member_hash,notification_id,amount_jpy,status,reason,settled,jst_month,occurred_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,0,?10,?11,'PENDING',?12,?13) ON CONFLICT(source_event_id) DO NOTHING`)
    .bind(clickId, sourceEventId, claim.seller_key, claim.demand_id, String(demand.demand_key || ''), claim.asin, clean(productUrl, 500), claim.member_hash,
      clean(notificationId || demand.notification_id, 80), status, reason, month, nowIso).run();
  if (Number(inserted?.meta?.changes || 0) !== 1) return { recorded: false, reason: 'DUPLICATE', status: 'EXCLUDED', seller_key: claim.seller_key, demand_id: claim.demand_id };
  return { recorded: true, status, reason, charged: false, amount_jpy: 0, seller_key: claim.seller_key, demand_id: claim.demand_id, asin: claim.asin };
}

// /api/seller/demand-match（GET: 集計のみ）。予算上限の設定は廃止した（上限を置く支出が無い）。
export async function handleSellerDemandMatchRoutes(request, env, seller) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/seller/demand-match')) return null;
  const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
  if (!seller?.seller_key) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
  if (!env.PRODUCT_DB) return json({ ok: false, error: 'NO_DB' }, 503);
  if (request.method === 'GET' && url.pathname === '/api/seller/demand-match') {
    return json({ ok: true, demand_match: await demandMatchSummary(env, seller.seller_key) });
  }
  return json({ ok: false, error: 'NOT_FOUND' }, 404);
}
