// 2026-10-03 HOSHILU Seller「AI販促担当」週次ジョブ（指示書 §6-1）。
// - 既存 cron `*/15 * * * *` の scheduled() から呼ぶ。cron 行は増やさない。
// - 店ごとの曜日・時刻（既定 月曜 06:00 JST）の最初の 15 分のサイクルでジョブを作る。1 サイクル最大
//   SELLER_PROMO_MAX_JOBS_PER_CYCLE（既定 5）件。UNIQUE(seller_key, week_key) で同週の二重作成はしない。
// - attempt は最大 3。3 回失敗で FAILED のまま止め、管理者へ通知する。
// - kill switch SELLER_PROMO_ENABLED（既定 false）。予算を超えた店は SKIPPED。
import {
  dbAll, dbFirst, dbRun, hydrateProfile, jstMonthRange, jstParts, nowIso, pilotSellerKeys, promoAudit, promoEnabled,
  promoId, promoMonthKey, promoPlansEnabled, promoText, promoWeekKey, readPromoProfile, refreshHoshiluDemandQuestions,
  activePromoProducts, PROMO_DELIVERY_PLANS, parseJsonColumn
} from './seller-promo-store.mjs';
import { generatePromoPackage, promoAiConfigured } from './seller-promo-generate.mjs';
import { autoApproveDeliverable } from './seller-promo-publish.mjs';
import { runMonthlyReportCycle } from './seller-promo-report.mjs';
import { ensurePromoPricesOnce, PROMO_OFFER_PLANS } from './seller-promo-billing.mjs';
import { pilotEntitlement } from './seller-listing-pilot.mjs';

export const MAX_ATTEMPTS = 3;
const STALE_RUNNING_MS = 30 * 60 * 1000;

const intEnv = (value, fallback) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback);
export function promoLimits(env = {}) {
  return {
    maxJobsPerCycle: intEnv(env.SELLER_PROMO_MAX_JOBS_PER_CYCLE, 5),
    monthlyTokenCapPerSeller: intEnv(env.SELLER_PROMO_MONTHLY_TOKEN_CAP_PER_SELLER, 2_000_000),
    monthlyCostCapJpy: intEnv(env.SELLER_PROMO_MONTHLY_COST_CAP_JPY, 20_000)
  };
}

// 対象店: ACTIVE かつ LIGHT/STANDARD。販売 OFF（Phase 1〜3）の間は QA 店舗とパイロット店だけ。
export function promoProfileEligible(profile, env = {}) {
  if (!profile || profile.status !== 'ACTIVE') return false;
  if (!promoPlansEnabled(env)) return profile.qa === true || pilotSellerKeys(env).has(profile.seller_key);
  return PROMO_DELIVERY_PLANS.includes(profile.plan);
}

// 販売 ON のときは、プロファイルの plan だけでなく、紐づく掲載契約（profile.pilot_id）が
// 同じプランの Light/Standard で、トライアル中か支払済み（pilotEntitlement.active）であることを確かめる。
// QA 店舗・パイロット店（SELLER_PROMO_PILOT_SELLER_KEYS）は契約なしで動かす（検証用）。
export async function promoContractActive(env, profile, now = new Date()) {
  if (!profile?.pilot_id) return false;
  const row = await dbFirst(env.PRODUCT_DB, 'SELECT document_json FROM seller_listing_pilots WHERE pilot_id=?1', profile.pilot_id);
  if (!row) return false;
  const doc = parseJsonColumn(row.document_json, {});
  return PROMO_OFFER_PLANS[doc.offer_version] === profile.plan && pilotEntitlement(doc, now).active === true;
}
export async function promoProfileRunnable(env, profile, now = new Date()) {
  if (!promoProfileEligible(profile, env)) return false;
  if (!promoPlansEnabled(env) || profile.qa === true || pilotSellerKeys(env).has(profile.seller_key)) return true;
  return promoContractActive(env, profile, now).catch(() => false);
}

export function promoDue(profile, now = new Date()) {
  const jst = jstParts(now);
  return jst.weekday === Number(profile.weekday ?? 1) && jst.hour === Number(profile.hour_jst ?? 6) && jst.minute < 15;
}

export async function promoBudgetState(env, sellerKey, now = new Date()) {
  const { from, to } = jstMonthRange(promoMonthKey(now));
  const limits = promoLimits(env);
  const seller = await dbFirst(env.PRODUCT_DB, `SELECT COALESCE(SUM(input_tokens+output_tokens),0) AS tokens FROM seller_promo_usage
    WHERE seller_key=?1 AND created_at>=?2 AND created_at<?3`, sellerKey, from, to);
  const all = await dbFirst(env.PRODUCT_DB, `SELECT COALESCE(SUM(cost_jpy_est),0) AS cost FROM seller_promo_usage
    WHERE created_at>=?1 AND created_at<?2`, from, to);
  const tokens = Number(seller?.tokens || 0);
  const cost = Number(all?.cost || 0);
  return {
    tokens, cost_jpy: cost,
    over: tokens >= limits.monthlyTokenCapPerSeller ? 'SELLER_TOKEN_CAP' : cost >= limits.monthlyCostCapJpy ? 'MONTHLY_COST_CAP' : ''
  };
}

