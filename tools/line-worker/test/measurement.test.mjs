import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvent, recordEvents, summarize, calculateUplift, refreshKpiSummary, toJstDateKey } from '../src/measurement.mjs';

function baseEvent(overrides = {}) {
  return {
    event_id: 'E1', occurred_at: '2026-08-05T10:00:00.000Z', tenant: 'itg', account_type: 'SELLER',
    account_id: 'A1', session_id: 'sess-abc123', recommendation_id: 'R1', campaign_id: 'LINE_PILOT',
    experiment_variant: 'P_GATE', asin: 'B000000001', event_type: 'IMPRESSION', consent: true,
    ...overrides
  };
}

test('normalizeEventはgas/MeasurementEngine.gsと同じ必須項目・列挙値を検証する', () => {
  const event = normalizeEvent(baseEvent());
  assert.equal(event.event_key, 'itg|SELLER|A1|E1');
  assert.equal(event.date_jst, '2026-08-05');
  assert.throws(() => normalizeEvent(baseEvent({ consent: false })), /KPI_CONSENT_REQUIRED/);
  assert.throws(() => normalizeEvent(baseEvent({ event_type: 'VIEW' })), /KPI_EVENT_TYPE_INVALID/);
  assert.throws(() => normalizeEvent(baseEvent({ account_type: 'RESELLER' })), /KPI_ACCOUNT_TYPE_INVALID/);
  assert.throws(() => normalizeEvent(baseEvent({ experiment_variant: 'B' })), /KPI_EXPERIMENT_VARIANT_INVALID/);
  assert.throws(() => normalizeEvent(baseEvent({ asin: 'short' })), /KPI_ASIN_INVALID/);
  assert.throws(() => normalizeEvent(baseEvent({ session_id: 'a b' })), /KPI_SESSION_ID_UNSAFE/);
  assert.throws(() => normalizeEvent(baseEvent({ session_id: 'a@b.com' })), /KPI_SESSION_ID_UNSAFE/);
});

test('normalizeEventはPURCHASE以外ではrevenue/gross_profitを常にゼロにする', () => {
  const purchase = normalizeEvent(baseEvent({ event_type: 'PURCHASE', revenue: 1000, gross_profit: 300 }));
  assert.equal(purchase.revenue, 1000);
  assert.equal(purchase.gross_profit, 300);
  const impression = normalizeEvent(baseEvent({ event_type: 'IMPRESSION', revenue: 1000, gross_profit: 300 }));
  assert.equal(impression.revenue, 0);
  assert.equal(impression.gross_profit, 0);
});

test('toJstDateKeyは日時をJST日付キーへ変換する', () => {
  assert.equal(toJstDateKey('2026-08-05T16:00:00.000Z'), '2026-08-06');
  assert.throws(() => toJstDateKey('not-a-date'), /KPI_OCCURRED_AT_INVALID/);
});

test('summarizeは種別ごとのカウントとCTR等を集計する', () => {
  const events = [
    normalizeEvent(baseEvent({ event_id: 'E1', event_type: 'IMPRESSION' })),
    normalizeEvent(baseEvent({ event_id: 'E2', event_type: 'IMPRESSION' })),
    normalizeEvent(baseEvent({ event_id: 'E3', event_type: 'CLICK' })),
    normalizeEvent(baseEvent({ event_id: 'E4', event_type: 'OUTBOUND' })),
    normalizeEvent(baseEvent({ event_id: 'E5', event_type: 'PURCHASE', revenue: 5000, gross_profit: 1500 }))
  ];
  const [summary] = summarize(events, '2026-08-05T00:00:00.000Z');
  assert.equal(summary.impressions, 2);
  assert.equal(summary.clicks, 1);
  assert.equal(summary.outbound, 1);
  assert.equal(summary.purchases, 1);
  assert.equal(summary.ctr, 0.5);
  assert.equal(summary.outbound_rate, 0.5);
  assert.equal(summary.cvr, 1);
  assert.equal(summary.revenue, 5000);
});

