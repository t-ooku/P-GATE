/**
 * Project GATE - MarketplaceMeasurementEngine.gs
 * 既存KPIスキーマを変更せず、購入先Marketplace別の選択状況を記録・集計する。
 */
var MarketplaceMeasurementEngine = (function () {
  'use strict';

  var EVENT_SHEET_NAME = 'Marketplace_KPI_Event_Log';
  var SUMMARY_SHEET_NAME = 'Marketplace_KPI_Summary';
  var EVENT_HEADERS = [
    'Event_Key', 'Event_ID', 'Occurred_At', 'Date_JST', 'Tenant', 'Account_Type',
    'Account_ID', 'Session_ID', 'Recommendation_ID', 'ASIN', 'Marketplace',
    'Event_Type', 'Channel', 'Consent', 'Recorded_At'
  ];
  var SUMMARY_HEADERS = [
    'Date_JST', 'Tenant', 'Account_Type', 'Account_ID', 'Channel', 'Marketplace',
    'Clicks', 'Outbound', 'Unique_Sessions', 'Unique_ASINs', 'Click_Selection_Share', 'Updated_At'
  ];
  var MARKETPLACES = ['AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP'];
  var EVENT_TYPES = ['CLICK', 'OUTBOUND'];
  var CHANNELS = ['LINE', 'PWA'];

  function ensureSheets() {
    return {
      events: Utility.ensureSheet(Config.getSpreadsheet(), EVENT_SHEET_NAME, EVENT_HEADERS),
      summary: Utility.ensureSheet(Config.getSpreadsheet(), SUMMARY_SHEET_NAME, SUMMARY_HEADERS)
    };
  }

  function clean(value, field) {
    var text = Utility.trim(value);
    if (!text || text.length > 200) {
      throw Utility.createError('MARKETPLACE_KPI_FIELD_INVALID', field + 'が未入力または長すぎます。');
    }
    return text;
  }

  function toJstDateKey(value) {
    var date = new Date(value);
    if (!isFinite(date.getTime())) {
      throw Utility.createError('MARKETPLACE_KPI_DATE_INVALID', 'Occurred_Atが不正です。');
    }
    return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  function normalizeEvent(source, recordedAt) {
    source = source || {};
    if (source.consent !== true) {
      throw Utility.createError('MARKETPLACE_KPI_CONSENT_REQUIRED', '計測には同意が必要です。');
    }
    var marketplace = clean(source.marketplace, 'Marketplace').toUpperCase();
    var eventType = clean(source.event_type, 'Event_Type').toUpperCase();
    var channel = clean(source.channel, 'Channel').toUpperCase();
    if (MARKETPLACES.indexOf(marketplace) < 0) {
      throw Utility.createError('MARKETPLACE_KPI_MARKETPLACE_INVALID', '未対応Marketplaceです: ' + marketplace);
    }
    if (EVENT_TYPES.indexOf(eventType) < 0) {
      throw Utility.createError('MARKETPLACE_KPI_EVENT_INVALID', '未対応Event_Typeです: ' + eventType);
    }
    if (CHANNELS.indexOf(channel) < 0) {
      throw Utility.createError('MARKETPLACE_KPI_CHANNEL_INVALID', '未対応Channelです: ' + channel);
    }
    var occurredAt = clean(source.occurred_at, 'Occurred_At');
    var tenant = clean(source.tenant, 'Tenant').toLowerCase();
    var accountType = clean(source.account_type, 'Account_Type').toUpperCase();
    var accountId = clean(source.account_id, 'Account_ID');
    var eventId = clean(source.event_id, 'Event_ID');
    var sessionId = clean(source.session_id, 'Session_ID');
    var asin = clean(source.asin, 'ASIN').toUpperCase();
    if (/@/.test(sessionId) || /\s/.test(sessionId)) {
      throw Utility.createError('MARKETPLACE_KPI_SESSION_UNSAFE', 'Session_IDは仮名IDにしてください。');
    }
    if (!/^[A-Z0-9]{10}$/.test(asin)) {
      throw Utility.createError('MARKETPLACE_KPI_ASIN_INVALID', 'ASIN形式が不正です。');
    }
    return {
      event_key: [tenant, accountType, accountId, eventId].join('|'),
      event_id: eventId,
      occurred_at: new Date(occurredAt).toISOString(),
      date_jst: toJstDateKey(occurredAt),
      tenant: tenant,
      account_type: accountType,
      account_id: accountId,
      session_id: sessionId,
      recommendation_id: clean(source.recommendation_id, 'Recommendation_ID'),
      asin: asin,
      marketplace: marketplace,
      event_type: eventType,
      channel: channel,
      consent: true,
      recorded_at: recordedAt || Utility.nowIso()
    };
  }

  function toRow(event) {
    return [
      event.event_key, event.event_id, event.occurred_at, event.date_jst, event.tenant,
      event.account_type, event.account_id, event.session_id, event.recommendation_id,
      event.asin, event.marketplace, event.event_type, event.channel, event.consent, event.recorded_at
    ];
  }

  function fromRow(row) {
    return {
      event_key: row[0], event_id: row[1], occurred_at: row[2], date_jst: row[3],
      tenant: row[4], account_type: row[5], account_id: row[6], session_id: row[7],
      recommendation_id: row[8], asin: row[9], marketplace: row[10],
      event_type: row[11], channel: row[12], consent: row[13], recorded_at: row[14]
    };
  }

  function record(events) {
    if (!Array.isArray(events) || events.length === 0) { return { accepted: 0, duplicated: 0 }; }
    if (events.length > 200) {
      throw Utility.createError('MARKETPLACE_KPI_BATCH_INVALID', 'イベントは200件以下で指定してください。');
    }
    var sheets = ensureSheets();
    var existing = {};
    if (sheets.events.getLastRow() > 1) {
      sheets.events.getRange(2, 1, sheets.events.getLastRow() - 1, 1).getValues().forEach(function (row) {
        existing[String(row[0])] = true;
      });
    }
    var seen = {};
    var rows = [];
    var duplicated = 0;
    var now = Utility.nowIso();
    events.forEach(function (event) {
      var normalized = normalizeEvent(event, now);
      if (existing[normalized.event_key] || seen[normalized.event_key]) { duplicated += 1; return; }
      seen[normalized.event_key] = true;
      rows.push(toRow(normalized));
    });
    if (rows.length > 0) {
      sheets.events.getRange(sheets.events.getLastRow() + 1, 1, rows.length, EVENT_HEADERS.length).setValues(rows);
    }
    return { accepted: rows.length, duplicated: duplicated };
  }

  function summarize(events, updatedAt) {
    var groups = {};
    var totals = {};
    (events || []).forEach(function (event) {
      var baseKey = [event.date_jst, event.tenant, event.account_type, event.account_id, event.channel].join('|');
      var key = baseKey + '|' + event.marketplace;
      if (!groups[key]) {
        groups[key] = {
          date_jst: event.date_jst, tenant: event.tenant, account_type: event.account_type,
          account_id: event.account_id, channel: event.channel, marketplace: event.marketplace,
          clicks: 0, outbound: 0, sessions: {}, asins: {}
        };
      }
      if (event.event_type === 'CLICK') {
        groups[key].clicks += 1;
        totals[baseKey] = (totals[baseKey] || 0) + 1;
      }
      if (event.event_type === 'OUTBOUND') { groups[key].outbound += 1; }
      groups[key].sessions[event.session_id] = true;
      groups[key].asins[event.asin] = true;
    });
    return Object.keys(groups).sort().map(function (key) {
      var group = groups[key];
      var baseKey = [group.date_jst, group.tenant, group.account_type, group.account_id, group.channel].join('|');
      return [
        group.date_jst, group.tenant, group.account_type, group.account_id, group.channel,
        group.marketplace, group.clicks, group.outbound, Object.keys(group.sessions).length,
        Object.keys(group.asins).length, totals[baseKey] ? Math.round(group.clicks / totals[baseKey] * 10000) / 10000 : 0,
        updatedAt || Utility.nowIso()
      ];
    });
  }

  function refreshSummary() {
    var sheets = ensureSheets();
    var events = sheets.events.getLastRow() > 1
      ? sheets.events.getRange(2, 1, sheets.events.getLastRow() - 1, EVENT_HEADERS.length).getValues().map(fromRow) : [];
    var rows = summarize(events, Utility.nowIso());
    if (sheets.summary.getLastRow() > 1) {
      sheets.summary.getRange(2, 1, sheets.summary.getLastRow() - 1, SUMMARY_HEADERS.length).clearContent();
    }
    if (rows.length > 0) {
      sheets.summary.getRange(2, 1, rows.length, SUMMARY_HEADERS.length).setValues(rows);
    }
    return { events: events.length, summaries: rows.length };
  }

  return {
    EVENT_SHEET_NAME: EVENT_SHEET_NAME,
    SUMMARY_SHEET_NAME: SUMMARY_SHEET_NAME,
    EVENT_HEADERS: EVENT_HEADERS.slice(),
    SUMMARY_HEADERS: SUMMARY_HEADERS.slice(),
    ensureSheets: ensureSheets,
    normalizeEvent: normalizeEvent,
    record: record,
    summarize: summarize,
    refreshSummary: refreshSummary
  };
}());

function refreshProjectGateMarketplaceKpiSummary() {
  'use strict';
  return MarketplaceMeasurementEngine.refreshSummary();
}
