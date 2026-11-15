import { isUniqueJan } from './jan-validity.mjs';
import { matchProductIdentity } from './product-identity-matching.mjs';
import { compareVariants, VARIANT_SAME } from './product-variant-identity.mjs';
import { isMarketplaceProductUrl } from './marketplace-product-url-policy.mjs';
import { REAL_PRICE_MAX_AGE_MS } from './ai-price-comparison.mjs';

export const ITEM_PRICE_COVERAGE_DEFINITION = 'item-price-in-stock-24h-direct-2m-v1';
export const COSMETICS_COHORT_ID = 'cosmetics-cheapest-v1';
const IDS = Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0'));
const text = (value) => String(value ?? '').trim().normalize('NFKC').toUpperCase();
const validC1Jan = (value) => /^\d{13}$/u.test(text(value)) && isUniqueJan(text(value));
const finiteTime = (value) => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/u.test(value)
  && /(?:Z|[+-]\d\d:\d\d)$/u.test(value) ? Date.parse(value) : NaN;

// Eligibility after identity was independently verified. Never read shipping
// or total_cost, and never mistake a price without a timestamp for a fresh one.
export function isEligibleItemPriceEvidence(offer, asOfMs) {
  if (offer?.source !== 'REAL' || offer?.stock_status !== 'IN_STOCK' || offer?.currency !== 'JPY') return false;
  if (typeof offer.price !== 'number' || !Number.isFinite(offer.price) || !(offer.price > 0)) return false;
  const age = asOfMs - finiteTime(offer.observed_at);
  return Number.isFinite(age) && age >= 0 && age <= REAL_PRICE_MAX_AGE_MS
    && isMarketplaceProductUrl(offer.marketplace, offer.product_url);
}

// Deliberately narrower C-1 acceptance/evaluation gate, not a replacement for
// identity matching in production. A page-verification flag is set only by QA.
function isVerifiedC1Identity(target, offer) {
  if (offer?.verification !== 'page_verified' || !validC1Jan(target.jan)) return false;
  if (text(target.jan) !== text(offer.jan)) return false;
  const model = text(target.manufacturer_part_number);
  const offeredModel = text(offer.manufacturer_part_number);
  if ((model || offeredModel) && model !== offeredModel) return false;
  return matchProductIdentity(target, offer).tier === 'jan'
    && compareVariants(target, offer) === VARIANT_SAME;
}

export function scoreVerifiedC1Offers(target, offers, asOfMs) {
  const cheapestByMall = new Map();
  for (const offer of Array.isArray(offers) ? offers : []) {
    if (!target || !isVerifiedC1Identity(target, offer) || !isEligibleItemPriceEvidence(offer, asOfMs)) continue;
    const prior = cheapestByMall.get(offer.marketplace);
    if (!prior || offer.price < prior.price) cheapestByMall.set(offer.marketplace, offer);
  }
  const rows = [...cheapestByMall.values()].sort((a, b) => a.price - b.price);
  return { rows, marketplace_count: rows.length, established: rows.length >= 2 };
}

function indexCases(rows, label) {
  if (!Array.isArray(rows)) throw Error(`${label}: expected an array`);
  const map = new Map();
  for (const row of rows) {
    if (!IDS.includes(row?.id) || map.has(row.id)) throw Error(`${label}: unknown or duplicate case id`);
    map.set(row.id, row);
  }
  return map;
}

function scoreSnapshot(roster, snapshot) {
  if (typeof snapshot?.revision !== 'string' || !/^[a-f0-9]{7,40}$/u.test(snapshot.revision)
    || !Number.isFinite(finiteTime(snapshot.captured_at))) throw Error('snapshot: revision and captured_at required');
  const attempts = indexCases(snapshot.cases, 'snapshot');
  const cases = IDS.map((id) => {
    const base = roster.get(id);
    if (base.verification !== 'page_verified' || !validC1Jan(base.target?.jan))
      return { id, status: 'UNVERIFIED_TARGET' };
    const a = attempts.get(id);
    if (!a) return { id, status: 'NOT_MEASURED' };
    if (a.status === 'failed') return { id, status: 'MEASUREMENT_FAILED' };
    if (a.status === 'unverified') return { id, status: 'UNVERIFIED_OFFERS' };
    if (a.status !== 'complete' || !Array.isArray(a.offers) || !Number.isFinite(finiteTime(a.measured_at)))
      throw Error(`snapshot: invalid complete record for ${id}`);
    const score = scoreVerifiedC1Offers(base.target, a.offers, finiteTime(a.measured_at));
    return { id, status: 'MEASURED', marketplace_count: score.marketplace_count, established: score.established };
  });
  const measured = cases.filter(({ status }) => status === 'MEASURED');
  const established = measured.filter((value) => value.established).length;
  return {
    revision: snapshot.revision, captured_at: snapshot.captured_at,
    denominator: IDS.length, measured: measured.length, established,
    rate: measured.length === IDS.length ? established / IDS.length : null,
    confirmed_lower_bound: measured.length ? established / IDS.length : null,
    cases
  };
}

export function evaluateCosmeticsCoverage(input) {
  if (input?.cohort_id !== COSMETICS_COHORT_ID) throw Error('unexpected cohort id');
  const roster = indexCases(input.roster, 'roster');
  if (roster.size !== IDS.length) throw Error('roster must retain all 20 cases');
  const before = scoreSnapshot(roster, input.before);
  const after = input.after ? scoreSnapshot(roster, input.after) : null;
  const pairs = before.cases.map((a, i) => [a, after?.cases[i]])
    .filter(([a, b]) => a.status === 'MEASURED' && b?.status === 'MEASURED');
  return {
    definition: ITEM_PRICE_COVERAGE_DEFINITION, cohort_id: COSMETICS_COHORT_ID, before, after,
    comparison: after ? {
      paired_count: pairs.length,
      paired_before_established: pairs.filter(([a]) => a.established).length,
      paired_after_established: pairs.filter(([, b]) => b.established).length,
      percentage_point_delta: before.rate !== null && after.rate !== null
        ? 100 * (after.rate - before.rate) : null
    } : null
  };
}