export async function ensurePromoJob(db, sellerKey, weekKey, now = new Date()) {
  await dbRun(db, `INSERT INTO seller_promo_jobs(id,seller_key,week_key,status,attempt,created_at) VALUES(?1,?2,?3,'PENDING',0,?4)
    ON CONFLICT(seller_key,week_key) DO NOTHING`, promoId('spj'), sellerKey, weekKey, nowIso(now));
  return dbFirst(db, 'SELECT * FROM seller_promo_jobs WHERE seller_key=?1 AND week_key=?2', sellerKey, weekKey);
}

async function nextVersion(db, sellerKey, weekKey, type) {
  const row = await dbFirst(db, `SELECT COALESCE(MAX(version),0) AS v FROM seller_promo_deliverables WHERE seller_key=?1 AND week_key=?2 AND type=?3`,
    sellerKey, weekKey, type);
  return Number(row?.v || 0) + 1;
}

// 1 ラウンドの検査結果を 1 行にする。SNS は 2 本を 1 行（posts）にまとめる。
function deliverableFromRound(type, checked) {
  if (type === 'SNS') {
    const passed = checked.length === 2 && checked.every((c) => c.passed);
    return {
      passed,
      payload: { posts: checked.map((c) => c.payload) },
      qa: { checked_at: new Date().toISOString(), passed, reasons: checked.flatMap((c) => c.qa.reasons), notes: checked.flatMap((c) => c.qa.notes || []),
        posts: checked.map((c) => c.qa), model: checked[0]?.model || '' }
    };
  }
  const [only] = checked;
  return { passed: only.passed, payload: only.payload, qa: { ...only.qa, model: only.model || '' } };
}

async function persistPackage(env, job, profile, pkg, now) {
  const db = env.PRODUCT_DB;
  const created = [];
  for (const { type, versions } of pkg.results) {
    for (const round of versions) {
      const row = deliverableFromRound(type, round);
      const version = await nextVersion(db, job.seller_key, job.week_key, type);
      const id = promoId('spd');
      await dbRun(db, `INSERT INTO seller_promo_deliverables(id,job_id,seller_key,week_key,type,version,status,payload,qa,created_at,updated_at)
        VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)`, id, job.id, job.seller_key, job.week_key, type, version,
      row.passed ? 'QA_PASSED' : 'QA_FAILED', JSON.stringify(row.payload), JSON.stringify(row.qa), nowIso(now));
      created.push({ id, type, version, status: row.passed ? 'QA_PASSED' : 'QA_FAILED', notes: (row.qa.notes || []).length });
    }
  }
  // 自動公開を店本人が許可している場合だけ、検査に通った最新版を承認・公開する。
  // 「要確認」の注記（§9-1）が付いた版は自動公開しない（店が見てから承認する）。
  if (profile.approval_mode === 'AUTO') {
    for (const item of created.filter((c) => c.status === 'QA_PASSED' && !c.notes)) {
      await autoApproveDeliverable(env, item.id, now).catch((error) => console.error('SELLER_PROMO_AUTO_APPROVE_FAILED', { code: promoText(error?.message, 80) }));
    }
  }
  return created;
}

async function notifyResend(env, { to, subject, text, idempotencyKey }) {
  const from = String(env.MEMBER_EMAIL_FROM || '').trim();
  if (!to || !from || !String(env.RESEND_API_KEY || '').startsWith('re_')) return false;
  const fetchImpl = env.SELLER_PROMO_FETCH || fetch;
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
    body: JSON.stringify({ from: `HOSHILU <${from}>`, to: [to], subject, text }),
    redirect: 'manual', signal: AbortSignal.timeout(8000)
  });
  return response.ok;
}

// 月曜「今週の分ができました」（サービス通知。相談通知と同じ Resend 経路）。
export async function notifyWeekReady(env, profile, job) {
  return notifyResend(env, {
    to: profile.notify_email,
    subject: '【HOSHILU】今週の分ができました',
    idempotencyKey: `seller-promo-ready-${job.seller_key}-${job.week_key}`.slice(0, 255),
    text: [
      `${profile.display_name || 'ご担当者'} 様`,
      '',
      '今週の記事・SNS原稿・商品ページの直し案ができました。',
      '契約者画面の「今週のサポート」タブで確認し、承認または差し戻しをお願いします。',
      'https://hoshilu.app/seller',
      '',
      '売上や順位は約束しません。作ったもの・公開したもの・数字は毎月そのまま報告します。',
      '— HOSHILU'
    ].join('\n')
  }).catch(() => false);
}

