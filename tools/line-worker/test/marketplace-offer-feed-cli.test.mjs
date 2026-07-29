import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { summarizeMarketplaceOfferFeed } from '../scripts/validate-marketplace-offer-feed.mjs';

test('商品URLフィード検査結果は安全な件数だけを表示する', async () => {
  const url = new URL('../../../docs/examples/hoshilu-marketplace-offers.sample.json', import.meta.url);
  const payload = JSON.parse(await readFile(url, 'utf8'));
  const summary = summarizeMarketplaceOfferFeed(payload);

  assert.deepEqual(summary, {
    ok: true,
    tenant: 'itg',
    batch_id: 'offers-20260729-example-01',
    records: 3,
    marketplaces: {
      RAKUTEN_JP: 1,
      QOO10_JP: 1,
      SHEIN_JP: 1
    }
  });
  assert.equal(JSON.stringify(summary).includes('product_url'), false);
});
