// HOSHILU GAS→Web移行: gas/BenchmarkEngine.gs をWorker/D1へ移植。明示同意
// (contracts.benchmark_consent)のある契約のP_GATE実績だけを、k-匿名性の
// 最小コホートサイズを満たす場合のみ集計する。GAS側のAnonymous_Benchmark
// シートは変更しない。
import { isActive, loadAllContractsFromD1 } from './contract-policy.mjs';
import { refreshKpiSummary } from './measurement.mjs';

const MINIMUM_COHORT = 5;

function accountKey(tenant, accountType, accountId) {
  return [
    String(tenant ?? '').trim().toLowerCase(),
    String(accountType ?? '').trim().toUpperCase(),
    String(accountId ?? '').trim()
  ].join('|');
}

// gas/BenchmarkEngine.gs eligibleAccounts() の忠実な移植: 同意ありかつ拒否が
// 一件も無いアカウントだけを対象にする(同じアカウントに複数契約があり、
// 一つでもbenchmark_consent=falseならそのアカウント全体を除外する)。
export function eligibleAccounts(contracts, dateKey) {
  const states = new Map();
  for (const contract of contracts) {
    if (!isActive(contract, dateKey)) continue;
    const key = accountKey(contract.tenant, contract.account_type, contract.account_id);
    if (!states.has(key)) states.set(key, { consent: false, refusal: false });
    const state = states.get(key);
    if (contract.benchmark_consent === true) state.consent = true;
    else state.refusal = true;
  }
  const eligible = new Set();
  for (const [key, state] of states) {
    if (state.consent && !state.refusal) eligible.add(key);
  }
  return eligible;
}

export function percentile(values, position) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * position;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function roundMetric(value, currencyMetric) {
  const scale = currencyMetric ? 100 : 10000;
  return Math.round((Number(value) || 0) * scale) / scale;
}

// gas/BenchmarkEngine.gs metricValues() の忠実な移植。
function metricValues(row) {
  const impressions = Number(row.impressions || 0);
  return [
    ['CTR', Number(row.ctr || 0), false],
    ['OUTBOUND_RATE', Number(row.outbound_rate || 0), false],
    ['CVR', Number(row.cvr || 0), false],
    ['REVENUE_PER_1000_IMPRESSIONS', impressions > 0 ? (Number(row.revenue || 0) * 1000) / impressions : 0, true],
    ['GROSS_PROFIT_PER_1000_IMPRESSIONS', impressions > 0 ? (Number(row.gross_profit || 0) * 1000) / impressions : 0, true]
  ];
}

// gas/BenchmarkEngine.gs generate() の忠実な移植: summaryRows(kpi_summary相当)
// とcontractsから、P_GATEバリアントかつ同意ありアカウントだけの匿名集計を作る。
export function generate(summaryRows, contracts, minimumCohort, generatedAt) {
  const minimum = Math.max(MINIMUM_COHORT, Number(minimumCohort) || MINIMUM_COHORT);
  const eligibilityByDate = new Map();
  const groups = new Map();
  for (const row of summaryRows) {
    const dateKey = String(row.date_jst || '');
    if (!eligibilityByDate.has(dateKey)) {
      eligibilityByDate.set(dateKey, eligibleAccounts(contracts, dateKey));
    }
    if (String(row.experiment_variant || '').toUpperCase() !== 'P_GATE') continue;
    const key = accountKey(row.tenant, row.account_type, row.account_id);
    if (!eligibilityByDate.get(dateKey).has(key)) continue;
    const prefix = { date_jst: dateKey, account_type: String(row.account_type || '').toUpperCase(), campaign_id: String(row.campaign_id || '') };
    for (const [metric, value, currency] of metricValues(row)) {
      const groupKey = [prefix.date_jst, prefix.account_type, prefix.campaign_id, metric].join('|');
      if (!groups.has(groupKey)) groups.set(groupKey, { prefix, metric, currency, accounts: new Map() });
      groups.get(groupKey).accounts.set(key, Number(value) || 0);
    }
  }
  const output = [];
  for (const key of [...groups.keys()].sort()) {
    const group = groups.get(key);
    const values = [...group.accounts.values()];
    if (values.length < minimum) continue;
    output.push({
      ...group.prefix, metric: group.metric,
      median: roundMetric(percentile(values, 0.5), group.currency),
      p25: roundMetric(percentile(values, 0.25), group.currency),
      p75: roundMetric(percentile(values, 0.75), group.currency),
      cohort_size: values.length, minimum_cohort: minimum,
      generated_at: generatedAt || new Date().toISOString()
    });
  }
  return output;
}

// gas/BenchmarkEngine.gs refresh() のD1版。kpi_summaryを先に最新化してから
// (measurement.mjs refreshKpiSummary)、contractsと突き合わせて匿名ベンチマーク
// を再計算・総入れ替えする。
export async function refreshAnonymousBenchmark(env) {
  if (!env.PRODUCT_DB) return { skipped: true };
  await refreshKpiSummary(env);
  const [summaryResult, contracts] = await Promise.all([
    env.PRODUCT_DB.prepare('SELECT * FROM kpi_summary').all(),
    loadAllContractsFromD1(env)
  ]);
  const summaryRows = summaryResult.results || [];
  const generatedAt = new Date().toISOString();
  const rows = generate(summaryRows, contracts, MINIMUM_COHORT, generatedAt);
  await env.PRODUCT_DB.prepare('DELETE FROM anonymous_benchmark').run();
  if (rows.length) {
    const sql = `INSERT INTO anonymous_benchmark (
      date_jst,account_type,campaign_id,metric,median,p25,p75,cohort_size,minimum_cohort,generated_at
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`;
    const prepared = env.PRODUCT_DB.prepare(sql);
    await env.PRODUCT_DB.batch(rows.map((row) => prepared.bind(
      row.date_jst, row.account_type, row.campaign_id, row.metric, row.median, row.p25, row.p75,
      row.cohort_size, row.minimum_cohort, row.generated_at
    )));
  }
  return { rows: rows.length, minimum_cohort: MINIMUM_COHORT };
}
