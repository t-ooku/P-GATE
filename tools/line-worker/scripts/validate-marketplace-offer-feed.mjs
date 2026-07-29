import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validateMarketplaceOfferFeed } from '../src/marketplace-offer-feed.mjs';

export function summarizeMarketplaceOfferFeed(payload) {
  const feed = validateMarketplaceOfferFeed(payload);
  const marketplaces = {};
  for (const record of feed.records) {
    marketplaces[record.marketplace] = (marketplaces[record.marketplace] || 0) + 1;
  }
  return {
    ok: true,
    tenant: feed.tenant,
    batch_id: feed.batch_id,
    records: feed.records.length,
    marketplaces
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
