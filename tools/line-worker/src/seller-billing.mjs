// 2026-09-04 大隆さん指示「請求・決済の自動化して」「全部前払いね」。
//
// 料金（2026-09-03 決定・/for-sellers と同じ表）:
//   無料プラン : 月額0円。有効クリックはジャンル定価。前払い残高から消化。
//   Business   : 月額¥9,800（登録後3か月は月額0円）。有効クリックは定価の50%。
//                毎月5,000円分（Business単価で積算）まで0円、5,001円から前払い残高を消化。
//                無料枠は1か月目から、4か月目以降も。翌月繰越なし。
//
// 前払いの実現方法:
//   月額     : Stripe Subscription。期間開始時に請求（＝前払い）。3か月トライアル。
//              カード → 自動引落。銀行振込 → Stripe が請求書と専用振込口座をメールし、入金を自動照合。
//   送客料   : seller_billing_wallets（既存）の残高を、/go の有効クリックごとに減らす。
//              残高0なら優先出品が自動停止（applySellerPriority の既存判定）。捏造請求はしない。
//   チャージ : Stripe Checkout（カード／銀行振込）。入金確認 Webhook で残高へ加算。
//              カードは自動チャージ（残高が閾値を下回ったら保存済みカードへ off_session 課金）も選べる。
//
// 有効クリックの定義（v1.1 仕様 §有効送客 を実装できる範囲で）:
//   署名付き /go トークン経由・優先出品（sp=true）・セラーID付き・同一セッション×商品×セラーは
//   JST 1日1回・課金対象アカウントが ACTIVE。自然掲載（sp=false）は課金しない。
//
// Stripe の秘密鍵・Webhook シークレットは Cloudflare Secret（STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET）。
// 未設定でも検索・リダイレクトは止めない（課金だけ行わず、ログに残す）。

import {
  monthlyReferralFreeAllowanceJpy,
  qualifiedReferralUnitPriceJpy
} from './seller-qualified-referral-pricing.mjs';
import {
  StripeError, stripeConfigured, stripeMode, stripeRequest, stripeWebhookConfigured, verifyStripeWebhook
} from './stripe-client.mjs';
import { REFERRAL_CATEGORY_LABELS } from './seller-referral-category.mjs';

export const MICROS = 1_000_000;
export const BUSINESS_MONTHLY_FEE_JPY = 9800;
export const BUSINESS_TRIAL_MONTHS = 3;
export const TOPUP_PRESETS_JPY = Object.freeze([5000, 10000, 30000, 50000]);
export const TOPUP_MIN_JPY = 3000;
export const TOPUP_MAX_JPY = 500000;
const BUSINESS_PRICE_LOOKUP_KEY = 'hoshilu_business_monthly_9800_jpy';
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function clean(value, limit = 200) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, limit);
}
function yen(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}
function toMicros(jpy) { return yen(jpy) * MICROS; }
export function microsToYen(micros) { return Math.round(Number(micros || 0) / MICROS); }

export function jstDateKey(date = new Date()) {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}
export function jstMonthKey(date = new Date()) {
  return jstDateKey(date).slice(0, 7);
}
// 登録日から暦で3か月後（JST）の 0:00 を UNIX 秒で返す。
export function trialEndUnix(now = new Date(), months = BUSINESS_TRIAL_MONTHS) {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const end = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth() + months, jst.getUTCDate()));
  return Math.floor((end.getTime() - JST_OFFSET_MS) / 1000);
}

export function normalizeBillingPlan(plan) {
  const value = clean(plan, 20).toUpperCase();
  if (['BUSINESS', 'PARTNER', 'PRO', 'GROWTH', 'SCALE', 'STARTER'].includes(value)) return 'BUSINESS';
  return 'SELLER';
}

export function sellerBillingReadiness(env = {}) {
  return {
    configured: stripeConfigured(env),
    mode: stripeMode(env),
    webhook_configured: stripeWebhookConfigured(env)
  };
}

