import type { DemandRecord, DemandMatchResult, SellerInfo } from '../types/index.js';

const normalize = (text: string) => text.normalize('NFKC').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, '');

/** Local character n-gram vectors: zero embedding API cost. */
function vector(text: string): Map<string, number> {
  const chars = Array.from(normalize(text));
  const result = new Map<string, number>();
  for (const n of [2, 3]) {
    for (let i = 0; i <= chars.length - n; i++) {
      const token = chars.slice(i, i + n).join('');
      result.set(token, (result.get(token) ?? 0) + 1);
    }
  }
  return result;
}

export function cosine(a: string, b: string): number {
  const x = vector(a), y = vector(b);
  const norm = (v: Map<string, number>) => Math.sqrt([...v.values()]
    .reduce((sum, n) => sum + n * n, 0));
  const denominator = norm(x) * norm(y);
  if (!denominator) return 0;
  return [...x].reduce((sum, [t, n]) => sum + n * (y.get(t) ?? 0), 0) / denominator;
}

export function validateDemand(d: DemandRecord, now = new Date()): void {
  if (typeof d.keyword !== 'string' || !d.keyword.trim() || d.keyword.length > 80
    || /[\r\n<>]/u.test(d.keyword) || d.timezone !== 'Asia/Tokyo'
    || d.qaInternalExcluded !== true || d.complete !== true
    || typeof d.source !== 'string' || !d.source.trim()) throw new Error('DEMAND_EVIDENCE_INVALID');
  for (const count of [d.monthlySearchVolume, d.unmetSearchCount]) {
    if (!Number.isSafeInteger(count) || count <= 0) throw new Error('DEMAND_COUNT_INVALID');
  }
  if (d.unmetSearchCount > d.monthlySearchVolume) throw new Error('UNMET_COUNT_INVALID');
  // A completed JST calendar month, not a partial month extrapolated to 30 days.
  const start = new Date(d.periodStart), end = new Date(d.periodEnd);
  const jst = new Date(start.getTime() + 9 * 3600000);
  const first = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), 1) - 9 * 3600000;
  const next = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth() + 1, 1) - 9 * 3600000;
  if (!Number.isFinite(first) || start.getTime() !== first || end.getTime() !== next
    || end.getTime() > now.getTime() || now.getTime() - end.getTime() > 62 * 86400000) {
    throw new Error('COMPLETE_RECENT_JST_MONTH_REQUIRED');
  }
}

export function matchDemand(seller: SellerInfo, demands: DemandRecord[],
  minimumScore = 0.28, now = new Date()): DemandMatchResult | null {
  if (!Number.isFinite(minimumScore) || minimumScore < 0 || minimumScore > 1) {
    throw new Error('SCORE_THRESHOLD_INVALID');
  }
  const products = seller.mainProducts.slice(0, 5).map(p => p.name);
  const documents = [...products, ...seller.categories, seller.features].filter(Boolean);
  const ranked = demands.map(d => {
    validateDemand(d, now);
    return { ...d, matchedKeyword: d.keyword,
      relevanceScore: Math.max(0, ...documents.map(text => cosine(text, d.keyword))) };
  }).filter(d => d.relevanceScore >= minimumScore)
    .sort((a, b) => b.relevanceScore - a.relevanceScore || b.unmetSearchCount - a.unmetSearchCount);
  return ranked[0] ?? null;
}
