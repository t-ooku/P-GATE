// v4.3 指示書 section 19・20: AI最安比較で最重要の「同一商品判定」。
// 別商品を価格比較してはいけないので、以下の優先順位で同一商品かどうかを
// 判定する:
//   1. JAN / GTIN
//   2. ASIN等モールID
//   3. メーカー型番
//   4. ブランド＋正式商品名＋容量/サイズ
//   5. AIによる類似判定 (このモジュールの範囲外 - 呼び出し元が
//      tier===nullの結果を受けて、必要ならAI類似判定にかけるか、
//      「類似商品」として別枠に出す)
//
// このモジュールはtier 1-4の決定的な(AIを使わない)判定のみを行う。
// canonical product(hoshilu-product-normalizer.mjs)のグルーピングは
// tier 1-4の確定判定のみを使い、AI類似判定では自動統合しない - 「類似商品と
// 同一商品を分離する」(section 20)という要件に対して、構造的なグルーピング
// (canonical product)を不確実なAI推定に依存させないための安全側の設計。

function normalizedValue(value) {
  const cleaned = String(value ?? '').trim();
  return cleaned ? cleaned.toUpperCase() : null;
}

// ブランド+正式商品名+容量/サイズの一致判定。normalized_titleは
// hoshilu-product-schema.mjs の normalizeTitle() で作られたもの(ブランド名を
// 含む)を前提とし、attributes中のsize/capacity相当のキーも一致させる。
function attributeValue(offer, keys) {
  if (!offer.attributes) return null;
  let parsed;
  try {
    parsed = typeof offer.attributes === 'string' ? JSON.parse(offer.attributes) : offer.attributes;
  } catch {
    return null;
  }
  for (const key of keys) {
    if (parsed?.[key] !== undefined && parsed[key] !== null && parsed[key] !== '') {
      return normalizedValue(parsed[key]);
    }
  }
  return null;
}

const SIZE_KEYS = ['size', 'capacity', 'volume', 'variant'];

// offerA/offerBは hoshilu-product-schema.mjs の normalizeOffer() 出力を想定
// (jan/gtin/asin/manufacturer_part_number/brand/normalized_title/attributes
// を持つ)。同一商品と判定できたtier名を返し、どのtierでも一致しなければ
// nullを返す(=AI類似判定 or 類似商品扱いへ)。
export function matchProductIdentity(offerA, offerB) {
  if (!offerA || !offerB) return { tier: null, matched: false };

  const janA = normalizedValue(offerA.jan);
  const janB = normalizedValue(offerB.jan);
  if (janA && janB && janA === janB) return { tier: 'jan', matched: true };

  const gtinA = normalizedValue(offerA.gtin);
  const gtinB = normalizedValue(offerB.gtin);
  if (gtinA && gtinB && gtinA === gtinB) return { tier: 'gtin', matched: true };

  const asinA = normalizedValue(offerA.asin);
  const asinB = normalizedValue(offerB.asin);
  if (asinA && asinB && asinA === asinB) return { tier: 'asin', matched: true };

  const mpnA = normalizedValue(offerA.manufacturer_part_number);
  const mpnB = normalizedValue(offerB.manufacturer_part_number);
  const brandA = normalizedValue(offerA.brand);
  const brandB = normalizedValue(offerB.brand);
  // 型番だけでは異なるブランドの偶然の一致を拾い得るので、ブランドが両方
  // 分かっている場合は一致も必須にする(分かっていなければ型番のみで判定)。
  if (mpnA && mpnB && mpnA === mpnB && (!brandA || !brandB || brandA === brandB)) {
    return { tier: 'manufacturer_part_number', matched: true };
  }

  const titleA = normalizedValue(offerA.normalized_title);
  const titleB = normalizedValue(offerB.normalized_title);
  if (brandA && brandB && brandA === brandB && titleA && titleB && titleA === titleB) {
    const sizeA = attributeValue(offerA, SIZE_KEYS);
    const sizeB = attributeValue(offerB, SIZE_KEYS);
    // サイズ/容量情報がどちらかに無ければブランド+正式商品名一致のみで
    // 判定(過剰に厳格化して同一商品を取りこぼさないため)。両方分かって
    // いて食い違う場合のみ不一致とする。
    if (!sizeA || !sizeB || sizeA === sizeB) {
      return { tier: 'brand_title_size', matched: true };
    }
  }

  return { tier: null, matched: false };
}