function validSellerKey(value) {
  const key = clean(value, 120);
  if (!/^[A-Za-z0-9_-]{20,120}$/u.test(key)) throw new Error('SELLER_KEY_INVALID');
  return key;
}
function newSellerKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '').slice(0, 43);
}
function parseTenants(value) {
  try {
    const list = Array.isArray(value) ? value : JSON.parse(String(value || '[]'));
    return [...new Set(list.map((item) => clean(item, 32).toLowerCase()).filter((item) => /^[a-z0-9_-]{1,32}$/u.test(item)))];
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// D1 読み書き
// ---------------------------------------------------------------------------

export async function getBillingAccount(db, sellerKey) {
  if (!db) return null;
  const row = await db.prepare('SELECT * FROM seller_billing_accounts WHERE seller_key=?1').bind(sellerKey).first();
  return row ? { ...row, tenants: parseTenants(row.tenants) } : null;
}

export async function getWallet(db, sellerKey) {
  if (!db) return null;
  return db.prepare(`SELECT seller_key,balance_micros_jpy,reserved_micros_jpy,status,updated_at
    FROM seller_billing_wallets WHERE seller_key=?1`).bind(sellerKey).first();
}

async function ensureWallet(db, sellerKey, now) {
  await db.prepare(`INSERT INTO seller_billing_wallets (seller_key,status,updated_at) VALUES (?1,'UNFUNDED',?2)
    ON CONFLICT(seller_key) DO NOTHING`).bind(sellerKey, now).run();
}

async function setWalletStatus(db, sellerKey, status, now) {
  await db.prepare('UPDATE seller_billing_wallets SET status=?2,updated_at=?3 WHERE seller_key=?1')
    .bind(sellerKey, status, now).run();
}

async function updateAccount(db, sellerKey, fields, now) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const assignments = keys.map((key, index) => `${key}=?${index + 3}`).join(',');
  await db.prepare(`UPDATE seller_billing_accounts SET ${assignments},updated_at=?2 WHERE seller_key=?1`)
    .bind(sellerKey, now, ...keys.map((key) => fields[key])).run();
}

export async function getAllowanceForMonth(db, account, month) {
  const granted = toMicros(monthlyReferralFreeAllowanceJpy(account?.plan === 'BUSINESS' ? 'BUSINESS' : 'SELLER'));
  if (!granted) return { granted_micros_jpy: 0, consumed_micros_jpy: 0, remaining_micros_jpy: 0 };
  const row = await db.prepare(`SELECT granted_micros_jpy,consumed_micros_jpy FROM seller_billing_allowance_months
    WHERE seller_key=?1 AND month=?2`).bind(account.seller_key, month).first();
  const consumed = Number(row?.consumed_micros_jpy || 0);
  const grantedNow = row ? Number(row.granted_micros_jpy) : granted;
  return { granted_micros_jpy: grantedNow, consumed_micros_jpy: consumed, remaining_micros_jpy: Math.max(0, grantedNow - consumed) };
}

// 無料枠から amount を（可能な分だけ）消化し、消化した額を返す。楽観ロックで二重消化を防ぐ。
async function consumeAllowance(db, account, amountMicros, now) {
  const month = jstMonthKey(new Date(now));
  const granted = toMicros(monthlyReferralFreeAllowanceJpy(account.plan === 'BUSINESS' ? 'BUSINESS' : 'SELLER'));
  if (!granted || amountMicros <= 0) return 0;
  await db.prepare(`INSERT INTO seller_billing_allowance_months (seller_key,month,granted_micros_jpy,consumed_micros_jpy,updated_at)
    VALUES (?1,?2,?3,0,?4) ON CONFLICT(seller_key,month) DO NOTHING`).bind(account.seller_key, month, granted, now).run();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const row = await db.prepare(`SELECT granted_micros_jpy,consumed_micros_jpy FROM seller_billing_allowance_months
      WHERE seller_key=?1 AND month=?2`).bind(account.seller_key, month).first();
    const consumed = Number(row?.consumed_micros_jpy || 0);
    const remaining = Math.max(0, Number(row?.granted_micros_jpy || 0) - consumed);
    const take = Math.min(remaining, amountMicros);
    if (take <= 0) return 0;
    const result = await db.prepare(`UPDATE seller_billing_allowance_months SET consumed_micros_jpy=?3,updated_at=?4
      WHERE seller_key=?1 AND month=?2 AND consumed_micros_jpy=?5`)
      .bind(account.seller_key, month, consumed + take, now, consumed).run();
    if (result?.meta?.changes === 1) return take;
  }
  return 0;
}

async function appendLedger(db, { sellerKey, entryType, amountMicros, stripeObjectId = '', sourceEventId = '', note = '', occurredAt }) {
  const wallet = await getWallet(db, sellerKey);
  await db.prepare(`INSERT INTO seller_billing_ledger
    (entry_id,seller_key,entry_type,amount_micros_jpy,balance_after_micros_jpy,stripe_object_id,source_event_id,note,occurred_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`)
    .bind(crypto.randomUUID(), sellerKey, entryType, amountMicros, Number(wallet?.balance_micros_jpy || 0),
      stripeObjectId, sourceEventId, clean(note, 200), occurredAt).run();
}

// 残高を減らす。残高不足なら false（残高は負にならない）。
async function debitWallet(db, sellerKey, amountMicros, now) {
  const result = await db.prepare(`UPDATE seller_billing_wallets
    SET balance_micros_jpy=balance_micros_jpy-?2,updated_at=?3
    WHERE seller_key=?1 AND balance_micros_jpy-reserved_micros_jpy>=?2`).bind(sellerKey, amountMicros, now).run();
  return result?.meta?.changes === 1;
}

// 入金を残高へ加算する（Stripe オブジェクト ID で冪等）。
export async function creditTopup(db, { sellerKey, amountJpy, stripeObjectId, entryType = 'TOPUP', note = '', now = new Date().toISOString() }) {
  const amount = toMicros(amountJpy);
  if (amount <= 0) return { credited: false, reason: 'AMOUNT_INVALID' };
  const objectId = clean(stripeObjectId, 120);
  if (objectId) {
    const existing = await db.prepare('SELECT entry_id FROM seller_billing_ledger WHERE stripe_object_id=?1').bind(objectId).first();
    if (existing) return { credited: false, reason: 'DUPLICATE' };
  }
  await ensureWallet(db, sellerKey, now);
  await db.prepare(`UPDATE seller_billing_wallets SET balance_micros_jpy=balance_micros_jpy+?2,
    status=CASE WHEN status='PAUSED' THEN 'PAUSED' ELSE 'ACTIVE' END,updated_at=?3 WHERE seller_key=?1`)
    .bind(sellerKey, amount, now).run();
  await appendLedger(db, { sellerKey, entryType, amountMicros: amount, stripeObjectId: objectId, note, occurredAt: now });
  return { credited: true, amount_jpy: yen(amountJpy) };
}

// ---------------------------------------------------------------------------
// 有効クリックの前払い消化（/go から ctx.waitUntil で呼ぶ。例外は外へ出さない）
// ---------------------------------------------------------------------------

