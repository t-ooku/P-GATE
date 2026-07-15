/**
 * Project GATE - PreflightEngine.gs
 * 外部公開前の設定状態を、Secret値を露出せず一覧化する。
 */
var PreflightEngine = (function () {
  'use strict';

  var SHEET_NAME = 'System_Health';
  var HEADERS = ['Component', 'Check', 'Status', 'Details', 'Checked_At'];
  var CORE_SHEETS = [
    'Config', 'Import_Log', 'System_Log', 'Master_Database', 'Opportunity',
    'KPI_Event_Log', 'Client_Contracts', 'Anonymous_Benchmark', 'Marketplace_Offers',
    'Marketplace_Offer_Validation', 'Knowledge_Query_Log',
    'Search_Alias', 'Localized_Content', 'Product_Identifiers',
    'Identifier_Coverage', 'Identifier_Conflicts'
  ];

  function ensureSheet() {
    return Utility.ensureSheet(Config.getSpreadsheet(), SHEET_NAME, HEADERS);
  }

  function row(component, check, status, details, checkedAt) {
    return [component, check, status, details, checkedAt];
  }

  function propertyStatus(properties, name, required) {
    return {
      status: properties[name] ? 'PASS' : (required ? 'FAIL' : 'WARN'),
      details: properties[name] ? '設定済み' : '未設定'
    };
  }

  function countApproved(sheet, approvedColumn) {
    if (!sheet || sheet.getLastRow() < 2) { return 0; }
    var values = sheet.getRange(2, approvedColumn, sheet.getLastRow() - 1, 1).getValues();
    return values.filter(function (item) {
      return item[0] === true || String(item[0]).toUpperCase() === 'TRUE';
    }).length;
  }

  function summarize(rows) {
    var result = { pass: 0, warn: 0, fail: 0, ready: true };
    rows.forEach(function (item) {
      var status = String(item[2] || '').toUpperCase();
      if (status === 'PASS') { result.pass += 1; }
      if (status === 'WARN') { result.warn += 1; }
      if (status === 'FAIL') { result.fail += 1; }
    });
    result.ready = result.fail === 0;
    return result;
  }

  function run() {
    var spreadsheet = Config.getSpreadsheet();
    var checkedAt = Utility.nowIso();
    var rows = [];

    try {
      Config.resetCache();
      Config.validate();
      rows.push(row('CORE', 'Config必須値', 'PASS', '必須設定が揃っています', checkedAt));
    } catch (error) {
      rows.push(row('CORE', 'Config必須値', 'FAIL', error.code || 'CONFIG_INCOMPLETE', checkedAt));
    }
    var configuredVersion = '';
    try { configuredVersion = Config.get('SYSTEM_VERSION', ''); } catch (ignore) {}
    rows.push(row(
      'CORE', 'SYSTEM_VERSION', configuredVersion === Config.CURRENT_SYSTEM_VERSION ? 'PASS' : 'FAIL',
      configuredVersion === Config.CURRENT_SYSTEM_VERSION
        ? Config.CURRENT_SYSTEM_VERSION : '期待=' + Config.CURRENT_SYSTEM_VERSION + ' / 現在=' + (configuredVersion || '未設定'),
      checkedAt
    ));

    var missingSheets = CORE_SHEETS.filter(function (name) { return !spreadsheet.getSheetByName(name); });
    rows.push(row(
      'CORE', '必須シート', missingSheets.length === 0 ? 'PASS' : 'FAIL',
      missingSheets.length === 0 ? '必要なシートが存在します' : '不足: ' + missingSheets.join(', '), checkedAt
    ));

    var triggerCount = 0;
    try {
      triggerCount = ScriptApp.getProjectTriggers().filter(function (trigger) {
        return trigger.getHandlerFunction() === 'runProjectGate';
      }).length;
    } catch (ignoreTrigger) {}
    rows.push(row(
      'CORE', '5分取込トリガー', triggerCount === 1 ? 'PASS' : (triggerCount === 0 ? 'WARN' : 'FAIL'),
      triggerCount === 1 ? '1件設定済み' : '現在' + triggerCount + '件', checkedAt
    ));

    var serviceUrl = '';
    try { serviceUrl = ScriptApp.getService().getUrl() || ''; } catch (ignoreService) {}
    rows.push(row(
      'PUBLIC_CHANNELS', 'GAS Web App', serviceUrl ? 'PASS' : 'WARN',
      serviceUrl ? 'デプロイ済み' : '未デプロイまたはURLを取得できません', checkedAt
    ));

    var properties = PropertiesService.getScriptProperties().getProperties();
    [
      ['PWA', 'LINE_BRIDGE_SECRET', true],
      ['PWA', 'PWA_CONTRACT_ID', true],
      ['PWA', 'PWA_DEFAULT_CATEGORY', true],
      ['LINE', 'LINE_CONTRACT_ID', false],
      ['LINE', 'LINE_DEFAULT_CATEGORY', false]
    ].forEach(function (definition) {
      var result = propertyStatus(properties, definition[1], definition[2]);
      rows.push(row(definition[0], definition[1], result.status, result.details, checkedAt));
    });

    var aliasCount = countApproved(spreadsheet.getSheetByName('Search_Alias'), 6);
    rows.push(row(
      'MULTILINGUAL', '承認済み検索別名', aliasCount > 0 ? 'PASS' : 'WARN',
      aliasCount + '件', checkedAt
    ));

    var offerValidation = MarketplaceEngine.validateSheet(spreadsheet.getSheetByName('Marketplace_Offers'));
    var offerCount = offerValidation.summary.approved_valid;
    rows.push(row(
      'MULTI_EC', '承認済み購入先', offerValidation.summary.approved_invalid > 0 ? 'FAIL' : (offerCount > 0 ? 'PASS' : 'WARN'),
      '有効' + offerCount + '件 / エラー' + offerValidation.summary.approved_invalid + '件 / 未完成下書き' + offerValidation.summary.draft_incomplete + '件', checkedAt
    ));

    var identifierCount = countApproved(spreadsheet.getSheetByName('Product_Identifiers'), 6);
    rows.push(row(
      'BARCODE', '承認済み商品コード', identifierCount >= 100 ? 'PASS' : 'WARN',
      identifierCount + '件 / 公開目安100件', checkedAt
    ));
    var conflictSheet = spreadsheet.getSheetByName('Identifier_Conflicts');
    var conflictCount = conflictSheet ? Math.max(0, conflictSheet.getLastRow() - 1) : 0;
    rows.push(row(
      'BARCODE', '商品コード競合', conflictCount === 0 ? 'PASS' : 'FAIL',
      conflictCount + '件', checkedAt
    ));

    var contractsSheet = spreadsheet.getSheetByName('Client_Contracts');
    var contractCount = contractsSheet ? Math.max(0, contractsSheet.getLastRow() - 1) : 0;
    rows.push(row(
      'CONTRACT', '登録契約', contractCount > 0 ? 'PASS' : 'FAIL',
      contractCount + '件', checkedAt
    ));
    var benchmarkConsentCount = countApproved(contractsSheet, 12);
    rows.push(row(
      'BENCHMARK', '匿名比較の明示同意', benchmarkConsentCount >= BenchmarkEngine.MINIMUM_COHORT ? 'PASS' : 'WARN',
      benchmarkConsentCount + '件 / 生成最低' + BenchmarkEngine.MINIMUM_COHORT + '件', checkedAt
    ));

    var sheet = ensureSheet();
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).clearContent();
    }
    sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
    return summarize(rows);
  }

  return {
    SHEET_NAME: SHEET_NAME,
    HEADERS: HEADERS.slice(),
    CORE_SHEETS: CORE_SHEETS.slice(),
    ensureSheet: ensureSheet,
    propertyStatus: propertyStatus,
    summarize: summarize,
    run: run
  };
}());

function runProjectGatePreflight() {
  'use strict';
  var result = PreflightEngine.run();
  SpreadsheetApp.getUi().alert(
    result.ready
      ? '事前確認が完了しました。FAILはありません。System_HealthのWARNを確認してください。'
      : '事前確認でFAILを検出しました。System_Healthを確認してください。'
  );
  return result;
}
