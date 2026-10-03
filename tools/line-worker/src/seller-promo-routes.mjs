// 2026-10-03 HOSHILU Seller「AI販促担当」の API（指示書 §6・§10 runbook）。
// 管理者（ADMIN_AUTH_* セッション or SOCIAL_ADMIN_SECRET の Bearer）:
//   POST /api/admin/seller-promo/profiles            店の登録・更新
//   GET  /api/admin/seller-promo/profiles            一覧
//   POST /api/admin/seller-promo/products/import     商品 CSV（source=CSV）または products[]（source=URL）
//   POST /api/admin/seller-promo/questions           疑問の追加
//   POST /api/admin/seller-promo/run                 手動起動 {seller_key, week_key?, force?}
//   GET  /api/admin/seller-promo/jobs?seller_key=
//   GET  /api/admin/seller-promo/deliverables?seller_key=&week_key=
//   POST /api/admin/seller-promo/deliverables/<id>/(approve|reject|publish)
//   POST /api/admin/seller-promo/connections         WordPress 接続（アプリケーションパスワード）
//   GET  /api/admin/seller-promo/usage?month=YYYY-MM 原価
//   POST /api/admin/seller-promo/report              月次レポートの手動作成 {seller_key, month}
//   POST /api/admin/seller-promo/stripe/ensure-prices  Light／Standard の Price 作成（OK② 後だけ）
// 契約者（/seller のセッション。seller_key はセッションから取り、入力からは受け取らない）:
//   GET  /api/seller-promo/deliverables
//   POST /api/seller-promo/deliverables/<id>/(approve|reject)
//   GET  /api/seller-promo/deliverables/<id>/gold.zip
//   POST /api/seller-promo/auto-publish {enabled}
// SELLER_PROMO_ENABLED=false の間、契約者側は 404（存在を見せない）、手動起動は 503。
import { authorizeAdminRequest } from './admin-auth.mjs';
import { readSellerSession } from './seller-auth.mjs';
import { readMemberSession } from './member-auth.mjs';
import { readBoundedJson } from './bounded-json.mjs';
import {
  addPromoQuestions, dbAll, promoAudit, hydrateProfile, importPromoProducts, isPromoWeekKey, jstMonthRange, normalizeProductItems,
  normalizeQuestionItems, parseJsonColumn, productsFromCsv, productsFromSpApi, promoEnabled, promoPlansEnabled, promoText, readPromoProfile, upsertPromoProfile, validSellerKey
} from './seller-promo-store.mjs';
import { runPromoManually } from './seller-promo-scheduler.mjs';
import { approveDeliverable, publishDeliverable, rakutenGoldZip, rejectDeliverable, saveWordPressConnection, setAutoPublish } from './seller-promo-publish.mjs';
import { createMonthlyReport } from './seller-promo-report.mjs';
import { ensurePricesAllowed, ensurePromoPrices } from './seller-promo-billing.mjs';
import { promoAiConfigured, proposeCsvMapping } from './seller-promo-generate.mjs';

const json = (body, status = 200) => Response.json(body, {
  status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' }
});

const CLIENT_ERRORS = new Set([
  'SELLER_KEY_INVALID', 'PLAN_INVALID', 'CATEGORY_NOT_ALLOWED', 'CATEGORIES_REQUIRED', 'PUBLISH_TARGET_INVALID', 'WEEKDAY_INVALID', 'HOUR_INVALID',
  'EMAIL_INVALID', 'STATUS_INVALID', 'CSV_EMPTY', 'CSV_MAPPING_REQUIRED', 'PRODUCTS_REQUIRED', 'SOURCE_INVALID', 'QUESTIONS_REQUIRED',
  'QUESTION_SOURCE_INVALID', 'FEEDBACK_AGGREGATE_ONLY', 'HOSHILU_DEMAND_IS_SERVER_ONLY', 'QUESTION_TEXT_REQUIRED', 'PROFILE_NOT_FOUND',
  'WEEK_KEY_INVALID', 'ONLY_QA_PASSED_CAN_BE_APPROVED', 'REJECT_REASON_REQUIRED', 'DELIVERABLE_NOT_REJECTABLE', 'ARTICLE_ONLY', 'APPROVAL_REQUIRED',
  'WP_URL_INVALID', 'WP_HTTPS_REQUIRED', 'WP_IP_LITERAL_FORBIDDEN', 'WP_PRIVATE_HOST_FORBIDDEN', 'WP_HOST_NOT_ALLOWLISTED', 'WP_CREDENTIALS_INVALID',
  'MONTH_INVALID', 'CONFIRM_REQUIRED', 'TENANT_INVALID', 'SP_API_LISTINGS_EMPTY', 'STRIPE_PRICES_NOT_APPROVED', 'SELLER_PROMO_NO_PRODUCTS'
]);