async function accountForClick(env, payload) {
  const db = env.PRODUCT_DB;
  const sellerId = clean(payload.sid, 160);
  const tenant = clean(payload.tn, 32).toLowerCase();
  if (!sellerId) return null;
  let membership = null;
  if (tenant) {
    membership = await db.prepare(`SELECT seller_key,tenant,seller_id FROM seller_priority_memberships
      WHERE tenant=?1 AND seller_id=?2 LIMIT 1`).bind(tenant, sellerId).first();
  } else {
    const rows = await db.prepare(`SELECT seller_key,tenant,seller_id FROM seller_priority_memberships
      WHERE seller_id=?1 LIMIT 2`).bind(sellerId).all();
    if ((rows.results || []).length === 1) membership = rows.results[0];
  }
  if (!membership) return null;
  const account = await getBillingAccount(db, membership.seller_key);
  return { membership, account };
}

export function qualifiedClickSourceEventId(payload, occurredAt) {
  const product = clean(payload.hpid, 120) || clean(payload.a, 120) || 'unknown';
  return `qc:${clean(payload.u, 120)}:${product}:${clean(payload.sid, 160)}:${jstDateKey(new Date(occurredAt))}`;
}

export async function settleQualifiedClickCharge(env, payload = {}, occurredAt = new Date().toISOString()) {
  const db = env.PRODUCT_DB;
  if (!db) return { charged: false, reason: 'NO_DB' };
  try {
    if (payload.sp !== true || !payload.sid || !payload.u) return { charged: false, reason: 'NOT_PRIORITY_CLICK' };
    const resolved = await accountForClick(env, payload);
    if (!resolved) return { charged: false, reason: 'SELLER_NOT_BOUND' };
    const { membership, account } = resolved;
    if (!account || account.status !== 'ACTIVE') return { charged: false, reason: 'ACCOUNT_NOT_ACTIVE' };
    const unitJpy = qualifiedReferralUnitPriceJpy({ category: payload.rc || 'OTHER', plan: account.plan });
    const amountMicros = toMicros(unitJpy);
    const sourceEventId = qualifiedClickSourceEventId(payload, occurredAt);
    const chargeId = crypto.randomUUID();
    const inserted = await db.prepare(`INSERT INTO seller_qualified_click_charges
      (charge_id,source_event_id,seller_key,tenant,seller_id,hoshilu_product_id,amount_micros_jpy,status,occurred_at,created_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,'PENDING',?8,?8) ON CONFLICT(source_event_id) DO NOTHING`)
      .bind(chargeId, sourceEventId, account.seller_key, membership.tenant, membership.seller_id,
        clean(payload.hpid, 120) || null, amountMicros, occurredAt).run();
    if (inserted?.meta?.changes !== 1) return { charged: false, reason: 'DUPLICATE_24H' };
    const fromAllowance = await consumeAllowance(db, account, amountMicros, occurredAt);
    const remainder = amountMicros - fromAllowance;
    let settled = true;
    if (remainder > 0) {
      settled = await debitWallet(db, account.seller_key, remainder, occurredAt);
      if (settled) {
        await appendLedger(db, {
          sellerKey: account.seller_key, entryType: 'REFERRAL_CHARGE', amountMicros: -remainder,
          sourceEventId, note: `${REFERRAL_CATEGORY_LABELS[payload.rc] || 'その他'} ${unitJpy}円`, occurredAt
        });
      }
    }
    await db.prepare(`UPDATE seller_qualified_click_charges SET status=?2,settled_at=?3 WHERE charge_id=?1`)
      .bind(chargeId, settled ? 'SETTLED' : 'VOID', settled ? occurredAt : null).run();
    const wallet = await getWallet(db, account.seller_key);
    if (!settled) {
      // 残高不足: 台帳は VOID。優先出品は available>0 判定で自動停止する。
      console.warn('SELLER_BILLING_INSUFFICIENT_BALANCE', { seller_key: account.seller_key.slice(0, 8) });
    }
    await maybeAutoRecharge(env, account, wallet, occurredAt);
    return { charged: settled, unit_jpy: unitJpy, from_allowance_jpy: microsToYen(fromAllowance), reason: settled ? 'SETTLED' : 'INSUFFICIENT_BALANCE' };
  } catch (error) {
    console.warn('SELLER_BILLING_CLICK_CHARGE_FAILED', { code: String(error?.message || error).slice(0, 80) });
    return { charged: false, reason: 'ERROR' };
  }
}

// ---------------------------------------------------------------------------
// Stripe オブジェクト
// ---------------------------------------------------------------------------

async function ensureCustomer(env, account, now) {
  if (account.stripe_customer_id) return account.stripe_customer_id;
  const customer = await stripeRequest(env, 'POST', '/customers', {
    email: account.contact_email, name: account.account_name,
    preferred_locales: ['ja'], metadata: { seller_key: account.seller_key, plan: account.plan }
  }, { idempotencyKey: `customer:${account.seller_key}` });
  await updateAccount(env.PRODUCT_DB, account.seller_key, { stripe_customer_id: customer.id }, now);
  account.stripe_customer_id = customer.id;
  return customer.id;
}

