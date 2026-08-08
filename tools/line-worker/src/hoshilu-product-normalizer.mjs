// v4.3 指示書 section 21-23: 正規化パイプラインとcanonical productの構築。
//
// source data → normalizeOffer (hoshilu-product-schema.mjs) →
// HOSHILU Product Schema → (このファイル) canonical productへ束ねる →
// D1(hoshilu_products / hoshilu_product_offers, migrations/0042)
//
// 今回のスコープでは、この正規化パイプラインを handleKnowledgeApi の
// ライブ検索経路へは接続しない(将来のSearch API/AI最安比較統合はこの上に
// 乗せる基盤として用意する - v4.2 PR-Eの sponsor-intent-matching.mjs と
// 同じ「テスト済みだが本番未配線」のパターン)。

import { normalizeOffer } from './hoshilu-product-schema.mjs';
import { matchProductIdentity } from './product-identity-matching.mjs';

// crypto.randomUUID の代わりに、同じオファー集合を渡せば毎回同じ
// hoshilu_product_id を再現できる決定的なハッシュを使う(冪等なupsertのため)。
// 暗号強度は不要 - 衝突を実務上十分避けられればよい(FNV-1a, 32bit x2)。
function stableId(seed) {
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  const text = String(seed);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 = (h1 ^ code) >>> 0;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + code) >>> 0;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `HP_${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

function offerSourceKey(offer) {
  return `${offer.source_marketplace}:${offer.source_product_id}`;
}

// tier 1-4(JAN/GTIN→ASIN→型番→ブランド+正式名+サイズ)の確定判定のみで
// canonical productへグルーピングする、純粋関数版(D1不要)。Union-Find的に
// 推移的な一致(A=B, B=C → A,B,C同一グループ)も扱う。AIによる類似判定
// (tier 5)はここでは使わない - 構造的なグルーピングを不確実な推定に
// 依存させないため(section 20: 類似商品と同一商品を分離)。
export function groupOffersIntoCanonicalProducts(rawOffers) {
  const offers = rawOffers.map((raw) => (raw.hoshilu_product_id !== undefined ? raw : normalizeOffer(raw, { sourceMarketplace: raw.source_marketplace, updatedAt: raw.updated_at })));
  const parent = new Map(offers.map((offer) => [offerSourceKey(offer), offerSourceKey(offer)]));
  const find = (key) => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root);
    let cursor = key;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor);
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  };

  for (let i = 0; i < offers.length; i += 1) {
    for (let j = i + 1; j < offers.length; j += 1) {
      const { matched } = matchProductIdentity(offers[i], offers[j]);
      if (matched) union(offerSourceKey(offers[i]), offerSourceKey(offers[j]));
    }
  }

  const groups = new Map();
  for (const offer of offers) {
    const root = find(offerSourceKey(offer));
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(offer);
  }

  const canonicalProducts = [];
  for (const groupOffers of groups.values()) {
    // グループ内で既にhoshilu_product_idを持つオファーがあればそれを使う
    // (D1に永続化済みのcanonical productへ新しいオファーを合流させるケース)。
    // 無ければ、グループ内で最も安定してソートされるキーからIDを生成する
    // - どのオファーを先に処理しても毎回同じcanonical IDになる。
    const existingId = groupOffers.map((offer) => offer.hoshilu_product_id).find(Boolean);
    const sortedKeys = groupOffers.map(offerSourceKey).sort();
    const hoshiluProductId = existingId || stableId(sortedKeys[0]);
    canonicalProducts.push({
      hoshilu_product_id: hoshiluProductId,
      offers: groupOffers.map((offer) => ({ ...offer, hoshilu_product_id: hoshiluProductId }))
    });
  }
  return canonicalProducts;
}

async function findExistingCanonicalId(db, offer) {
  if (offer.jan) {
    const row = await db.prepare(
      'SELECT hoshilu_product_id FROM hoshilu_product_offers WHERE jan = ?1 LIMIT 1'
    ).bind(offer.jan).first();
    if (row?.hoshilu_product_id) return row.hoshilu_product_id;
  }
  if (offer.gtin) {
    const row = await db.prepare(
      'SELECT hoshilu_product_id FROM hoshilu_product_offers WHERE gtin = ?1 LIMIT 1'
    ).bind(offer.gtin).first();
    if (row?.hoshilu_product_id) return row.hoshilu_product_id;
  }
  if (offer.brand && offer.normalized_title) {
    const row = await db.prepare(
      `SELECT hoshilu_product_id FROM hoshilu_product_offers
       WHERE brand = ?1 AND normalized_title = ?2 LIMIT 1`
    ).bind(offer.brand, offer.normalized_title).first();
    if (row?.hoshilu_product_id) return row.hoshilu_product_id;
  }
  return null;
}

// D1(hoshilu_products / hoshilu_product_offers)への冪等なupsert。1件ずつの
// 呼び出しを想定(バッチ投入は呼び出し元でループする)。マッチングはJAN/GTIN
// 完全一致、次にブランド+正式商品名完全一致のみを使う(tier 1・4相当の安価な
// クエリ)。型番一致(tier 3)やAI類似判定(tier 5)による合流は、将来
// groupOffersIntoCanonicalProducts()をバッチ処理へ適用する形で拡張する
// 前提の既知の未実装範囲(完了報告に明記する)。
export async function upsertNormalizedOffer(db, rawOffer, { sourceMarketplace, updatedAt } = {}) {
  const offer = normalizeOffer(rawOffer, { sourceMarketplace, updatedAt });
  const existingId = await findExistingCanonicalId(db, offer);
  const hoshiluProductId = existingId || stableId(offerSourceKey(offer));
  const now = offer.updated_at;

  if (existingId) {
    await db.prepare('UPDATE hoshilu_products SET updated_at = ?1 WHERE hoshilu_product_id = ?2')
      .bind(now, hoshiluProductId).run();
  } else {
    await db.prepare(
      `INSERT INTO hoshilu_products
        (hoshilu_product_id, brand, normalized_title, category, representative_image_url, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
       ON CONFLICT(hoshilu_product_id) DO UPDATE SET updated_at = excluded.updated_at`
    ).bind(hoshiluProductId, offer.brand || '', offer.normalized_title || '', offer.category || '', offer.image_url, now).run();
  }

  await db.prepare(
    `INSERT INTO hoshilu_product_offers
      (hoshilu_product_id, source_marketplace, source_product_id, asin, jan, gtin,
       manufacturer_part_number, brand, title, normalized_title, category, attributes,
       image_url, product_url, price, shipping_fee, effective_price, currency,
       stock_status, seller_id, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21)
     ON CONFLICT(source_marketplace, source_product_id) DO UPDATE SET
       hoshilu_product_id = excluded.hoshilu_product_id, asin = excluded.asin, jan = excluded.jan,
       gtin = excluded.gtin, manufacturer_part_number = excluded.manufacturer_part_number,
       brand = excluded.brand, title = excluded.title, normalized_title = excluded.normalized_title,
       category = excluded.category, attributes = excluded.attributes, image_url = excluded.image_url,
       product_url = excluded.product_url, price = excluded.price, shipping_fee = excluded.shipping_fee,
       effective_price = excluded.effective_price, currency = excluded.currency,
       stock_status = excluded.stock_status, seller_id = excluded.seller_id, updated_at = excluded.updated_at`
  ).bind(
    hoshiluProductId, offer.source_marketplace, offer.source_product_id, offer.asin, offer.jan, offer.gtin,
    offer.manufacturer_part_number, offer.brand, offer.title, offer.normalized_title, offer.category,
    offer.attributes, offer.image_url, offer.product_url, offer.price, offer.shipping_fee,
    offer.effective_price, offer.currency, offer.stock_status, offer.seller_id, offer.updated_at
  ).run();

  return { hoshilu_product_id: hoshiluProductId, offer };
}
