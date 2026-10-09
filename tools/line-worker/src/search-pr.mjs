// 2026-10-09 大隆さん決定「一番上にPR枠を最大2件」（HOSHILU Seller 月額1,980円の優先出品）。
//
// 月額契約中（無料期間中を含む）の掲載店（seller_listing_pilots・PUBLISHED・契約有効）の商品のうち、
// 検索語の条件をすべて満たす商品だけを、検索結果の一番上に「PR」と明記して最大2件出す。
// - お金をもらって上に出す枠なので、通常の並び（unified_results.items）には混ぜない（優先＝PR、通常＝Organic）。
//   ステマ規制に合わせて、画面では必ず「PR」と表示する。
// - 条件を1つでも満たさない商品は出さない（NEAR も出さない）。合う商品が無ければ枠ごと出さない。
// - 同じ店で2枠を埋めない（まず1店1件、それでも空いた時だけ2件目）。同点は掲載開始が早い店から。
// - 価格・URL・画像は店舗が登録し、HOSHILU が確認した値だけ（AI は作らない）。価格は確認日つきで出す。
import { activePilotListings } from './seller-listing-pilot.mjs';
import { demandConditions, judgeTitle } from './shop-demand.mjs';

export const SEARCH_PR_LIMIT = 2;

const MARKETPLACE_LABELS = Object.freeze({
  OWN_STORE: '店舗の販売先', RAKUTEN: '楽天市場', YAHOO: 'Yahoo!ショッピング', AMAZON: 'Amazon'
});

const https = (value) => (/^https:\/\//iu.test(String(value || '')) ? String(value) : '');
const text = (value, max = 200) => String(value ?? '').normalize('NFKC').replace(/\p{Cc}/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, max);

export function pickSearchPr(pilots = [], query = '', { limit = SEARCH_PR_LIMIT } = {}) {
  const conditions = demandConditions(String(query || ''));
  if (!conditions.length || limit <= 0) return [];
  const matches = [];
  for (const pilot of Array.isArray(pilots) ? pilots : []) {
    if (!pilot?.pilot_id || pilot.test) continue;
    const started = Date.parse(pilot.starts_at || pilot.published_at || '') || Number.MAX_SAFE_INTEGER;
    for (const [index, product] of (Array.isArray(pilot.products) ? pilot.products : []).entries()) {
      if (!https(product?.destination_url) || !https(product?.image_url) || !text(product?.title)) continue;
      const verdict = judgeTitle(product.title, conditions);
      if (verdict.level !== 'EXACT') continue;
      matches.push({ pilot, product, index, started });
    }
  }
  matches.sort((a, b) => a.started - b.started || String(a.pilot.pilot_id).localeCompare(String(b.pilot.pilot_id)) || a.index - b.index);
  const picked = [];
  const shops = new Set();
  for (const match of matches) {
    if (picked.length >= limit) break;
    if (shops.has(match.pilot.pilot_id)) continue;
    shops.add(match.pilot.pilot_id);
    picked.push(match);
  }
  for (const match of matches) {
    if (picked.length >= limit) break;
    if (!picked.includes(match)) picked.push(match);
  }
  return picked.map(({ pilot, product }) => {
    const price = Number(product.price_jpy);
    const verifiedAt = text(product.price_verified_at, 40).slice(0, 10);
    const priced = Number.isSafeInteger(price) && price > 0 && /^\d{4}-\d{2}-\d{2}$/u.test(verifiedAt);
    return {
      label: 'PR',
      source: 'HOSHILU_PR',
      pilot_id: text(pilot.pilot_id, 80),
      product_id: text(product.id, 20),
      shop_name: text(pilot.shop_name, 60),
      product_name: text(product.title, 200),
      image_url: https(product.image_url),
      url: https(product.destination_url),
      marketplace_label: MARKETPLACE_LABELS[product.marketplace] || text(product.marketplace, 40),
      price_jpy: priced ? price : null,
      price_verified_at: priced ? verifiedAt : ''
    };
  });
}

export async function searchPrItems(env, query, { list = activePilotListings, now = new Date() } = {}) {
  try {
    return pickSearchPr(await list(env, now), query);
  } catch {
    return [];
  }
}
