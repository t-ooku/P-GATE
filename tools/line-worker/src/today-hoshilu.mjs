// 2026-09-21 指示書 §37「今日のHOSHILU」・§38「通知を乱発しない」。
//
// §38 の方針: 通知は原則「今日のホシル」としてまとめる。緊急性の高いものだけ即時。
// ここで言う緊急とは「待っていた本人が、今動かないと機会を逃すこと」だけに限る。
//   ・希望価格まで下がった（値下がり待ちの達成）
//   ・探していた条件の商品が出た（探し中の一致）
// それ以外——補充が近い、セールが始まった、クーポンが出た、新着が増えた——は、
// 1日1回まとめて出す。押し出しはせず、開いたときに見える場所に置く。
//
// 出す中身は保存済みの事実だけ。人数・価格・日数をここで作らない。
// 数えられないものは 0 と書かず、その節ごと出さない（§30 架空件数は禁止）。

import { readMemberSession } from './member-auth.mjs';
import { usualState, USUAL_STATE_LABELS_JA, observedPriceByProductKey } from './member-usual.mjs';

// 即時に出してよい通知。ここに無いものは「今日のホシル」へまとめる。
// PRICE_OFFER_MATCH は「希望価格に届いた」と同じ意味なので、これも即時に出す。
export const URGENT_EVENT_TYPES = Object.freeze(['TARGET_PRICE_REACHED', 'SHOP_DEMAND_MATCH', 'PRICE_OFFER_MATCH']);
// まとめる側。存在は知っているが、単独で押し出さない。
export const DIGEST_EVENT_TYPES = Object.freeze(['USUAL_DUE', 'PRICE_DROP', 'SALE_START', 'COUPON', 'RESTOCK', 'INSIGHT_NEW_MATCH']);

export function shouldSendImmediately(eventType) {
  return URGENT_EVENT_TYPES.includes(String(eventType || ''));
}

// §38: まとめる対象を1日1通に抑える。既に今日まとめて出していれば、もう出さない。
export function digestDue(lastDigestAt, now = Date.now()) {
  const last = Date.parse(String(lastDigestAt || ''));
  if (!Number.isFinite(last)) return true;
  // 同じ日（JST）に2通目を出さない。24時間ではなく暦日で見るのは、
  // 「毎日変わる」ものだから（§37）。
  const day = (time) => new Date(time + 9 * 3_600_000).toISOString().slice(0, 10);
  return day(last) !== day(now);
}

const DAY_MS = 86_400_000;

// 「そろそろ」以降のものだけを、近い順に。残り日数と状態はサーバーの判定をそのまま使う。
export function usualSection(items = [], now = Date.now()) {
  const rows = [];
  for (const item of items) {
    if (String(item?.status || 'ACTIVE') !== 'ACTIVE') continue;
    const { state, days_left: daysLeft } = usualState(item?.next_due_at, item?.cycle_days, now);
    if (state !== 'SOON' && state !== 'NEARLY' && state !== 'BUY_NOW') continue;
    rows.push({
      usual_id: String(item.usual_id || ''),
      product_name: String(item.product_name || ''),
      image_url: String(item.image_url || ''),
      state,
      state_label: USUAL_STATE_LABELS_JA[state] || '',
      days_left: daysLeft
    });
  }
  rows.sort((a, b) => a.days_left - b.days_left);
  return rows.slice(0, 10);
}

// 値下がり待ちのうち、実測できた価格が希望価格より下がったもの。
// 観測値が無ければ何も言わない（「下がっていない」とも言わない）。
export function priceSection(wishes = []) {
  const rows = [];
  for (const wish of wishes) {
    const target = Number(wish?.target_price_jpy);
    const current = Number(wish?.last_price_jpy);
    if (!Number.isFinite(target) || target <= 0) continue;
    if (!Number.isFinite(current) || current <= 0) continue;
    if (current > target) continue;
    rows.push({
      wish_id: String(wish.wish_id || ''),
      product_name: String(wish.target_product_name || ''),
      target_price_jpy: target,
      current_price_jpy: current,
      difference_jpy: target - current,
      observed_at: String(wish.last_price_observed_at || '')
    });
  }
  rows.sort((a, b) => b.difference_jpy - a.difference_jpy);
  return rows.slice(0, 10);
}

