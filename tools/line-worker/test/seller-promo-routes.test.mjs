import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSellerPromoRoutes } from '../src/seller-promo-routes.mjs';
import { sellerPageResponse } from '../src/seller-page.mjs';
import { publicPromoPlans, ensurePricesAllowed, ensurePromoPrices, PROMO_PAID_PLANS } from '../src/seller-promo-billing.mjs';
import { createMonthlyReport, previousMonthKey, monthlyReportDue } from '../src/seller-promo-report.mjs';
import { readPromoProfile } from '../src/seller-promo-store.mjs';
import { promoDb, promoEnv, fakeGemini, MONDAY_0605_JST } from './helpers/seller-promo-fixture.mjs';

const ORIGIN = 'https://hoshilu.app';
function call(env, path, { method = 'GET', body, deps = {}, origin = ORIGIN } = {}) {
  const init = { method, headers: origin ? { origin } : {} };
  if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
  return handleSellerPromoRoutes(new Request(`${ORIGIN}${path}`, init), env, deps);
}
const admin = { authorize: async () => ({ mode: 'bearer' }), now: () => MONDAY_0605_JST };

test('runbook の流れ: 店の登録→商品 CSV→疑問→手動起動→一覧→契約者が承認', async () => {
  const { db, adapter } = promoDb();
  const env = promoEnv(adapter);
  assert.equal((await call(env, '/api/admin/seller-promo/profiles', { method: 'POST', body: {} })).status, 401);
  const badCategory = await call(env, '/api/admin/seller-promo/profiles', { method: 'POST', body: { seller_key: 'qa-shop-1', categories: ['健康食品'] }, deps: admin });
  assert.equal(badCategory.status, 400);
  assert.equal((await badCategory.json()).error, 'CATEGORY_NOT_ALLOWED');
  const profile = await call(env, '/api/admin/seller-promo/profiles', { method: 'POST', deps: admin,
    body: { seller_key: 'qa-shop-1', display_name: 'QA雑貨店', categories: ['生活雑貨'], plan: 'LIGHT', qa: true, notify_email: 'owner@example.com' } });
  const profileBody = await profile.json();
  assert.equal(profileBody.profile.notify_email_set, true);
  assert.equal(profileBody.profile.notify_email, undefined);
  const csv = '商品管理番号（商品URL）,商品名,販売価格\nbox-1,玄関収納ボックス,2980\n';
  const imported = await (await call(env, '/api/admin/seller-promo/products/import', { method: 'POST', deps: admin, body: { seller_key: 'qa-shop-1', csv } })).json();
  assert.deepEqual([imported.received, imported.imported], [1, 1]);
  const questions = await (await call(env, '/api/admin/seller-promo/questions', { method: 'POST', deps: admin,
    body: { seller_key: 'qa-shop-1', items: [{ source: 'STORE_PASTE', text: '玄関に置けるか', product_ref: 'box-1' }] } })).json();
  assert.equal(questions.added, 1);
  const productId = db.prepare('SELECT id FROM seller_promo_products').get().id;
  const questionId = db.prepare('SELECT id FROM seller_promo_questions').get().id;
  const ai = fakeGemini({ productId, questionId });
  // kill switch OFF では手動起動も止まる
  assert.equal((await call({ ...env, SELLER_PROMO_ENABLED: 'false' }, '/api/admin/seller-promo/run', { method: 'POST', deps: admin, body: { seller_key: 'qa-shop-1' } })).status, 503);
  assert.equal((await call(env, '/api/admin/seller-promo/run', { method: 'POST', deps: admin, body: { seller_key: 'qa-shop-1', week_key: 'W41' } })).status, 400);
  const run = await (await call(env, '/api/admin/seller-promo/run', { method: 'POST', deps: { ...admin, fetchImpl: ai.fetchImpl }, body: { seller_key: 'qa-shop-1' } })).json();
  assert.equal(run.result.status, 'DONE');
  assert.equal(run.job.week_key, '2026-W41');
  const listed = await (await call(env, '/api/admin/seller-promo/deliverables?seller_key=qa-shop-1&week_key=2026-W41', { deps: admin })).json();
  assert.equal(listed.deliverables.length, 3);
  const usage = await (await call(env, '/api/admin/seller-promo/usage?month=2026-10', { deps: admin })).json();
  assert.equal(usage.usage[0].calls, 3);
  // 契約者側: seller_key はセッションから取る
  const seller = { readSeller: async () => ({ seller_key: 'qa-shop-1' }), now: () => MONDAY_0605_JST };
  const mine = await (await call(env, '/api/seller-promo/deliverables', { deps: seller })).json();
  assert.equal(mine.enrolled, true);
  assert.equal(mine.deliverables.length, 3);
  assert.equal(mine.deliverables[0].qa.model, undefined);
  const article = mine.deliverables.find((d) => d.type === 'ARTICLE');
  assert.equal((await call(env, `/api/seller-promo/deliverables/${article.id}/approve`, { method: 'POST', body: {}, deps: seller, origin: 'https://evil.example' })).status, 403);
  const approved = await (await call(env, `/api/seller-promo/deliverables/${article.id}/approve`, { method: 'POST', body: {}, deps: seller })).json();
  assert.equal(approved.deliverable.status, 'DELIVERED');
  const other = { readSeller: async () => ({ seller_key: 'other-shop' }) };
  assert.equal((await call(env, `/api/seller-promo/deliverables/${article.id}/approve`, { method: 'POST', body: {}, deps: other })).status, 404);
  assert.equal((await call(env, '/api/seller-promo/deliverables', { deps: { readSeller: async () => null } })).status, 401);
});

