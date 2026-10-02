// 2026-10-03 HOSHILU Seller「AI販促担当」料金（指示書 §1・§4・§6-6。Phase 3）。
// - 料金はコードに用意するが、SELLER_PROMO_PLANS_ENABLED=false の間はどこにも 9,800／19,800 を出さない。
// - Stripe の Light／Standard の Price は lookup_key で冪等に作る（tax_behavior=inclusive・JPY・月次）。
//   作成は OK② の後だけ: SELLER_PROMO_STRIPE_PRICES_APPROVED=true と、呼び出し時の confirm='CREATE_PRICES' の両方が要る。
import { stripeMode, stripeRequest } from './stripe-client.mjs';
import { promoPlansEnabled } from './seller-promo-store.mjs';

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
