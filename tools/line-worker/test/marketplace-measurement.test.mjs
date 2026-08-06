import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvent, recordEvents, summarize, refreshMarketplaceKpiSummary } from '../src/marketplace-measurement.mjs';

function baseEvent(overrides = {}) {
  return {
    event_id: 'E1', occurred_at: '2026-08-05T10:00:00.000Z', tenant: 'itg', account_type: 'SELLER',
    account_id: 'A1', session_id: 'sess-abc123', recommendation_id: 'R1', asin: 'B000000001',
    marketplace: 'amazon_jp', event_type: 'CLICK', channel: 'LINE', consent: true,
    ...overrides
  };
}

test('normalizeEventはgas/MarketplaceMeasurementEngine.gsと同じ必須項目・列挙値を検証する', () => {
  const event = normalizeEvent(baseEvent());
  assert.equal(event.marketplace, 'AMAZON_JP');
  assert.equal(event.event_key, 'itg|SELLER|A1|E1');
  assert.throws(() => normalizeEvent(baseEvent({ consent: false })), /MARKETPLACE_KPI_CONSENT_REQUIRED/);
  assert.throws(() => normalizeEvent(baseEvent({ marketplace: 'EBAY' })), /MARKETPLACE_KPI_MARKETPLACE_INVALID/);
  assert.throws(() => normalizeEvent(baseEvent({ event_type: 'IMPRESSION' })), /MARKETPLACE_KPI_EVENT_INVALID/);
  assert.throws(() => normalizeEvent(baseEvent({ channel: 'WEB' })), /MARKETPLACE_KPI_CHANNEL_INVALID/);
  assert.throws(() => normalizeEvent(baseEvent({ asin: 'short' })), /MARKETPLACE_KPI_ASIN_INVALID/);
  assert.throws(() => normalizeEvent(baseEvent({ session_id: 'a b' })), /MARKETPLACE_KPI_SESSION_UNSAFE/);
});

test('summarizeはMarketplace別クリックシェアを算出する', () => {
  const events = [
    normalizeEvent(baseEvent({ event_id: 'E1', marketplace: 'amazon_jp', event_type: 'CLICK' })),
    normalizeEvent(baseEvent({ event_id: 'E2', marketplace: 'rakuten_jp', event_type: 'CLICK' })),
    normalizeEvent(baseEvent({ event_id: 'E3', marketplace: 'rakuten_jp', event_type: 'CLICK' })),
    normalizeEvent(baseEvent({ event_id: 'E4', marketplace: 'amazon_jp', event_type: 'OUTBOUND' }))
  ];
  const rows = summarize(events, '2026-08-05T00:00:00.000Z');
  const amazon = rows.find((row) => row.marketplace === 'AMAZON_JP');
  const rakuten = rows.find((row) => row.marketplace === 'RAKUTEN_JP');
  assert.equal(amazon.clicks, 1);
  assert.equal(amazon.outbound, 1);
  assert.equal(amazon.click_selection_share, 0.3333);
  assert.equal(rakuten.clicks, 2);
  assert.equal(rakuten.click_selection_share, 0.6667);
});

test('recordEventsは200件を超えるバッチとD1未設定を検証する', async () => {
  await assert.rejects(() => recordEvents({}, [baseEvent()]), /MARKETPLACE_KPI_STORE_NOT_CONFIGURED/);
  await assert.rejects(() => recordEvents({ PRODUCT_DB: {} }, Array(201).fill(baseEvent())), /MARKETPLACE_KPI_BATCH_INVALID/);
  assert.deepEqual(await recordEvents({ PRODUCT_DB: {} }, []), { accepted: 0, duplicated: 0 });
});

test('recordEventsは重複event_keyを排除する', async () => {
  const inserted = [];
  const env = { PRODUCT_DB: {
    prepare() {
      return {
        bind(...values) {
          return {
            async run() {
              const exists = inserted.some((row) => row[0] === values[0]);
              if (!exists) inserted.push(values);
              return { meta: { changes: exists ? 0 : 1 } };
            }
          };
        }
      };
    },
    batch: (statements) => Promise.all(statements.map((statement) => statement.run()))
  } };
  const result = await recordEvents(env, [baseEvent({ event_id: 'E1' }), baseEvent({ event_id: 'E1' })]);
  assert.equal(result.accepted, 1);
  assert.equal(result.duplicated, 1);
});

test('refreshMarketplaceKpiSummaryはD1未設定ならskipする', async () => {
  assert.deepEqual(await refreshMarketplaceKpiSummary({}), { skipped: true });
});
