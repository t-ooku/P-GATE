// 2026-09-21 指示書 P2「匿名需要オファー」。
//
// 値下がり待ち（希望価格を決めて待っている人）に対して、Seller が
// 「この価格で出しています」と手を挙げられるようにする。
//
// 守ること:
//   ・**価格は Seller の申告を信じない。** HOSHILU が取得済みの実測価格だけを使う。
//     取れていなければ通知しない（「その価格で出している」と言い切れないので）
//   ・知らせるのは、その価格が自分の希望価格に届いた人だけ。届いていない人には出さない
//   ・Seller に誰が待っているかは渡さない。返すのは人数だけで、5人未満なら人数も出さない
//   ・**この経路は課金しない。** DMC 50円は「探し中 → 通知 → 商品を開く」のための値段で、
//     対象を広げるのは価格の変更にあたる（§54 課金は大隆さんの承認事項）。
//     残高・予算の判定も、クリックの記録もしない

import { readSellerSession } from './seller-auth.mjs';
import { SELLER_DEMAND_MIN_PEOPLE } from './shop-demand.mjs';

export const PRICE_OFFER_EVENT_TYPE = 'PRICE_OFFER_MATCH';

const CONTROL = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`, 'gu');
const clean = (value, max) => String(value ?? '').normalize('NFKC')
  .replace(CONTROL, ' ').replace(/\s+/gu, ' ').trim().slice(0, max);
const httpsUrl = (value, max = 500) => {
  const text = clean(value, max);
  if (!text) return '';
  try { const url = new URL(text); return url.protocol === 'https:' ? url.toString() : ''; } catch { return ''; }
};

const jsonResponse = (body, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });

// 希望価格がこの価格に届いた人だけ。届いていない人は対象にしない。
// 価格が確認できていない（null）ときは、誰も対象にしない。
export function reachedWishes(wishes = [], priceJpy = null) {
  const price = Number(priceJpy);
  if (!Number.isFinite(price) || price <= 0) return [];
  const seen = new Set();
  const out = [];
  for (const wish of wishes) {
    const memberId = String(wish?.member_id || '');
    const target = Number(wish?.target_price_jpy);
    if (!memberId || !Number.isFinite(target) || target <= 0) continue;
    if (target < price) continue;
    const wishId = String(wish?.wish_id || '');
    const key = `${memberId}:${wishId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ member_id: memberId, wish_id: wishId, target_price_jpy: target });
  }
  return out;
}

// Seller に返す数字。5人未満なら人数を出さない（誰かが特定されうるため）。
export function offerSummary(reached, { minPeople = SELLER_DEMAND_MIN_PEOPLE } = {}) {
  if (!Array.isArray(reached)) return { measurable: false };
  const people = new Set(reached.map((row) => row.member_id)).size;
  if (people < minPeople) {
    return { measurable: true, below_threshold: true, min_people: minPeople };
  }
  return { measurable: true, below_threshold: false, min_people: minPeople, notified_people: people };
}

// HOSHILU が取得済みの実測価格だけ。Seller の申告は使わない。
async function confirmedPrice(db, tenants, asin) {
  for (const tenant of tenants) {
    try {
      const listing = await db.prepare(
        `SELECT price FROM sp_api_listings WHERE tenant=?1 AND asin=?2 AND price>0 ORDER BY observed_at DESC LIMIT 1`
      ).bind(tenant, asin).first();
      if (listing && Number(listing.price) > 0) return Math.round(Number(listing.price));
    } catch { /* 表が無い環境ではこの経路を使わない */ }
    try {
      const offer = await db.prepare(
        `SELECT price FROM marketplace_offers WHERE tenant=?1 AND asin=?2 AND active=1 AND price>0 ORDER BY observed_at DESC LIMIT 1`
      ).bind(tenant, asin).first();
      if (offer && Number(offer.price) > 0) return Math.round(Number(offer.price));
    } catch { /* 同上 */ }
  }
  return null;
}

async function sellerTenants(db, sellerKey) {
  try {
    const row = await db.prepare('SELECT tenants FROM seller_billing_accounts WHERE seller_key=?1').bind(sellerKey).first();
    const parsed = JSON.parse(row?.tenants || '[]');
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean).slice(0, 20) : [];
  } catch { return []; }
}

async function sellerShop(db, sellerKey) {
  try {
    return await db.prepare('SELECT slug,shop_name FROM seller_shops WHERE seller_key=?1 LIMIT 1').bind(sellerKey).first();
  } catch { return null; }
}

// 通知の行き先は HOSHILU 内の Seller 商品ページ。署名（dm）は付けない＝課金の対象にしない。
export function priceOfferResultUrl(slug, asin) {
  const safeSlug = clean(slug, 40).toLowerCase();
  const safeAsin = clean(asin, 20).toUpperCase();
  if (!/^[a-z0-9-]{1,40}$/u.test(safeSlug) || !/^[A-Z0-9]{10}$/u.test(safeAsin)) return '';
  return `https://hoshilu.app/shop/${encodeURIComponent(safeSlug)}/product/${encodeURIComponent(safeAsin)}`;
}

