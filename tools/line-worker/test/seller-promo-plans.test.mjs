import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { AUTO_RENEW_OFFER, AUTO_RENEW_TERMS, autoRenewPolicy as publicPolicy, DAY_MS } from '../public/seller-trial-policy.mjs';
import { autoRenewPolicy, knownOffer, contractMonthlyJpy, trialEnd, creatableOffer, offerPriceConfiguration } from '../src/seller-offer-registry.mjs';
import { PROMO_LIGHT_OFFER, PROMO_STANDARD_OFFER, PROMO_AUTO_RENEW_POLICIES } from '../src/seller-promo-billing.mjs';
import { autoRenewConsent, autoRenewReady, reconcileAutoRenew } from '../src/seller-pilot-autorenew.mjs';
import { handleSellerListingPilotRoutes } from '../src/seller-listing-pilot.mjs';

const start = new Date('2026-10-05T00:00:00Z');
const base = {
  STRIPE_SECRET_KEY: 'sk_test_' + 'x'.repeat(32), SELLER_PILOT_AUTORENEW_ENABLED: 'true', SELLER_PILOT_PAYMENTS_ENABLED: 'true', SELLER_PILOT_PAYMENT_MODE: 'test',
  SELLER_PILOT_1980_TEST_PRICE_ID: 'price_1980', SELLER_PILOT_1980_TEST_PRODUCT_ID: 'prod_1980',
  SELLER_PROMO_LIGHT_TEST_PRICE_ID: 'price_light', SELLER_PROMO_LIGHT_TEST_PRODUCT_ID: 'prod_light'
};
const on = { ...base, SELLER_PROMO_PLANS_ENABLED: 'true' };

test('1,980円の offer は registry を通しても公開ポリシーと同じ。Light/Standard は公開ファイルに無い', () => {
  assert.deepEqual(autoRenewPolicy(AUTO_RENEW_OFFER), publicPolicy(AUTO_RENEW_OFFER));
  assert.equal(contractMonthlyJpy({ offer_version: AUTO_RENEW_OFFER }), 1980);
  assert.equal(trialEnd('2026-10-01T00:00:00.000Z', AUTO_RENEW_OFFER), '2026-10-31T00:00:00.000Z');
  assert.deepEqual(offerPriceConfiguration(base, 'test'), { price_id: 'price_1980', product_id: 'prod_1980', mode: 'test' });
  assert.equal(contractMonthlyJpy({ offer_version: PROMO_LIGHT_OFFER }), 9800);
  assert.equal(contractMonthlyJpy({ offer_version: PROMO_STANDARD_OFFER }), 19800);
  assert.equal(knownOffer(PROMO_LIGHT_OFFER), true);
  assert.equal(trialEnd('2026-10-01T00:00:00.000Z', PROMO_LIGHT_OFFER), '2026-10-31T00:00:00.000Z');
  assert.equal(publicPolicy(PROMO_LIGHT_OFFER), null);
  const publicFile = readFileSync(new URL('../public/seller-trial-policy.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(publicFile.normalize('NFKC'), /9,?800|19,?800|promo-light|promo-standard/);
  for (const policy of Object.values(PROMO_AUTO_RENEW_POLICIES)) {
    assert.equal(policy.trial_days, 30);
    assert.equal(policy.tax_behavior, 'inclusive');
    assert.match(policy.copy, /30日間無料.*カード登録.*自動更新.*解約/u);
  }
});

test('販売 OFF の間は Light/Standard の同意・申込ができない（1,980円は従来どおり）', () => {
  assert.equal(creatableOffer(base, PROMO_LIGHT_OFFER), false);
  assert.equal(creatableOffer(base, AUTO_RENEW_OFFER), true);
  assert.equal(autoRenewReady(base, PROMO_LIGHT_OFFER), false);
  assert.equal(autoRenewReady(base), true);
  const draft = { status: 'DRAFT', offer_version: PROMO_LIGHT_OFFER };
  assert.throws(() => autoRenewConsent(draft, { autorenew_consent: true, autorenew_terms: PROMO_AUTO_RENEW_POLICIES[PROMO_LIGHT_OFFER].terms }, start, base), /NOT_ALLOWED/);
  const legacy = autoRenewConsent({ status: 'DRAFT', offer_version: AUTO_RENEW_OFFER }, { autorenew_consent: true, autorenew_terms: AUTO_RENEW_TERMS }, start, base);
  assert.equal(legacy.autorenew.contract.amount, 1980);
  assert.equal(legacy.autorenew.contract.price_id, 'price_1980');
});

test('販売 ON: Light は 9,800円の契約として同意・サブスク作成され、金額の違う Price は拒否する', async () => {
  const policy = PROMO_AUTO_RENEW_POLICIES[PROMO_LIGHT_OFFER];
  assert.throws(() => autoRenewConsent({ status: 'DRAFT', offer_version: PROMO_LIGHT_OFFER }, { autorenew_consent: true, autorenew_terms: AUTO_RENEW_TERMS }, start, on), /CONSENT_REQUIRED/);
  const consented = autoRenewConsent({ status: 'DRAFT', offer_version: PROMO_LIGHT_OFFER, test: true, products: [{ id: '1' }] },
    { autorenew_consent: true, autorenew_terms: policy.terms }, start, on);
  assert.equal(consented.autorenew.contract.amount, 9800);
  assert.equal(consented.autorenew.contract.price_id, 'price_light');
  assert.equal(consented.autorenew.accepted_copy, policy.copy);
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0089_seller_listing_pilot.sql', import.meta.url), 'utf8'));
  const published = { ...consented, status: 'PUBLISHED', approved_at: start.toISOString(), starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 30 * DAY_MS).toISOString(),
    autorenew: { ...consented.autorenew, setup_session_id: 'cs_x', card_verified_at: start.toISOString(), payment_method_id: 'pm_test' } };
  db.prepare('INSERT INTO seller_listing_pilots VALUES(?,?,?,?,?,?,?)').run('SPL_promo', 'SBI_x', 'owner', 1, JSON.stringify(published), start.toISOString(), start.toISOString());
  const adapter = { prepare(sql) { let v = []; const st = db.prepare(sql); return { bind(...a) { v = a; return this; }, async all() { return { results: st.all(...v) }; }, async run() { const r = st.run(...v); return { meta: { changes: Number(r.changes) } }; } }; },
    async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; } };
  const meta = { purpose: 'SELLER_PILOT_AUTORENEW', pilot_id: 'SPL_promo', terms: policy.terms, consented_at: start.toISOString() };
  let unitAmount = 9800;
  const price = () => ({ id: 'price_light', livemode: false, active: true, currency: 'jpy', unit_amount: unitAmount, product: 'prod_light', tax_behavior: 'inclusive', recurring: { interval: 'month', interval_count: 1 } });
  const trialEndSec = Math.ceil((start.getTime() + 30 * DAY_MS) / 1000);
  const calls = [];
  const env = { ...on, PRODUCT_DB: adapter, STRIPE_FETCH: async (url, init) => {
    const path = new URL(url).pathname; calls.push({ path, method: init.method, body: new URLSearchParams(init.body || '') });
    if (path.includes('/prices/')) return Response.json(price());
    if (path === '/v1/customers') return Response.json({ id: 'cus_x', livemode: false, metadata: meta });
    return Response.json({ id: 'sub_x', livemode: false, metadata: meta, customer: 'cus_x', status: 'trialing', currency: 'jpy', collection_method: 'charge_automatically',
      items: { data: [{ quantity: 1, price: price() }] }, trial_end: trialEndSec, current_period_end: trialEndSec, cancel_at_period_end: false });
  } };
  unitAmount = 1980;
  const mismatch = await reconcileAutoRenew(env, 'SPL_promo', { now: start });
  assert.equal(mismatch.error, 'PRICE_OR_ENVIRONMENT_MISMATCH');
  assert.equal(calls.some((c) => c.path === '/v1/subscriptions'), false);
  // 失敗した作成依頼の再試行（同じ冪等キー）で、正しい 9,800円の Price なら作成される
  unitAmount = 9800;
  const ok = await reconcileAutoRenew(env, 'SPL_promo', { now: start });
  assert.equal(ok.error, null);
  assert.equal(ok.doc.autorenew.subscription_id, 'sub_x');
  assert.equal(calls.find((c) => c.path === '/v1/subscriptions').body.get('items[0][price]'), 'price_light');
});