export async function ensureBusinessPrice(env, now = new Date().toISOString()) {
  const db = env.PRODUCT_DB;
  const saved = await db.prepare('SELECT setting_value FROM seller_billing_settings WHERE setting_key=?1')
    .bind('stripe_business_price_id').first();
  if (saved?.setting_value) return saved.setting_value;
  const found = await stripeRequest(env, 'GET', '/prices', null, { query: { lookup_keys: [BUSINESS_PRICE_LOOKUP_KEY], active: 'true', limit: 1 } });
  let priceId = found?.data?.[0]?.id || '';
  if (!priceId) {
    const product = await stripeRequest(env, 'POST', '/products', {
      name: 'HOSHILU BUSINESS（月額）', description: 'ショップページ・優先出品・分析・毎月5,000円分の送客料込み。税込。',
      metadata: { hoshilu_plan: 'BUSINESS' }
    }, { idempotencyKey: 'product:hoshilu_business' });
    const price = await stripeRequest(env, 'POST', '/prices', {
      product: product.id, currency: 'jpy', unit_amount: BUSINESS_MONTHLY_FEE_JPY,
      recurring: { interval: 'month' }, tax_behavior: 'inclusive',
      lookup_key: BUSINESS_PRICE_LOOKUP_KEY, transfer_lookup_key: 'true'
    }, { idempotencyKey: 'price:hoshilu_business_9800' });
    priceId = price.id;
  }
  await db.prepare(`INSERT INTO seller_billing_settings (setting_key,setting_value,updated_at) VALUES (?1,?2,?3)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at`)
    .bind('stripe_business_price_id', priceId, now).run();
  return priceId;
}

const BANK_TRANSFER_OPTIONS = Object.freeze({
  customer_balance: { funding_type: 'bank_transfer', bank_transfer: { type: 'jp_bank_transfer' } }
});

function accountStatusFromSubscription(status) {
  const value = String(status || '').toLowerCase();
  if (['trialing', 'active'].includes(value)) return 'ACTIVE';
  if (['past_due', 'unpaid', 'incomplete'].includes(value)) return 'SUSPENDED_UNPAID';
  if (['canceled', 'incomplete_expired', 'paused'].includes(value)) return 'CANCELLED';
  return 'PENDING_PAYMENT';
}