test('SELLER_PROMO_ENABLED=false では契約者 API・タブを出さず、料金（9,800／19,800）はどこにも出ない', async () => {
  const { adapter } = promoDb();
  const off = promoEnv(adapter, { SELLER_PROMO_ENABLED: 'false' });
  const response = await call(off, '/api/seller-promo/deliverables', { deps: { readSeller: async () => ({ seller_key: 'x-shop' }) } });
  assert.equal(response.status, 404);
  const html = await (await sellerPageResponse({ SELLER_PROMO_ENABLED: 'false' }, { account: 'A', tenants: ['itg'], plan: 'SELLER' })).text();
  assert.doesNotMatch(html, /今週のサポート|seller-promo\.js/);
  const on = await (await sellerPageResponse({ SELLER_PROMO_ENABLED: 'true' }, { account: 'A', tenants: ['itg'], plan: 'SELLER' })).text();
  assert.match(on, /今週のサポート/);
  assert.match(on, /seller-promo\.js/);
  for (const text of [html, on]) assert.doesNotMatch(text.normalize('NFKC'), /9,?800|19,?800/);
  assert.deepEqual(publicPromoPlans({}), { enabled: false, plans: [] });
  assert.equal(publicPromoPlans({ SELLER_PROMO_PLANS_ENABLED: 'true' }).plans.length, 2);
  const { readFileSync } = await import('node:fs');
  const client = readFileSync(new URL('../public/seller-promo.js', import.meta.url), 'utf8');
  assert.doesNotMatch(client, /9,?800|19,?800|\.innerHTML|insertAdjacentHTML/);
});

test('Stripe Price 作成は OK② の後だけ。lookup_key で冪等に、税込・JPY・月次で作る', async () => {
  assert.equal(ensurePricesAllowed({}, { confirm: 'CREATE_PRICES' }), 'STRIPE_PRICES_NOT_APPROVED');
  assert.equal(ensurePricesAllowed({ SELLER_PROMO_STRIPE_PRICES_APPROVED: 'true' }, {}), 'CONFIRM_REQUIRED');
  const calls = [];
  const created = new Map();
  const env = {
    STRIPE_SECRET_KEY: 'sk_test_0123456789abcdefABCDEF', SELLER_PROMO_STRIPE_PRICES_APPROVED: 'true',
    STRIPE_FETCH: async (url, init) => {
      const u = new URL(url);
      const form = new URLSearchParams(init.body || '');
      calls.push({ path: u.pathname, method: init.method, idem: init.headers['idempotency-key'] });
      if (init.method === 'GET') {
        const key = u.searchParams.get('lookup_keys[0]');
        return Response.json({ data: created.has(key) ? [created.get(key)] : [] });
      }
      if (u.pathname === '/v1/products') return Response.json({ id: `prod_${form.get('metadata[plan]')}` });
      const price = { id: `price_${form.get('lookup_key')}`, active: true, currency: form.get('currency'), unit_amount: Number(form.get('unit_amount')),
        recurring: { interval: form.get('recurring[interval]'), interval_count: Number(form.get('recurring[interval_count]')) },
        tax_behavior: form.get('tax_behavior'), lookup_key: form.get('lookup_key'), livemode: false };
      created.set(price.lookup_key, price);
      return Response.json(price);
    }
  };
  assert.equal(ensurePricesAllowed(env, { confirm: 'CREATE_PRICES' }), '');
  const first = await ensurePromoPrices(env);
  assert.equal(first.mode, 'test');
  assert.equal(first.prices.LIGHT.created, true);
  assert.equal(created.get(PROMO_PAID_PLANS.LIGHT.lookup_key).unit_amount, 9800);
  assert.equal(created.get(PROMO_PAID_PLANS.STANDARD.lookup_key).unit_amount, 19800);
  assert.ok(calls.filter((c) => c.method === 'POST').every((c) => c.idem?.startsWith('seller-promo-')));
  const second = await ensurePromoPrices(env);
  assert.equal(second.prices.STANDARD.created, false);
  assert.equal(calls.filter((c) => c.method === 'POST').length, 4);
});

