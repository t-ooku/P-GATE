import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { summarizeMarketplaceOfferFeed } from '../scripts/validate-marketplace-offer-feed.mjs';

test('商品URLフィード検査結果は安全な件数だけを表示する', async () => {
  const url = new URL('../../../docs/examples/hoshilu-marketplace-offers.sample.json', import.meta.url);
  const payload = JSON.parse(await readFile(url, 'utf8'));
  const summary = summarizeMarketplaceOfferFeed(payload, {
    now: Date.parse('2026-07-30T00:00:00Z')
  });

  assert.deepEqual(summary, {
    ok: true,
    tenant: 'itg',
    batch_id: 'offers-20260729-example-01',
    records: 3,
    marketplaces: {
      RAKUTEN_JP: 1,
      QOO10_JP: 1,
      SHEIN_JP: 1
    },
    missing_marketplaces: [],
    stale_records: 0,
    feed_required: false,
    refresh_required: false
  });
  assert.equal(JSON.stringify(summary).includes('product_url'), false);
});

test('商品URLフィード検査は不足モールと7日超の再確認対象を明示する', () => {
  const summary = summarizeMarketplaceOfferFeed({
    tenant: 'itg',
    batch_id: 'offers-diagnostic-20260730',
    records: [{
      record_key: 'catalog-product-001',
      marketplace: 'QOO10_JP',
      external_product_id: '123456789',
      product_url: 'https://www.qoo10.jp/gmkt.inc/Goods/Goods.aspx?goodscode=123456789',
      observed_at: '2026-07-20T00:00:00Z'
    }]
  }, { now: Date.parse('2026-07-30T00:00:00Z') });
  assert.deepEqual(summary.missing_marketplaces, ['RAKUTEN_JP', 'SHEIN_JP']);
  assert.equal(summary.stale_records, 1);
  assert.equal(summary.feed_required, true);
  assert.equal(summary.refresh_required, true);
});