// 探し中のうち、この24時間で一致がついたもの。
export function matchedSection(demands = [], now = Date.now()) {
  const since = now - DAY_MS;
  const rows = [];
  for (const demand of demands) {
    const matchedAt = Date.parse(String(demand?.matched_at || ''));
    if (!Number.isFinite(matchedAt) || matchedAt < since) continue;
    rows.push({
      demand_id: String(demand.demand_id || ''),
      query: String(demand.query_text || ''),
      level: String(demand.matched_level || ''),
      matched_at: String(demand.matched_at || '')
    });
  }
  rows.sort((a, b) => (a.matched_at < b.matched_at ? 1 : -1));
  return rows.slice(0, 10);
}

// §37「今日のHOSHILU」。中身が1つも無ければ sections は空。
// 空のときに「今日は何もありません」以外の言葉を足さない（無いものを作らない）。
export function buildTodaysHoshilu({ usual = [], wishes = [], demands = [], now = Date.now() } = {}) {
  const sections = [];
  const usualRows = usualSection(usual, now);
  if (usualRows.length) sections.push({ kind: 'USUAL', title: 'そろそろ補充', items: usualRows });
  const priceRows = priceSection(wishes);
  if (priceRows.length) sections.push({ kind: 'PRICE', title: '希望価格まで下がりました', items: priceRows });
  const matchedRows = matchedSection(demands, now);
  if (matchedRows.length) sections.push({ kind: 'MATCHED', title: '探していた商品が出ました', items: matchedRows });
  return {
    sections,
    total: sections.reduce((count, section) => count + section.items.length, 0),
    generated_at: new Date(now).toISOString()
  };
}

const jsonResponse = (body, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

const isMissingTable = (error) => /no such table/iu.test(String(error?.message || error));
async function rowsOrEmpty(run) {
  try { const result = await run(); return result?.results || []; }
  catch (error) { if (isMissingTable(error)) return []; return []; }
}

// GET /api/member/today — 「今日のホシル」。保存済みの事実だけを読んで返す。書き込みはしない。
export async function handleMemberTodayRoute(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/member/today') return null;
  if (request.method !== 'GET') return jsonResponse({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  if (!env?.PRODUCT_DB) return jsonResponse({ ok: false, error: 'MEMBER_STORE_NOT_CONFIGURED' }, 503);
  const member = await readMemberSession(request, env);
  if (!member) return jsonResponse({ ok: false, error: 'MEMBER_LOGIN_REQUIRED' }, 401);

  const [usual, wishRows, demands, observed] = await Promise.all([
    rowsOrEmpty(() => env.PRODUCT_DB.prepare(
      `SELECT usual_id,product_key,product_name,image_url,cycle_days,next_due_at,status
       FROM member_usual_items WHERE member_id=?1 AND status='ACTIVE' ORDER BY next_due_at ASC LIMIT 100`
    ).bind(member.id).all()),
    rowsOrEmpty(() => env.PRODUCT_DB.prepare(
      `SELECT wish_id,
         COALESCE(json_extract(condition_snapshot,'$.price_condition.target_product_key'),'') AS target_product_key,
         COALESCE(json_extract(condition_snapshot,'$.price_condition.target_product_name'),'') AS target_product_name,
         CAST(COALESCE(json_extract(condition_snapshot,'$.price_condition.target_price_jpy'),0) AS INTEGER) AS target_price_jpy
       FROM member_wishes
       WHERE member_id=?1 AND archived_at IS NULL
         AND json_extract(condition_snapshot,'$.price_condition.target_price_jpy') > 0
       LIMIT 100`
    ).bind(member.id).all()),
    rowsOrEmpty(() => env.PRODUCT_DB.prepare(
      `SELECT demand_id,query_text,matched_at,matched_level FROM shop_demand_requests
       WHERE member_id=?1 AND status='MATCHED' ORDER BY matched_at DESC LIMIT 20`
    ).bind(member.id).all()),
    observedPriceByProductKey(env, member.id)
  ]);

  // 観測できた価格だけを乗せる。取れていない行は、価格の話をしないまま残す。
  const wishes = wishRows.map((row) => {
    const price = observed.get(String(row.target_product_key || '').trim());
    return { ...row, last_price_jpy: price?.current_price_jpy ?? null, last_price_observed_at: price?.current_price_observed_at || '' };
  });

  return jsonResponse({ ok: true, ...buildTodaysHoshilu({ usual, wishes, demands }) });
}
