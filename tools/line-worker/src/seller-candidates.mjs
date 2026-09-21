// 2026-09-21 指示書 §35・§36「Seller営業を需要起点に」「Seller候補管理」。
//
// 未充足の需要 → その需要に応えられそうなセラー → 営業 → 返信 → 無料登録 →
// 商品連携 → DMC発生 → 有料化。この一本を1つの表で追う。
//
// 守ること:
//   ・入れるのは公開されている事業者向けの情報だけ（ショップ名・公開連絡先・商品URL）。
//     ユーザーの個人情報は入れない。需要は匿名キーと人数だけ
//   ・人数は記録した時点の実数。ここで作らない
//   ・段階の日付は実際にそうなった時だけ入れる。空は「まだ」であって 0 ではない
//   ・削除はしない。降りた相手は DECLINED にして履歴を残す（§54 不可逆操作を避ける）

import { authorizeAdminRequest } from './admin-auth.mjs';

export const CANDIDATE_STAGES = Object.freeze([
  'FOUND', 'CONTACTED', 'REPLIED', 'SIGNED_UP', 'PRODUCTS_LINKED', 'DMC_EARNED', 'PAID', 'DECLINED'
]);
export const CANDIDATE_STAGE_LABELS_JA = Object.freeze({
  FOUND: '候補', CONTACTED: '営業済', REPLIED: '返信あり', SIGNED_UP: '無料登録',
  PRODUCTS_LINKED: '商品連携', DMC_EARNED: 'DMC発生', PAID: '有料化', DECLINED: '見送り'
});
// 段階が進んだときに入れる日付の列。ここに無い段階は日付を持たない。
const STAGE_TIMESTAMP_COLUMN = Object.freeze({
  CONTACTED: 'contacted_at', REPLIED: 'replied_at', SIGNED_UP: 'signed_up_at',
  PRODUCTS_LINKED: 'products_linked_at', DMC_EARNED: 'dmc_earned_at',
  PAID: 'paid_at', DECLINED: 'declined_at'
});