test('月次レポート: 前月分を 1 回だけ作り、取れない数字は「計測不能」、提案に数字を書かない', async () => {
  const { db, adapter } = promoDb();
  const env = promoEnv(adapter, { INTERNAL_MEMBER_IDS: 'staff' });
  await call(env, '/api/admin/seller-promo/profiles', { method: 'POST', deps: admin, body: { seller_key: 'qa-shop-1', categories: ['文具'], qa: true, pilot_id: 'pilot_1' } });
  db.prepare(`INSERT INTO seller_promo_questions(id,seller_key,source,product_ref,text,text_hash,weight,created_at) VALUES('q1','qa-shop-1','STORE_PASTE','','替え芯は3本入りですか','h1',1,?)`).run('2026-09-20T00:00:00Z');
  db.prepare(`INSERT INTO seller_listing_pilot_saves(pilot_id,product_id,member_id,saved_at) VALUES('pilot_1','p','m1','2026-09-10T00:00:00Z'),('pilot_1','p','staff','2026-09-11T00:00:00Z')`).run();
  db.prepare(`INSERT INTO seller_promo_deliverables(id,job_id,seller_key,week_key,type,version,status,payload,qa,approved_at,published_target,published_url,published_at,created_at)
    VALUES('spd_x','j','qa-shop-1','2026-W38','ARTICLE',1,'PUBLISHED','{}','{}','2026-09-16T00:00:00Z','WORDPRESS','https://shop.example.jp/a','2026-09-16T00:00:00Z','2026-09-14T00:00:00Z')`).run();
  const profile = await readPromoProfile(adapter, 'qa-shop-1');
  const now = new Date('2026-09-30T21:05:00Z');
  assert.equal(monthlyReportDue(now), true);
  assert.equal(previousMonthKey(now), '2026-09');
  const first = await createMonthlyReport(env, profile, '2026-09', now);
  assert.equal(first.created, true);
  assert.equal(first.report.published_count, 1);
  assert.equal(first.report.approval_days_avg, 2);
  assert.deepEqual(first.report.published_urls, ['https://shop.example.jp/a']);
  assert.equal(first.report.hoshilu.saves, 1);
  assert.equal(first.report.hoshilu.notifications, '計測不能');
  assert.equal(first.report.hoshilu.referrals, 0);
  assert.equal(first.report.google_traffic, '計測不能');
  assert.equal(first.report.proposals.length, 3);
  assert.ok(first.report.proposals.every((p) => !/[0-9０-９]/u.test(p)));
  assert.equal((await createMonthlyReport(env, profile, '2026-09', now)).created, false);
});

test('料金 LP の下書き: OK② 前は管理者だけ。有料プランは販売 ON のときだけ差し込み、1,980円は「掲載のみ」', async () => {
  const { readFileSync } = await import('node:fs');
  const file = readFileSync(new URL('../public/for-sellers-preview.html', import.meta.url), 'utf8');
  assert.match(file, /noindex/);
  assert.match(file, /記事・SNS原稿・画像の制作は含みません/);
  assert.doesNotMatch(file.normalize('NFKC'), /9,?800|19,?800/);
  const ASSETS = { fetch: async () => new Response(file, { headers: { 'content-type': 'text/html' } }) };
  const page = (env, deps = {}) => handleSellerPromoRoutes(new Request(`${ORIGIN}/for-sellers-preview`), { ASSETS, ...env }, deps);
  assert.equal((await page({}, { authorize: async () => null })).status, 404);
  const asAdmin = await page({}, admin);
  assert.equal(asAdmin.status, 200);
  assert.equal(asAdmin.headers.get('x-robots-tag'), 'noindex, nofollow');
  const draft = await asAdmin.text();
  assert.doesNotMatch(draft.normalize('NFKC'), /9,?800|19,?800|SELLER_PROMO_PAID_PLANS/);
  const publicOff = await (await page({ SELLER_PROMO_LP_PREVIEW_PUBLIC: 'true' }, { authorize: async () => null })).text();
  assert.doesNotMatch(publicOff.normalize('NFKC'), /9,?800|19,?800/);
  const plansOn = await (await page({ SELLER_PROMO_LP_PREVIEW_PUBLIC: 'true', SELLER_PROMO_PLANS_ENABLED: 'true' }, { authorize: async () => null })).text();
  assert.match(plansOn, /Light 9,800円/);
  assert.match(plansOn, /Standard 19,800円/);
});

