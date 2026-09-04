import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  adjustBalance, createBillingAccount, creditTopup, getAllowanceForMonth, getBillingAccount, getWallet,
  handleSellerBillingRoutes, handleStripeWebhook, jstMonthKey, processStripeEvent, sellerBillingReadiness,
  settleQualifiedClickCharge, trialEndUnix, validTopupAmount
} from '../src/seller-billing.mjs';
import { computeStripeSignature, encodeStripeForm, verifyStripeWebhook } from '../src/stripe-client.mjs';
import { referralCategoryFor } from '../src/seller-referral-category.mjs';
import { applySellerPriority } from '../src/seller-priority-console.mjs';

function d1(db) {
  return { prepare(sql) {
    const statement = db.prepare(sql); let values = [];
    return {
      bind(...next) { values = next; return this; },
      async run() { const info = statement.run(...values); return { success: true, meta: { changes: Number(info.changes) } }; },
      async all() { return { results: statement.all(...values) }; },
      async first() { return statement.get(...values) ?? null; }
    };
  } };
}

function databaseEnv(extra = {}) {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0048_seller_priority_console.sql', '0067_seller_billing_stripe.sql']) {
    db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  return { db, env: { PRODUCT_DB: d1(db), ...extra } };
}

const KEY_A = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const KEY_B = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

async function registerAccount(env, overrides = {}) {
  return createBillingAccount(env, {
    seller_key: KEY_A, account_name: '星商事', contact_email: 'seller@example.com', tenants: ['itg'],
    plan: 'BUSINESS', payment_preference: 'CARD', seller_ids: [{ tenant: 'itg', seller_id: 'A1SELLER' }], ...overrides
  }, { origin: 'https://hoshilu.app', now: new Date('2026-09-04T01:00:00Z') });
}

test('Stripe 未設定でも健全性は「未接続」を返し、課金は行わずリダイレクトを止めない', async () => {
  assert.deepEqual(sellerBillingReadiness({}), { configured: false, mode: 'unconfigured', webhook_configured: false });
  assert.deepEqual(sellerBillingReadiness({ STRIPE_SECRET_KEY: 'sk_test_' + 'a'.repeat(24), STRIPE_WEBHOOK_SECRET: 'whsec_' + 'b'.repeat(24) }),
    { configured: true, mode: 'test', webhook_configured: true });
  const { env } = databaseEnv();
  const result = await settleQualifiedClickCharge(env, { sp: true, sid: 'X', u: 'sess' }, '2026-09-04T01:00:00Z');
  assert.equal(result.charged, false);
  assert.equal(result.reason, 'SELLER_NOT_BOUND');
});

test('Stripe の form エンコードと Webhook 署名検証', async () => {
  assert.deepEqual(encodeStripeForm({ a: 1, b: { c: 'x y' }, d: ['p', 'q'] }), ['a=1', 'b%5Bc%5D=x%20y', 'd%5B0%5D=p', 'd%5B1%5D=q']);
  const secret = 'whsec_' + 'k'.repeat(24);
  const body = JSON.stringify({ id: 'evt_1', type: 'ping' });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await computeStripeSignature(secret, timestamp, body);
  const event = await verifyStripeWebhook(body, `t=${timestamp},v1=${signature}`, secret);
  assert.equal(event.id, 'evt_1');
  await assert.rejects(verifyStripeWebhook(body, `t=${timestamp},v1=${'0'.repeat(64)}`, secret), /STRIPE_SIGNATURE_INVALID/);
  await assert.rejects(verifyStripeWebhook(body, `t=${timestamp - 3600},v1=${signature}`, secret), /STRIPE_SIGNATURE_EXPIRED/);
});

test('送客料ジャンルは価格表の11区分へ寄せ、判定不能は OTHER', () => {
  assert.equal(referralCategoryFor('bag', '自立する本革トートバッグ'), 'FASHION');
  assert.equal(referralCategoryFor('unclassified', '韓国コスメ ピンク リップ'), 'COSMETICS');
  assert.equal(referralCategoryFor('lamp', ''), 'GADGET');
  assert.equal(referralCategoryFor('pillow', 'コアラマットレス'), 'LIFESTYLE');
  assert.equal(referralCategoryFor('', ''), 'OTHER');
  assert.equal(referralCategoryFor('unclassified', 'スモーキークォーツ リング'), 'FASHION');
});

