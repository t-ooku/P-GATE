// 2026-10-02 大隆さん指示書「今ほしい人が買うためのサービス」§4④・§5: 価格推移の記録。
//
// 検索・BUZZ・希望価格の巡回で、楽天市場・Yahoo!ショッピングの API から実際に取れた価格を
// 1商品×1販売先×1日 = 1行 で price_observations に追記する。記録を始めた日が「HOSHILUでの
// 価格記録開始日」。HOSHILU が取っていない期間は埋めない。AI の推測は入れない。
//
// 入れないもの: 検索本文・検索単位ID・会員ID・Amazon の価格（過去価格の表示条件を確認するまで）。
// 失敗しても検索や棚を止めない（呼び出し側は waitUntil / catch で包む）。

const RECORDABLE = new Set(['RAKUTEN_JP', 'YAHOO_JP']);
const MAX_ROWS_PER_CALL = 60;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function jstDate(now = new Date()) {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function text(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function positiveInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function nonNegativeInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

// 楽天: itemCode は "店舗:商品" の形。Yahoo!: 商品URL store.shopping.yahoo.co.jp/<store>/... から店舗を取る。
export function sellerIdFor(marketplace, externalProductId, productUrl) {
  if (marketplace === 'RAKUTEN_JP') return externalProductId.includes(':') ? externalProductId.split(':')[0] : '';
  const match = /^https:\/\/store\.shopping\.yahoo\.co\.jp\/([^/]+)\//iu.exec(String(productUrl || ''));
  return match ? match[1] : '';
}

// 検索結果・棚・巡回の candidate（rakuten-marketplace-api / yahoo-shopping-api の形）を観測行にする。
export function observationsFromCandidates(candidates = [], { source = '', now = new Date() } = {}) {
  const rows = [];
  const seen = new Set();
  const date = jstDate(now);
  const at = now.toISOString();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const recordKey = text(candidate?.record_key, 160);
    if (!recordKey) continue;
    for (const offer of Array.isArray(candidate?.offers) ? candidate.offers : []) {
      const marketplace = text(offer?.marketplace, 32);
      if (!RECORDABLE.has(marketplace)) continue;
      const price = positiveInt(offer?.price);
      if (!price) continue;
      const productUrl = text(offer?.product_url, 600);
      // 商品ID: 楽天 "RAKUTEN:店舗:商品" / Yahoo! "YAHOO:コード" または "JAN:…"（JAN のときはURLから商品コードが取れないので record_key をそのまま使う）
      const externalProductId = recordKey.startsWith('RAKUTEN:') ? recordKey.slice(8)
        : recordKey.startsWith('YAHOO:') ? recordKey.slice(6) : recordKey;
      // 商品IDが取れず URL しか無いものは同一性が保てないので記録しない
      if (!externalProductId || /^https?:/iu.test(externalProductId)) continue;
      const sellerId = text(sellerIdFor(marketplace, externalProductId, productUrl), 80);
      const key = `${marketplace}|${externalProductId}|${sellerId}|${date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const shippingConfirmed = offer?.shipping_fee_confirmed === true;
      const shipping = shippingConfirmed ? nonNegativeInt(offer?.shipping_fee) : null;
      const jan = /^JAN:\d+$/u.test(recordKey) ? recordKey.slice(4) : text(candidate?.jan, 14);
      rows.push({
        observation_key: key,
        record_key: recordKey,
        jan,
        marketplace,
        external_product_id: text(externalProductId, 160),
        seller_id: sellerId,
        product_name: text(candidate?.display_name || candidate?.product_name, 200),
        product_url: productUrl,
        price,
        shipping,
        total: shipping === null ? null : price + shipping,
        stock_status: text(offer?.stock_status, 20) || 'UNKNOWN',
        source: text(source || offer?.source, 40) || 'unknown',
        observed_date: date,
        observed_at: at
      });
      if (rows.length >= MAX_ROWS_PER_CALL) return rows;
    }
  }
  return rows;
}

// 同じ日の2回目以降は、その日の最安値だけ残す（値上がりで上書きしない）。
const UPSERT = `INSERT INTO price_observations
  (observation_key, record_key, jan, marketplace, external_product_id, seller_id, product_name, product_url,
   price, shipping, total, stock_status, source, observed_date, observed_at)
  VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)
  ON CONFLICT(observation_key) DO UPDATE SET
    price=excluded.price, shipping=excluded.shipping, total=excluded.total, stock_status=excluded.stock_status,
    product_url=excluded.product_url, source=excluded.source, observed_at=excluded.observed_at
  WHERE excluded.price < price_observations.price`;

export async function recordPriceObservations(env, candidates, options = {}) {
  const db = env?.PRODUCT_DB;
  if (!db || env?.PRICE_OBSERVATIONS_ENABLED === 'false') return { recorded: 0, skipped: 'DISABLED' };
  const rows = observationsFromCandidates(candidates, options);
  if (!rows.length) return { recorded: 0 };
  try {
    await db.batch(rows.map((row) => db.prepare(UPSERT).bind(
      row.observation_key, row.record_key, row.jan, row.marketplace, row.external_product_id, row.seller_id,
      row.product_name, row.product_url, row.price, row.shipping, row.total, row.stock_status, row.source,
      row.observed_date, row.observed_at
    )));
    return { recorded: rows.length };
  } catch (error) {
    // 表が無い（migration 未適用）場合も検索を止めない。
    console.warn('PRICE_OBSERVATION_WRITE_FAILED', { code: String(error?.message || error).slice(0, 80) });
    return { recorded: 0, skipped: 'WRITE_FAILED' };
  }
}

// 商品詳細で使う集計（§4④）。事実だけ返し、将来の価格は予言しない。
// 7日前・30日/90日の最安・中央値・最高・記録開始日。データが無い期間は null。
export async function priceHistorySummary(env, recordKey, { now = new Date() } = {}) {
  const db = env?.PRODUCT_DB;
  const key = text(recordKey, 160);
  if (!db || !key) return null;
  const today = jstDate(now);
  const since = jstDate(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
  let rows = [];
  try {
    rows = (await db.prepare(`SELECT observed_date, MIN(COALESCE(total, price)) AS price
      FROM price_observations WHERE record_key=?1 AND observed_date>=?2 AND observed_date<=?3
      GROUP BY observed_date ORDER BY observed_date ASC`).bind(key, since, today).all()).results || [];
  } catch {
    return null;
  }
  if (!rows.length) return { record_key: key, measurable: false, reason: 'NO_OBSERVATIONS' };
  const window = (days) => {
    const from = jstDate(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
    const prices = rows.filter((row) => row.observed_date >= from).map((row) => Number(row.price)).sort((a, b) => a - b);
    if (!prices.length) return null;
    return { min: prices[0], max: prices[prices.length - 1], median: prices[Math.floor(prices.length / 2)], days_observed: prices.length };
  };
  const sevenDaysAgo = jstDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  const sevenDayRow = [...rows].reverse().find((row) => row.observed_date <= sevenDaysAgo) || null;
  return {
    record_key: key,
    measurable: true,
    recording_since: rows[0].observed_date,
    latest: { date: rows[rows.length - 1].observed_date, price: Number(rows[rows.length - 1].price) },
    seven_days_ago: sevenDayRow ? { date: sevenDayRow.observed_date, price: Number(sevenDayRow.price) } : null,
    d30: window(30),
    d90: window(90),
    series: rows.map((row) => ({ date: row.observed_date, price: Number(row.price) }))
  };
}
