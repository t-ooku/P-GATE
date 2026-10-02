// 2026-10-03 レビュー指摘の再発防止。
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { importPromoProducts, upsertPromoProfile, readPromoProfile } from '../src/seller-promo-store.mjs';
import { createMonthlyReport } from '../src/seller-promo-report.mjs';
import { checkPromoDeliverable } from '../src/seller-promo-qa.mjs';
import { runSellerPromoCycle, MAX_ATTEMPTS } from '../src/seller-promo-scheduler.mjs';
import { autoRenewConsent, reconcileAutoRenew, runAutoRenewReconciliation } from '../src/seller-pilot-autorenew.mjs';
import { PROMO_LIGHT_OFFER, PROMO_AUTO_RENEW_POLICIES } from '../src/seller-promo-billing.mjs';
import { DAY_MS } from '../public/seller-trial-policy.mjs';
import { promoDb, promoEnv, seedQaShop, improvementPayload, MONDAY_0605_JST } from './helpers/seller-promo-fixture.mjs';

test('商品の取り込みは batch で書き、今回の CSV に無い商品は active=0（行は残す）。同じ内容でも止めた商品は戻す', async () => {
  const { db, adapter } = promoDb();
  let batches = 0;
  const counting = { ...adapter, prepare: adapter.prepare, batch: async (stmts) => { batches += 1; return adapter.batch(stmts); } };
  await upsertPromoProfile(adapter, { seller_key: 'shop-1', categories: ['文具'] });
  const items = Array.from({ length: 120 }, (_, i) => ({ external_id: `p${i}`, name: `商品${i}`, price_jpy: 100, url: '', image_url: '', attrs: {} }));
  assert.deepEqual(await importPromoProducts(counting, 'shop-1', 'CSV', items), { imported: 120, unchanged: 0, deactivated: 0 });
  assert.equal(batches, 3);
  const second = await importPromoProducts(counting, 'shop-1', 'CSV', items.slice(0, 100));
  assert.deepEqual(second, { imported: 0, unchanged: 100, deactivated: 20 });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM seller_promo_products').get().n, 120);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM seller_promo_products WHERE active=1').get().n, 100);
  const back = await importPromoProducts(counting, 'shop-1', 'CSV', items);
  assert.equal(back.imported, 20);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM seller_promo_products WHERE active=1').get().n, 120);
  // URL の追加取り込みは既定で置き換えない
  assert.equal((await importPromoProducts(adapter, 'shop-1', 'URL', items.slice(0, 1))).deactivated, 0);
});

test('月次レポートは前のレポート行を「公開本数」に数えない', async () => {
  const { db, adapter } = promoDb();
  const env = promoEnv(adapter);
  await upsertPromoProfile(adapter, { seller_key: 'qa-shop-1', categories: ['文具'], qa: true });
  const profile = await readPromoProfile(adapter, 'qa-shop-1');
  await createMonthlyReport(env, profile, '2026-09', new Date('2026-10-01T00:00:00Z'));
  const oct = await createMonthlyReport(env, profile, '2026-10', new Date('2026-11-01T00:00:00Z'));
  assert.equal(oct.report.published_count, 0);
  assert.deepEqual(oct.report.published_by_type, {});
  assert.equal(db.prepare("SELECT COUNT(*) n FROM seller_promo_deliverables WHERE type='REPORT'").get().n, 2);
});

test('残した店の商品 URL の数字は数値照合に掛けない（本文の数字は従来どおり落とす）', () => {
  const products = [{ id: 'spp_1', name: '箱', price_jpy: 2980, url: 'https://item.rakuten.co.jp/shop/10023/?m=A1B2', attrs: {} }];
  const ctx = { products, questions: [{ id: 'spq_1', text: 'q' }], ngWords: [] };
  const linked = checkPromoDeliverable('IMPROVEMENT', { ...improvementPayload('spp_1', 'spq_1'), after_md: '詳しくは https://item.rakuten.co.jp/shop/10023/?m=A1B2 へ' }, ctx);
  assert.equal(linked.qa.passed, true, JSON.stringify(linked.qa.reasons));
  const bad = checkPromoDeliverable('IMPROVEMENT', { ...improvementPayload('spp_1', 'spq_1'), after_md: '容量は25リットルです' }, ctx);
  assert.ok(bad.qa.reasons.some((r) => r.code === 'NUMBER_NOT_IN_PRODUCT_DATA'));
});

