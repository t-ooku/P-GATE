// 2026-10-03 HOSHILU Seller「AI販促担当」料金（指示書 §1・§4・§6-6。Phase 3）。
// - 料金はコードに用意するが、SELLER_PROMO_PLANS_ENABLED=false の間はどこにも 9,800／19,800 を出さない。
// - Stripe の Light／Standard の Price は lookup_key で冪等に作る（tax_behavior=inclusive・JPY・月次）。
//   作成は OK② の後だけ: SELLER_PROMO_STRIPE_PRICES_APPROVED=true と、呼び出し時の confirm='CREATE_PRICES' の両方が要る。
import { stripeMode, stripeRequest } from './stripe-client.mjs';
import { dbFirst, promoAudit, promoPlansEnabled } from './seller-promo-store.mjs';

export const PROMO_PAID_PLANS = Object.freeze({
  LIGHT: Object.freeze({ plan: 'LIGHT', unit_amount: 9800, lookup_key: 'hoshilu_seller_promo_light_monthly_v1', product_name: 'HOSHILU Seller AI販促担当 Light' }),
  STANDARD: Object.freeze({ plan: 'STANDARD', unit_amount: 19800, lookup_key: 'hoshilu_seller_promo_standard_monthly_v1', product_name: 'HOSHILU Seller AI販促担当 Standard' })
});

// 公開面（LP・申込・API）へ出してよい料金。販売 OFF の間は掲載プランの文言以外は返さない。
export function publicPromoPlans(env = {}) {
  if (!promoPlansEnabled(env)) return { enabled: false, plans: [] };
  return {
    enabled: true,
    plans: Object.values(PROMO_PAID_PLANS).map((p) => ({ plan: p.plan, monthly_jpy: p.unit_amount, tax_inclusive: true, currency: 'jpy' }))
  };
}

export function promoPriceOk(price, spec, env) {
  return price?.active === true && price.currency === 'jpy' && price.unit_amount === spec.unit_amount && price.recurring?.interval === 'month'
    && (price.recurring.interval_count || 1) === 1 && price.tax_behavior === 'inclusive' && price.lookup_key === spec.lookup_key
    && price.livemode === (stripeMode(env) === 'live');
}

export function ensurePricesAllowed(env = {}, input = {}) {
  if (String(env.SELLER_PROMO_STRIPE_PRICES_APPROVED || '') !== 'true') return 'STRIPE_PRICES_NOT_APPROVED';
  if (input?.confirm !== 'CREATE_PRICES') return 'CONFIRM_REQUIRED';
  if (!['live', 'test'].includes(stripeMode(env))) return 'STRIPE_NOT_CONFIGURED';
  return '';
}

export async function ensurePromoPrices(env) {
  const out = {};
  for (const spec of Object.values(PROMO_PAID_PLANS)) {
    const listed = await stripeRequest(env, 'GET', '/prices', null, { query: { lookup_keys: [spec.lookup_key], active: 'true', limit: 1 } });
    const existing = listed?.data?.[0];
    if (existing) {
      if (!promoPriceOk(existing, spec, env)) throw new Error(`PRICE_MISMATCH_${spec.plan}`);
      out[spec.plan] = { price_id: existing.id, created: false };
      continue;
    }
    const product = await stripeRequest(env, 'POST', '/products', {
      name: spec.product_name, metadata: { purpose: 'SELLER_PROMO', plan: spec.plan }
    }, { idempotencyKey: `seller-promo-product:${spec.lookup_key}` });
    const price = await stripeRequest(env, 'POST', '/prices', {
      product: product.id, currency: 'jpy', unit_amount: spec.unit_amount, tax_behavior: 'inclusive', lookup_key: spec.lookup_key,
      recurring: { interval: 'month', interval_count: 1 }, metadata: { purpose: 'SELLER_PROMO', plan: spec.plan }
    }, { idempotencyKey: `seller-promo-price:${spec.lookup_key}` });
    if (!promoPriceOk(price, spec, env)) throw new Error(`PRICE_CREATE_MISMATCH_${spec.plan}`);
    out[spec.plan] = { price_id: price.id, product_id: product.id, created: true };
  }
  return { mode: stripeMode(env), prices: out };
}