function errorResponse(error) {
  const code = String(error?.message || 'SELLER_PROMO_FAILED');
  if (/no such table/iu.test(code)) return json({ ok: false, error: 'MIGRATION_PENDING' }, 503);
  if (code === 'DELIVERABLE_NOT_FOUND') return json({ ok: false, error: code }, 404);
  if (code === 'DELIVERABLE_STATE_CONFLICT') return json({ ok: false, error: code }, 409);
  if (code === 'SELLER_PROMO_KEK_NOT_CONFIGURED') return json({ ok: false, error: code }, 503);
  if (CLIENT_ERRORS.has(code)) return json({ ok: false, error: code, ...(error.headers ? { headers: error.headers } : {}) }, 400);
  console.error('SELLER_PROMO_ROUTE_FAILED', { code: promoText(code, 80) });
  return json({ ok: false, error: 'SELLER_PROMO_FAILED' }, 500);
}

async function body(request, max = 64_000) {
  const parsed = await readBoundedJson(request, max);
  if (!parsed.ok) throw Object.assign(new Error(parsed.error), { status: parsed.error === 'REQUEST_TOO_LARGE' ? 413 : 400 });
  return parsed.value && typeof parsed.value === 'object' ? parsed.value : {};
}

// 契約者画面に返す形。QA の理由は見せるが、モデル名などの内部情報は落とす。
export function publicDeliverable(row) {
  const qa = parseJsonColumn(row.qa, {});
  return {
    id: row.id, week_key: row.week_key, type: row.type, version: Number(row.version), status: row.status,
    payload: parseJsonColumn(row.payload, {}),
    qa: { passed: qa.passed === true, reasons: Array.isArray(qa.reasons) ? qa.reasons.slice(0, 10) : [], notes: Array.isArray(qa.notes) ? qa.notes.slice(0, 10) : [] },
    approved_at: row.approved_at || null, rejected_reason: row.rejected_reason || null,
    published_target: row.published_target || null, published_url: row.published_url || null, published_at: row.published_at || null,
    created_at: row.created_at
  };
}

function profileView(profile) {
  if (!profile) return null;
  const { notify_email, ...rest } = profile;
  return { ...rest, notify_email_set: Boolean(notify_email) };
}

