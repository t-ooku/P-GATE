// Keep the name recognized from the photo; generic market keyword builders
// can reduce a branded product name to its category (e.g. just タブレット).
const clean = (value) => String(value || '').normalize('NFKC').replace(/\s+/gu, ' ').trim();

export function photoMarketplaceQuery(query, brand, productName) {
  const primary = clean(query);
  const name = clean(productName);
  if (!primary || !name) return null;
  const prefix = clean(brand);
  let retry = '';
  if (!primary.includes(' ') && prefix.length >= 2 && !prefix.includes(' ')
    && primary.toLowerCase().startsWith(prefix.toLowerCase())) {
    // Strip at most the brand/product separator; のど itself must stay intact.
    const suffix = primary.slice(prefix.length);
    const remainder = /^の/u.test(suffix) && (suffix.startsWith('のの') || name === suffix.slice(1))
      ? suffix.slice(1) : suffix;
    if (remainder.length >= 2) retry = `${primary.slice(0, prefix.length)} ${remainder}`;
  }
  return { primary, retry };
}

// Primary, optional split, then at most one return to the existing keyword
// pipeline. Stages share the deadline and the original per-lane variant cap.
// A timeout, rejection, malformed result, or hit is never treated as zero.
export function searchPhotoMarketplaces(lanes, plan, { deadlineAt, now = Date.now }) {
  const remaining = () => deadlineAt - now();
  const tried = lanes.map(() => new Set());
  const allZero = (runs) => Promise.allSettled(runs).then((outcomes) => outcomes.every(
    ({ status, value }) => status === 'fulfilled' && Array.isArray(value) && value.length === 0
  ));
  const primaryRuns = lanes.map(({ search }, index) => Promise.resolve().then(() => {
    const available = remaining();
    if (available <= 0) return null;
    tried[index].add(plan.primary);
    return search(plan.primary, available);
  }));
  const allPrimaryZero = plan.retry ? allZero(primaryRuns) : null;
  const exactRuns = plan.retry ? lanes.map(({ search, retryCostMs, maxVariants = 2 }, index) => (
    primaryRuns[index].then(async (first) => {
      if (!Array.isArray(first) || first.length || !await allPrimaryZero) return first;
      const available = remaining();
      if (tried[index].size >= maxVariants || available <= 0 || available < retryCostMs) return first;
      tried[index].add(plan.retry);
      return search(plan.retry, available);
    })
  )) : primaryRuns;
  const allExactZero = lanes.some(({ legacy }) => legacy) ? allZero(exactRuns) : null;
  return Object.fromEntries(lanes.map(({ key, legacy, retryCostMs, maxVariants = 2 }, index) => [
    key, exactRuns[index].then(async (exact) => {
      if (!legacy || !Array.isArray(exact) || exact.length || !await allExactZero) return exact;
      const available = remaining();
      const slots = maxVariants - tried[index].size;
      if (slots <= 0 || available <= 0 || available < retryCostMs) return exact;
      return legacy({ available, slots, tried: tried[index] });
    })
  ]));
}

export function unusedPhotoKeywords(keywords, tried, slots) {
  return [...new Set(keywords.map(clean))].filter((word) => word && !tried.has(word)).slice(0, slots);
}
