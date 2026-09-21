// 2026-09-21 指示書 §40「無料3か月終了時」。
//
// 無料期間が終わる前に、その3か月で実際に何が起きたかを返す。
// 見てから続けるかを決めてもらうためのものなので、**数字を作らない**ことが全て。
//   ・取れた数字だけを出す。取れなかった項目は 0 ではなく「計測不能」と返す（§30・主幹指示書）
//   ・「見込み売上」「推定効果」は出さない。クリックは売上ではない
//   ・出すのは自分のショップの数字だけ。他社の数字も、ユーザーの個人情報も出さない
//
// 期間は、無料が終わる日（trial_end_at）から 3 か月さかのぼった範囲。
// まだ無料期間の記録が無い口座には、レポート自体を出さない（勝手に期間を決めない）。

import { readSellerSession } from './seller-auth.mjs';

export const FREE_MONTHS = 3;

const jsonResponse = (body, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });

// 無料期間の範囲。trial_end_at が無ければ null（期間を推測しない）。
export function freePeriodWindow(trialEndAt, { months = FREE_MONTHS } = {}) {
  const end = Date.parse(String(trialEndAt || ''));
  if (!Number.isFinite(end)) return null;
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - months);
  return { start_at: start.toISOString(), end_at: new Date(end).toISOString(), months };
}

// 取れた数字だけを並べる。value が null の項目は「計測不能」として扱う。
// ここで 0 を入れてはいけない（0件だったのか、数えられなかったのかが区別できなくなる）。
export const REPORT_METRICS = Object.freeze([
  { key: 'shop_views', label: 'SHOP訪問', note: '端末が確認できた閲覧だけ。内部テスト（QA）は除いています' },
  { key: 'product_clicks', label: 'モールへの送客', note: 'クリック数です。売上・注文件数ではありません' },
  { key: 'searching_demand', label: 'あなたの商品に関わる探し中需要', note: '匿名集計。5人未満の需要は含みません' },
  { key: 'demand_offers', label: '需要への商品登録', note: 'HOSHILUが条件を再判定して一致したもの' },
  { key: 'demand_notifications', label: '探していた人への通知', note: '本人が許可した経路だけに送ったもの' },
  { key: 'demand_match_clicks', label: 'Demand Match（有効クリック）', note: '料金はかかりません。除外分は含みません' }
]);

export function summarizeFreePeriod(counts = {}) {
  const metrics = REPORT_METRICS.map((metric) => {
    const raw = counts[metric.key];
    const measurable = Number.isFinite(Number(raw)) && raw !== null && raw !== undefined;
    return {
      key: metric.key,
      label: metric.label,
      note: metric.note,
      measurable,
      // 計測不能のときは value を持たせない。画面が 0 と書けないようにする。
      ...(measurable ? { value: Math.max(0, Math.round(Number(raw))) } : {})
    };
  });
  const measured = metrics.filter((metric) => metric.measurable);
  return {
    metrics,
    measurable_count: measured.length,
    // 「1つも数えられなかった」ことを、画面がはっきり言えるように返す
    fully_measurable: measured.length === metrics.length
  };
}

// 数えられなければ null を返す（0 にしない）。1系統が落ちても他を止めない。
async function countOrNull(db, sql, params = []) {
  if (!db?.prepare) return null;
  try {
    const row = await db.prepare(sql).bind(...params).first();
    if (!row) return null;
    const value = Number(row.n);
    return Number.isFinite(value) ? value : null;
  } catch { return null; }
}