test('3か月トライアルは登録日の暦3か月後（JST）0時、チャージ額は3,000〜500,000円', () => {
  const end = new Date(trialEndUnix(new Date('2026-09-04T01:00:00Z')) * 1000).toISOString();
  assert.equal(end, '2026-12-03T15:00:00.000Z'); // = 2026-12-04 00:00 JST
  assert.equal(validTopupAmount(10000), 10000);
  assert.throws(() => validTopupAmount(2999), /TOPUP_AMOUNT_INVALID/);
  assert.throws(() => validTopupAmount(500001), /TOPUP_AMOUNT_INVALID/);
});

test('管理者がアカウントを作ると財布と優先出品の紐付けができ、Stripe未接続なら警告だけ返す', async () => {
  const { env, db } = databaseEnv();
  const result = await registerAccount(env);
  assert.equal(result.account.plan, 'BUSINESS');
  assert.equal(result.account.status, 'PENDING_PAYMENT');
  assert.deepEqual(result.warnings, ['STRIPE_NOT_CONFIGURED']);
  assert.equal(result.emailed, false);
  assert.equal((await getWallet(env.PRODUCT_DB, KEY_A)).status, 'UNFUNDED');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM seller_priority_memberships WHERE seller_key=?').get(KEY_A).c, 1);
  await assert.rejects(registerAccount(env), /ACCOUNT_EXISTS/);
  await assert.rejects(createBillingAccount(env, { account_name: 'x', contact_email: 'bad', plan: 'SELLER' }), /CONTACT_EMAIL_INVALID/);
  // 無料プランは月額が無いので即 ACTIVE。
  const free = await createBillingAccount(env, { seller_key: KEY_B, account_name: '無料店', contact_email: 'free@example.com', plan: 'SELLER' }, { origin: 'https://hoshilu.app' });
  assert.equal(free.account.status, 'ACTIVE');
  assert.equal((await getWallet(env.PRODUCT_DB, KEY_B)).status, 'ACTIVE');
});

test('Business の有効クリックは定価の50%を無料枠→前払い残高の順に消化し、同一セッション×商品×セラーは1日1回', async () => {
  const { env, db } = databaseEnv();
  await registerAccount(env);
  // Webhook でサブスク有効化（trialing → ACTIVE）
  await processStripeEvent(env, { type: 'customer.subscription.created', data: { object: {
    id: 'sub_1', status: 'trialing', trial_end: 1_800_000_000, current_period_end: 1_800_000_000, metadata: { seller_key: KEY_A }
  } } }, '2026-09-04T01:00:00Z');
  assert.equal((await getBillingAccount(env.PRODUCT_DB, KEY_A)).status, 'ACTIVE');
  assert.equal((await getWallet(env.PRODUCT_DB, KEY_A)).status, 'ACTIVE');

  const payload = { sp: true, sid: 'A1SELLER', tn: 'itg', u: 'sess-1', hpid: 'hp-1', rc: 'FASHION' };
  const first = await settleQualifiedClickCharge(env, payload, '2026-09-04T01:00:00Z');
  assert.deepEqual(first, { charged: true, unit_jpy: 19, from_allowance_jpy: 19, reason: 'SETTLED' });
  const duplicate = await settleQualifiedClickCharge(env, payload, '2026-09-04T05:00:00Z');
  assert.equal(duplicate.reason, 'DUPLICATE_24H');
  const nextDay = await settleQualifiedClickCharge(env, payload, '2026-09-04T16:00:00Z'); // JST 翌日
  assert.equal(nextDay.charged, true);
  // 自然掲載（sp なし）は課金しない
  assert.equal((await settleQualifiedClickCharge(env, { ...payload, sp: false, u: 'sess-2' })).reason, 'NOT_PRIORITY_CLICK');

  const allowance = await getAllowanceForMonth(env.PRODUCT_DB, await getBillingAccount(env.PRODUCT_DB, KEY_A), jstMonthKey(new Date('2026-09-04T01:00:00Z')));
  assert.equal(allowance.consumed_micros_jpy, 38 * 1_000_000);
  assert.equal(allowance.remaining_micros_jpy, (5000 - 38) * 1_000_000);
  assert.equal((await getWallet(env.PRODUCT_DB, KEY_A)).balance_micros_jpy, 0);

  // 無料枠を使い切ると残高から。残高0なら VOID（請求しない）。
  db.prepare('UPDATE seller_billing_allowance_months SET consumed_micros_jpy=granted_micros_jpy').run();
  const unfunded = await settleQualifiedClickCharge(env, { ...payload, u: 'sess-3', rc: 'COSMETICS' }, '2026-09-04T02:00:00Z');
  assert.equal(unfunded.reason, 'INSUFFICIENT_BALANCE');
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM seller_qualified_click_charges WHERE status='VOID'").get().c, 1);

  await creditTopup(env.PRODUCT_DB, { sellerKey: KEY_A, amountJpy: 1000, stripeObjectId: 'pi_1' });
  const funded = await settleQualifiedClickCharge(env, { ...payload, u: 'sess-4', rc: 'COSMETICS' }, '2026-09-04T02:00:00Z');
  assert.deepEqual(funded, { charged: true, unit_jpy: 29, from_allowance_jpy: 0, reason: 'SETTLED' });
  assert.equal((await getWallet(env.PRODUCT_DB, KEY_A)).balance_micros_jpy, (1000 - 29) * 1_000_000);
  const ledger = db.prepare('SELECT entry_type,amount_micros_jpy FROM seller_billing_ledger ORDER BY rowid').all();
  assert.deepEqual(ledger.map((row) => [row.entry_type, row.amount_micros_jpy]), [['TOPUP', 1000_000_000], ['REFERRAL_CHARGE', -29_000_000]]);
});

