/**
 * Project GATE - BenchmarkEngine.gs
 * 明示同意のある契約だけから、個社を特定できない集計値を生成する。
 */
var BenchmarkEngine = (function () {
  'use strict';

  var SHEET_NAME = 'Anonymous_Benchmark';
  var MINIMUM_COHORT = 5;
  var HEADERS = [
    'Date_JST', 'Account_Type', 'Campaign_ID', 'Metric', 'Median',
    'P25', 'P75', 'Cohort_Size', 'Minimum_Cohort', 'Generated_At'
  ];

  function ensureSheet() {
    return Utility.ensureSheet(Config.getSpreadsheet(), SHEET_NAME, HEADERS);
  }

  function accountKey(tenant, accountType, accountId) {
    return [
      Utility.trim(tenant).toLowerCase(),
      Utility.trim(accountType).toUpperCase(),
      Utility.trim(accountId)
    ].join('|');
  }

  function eligibleAccounts(contracts, dateKey) {
    var states = {};
    for (var i = 0; i < contracts.length; i += 1) {
      var contract = contracts[i];
      if (!ContractPolicyEngine.isActive(contract, dateKey)) { continue; }
      var key = accountKey(contract.tenant, contract.account_type, contract.account_id);
      if (!states[key]) { states[key] = { consent: false, refusal: false }; }
      if (contract.benchmark_consent === true) {
        states[key].consent = true;
      } else {
        states[key].refusal = true;
      }
    }
    var eligible = {};
    Object.keys(states).forEach(function (key) {
      if (states[key].consent && !states[key].refusal) { eligible[key] = true; }
    });
    return eligible;
  }

  function percentile(values, position) {
    if (!values.length) { return 0; }
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var index = (sorted.length - 1) * position;
    var lower = Math.floor(index);
    var upper = Math.ceil(index);
    if (lower === upper) { return sorted[lower]; }
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  }

  function roundMetric(value, currencyMetric) {
    var scale = currencyMetric ? 100 : 10000;
    return Math.round(Number(value || 0) * scale) / scale;
  }

  function metricValues(row) {
    var impressions = Number(row[6] || 0);
    return [
      ['CTR', Number(row[10] || 0), false],
      ['OUTBOUND_RATE', Number(row[11] || 0), false],
      ['CVR', Number(row[12] || 0), false],
      ['REVENUE_PER_1000_IMPRESSIONS', impressions > 0 ? Number(row[13] || 0) * 1000 / impressions : 0, true],
      ['GROSS_PROFIT_PER_1000_IMPRESSIONS', impressions > 0 ? Number(row[14] || 0) * 1000 / impressions : 0, true]
    ];
  }

  function generate(summaryRows, contracts, minimumCohort, generatedAt) {
    var minimum = Math.max(MINIMUM_COHORT, Number(minimumCohort || MINIMUM_COHORT));
    var eligibilityByDate = {};
    var groups = {};
    for (var i = 0; i < summaryRows.length; i += 1) {
      var row = summaryRows[i];
      var dateKey = String(row[0] || '');
      if (!eligibilityByDate[dateKey]) {
        eligibilityByDate[dateKey] = eligibleAccounts(contracts, dateKey);
      }
      if (String(row[5] || '').toUpperCase() !== 'P_GATE') { continue; }
      var key = accountKey(row[1], row[2], row[3]);
      if (!eligibilityByDate[dateKey][key]) { continue; }
      var prefix = [dateKey, String(row[2] || '').toUpperCase(), String(row[4] || '')];
      var metrics = metricValues(row);
      for (var m = 0; m < metrics.length; m += 1) {
        var groupKey = prefix.concat([metrics[m][0]]).join('|');
        if (!groups[groupKey]) {
          groups[groupKey] = { prefix: prefix, metric: metrics[m][0], currency: metrics[m][2], accounts: {} };
        }
        groups[groupKey].accounts[key] = Number(metrics[m][1] || 0);
      }
    }

    var output = [];
    Object.keys(groups).sort().forEach(function (key) {
      var group = groups[key];
      var values = Object.keys(group.accounts).map(function (account) { return group.accounts[account]; });
      if (values.length < minimum) { return; }
      output.push(group.prefix.concat([
        group.metric,
        roundMetric(percentile(values, 0.5), group.currency),
        roundMetric(percentile(values, 0.25), group.currency),
        roundMetric(percentile(values, 0.75), group.currency),
        values.length, minimum, generatedAt || Utility.nowIso()
      ]));
    });
    return output;
  }

  function refresh() {
    var spreadsheet = Config.getSpreadsheet();
    var benchmarkSheet = ensureSheet();
    var summarySheet = spreadsheet.getSheetByName(MeasurementEngine.SUMMARY_SHEET_NAME);
    var contractSheets = ContractPolicyEngine.ensureSheets();
    var summaryRows = summarySheet && summarySheet.getLastRow() > 1
      ? summarySheet.getRange(2, 1, summarySheet.getLastRow() - 1, MeasurementEngine.SUMMARY_HEADERS.length).getValues()
      : [];
    var contracts = ContractPolicyEngine.loadContracts(contractSheets.contracts);
    var rows = generate(summaryRows, contracts, MINIMUM_COHORT, Utility.nowIso());
    if (benchmarkSheet.getLastRow() > 1) {
      benchmarkSheet.getRange(2, 1, benchmarkSheet.getLastRow() - 1, HEADERS.length).clearContent();
    }
    if (rows.length > 0) {
      benchmarkSheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
    }
    return { rows: rows.length, minimum_cohort: MINIMUM_COHORT };
  }

  return {
    SHEET_NAME: SHEET_NAME,
    HEADERS: HEADERS.slice(),
    MINIMUM_COHORT: MINIMUM_COHORT,
    ensureSheet: ensureSheet,
    eligibleAccounts: eligibleAccounts,
    percentile: percentile,
    generate: generate,
    refresh: refresh
  };
}());

function refreshProjectGateAnonymousBenchmark() {
  'use strict';
  return BenchmarkEngine.refresh();
}