async function handleAdmin(request, env, url, deps) {
  const authorize = deps.authorize || authorizeAdminRequest;
  if (!await authorize(request, env)) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
  if (!env.PRODUCT_DB) return json({ ok: false, error: 'DB_UNAVAILABLE' }, 503);
  const db = env.PRODUCT_DB;
  const path = url.pathname.replace(/^\/api\/admin\/seller-promo/u, '');
  const now = deps.now ? deps.now() : new Date();
  try {
    if (request.method === 'POST' && path === '/profiles') {
      const profile = await upsertPromoProfile(db, await body(request), now);
      return json({ ok: true, profile: profileView(await readPromoProfile(db, profile.seller_key)) });
    }
    if (request.method === 'GET' && path === '/profiles') {
      const rows = (await dbAll(db, 'SELECT * FROM seller_promo_profiles ORDER BY updated_at DESC LIMIT 200')).map(hydrateProfile).map(profileView);
      return json({ ok: true, profiles: rows });
    }
    if (request.method === 'POST' && path === '/products/import') {
      const input = await body(request, 2_000_000);
      if (!validSellerKey(input.seller_key)) throw new Error('SELLER_KEY_INVALID');
      if (!await readPromoProfile(db, input.seller_key)) throw new Error('PROFILE_NOT_FOUND');
      const source = String(input.source || (input.csv ? 'CSV' : 'URL')).toUpperCase();
      let items;
      try {
        items = source === 'CSV' ? productsFromCsv(input.csv, input.mapping)
          : source === 'SP_API' ? await productsFromSpApi(db, String(input.tenant || '').toLowerCase())
          : normalizeProductItems(input.products);
      } catch (error) {
        // 見出しが楽天/Amazon の列名に無いとき（§12）: AI に対応表の案を作らせ、取り込まずに返す。人が確かめて mapping を付けて再送する。
        if (error?.message !== 'CSV_MAPPING_REQUIRED' || input.ai_mapping === false || !promoAiConfigured(env)) throw error;
        const proposal = await proposeCsvMapping(env, input.seller_key, input.csv, { fetchImpl: deps.fetchImpl || fetch });
        await promoAudit(db, { seller_key: input.seller_key, actor: 'SYSTEM', action: 'CSV_MAPPING_PROPOSED', target_type: 'PRODUCTS', detail: { proposal, headers: error.headers } }, now);
        return json({ ok: false, error: 'CSV_MAPPING_PROPOSED', headers: error.headers, proposal,
          next: 'proposal を確認し、正しければ "mapping": proposal を付けて同じリクエストを再送してください（まだ取り込んでいません）' }, 409);
      }
      const result = await importPromoProducts(db, input.seller_key, source, items, now);
      return json({ ok: true, received: items.length, ...result });
    }
    if (request.method === 'POST' && path === '/questions') {
      const input = await body(request, 256_000);
      if (!validSellerKey(input.seller_key)) throw new Error('SELLER_KEY_INVALID');
      if (!await readPromoProfile(db, input.seller_key)) throw new Error('PROFILE_NOT_FOUND');
      return json({ ok: true, ...(await addPromoQuestions(db, input.seller_key, normalizeQuestionItems(input.items), { actor: 'ADMIN', now })) });
    }
    if (request.method === 'POST' && path === '/run') {
      if (!promoEnabled(env)) return json({ ok: false, error: 'SELLER_PROMO_DISABLED' }, 503);
      const input = await body(request);
      if (!validSellerKey(input.seller_key)) throw new Error('SELLER_KEY_INVALID');
      if (input.week_key && !isPromoWeekKey(input.week_key)) throw new Error('WEEK_KEY_INVALID');
      const outcome = await runPromoManually(env, { seller_key: input.seller_key, week_key: input.week_key, force: input.force === true },
        { fetchImpl: deps.fetchImpl || fetch, now });
      return json({ ok: true, ...outcome });
    }
    if (request.method === 'GET' && path === '/jobs') {
      const sellerKey = url.searchParams.get('seller_key') || '';
      const rows = sellerKey
        ? await dbAll(db, 'SELECT * FROM seller_promo_jobs WHERE seller_key=?1 ORDER BY created_at DESC LIMIT 50', sellerKey)
        : await dbAll(db, 'SELECT * FROM seller_promo_jobs ORDER BY created_at DESC LIMIT 100');
      return json({ ok: true, jobs: rows });
    }
    if (request.method === 'GET' && path === '/deliverables') {
      const sellerKey = url.searchParams.get('seller_key') || '';
      if (!validSellerKey(sellerKey)) throw new Error('SELLER_KEY_INVALID');
      const week = url.searchParams.get('week_key') || '';
      const rows = week
        ? await dbAll(db, 'SELECT * FROM seller_promo_deliverables WHERE seller_key=?1 AND week_key=?2 ORDER BY type,version', sellerKey, week)
        : await dbAll(db, 'SELECT * FROM seller_promo_deliverables WHERE seller_key=?1 ORDER BY created_at DESC LIMIT 60', sellerKey);
      return json({ ok: true, deliverables: rows.map((row) => ({ ...publicDeliverable(row), qa: parseJsonColumn(row.qa, {}) })) });
    }
    const action = path.match(/^\/deliverables\/(spd_[a-f0-9]{32})\/(approve|reject|publish)$/u);
    if (request.method === 'POST' && action) {
      const [, id, verb] = action;
      const input = await body(request);
      let row;
      if (verb === 'approve') row = await approveDeliverable(env, id, { actor: 'ADMIN', approvedBy: 'ADMIN', now });
      else if (verb === 'reject') row = await rejectDeliverable(env, id, { actor: 'ADMIN', reason: input.reason, note: input.note, now });
      else row = await publishDeliverable(env, id, { actor: 'ADMIN', now });
      return json({ ok: true, deliverable: publicDeliverable(row) });
    }
    if (request.method === 'POST' && path === '/connections') {
      return json({ ok: true, connection: await saveWordPressConnection(env, await body(request), now) });
    }
    if (request.method === 'GET' && path === '/usage') {
      const month = url.searchParams.get('month') || '';
      if (!/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(month)) throw new Error('MONTH_INVALID');
      const { from, to } = jstMonthRange(month);
      const rows = await dbAll(db, `SELECT seller_key, COUNT(*) AS calls, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
        ROUND(SUM(cost_jpy_est),2) AS cost_jpy_est FROM seller_promo_usage WHERE created_at>=?1 AND created_at<?2 GROUP BY seller_key ORDER BY cost_jpy_est DESC`, from, to);
      return json({ ok: true, month, usage: rows });
    }
    if (request.method === 'POST' && path === '/report') {
      const input = await body(request);
      if (!/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(String(input.month || ''))) throw new Error('MONTH_INVALID');
      const profile = await readPromoProfile(db, String(input.seller_key || ''));
      if (!profile) throw new Error('PROFILE_NOT_FOUND');
      return json({ ok: true, ...(await createMonthlyReport(env, profile, input.month, now)) });
    }
    if (request.method === 'POST' && path === '/stripe/ensure-prices') {
      const blocked = ensurePricesAllowed(env, await body(request));
      if (blocked) return json({ ok: false, error: blocked }, blocked === 'STRIPE_NOT_CONFIGURED' ? 503 : 400);
      return json({ ok: true, ...(await ensurePromoPrices(env)) });
    }
    return json({ ok: false, error: 'NOT_FOUND' }, 404);
  } catch (error) {
    if (error?.status === 413 || error?.status === 400) return json({ ok: false, error: error.message }, error.status);
    return errorResponse(error);
  }
}