test('無料プランは定価を残高から消化し、無料枠は無い', async () => {
  const { env } = databaseEnv();
  await createBillingAccount(env, { seller_key: KEY_B, account_name: '無料店', contact_email: 'free@example.com', plan: 'SELLER',
    seller_ids: [{ tenant: 'mc2', seller_id: 'FREE1' }] }, { origin: 'https://hoshilu.app' });
  await creditTopup(env.PRODUCT_DB, { sellerKey: KEY_B, amountJpy: 3000, stripeObjectId: 'pi_free' });
  const result = await settleQualifiedClickCharge(env, { sp: true, sid: 'FREE1', tn: 'mc2', u: 's', hpid: 'p', rc: 'FASHION' }, '2026-09-04T01:00:00Z');
  assert.deepEqual(result, { charged: true, unit_jpy: 38, from_allowance_jpy: 0, reason: 'SETTLED' });
  assert.equal((await getWallet(env.PRODUCT_DB, KEY_B)).balance_micros_jpy, (3000 - 38) * 1_000_000);
});

test('入金は Stripe オブジェクトIDで冪等、Webhook はイベントIDで重複を弾き、未払いで停止・入金で再開', async () => {
  const secret = 'whsec_' + 'k'.repeat(24);
  const { env, db } = databaseEnv({ STRIPE_WEBHOOK_SECRET: secret });
  await registerAccount(env);
  const send = async (event) => {
    const body = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await computeStripeSignature(secret, timestamp, body);
    return handleStripeWebhook(new Request('https://hoshilu.app/api/stripe/webhook', {
      method: 'POST', body, headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` }
    }), env);
  };
  const topup = { id: 'evt_topup', type: 'checkout.session.completed', data: { object: {
    id: 'cs_1', payment_status: 'paid', amount_total: 10000, payment_intent: 'pi_10k', metadata: { seller_key: KEY_A, purpose: 'TOPUP' }
  } } };
  assert.equal((await (await send(topup)).json()).result, 'TOPUP_CREDITED');
  assert.equal((await (await send(topup)).json()).duplicate, true);
  // 同じ PaymentIntent の payment_intent.succeeded が別イベントIDで届いても二重加算しない
  const intent = { id: 'evt_pi', type: 'payment_intent.succeeded', data: { object: { id: 'pi_10k', amount_received: 10000, metadata: { seller_key: KEY_A, purpose: 'TOPUP' } } } };
  assert.equal((await (await send(intent)).json()).result, 'TOPUP_DUPLICATE');
  assert.equal((await getWallet(env.PRODUCT_DB, KEY_A)).balance_micros_jpy, 10000 * 1_000_000);
  // 署名不正は 400
  const bad = await handleStripeWebhook(new Request('https://hoshilu.app/api/stripe/webhook', { method: 'POST', body: '{}', headers: { 'stripe-signature': 't=1,v1=00' } }), env);
  assert.equal(bad.status, 400);
  // 月額未払い → 停止 → 入金で再開
  await send({ id: 'evt_fail', type: 'invoice.payment_failed', data: { object: { subscription: 'sub_1', metadata: {}, customer: 'cus_x' } } });
  // customer 未紐付けなら NO_ACCOUNT（誤停止しない）
  assert.equal(db.prepare("SELECT result FROM stripe_webhook_events WHERE event_id='evt_fail'").get().result, 'NO_ACCOUNT');
  db.prepare('UPDATE seller_billing_accounts SET stripe_customer_id=? WHERE seller_key=?').run('cus_x', KEY_A);
  await send({ id: 'evt_fail2', type: 'invoice.payment_failed', data: { object: { subscription: 'sub_1', customer: 'cus_x' } } });
  assert.equal((await getBillingAccount(env.PRODUCT_DB, KEY_A)).status, 'SUSPENDED_UNPAID');
  assert.equal((await getWallet(env.PRODUCT_DB, KEY_A)).status, 'PAUSED');
  await send({ id: 'evt_paid', type: 'invoice.paid', data: { object: { subscription: 'sub_1', customer: 'cus_x' } } });
  assert.equal((await getBillingAccount(env.PRODUCT_DB, KEY_A)).status, 'ACTIVE');
  assert.equal((await getWallet(env.PRODUCT_DB, KEY_A)).status, 'ACTIVE');
  // 管理者調整: 残高不足の減額は拒否
  await assert.rejects(adjustBalance(env.PRODUCT_DB, { sellerKey: KEY_A, amountJpy: -20000, note: 'x' }), /INSUFFICIENT_BALANCE/);
  await adjustBalance(env.PRODUCT_DB, { sellerKey: KEY_A, amountJpy: -1000, note: '返金' });
  assert.equal((await getWallet(env.PRODUCT_DB, KEY_A)).balance_micros_jpy, 9000 * 1_000_000);
});

test('セラーAPIは未ログイン401・未登録404・Stripe未接続503を区別し、GET /api/seller/billing は残高と無料枠を返す', async () => {
  const { env } = databaseEnv();
  const seller = { seller_key: KEY_A, tenants: ['itg'], plan: 'BUSINESS' };
  const get = (path, init) => handleSellerBillingRoutes(new Request(`https://hoshilu.app${path}`, init), env, seller);
  assert.equal((await handleSellerBillingRoutes(new Request('https://hoshilu.app/api/seller/billing'), env, null)).status, 401);
  const summary = await (await get('/api/seller/billing')).json();
  assert.equal(summary.account, null);
  assert.equal(summary.wallet.available_jpy, 0);
  assert.equal((await get('/api/seller/billing/topup', { method: 'POST', body: '{"amount_jpy":10000}' })).status, 404);
  await registerAccount(env);
  assert.equal((await get('/api/seller/billing/topup', { method: 'POST', body: '{"amount_jpy":10000}' })).status, 503);
  const after = await (await get('/api/seller/billing')).json();
  assert.equal(after.account.plan, 'BUSINESS');
  assert.equal(after.allowance.granted_jpy, 5000);
  assert.deepEqual(after.topup_presets_jpy, [5000, 10000, 30000, 50000]);
});

test('Stripe へ渡す Checkout / Subscription の中身（カードは自動引落・銀行振込は請求書＋専用口座・3か月トライアル）', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), body: String(init.body || ''), idem: init.headers['idempotency-key'] || '' });
    const path = new URL(url).pathname;
    const respond = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
    if (path === '/v1/customers') return respond({ id: 'cus_new' });
    if (path === '/v1/prices' && init.method === 'GET') return respond({ data: [] });
    if (path === '/v1/products') return respond({ id: 'prod_1' });
    if (path === '/v1/prices') return respond({ id: 'price_9800' });
    if (path === '/v1/checkout/sessions') return respond({ id: 'cs_x', url: 'https://checkout.stripe.com/c/pay/cs_x' });
    if (path === '/v1/subscriptions') return respond({ id: 'sub_bank', status: 'trialing', trial_end: 1_800_000_000, current_period_end: 1_800_000_000 });
    return respond({});
  };
  const { env } = databaseEnv({ STRIPE_SECRET_KEY: 'sk_test_' + 'a'.repeat(24), STRIPE_FETCH: fetcher });
  const card = await registerAccount(env);
  assert.equal(card.warnings.length, 0);
  assert.equal(card.links.subscription.mode, 'card_checkout');
  assert.match(card.links.subscription.url, /checkout\.stripe\.com/u);
  const subscriptionCall = calls.find((call) => call.url.endsWith('/checkout/sessions') && call.body.includes('mode=subscription'));
  assert.match(subscriptionCall.body, /line_items%5B0%5D%5Bprice%5D=price_9800/u);
  assert.match(subscriptionCall.body, /subscription_data%5Btrial_end%5D=\d+/u);
  assert.match(subscriptionCall.body, /payment_method_collection=always/u);
  const topupCall = calls.find((call) => call.url.endsWith('/checkout/sessions') && call.body.includes('mode=payment'));
  assert.match(topupCall.body, /unit_amount%5D=10000/u);
  assert.match(topupCall.body, /setup_future_usage%5D=off_session/u);
  assert.match(topupCall.body, /purpose%5D=TOPUP/u);
  const priceCall = calls.find((call) => call.url.endsWith('/v1/prices') && call.body);
  assert.match(priceCall.body, /unit_amount=9800/u);
  assert.match(priceCall.body, /tax_behavior=inclusive/u);
  assert.match(priceCall.body, /recurring%5Binterval%5D=month/u);

  const bank = await createBillingAccount(env, { seller_key: KEY_B, account_name: '振込店', contact_email: 'bank@example.com', plan: 'BUSINESS', payment_preference: 'BANK_TRANSFER' },
    { origin: 'https://hoshilu.app', now: new Date('2026-09-04T01:00:00Z') });
  assert.equal(bank.links.subscription.mode, 'bank_transfer');
  const bankSub = calls.find((call) => call.url.endsWith('/v1/subscriptions'));
  assert.match(bankSub.body, /collection_method=send_invoice/u);
  assert.match(bankSub.body, /days_until_due=14/u);
  assert.match(bankSub.body, /bank_transfer%5D%5Btype%5D=jp_bank_transfer/u);
  assert.equal(bank.account.status, 'ACTIVE'); // trialing
  const bankTopup = calls.filter((call) => call.body.includes('mode=payment')).at(-1);
  assert.match(bankTopup.body, /payment_method_types%5B0%5D=customer_balance/u);
  // 秘密鍵をログや本文へ出さない
  assert.equal(calls.some((call) => call.body.includes('sk_test')), false);
});

test('優先出品は Business の無料枠が残っていれば残高0でも出る（無料プランは残高>0だけ）', () => {
  const candidate = { product_name: 'x' };
  const offers = [{ tenant: 'itg', seller_id: 'A', product_url: 'https://example.com' }];
  const rule = { scope_type: 'ALL', scope_value: '*', priority_started_at: '2026-09-01' };
  const context = new Map([['itg\nA', [{ ...rule, wallet_status: 'ACTIVE', available_micros_jpy: 0, allowance_remaining_micros_jpy: 5_000_000_000 }]]]);
  assert.equal(applySellerPriority(candidate, offers, context)[0].priority_listing, true);
  const empty = new Map([['itg\nA', [{ ...rule, wallet_status: 'ACTIVE', available_micros_jpy: 0, allowance_remaining_micros_jpy: 0 }]]]);
  assert.equal(applySellerPriority(candidate, offers, empty)[0].priority_listing, undefined);
  const paused = new Map([['itg\nA', [{ ...rule, wallet_status: 'PAUSED', available_micros_jpy: 9_000_000, allowance_remaining_micros_jpy: 5_000_000_000 }]]]);
  assert.equal(applySellerPriority(candidate, offers, paused)[0].priority_listing, undefined);
});
