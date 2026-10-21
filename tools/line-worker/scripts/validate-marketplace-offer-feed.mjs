import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validateMarketplaceOfferFeed } from '../src/marketplace-offer-feed.mjs';

const MARKETPLACES = ['RAKUTEN_JP', 'QOO10_JP', 'SHEIN_JP'];

export function summarizeMarketplaceOfferFeed(payload, options = {}) {
  const feed = validateMarketplaceOfferFeed(payload);
  const marketplaces = {};
  const staleBefore = Number(options.now || Date.now()) - 7 * 24 * 60 * 60 * 1000;
  let staleRecords = 0;
  for (const record of feed.records) {
    marketplaces[record.marketplace] = (marketplaces[record.marketplace] || 0) + 1;
    if (Date.parse(record.observed_at) < staleBefore) staleRecords += 1;
  }
  const missingMarketplaces = MARKETPLACES.filter((marketplace) => !marketplaces[marketplace]);
  return {
    ok: true,
    tenant: feed.tenant,
    batch_id: feed.batch_id,
    records: feed.records.length,
    marketplaces,
    missing_marketplaces: missingMarketplaces,
    stale_records: staleRecords,
    feed_required: missingMarketplaces.length > 0,
    refresh_required: staleRecords > 0
  };
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('USAGE: npm run validate:marketplace-offers -- <feed.json>');
  const payload = JSON.parse(await readFile(file, 'utf8'));
  process.stdout.write(`${JSON.stringify(summarizeMarketplaceOfferFeed(payload), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.message || error)}\n`);
    process.exitCode = 1;
  });
}