test('申込（CREATE）の plan: 販売 OFF は PROMO_PLANS_NOT_ENABLED、ON なら Light の offer で作る', async () => {
  const db = new DatabaseSync(':memory:');
  for (const name of ['0058_seller_business_inquiries', '0089_seller_listing_pilot']) db.exec(readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8'));
  db.prepare(`INSERT INTO seller_business_inquiries(inquiry_id,inquiry_type,organization_type,organization_name,contact_name,contact_email,created_at,updated_at) VALUES('SBI_p','CONSULTATION','SELLER','t','','o@example.com','2026-01-01','2026-01-01')`).run();
  const adapter = { prepare(sql) { let v = []; const st = db.prepare(sql); return { bind(...a) { v = a; return this; }, async all() { return { results: st.all(...v) }; }, async run() { const r = st.run(...v); return { meta: { changes: Number(r.changes) } }; } }; },
    async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; } };
  const body = { action: 'CREATE', inquiry_id: 'SBI_p', plan: 'LIGHT', prior_terms_reviewed: true, shop_name: 's', business_name: 'b', registered_address: 'a', business_evidence_ref: 'e',
    external_evidence_ref: 'x', external_verified: true, test: true,
    products: [{ title: 't', image_url: 'https://example.com/a.png', destination_url: 'https://example.com/p', marketplace: 'OWN_STORE', permission_ref: 'p' }] };
  const deps = { authorize: async () => true, member: async () => ({ id: 'owner' }), ownerForEmail: async () => 'owner' };
  const call = (env) => handleSellerListingPilotRoutes(new Request('https://hoshilu.app/api/admin/seller-pilot', { method: 'POST', headers: { origin: 'https://hoshilu.app' }, body: JSON.stringify(body) }),
    { PRODUCT_DB: adapter, SELLER_MANUAL_PILOT_ENABLED: 'true', SELLER_PILOT_OFFER_VERSION: AUTO_RENEW_OFFER, ...env }, deps);
  const off = await call({});
  assert.equal(off.status, 400);
  assert.equal((await off.json()).error, 'PROMO_PLANS_NOT_ENABLED');
  const created = await call({ SELLER_PROMO_PLANS_ENABLED: 'true' });
  assert.equal(created.status, 201);
  assert.equal(JSON.parse(db.prepare('SELECT document_json FROM seller_listing_pilots').get().document_json).offer_version, PROMO_LIGHT_OFFER);
  body.plan = 'GOLD';
  assert.equal((await (await call({ SELLER_PROMO_PLANS_ENABLED: 'true' })).json()).error, 'PLAN_INVALID');
});
