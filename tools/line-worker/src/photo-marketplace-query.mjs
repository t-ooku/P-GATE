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

// The alternative occupies one existing variant slot, not a new lane.
// Only a successful empty result permits the alternate keyword. A timeout,
// rejection, malformed result or non-empty response is not zero.
export function searchPhotoMarketplaces(lanes, plan, { deadlineAt, now = Date.now }) {
  const remaining = () => deadlineAt - now();
  const primaryRuns = lanes.map(({ search }) => Promise.resolve().then(() => {
    const available = remaining();
    return available > 0 ? search(plan.primary, available) : null;
  }));
  const allEmpty = plan.retry
    ? Promise.allSettled(primaryRuns).then((outcomes) => outcomes.every(
      ({ status, value }) => status === 'fulfilled' && Array.isArray(value) && value.length === 0
    ))
    : null;
  return Object.fromEntries(lanes.map(({ key, search, retryCostMs }, index) => [
    key, primaryRuns[index].then(async (first) => {
      if (!Array.isArray(first) || first.length || !allEmpty || !await allEmpty) return first;
      const available = remaining();
      if (available <= 0 || available < retryCostMs) return first;
      return search(plan.retry, available);
    })
  ]));
}
