// 2026-10-03 契約の種類（offer）の一覧をサーバー側でまとめる。1,980円の offer は public/seller-trial-policy.mjs が正本のまま。
// AI販促担当の Light／Standard（src/seller-promo-billing.mjs）は公開ファイルに置かず、ここで足す。
// 1,980円の判定・金額・期間は既存の関数をそのまま呼ぶ（このファイルは足し算だけ）。
import {
  AUTO_RENEW_OFFER, autoRenewPolicy as publicAutoRenewPolicy, knownOffer as publicKnownOffer,
  trialEnd as publicTrialEnd, contractMonthlyJpy as publicContractMonthlyJpy, newPriceConfiguration, DAY_MS
} from '../public/seller-trial-policy.mjs';
import { PROMO_AUTO_RENEW_POLICIES, isPromoOffer, promoPriceConfiguration } from './seller-promo-billing.mjs';
import { promoPlansEnabled } from './seller-promo-store.mjs';

export const autoRenewPolicy = (offer) => publicAutoRenewPolicy(offer) || PROMO_AUTO_RENEW_POLICIES[offer] || null;
export const isAutoRenewOffer = (offer) => Boolean(autoRenewPolicy(offer));
export const knownOffer = (offer) => publicKnownOffer(offer) || isPromoOffer(offer);
export const contractMonthlyJpy = (doc) => (isPromoOffer(doc?.offer_version) ? PROMO_AUTO_RENEW_POLICIES[doc.offer_version].amount : publicContractMonthlyJpy(doc));
export function trialEnd(start, offer) {
  if (!isPromoOffer(offer)) return publicTrialEnd(start, offer);
  if (!Number.isFinite(Date.parse(start))) throw new Error('OFFER_OR_DATE_INVALID');
  return new Date(Date.parse(start) + PROMO_AUTO_RENEW_POLICIES[offer].trial_days * DAY_MS).toISOString();
}
export function offerPriceConfiguration(env, mode, offer = AUTO_RENEW_OFFER) {
  return isPromoOffer(offer) ? promoPriceConfiguration(env, mode, offer) : newPriceConfiguration(env, mode);
}
// 新しく申し込める offer: 1,980円（現行）と、販売 ON（SELLER_PROMO_PLANS_ENABLED=true）のときだけ Light／Standard。
export const creatableOffer = (env, offer) => offer === AUTO_RENEW_OFFER || (isPromoOffer(offer) && promoPlansEnabled(env));
export const autoRenewOffersForReconciliation = () => [...Object.keys(PROMO_AUTO_RENEW_POLICIES)];