async function notifyReached(env, reached, { product, shop, price, now }) {
  const db = env.PRODUCT_DB;
  const resultUrl = priceOfferResultUrl(shop?.slug, product.asin);
  const title = '希望価格で出している店が見つかりました';
  const statements = [];
  for (const row of reached) {
    const body = `「${product.product_name}」\n${String(shop?.shop_name || 'ショップ')}が ${price.toLocaleString('ja-JP')}円で出しています。`
      + `\nあなたの希望価格は ${row.target_price_jpy.toLocaleString('ja-JP')}円でした。`;
    const notificationId = `priceoffer-${String(row.wish_id).replace(/[^A-Za-z0-9-]/gu, '').slice(0, 40)}-${product.asin}`;
    const eventKey = `PRICEOFFER:${row.wish_id}:${product.asin}`.slice(0, 160);
    statements.push(db.prepare(`INSERT OR IGNORE INTO mywatch_notifications
      (notification_id,member_id,wish_id,event_key,event_type,channel,title,body,status,attempts,next_attempt_at,delivered_at,created_at,updated_at,asin,marketplace,image_url,result_url)
      VALUES(?1,?2,?3,?4,?5,'WEB',?6,?7,'DELIVERED',1,?8,?8,?8,?8,?9,'AMAZON_JP',?10,?11)`)
      .bind(notificationId, row.member_id, row.wish_id, eventKey, PRICE_OFFER_EVENT_TYPE,
        title, body, now, product.asin, httpsUrl(product.image_url), resultUrl));
  }
  if (!statements.length) return 0;
  try {
    const results = await db.batch(statements);
    return results.filter((result) => Number(result?.meta?.changes || 0) > 0).length;
  } catch { return 0; }
}

// POST /api/seller/price-offer — 値下がり待ちに「この価格で出しています」と手を挙げる。
// 課金しない。読み取りと通知だけ。
export async function handleSellerPriceOfferRoute(request, env, readSeller = readSellerSession) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/seller/price-offer') return null;
  if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  const seller = await readSeller(request, env);
  if (!seller?.seller_key) return jsonResponse({ ok: false, error: 'UNAUTHORIZED' }, 401);
  const db = env?.PRODUCT_DB;
  if (!db) return jsonResponse({ ok: false, error: 'STORE_NOT_CONFIGURED' }, 503);

  const payload = await request.json().catch(() => null);
  const asin = clean(payload?.asin, 20).toUpperCase();
  if (!/^[A-Z0-9]{10}$/u.test(asin)) return jsonResponse({ ok: false, error: 'ASIN_REQUIRED' }, 400);

  const tenants = await sellerTenants(db, seller.seller_key);
  if (!tenants.length) return jsonResponse({ ok: false, error: 'NO_TENANT' }, 400);

  let product = null;
  for (const tenant of tenants) {
    try {
      const row = await db.prepare(
        `SELECT product_name,image_url,asin FROM products WHERE tenant=?1 AND asin=?2 LIMIT 1`
      ).bind(tenant, asin).first();
      if (row) { product = row; break; }
    } catch { /* 次のテナントへ */ }
  }
  if (!product) return jsonResponse({ ok: false, error: 'PRODUCT_NOT_IN_YOUR_SHOP' }, 400);

  // 価格は取得済みの実測値だけ。取れなければ「出している」と言い切れないので通知しない。
  const price = await confirmedPrice(db, tenants, asin);
  if (price === null) {
    return jsonResponse({ ok: true, measurable: false, reason: 'PRICE_NOT_CONFIRMED', charged: false });
  }

  let wishes = [];
  try {
    const result = await db.prepare(
      `SELECT member_id, wish_id,
         CAST(COALESCE(json_extract(condition_snapshot,'$.price_condition.target_price_jpy'),0) AS INTEGER) AS target_price_jpy
       FROM member_wishes
       WHERE archived_at IS NULL
         AND COALESCE(json_extract(condition_snapshot,'$.price_condition.target_product_key'),'')=?1
         AND COALESCE(json_extract(condition_snapshot,'$.price_condition.kind'),'TARGET_PRICE')<>'POST_PURCHASE'
       LIMIT 500`
    ).bind(asin).all();
    wishes = result?.results || [];
  } catch {
    return jsonResponse({ ok: true, measurable: false, reason: 'DEMAND_NOT_MEASURABLE', charged: false });
  }

  const reached = reachedWishes(wishes, price);
  const shop = await sellerShop(db, seller.seller_key);
  const notified = await notifyReached(env, reached, { product, shop, price, now: new Date().toISOString() });

  return jsonResponse({
    ok: true,
    price_jpy: price,
    // 通知は届いた人にだけ。Seller には誰かは渡さない。
    ...offerSummary(reached),
    queued: notified,
    // この経路は課金しない（DMC 50円の対象を広げていない）
    charged: false
  });
}