test('料金 LP の下書き: 第一画面と料金の前は「モールの外」の訴求（Cowork 依頼 §6）。禁止表現・旧オファーの文言は無い', async () => {
  const { readFileSync } = await import('node:fs');
  const { PROMO_FORBIDDEN_PHRASES } = await import('../src/seller-promo-qa.mjs');
  const { assertSellerMarketingCurrent } = await import('../src/seller-marketing-guard.mjs');
  const { AUTO_RENEW_OFFER } = await import('../public/seller-trial-policy.mjs');
  const file = readFileSync(new URL('../public/for-sellers-preview.html', import.meta.url), 'utf8');
  const text = file.replace(/<!--[\s\S]*?-->/gu, '').replace(/<style>[\s\S]*?<\/style>/gu, '').replace(/<[^>]+>/gu, ' ').replace(/&amp;/gu, '&');
  assert.match(text, /後回しになっていた「モールの外」の販促を、毎週かわりに。/);
  assert.match(text, /なぜ「モールの外」なのか/);
  assert.match(text, /HOSHILU の中と外、両方で/);
  assert.match(text, /毎週届くもの/);
  assert.ok(text.indexOf('なぜ「モールの外」なのか') < text.indexOf('掲載プラン'), '説明欄は料金の前');
  assert.match(text, /売上や順位は約束しません/);
  for (const phrase of PROMO_FORBIDDEN_PHRASES) assert.ok(!text.includes(phrase), `禁止表現: ${phrase}`);
  const active = { SELLER_MANUAL_PILOT_ENABLED: 'true', SELLER_PILOT_OFFER_VERSION: AUTO_RENEW_OFFER, SELLER_PILOT_RECRUITMENT_VERIFIED: AUTO_RENEW_OFFER,
    SELLER_PILOT_AUTORENEW_ENABLED: 'true', SELLER_PILOT_PAYMENTS_ENABLED: 'true', SELLER_PILOT_PAYMENT_MODE: 'live',
    SELLER_PILOT_1980_LIVE_PRICE_ID: 'price_fixture', SELLER_PILOT_1980_LIVE_PRODUCT_ID: 'prod_fixture' };
  assert.doesNotThrow(() => assertSellerMarketingCurrent({ content_id: 'seller-preview', caption: text }, active));
});

test('見出しが分からない CSV は AI が対応表の案を出すだけで取り込まず、人が確認して mapping 付きで再送する', async () => {
  const { db, adapter } = promoDb();
  const env = promoEnv(adapter);
  await call(env, '/api/admin/seller-promo/profiles', { method: 'POST', deps: admin, body: { seller_key: 'qa-shop-1', categories: ['文具'], qa: true } });
  const csv = '品目コード,品目,値段（円）\nA1,ノート,300\n';
  const ai = async () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ external_id: '品目コード', name: '品目', price_jpy: '値段（円）', url: '存在しない列', image_url: '' }) }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 } });
  const proposed = await call(env, '/api/admin/seller-promo/products/import', { method: 'POST', deps: { ...admin, fetchImpl: ai }, body: { seller_key: 'qa-shop-1', csv } });
  assert.equal(proposed.status, 409);
  const body = await proposed.json();
  assert.deepEqual(body.proposal, { external_id: '品目コード', name: '品目', price_jpy: '値段（円）', url: '', image_url: '' });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM seller_promo_products').get().n, 0);
  assert.ok(db.prepare("SELECT 1 FROM seller_promo_audit WHERE action='CSV_MAPPING_PROPOSED'").get());
  const imported = await (await call(env, '/api/admin/seller-promo/products/import', { method: 'POST', deps: admin, body: { seller_key: 'qa-shop-1', csv, mapping: body.proposal } })).json();
  assert.equal(imported.imported, 1);
  assert.deepEqual({ ...db.prepare('SELECT external_id,name,price_jpy FROM seller_promo_products').get() }, { external_id: 'A1', name: 'ノート', price_jpy: 300 });
  // AI を使わない指定・AI 未設定なら従来どおり見出しを返す
  const plain = await call({ ...env, GEMINI_API_KEY: '' }, '/api/admin/seller-promo/products/import', { method: 'POST', deps: admin, body: { seller_key: 'qa-shop-1', csv } });
  assert.equal((await plain.json()).error, 'CSV_MAPPING_REQUIRED');
});