const CONTROL = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`, 'gu');
const clean = (value, max) => String(value ?? '').normalize('NFKC')
  .replace(CONTROL, ' ').replace(/\s+/gu, ' ').trim().slice(0, max);
const httpsUrl = (value, max = 500) => {
  const text = clean(value, max);
  if (!text) return '';
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : '';
  } catch { return ''; }
};

export function normalizeStage(value) {
  const stage = String(value || '').trim().toUpperCase();
  return CANDIDATE_STAGES.includes(stage) ? stage : '';
}

// 候補1件。ショップ名が無ければ作らない（名前のない候補は追えない）。
export function normalizeCandidate(input = {}, { now = new Date().toISOString() } = {}) {
  const shopName = clean(input.shop_name, 120);
  if (shopName.length < 2) return null;
  const people = Math.trunc(Number(input.demand_people));
  return {
    demand_key: clean(input.demand_key, 160),
    demand_label: clean(input.demand_label, 160),
    demand_people: Number.isFinite(people) && people > 0 ? Math.min(people, 1_000_000) : 0,
    shop_name: shopName,
    contact_url: httpsUrl(input.contact_url),
    source_url: httpsUrl(input.source_url),
    product_url: httpsUrl(input.product_url),
    seller_key: clean(input.seller_key, 120),
    stage: normalizeStage(input.stage) || 'FOUND',
    note: clean(input.note, 400),
    created_at: now,
    updated_at: now
  };
}

// 段階ごとの残件。数えられないときは 0 と断定しない（呼び出し側が null を渡す）。
export function summarizeCandidates(rows) {
  if (!Array.isArray(rows)) return { measurable: false };
  const counts = Object.fromEntries(CANDIDATE_STAGES.map((stage) => [stage, 0]));
  for (const row of rows) {
    const stage = normalizeStage(row?.stage);
    if (stage) counts[stage] += 1;
  }
  const live = rows.length - counts.DECLINED;
  return {
    measurable: true,
    total: rows.length,
    live,
    counts,
    labels: CANDIDATE_STAGE_LABELS_JA
  };
}

const jsonResponse = (body, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });

const COLUMNS = `candidate_id,demand_key,demand_label,demand_people,shop_name,contact_url,source_url,
  product_url,seller_key,stage,contacted_at,replied_at,signed_up_at,products_linked_at,
  dmc_earned_at,paid_at,declined_at,note,created_at,updated_at`;

const missingTable = (error) => /no such table/iu.test(String(error?.message || error));

// GET  /api/admin/seller-candidates              一覧＋段階ごとの残件
// POST /api/admin/seller-candidates              候補を1件足す（既にあれば何もしない）
// PATCH /api/admin/seller-candidates/<id>        段階を進める／メモを直す
//
// 行は消さない。降りた相手は stage=DECLINED にして履歴を残す。
export async function handleSellerCandidateRoutes(request, env, authorize = authorizeAdminRequest) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/admin/seller-candidates')) return null;
  if (!await authorize(request, env)) return jsonResponse({ ok: false, error: 'UNAUTHORIZED' }, 401);
  const db = env?.PRODUCT_DB;
  if (!db) return jsonResponse({ ok: false, error: 'STORE_NOT_CONFIGURED' }, 503);
  const rest = url.pathname.slice('/api/admin/seller-candidates'.length).replace(/^\//u, '');
  const now = new Date().toISOString();

  if (request.method === 'GET' && !rest) {
    const stage = normalizeStage(url.searchParams.get('stage'));
    try {
      const result = stage
        ? await db.prepare(`SELECT ${COLUMNS} FROM seller_candidates WHERE stage=?1 ORDER BY updated_at DESC LIMIT 200`).bind(stage).all()
        : await db.prepare(`SELECT ${COLUMNS} FROM seller_candidates ORDER BY updated_at DESC LIMIT 200`).all();
      const items = result?.results || [];
      return jsonResponse({ ok: true, items, ...summarizeCandidates(items) });
    } catch (error) {
      // 表がまだ無いのと、数えられないのは同じ扱い。0 件とは言わない。
      if (missingTable(error)) return jsonResponse({ ok: true, items: [], measurable: false });
      return jsonResponse({ ok: false, error: 'CANDIDATES_READ_FAILED' }, 500);
    }
  }

  if (request.method === 'POST' && !rest) {
    const payload = await request.json().catch(() => null);
    const candidate = normalizeCandidate(payload || {}, { now });
    if (!candidate) return jsonResponse({ ok: false, error: 'CANDIDATE_SHOP_NAME_REQUIRED' }, 400);
    const id = crypto.randomUUID();
    try {
      // 同じ需要に同じショップを二重に入れない（既にあれば何もしない）。
      const result = await db.prepare(`INSERT OR IGNORE INTO seller_candidates
        (candidate_id,demand_key,demand_label,demand_people,shop_name,contact_url,source_url,
         product_url,seller_key,stage,created_at,updated_at)
        VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?11)`)
        .bind(id, candidate.demand_key, candidate.demand_label, candidate.demand_people,
          candidate.shop_name, candidate.contact_url, candidate.source_url,
          candidate.product_url, candidate.seller_key, candidate.stage, now).run();
      const added = Number(result?.meta?.changes || 0) > 0;
      return jsonResponse({ ok: true, added, duplicate: !added, candidate_id: added ? id : '' });
    } catch (error) {
      if (missingTable(error)) return jsonResponse({ ok: false, error: 'CANDIDATES_TABLE_MISSING' }, 503);
      return jsonResponse({ ok: false, error: 'CANDIDATE_WRITE_FAILED' }, 500);
    }
  }

  if (request.method === 'PATCH' && /^[0-9a-f-]{36}$/u.test(rest)) {
    const payload = await request.json().catch(() => null);
    if (!payload) return jsonResponse({ ok: false, error: 'CANDIDATE_BODY_INVALID' }, 400);
    const stage = normalizeStage(payload.stage);
    const note = payload.note === undefined ? null : clean(payload.note, 400);
    if (!stage && note === null) return jsonResponse({ ok: false, error: 'CANDIDATE_NOTHING_TO_UPDATE' }, 400);
    const sets = ['updated_at=?2'];
    const values = [rest, now];
    if (stage) {
      sets.push(`stage=?${values.length + 1}`);
      values.push(stage);
      const column = STAGE_TIMESTAMP_COLUMN[stage];
      // その段階に初めて入ったときだけ日付を入れる。過去の日付は上書きしない。
      if (column) sets.push(`${column}=CASE WHEN ${column}='' THEN ?2 ELSE ${column} END`);
    }
    if (note !== null) {
      sets.push(`note=?${values.length + 1}`);
      values.push(note);
    }
    try {
      const result = await db.prepare(`UPDATE seller_candidates SET ${sets.join(',')} WHERE candidate_id=?1`).bind(...values).run();
      if (Number(result?.meta?.changes || 0) === 0) return jsonResponse({ ok: false, error: 'CANDIDATE_NOT_FOUND' }, 404);
      return jsonResponse({ ok: true, stage: stage || undefined });
    } catch (error) {
      if (missingTable(error)) return jsonResponse({ ok: false, error: 'CANDIDATES_TABLE_MISSING' }, 503);
      return jsonResponse({ ok: false, error: 'CANDIDATE_WRITE_FAILED' }, 500);
    }
  }

  return jsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
}