async function notifyAdminFailure(env, job, code) {
  return notifyResend(env, {
    to: String(env.SELLER_INQUIRY_NOTIFY_EMAIL || '').trim(),
    subject: '【HOSHILU・要確認】AI販促 週次ジョブが3回失敗しました',
    idempotencyKey: `seller-promo-failed-${job.id}`,
    text: `job: ${job.id}\nseller_key: ${job.seller_key}\nweek: ${job.week_key}\nerror: ${code}\n\n再実行: POST /api/admin/seller-promo/run {"seller_key":"${job.seller_key}","week_key":"${job.week_key}","force":true}`
  }).catch(() => false);
}

function errorCode(error) {
  const message = String(error?.message || 'SELLER_PROMO_FAILED');
  return /^[A-Z0-9_:]{3,80}$/u.test(message) ? message : 'SELLER_PROMO_FAILED';
}

// 1 件のジョブを実行する。楽観ロック（status と attempt の一致）で二重実行を防ぐ。
export async function runPromoJob(env, job, { fetchImpl = fetch, now = new Date(), actor = 'SYSTEM' } = {}) {
  const db = env.PRODUCT_DB;
  const profile = await readPromoProfile(db, job.seller_key);
  if (!profile) {
    await dbRun(db, `UPDATE seller_promo_jobs SET status='SKIPPED',error='PROFILE_NOT_FOUND',finished_at=?1 WHERE id=?2`, nowIso(now), job.id);
    return { status: 'SKIPPED', error: 'PROFILE_NOT_FOUND' };
  }
  const budget = await promoBudgetState(env, job.seller_key, now);
  if (budget.over) {
    await dbRun(db, `UPDATE seller_promo_jobs SET status='SKIPPED',error=?1,finished_at=?2 WHERE id=?3`, budget.over, nowIso(now), job.id);
    await promoAudit(db, { seller_key: job.seller_key, actor: 'SYSTEM', action: 'JOB_SKIPPED_BUDGET', target_type: 'JOB', target_id: job.id, detail: budget }, now);
    return { status: 'SKIPPED', error: budget.over };
  }
  const claim = await dbRun(db, `UPDATE seller_promo_jobs SET status='RUNNING',attempt=attempt+1,started_at=?1,error=''
    WHERE id=?2 AND status=?3 AND attempt=?4 AND attempt<?5`, nowIso(now), job.id, job.status, Number(job.attempt || 0), MAX_ATTEMPTS);
  if (Number(claim?.meta?.changes || 0) !== 1) return { status: 'NOT_CLAIMED' };
  const attempt = Number(job.attempt || 0) + 1;
  try {
    // AI の鍵が無いときも 1 回の失敗として数える（3 回で止めて管理者へ知らせる。毎サイクル拾い直さない）。
    if (!promoAiConfigured(env)) throw new Error('SELLER_PROMO_AI_NOT_CONFIGURED');
    const products = await activePromoProducts(db, job.seller_key);
    await refreshHoshiluDemandQuestions(env, job.seller_key, products, now).catch(() => null);
    const pkg = await generatePromoPackage(env, { profile, job, fetchImpl, now });
    const created = await persistPackage(env, job, profile, pkg, now);
    await dbRun(db, `UPDATE seller_promo_jobs SET status='DONE',finished_at=?1,error=?2 WHERE id=?3`, nowIso(new Date()),
      pkg.image === 'SKIPPED_NO_R2' ? 'IMAGE_SKIPPED_NO_R2' : '', job.id);
    await promoAudit(db, { seller_key: job.seller_key, actor, action: 'JOB_DONE', target_type: 'JOB', target_id: job.id,
      detail: { week_key: job.week_key, attempt, created: created.map((c) => `${c.type}:v${c.version}:${c.status}`), image: pkg.image } }, now);
    if (created.some((c) => c.status === 'QA_PASSED')) await notifyWeekReady(env, profile, job);
    return { status: 'DONE', created, image: pkg.image };
  } catch (error) {
    const code = errorCode(error);
    await dbRun(db, `UPDATE seller_promo_jobs SET status='FAILED',error=?1,finished_at=?2 WHERE id=?3`, code, nowIso(new Date()), job.id);
    await promoAudit(db, { seller_key: job.seller_key, actor: 'SYSTEM', action: 'JOB_FAILED', target_type: 'JOB', target_id: job.id, detail: { attempt, code } }, now);
    if (attempt >= MAX_ATTEMPTS) await notifyAdminFailure(env, job, code);
    return { status: 'FAILED', error: code, attempt };
  }
}

