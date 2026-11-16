import { isUniqueJan } from './jan-validity.mjs';
import { isMarketplaceProductUrl } from './marketplace-product-url-policy.mjs';
import { compareVariants, variantAttributes, VARIANT_SAME } from './product-variant-identity.mjs';
import { matchProductIdentity } from './product-identity-matching.mjs';
import { rakutenAffiliateProductTarget } from './rakuten-url-policy.mjs';

export const C1_RAKUTEN_CATALOG_REQUEST_LIMIT = 3; // Existing main catalog variant cap.
export const isC1Jan = (jan) => typeof jan === 'string' && /^\d{13}$/u.test(jan) && isUniqueJan(jan);
const code = (v) => String(v ?? '').trim().normalize('NFKC').toUpperCase();

export function hasUnambiguousListedJan(jan, name, caption) {
  if (!isC1Jan(jan)) return false;
  const hits = new Set([name, caption].flatMap((field) =>
    [...String(field || '').matchAll(/(?<!\p{Nd})[0-9]{13}(?!\p{Nd})/gu)].map((m) => m[0])
  ).filter(isC1Jan));
  return hits.size === 1 && hits.has(jan);
}

// A single printed JAN can coexist with a selectable variant on the same
// listing. Do not trust the headline or its displayed price in that case.
export function hasC1ListingOptions(...fields) {
  return fields.some((field) => {
    const value = String(field ?? '').normalize('NFKC').replace(/\s+/gu, '');
    return /選べる|全\d+(?:色|種類|タイプ)|(?:カラー|色番|色|種類|タイプ|容量|サイズ|バリエーション)(?:を|の|[:：])?(?:お?選び|ご?選択)|(?:\d+(?:色|種類)|タイプ)から(?:お?選び|ご?選択)/u.test(value);
  });
}

function sameC1Sku(a, b) {
  if (!isC1Jan(a.jan) || a.jan !== b.jan) return false;
  for (const key of ['gtin', 'manufacturer_part_number']) {
    const x = code(a[key]), y = code(b[key]);
    if ((x || y) && x !== y) return false;
  }
  const left = variantAttributes(a.title, a.attributes);
  const right = variantAttributes(b.title, b.attributes);
  // The shared matcher misses some bare units (for example 2本 and 2包).
  // Reject one-sided or conflicting quantity without altering shared rules.
  const explicitCounts = (title) => [...new Set([...String(title).normalize('NFKC')
    .matchAll(/(?<![0-9A-Za-z.])([1-9]\d*)\s*([本包])(?!体|目|店|舗|装|括)/gu)]
    .map((m) => m[1] + m[2]))];
  const leftCounts = explicitCounts(a.title);
  const rightCounts = explicitCounts(b.title);
  if (leftCounts.length > 1 || rightCounts.length > 1 || leftCounts[0] !== rightCounts[0]) return false;
  // The shared matcher deliberately ignores one-sided capacity for general
  // search. C-1 must not infer it when the listing supplies a capacity on only one side.
  return left.capacity === right.capacity
    && matchProductIdentity(a, b).tier === 'jan' && compareVariants(left, right) === VARIANT_SAME;
}

function checkedOffer(offer, mall, at) {
  const age = at - Date.parse(offer?.observed_at);
  return offer?.marketplace === mall && isC1Jan(offer.jan)
    && typeof offer.title === 'string' && offer.title.trim()
    && !hasC1ListingOptions(offer.title)
    && variantAttributes(offer.title, offer.attributes).set_type !== 'set'
    && offer.stock_status === 'IN_STOCK' && offer.currency === 'JPY'
    && Number.isFinite(offer.price) && offer.price > 0
    && Number.isFinite(age) && age >= 0 && age <= 24 * 60 * 60 * 1000
    && isMarketplaceProductUrl(mall, offer.product_url);
}

function rakutenListingId(url) {
  if (!isMarketplaceProductUrl('RAKUTEN_JP', url)) return '';
  const u = new URL(rakutenAffiliateProductTarget(url) || url);
  return u.hostname + u.pathname.replace(/\/+$/u, '');
}

// At most one JAN and one HTTP attempt per search. Never create a new card
// from a JAN hit; put a proven Rakuten offer on the existing Yahoo candidate.
export async function bridgeRakutenJan({
  candidates, yahooCandidates, usedCatalogRequests, deadlineAt, lookup, now = Date.now,
  minRemainingMs = 800, maxLookupMs = 1600
}) {
  const unchanged = (status) => ({ candidates, status, added: 0 });
  if (!Number.isInteger(usedCatalogRequests) || usedCatalogRequests < 0
    || usedCatalogRequests >= C1_RAKUTEN_CATALOG_REQUEST_LIMIT) return unchanged('NO_CALL_BUDGET');
  const startedAt = now();
  const remaining = Math.min(maxLookupMs, deadlineAt - startedAt);
  if (!Number.isFinite(remaining) || remaining < minRemainingMs) return unchanged('NO_TIME_BUDGET');
  const anchor = yahooCandidates.find((candidate) => candidates.includes(candidate)
    && candidate.offers?.some((offer) => checkedOffer(offer, 'YAHOO_JP', startedAt)
      && candidate.record_key === `JAN:${offer.jan}`)
    && !candidate.offers.some((offer) => offer.marketplace === 'RAKUTEN_JP'));
  if (!anchor) return unchanged('NO_VERIFIED_YAHOO_TARGET');
  const yahoo = anchor.offers.find((offer) => checkedOffer(offer, 'YAHOO_JP', startedAt) && anchor.record_key === `JAN:${offer.jan}`);
  let timer;
  let hits;
  try {
    const result = await Promise.race([
      lookup(yahoo.jan, { requestTimeoutMs: remaining, signal: AbortSignal.timeout(remaining) }),
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), remaining); })
    ]);
    if (result === null || now() > deadlineAt) return unchanged('TIMEOUT');
    hits = Array.isArray(result) ? result : [];
  } catch {
    return unchanged(now() >= deadlineAt ? 'TIMEOUT' : 'LOOKUP_FAILED');
  } finally {
    clearTimeout(timer);
  }
  const checkedAt = now();
  const matched = hits.flatMap((item) => item.offers || [])
    .filter((offer) => checkedOffer(offer, 'RAKUTEN_JP', checkedAt) && sameC1Sku(yahoo, offer))
    .sort((a, b) => a.price - b.price);
  if (!matched.length) return unchanged('NO_EXACT_MATCH');
  const best = matched[0];
  const listingId = rakutenListingId(best.product_url);
  const withOffer = { ...anchor, offers: [...anchor.offers, best] };
  return { status: 'MATCHED', added: 1, candidates: candidates.flatMap((candidate) => {
    if (candidate === anchor) return [withOffer];
    // Only suppress a duplicate card for the proven same Rakuten listing;
    // do not discard other malls or other offers as a side effect.
    const others = candidate.offers || [];
    if (listingId && others.length && others.every((o) =>
      o.marketplace === 'RAKUTEN_JP' && rakutenListingId(o.product_url) === listingId)) return [];
    return [candidate];
  }) };
}