async function applySubscriptionState(env, account, subscription, now) {
  const status = accountStatusFromSubscription(subscription.status);
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : '';
  const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : '';
  await updateAccount(env.PRODUCT_DB, account.seller_key, {
    stripe_subscription_id: subscription.id, subscription_status: String(subscription.status || ''),
    trial_end_at: trialEnd, current_period_end_at: periodEnd, status
  }, now);
  await ensureWallet(env.PRODUCT_DB, account.seller_key, now);
  // Business は無料枠があるので残高0でも ACTIVE。停止中は PAUSED（優先出品が止まる）。
  await setWalletStatus(env.PRODUCT_DB, account.seller_key, status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED', now);
  return status;
}

// Business の月額を開始する。カード → Checkout URL、銀行振込 → Subscription を直接作成（請求書メール）。
export async function startBusinessSubscription(env, account, { origin, now = new Date() } = {}) {
  if (account.plan !== 'BUSINESS') throw new Error('PLAN_NOT_BUSINESS');
  const nowIso = now.toISOString();
  const customerId = await ensureCustomer(env, account, nowIso);
  const priceId = await ensureBusinessPrice(env, nowIso);
  if (account.stripe_subscription_id) return { mode: 'existing', subscription_id: account.stripe_subscription_id };
  const trialEnd = trialEndUnix(now);
  if (account.payment_preference === 'BANK_TRANSFER') {
    const subscription = await stripeRequest(env, 'POST', '/subscriptions', {
      customer: customerId, items: [{ price: priceId, quantity: 1 }], trial_end: trialEnd,
      collection_method: 'send_invoice', days_until_due: 14,
      payment_settings: { payment_method_types: ['customer_balance'], payment_method_options: BANK_TRANSFER_OPTIONS },
      metadata: { seller_key: account.seller_key, purpose: 'SUBSCRIPTION' }
    }, { idempotencyKey: `subscription:${account.seller_key}` });
    await applySubscriptionState(env, account, subscription, nowIso);
    return { mode: 'bank_transfer', subscription_id: subscription.id };
  }
  const session = await stripeRequest(env, 'POST', '/checkout/sessions', {
    mode: 'subscription', customer: customerId, locale: 'ja',
    line_items: [{ price: priceId, quantity: 1 }],
    payment_method_types: ['card'], payment_method_collection: 'always',
    subscription_data: { trial_end: trialEnd, metadata: { seller_key: account.seller_key, purpose: 'SUBSCRIPTION' } },
    success_url: `${origin}/seller?billing=subscribed`, cancel_url: `${origin}/seller?billing=cancelled`,
    metadata: { seller_key: account.seller_key, purpose: 'SUBSCRIPTION' }
  }, { idempotencyKey: `sub-checkout:${account.seller_key}:${jstDateKey(now)}` });
  return { mode: 'card_checkout', url: session.url, session_id: session.id };
}

export function validTopupAmount(value) {
  const amount = yen(value);
  if (!Number.isInteger(amount) || amount < TOPUP_MIN_JPY || amount > TOPUP_MAX_JPY) throw new Error('TOPUP_AMOUNT_INVALID');
  return amount;
}

// 前払い残高のチャージ用 Checkout。カードは次回以降の自動チャージ用に保存する。
export async function createTopupCheckout(env, account, { amountJpy, origin, now = new Date() } = {}) {
  const amount = validTopupAmount(amountJpy);
  const nowIso = now.toISOString();
  const customerId = await ensureCustomer(env, account, nowIso);
  const bank = account.payment_preference === 'BANK_TRANSFER';
  const session = await stripeRequest(env, 'POST', '/checkout/sessions', {
    mode: 'payment', customer: customerId, locale: 'ja',
    line_items: [{ quantity: 1, price_data: { currency: 'jpy', unit_amount: amount, tax_behavior: 'inclusive',
      product_data: { name: 'HOSHILU 送客料 前払いチャージ', description: '有効クリックごとにジャンル単価を残高から消化します。税込。' } } }],
    payment_method_types: [bank ? 'customer_balance' : 'card'],
    ...(bank ? { payment_method_options: BANK_TRANSFER_OPTIONS }
      : { payment_intent_data: { setup_future_usage: 'off_session', metadata: { seller_key: account.seller_key, purpose: 'TOPUP', amount_jpy: String(amount) } } }),
    success_url: `${origin}/seller?billing=topup_done`, cancel_url: `${origin}/seller?billing=cancelled`,
    metadata: { seller_key: account.seller_key, purpose: 'TOPUP', amount_jpy: String(amount) }
  }, { idempotencyKey: `topup:${account.seller_key}:${crypto.randomUUID()}` });
  return { url: session.url, session_id: session.id, amount_jpy: amount };
}

export async function createPortalSession(env, account, { origin, now = new Date() } = {}) {
  const customerId = await ensureCustomer(env, account, now.toISOString());
  const session = await stripeRequest(env, 'POST', '/billing_portal/sessions', {
    customer: customerId, return_url: `${origin}/seller#billing`, locale: 'ja'
  });
  return { url: session.url };
}

async function defaultCardPaymentMethod(env, customerId) {
  const customer = await stripeRequest(env, 'GET', `/customers/${customerId}`);
  const preset = customer?.invoice_settings?.default_payment_method;
  if (preset) return typeof preset === 'string' ? preset : preset.id;
  const methods = await stripeRequest(env, 'GET', '/payment_methods', null, { query: { customer: customerId, type: 'card', limit: 1 } });
  return methods?.data?.[0]?.id || '';
}

// 残高が閾値を下回ったら、保存済みカードへ自動チャージ（カード決済のアカウントだけ）。
export async function maybeAutoRecharge(env, account, wallet, nowIso = new Date().toISOString()) {
  try {
    if (!account || Number(account.auto_recharge_enabled) !== 1) return { attempted: false };
    if (account.payment_preference !== 'CARD' || !stripeConfigured(env)) return { attempted: false };
    const available = Number(wallet?.balance_micros_jpy || 0) - Number(wallet?.reserved_micros_jpy || 0);
    if (available >= toMicros(account.auto_recharge_threshold_jpy)) return { attempted: false };
    const customerId = await ensureCustomer(env, account, nowIso);
    const paymentMethod = await defaultCardPaymentMethod(env, customerId);
    if (!paymentMethod) return { attempted: false, reason: 'NO_CARD' };
    const amount = validTopupAmount(account.auto_recharge_amount_jpy);
    const hourBucket = nowIso.slice(0, 13);
    const intent = await stripeRequest(env, 'POST', '/payment_intents', {
      amount, currency: 'jpy', customer: customerId, payment_method: paymentMethod,
      off_session: 'true', confirm: 'true', description: 'HOSHILU 送客料 自動チャージ',
      metadata: { seller_key: account.seller_key, purpose: 'TOPUP_AUTO', amount_jpy: String(amount) }
    }, { idempotencyKey: `auto-topup:${account.seller_key}:${hourBucket}` });
    if (intent.status === 'succeeded') {
      await creditTopup(env.PRODUCT_DB, { sellerKey: account.seller_key, amountJpy: amount, stripeObjectId: intent.id, entryType: 'TOPUP_AUTO', note: '自動チャージ', now: nowIso });
    }
    return { attempted: true, status: intent.status };
  } catch (error) {
    console.warn('SELLER_BILLING_AUTO_RECHARGE_FAILED', { code: String(error?.code || error?.message || error).slice(0, 60) });
    return { attempted: true, status: 'failed' };
  }
}

// ---------------------------------------------------------------------------
// アカウント作成（管理者）
// ---------------------------------------------------------------------------

async function sendBillingEmail(env, to, subject, text) {
  if (!String(env.RESEND_API_KEY || '').startsWith('re_') || !env.MEMBER_EMAIL_FROM) return false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: `HOSHILU <${env.MEMBER_EMAIL_FROM}>`, to: [to], subject, text }),
      redirect: 'manual'
    });
    return response.ok;
  } catch { return false; }
}