// 手動起動（POST /api/admin/seller-promo/run）。force で完了済み・3 回失敗済みの週も作り直す（版は増える）。
export async function runPromoManually(env, { seller_key, week_key, force = false }, { fetchImpl = fetch, now = new Date() } = {}) {
  const db = env.PRODUCT_DB;
  const profile = await readPromoProfile(db, seller_key);
  if (!profile) throw new Error('PROFILE_NOT_FOUND');
  const weekKey = week_key || promoWeekKey(now);
  let job = await ensurePromoJob(db, seller_key, weekKey, now);
  const stale = job.status === 'RUNNING' && Date.now() - Date.parse(job.started_at || 0) > STALE_RUNNING_MS;
  if (['DONE', 'SKIPPED'].includes(job.status) || (job.status === 'FAILED' && Number(job.attempt) >= MAX_ATTEMPTS) || stale) {
    if (!force) return { job, result: { status: 'ALREADY_' + job.status } };
    await dbRun(db, `UPDATE seller_promo_jobs SET status='PENDING',attempt=0,error='' WHERE id=?1`, job.id);
    await promoAudit(db, { seller_key, actor: 'ADMIN', action: 'JOB_FORCE_RERUN', target_type: 'JOB', target_id: job.id, detail: { previous: job.status } }, now);
    job = await dbFirst(db, 'SELECT * FROM seller_promo_jobs WHERE id=?1', job.id);
  }
  if (job.status === 'RUNNING') return { job, result: { status: 'ALREADY_RUNNING' } };
  const result = await runPromoJob(env, job, { fetchImpl, now, actor: 'ADMIN' });
  return { job: await dbFirst(db, 'SELECT * FROM seller_promo_jobs WHERE id=?1', job.id), result };
}

// cron 本体。止まっていれば何もしない。テーブル未作成（migration 未適用）でも静かに戻る。
export async function runSellerPromoCycle(env, scheduledAt = new Date(), { fetchImpl = fetch } = {}) {
  if (!promoEnabled(env) || !env.PRODUCT_DB) return { skipped: 'DISABLED' };
  try {
    const db = env.PRODUCT_DB;
    // OK② 後の 1 回だけ（承認フラグ＋監査ログで冪等）。失敗しても週次ジョブは止めない。
    const prices = await ensurePromoPricesOnce(env, scheduledAt).catch(() => ({ error: 'STRIPE_PRICES_FAILED' }));
    const weekKey = promoWeekKey(scheduledAt);
    const limits = promoLimits(env);
    const profiles = (await dbAll(db, `SELECT * FROM seller_promo_profiles WHERE status='ACTIVE' ORDER BY seller_key LIMIT 500`)).map(hydrateProfile);
    let created = 0;
    for (const profile of profiles) {
      if (!promoDue(profile, scheduledAt) || !await promoProfileRunnable(env, profile, scheduledAt)) continue;
      const job = await ensurePromoJob(db, profile.seller_key, weekKey, scheduledAt);
      if (job?.status === 'PENDING' && Number(job.attempt) === 0) created += 1;
    }
    // 今週の未完了ジョブ（新規・失敗の再試行・止まった実行）を上限まで順に回す。
    const staleBefore = new Date(scheduledAt.getTime() - STALE_RUNNING_MS).toISOString();
    const runnable = await dbAll(db, `SELECT * FROM seller_promo_jobs WHERE week_key=?1 AND attempt<?2 AND
      (status='PENDING' OR status='FAILED' OR (status='RUNNING' AND started_at<?3)) ORDER BY created_at LIMIT ?4`,
    weekKey, MAX_ATTEMPTS, staleBefore, limits.maxJobsPerCycle);
    const results = [];
    for (const job of runnable) {
      const profile = await readPromoProfile(db, job.seller_key);
      if (!await promoProfileRunnable(env, profile, scheduledAt)) continue;
      results.push({ job_id: job.id, ...(await runPromoJob(env, job, { fetchImpl, now: scheduledAt })) });
    }
    const reports = await runMonthlyReportCycle(env, scheduledAt, promoProfileRunnable).catch(() => ({ error: 'REPORT_CYCLE_FAILED' }));
    return { week_key: weekKey, created, ran: results.length, results, reports, prices };
  } catch (error) {
    if (/no such table/iu.test(String(error?.message))) return { skipped: 'MIGRATION_PENDING' };
    console.error('SELLER_PROMO_CYCLE_FAILED', { code: promoText(error?.message, 80) });
    return { error: 'SELLER_PROMO_CYCLE_FAILED' };
  }
}
