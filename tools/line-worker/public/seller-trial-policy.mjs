// Single source for new manual listings; existing offers/contracts remain versioned.
export const PILOT_OFFER = 'external-seller-30d-v1';
export const LEGACY_AUTO_RENEW_OFFER = 'external-seller-30d-autorenew-v1';
export const AUTO_RENEW_OFFER = 'external-seller-1980-30d-autorenew-v1';
export const LEGACY_AUTO_RENEW_TERMS = 'seller-30d-autorenew-20260927-v1';
export const AUTO_RENEW_TERMS = 'seller-1980-30d-autorenew-20260927-v1';
export const AUTO_RENEW_COPY = '新規Sellerは商品公開から30日間無料。無料利用の開始前にカード登録が必要です。無料期間の終了期限までに解約しない場合、31日目から月額1,980円（税込）で自動課金され、以後毎月自動更新されます。解約は掲載管理画面から行えます。';
export const LEGACY_PILOT_OFFER = 'external-seller-calendar3-v1';
export const MONTHLY_JPY = 1980;
export const LEGACY_MONTHLY_JPY = 4980;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_TERMS = 'seller-manual-trial-20260927-v2';
export const LEGACY_30D_COPY = 'この店舗は商品公開から30日間無料。支払い方法の登録は不要です。続ける場合のみ、月額4,980円（税込）でお申し込みください。自動で有料プランに切り替わることはありません。';
export const TRIAL_COPY = AUTO_RENEW_COPY;
// Amounts/terms are immutable per offer. The old Price configuration is never
// reused as the new default. Test and live IDs have separate configuration keys.
export const AUTO_RENEW_POLICIES = Object.freeze({
  [LEGACY_AUTO_RENEW_OFFER]: Object.freeze({offer:LEGACY_AUTO_RENEW_OFFER,terms:LEGACY_AUTO_RENEW_TERMS,amount:LEGACY_MONTHLY_JPY,currency:'jpy',interval:'month',interval_count:1,tax_behavior:'inclusive',trial_days:30,copy:AUTO_RENEW_COPY.replace('1,980','4,980')}),
  [AUTO_RENEW_OFFER]: Object.freeze({offer:AUTO_RENEW_OFFER,terms:AUTO_RENEW_TERMS,amount:MONTHLY_JPY,currency:'jpy',interval:'month',interval_count:1,tax_behavior:'inclusive',trial_days:30,copy:AUTO_RENEW_COPY})
});
export const autoRenewPolicy = offer => AUTO_RENEW_POLICIES[offer] || null;
export const isAutoRenewOffer = offer => Boolean(autoRenewPolicy(offer));
export const contractMonthlyJpy = doc => autoRenewPolicy(doc.offer_version)?.amount ?? LEGACY_MONTHLY_JPY;
export function newPriceConfiguration(env,mode) {
  if(!['test','live'].includes(mode))return {};
  const prefix=`SELLER_PILOT_1980_${mode.toUpperCase()}`;
  return {price_id:env[`${prefix}_PRICE_ID`],product_id:env[`${prefix}_PRODUCT_ID`],mode};
}
export const knownOffer = offer => [PILOT_OFFER, LEGACY_PILOT_OFFER].includes(offer)||isAutoRenewOffer(offer);
export function calendarTrialEnd(start) {
  const time = Date.parse(start);
  if (!Number.isFinite(time)) throw new Error('INVALID_DATE');
  const jst = new Date(time + 9 * 3600000), month = jst.getUTCMonth() + 3;
  const day = Math.min(jst.getUTCDate(), new Date(Date.UTC(jst.getUTCFullYear(), month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(jst.getUTCFullYear(), month, day, jst.getUTCHours(), jst.getUTCMinutes(), jst.getUTCSeconds(), jst.getUTCMilliseconds()) - 9 * 3600000).toISOString();
}
export function trialEnd(start, offer) {
  if (!knownOffer(offer) || !Number.isFinite(Date.parse(start))) throw new Error('OFFER_OR_DATE_INVALID');
  return offer === LEGACY_PILOT_OFFER ? calendarTrialEnd(start) : new Date(Date.parse(start) + 30 * DAY_MS).toISOString();
}
export function jstDateTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '未開始';
  return new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(value)) + ' JST';
}
export function followupTasks(doc, now = new Date()) {
  if (!(doc.offer_version===PILOT_OFFER||isAutoRenewOffer(doc.offer_version)) || !doc.starts_at || doc.test) return [];
  return [7,21,30].map(day => {
    const due = new Date(Date.parse(doc.starts_at) + day * DAY_MS).toISOString();
    const completed = doc.followups?.[day];
    return {day,due_at:due,status:completed?'DONE':now.getTime()>=Date.parse(due)?'DUE':'UPCOMING',record:completed||null};
  });
}

// Public decision notice until the matching production offer is verified.
export const TRIAL_PENDING_COPY = AUTO_RENEW_COPY + ' 現在は体験開始の準備中です。掲載見本の相談を受け付けています。';
export function recruitmentVerified(env = {}) {
  const c=newPriceConfiguration(env,env.SELLER_PILOT_PAYMENT_MODE);
  return /^price_[A-Za-z0-9_]+$/u.test(c.price_id||'') && /^prod_[A-Za-z0-9_]+$/u.test(c.product_id||'') && env.SELLER_MANUAL_PILOT_ENABLED === 'true' && env.SELLER_PILOT_OFFER_VERSION === AUTO_RENEW_OFFER && env.SELLER_PILOT_RECRUITMENT_VERIFIED === AUTO_RENEW_OFFER && env.SELLER_PILOT_AUTORENEW_ENABLED === 'true' && env.SELLER_PILOT_PAYMENTS_ENABLED === 'true';
}

export const TRIAL_SOCIAL_PENDING_COPY = '新規Sellerは商品公開から30日間無料。（体験開始は準備中）開始前にカード登録必須。期限までに解約しなければ31日目から月額1,980円（税込）で毎月自動更新。自店の掲載見本を相談する。';
// 2026-10-02 大隆さん承認: 受付開始後は、投入済み・投入前の投稿から「準備中」の断りを外す。
// 送信済みの履歴は書き換えない（publish 直前の未送信行と、これから作る行だけ）。
export const TRIAL_SOCIAL_COPY = TRIAL_SOCIAL_PENDING_COPY.replace('（体験開始は準備中）', '');
const PENDING_NOTICE = /[（(]体験開始は準備中[）)]|体験開始は準備中で、/gu;
export function stripPendingNotice(text = '') {
  return String(text).replace(PENDING_NOTICE, '').replace(/。[ 　]*。/gu, '。');
}
export function socialTrialCaption(caption, env = {}) {
  return recruitmentVerified(env) ? stripPendingNotice(caption) : String(caption || '');
}
