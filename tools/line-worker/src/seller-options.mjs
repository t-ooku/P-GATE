// 2026-09-28 統合実行指示書（seller-master-20260928-v1）§15・§16：追加オプションの定義。販売はすべて OFF。
//
// 守ること:
// - 金額はここに書かない。リポジトリは公開で、未承認オプションの金額は公開しない（§19-3）。
//   大隆さんの承認後、環境変数 `<prefix>_PRICE_JPY` と Stripe の Price ID で渡す。
// - 基本契約（月額1,980円）の Stripe subscription に明細を足さない。
//   seller-pilot-autorenew.mjs は items.length===1 を基本契約の完全性チェックに使っており、
//   明細を足すと基本契約ごと AUTORENEW_SUBSCRIPTION_MISMATCH になる（§16「追加明細の失敗で基本契約を無効にしない」）。
//   月額オプションは別の subscription、単発は payment モードの Checkout で扱う。
// - 基本のカード登録・自動更新同意を、オプション購入の同意に流用しない。オプションごとに版・金額・種別へ同意させる。
// - 使用量が増えた・枠を超えたという理由で自動購入しない。枠は数量管理で、従量課金ではない。
// - どこからも呼ばれていない（ルート未接続）。販売開始時に、承認と提供確認がそろったものだけを接続する。

export const OPTION_CATALOG_VERSION = 'seller-options-draft-20260928';

// 基本1,980円の初期実装目標（§1-2・§4）。提供確認前なので「目標」であって提供済みの約束ではない。
export const BASE_MONTHLY_QUOTA_TARGET = Object.freeze({ seo_articles: 2, sns_posts: 4, feature_pages: 0, short_videos: 0 });

export const SELLER_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'traffic-boost', label: '集客強化', kind: 'monthly', version: 'draft-20260928',
    adds: Object.freeze({ seo_articles: 2, sns_posts: 4 }), envPrefix: 'SELLER_OPTION_TRAFFIC_BOOST'
  }),
  Object.freeze({
    id: 'feature-page', label: '新商品・セール特集', kind: 'one_time', version: 'draft-20260928',
    adds: Object.freeze({ feature_pages: 1, sns_posts: 2 }), envPrefix: 'SELLER_OPTION_FEATURE_PAGE'
  }),
  Object.freeze({
    id: 'short-video', label: '商品ショート動画', kind: 'monthly', version: 'draft-20260928',
    adds: Object.freeze({ short_videos: 2 }), envPrefix: 'SELLER_OPTION_SHORT_VIDEO'
  })
]);

export function findSellerOption(id) {
  return SELLER_OPTIONS.find((option) => option.id === id) || null;
}

function stripeMode(env = {}) {
  return String(env.SELLER_PILOT_PAYMENT_MODE || '').toLowerCase() === 'live' ? 'LIVE' : 'TEST';
}

// 販売できるかどうか。全部そろわない限り false。理由を返して「なぜ売れないか」を画面・報告で分かるようにする。
export function optionSaleState(option, env = {}) {
  const reasons = [];
  if (!option) return { sellable: false, amount_jpy: null, price_id: '', reasons: ['UNKNOWN_OPTION'] };
  const prefix = option.envPrefix;
  if (env.SELLER_OPTIONS_SALES_ENABLED !== 'true') reasons.push('SALES_SWITCH_OFF');
  if (env[`${prefix}_APPROVED`] !== 'true') reasons.push('PRICE_NOT_APPROVED');
  if (env[`${prefix}_PROVIDED`] !== 'true') reasons.push('DELIVERY_NOT_CONFIRMED');
  const amount = Number(env[`${prefix}_PRICE_JPY`]);
  const amountOk = Number.isInteger(amount) && amount > 0;
  if (!amountOk) reasons.push('PRICE_AMOUNT_MISSING');
  const priceId = String(env[`${prefix}_${stripeMode(env)}_PRICE_ID`] || '');
  if (!/^price_[A-Za-z0-9]+$/u.test(priceId)) reasons.push('STRIPE_PRICE_MISSING');
  return { sellable: reasons.length === 0, amount_jpy: amountOk ? amount : null, price_id: reasons.length ? '' : priceId, reasons };
}

// 公開してよいカタログ。販売可能なものだけ、金額つきで返す。未承認は存在自体を出さない（§19-3）。
export function publicOptionCatalog(env = {}) {
  return SELLER_OPTIONS
    .map((option) => ({ option, state: optionSaleState(option, env) }))
    .filter(({ state }) => state.sellable)
    .map(({ option, state }) => ({ id: option.id, label: option.label, kind: option.kind, version: option.version, amount_jpy: state.amount_jpy, adds: { ...option.adds } }));
}

// 月次の制作枠。基本枠＋有効な月額オプション。単発は当月の追加分として別に渡す。重複 ID は1回だけ数える。
export function monthlyQuota({ activeMonthlyOptionIds = [], oneTimeOptionIds = [] } = {}) {
  const quota = { ...BASE_MONTHLY_QUOTA_TARGET };
  const add = (option) => { for (const [key, value] of Object.entries(option.adds)) quota[key] = (quota[key] || 0) + value; };
  for (const id of new Set(activeMonthlyOptionIds)) {
    const option = findSellerOption(id);
    if (option?.kind === 'monthly') add(option);
  }
  for (const id of oneTimeOptionIds) {
    const option = findSellerOption(id);
    if (option?.kind === 'one_time') add(option);
  }
  return quota;
}

// オプション購入の同意が有効か。基本契約の同意（カード登録・自動更新）を流用したものは無効。
export function optionConsentValid(consent, option, env = {}) {
  if (!consent || !option) return false;
  const state = optionSaleState(option, env);
  if (!state.sellable) return false;
  if (consent.scope !== 'seller_option') return false;
  return consent.accepted === true
    && consent.option_id === option.id
    && consent.option_version === option.version
    && consent.kind === option.kind
    && consent.amount_jpy === state.amount_jpy
    && typeof consent.accepted_at === 'string' && consent.accepted_at.length > 0;
}
