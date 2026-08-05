import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleAccounts, percentile, generate, refreshAnonymousBenchmark } from '../src/benchmark.mjs';
import { normalizeContract } from '../src/contract-policy.mjs';

function contract(overrides = {}) {
  return normalizeContract({
    contract_id: overrides.contract_id || 'C1', tenant: 'itg', account_type: 'SELLER', account_id: 'A1',
    status: 'ACTIVE', start_date: '2026-01-01', end_date: '', category_scope: '*',
    benchmark_consent: true, updated_at: '2026-08-01T00:00:00.000Z', ...overrides
  });
}

function summaryRow(overrides = {}) {
  return {
    date_jst: '2026-08-05', tenant: 'itg', account_type: 'SELLER', account_id: 'A1', campaign_id: 'LINE_PILOT',
    experiment_variant: 'P_GATE', impressions: 1000, clicks: 100, outbound: 50, purchases: 10,
    ctr: 0.1, outbound_rate: 0.05, cvr: 0.2, revenue: 5000, gross_profit: 1500, ...overrides
  };
}

test('eligibleAccountsは同意ありかつ拒否のないアカウントだけを対象にする', () => {
  const contracts = [
    contract({ contract_id: 'C1', account_id: 'A1', benchmark_consent: true }),
    contract({ contract_id: 'C2', account_id: 'A2', benchmark_consent: false }),
    contract({ contract_id: 'C3', account_id: 'A3', benchmark_consent: true }),
    contract({ contract_id: 'C4', account_id: 'A3', benchmark_consent: false })
  ];
  const eligible = eligibleAccounts(contracts, '2026-08-05');
  assert.ok(eligible.has('itg|SELLER|A1'));
  assert.ok(!eligible.has('itg|SELLER|A2'));
  // A3は同意ありの契約と拒否の契約が両方あるので除外される
  assert.ok(!eligible.has('itg|SELLER|A3'));
});

test('eligibleAccountsは日付範囲外の契約を無視する', () => {
  const contracts = [contract({ status: 'ENDED', benchmark_consent: true })];
  assert.equal(eligibleAccounts(contracts, '2026-08-05').size, 0);
});

test('percentileは中央値・25/75パーセンタイルを線形補間で計算する', () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(percentile([], 0.5), 0);
});

test('generateはP_GATEバリアント・同意済み・最小コホート未満のグループを除外する', () => {
  const contracts = Array.from({ length: 5 }, (_, i) => contract({ contract_id: `C${i}`, account_id: `A${i}`, benchmark_consent: true }));
  const summaryRows = contracts.map((c, i) => summaryRow({ account_id: c.account_id, ctr: 0.1 + i * 0.01 }));
  const rows = generate(summaryRows, contracts, 5, '2026-08-05T00:00:00.000Z');
  const ctrRow = rows.find((row) => row.metric === 'CTR');
  assert.ok(ctrRow);
  assert.equal(ctrRow.cohort_size, 5);
  assert.equal(ctrRow.account_type, 'SELLER');

  const belowMinimum = generate(summaryRows.slice(0, 3), contracts, 5, '2026-08-05T00:00:00.000Z');
  assert.equal(belowMinimum.length, 0);
});

test('generateはCONTROLバリアントや非同意アカウントを除外する', () => {
  const contracts = Array.from({ length: 5 }, (_, i) => contract({ contract_id: `C${i}`, account_id: `A${i}`, benchmark_consent: i < 4 }));
  const summaryRows = contracts.map((c) => summaryRow({ account_id: c.account_id }));
  summaryRows.push(summaryRow({ account_id: 'A0', experiment_variant: 'CONTROL' }));
  const rows = generate(summaryRows, contracts, 5, '2026-08-05T00:00:00.000Z');
  // 5アカウント中1つ(A4)がbenchmark_consent=falseなので最小コホート5を満たせない
  assert.equal(rows.length, 0);
});

test('refreshAnonymousBenchmarkはD1未設定ならskipする', async () => {
  assert.deepEqual(await refreshAnonymousBenchmark({}), { skipped: true });
});