// ---- Light／Standard を「契約の種類（offer）」として既存の自動更新の仕組みに載せる（Phase 3） ----------------
// 1,980円（AUTO_RENEW_OFFER）と同じく「初回公開から 30 日無料・カード登録・自動更新・解約」。条件は増やさない。
// 金額・規約は offer ごとに固定（後から変えるときは新しい offer を作る）。公開ファイル（public/seller-trial-policy.mjs）には
// 置かない: 販売 OFF の間に 9,800／19,800 を公開アセットへ出さないため。
export const PROMO_LIGHT_OFFER = 'external-seller-promo-light-30d-autorenew-v1';
export const PROMO_STANDARD_OFFER = 'external-seller-promo-standard-30d-autorenew-v1';
const promoCopy = (name, amount) => `HOSHILU Seller AI販促担当 ${name}。初回公開から30日間無料。無料利用の開始前にカード登録が必要です。無料期間の終了期限までに解約しない場合、31日目から月額${amount.toLocaleString('en-US')}円（税込）で自動課金され、以後毎月自動更新されます。解約は掲載管理画面から行えます。売上や順位は約束しません。`;
export const PROMO_AUTO_RENEW_POLICIES = Object.freeze({
  [PROMO_LIGHT_OFFER]: Object.freeze({ offer: PROMO_LIGHT_OFFER, terms: 'seller-promo-light-30d-autorenew-20261003-v1', amount: PROMO_PAID_PLANS.LIGHT.unit_amount,
    currency: 'jpy', interval: 'month', interval_count: 1, tax_behavior: 'inclusive', trial_days: 30, copy: promoCopy('Light', PROMO_PAID_PLANS.LIGHT.unit_amount) }),
  [PROMO_STANDARD_OFFER]: Object.freeze({ offer: PROMO_STANDARD_OFFER, terms: 'seller-promo-standard-30d-autorenew-20261003-v1', amount: PROMO_PAID_PLANS.STANDARD.unit_amount,
    currency: 'jpy', interval: 'month', interval_count: 1, tax_behavior: 'inclusive', trial_days: 30, copy: promoCopy('Standard', PROMO_PAID_PLANS.STANDARD.unit_amount) })
});
export const PROMO_OFFER_PLANS = Object.freeze({ [PROMO_LIGHT_OFFER]: 'LIGHT', [PROMO_STANDARD_OFFER]: 'STANDARD' });
export const PROMO_PLAN_OFFERS = Object.freeze({ LIGHT: PROMO_LIGHT_OFFER, STANDARD: PROMO_STANDARD_OFFER });
export const isPromoOffer = (offer) => Object.hasOwn(PROMO_AUTO_RENEW_POLICIES, String(offer || ''));
// Price ID は ensure-prices の結果を vars に入れる（SELLER_PROMO_LIGHT_TEST_PRICE_ID など。テスト・本番は別のキー）。
export function promoPriceConfiguration(env, mode, offer) {
  const plan = PROMO_OFFER_PLANS[offer];
  if (!plan || !['test', 'live'].includes(mode)) return {};
  const prefix = `SELLER_PROMO_${plan}_${mode.toUpperCase()}`;
  return { price_id: env[`${prefix}_PRICE_ID`], product_id: env[`${prefix}_PRODUCT_ID`], mode };
}

// OK② の後、cron から 1 回だけ Price を用意する（管理 API を人が叩かなくてよいように）。
// lookup_key で冪等なので何度呼んでも 1 組だけ。結果（Price/Product ID）は監査ログに残し、vars へ写す。
// 金額が違う Price が既にあれば作らずに止まる（PRICE_MISMATCH_*）。
export const STRIPE_PRICES_AUDIT_KEY = '_system';
export async function ensurePromoPricesOnce(env, now = new Date()) {
  if (String(env.SELLER_PROMO_STRIPE_PRICES_APPROVED || '') !== 'true' || !['live', 'test'].includes(stripeMode(env)) || !env.PRODUCT_DB) return { skipped: true };
  const action = `STRIPE_PRICES_ENSURED_${stripeMode(env).toUpperCase()}`;
  const done = await dbFirst(env.PRODUCT_DB, 'SELECT id FROM seller_promo_audit WHERE seller_key=?1 AND action=?2 LIMIT 1', STRIPE_PRICES_AUDIT_KEY, action);
  if (done) return { skipped: true, already: true };
  try {
    const result = await ensurePromoPrices(env);
    await promoAudit(env.PRODUCT_DB, { seller_key: STRIPE_PRICES_AUDIT_KEY, actor: 'SYSTEM', action, target_type: 'STRIPE_PRICE', detail: result }, now);
    return result;
  } catch (error) {
    const code = /^[A-Z0-9_]{3,80}$/u.test(String(error?.message)) ? error.message : 'STRIPE_PRICES_FAILED';
    await promoAudit(env.PRODUCT_DB, { seller_key: STRIPE_PRICES_AUDIT_KEY, actor: 'SYSTEM', action: 'STRIPE_PRICES_FAILED', target_type: 'STRIPE_PRICE', detail: { code } }, now).catch(() => {});
    return { error: code };
  }
}
