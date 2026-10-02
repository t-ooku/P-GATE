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