export async function createBillingAccount(env, input = {}, { origin, now = new Date() } = {}) {
  const db = env.PRODUCT_DB;
  if (!db) throw new Error('NO_DB');
  const nowIso = now.toISOString();
  const sellerKey = input.seller_key ? validSellerKey(input.seller_key) : newSellerKey();
  const accountName = clean(input.account_name, 100);
  const contactEmail = clean(input.contact_email, 200).toLowerCase();
  if (!accountName) throw new Error('ACCOUNT_NAME_REQUIRED');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(contactEmail)) throw new Error('CONTACT_EMAIL_INVALID');
  const plan = normalizeBillingPlan(input.plan);
  const paymentPreference = clean(input.payment_preference, 20).toUpperCase() === 'BANK_TRANSFER' ? 'BANK_TRANSFER' : 'CARD';
  const tenants = parseTenants(input.tenants);
  const existing = await getBillingAccount(db, sellerKey);
  if (existing) throw new Error('ACCOUNT_EXISTS');
  await db.prepare(`INSERT INTO seller_billing_accounts
    (seller_key,account_name,contact_email,tenants,plan,payment_preference,inquiry_id,status,created_at,updated_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)`)
    .bind(sellerKey, accountName, contactEmail, JSON.stringify(tenants), plan, paymentPreference,
      clean(input.inquiry_id, 80), plan === 'SELLER' ? 'ACTIVE' : 'PENDING_PAYMENT', nowIso).run();
  await ensureWallet(db, sellerKey, nowIso);
  // 無料プランは月額が無いので即 ACTIVE（残高0のあいだは優先出品が出ないだけ）。
  if (plan === 'SELLER') await setWalletStatus(db, sellerKey, 'ACTIVE', nowIso);
  for (const binding of Array.isArray(input.seller_ids) ? input.seller_ids : []) {
    const tenant = clean(binding?.tenant, 32).toLowerCase();
    const sellerId = clean(binding?.seller_id, 160);
    if (!tenant || !sellerId) continue;
    await db.prepare(`INSERT INTO seller_priority_memberships (seller_key,tenant,seller_id,verified_at) VALUES (?1,?2,?3,?4)
      ON CONFLICT(seller_key,tenant,seller_id) DO NOTHING`).bind(sellerKey, tenant, sellerId, nowIso).run();
  }
  const account = await getBillingAccount(db, sellerKey);
  const links = { subscription: null, topup: null };
  const warnings = [];
  if (stripeConfigured(env)) {
    try {
      if (plan === 'BUSINESS') links.subscription = await startBusinessSubscription(env, account, { origin, now });
      links.topup = await createTopupCheckout(env, account, { amountJpy: TOPUP_PRESETS_JPY[1], origin, now });
    } catch (error) {
      warnings.push(`STRIPE:${String(error?.code || error?.message || error).slice(0, 80)}`);
    }
  } else {
    warnings.push('STRIPE_NOT_CONFIGURED');
  }
  const emailLines = [
    `${accountName} ご担当者様`, '',
    'HOSHILU のセラーアカウントを作成しました。料金はすべて前払いです。', '',
    plan === 'BUSINESS'
      ? `■ Business 月額 9,800円（税込）: 登録後3か月は月額0円。${links.subscription?.url ? `お支払い方法の登録: ${links.subscription.url}` : '請求書（振込先つき）を別途お送りします。'}`
      : '■ 無料プラン: 月額0円。有効クリックごとにジャンル定価を前払い残高から消化します。',
    links.topup?.url ? `■ 送客料の前払いチャージ（10,000円）: ${links.topup.url}` : '',
    '', '料金表: https://hoshilu.app/for-sellers#pricing', 'HOSHILU'
  ].filter((line) => line !== '');
  const emailed = await sendBillingEmail(env, contactEmail, 'HOSHILU セラーアカウントとお支払いのご案内', emailLines.join('\n'));
  return { account: await getBillingAccount(db, sellerKey), links, warnings, emailed };
}

export async function listBillingAccounts(db) {
  const rows = await db.prepare(`SELECT a.*,w.balance_micros_jpy,w.reserved_micros_jpy,w.status AS wallet_status
    FROM seller_billing_accounts a LEFT JOIN seller_billing_wallets w ON w.seller_key=a.seller_key
    ORDER BY a.created_at DESC LIMIT 200`).all();
  return (rows.results || []).map((row) => ({
    ...row, tenants: parseTenants(row.tenants),
    balance_jpy: microsToYen(row.balance_micros_jpy), available_jpy: microsToYen(Number(row.balance_micros_jpy || 0) - Number(row.reserved_micros_jpy || 0))
  }));
}