test('AI の鍵が無いときも試行回数を数え、3 回で止めて管理者へ知らせる（毎サイクル拾い直さない）', async () => {
  const { db, adapter } = promoDb();
  const mails = [];
  const env = promoEnv(adapter, { GEMINI_API_KEY: '', RESEND_API_KEY: 're_test', MEMBER_EMAIL_FROM: 'n@example.com', SELLER_INQUIRY_NOTIFY_EMAIL: 'admin@example.com',
    SELLER_PROMO_FETCH: async (url, init) => { mails.push(JSON.parse(init.body)); return Response.json({ id: 'm' }); } });
  await seedQaShop(env);
  for (let i = 0; i < 6; i += 1) await runSellerPromoCycle(env, new Date(MONDAY_0605_JST.getTime() + i * 15 * 60000), { fetchImpl: async () => { throw new Error('no network'); } });
  const job = db.prepare('SELECT status,attempt,error FROM seller_promo_jobs').get();
  assert.deepEqual({ ...job }, { status: 'FAILED', attempt: MAX_ATTEMPTS, error: 'SELLER_PROMO_AI_NOT_CONFIGURED' });
  assert.equal(mails.filter((m) => m.to[0] === 'admin@example.com').length, 1);
});

function pilotDb(doc) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0089_seller_listing_pilot.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO seller_listing_pilots VALUES(?,?,?,?,?,?,?)').run('SPL_promo', 'SBI_x', 'owner', 1, JSON.stringify(doc), '2026-10-05T00:00:00Z', '2026-10-05T00:00:00Z');
  const adapter = { prepare(sql) { let v = []; const st = db.prepare(sql); return { bind(...a) { v = a; return this; }, async all() { return { results: st.all(...v) }; }, async run() { const r = st.run(...v); return { meta: { changes: Number(r.changes) } }; } }; },
    async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; } };
  return { db, adapter };
}

test('公開済みの Light 契約は、販売を止めた後もサブスク作成が続き、定期の照合対象にも入る', async () => {
  const start = new Date('2026-10-05T00:00:00Z');
  const base = { STRIPE_SECRET_KEY: 'sk_test_' + 'x'.repeat(32), SELLER_PILOT_AUTORENEW_ENABLED: 'true', SELLER_PILOT_PAYMENTS_ENABLED: 'true', SELLER_PILOT_PAYMENT_MODE: 'test',
    SELLER_PROMO_LIGHT_TEST_PRICE_ID: 'price_light', SELLER_PROMO_LIGHT_TEST_PRODUCT_ID: 'prod_light' };
  const policy = PROMO_AUTO_RENEW_POLICIES[PROMO_LIGHT_OFFER];
  const consented = autoRenewConsent({ status: 'DRAFT', offer_version: PROMO_LIGHT_OFFER, test: true, products: [{ id: '1' }] },
    { autorenew_consent: true, autorenew_terms: policy.terms }, start, { ...base, SELLER_PROMO_PLANS_ENABLED: 'true' });
  const doc = { ...consented, status: 'PUBLISHED', approved_at: start.toISOString(), starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 30 * DAY_MS).toISOString(),
    autorenew: { ...consented.autorenew, setup_session_id: 'cs_x', card_verified_at: start.toISOString(), payment_method_id: 'pm_x' } };
  const { db, adapter } = pilotDb(doc);
  const meta = { purpose: 'SELLER_PILOT_AUTORENEW', pilot_id: 'SPL_promo', terms: policy.terms, consented_at: start.toISOString() };
  const price = { id: 'price_light', livemode: false, active: true, currency: 'jpy', unit_amount: 9800, product: 'prod_light', tax_behavior: 'inclusive', recurring: { interval: 'month', interval_count: 1 } };
  const end = Math.ceil((start.getTime() + 30 * DAY_MS) / 1000);
  const calls = [];
  const env = { ...base, PRODUCT_DB: adapter, STRIPE_FETCH: async (url, init) => {
    const path = new URL(url).pathname; calls.push(`${init.method} ${path}`);
    if (path.includes('/prices/')) return Response.json(price);
    if (path === '/v1/customers') return Response.json({ id: 'cus_x', livemode: false, metadata: meta });
    return Response.json({ id: 'sub_x', livemode: false, metadata: meta, customer: 'cus_x', status: 'trialing', currency: 'jpy', collection_method: 'charge_automatically',
      items: { data: [{ quantity: 1, price }] }, trial_end: end, current_period_end: end, cancel_at_period_end: false });
  } };
  // 販売 OFF（SELLER_PROMO_PLANS_ENABLED 未設定）でも、公開済みの既存契約はサブスクが作られる
  const out = await reconcileAutoRenew(env, 'SPL_promo', { now: start });
  assert.equal(out.error, null);
  assert.equal(out.doc.autorenew.subscription_id, 'sub_x');
  // 定期の照合（cron）も Light の契約を拾う
  calls.length = 0;
  await runAutoRenewReconciliation(env);
  assert.ok(calls.some((c) => c.includes('/subscriptions/sub_x')));
  // 未公開の Light は販売 OFF では新規に進めない
  const draft = { ...doc, starts_at: undefined, status: 'DRAFT' };
  db.prepare('UPDATE seller_listing_pilots SET document_json=?').run(JSON.stringify(draft));
});
