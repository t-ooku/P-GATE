/**
 * Project GATE - Config.gs
 * Configシートを唯一の設定元として扱う。
 */
var Config = (function () {
  'use strict';

  var SHEET_NAME = 'Config';
  var CURRENT_SYSTEM_VERSION = '1.15.0';
  var HEADERS = ['Key', 'Value', 'Description'];
  var REQUIRED_KEYS = [
    'ENV',
    'INPUT_FOLDER_ID',
    'EXTRACT_FOLDER_ID',
    'ARCHIVE_FOLDER_ID',
    'ERROR_FOLDER_ID',
    'LOG_FOLDER_ID',
    'SPREADSHEET_ID',
    'SYSTEM_VERSION'
  ];
  var OPTIONAL_KEYS = [
    'ENABLE_AUTO_CLEANUP',
    'ARCHIVE_RETENTION_DAYS',
    'ERROR_RETENTION_DAYS',
    'LOG_RETENTION_DAYS',
    'EXTRACT_KEEP_FILES',
    'ENABLE_DUPLICATE_CHECK',
    'PROCESS_LATEST_PER_ACCOUNT'
  ];
  var TEMPLATE_KEYS = REQUIRED_KEYS.concat(OPTIONAL_KEYS);
  var DESCRIPTIONS = {
    ENV: '実行環境。PROD / TEST',
    INPUT_FOLDER_ID: '01_Input_Zip のGoogle DriveフォルダID',
    EXTRACT_FOLDER_ID: '02_Extracted_CSV のGoogle DriveフォルダID',
    ARCHIVE_FOLDER_ID: '03_Archive のGoogle DriveフォルダID',
    ERROR_FOLDER_ID: '04_Error のGoogle DriveフォルダID',
    LOG_FOLDER_ID: '05_Log のGoogle DriveフォルダID',
    SPREADSHEET_ID: 'Project GATEのSpreadsheet ID',
    SYSTEM_VERSION: 'システムバージョン',
    ENABLE_AUTO_CLEANUP: '自動クリーンアップを有効化。TRUE / FALSE',
    ARCHIVE_RETENTION_DAYS: '03_Archiveの保持日数',
    ERROR_RETENTION_DAYS: '04_Errorの保持日数',
    LOG_RETENTION_DAYS: '05_Logの保持日数',
    EXTRACT_KEEP_FILES: '02_Extracted_CSVに残す最新ファイル数',
    ENABLE_DUPLICATE_CHECK: 'ZIP内容のSHA-256重複判定を有効化。TRUE / FALSE',
    PROCESS_LATEST_PER_ACCOUNT: 'ACCESSアカウント別に最新ZIPだけを処理。TRUE / FALSE'
  };
  var cache = null;

  function getSpreadsheet() {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) {
      return active;
    }

    var bootstrapId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!bootstrapId) {
      throw Utility.createError(
        'CONFIG_SPREADSHEET_UNAVAILABLE',
        'Spreadsheetを特定できません。Spreadsheetに紐づくGASとして実行してください。'
      );
    }
    return SpreadsheetApp.openById(bootstrapId);
  }

  function load() {
    if (cache !== null) {
      return cache;
    }

    var sheet = getSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      throw Utility.createError('CONFIG_SHEET_NOT_FOUND', 'Configシートが存在しません。');
    }

    var values = sheet.getDataRange().getValues();
    var result = {};
    for (var i = 1; i < values.length; i += 1) {
      var key = String(values[i][0] || '').trim();
      if (!key) {
        continue;
      }
      result[key] = String(values[i][1] == null ? '' : values[i][1]).trim();
    }
    cache = result;
    return cache;
  }

  function get(key, defaultValue) {
    var values = load();
    if (Object.prototype.hasOwnProperty.call(values, key) && values[key] !== '') {
      return values[key];
    }
    return defaultValue;
  }

  function getRequired(key) {
    var value = get(key, '');
    if (!value) {
      throw Utility.createError('CONFIG_VALUE_MISSING', 'Configの必須値が未設定です: ' + key, { key: key });
    }
    return value;
  }

  function isEnabled(key, defaultValue) {
    var value = String(get(key, defaultValue ? 'TRUE' : 'FALSE')).toUpperCase();
    return value !== 'FALSE' && value !== '0' && value !== 'NO' && value !== 'OFF';
  }

  function validate() {
    var missing = [];
    for (var i = 0; i < REQUIRED_KEYS.length; i += 1) {
      if (!get(REQUIRED_KEYS[i], '')) {
        missing.push(REQUIRED_KEYS[i]);
      }
    }
    if (missing.length > 0) {
      throw Utility.createError(
        'CONFIG_INCOMPLETE',
        'Configの必須値が未設定です: ' + missing.join(', '),
        { missing: missing }
      );
    }
    return true;
  }

  function resetCache() {
    cache = null;
  }

  function ensureTemplate() {
    var spreadsheet = getSpreadsheet();
    var sheet = Utility.ensureSheet(spreadsheet, SHEET_NAME, HEADERS);
    var existing = {};
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var current = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
      for (var i = 0; i < current.length; i += 1) {
        existing[String(current[i][0] || '').trim()] = current[i];
      }
    }

    var defaults = {
      ENV: 'PROD',
      INPUT_FOLDER_ID: '',
      EXTRACT_FOLDER_ID: '',
      ARCHIVE_FOLDER_ID: '',
      ERROR_FOLDER_ID: '',
      LOG_FOLDER_ID: '',
      SPREADSHEET_ID: spreadsheet.getId(),
      SYSTEM_VERSION: CURRENT_SYSTEM_VERSION,
      ENABLE_AUTO_CLEANUP: 'TRUE',
      ARCHIVE_RETENTION_DAYS: '7',
      ERROR_RETENTION_DAYS: '30',
      LOG_RETENTION_DAYS: '30',
      EXTRACT_KEEP_FILES: '1',
      ENABLE_DUPLICATE_CHECK: 'TRUE',
      PROCESS_LATEST_PER_ACCOUNT: 'TRUE'
    };
    var rows = [];
    for (var j = 0; j < TEMPLATE_KEYS.length; j += 1) {
      var key = TEMPLATE_KEYS[j];
      rows.push([
        key,
        key === 'SYSTEM_VERSION' ? CURRENT_SYSTEM_VERSION : (existing[key] ? existing[key][1] : defaults[key]),
        DESCRIPTIONS[key]
      ]);
    }
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).clearContent();
    }
    sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
    sheet.setFrozenRows(1);
    resetCache();
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', spreadsheet.getId());
    return sheet;
  }

  return {
    SHEET_NAME: SHEET_NAME,
    CURRENT_SYSTEM_VERSION: CURRENT_SYSTEM_VERSION,
    REQUIRED_KEYS: REQUIRED_KEYS.slice(),
    OPTIONAL_KEYS: OPTIONAL_KEYS.slice(),
    getSpreadsheet: getSpreadsheet,
    get: get,
    getRequired: getRequired,
    isEnabled: isEnabled,
    validate: validate,
    resetCache: resetCache,
    ensureTemplate: ensureTemplate
  };
}());