/**
 * Project GATE - Logger.gs
 * 1実行分のログをメモリに蓄積し、シートと05_Logへ一括出力する。
 */
var AppLogger = (function () {
  'use strict';

  var SHEET_NAME = 'System_Log';
  var HEADERS = ['Timestamp', 'Level', 'Batch_ID', 'Event', 'Message', 'Data_JSON'];
  var entries = [];
  var batchId = '';

  function startBatch(id) {
    batchId = id || '';
    entries = [];
  }

  function add(level, eventName, message, data) {
    var entry = [
      Utility.nowIso(),
      level,
      batchId,
      eventName || '',
      message || '',
      Utility.safeJson(data || {})
    ];
    entries.push(entry);
    if (typeof console !== 'undefined' && console.log) {
      console.log(level + ' [' + (eventName || '') + '] ' + (message || ''));
    }
  }

  function info(eventName, message, data) {
    add('INFO', eventName, message, data);
  }

  function warn(eventName, message, data) {
    add('WARN', eventName, message, data);
  }

  function error(eventName, message, errorObject) {
    add('ERROR', eventName, message, Utility.serializeError(errorObject));
  }

  function ensureSheet() {
    return Utility.ensureSheet(Config.getSpreadsheet(), SHEET_NAME, HEADERS);
  }

  function flush() {
    if (entries.length === 0) {
      return;
    }
    var snapshot = entries.slice();
    entries = [];

    try {
      var sheet = ensureSheet();
      sheet.getRange(sheet.getLastRow() + 1, 1, snapshot.length, HEADERS.length).setValues(snapshot);
    } catch (sheetError) {
      if (typeof console !== 'undefined' && console.error) {
        console.error(sheetError);
      }
    }

    try {
      var logFolderId = Config.get('LOG_FOLDER_ID', '');
      if (logFolderId) {
        var fileName = 'project-gate_' + (batchId || 'system') + '_' + Utility.timestampForFile() + '.json';
        DriveService.createTextFile(logFolderId, fileName, JSON.stringify(snapshot, null, 2), 'application/json');
      }
    } catch (driveError) {
      if (typeof console !== 'undefined' && console.error) {
        console.error(driveError);
      }
    }
  }

  return {
    SHEET_NAME: SHEET_NAME,
    HEADERS: HEADERS.slice(),
    startBatch: startBatch,
    info: info,
    warn: warn,
    error: error,
    flush: flush,
    ensureSheet: ensureSheet
  };
}());