// 外部店（/seller-pilot にメールのコードでログインする店）: 会員セッションから、本人の掲載契約（owner_member_id）に
// pilot_id で紐づいた AI販促プロファイルを探す。プロファイルの seller_key は申込時に決めておける（例: pilot-<契約ID>）。
// 1 人が複数の契約を持つときは ?seller_key= で選ぶ（本人の契約に紐づくものだけ）。
async function memberPromoSession(request, env, deps) {
  const member = await (deps.member || readMemberSession)(request, env);
  if (!member?.id) return null;
  const rows = await dbAll(env.PRODUCT_DB, `SELECT p.seller_key FROM seller_promo_profiles p
    JOIN seller_listing_pilots l ON l.pilot_id=p.pilot_id WHERE p.pilot_id<>'' AND l.owner_member_id=?1 ORDER BY p.created_at`, member.id);
  // ログイン済みでも AI販促を契約していない店には「まだ始めていません」を返す（401 にしない）。
  if (!rows.length) return { seller_key: null, via: 'MEMBER', enrolled: false };
  const wanted = new URL(request.url).searchParams.get('seller_key');
  const row = wanted ? rows.find((r) => r.seller_key === wanted) : rows[0];
  return row ? { seller_key: row.seller_key, via: 'MEMBER' } : null;
}

