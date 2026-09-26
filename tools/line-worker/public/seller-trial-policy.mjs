// Single source for new manual listings; existing offers/contracts remain versioned.
export const PILOT_OFFER = 'external-seller-30d-v1';
export const LEGACY_PILOT_OFFER = 'external-seller-calendar3-v1';
export const MONTHLY_JPY = 4980;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_TERMS = 'seller-manual-trial-20260927-v2';
export const TRIAL_COPY = '商品公開から30日間無料。無料体験の開始時に、支払い方法の登録は不要です。続ける場合のみ、月額4,980円（税込）でお申し込みください。自動で有料プランに切り替わることはありません。';
export const knownOffer = offer => [PILOT_OFFER, LEGACY_PILOT_OFFER].includes(offer);
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
  if (doc.offer_version !== PILOT_OFFER || !doc.starts_at || doc.test) return [];
  return [7,21,30].map(day => {
    const due = new Date(Date.parse(doc.starts_at) + day * DAY_MS).toISOString();
    const completed = doc.followups?.[day];
    return {day,due_at:due,status:completed?'DONE':now.getTime()>=Date.parse(due)?'DUE':'UPCOMING',record:completed||null};
  });
}