export async function freePeriodCounts(env, { sellerKey, slugs = [], sellerIds = [], window }) {
  const db = env?.PRODUCT_DB;
  if (!db || !window) return {};
  const { start_at: start, end_at: end } = window;
  const slugList = slugs.filter(Boolean).slice(0, 50);
  const idList = sellerIds.filter(Boolean).slice(0, 50);
  const slugMarks = slugList.map((_, index) => `?${index + 3}`).join(',');
  const idMarks = idList.map((_, index) => `?${index + 3}`).join(',');

  const [shopViews, productClicks, searchingDemand, demandOffers, demandNotifications, demandMatchClicks] = await Promise.all([
    slugList.length
      // shop_viewed は HTML 配信時の記録で、閲覧者とクローラを区別できない。
      // 端末が確認した shop_view_confirmed だけを数える（数えられない分を実数に混ぜない）。
      ? countOrNull(db, `SELECT COUNT(DISTINCT session_id) AS n FROM growth_events
          WHERE event_type='shop_view_confirmed' AND campaign IN (${slugMarks})
            AND occurred_at>=?1 AND occurred_at<?2 AND traffic_class<>'QA' AND session_id<>''`, [start, end, ...slugList])
      : null,
    idList.length
      ? countOrNull(db, `SELECT COUNT(*) AS n FROM outbound_commerce_events
          WHERE seller_id IN (${idMarks}) AND occurred_at>=?1 AND occurred_at<?2`, [start, end, ...idList])
      : null,
    countOrNull(db, `SELECT COUNT(*) AS n FROM shop_demand_requests
      WHERE matched_seller_key=?3 AND created_at>=?1 AND created_at<?2`, [start, end, sellerKey]),
    countOrNull(db, `SELECT COUNT(*) AS n FROM shop_demand_requests
      WHERE matched_seller_key=?3 AND status='MATCHED' AND matched_at>=?1 AND matched_at<?2`, [start, end, sellerKey]),
    countOrNull(db, `SELECT COUNT(*) AS n FROM shop_demand_requests
      WHERE matched_seller_key=?3 AND notification_id<>'' AND matched_at>=?1 AND matched_at<?2`, [start, end, sellerKey]),
    countOrNull(db, `SELECT COUNT(*) AS n FROM seller_demand_match_clicks
      WHERE seller_key=?3 AND status='VALID' AND occurred_at>=?1 AND occurred_at<?2`, [start, end, sellerKey])
  ]);

  return {
    shop_views: shopViews,
    product_clicks: productClicks,
    searching_demand: searchingDemand,
    demand_offers: demandOffers,
    demand_notifications: demandNotifications,
    demand_match_clicks: demandMatchClicks
  };
}

// GET /api/seller/free-period-report — 契約者本人のぶんだけ。読み取り専用。
export async function handleSellerFreePeriodReportRoute(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/seller/free-period-report') return null;
  if (request.method !== 'GET') return jsonResponse({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  const seller = await readSellerSession(request, env);
  if (!seller?.seller_key) return jsonResponse({ ok: false, error: 'UNAUTHORIZED' }, 401);
  const db = env?.PRODUCT_DB;
  if (!db) return jsonResponse({ ok: true, available: false, reason: 'NOT_MEASURABLE' });

  let account = null;
  try {
    account = await db.prepare(
      'SELECT trial_end_at,plan,subscription_status,tenants FROM seller_billing_accounts WHERE seller_key=?1'
    ).bind(seller.seller_key).first();
  } catch { account = null; }

  const window = freePeriodWindow(account?.trial_end_at);
  // 無料期間の記録が無ければレポートを出さない。期間をこちらで決めない。
  if (!window) return jsonResponse({ ok: true, available: false, reason: 'NO_TRIAL_RECORD' });

  let slugs = [];
  let sellerIds = [];
  try {
    const rows = await db.prepare('SELECT slug FROM seller_shops WHERE seller_key=?1 LIMIT 50').bind(seller.seller_key).all();
    slugs = (rows?.results || []).map((row) => String(row.slug || '')).filter(Boolean);
  } catch { slugs = []; }
  // 送客は marketplace_offers の seller_id 単位で記録されている。契約店舗から引く。
  const tenants = (() => {
    try { const parsed = JSON.parse(account?.tenants || '[]'); return Array.isArray(parsed) ? parsed.map(String).filter(Boolean).slice(0, 20) : []; }
    catch { return []; }
  })();
  if (tenants.length) {
    try {
      const marks = tenants.map((_, index) => `?${index + 1}`).join(',');
      const rows = await db.prepare(
        `SELECT DISTINCT seller_id FROM marketplace_offers WHERE tenant IN (${marks}) AND seller_id<>'' LIMIT 50`
      ).bind(...tenants).all();
      sellerIds = (rows?.results || []).map((row) => String(row.seller_id || '')).filter(Boolean);
    } catch { sellerIds = []; }
  }

  const counts = await freePeriodCounts(env, { sellerKey: seller.seller_key, slugs, sellerIds, window });
  return jsonResponse({
    ok: true,
    available: true,
    window,
    monthly_price_jpy: 4980,
    ...summarizeFreePeriod(counts)
  });
}