export async function adjustBalance(db, { sellerKey, amountJpy, note, now = new Date().toISOString() }) {
  const amount = yen(amountJpy);
  if (!amount) throw new Error('AMOUNT_INVALID');
  if (amount > 0) return creditTopup(db, { sellerKey, amountJpy: amount, stripeObjectId: '', entryType: 'ADJUSTMENT', note, now });
  const ok = await debitWallet(db, sellerKey, toMicros(-amount), now);
  if (!ok) throw new Error('INSUFFICIENT_BALANCE');
  await appendLedger(db, { sellerKey, entryType: 'ADJUSTMENT', amountMicros: toMicros(amount), note, occurredAt: now });
  return { credited: false, adjusted_jpy: amount };
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

async function accountByCustomer(db, customerId) {
  if (!customerId) return null;
  const row = await db.prepare('SELECT * FROM seller_billing_accounts WHERE stripe_customer_id=?1').bind(String(customerId)).first();
  return row ? { ...row, tenants: parseTenants(row.tenants) } : null;
}

async function accountForObject(db, object) {
  const sellerKey = clean(object?.metadata?.seller_key, 120);
  if (sellerKey) {
    const account = await getBillingAccount(db, sellerKey);
    if (account) return account;
  }
  const customer = typeof object?.customer === 'string' ? object.customer : object?.customer?.id;
  return accountByCustomer(db, customer);
}

export async function processStripeEvent(env, event, now = new Date().toISOString()) {
  const db = env.PRODUCT_DB;
  const object = event?.data?.object || {};
  const type = String(event?.type || '');
  switch (type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const account = await accountForObject(db, object);
      if (!account) return 'NO_ACCOUNT';
      if (object.metadata?.purpose === 'TOPUP') {
        if (object.payment_status !== 'paid') return 'TOPUP_AWAITING_PAYMENT';
        const objectId = typeof object.payment_intent === 'string' ? object.payment_intent : object.id;
        const result = await creditTopup(db, { sellerKey: account.seller_key, amountJpy: Number(object.amount_total || 0), stripeObjectId: objectId, note: 'チャージ', now });
        return result.credited ? 'TOPUP_CREDITED' : `TOPUP_${result.reason}`;
      }
      if (object.metadata?.purpose === 'SUBSCRIPTION' && object.subscription) {
        const subscription = await stripeRequest(env, 'GET', `/subscriptions/${object.subscription}`);
        return `SUBSCRIPTION_${await applySubscriptionState(env, account, subscription, now)}`;
      }
      return 'IGNORED';
    }
    case 'payment_intent.succeeded': {
      const purpose = object.metadata?.purpose;
      if (!['TOPUP', 'TOPUP_AUTO'].includes(purpose)) return 'IGNORED';
      const account = await accountForObject(db, object);
      if (!account) return 'NO_ACCOUNT';
      const result = await creditTopup(db, { sellerKey: account.seller_key, amountJpy: Number(object.amount_received || object.amount || 0), stripeObjectId: object.id, entryType: purpose, note: purpose === 'TOPUP_AUTO' ? '自動チャージ' : 'チャージ', now });
      return result.credited ? 'TOPUP_CREDITED' : `TOPUP_${result.reason}`;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const account = await accountForObject(db, object);
      if (!account) return 'NO_ACCOUNT';
      return `SUBSCRIPTION_${await applySubscriptionState(env, account, object, now)}`;
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      if (!object.subscription) return 'IGNORED';
      const account = await accountForObject(db, object);
      if (!account) return 'NO_ACCOUNT';
      const status = type === 'invoice.paid' ? 'ACTIVE' : 'SUSPENDED_UNPAID';
      await updateAccount(db, account.seller_key, { status }, now);
      await ensureWallet(db, account.seller_key, now);
      await setWalletStatus(db, account.seller_key, status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED', now);
      return `INVOICE_${status}`;
    }
    default:
      return 'IGNORED';
  }
}

export async function handleStripeWebhook(request, env) {
  const db = env.PRODUCT_DB;
  if (!db) return Response.json({ ok: false, error: 'NO_DB' }, { status: 503 });
  const rawBody = await request.text();
  let event;
  try {
    event = await verifyStripeWebhook(rawBody, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || 'SIGNATURE') }, { status: 400 });
  }
  const now = new Date().toISOString();
  const eventId = clean(event?.id, 120);
  const claimed = await db.prepare(`INSERT INTO stripe_webhook_events (event_id,event_type,processed_at,result) VALUES (?1,?2,?3,'PROCESSING')
    ON CONFLICT(event_id) DO NOTHING`).bind(eventId, clean(event?.type, 80), now).run();
  if (claimed?.meta?.changes !== 1) return Response.json({ ok: true, duplicate: true });
  let result = 'ERROR';
  try {
    result = await processStripeEvent(env, event, now);
  } catch (error) {
    result = `ERROR:${String(error?.message || error).slice(0, 60)}`;
    console.warn('STRIPE_WEBHOOK_PROCESSING_FAILED', { type: event?.type, code: result });
  }
  await db.prepare('UPDATE stripe_webhook_events SET result=?2 WHERE event_id=?1').bind(eventId, result).run();
  // 処理失敗は 500 を返して Stripe に再送させる（イベント記録は再送時に上書きしない）。
  if (result.startsWith('ERROR')) {
    await db.prepare('DELETE FROM stripe_webhook_events WHERE event_id=?1').bind(eventId).run();
    return Response.json({ ok: false, result }, { status: 500 });
  }
  return Response.json({ ok: true, result });
}

// ---------------------------------------------------------------------------
// セラー向け API（ログイン済みセッションが前提）
// ---------------------------------------------------------------------------

export async function sellerBillingSummary(env, seller, now = new Date()) {
  const db = env.PRODUCT_DB;
  const account = await getBillingAccount(db, seller.seller_key);
  const wallet = await getWallet(db, seller.seller_key);
  const month = jstMonthKey(now);
  const allowance = account ? await getAllowanceForMonth(db, account, month) : null;
  const balance = Number(wallet?.balance_micros_jpy || 0);
  const available = balance - Number(wallet?.reserved_micros_jpy || 0);
  return {
    seller_key: seller.seller_key,
    stripe: sellerBillingReadiness(env),
    account: account ? {
      plan: account.plan, status: account.status, payment_preference: account.payment_preference,
      subscription_status: account.subscription_status, trial_end_at: account.trial_end_at,
      current_period_end_at: account.current_period_end_at, contact_email: account.contact_email,
      auto_recharge_enabled: Number(account.auto_recharge_enabled) === 1,
      auto_recharge_amount_jpy: account.auto_recharge_amount_jpy, auto_recharge_threshold_jpy: account.auto_recharge_threshold_jpy,
      has_subscription: Boolean(account.stripe_subscription_id)
    } : null,
    wallet: { status: wallet?.status || 'UNFUNDED', balance_jpy: microsToYen(balance), available_jpy: microsToYen(available), updated_at: wallet?.updated_at || '' },
    allowance: allowance ? { month, granted_jpy: microsToYen(allowance.granted_micros_jpy), consumed_jpy: microsToYen(allowance.consumed_micros_jpy), remaining_jpy: microsToYen(allowance.remaining_micros_jpy) } : null,
    topup_presets_jpy: TOPUP_PRESETS_JPY, topup_min_jpy: TOPUP_MIN_JPY, topup_max_jpy: TOPUP_MAX_JPY
  };
}

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}

