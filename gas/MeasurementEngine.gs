/**
 * Project GATE - MeasurementEngine.gs
 * 推薦の表示から購入までを、契約アカウント単位で記録・集計する。
 * 個人情報は保持せず、同意済みの仮名セッションIDだけを受け付ける。
 */
var MeasurementEngine = (function () {
  'use strict';

  var EVENT_SHEET_NAME = 'KPI_Event_Log';
  var SUMMARY_SHEET_NAME = 'KPI_Summary';
  var UPLIFT_SHEET_NAME = 'KPI_Uplift';
  var EVENT_TYPES = ['IMPRESSION', 'CLICK', 'OUTBOUND', 'PURCHASE'];
  var ACCOUNT_TYPES = ['SELLER', 'MANUFACTURER'];
  var EXPERIMENT_VARIANTS = ['CONTROL', 'P_GATE'];
  var EVENT_HEADERS = [
    'Event_Key', 'Event_ID', 'Occurred_At', 'Date_JST', 'Tenant', 'Account_Type', 'Account_ID',
    'Session_ID', 'Recommendation_ID', 'Campaign_ID', 'Experiment_Variant', 'ASIN', 'Event_Type', 'Revenue',
    'Gross_Profit', 'Consent', 'Source', 'Recorded_At'
  ];
  var SUMMARY_HEADERS = [
    'Date_JST', 'Tenant', 'Account_Type', 'Account_ID', 'Campaign_ID', 'Experiment_Variant', 'Impressions', 'Clicks',
    'Outbound', 'Purchases', 'CTR', 'Outbound_Rate', 'CVR', 'Revenue',
    'Gross_Profit', 'Updated_At'
  ];
  var UPLIFT_HEADERS = [
    'Date_JST', 'Tenant', 'Account_Type', 'Account_ID', 'Campaign_ID', 'Metric',
    'Control_Value', 'P_GATE_Value', 'Absolute_Lift', 'Relative_Lift',
    'Control_Sample', 'P_GATE_Sample', 'Updated_At'
  ];

  function ensureSheets() {
    return {
      events: Utility.ensureSheet(Config.getSpreadsheet(), EVENT_SHEET_NAME, EVENT_HEADERS),
      summary: Utility.ensureSheet(Config.getSpreadsheet(), SUMMARY_SHEET_NAME, SUMMARY_HEADERS),
      uplift: Utility.ensureSheet(Config.getSpreadsheet(), UPLIFT_SHEET_NAME, UPLIFT_HEADERS)
    };
  }

  function cleanId(value, field, required) {
    var text = Utility.trim(value);
    if (required && !text) {
      throw Utility.createError('KPI_FIELD_REQUIRED', field + 'は必須です。', { field: field });
    }
    if (text.length > 200) {
      throw Utility.createError('KPI_FIELD_TOO_LONG', field + 'が200文字を超えています。', { field: field });
    }
    return text;
  }

  function toJstDateKey(value) {
    var date = new Date(value);
    if (!isFinite(date.getTime())) {
      throw Utility.createError('KPI_OCCURRED_AT_INVALID', 'Occurred_Atが日時として不正です。');
    }
    return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  function normalizeEvent(source, recordedAt) {
    source = source || {};
    if (source.consent !== true) {
      throw Utility.createError('KPI_CONSENT_REQUIRED', '計測には顧客同意が必要です。');
    }
    var eventType = cleanId(source.event_type, 'Event_Type', true).toUpperCase();
    if (EVENT_TYPES.indexOf(eventType) < 0) {
      throw Utility.createError('KPI_EVENT_TYPE_INVALID', '未対応のEvent_Typeです: ' + eventType);
    }
    var accountType = cleanId(source.account_type, 'Account_Type', true).toUpperCase();
    if (ACCOUNT_TYPES.indexOf(accountType) < 0) {
      throw Utility.createError('KPI_ACCOUNT_TYPE_INVALID', '未対応のAccount_Typeです: ' + accountType);
    }
    var experimentVariant = cleanId(source.experiment_variant, 'Experiment_Variant', true).toUpperCase();
    if (EXPERIMENT_VARIANTS.indexOf(experimentVariant) < 0) {
      throw Utility.createError('KPI_EXPERIMENT_VARIANT_INVALID', '未対応のExperiment_Variantです: ' + experimentVariant);
    }
    var occurredAt = cleanId(source.occurred_at, 'Occurred_At', true);
    var asin = cleanId(source.asin, 'ASIN', true).toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin)) {
      throw Utility.createError('KPI_ASIN_INVALID', 'ASIN形式が不正です: ' + asin);
    }
    var revenue = Math.max(0, Utility.parseNumber(source.revenue));
    var grossProfit = Utility.parseNumber(source.gross_profit);
    if (eventType !== 'PURCHASE') {
      revenue = 0;
      grossProfit = 0;
    }
    var sessionId = cleanId(source.session_id, 'Session_ID', true);
    if (/@/.test(sessionId) || /\s/.test(sessionId)) {
      throw Utility.createError('KPI_SESSION_ID_UNSAFE', 'Session_IDにはメールアドレスや空白を含めず、仮名IDを使用してください。');
    }
    var eventId = cleanId(source.event_id, 'Event_ID', true);
    var tenant = cleanId(source.tenant, 'Tenant', true).toLowerCase();
    var accountId = cleanId(source.account_id, 'Account_ID', true);
    var dateJst = toJstDateKey(occurredAt);
    return {
      event_key: [tenant, accountType, accountId, eventId].join('|'),
      event_id: eventId,
      occurred_at: new Date(occurredAt).toISOString(),
      date_jst: dateJst,
      tenant: tenant,
      account_type: accountType,
      account_id: accountId,
      session_id: sessionId,
      recommendation_id: cleanId(source.recommendation_id, 'Recommendation_ID', true),
      campaign_id: cleanId(source.campaign_id, 'Campaign_ID', true),
      experiment_variant: experimentVariant,
      asin: asin,
      event_type: eventType,
      revenue: revenue,
      gross_profit: grossProfit,
      consent: true,
      source: cleanId(source.source || 'P-GATE', 'Source', false),
      recorded_at: recordedAt || Utility.nowIso()
    };
  }

  function toEventRow(event) {
    return [
      event.event_key, event.event_id, event.occurred_at, event.date_jst, event.tenant,
      event.account_type, event.account_id, event.session_id,
      event.recommendation_id, event.campaign_id, event.experiment_variant,
      event.asin, event.event_type, event.revenue,
      event.gross_profit, event.consent, event.source, event.recorded_at
    ];
  }

  function fromEventRow(row) {
    return {
      event_key: String(row[0] || ''), event_id: String(row[1] || ''),
      occurred_at: String(row[2] || ''), date_jst: String(row[3] || ''),
      tenant: String(row[4] || ''), account_type: String(row[5] || ''),
      account_id: String(row[6] || ''), session_id: String(row[7] || ''),
      recommendation_id: String(row[8] || ''), campaign_id: String(row[9] || ''),
      experiment_variant: String(row[10] || ''), asin: String(row[11] || ''),
      event_type: String(row[12] || ''), revenue: Number(row[13] || 0),
      gross_profit: Number(row[14] || 0), consent: row[15] === true,
      source: String(row[16] || ''), recorded_at: String(row[17] || '')
    };
  }

  function record(events) {
    if (!Array.isArray(events) || events.length === 0 || events.length > 500) {
      throw Utility.createError('KPI_EVENT_BATCH_INVALID', 'イベントは1〜500件の配列で指定してください。');
    }
    var sheets = ensureSheets();
    var existing = {};
    if (sheets.events.getLastRow() > 1) {
      var ids = sheets.events.getRange(2, 1, sheets.events.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < ids.length; i += 1) {
        existing[String(ids[i][0])] = true;
      }
    }
    var now = Utility.nowIso();
    var batchSeen = {};
    var rows = [];
    var duplicated = 0;
    for (var j = 0; j < events.length; j += 1) {
      var normalized = normalizeEvent(events[j], now);
      if (existing[normalized.event_key] || batchSeen[normalized.event_key]) {
        duplicated += 1;
        continue;
      }
      batchSeen[normalized.event_key] = true;
      rows.push(toEventRow(normalized));
    }
    if (rows.length > 0) {
      sheets.events.getRange(sheets.events.getLastRow() + 1, 1, rows.length, EVENT_HEADERS.length).setValues(rows);
    }
    return { accepted: rows.length, duplicated: duplicated };
  }

  function safeRate(numerator, denominator) {
    return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 10000 : 0;
  }

  function summarize(events, updatedAt) {
    var groups = {};
    for (var i = 0; i < events.length; i += 1) {
      var event = events[i];
      var key = [event.date_jst, event.tenant, event.account_type, event.account_id, event.campaign_id, event.experiment_variant].join('|');
      if (!groups[key]) {
        groups[key] = {
          date_jst: event.date_jst, tenant: event.tenant,
          account_type: event.account_type, account_id: event.account_id,
          campaign_id: event.campaign_id, experiment_variant: event.experiment_variant,
          impressions: 0, clicks: 0, outbound: 0, purchases: 0,
          revenue: 0, gross_profit: 0
        };
      }
      var group = groups[key];
      if (event.event_type === 'IMPRESSION') { group.impressions += 1; }
      if (event.event_type === 'CLICK') { group.clicks += 1; }
      if (event.event_type === 'OUTBOUND') { group.outbound += 1; }
      if (event.event_type === 'PURCHASE') {
        group.purchases += 1;
        group.revenue += Number(event.revenue || 0);
        group.gross_profit += Number(event.gross_profit || 0);
      }
    }
    return Object.keys(groups).sort().map(function (key) {
      var group = groups[key];
      return [
        group.date_jst, group.tenant, group.account_type, group.account_id,
        group.campaign_id, group.experiment_variant,
        group.impressions, group.clicks, group.outbound, group.purchases,
        safeRate(group.clicks, group.impressions),
        safeRate(group.outbound, group.impressions),
        safeRate(group.purchases, group.outbound),
        group.revenue, group.gross_profit, updatedAt || Utility.nowIso()
      ];
    });
  }

  function calculateUplift(summaryRows, updatedAt) {
    var pairs = {};
    for (var i = 0; i < summaryRows.length; i += 1) {
      var row = summaryRows[i];
      var key = [row[0], row[1], row[2], row[3], row[4]].join('|');
      if (!pairs[key]) {
        pairs[key] = { prefix: row.slice(0, 5), variants: {} };
      }
      pairs[key].variants[String(row[5])] = row;
    }
    var output = [];
    Object.keys(pairs).sort().forEach(function (key) {
      var pair = pairs[key];
      var control = pair.variants.CONTROL;
      var treatment = pair.variants.P_GATE;
      if (!control || !treatment) {
        return;
      }
      var metrics = [
        ['CTR', control[10], treatment[10], control[6], treatment[6]],
        ['OUTBOUND_RATE', control[11], treatment[11], control[6], treatment[6]],
        ['CVR', control[12], treatment[12], control[8], treatment[8]],
        ['REVENUE_PER_1000_IMPRESSIONS', safeRate(control[13] * 1000, control[6]), safeRate(treatment[13] * 1000, treatment[6]), control[6], treatment[6]],
        ['GROSS_PROFIT_PER_1000_IMPRESSIONS', safeRate(control[14] * 1000, control[6]), safeRate(treatment[14] * 1000, treatment[6]), control[6], treatment[6]]
      ];
      for (var m = 0; m < metrics.length; m += 1) {
        var controlValue = Number(metrics[m][1] || 0);
        var treatmentValue = Number(metrics[m][2] || 0);
        var absoluteLift = treatmentValue - controlValue;
        var relativeLift = controlValue !== 0 ? absoluteLift / controlValue : '';
        output.push(pair.prefix.concat([
          metrics[m][0], controlValue, treatmentValue, absoluteLift, relativeLift,
          metrics[m][3], metrics[m][4], updatedAt || Utility.nowIso()
        ]));
      }
    });
    return output;
  }

  function refreshSummary() {
    var sheets = ensureSheets();
    var events = sheets.events.getLastRow() > 1
      ? sheets.events.getRange(2, 1, sheets.events.getLastRow() - 1, EVENT_HEADERS.length).getValues().map(fromEventRow)
      : [];
    var rows = summarize(events, Utility.nowIso());
    var upliftRows = calculateUplift(rows, Utility.nowIso());
    if (sheets.summary.getLastRow() > 1) {
      sheets.summary.getRange(2, 1, sheets.summary.getLastRow() - 1, SUMMARY_HEADERS.length).clearContent();
    }
    if (rows.length > 0) {
      sheets.summary.getRange(2, 1, rows.length, SUMMARY_HEADERS.length).setValues(rows);
    }
    if (sheets.uplift.getLastRow() > 1) {
      sheets.uplift.getRange(2, 1, sheets.uplift.getLastRow() - 1, UPLIFT_HEADERS.length).clearContent();
    }
    if (upliftRows.length > 0) {
      sheets.uplift.getRange(2, 1, upliftRows.length, UPLIFT_HEADERS.length).setValues(upliftRows);
    }
    return { events: events.length, summaries: rows.length, upliftRows: upliftRows.length };
  }

  return {
    EVENT_SHEET_NAME: EVENT_SHEET_NAME,
    SUMMARY_SHEET_NAME: SUMMARY_SHEET_NAME,
    UPLIFT_SHEET_NAME: UPLIFT_SHEET_NAME,
    EVENT_HEADERS: EVENT_HEADERS.slice(),
    SUMMARY_HEADERS: SUMMARY_HEADERS.slice(),
    UPLIFT_HEADERS: UPLIFT_HEADERS.slice(),
    ensureSheets: ensureSheets,
    normalizeEvent: normalizeEvent,
    record: record,
    summarize: summarize,
    calculateUplift: calculateUplift,
    refreshSummary: refreshSummary,
    toJstDateKey: toJstDateKey
  };
}());

function recordProjectGateKpiEvents(events) {
  'use strict';
  return MeasurementEngine.record(events);
}

function refreshProjectGateKpiSummary() {
  'use strict';
  return MeasurementEngine.refreshSummary();
}
