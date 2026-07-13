/**
 * Project GATE - ImportLog.gs
 * ZIP取込単位の監査証跡をImport_Logシートへ記録する。
 */
var ImportLog = (function () {
  'use strict';

  var SHEET_NAME = 'Import_Log';
  var HEADERS = [
    'Batch_ID', 'Source_File_ID', 'Source_File_Name', 'Tenant', 'Status',
    'CSV_Count', 'Read_Rows', 'Valid_Rows', 'Inserted', 'Updated', 'Unchanged',
    'Error_Count', 'Started_At', 'Finished_At', 'Error_Code', 'Error_Message'
  ];

  function ensureSheet() {
    return Utility.ensureSheet(Config.getSpreadsheet(), SHEET_NAME, HEADERS);
  }

  function hasSucceeded(sourceFileId) {
    var sheet = ensureSheet();
    if (sheet.getLastRow() < 2) {
      return false;
    }
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
    for (var i = values.length - 1; i >= 0; i -= 1) {
      if (String(values[i][1]) === String(sourceFileId) && String(values[i][4]) === 'SUCCESS') {
        return true;
      }
    }
    return false;
  }

  function begin(batchId, file) {
    var sheet = ensureSheet();
    var rowNumber = sheet.getLastRow() + 1;
    var row = [
      batchId,
      file.getId(),
      file.getName(),
      '',
      'STARTED',
      0, 0, 0, 0, 0, 0, 0,
      Utility.nowIso(),
      '', '', ''
    ];
    sheet.getRange(rowNumber, 1, 1, HEADERS.length).setValues([row]);
    return rowNumber;
  }

  function finish(rowNumber, result) {
    var sheet = ensureSheet();
    var current = sheet.getRange(rowNumber, 1, 1, HEADERS.length).getValues()[0];
    current[3] = result.tenant || current[3] || '';
    current[4] = result.status;
    current[5] = result.csvCount || 0;
    current[6] = result.readRows || 0;
    current[7] = result.validRows || 0;
    current[8] = result.inserted || 0;
    current[9] = result.updated || 0;
    current[10] = result.unchanged || 0;
    current[11] = result.errorCount || 0;
    current[13] = Utility.nowIso();
    current[14] = result.errorCode || '';
    current[15] = result.errorMessage || '';
    sheet.getRange(rowNumber, 1, 1, HEADERS.length).setValues([current]);
  }

  return {
    SHEET_NAME: SHEET_NAME,
    HEADERS: HEADERS.slice(),
    ensureSheet: ensureSheet,
    hasSucceeded: hasSucceeded,
    begin: begin,
    finish: finish
  };
}());