export async function handleSellerBillingRoutes(request, env, seller) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/seller/billing')) return null;
  if (!seller) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
  if (!env.PRODUCT_DB) return json({ ok: false, error: 'NO_DB' }, 503);
  const origin = url.origin;
  try {
    if (request.method === 'GET' && url.pathname === '/api/seller/billing') {
      return json({ ok: true, ...(await sellerBillingSummary(env, seller)) });
    }
    const account = await getBillingAccount(env.PRODUCT_DB, seller.seller_key);
    if (request.method === 'GET' && url.pathname === '/api/seller/billing/ledger') {
      const rows = await env.PRODUCT_DB.prepare(`SELECT entry_type,amount_micros_jpy,balance_after_micros_jpy,note,occurred_at
        FROM seller_billing_ledger WHERE seller_key=?1 ORDER BY occurred_at DESC LIMIT 100`).bind(seller.seller_key).all();
      return json({ ok: true, entries: (rows.results || []).map((row) => ({ ...row, amount_jpy: microsToYen(row.amount_micros_jpy), balance_after_jpy: microsToYen(row.balance_after_micros_jpy) })) });
    }
    if (!account) return json({ ok: false, error: 'BILLING_ACCOUNT_NOT_REGISTERED', seller_key: seller.seller_key }, 404);
    if (!stripeConfigured(env)) return json({ ok: false, error: 'STRIPE_NOT_CONFIGURED' }, 503);
    if (request.method === 'POST' && url.pathname === '/api/seller/billing/topup') {
      const body = await request.json().catch(() => ({}));
      return json({ ok: true, ...(await createTopupCheckout(env, account, { amountJpy: body.amount_jpy, origin })) });
    }
    if (request.method === 'POST' && url.pathname === '/api/seller/billing/subscribe') {
      return json({ ok: true, ...(await startBusinessSubscription(env, account, { origin })) });
    }
    if (request.method === 'POST' && url.pathname === '/api/seller/billing/portal') {
      return json({ ok: true, ...(await createPortalSession(env, account, { origin })) });
    }
    if (request.method === 'POST' && url.pathname === '/api/seller/billing/auto-recharge') {
      const body = await request.json().catch(() => ({}));
      const enabled = body.enabled === true || body.enabled === 1 || body.enabled === '1' ? 1 : 0;
      const amount = enabled ? validTopupAmount(body.amount_jpy ?? account.auto_recharge_amount_jpy) : account.auto_recharge_amount_jpy;
      const threshold = Math.max(0, Math.min(TOPUP_MAX_JPY, yen(body.threshold_jpy ?? account.auto_recharge_threshold_jpy)));
      if (enabled && account.payment_preference !== 'CARD') return json({ ok: false, error: 'AUTO_RECHARGE_CARD_ONLY' }, 400);
      await updateAccount(env.PRODUCT_DB, account.seller_key, { auto_recharge_enabled: enabled, auto_recharge_amount_jpy: amount, auto_recharge_threshold_jpy: threshold }, new Date().toISOString());
      return json({ ok: true, auto_recharge_enabled: enabled === 1, auto_recharge_amount_jpy: amount, auto_recharge_threshold_jpy: threshold });
    }
    return json({ ok: false, error: 'NOT_FOUND' }, 404);
  } catch (error) {
    const status = error instanceof StripeError ? 502 : 400;
    return json({ ok: false, error: String(error?.message || 'BILLING_ERROR').slice(0, 120) }, status);
  }
}

// ---------------------------------------------------------------------------
// 管理者向け API（authorizeAdminRequest を通過した後に呼ぶ）
// ---------------------------------------------------------------------------

export async function handleSellerBillingAdminRoutes(request, env, authorize) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/admin/seller-billing')) return null;
  if (!await authorize(request, env)) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
  if (!env.PRODUCT_DB) return json({ ok: false, error: 'NO_DB' }, 503);
  const db = env.PRODUCT_DB;
  try {
    if (request.method === 'GET' && url.pathname === '/api/admin/seller-billing/accounts') {
      return json({ ok: true, stripe: sellerBillingReadiness(env), accounts: await listBillingAccounts(db) });
    }
    if (request.method === 'POST' && url.pathname === '/api/admin/seller-billing/accounts') {
      const body = await request.json().catch(() => ({}));
      const result = await createBillingAccount(env, body, { origin: url.origin });
      return json({ ok: true, ...result }, 201);
    }
    const match = url.pathname.match(/^\/api\/admin\/seller-billing\/accounts\/([A-Za-z0-9_-]{20,120})\/(ledger|adjust|subscribe)$/u);
    if (match) {
      const sellerKey = match[1];
      const account = await getBillingAccount(db, sellerKey);
      if (!account) return json({ ok: false, error: 'ACCOUNT_NOT_FOUND' }, 404);
      if (request.method === 'GET' && match[2] === 'ledger') {
        const rows = await db.prepare(`SELECT * FROM seller_billing_ledger WHERE seller_key=?1 ORDER BY occurred_at DESC LIMIT 200`).bind(sellerKey).all();
        const charges = await db.prepare(`SELECT status,COUNT(*) AS clicks,SUM(amount_micros_jpy) AS amount_micros_jpy
          FROM seller_qualified_click_charges WHERE seller_key=?1 AND occurred_at>=datetime('now','-30 days') GROUP BY status`).bind(sellerKey).all();
        return json({ ok: true, account, entries: rows.results || [], charges_30d: charges.results || [] });
      }
      if (request.method === 'POST' && match[2] === 'adjust') {
        const body = await request.json().catch(() => ({}));
        return json({ ok: true, ...(await adjustBalance(db, { sellerKey, amountJpy: body.amount_jpy, note: body.note || '管理者調整' })) });
      }
      if (request.method === 'POST' && match[2] === 'subscribe') {
        return json({ ok: true, ...(await startBusinessSubscription(env, account, { origin: url.origin })) });
      }
    }
    return json({ ok: false, error: 'NOT_FOUND' }, 404);
  } catch (error) {
    const status = error instanceof StripeError ? 502 : 400;
    return json({ ok: false, error: String(error?.message || 'BILLING_ERROR').slice(0, 120) }, status);
  }
}
