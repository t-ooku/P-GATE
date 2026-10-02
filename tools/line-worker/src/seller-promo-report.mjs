// 2026-10-03 HOSHILU Seller「AI販促担当」月次レポート（指示書 §6-5）。
// 月初（JST 1 日 06:00 台の最初のサイクル）に前月分を type=REPORT で作り、契約者画面に置く。
// 載せるのは実測だけ。取れない数字は「計測不能」（null と理由）。Google 流入は Phase 4 まで計測不能。
// 来月の提案 3 つには数字を書かない。
import { internalMemberIds } from './growth-events.mjs';
import { dbAll, dbFirst, dbRun, hydrateProfile, jstMonthRange, jstParts, nowIso, parseJsonColumn, pilotSellerKeys, promoEnabled, promoId, promoMonthKey, promoPlansEnabled, recentPromoQuestions } from './seller-promo-store.mjs';

export const UNMEASURED = '計測不能';

export function previousMonthKey(now = new Date()) {
  const { year, month } = jstParts(now);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

async function safeCount(fn) {
  try { return await fn(); } catch { return null; }
}

export async function buildMonthlyReport(env, profile, monthKey, now = new Date()) {
  const db = env.PRODUCT_DB;
  const { from, to } = jstMonthRange(monthKey);
  const published = await dbAll(db, `SELECT type,published_target,published_url,published_at,created_at,approved_at FROM seller_promo_deliverables
    WHERE seller_key=?1 AND type<>'REPORT' AND status IN ('PUBLISHED','DELIVERED','CONFIRMING') AND published_at>=?2 AND published_at<?3 ORDER BY published_at`, profile.seller_key, from, to);
  const approved = published.filter((row) => row.approved_at && row.created_at);
  const approvalDays = approved.length
    ? Math.round(approved.reduce((sum, row) => sum + (Date.parse(row.approved_at) - Date.parse(row.created_at)) / 86400000, 0) / approved.length * 10) / 10
    : null;
  const internal = internalMemberIds(env);
  // HOSHILU 内の保存: 掲載パイロット（seller_listing_pilot_saves）に紐づく店だけ数えられる。内部会員は除く。
  const saves = profile.pilot_id ? await safeCount(async () => {
    const rows = await dbAll(db, `SELECT member_id FROM seller_listing_pilot_saves WHERE pilot_id=?1 AND saved_at>=?2 AND saved_at<?3`, profile.pilot_id, from, to);
    return rows.filter((row) => !internal.has(String(row.member_id))).length;
  }) : null;
  // 送客: 需要マッチの有効クリック（SELF・QA・BOT は記録時点で EXCLUDED）。
  const referrals = await safeCount(async () => Number((await dbFirst(db, `SELECT COUNT(*) AS n FROM seller_demand_match_clicks
    WHERE seller_key=?1 AND jst_month=?2 AND status='VALID'`, profile.seller_key, monthKey))?.n || 0));
  const questions = await recentPromoQuestions(db, profile.seller_key, now, 20);
  const usedEvidence = new Set();
  for (const row of await dbAll(db, `SELECT payload FROM seller_promo_deliverables WHERE seller_key=?1 AND type='IMPROVEMENT' AND created_at>=?2 AND created_at<?3`,
    profile.seller_key, from, to)) for (const id of parseJsonColumn(row.payload, {})?.evidence || []) usedEvidence.add(id);
  const proposals = questions.filter((q) => !usedEvidence.has(q.id)).slice(0, 3)
    .map((q) => `お客様の「${String(q.text).replace(/[0-9０-９]+/gu, '〇').slice(0, 60)}」という疑問に、記事か商品ページで答える`);
  while (proposals.length < 3) {
    proposals.push(['商品写真の説明（使う場面・大きさの比べ方）を商品ページに足す', 'よくある質問を商品ページの下にまとめる', '過去の記事で反応のあったテーマを別の商品で書く'][proposals.length]);
  }
  return {
    month: monthKey,
    published_count: published.length,
    published_by_type: published.reduce((acc, row) => ({ ...acc, [row.type]: (acc[row.type] || 0) + 1 }), {}),
    approval_days_avg: approvalDays ?? UNMEASURED,
    published_urls: published.map((row) => row.published_url).filter(Boolean).slice(0, 50),
    hoshilu: {
      saves: saves ?? UNMEASURED,
      notifications: UNMEASURED,
      referrals: referrals ?? UNMEASURED
    },
    google_traffic: UNMEASURED,
    proposals,
    note: '売上や順位は約束しません。作ったもの・公開したもの・数字をそのまま報告しています。'
  };
}

export async function createMonthlyReport(env, profile, monthKey, now = new Date()) {
  const db = env.PRODUCT_DB;
  const existing = await dbFirst(db, `SELECT id FROM seller_promo_deliverables WHERE seller_key=?1 AND week_key=?2 AND type='REPORT'`, profile.seller_key, monthKey);
  if (existing) return { id: existing.id, created: false };
  const report = await buildMonthlyReport(env, profile, monthKey, now);
  const id = promoId('spd');
  const at = nowIso(now);
  await dbRun(db, `INSERT INTO seller_promo_deliverables(id,job_id,seller_key,week_key,type,version,status,payload,qa,published_target,published_at,created_at,updated_at)
    VALUES(?1,'',?2,?3,'REPORT',1,'DELIVERED',?4,'{}','SELLER_SCREEN',?5,?5,?5) ON CONFLICT(seller_key,week_key,type,version) DO NOTHING`,
  id, profile.seller_key, monthKey, JSON.stringify(report), at);
  return { id, created: true, report };
}

export function monthlyReportDue(now = new Date()) {
  const jst = jstParts(now);
  return jst.day === 1 && jst.hour === 6 && jst.minute < 15;
}

// isRunnable は週次ジョブと同じ対象判定（販売 ON のときは有効な Light/Standard 契約がある店だけ）。scheduler から渡す。
export async function runMonthlyReportCycle(env, now = new Date(), isRunnable = null) {
  if (!promoEnabled(env) || !monthlyReportDue(now)) return { skipped: true };
  const monthKey = previousMonthKey(now);
  const pilots = pilotSellerKeys(env);
  const profiles = (await dbAll(env.PRODUCT_DB, `SELECT * FROM seller_promo_profiles WHERE status='ACTIVE' LIMIT 500`)).map(hydrateProfile)
    .filter((p) => (promoPlansEnabled(env) ? ['LIGHT', 'STANDARD'].includes(p.plan) || p.qa || pilots.has(p.seller_key) : p.qa || pilots.has(p.seller_key)));
  let created = 0;
  for (const profile of profiles) {
    if (isRunnable && !await isRunnable(env, profile, now)) continue;
    if ((await createMonthlyReport(env, profile, monthKey, now)).created) created += 1;
  }
  return { month: monthKey, created, month_key_now: promoMonthKey(now) };
}