test('calculateUpliftはCONTROLとP_GATEが揃ったグループだけリフトを算出する', () => {
  const control = {
    date_jst: '2026-08-05', tenant: 'itg', account_type: 'SELLER', account_id: 'A1', campaign_id: 'LINE_PILOT',
    experiment_variant: 'CONTROL', impressions: 100, clicks: 10, outbound: 5, purchases: 1,
    ctr: 0.1, outbound_rate: 0.05, cvr: 0.2, revenue: 1000, gross_profit: 300
  };
  const treatment = {
    ...control, experiment_variant: 'P_GATE', clicks: 20, ctr: 0.2, outbound_rate: 0.1, cvr: 0.3, revenue: 2000
  };
  const uplift = calculateUplift([control, treatment], '2026-08-05T00:00:00.000Z');
  const ctrRow = uplift.find((row) => row.metric === 'CTR');
  assert.equal(ctrRow.control_value, 0.1);
  assert.equal(ctrRow.p_gate_value, 0.2);
  assert.ok(Math.abs(ctrRow.absolute_lift - 0.1) < 1e-9);
  assert.ok(Math.abs(ctrRow.relative_lift - 1) < 1e-9);
  const onlyControl = calculateUplift([control], '2026-08-05T00:00:00.000Z');
  assert.equal(onlyControl.length, 0);
});

test('calculateUpliftはcontrol値が0の場合relative_liftをnullにする', () => {
  const control = {
    date_jst: '2026-08-05', tenant: 'itg', account_type: 'SELLER', account_id: 'A1', campaign_id: 'LINE_PILOT',
    experiment_variant: 'CONTROL', impressions: 0, clicks: 0, outbound: 0, purchases: 0,
    ctr: 0, outbound_rate: 0, cvr: 0, revenue: 0, gross_profit: 0
  };
  const treatment = { ...control, experiment_variant: 'P_GATE', ctr: 0.5 };
  const [ctrRow] = calculateUplift([control, treatment], '2026-08-05T00:00:00.000Z').filter((row) => row.metric === 'CTR');
  assert.equal(ctrRow.relative_lift, null);
});

test('recordEventsはevent_keyで重複を排除してD1へ挿入する', async () => {
  const inserted = [];
  const env = { PRODUCT_DB: {
    prepare(sql) {
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
  const result = await recordEvents(env, [baseEvent({ event_id: 'E1' }), baseEvent({ event_id: 'E1' }), baseEvent({ event_id: 'E2' })]);
  assert.equal(result.accepted, 2);
  assert.equal(result.duplicated, 1);
  assert.equal(inserted.length, 2);
});

test('recordEventsはD1未設定・バッチサイズ超過を検証する', async () => {
  await assert.rejects(() => recordEvents({}, [baseEvent()]), /KPI_STORE_NOT_CONFIGURED/);
  await assert.rejects(() => recordEvents({ PRODUCT_DB: {} }, Array(501).fill(baseEvent())), /KPI_EVENT_BATCH_INVALID/);
});

test('refreshKpiSummaryはD1未設定ならskipし、設定時はイベント全件から再計算する', async () => {
  assert.deepEqual(await refreshKpiSummary({}), { skipped: true });
  const rawEvent = normalizeEvent(baseEvent({ event_type: 'CLICK' }));
  const inserted = { summary: [], uplift: [] };
  const db = {
    prepare(sql) {
      return {
        async all() {
          if (/^SELECT \* FROM kpi_events/.test(sql)) return { results: [rawEvent] };
          return { results: [] };
        },
        async run() {
          if (/^DELETE FROM kpi_summary/.test(sql)) inserted.summary.length = 0;
          if (/^DELETE FROM kpi_uplift/.test(sql)) inserted.uplift.length = 0;
          return { meta: { changes: 0 } };
        },
        bind(...values) {
          return {
            async run() {
              if (/^INSERT INTO kpi_summary/.test(sql)) inserted.summary.push(values);
              if (/^INSERT INTO kpi_uplift/.test(sql)) inserted.uplift.push(values);
              return { meta: { changes: 1 } };
            }
          };
        }
      };
    },
    batch: (statements) => Promise.all(statements.map((statement) => statement.run()))
  };
  const result = await refreshKpiSummary({ PRODUCT_DB: db });
  assert.equal(result.events, 1);
  assert.equal(result.summaries, 1);
  assert.equal(inserted.summary.length, 1);
});