async function handleSeller(request, env, url, deps) {
  if (!promoEnabled(env)) return json({ ok: false, error: 'NOT_FOUND' }, 404);
  if (!env.PRODUCT_DB) return json({ ok: false, error: 'DB_UNAVAILABLE' }, 503);
  const session = await (deps.readSeller || readSellerSession)(request, env)
    || await memberPromoSession(request, env, deps).catch(() => null);
  if (session?.enrolled === false && request.method === 'GET' && url.pathname === '/api/seller-promo/deliverables') {
    return json({ ok: true, enrolled: false, deliverables: [] });
  }
  if (!session?.seller_key) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
  if (request.method !== 'GET' && request.headers.get('origin') !== url.origin) return json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, 403);
  const sellerKey = session.seller_key;
  const db = env.PRODUCT_DB;
  const now = deps.now ? deps.now() : new Date();
  try {
    const profile = await readPromoProfile(db, sellerKey);
    if (request.method === 'GET' && url.pathname === '/api/seller-promo/deliverables') {
      // 未登録の店には自分の seller_key だけ返す（管理者が同じ値で登録するため。本人のセッションにしか返さない）。
      if (!profile) return json({ ok: true, enrolled: false, seller_key: sellerKey, deliverables: [] });
      const rows = await dbAll(db, `SELECT * FROM seller_promo_deliverables WHERE seller_key=?1 AND status<>'QA_FAILED' ORDER BY created_at DESC LIMIT 40`, sellerKey);
      return json({
        ok: true, enrolled: true,
        profile: { display_name: profile.display_name, publish_target: profile.publish_target, approval_mode: profile.approval_mode, plan: profile.plan },
        deliverables: rows.map(publicDeliverable)
      });
    }
    if (!profile) return json({ ok: false, error: 'PROFILE_NOT_FOUND' }, 404);
    const action = url.pathname.match(/^\/api\/seller-promo\/deliverables\/(spd_[a-f0-9]{32})\/(approve|reject|gold\.zip)$/u);
    if (action && action[2] === 'gold.zip' && request.method === 'GET') {
      const { zip, filename } = await rakutenGoldZip(env, action[1], { actor: 'SELLER', sellerKey, now });
      return new Response(zip, { headers: {
        'content-type': 'application/zip', 'content-disposition': `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/gu, '_')}"`,
        'cache-control': 'no-store', 'x-content-type-options': 'nosniff'
      } });
    }
    if (action && request.method === 'POST') {
      const input = await body(request);
      const row = action[2] === 'approve'
        ? await approveDeliverable(env, action[1], { actor: 'SELLER', sellerKey, approvedBy: 'SELLER', now })
        : await rejectDeliverable(env, action[1], { actor: 'SELLER', sellerKey, reason: input.reason, note: input.note, now });
      return json({ ok: true, deliverable: publicDeliverable(row) });
    }
    if (request.method === 'POST' && url.pathname === '/api/seller-promo/auto-publish') {
      const input = await body(request);
      return json({ ok: true, approval_mode: await setAutoPublish(env, sellerKey, input.enabled === true, now) });
    }
    return json({ ok: false, error: 'NOT_FOUND' }, 404);
  } catch (error) {
    if (error?.status === 413 || error?.status === 400) return json({ ok: false, error: error.message }, error.status);
    return errorResponse(error);
  }
}

// 料金 LP の下書き（public/for-sellers-preview.html）。静的ファイルを直接見せず、ここで出し分ける。
// - 公開は SELLER_PROMO_LP_PREVIEW_PUBLIC=true（OK② の後）か、管理者のセッションだけ。それ以外は 404。
// - 有料プラン（Light／Standard）の欄は SELLER_PROMO_PLANS_ENABLED=true のときだけ差し込む。
export const PAID_PLANS_PLACEHOLDER = '<!--SELLER_PROMO_PAID_PLANS-->';
export const PAID_PLANS_SECTION = `<section class="pricing" id="promo-plans"><div class="pricing-head"><p class="eyebrow">AI PROMOTION</p><h2>AI販促担当</h2></div>
    <article class="price-card"><p class="price-label">Light</p><p>Light 9,800円: 毎週、記事1本・SNS原稿2本と画像・商品ページの直し案が届きます。公開はお店が行います。</p></article>
    <article class="price-card"><p class="price-label">Standard</p><p>Standard 19,800円: Light に加えて、お店のHP（WordPress）への公開、楽天GOLD 用のHTML、任意の声フォーム、需要への再案内。</p></article>
  </section>`;
async function handlePreviewPage(request, env, deps) {
  const allowed = String(env.SELLER_PROMO_LP_PREVIEW_PUBLIC || '') === 'true' || Boolean(await (deps.authorize || authorizeAdminRequest)(request, env));
  if (!allowed || !env.ASSETS) return new Response('not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  const asset = await env.ASSETS.fetch(new Request(new URL('/for-sellers-preview.html', request.url), { method: 'GET' }));
  if (!asset.ok) return new Response('not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  const html = (await asset.text()).replace(PAID_PLANS_PLACEHOLDER, promoPlansEnabled(env) ? PAID_PLANS_SECTION : '');
  return new Response(request.method === 'HEAD' ? null : html, { headers: {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'x-content-type-options': 'nosniff'
  } });
}

export async function handleSellerPromoRoutes(request, env, deps = {}) {
  const url = new URL(request.url);
  if (['GET', 'HEAD'].includes(request.method) && ['/for-sellers-preview', '/for-sellers-preview.html', '/for-sellers-preview/'].includes(url.pathname)) {
    return handlePreviewPage(request, env, deps);
  }
  if (url.pathname.startsWith('/api/admin/seller-promo/')) return handleAdmin(request, env, url, deps);
  if (url.pathname.startsWith('/api/seller-promo/')) return handleSeller(request, env, url, deps);
  return null;
}
