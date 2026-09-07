import { targetPriceProductKey } from './target-price-product-key.mjs';

// Official Rakuten FAQ 900001974343 permits price/availability cache for 24h.
// Retain for 23h, leaving a purge margin; reads always reject expired prices.
// Amazon and Yahoo are excluded until their API-specific terms are verified.
export const PRICE_CACHE_TTL_MS = 23 * 60 * 60 * 1000;

export function normalizedPriceCacheRows(candidates, now = new Date()) {
  const fetched = now.toISOString();
  const expires = new Date(now.getTime() + PRICE_CACHE_TTL_MS).toISOString();
  const rows = new Map();
  for (const candidate of candidates || []) {
    const key = targetPriceProductKey(candidate);
    if (candidate.marketplace_source !== 'RAKUTEN_ICHIBA_API' || !key.startsWith('RAKUTEN:')) continue;
    for (const offer of candidate.offers || []) {
      if (offer.marketplace !== 'RAKUTEN_JP' || offer.source !== 'rakuten_ichiba_api'
        || offer.currency !== 'JPY' || offer.stock_status !== 'IN_STOCK') continue;
      const price = Number(offer.price);
      if (!Number.isSafeInteger(price) || price <= 0) continue;
      const fee = offer.shipping_fee_confirmed === true && offer.shipping_fee !== null
        && offer.shipping_fee !== undefined ? Number(offer.shipping_fee) : null;
      const shipping = fee !== null && Number.isSafeInteger(fee) && fee >= 0 ? fee : null;
      const effective = shipping === null ? null : price + shipping;
      if (effective !== null && !Number.isSafeInteger(effective)) continue;
      rows.set(key, { record_key: key, marketplace: 'RAKUTEN_JP', marketplace_product_id: key.slice(8),
        price, shipping, effective_price: effective, currency: 'JPY', fetched_at: fetched,
        expires_at: expires, source: 'rakuten_ichiba_api' });
    }
  }
  return [...rows.values()].slice(0, 150);
}

export async function persistMarketplacePrices(env, candidates, now = new Date()) {
  if (!env.PRODUCT_DB || env.MARKETPLACE_PRICE_CACHE_ENABLED !== 'true') return { status: 'DISABLED', saved: 0 };
  const rows = normalizedPriceCacheRows(candidates, now);
  if (!rows.length) return { status: 'EMPTY', saved: 0 };
  try {
    const statements = rows.map(row => env.PRODUCT_DB.prepare(`INSERT INTO marketplace_price_cache
      (record_key,marketplace,marketplace_product_id,price,shipping,effective_price,currency,fetched_at,expires_at,source)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
      ON CONFLICT(record_key) DO UPDATE SET price=excluded.price,shipping=excluded.shipping,
      effective_price=excluded.effective_price,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at
      WHERE excluded.fetched_at>=marketplace_price_cache.fetched_at`)
      .bind(row.record_key,row.marketplace,row.marketplace_product_id,row.price,row.shipping,row.effective_price,
        row.currency,row.fetched_at,row.expires_at,row.source));
    for (let offset = 0; offset < statements.length; offset += 40) await env.PRODUCT_DB.batch(statements.slice(offset, offset + 40));
    return { status: 'SAVED', saved: rows.length };
  } catch {
    console.warn('MARKETPLACE_PRICE_CACHE_WRITE_FAILED');
    return { status: 'UNAVAILABLE', saved: 0 };
  }
}

export async function readFreshMarketplacePrice(env, key, now = new Date()) {
  if (!env.PRODUCT_DB || env.MARKETPLACE_PRICE_CACHE_ENABLED !== 'true') return null;
  try {
    return await env.PRODUCT_DB.prepare(`SELECT record_key,marketplace,marketplace_product_id,price,shipping,
      effective_price,currency,fetched_at,expires_at,source FROM marketplace_price_cache
      WHERE record_key=?1 AND expires_at>?2 AND fetched_at<=?2 LIMIT 1`).bind(key, now.toISOString()).first();
  } catch { return null; }
}

export async function purgeExpiredMarketplacePrices(env, now = new Date()) {
  if (!env.PRODUCT_DB) return;
  try {
    await env.PRODUCT_DB.prepare('DELETE FROM marketplace_price_cache WHERE expires_at<=?1').bind(now.toISOString()).run();
  } catch { console.warn('MARKETPLACE_PRICE_CACHE_PURGE_FAILED'); }
}
