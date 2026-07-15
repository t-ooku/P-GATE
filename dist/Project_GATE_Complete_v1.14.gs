/**
 * Project GATE - Utility.gs
 * 副作用の少ない共通処理を提供する。
 */
var Utility = (function () {
  'use strict';

  function nowIso() {
    return new Date().toISOString();
  }

  function timestampForFile() {
    return nowIso().replace(/[-:.TZ]/g, '').slice(0, 14);
  }

  function uuid() {
    return Utilities.getUuid();
  }

  function normalizeHeader(value) {
    return String(value == null ? '' : value)
      .replace(/^\uFEFF/, '')
      .replace(/[\s　]+/g, '')
      .toLowerCase();
  }

  function trim(value) {
    return String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
  }

  function parseNumber(value) {
    if (typeof value === 'number') {
      return isFinite(value) ? value : 0;
    }
    var text = trim(value)
      .replace(/[￥¥$€£,％%]/g, '')
      .replace(/\s/g, '');
    if (text === '' || text === '-' || text === '—') {
      return 0;
    }
    var parsed = Number(text);
    return isFinite(parsed) ? parsed : 0;
  }

  function parseInteger(value) {
    return Math.round(parseNumber(value));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function safeJson(value) {
    var text;
    try {
      text = JSON.stringify(value == null ? {} : value);
    } catch (error) {
      text = JSON.stringify({ serializationError: String(error) });
    }
    return text.length > 45000 ? text.slice(0, 45000) : text;
  }

  function serializeError(error) {
    if (!error) {
      return {};
    }
    return {
      name: error.name || 'Error',
      code: error.code || '',
      message: error.message || String(error),
      details: error.details || {},
      stack: error.stack || ''
    };
  }

  function createError(code, message, details) {
    var error = new Error(message);
    error.code = code;
    error.details = details || {};
    return error;
  }

  function sha256(text) {
    var bytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      String(text),
      Utilities.Charset.UTF_8
    );
    return bytes.map(function (value) {
      var normalized = value < 0 ? value + 256 : value;
      return ('0' + normalized.toString(16)).slice(-2);
    }).join('');
  }

  function stableStringify(object, orderedKeys) {
    var result = {};
    for (var i = 0; i < orderedKeys.length; i += 1) {
      var key = orderedKeys[i];
      result[key] = object[key] == null ? '' : object[key];
    }
    return JSON.stringify(result);
  }

  function ensureSheet(spreadsheet, name, headers) {
    var sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(name);
    }
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      return sheet;
    }

    var currentHeaders = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn())).getValues()[0];
    for (var i = 0; i < headers.length; i += 1) {
      if (String(currentHeaders[i] || '') !== headers[i]) {
        throw createError(
          'SHEET_HEADER_MISMATCH',
          name + 'シートのヘッダーが仕様と一致しません。列' + (i + 1) + ': ' + headers[i],
          { sheet: name, expected: headers, actual: currentHeaders }
        );
      }
    }
    return sheet;
  }

  function chunk(array, size) {
    var result = [];
    for (var i = 0; i < array.length; i += size) {
      result.push(array.slice(i, i + size));
    }
    return result;
  }

  return {
    nowIso: nowIso,
    timestampForFile: timestampForFile,
    uuid: uuid,
    normalizeHeader: normalizeHeader,
    trim: trim,
    parseNumber: parseNumber,
    parseInteger: parseInteger,
    clamp: clamp,
    safeJson: safeJson,
    serializeError: serializeError,
    createError: createError,
    sha256: sha256,
    stableStringify: stableStringify,
    ensureSheet: ensureSheet,
    chunk: chunk
  };
}());

/**
 * Project GATE - Config.gs
 * Configシートを唯一の設定元として扱う。
 */
var Config = (function () {
  'use strict';

  var SHEET_NAME = 'Config';
  var CURRENT_SYSTEM_VERSION = '1.14.0';
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
  var DESCRIPTIONS = {
    ENV: '実行環境。PROD / TEST',
    INPUT_FOLDER_ID: '01_Input_Zip のGoogle DriveフォルダID',
    EXTRACT_FOLDER_ID: '02_Extracted_CSV のGoogle DriveフォルダID',
    ARCHIVE_FOLDER_ID: '03_Archive のGoogle DriveフォルダID',
    ERROR_FOLDER_ID: '04_Error のGoogle DriveフォルダID',
    LOG_FOLDER_ID: '05_Log のGoogle DriveフォルダID',
    SPREADSHEET_ID: 'Project GATEのSpreadsheet ID',
    SYSTEM_VERSION: 'システムバージョン'
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
      SYSTEM_VERSION: CURRENT_SYSTEM_VERSION
    };
    var rows = [];
    for (var j = 0; j < REQUIRED_KEYS.length; j += 1) {
      var key = REQUIRED_KEYS[j];
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
    getSpreadsheet: getSpreadsheet,
    get: get,
    getRequired: getRequired,
    validate: validate,
    resetCache: resetCache,
    ensureTemplate: ensureTemplate
  };
}());

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

/**
 * Project GATE - DriveService.gs
 * Google Drive操作をFolder ID / File IDだけで行う。
 */
var DriveService = (function () {
  'use strict';

  function getFolder(folderId) {
    if (!folderId) {
      throw Utility.createError('FOLDER_ID_MISSING', 'Folder IDが未設定です。');
    }
    return DriveApp.getFolderById(folderId);
  }

  function listInputZipFiles() {
    var folder = getFolder(Config.getRequired('INPUT_FOLDER_ID'));
    var iterator = folder.getFiles();
    var files = [];
    while (iterator.hasNext()) {
      var file = iterator.next();
      if (/\.zip$/i.test(file.getName())) {
        files.push(file);
      }
    }
    files.sort(function (left, right) {
      return left.getDateCreated().getTime() - right.getDateCreated().getTime();
    });
    return files;
  }

  function saveBlob(folderId, blob, fileName) {
    var target = getFolder(folderId);
    var copy = blob.copyBlob();
    copy.setName(fileName || blob.getName());
    return target.createFile(copy);
  }

  function createTextFile(folderId, fileName, content, mimeType) {
    return getFolder(folderId).createFile(fileName, content, mimeType || MimeType.PLAIN_TEXT);
  }

  function moveFile(file, folderId) {
    file.moveTo(getFolder(folderId));
    return file;
  }

  function getFile(fileId) {
    return DriveApp.getFileById(fileId);
  }

  function readRange(fileId, start, end) {
    var url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media';
    var response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
        Range: 'bytes=' + start + '-' + end
      },
      muteHttpExceptions: true
    });
    var status = response.getResponseCode();
    if (status !== 200 && status !== 206) {
      throw Utility.createError(
        'DRIVE_RANGE_READ_FAILED',
        'CSVの分割読込に失敗しました。HTTP ' + status,
        { fileId: fileId, start: start, end: end, response: response.getContentText().slice(0, 500) }
      );
    }
    return response.getBlob().getBytes();
  }

  return {
    getFolder: getFolder,
    listInputZipFiles: listInputZipFiles,
    saveBlob: saveBlob,
    createTextFile: createTextFile,
    moveFile: moveFile,
    getFile: getFile,
    readRange: readRange
  };
}());

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

  /**
   * GASの強制終了などでSTARTEDのまま残った取込を失敗として確定する。
   * 次回実行時に同じZIPを安全に再処理できるよう、監査ログだけを補正する。
   */
  function findStaleStartedIndexes(values, nowMillis, maxAgeMinutes) {
    var threshold = nowMillis - Number(maxAgeMinutes || 30) * 60 * 1000;
    var indexes = [];
    for (var i = 0; i < values.length; i += 1) {
      if (String(values[i][4] || '') !== 'STARTED') {
        continue;
      }
      var startedAt = new Date(values[i][12]).getTime();
      if (isFinite(startedAt) && startedAt <= threshold) {
        indexes.push(i);
      }
    }
    return indexes;
  }

  function recoverStaleStarted(maxAgeMinutes) {
    var sheet = ensureSheet();
    if (sheet.getLastRow() < 2) {
      return 0;
    }
    var rowCount = sheet.getLastRow() - 1;
    var values = sheet.getRange(2, 1, rowCount, HEADERS.length).getValues();
    var indexes = findStaleStartedIndexes(values, new Date().getTime(), maxAgeMinutes || 30);
    if (indexes.length === 0) {
      return 0;
    }

    var finishedAt = Utility.nowIso();
    for (var i = 0; i < indexes.length; i += 1) {
      var row = values[indexes[i]];
      row[4] = 'FAILED';
      row[11] = Number(row[11] || 0) + 1;
      row[13] = finishedAt;
      row[14] = 'STALE_EXECUTION_RECOVERED';
      row[15] = '前回実行が完了しなかったため、次回実行で再処理します。';
    }

    var groupStart = indexes[0];
    var groupRows = [values[groupStart]];
    for (var j = 1; j <= indexes.length; j += 1) {
      if (j < indexes.length && indexes[j] === indexes[j - 1] + 1) {
        groupRows.push(values[indexes[j]]);
        continue;
      }
      sheet.getRange(groupStart + 2, 1, groupRows.length, HEADERS.length).setValues(groupRows);
      if (j < indexes.length) {
        groupStart = indexes[j];
        groupRows = [values[groupStart]];
      }
    }
    return indexes.length;
  }

  return {
    SHEET_NAME: SHEET_NAME,
    HEADERS: HEADERS.slice(),
    ensureSheet: ensureSheet,
    hasSucceeded: hasSucceeded,
    begin: begin,
    finish: finish,
    findStaleStartedIndexes: findStaleStartedIndexes,
    recoverStaleStarted: recoverStaleStarted
  };
}());

/**
 * Project GATE - ZipEngine.gs
 * ZIP名からtenantを抽出し、Utilities.unzipでCSVを展開する。
 */
var ZipEngine = (function () {
  'use strict';

  function extractTenant(fileName) {
    var match = String(fileName || '').match(/customer_support-(itg|itt|mc2)@/i);
    if (!match) {
      throw Utility.createError(
        'ZIP_TENANT_UNKNOWN',
        'ZIP名からtenantを抽出できません: ' + fileName,
        { fileName: fileName }
      );
    }
    return match[1].toLowerCase();
  }

  function extract(file, batchId) {
    if (!/\.zip$/i.test(file.getName())) {
      throw Utility.createError('ZIP_EXTENSION_INVALID', 'ZIP以外のファイルです: ' + file.getName());
    }

    var tenant = extractTenant(file.getName());
    var blobs;
    try {
      blobs = Utilities.unzip(file.getBlob());
    } catch (error) {
      throw Utility.createError('ZIP_UNZIP_FAILED', 'ZIPの解凍に失敗しました: ' + file.getName(), {
        cause: Utility.serializeError(error)
      });
    }

    var csvBlobs = blobs.filter(function (blob) {
      return /\.csv$/i.test(blob.getName());
    });
    if (csvBlobs.length === 0) {
      throw Utility.createError('ZIP_CSV_NOT_FOUND', 'ZIP内にCSVがありません: ' + file.getName());
    }

    var output = [];
    for (var i = 0; i < csvBlobs.length; i += 1) {
      var sourceName = csvBlobs[i].getName().replace(/^.*[\\/]/, '');
      var targetName = batchId + '__' + sourceName;
      var created = DriveService.saveBlob(Config.getRequired('EXTRACT_FOLDER_ID'), csvBlobs[i], targetName);
      output.push({
        id: created.getId(),
        name: created.getName(),
        size: created.getSize()
      });
    }

    return {
      tenant: tenant,
      csvFiles: output
    };
  }

  return {
    extractTenant: extractTenant,
    extract: extract
  };
}());

/**
 * Project GATE - ImportEngine.gs
 * 大容量CSVをDrive APIのRange読込で分割処理し、必要行だけをメモリに保持する。
 */
var ImportEngine = (function () {
  'use strict';

  var DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024;

  function decodeBytes(bytes, encoding) {
    if (!bytes || bytes.length === 0) {
      return '';
    }
    return Utilities.newBlob(bytes).getDataAsString(encoding || 'Shift_JIS');
  }

  function isCompleteCsvRecord(text) {
    var insideQuotes = false;
    for (var i = 0; i < text.length; i += 1) {
      if (text.charAt(i) !== '"') {
        continue;
      }
      if (insideQuotes && text.charAt(i + 1) === '"') {
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    }
    return !insideQuotes;
  }

  function parseRecord(text) {
    var normalized = text.replace(/\r$/, '');
    if (normalized === '') {
      return null;
    }
    var parsed = Utilities.parseCsv(normalized);
    if (parsed.length !== 1) {
      throw Utility.createError('CSV_RECORD_INVALID', 'CSVレコードを1行として解析できません。');
    }
    return parsed[0];
  }

  function readCsv(fileId, options) {
    options = options || {};
    var encoding = options.encoding || 'Shift_JIS';
    var limit = Number(options.limit || 100);
    var chunkSize = Number(options.chunkSize || DEFAULT_CHUNK_SIZE);
    var acceptRecord = options.acceptRecord || function () { return true; };
    var file = DriveService.getFile(fileId);
    var fileSize = file.getSize();
    var offset = 0;
    var pending = [];
    var header = null;
    var rows = [];
    var scannedRows = 0;

    function consumeRecord(recordBytes) {
      var text = decodeBytes(recordBytes, encoding);
      if (!isCompleteCsvRecord(text)) {
        return false;
      }
      var row = parseRecord(text);
      if (!row) {
        return true;
      }
      if (header === null) {
        header = row.map(function (value, index) {
          return index === 0 ? String(value).replace(/^\uFEFF/, '') : String(value);
        });
        return true;
      }
      scannedRows += 1;
      if (acceptRecord(header, row)) {
        row.__sourceRowNumber = scannedRows + 1;
        rows.push(row);
      }
      return true;
    }

    while (offset < fileSize && rows.length < limit) {
      var end = Math.min(fileSize - 1, offset + chunkSize - 1);
      var bytes = DriveService.readRange(fileId, offset, end);
      if (!bytes || bytes.length === 0) {
        break;
      }
      var segmentStart = 0;
      for (var i = 0; i < bytes.length && rows.length < limit; i += 1) {
        if (bytes[i] !== 10) {
          continue;
        }
        var candidate = pending.concat(bytes.slice(segmentStart, i));
        if (consumeRecord(candidate)) {
          pending = [];
        } else {
          pending = candidate.concat([10]);
        }
        segmentStart = i + 1;
      }
      pending = pending.concat(bytes.slice(segmentStart));
      offset += bytes.length;
    }

    if (rows.length < limit && pending.length > 0) {
      consumeRecord(pending);
    }
    if (header === null) {
      throw Utility.createError('CSV_HEADER_NOT_FOUND', 'CSVヘッダーを読み取れませんでした。', { fileId: fileId });
    }

    return {
      header: header,
      rows: rows.slice(0, limit),
      scannedRows: scannedRows,
      selectedRows: Math.min(rows.length, limit),
      fileSize: fileSize
    };
  }

  return {
    readCsv: readCsv,
    isCompleteCsvRecord: isCompleteCsvRecord
  };
}());

/**
 * Project GATE - MappingEngine.gs
 * CSVヘッダーと内部フィールドの対応を一か所に集約する。
 */
var MappingEngine = (function () {
  'use strict';

  var DEFINITIONS = [
    { field: 'asin', aliases: ['ASIN'] },
    { field: 'image', aliases: ['画像', '画像URL', 'Image URL'] },
    { field: 'product_name', aliases: ['商品名', 'Title'] },
    { field: 'profit', aliases: ['利益', 'Profit'] },
    { field: 'price_lowest', aliases: ['売値/最安値', '売価'] },
    { field: 'fba_shipping', aliases: ['FBA出荷'] },
    { field: 'shipping', aliases: ['送料'] },
    { field: 'expenses', aliases: ['諸経費'] },
    { field: 'dimensions', aliases: ['幅インチ、長さインチ、高さインチ', 'サイズ情報'] },
    { field: 'stock', aliases: ['在庫数', '在庫'] },
    { field: 'registered_at', aliases: ['登録日時'] },
    { field: 'sku', aliases: ['SKU', 'Seller SKU'] },
    { field: 'manufacturer', aliases: ['メーカー', 'Brand'] },
    { field: 'jp_lowest', aliases: ['日本最安値'] },
    { field: 'sale_price', aliases: ['販売価格', 'Price'] },
    { field: 'updated_at', aliases: ['更新日時'] },
    { field: 'amazon_fee', aliases: ['販売手数料', 'Amazon手数料', 'Amazon Fee'] },
    { field: 'us_lowest', aliases: ['米国最安値'] },
    { field: 'customs_duty', aliases: ['関税', 'Import Tax'] },
    { field: 'state_tax', aliases: ['州税'] },
    { field: 'external_listing', aliases: ['ツール外出品'] },
    { field: 'amazon_jp_url', aliases: ['日本Amazon'] },
    { field: 'amazon_us_url', aliases: ['米国Amazon'] }
  ];

  function buildIndex(header) {
    var source = {};
    for (var i = 0; i < header.length; i += 1) {
      source[Utility.normalizeHeader(header[i])] = i;
    }
    var index = {};
    for (var d = 0; d < DEFINITIONS.length; d += 1) {
      var definition = DEFINITIONS[d];
      index[definition.field] = -1;
      for (var a = 0; a < definition.aliases.length; a += 1) {
        var normalized = Utility.normalizeHeader(definition.aliases[a]);
        if (Object.prototype.hasOwnProperty.call(source, normalized)) {
          index[definition.field] = source[normalized];
          break;
        }
      }
    }

    var missing = [];
    ['asin', 'product_name'].forEach(function (field) {
      if (index[field] < 0) {
        missing.push(field);
      }
    });
    if (missing.length > 0) {
      throw Utility.createError('CSV_REQUIRED_COLUMN_MISSING', 'CSVの必須列がありません: ' + missing.join(', '), {
        header: header,
        missing: missing
      });
    }
    return index;
  }

  function mapRow(row, index, sourceRowNumber) {
    var record = { source_row: sourceRowNumber || 0 };
    for (var i = 0; i < DEFINITIONS.length; i += 1) {
      var field = DEFINITIONS[i].field;
      var position = index[field];
      record[field] = position >= 0 ? row[position] : '';
    }
    return record;
  }

  function findAsinIndex(header) {
    return buildIndex(header).asin;
  }

  function getFields() {
    return DEFINITIONS.map(function (definition) { return definition.field; });
  }

  return {
    buildIndex: buildIndex,
    mapRow: mapRow,
    findAsinIndex: findAsinIndex,
    getFields: getFields
  };
}());

/**
 * Project GATE - NormalizeEngine.gs
 * Mapping後の値を内部型へ正規化する。
 */
var NormalizeEngine = (function () {
  'use strict';

  var NUMBER_FIELDS = [
    'profit', 'price_lowest', 'fba_shipping', 'shipping', 'expenses', 'stock',
    'jp_lowest', 'sale_price', 'amazon_fee', 'us_lowest', 'customs_duty', 'state_tax'
  ];

  function normalizeUrl(value) {
    var text = Utility.trim(value);
    if (!text) {
      return '';
    }
    return /^https?:\/\//i.test(text) ? text : text;
  }

  function normalize(mapped, tenant, batchId) {
    var record = {};
    var fields = MappingEngine.getFields();
    for (var i = 0; i < fields.length; i += 1) {
      record[fields[i]] = Utility.trim(mapped[fields[i]]);
    }
    for (var n = 0; n < NUMBER_FIELDS.length; n += 1) {
      record[NUMBER_FIELDS[n]] = NUMBER_FIELDS[n] === 'stock'
        ? Utility.parseInteger(mapped[NUMBER_FIELDS[n]])
        : Utility.parseNumber(mapped[NUMBER_FIELDS[n]]);
    }
    record.asin = record.asin.toUpperCase();
    record.sku = record.sku.toUpperCase();
    record.image = normalizeUrl(record.image);
    record.amazon_jp_url = normalizeUrl(record.amazon_jp_url);
    record.amazon_us_url = normalizeUrl(record.amazon_us_url);
    record.tenant = tenant;
    record.batch_id = batchId;
    record.source_row = mapped.source_row || 0;
    record.record_key = tenant + '|' + (record.sku || record.asin);
    return record;
  }

  function normalizeAll(mappedRows, tenant, batchId) {
    return mappedRows.map(function (row) {
      return normalize(row, tenant, batchId);
    });
  }

  return {
    normalize: normalize,
    normalizeAll: normalizeAll
  };
}());

/**
 * Project GATE - ValidationEngine.gs
 * Masterへ流す前の必須値・重複を検証する。
 */
var ValidationEngine = (function () {
  'use strict';

  function validateRecord(record) {
    var errors = [];
    if (!record.asin) {
      errors.push('ASIN_REQUIRED');
    } else if (!/^[A-Z0-9]{10}$/.test(record.asin)) {
      errors.push('ASIN_FORMAT_INVALID');
    }
    if (!record.product_name) {
      errors.push('PRODUCT_NAME_REQUIRED');
    }
    return errors;
  }

  function validate(records) {
    var byKey = {};
    var order = [];
    var errors = [];
    var warnings = [];

    for (var i = 0; i < records.length; i += 1) {
      var record = records[i];
      var recordErrors = validateRecord(record);
      if (recordErrors.length > 0) {
        errors.push({
          row: record.source_row,
          key: record.record_key,
          codes: recordErrors
        });
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(byKey, record.record_key)) {
        warnings.push({
          row: record.source_row,
          key: record.record_key,
          code: 'DUPLICATE_KEY_LAST_ROW_WINS'
        });
      } else {
        order.push(record.record_key);
      }
      byKey[record.record_key] = record;
    }

    return {
      validRecords: order.map(function (key) { return byKey[key]; }),
      errors: errors,
      warnings: warnings
    };
  }

  return {
    validateRecord: validateRecord,
    validate: validate
  };
}());

/**
 * Project GATE - HashEngine.gs
 * 業務値だけを正規順序でSHA-256化する。取込日時はHash対象外。
 */
var HashEngine = (function () {
  'use strict';

  var HASH_FIELDS = [
    'tenant', 'asin', 'sku', 'product_name', 'manufacturer', 'image', 'profit',
    'price_lowest', 'fba_shipping', 'shipping', 'expenses', 'dimensions', 'stock',
    'jp_lowest', 'sale_price', 'amazon_fee', 'us_lowest', 'customs_duty', 'state_tax',
    'external_listing', 'amazon_jp_url', 'amazon_us_url'
  ];

  function calculate(record) {
    return Utility.sha256(Utility.stableStringify(record, HASH_FIELDS));
  }

  return {
    HASH_FIELDS: HASH_FIELDS.slice(),
    calculate: calculate
  };
}());

/**
 * Project GATE - DatabaseEngine.gs
 * Master_Databaseを一括読込し、Hash差分がある行だけをsetValuesで更新する。
 */
var DatabaseEngine = (function () {
  'use strict';

  var SHEET_NAME = 'Master_Database';
  var HEADERS = [
    'Tenant', 'Record_Key', 'ASIN', 'SKU', '商品名', 'メーカー', '画像', '利益',
    '売値_最安値', 'FBA出荷', '送料', '諸経費', 'サイズ情報', '在庫数', '登録日時',
    '日本最安値', '販売価格', '更新日時', '販売手数料', '米国最安値', '関税', '州税',
    'ツール外出品', '日本Amazon', '米国Amazon', 'Row_Hash', 'Batch_ID', 'Imported_At'
  ];

  function ensureSheet() {
    return Utility.ensureSheet(Config.getSpreadsheet(), SHEET_NAME, HEADERS);
  }

  function toRow(record) {
    return [
      record.tenant, record.record_key, record.asin, record.sku, record.product_name,
      record.manufacturer, record.image, record.profit, record.price_lowest,
      record.fba_shipping, record.shipping, record.expenses, record.dimensions, record.stock,
      record.registered_at, record.jp_lowest, record.sale_price, record.updated_at,
      record.amazon_fee, record.us_lowest, record.customs_duty, record.state_tax,
      record.external_listing, record.amazon_jp_url, record.amazon_us_url,
      record.row_hash, record.batch_id, record.imported_at
    ];
  }

  function fromRow(row) {
    return {
      tenant: row[0], record_key: row[1], asin: row[2], sku: row[3], product_name: row[4],
      manufacturer: row[5], image: row[6], profit: Number(row[7] || 0),
      price_lowest: Number(row[8] || 0), fba_shipping: Number(row[9] || 0),
      shipping: Number(row[10] || 0), expenses: Number(row[11] || 0), dimensions: row[12],
      stock: Number(row[13] || 0), registered_at: row[14], jp_lowest: Number(row[15] || 0),
      sale_price: Number(row[16] || 0), updated_at: row[17], amazon_fee: Number(row[18] || 0),
      us_lowest: Number(row[19] || 0), customs_duty: Number(row[20] || 0),
      state_tax: Number(row[21] || 0), external_listing: row[22], amazon_jp_url: row[23],
      amazon_us_url: row[24], row_hash: row[25], batch_id: row[26], imported_at: row[27]
    };
  }

  function groupContiguous(updates) {
    if (updates.length === 0) {
      return [];
    }
    updates.sort(function (a, b) { return a.rowNumber - b.rowNumber; });
    var groups = [];
    var current = { startRow: updates[0].rowNumber, rows: [updates[0].row] };
    for (var i = 1; i < updates.length; i += 1) {
      if (updates[i].rowNumber === current.startRow + current.rows.length) {
        current.rows.push(updates[i].row);
      } else {
        groups.push(current);
        current = { startRow: updates[i].rowNumber, rows: [updates[i].row] };
      }
    }
    groups.push(current);
    return groups;
  }

  function sync(records, batchId) {
    var sheet = ensureSheet();
    var existingValues = sheet.getLastRow() > 1
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues()
      : [];
    var existingByKey = {};
    for (var i = 0; i < existingValues.length; i += 1) {
      existingByKey[String(existingValues[i][1])] = {
        rowNumber: i + 2,
        hash: String(existingValues[i][25] || '')
      };
    }

    var updates = [];
    var inserts = [];
    var changedRecords = [];
    var unchanged = 0;
    for (var r = 0; r < records.length; r += 1) {
      var record = records[r];
      record.row_hash = HashEngine.calculate(record);
      record.batch_id = batchId;
      record.imported_at = Utility.nowIso();
      var existing = existingByKey[record.record_key];
      if (existing && existing.hash === record.row_hash) {
        unchanged += 1;
        continue;
      }
      var row = toRow(record);
      if (existing) {
        updates.push({ rowNumber: existing.rowNumber, row: row });
      } else {
        inserts.push(row);
      }
      changedRecords.push(record);
    }

    var groups = groupContiguous(updates);
    for (var g = 0; g < groups.length; g += 1) {
      sheet.getRange(groups[g].startRow, 1, groups[g].rows.length, HEADERS.length).setValues(groups[g].rows);
    }
    if (inserts.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, inserts.length, HEADERS.length).setValues(inserts);
    }

    return {
      inserted: inserts.length,
      updated: updates.length,
      unchanged: unchanged,
      changedRecords: changedRecords
    };
  }

  function getAllRecords() {
    var sheet = ensureSheet();
    if (sheet.getLastRow() < 2) {
      return [];
    }
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length)
      .getValues()
      .map(fromRow);
  }

  return {
    SHEET_NAME: SHEET_NAME,
    HEADERS: HEADERS.slice(),
    ensureSheet: ensureSheet,
    sync: sync,
    getAllRecords: getAllRecords,
    groupContiguous: groupContiguous
  };
}());

/**
 * Project GATE - OpportunityEngine.gs
 * MVP範囲のProfitとSEOを100点満点で別々に出力する。
 * SEOは固定費ゼロの再現可能な情報充足度スコアとし、結果をAI_Cacheへ保存する。
 */
var OpportunityEngine = (function () {
  'use strict';

  var SHEET_NAME = 'Opportunity';
  var CACHE_SHEET_NAME = 'AI_Cache';
  var SCORE_VERSION = 'mvp-v1';
  var HEADERS = [
    'Tenant', 'Record_Key', 'ASIN', 'SKU', 'Profit', 'Profit_Score',
    'SEO_Score', 'Score_Version', 'Source_Hash', 'Updated_At'
  ];
  var CACHE_HEADERS = ['Cache_Key', 'Source_Hash', 'Payload_JSON', 'Updated_At', 'Expires_At'];

  function ensureSheets() {
    return {
      opportunity: Utility.ensureSheet(Config.getSpreadsheet(), SHEET_NAME, HEADERS),
      cache: Utility.ensureSheet(Config.getSpreadsheet(), CACHE_SHEET_NAME, CACHE_HEADERS)
    };
  }

  function calculateProfitScores(records) {
    var positives = records
      .map(function (record) { return Number(record.profit || 0); })
      .filter(function (value) { return value > 0; })
      .sort(function (a, b) { return a - b; });
    return records.map(function (record) {
      var profit = Number(record.profit || 0);
      if (profit <= 0 || positives.length === 0) {
        return 0;
      }
      var rank = 0;
      for (var i = 0; i < positives.length; i += 1) {
        if (positives[i] <= profit) {
          rank = i + 1;
        }
      }
      return Math.round((rank / positives.length) * 100);
    });
  }

  function calculateSeoScore(record) {
    var score = 0;
    var titleLength = String(record.product_name || '').length;
    if (titleLength >= 20 && titleLength <= 160) {
      score += 40;
    }
    if (String(record.manufacturer || '').trim()) {
      score += 20;
    }
    if (String(record.image || '').trim()) {
      score += 20;
    }
    if (String(record.amazon_jp_url || '').trim() || String(record.amazon_us_url || '').trim()) {
      score += 20;
    }
    return score;
  }

  function seoSourceHash(record) {
    return Utility.sha256(JSON.stringify({
      product_name: record.product_name || '',
      manufacturer: record.manufacturer || '',
      image: record.image || '',
      amazon_jp_url: record.amazon_jp_url || '',
      amazon_us_url: record.amazon_us_url || '',
      version: SCORE_VERSION
    }));
  }

  function loadCache(sheet) {
    var map = {};
    if (sheet.getLastRow() < 2) {
      return map;
    }
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, CACHE_HEADERS.length).getValues();
    for (var i = 0; i < values.length; i += 1) {
      map[String(values[i][0])] = values[i];
    }
    return map;
  }

  function refresh(records) {
    var sheets = ensureSheets();
    var cache = loadCache(sheets.cache);
    var profitScores = calculateProfitScores(records);
    var now = new Date();
    var expires = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
    var outputRows = [];

    for (var i = 0; i < records.length; i += 1) {
      var record = records[i];
      var sourceHash = seoSourceHash(record);
      var cacheKey = 'seo:' + SCORE_VERSION + ':' + record.record_key;
      var cached = cache[cacheKey];
      var seoScore;
      if (cached && String(cached[1]) === sourceHash && new Date(cached[4]).getTime() > now.getTime()) {
        seoScore = JSON.parse(String(cached[2])).seoScore;
      } else {
        seoScore = calculateSeoScore(record);
        cache[cacheKey] = [
          cacheKey,
          sourceHash,
          JSON.stringify({ seoScore: seoScore }),
          now.toISOString(),
          expires
        ];
      }
      outputRows.push([
        record.tenant,
        record.record_key,
        record.asin,
        record.sku,
        Number(record.profit || 0),
        profitScores[i],
        seoScore,
        SCORE_VERSION,
        sourceHash,
        now.toISOString()
      ]);
    }

    if (sheets.opportunity.getLastRow() > 1) {
      sheets.opportunity.getRange(2, 1, sheets.opportunity.getLastRow() - 1, HEADERS.length).clearContent();
    }
    if (outputRows.length > 0) {
      sheets.opportunity.getRange(2, 1, outputRows.length, HEADERS.length).setValues(outputRows);
    }

    var cacheRows = Object.keys(cache).sort().map(function (key) { return cache[key]; });
    if (sheets.cache.getLastRow() > 1) {
      sheets.cache.getRange(2, 1, sheets.cache.getLastRow() - 1, CACHE_HEADERS.length).clearContent();
    }
    if (cacheRows.length > 0) {
      sheets.cache.getRange(2, 1, cacheRows.length, CACHE_HEADERS.length).setValues(cacheRows);
    }
    return { scored: outputRows.length, cacheEntries: cacheRows.length };
  }

  return {
    SHEET_NAME: SHEET_NAME,
    CACHE_SHEET_NAME: CACHE_SHEET_NAME,
    SCORE_VERSION: SCORE_VERSION,
    HEADERS: HEADERS.slice(),
    CACHE_HEADERS: CACHE_HEADERS.slice(),
    ensureSheets: ensureSheets,
    calculateProfitScores: calculateProfitScores,
    calculateSeoScore: calculateSeoScore,
    refresh: refresh
  };
}());

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

/**
 * Project GATE - ContractPolicyEngine.gs
 * 顧客契約、競合受入れ、独占条件を推薦前に判定する。
 */
var ContractPolicyEngine = (function () {
  'use strict';

  var CONTRACT_SHEET_NAME = 'Client_Contracts';
  var DECISION_SHEET_NAME = 'Recommendation_Decisions';
  var CONTRACT_HEADERS = [
    'Contract_ID', 'Tenant', 'Account_Type', 'Account_ID', 'Status',
    'Start_Date', 'End_Date', 'Category_Scope', 'Competitor_Group',
    'Exclusivity_Mode', 'Competitor_Acceptance', 'Benchmark_Consent', 'Updated_At'
  ];
  var DECISION_HEADERS = [
    'Decision_ID', 'Decided_At', 'Contract_ID', 'Tenant', 'Account_Type',
    'Account_ID', 'Knowledge_Key', 'Answer_Signature', 'Category', 'Allowed',
    'Reason', 'Disclosure_Required'
  ];
  var ACCOUNT_TYPES = ['SELLER', 'MANUFACTURER'];
  var STATUSES = ['ACTIVE', 'PAUSED', 'ENDED'];
  var EXCLUSIVITY_MODES = ['NONE', 'ANSWER', 'CATEGORY'];

  function ensureSheets() {
    return {
      contracts: Utility.ensureSheet(Config.getSpreadsheet(), CONTRACT_SHEET_NAME, CONTRACT_HEADERS),
      decisions: Utility.ensureSheet(Config.getSpreadsheet(), DECISION_SHEET_NAME, DECISION_HEADERS)
    };
  }

  function required(value, field) {
    var text = Utility.trim(value);
    if (!text) {
      throw Utility.createError('CONTRACT_FIELD_REQUIRED', field + 'は必須です。', { field: field });
    }
    return text;
  }

  function booleanValue(value) {
    return value === true || String(value || '').toUpperCase() === 'TRUE';
  }

  function normalizeDate(value, field, allowBlank) {
    var text = Utility.trim(value);
    if (!text && allowBlank) {
      return '';
    }
    var parsed = new Date(text + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
      throw Utility.createError('CONTRACT_DATE_INVALID', field + 'はYYYY-MM-DD形式で指定してください。');
    }
    return text;
  }

  function parseCategoryScope(value) {
    var categories = String(value || '*').split(',').map(function (item) {
      return Utility.trim(item).toUpperCase();
    }).filter(function (item) { return Boolean(item); });
    return categories.length > 0 ? categories : ['*'];
  }

  function normalizeContract(source) {
    source = source || {};
    var accountType = required(source.account_type, 'Account_Type').toUpperCase();
    var status = required(source.status, 'Status').toUpperCase();
    var exclusivity = required(source.exclusivity_mode || 'NONE', 'Exclusivity_Mode').toUpperCase();
    if (ACCOUNT_TYPES.indexOf(accountType) < 0) {
      throw Utility.createError('CONTRACT_ACCOUNT_TYPE_INVALID', '未対応のAccount_Typeです: ' + accountType);
    }
    if (STATUSES.indexOf(status) < 0) {
      throw Utility.createError('CONTRACT_STATUS_INVALID', '未対応のStatusです: ' + status);
    }
    if (EXCLUSIVITY_MODES.indexOf(exclusivity) < 0) {
      throw Utility.createError('CONTRACT_EXCLUSIVITY_INVALID', '未対応のExclusivity_Modeです: ' + exclusivity);
    }
    var startDate = normalizeDate(source.start_date, 'Start_Date', false);
    var endDate = normalizeDate(source.end_date, 'End_Date', true);
    if (endDate && endDate < startDate) {
      throw Utility.createError('CONTRACT_DATE_RANGE_INVALID', 'End_DateがStart_Dateより前です。');
    }
    return {
      contract_id: required(source.contract_id, 'Contract_ID'),
      tenant: required(source.tenant, 'Tenant').toLowerCase(),
      account_type: accountType,
      account_id: required(source.account_id, 'Account_ID'),
      status: status,
      start_date: startDate,
      end_date: endDate,
      categories: parseCategoryScope(source.category_scope),
      competitor_group: Utility.trim(source.competitor_group).toUpperCase(),
      exclusivity_mode: exclusivity,
      competitor_acceptance: booleanValue(source.competitor_acceptance),
      benchmark_consent: booleanValue(source.benchmark_consent),
      updated_at: source.updated_at || Utility.nowIso()
    };
  }

  function fromContractRow(row) {
    return normalizeContract({
      contract_id: row[0], tenant: row[1], account_type: row[2], account_id: row[3],
      status: row[4], start_date: row[5], end_date: row[6], category_scope: row[7],
      competitor_group: row[8], exclusivity_mode: row[9], competitor_acceptance: row[10],
      benchmark_consent: row[11], updated_at: row[12]
    });
  }

  function isActive(contract, dateKey) {
    if (!contract || contract.status !== 'ACTIVE') {
      return false;
    }
    return contract.start_date <= dateKey && (!contract.end_date || contract.end_date >= dateKey);
  }

  function includesCategory(contract, category) {
    var normalized = Utility.trim(category).toUpperCase();
    return contract.categories.indexOf('*') >= 0 || contract.categories.indexOf(normalized) >= 0;
  }

  function canonicalStringify(value) {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return '[' + value.map(canonicalStringify).join(',') + ']';
    }
    var keys = Object.keys(value).sort();
    return '{' + keys.map(function (key) {
      return JSON.stringify(key) + ':' + canonicalStringify(value[key]);
    }).join(',') + '}';
  }

  function answerSignature(answerPayload) {
    return Utility.sha256(canonicalStringify(answerPayload || {}));
  }

  function contractMap(contracts) {
    var map = {};
    for (var i = 0; i < contracts.length; i += 1) {
      map[contracts[i].contract_id] = contracts[i];
    }
    return map;
  }

  function allow(reason, disclosureRequired, signature) {
    return { allowed: true, reason: reason, disclosure_required: Boolean(disclosureRequired), answer_signature: signature };
  }

  function block(reason, signature) {
    return { allowed: false, reason: reason, disclosure_required: false, answer_signature: signature };
  }

  function evaluate(request, targetContract, existingAssignments, contracts) {
    request = request || {};
    existingAssignments = existingAssignments || [];
    contracts = contracts || [];
    var dateKey = normalizeDate(request.date_jst, 'Date_JST', false);
    var category = required(request.category, 'Category').toUpperCase();
    var signature = request.answer_signature || answerSignature(request.answer_payload);
    if (!isActive(targetContract, dateKey)) {
      return block('TARGET_CONTRACT_INACTIVE', signature);
    }
    if (!includesCategory(targetContract, category)) {
      return block('CATEGORY_OUT_OF_SCOPE', signature);
    }

    var byId = contractMap(contracts.concat([targetContract]));
    var disclosureRequired = false;
    for (var i = 0; i < existingAssignments.length; i += 1) {
      var assignment = existingAssignments[i];
      if (assignment.allowed === false || assignment.contract_id === targetContract.contract_id) {
        continue;
      }
      var existingContract = byId[assignment.contract_id];
      if (!isActive(existingContract, dateKey)) {
        continue;
      }
      if (!targetContract.competitor_group || targetContract.competitor_group !== existingContract.competitor_group) {
        continue;
      }
      var sameCategory = Utility.trim(assignment.category).toUpperCase() === category;
      var sameAnswer = String(assignment.answer_signature || '') === String(signature);
      if (sameCategory && (targetContract.exclusivity_mode === 'CATEGORY' || existingContract.exclusivity_mode === 'CATEGORY')) {
        return block('CATEGORY_EXCLUSIVITY_CONFLICT', signature);
      }
      if (sameAnswer && (targetContract.exclusivity_mode === 'ANSWER' || existingContract.exclusivity_mode === 'ANSWER')) {
        return block('ANSWER_EXCLUSIVITY_CONFLICT', signature);
      }
      if (sameAnswer) {
        if (!targetContract.competitor_acceptance || !existingContract.competitor_acceptance) {
          return block('COMPETITOR_ACCEPTANCE_REQUIRED', signature);
        }
        disclosureRequired = true;
      }
    }
    return allow(disclosureRequired ? 'ALLOWED_WITH_COMPETITOR_DISCLOSURE' : 'ALLOWED', disclosureRequired, signature);
  }

  function loadContracts(sheet) {
    if (sheet.getLastRow() < 2) {
      return [];
    }
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, CONTRACT_HEADERS.length).getValues().map(fromContractRow);
  }

  function loadAssignments(sheet) {
    if (sheet.getLastRow() < 2) {
      return [];
    }
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, DECISION_HEADERS.length).getValues().map(function (row) {
      return {
        decision_id: String(row[0] || ''),
        contract_id: String(row[2] || ''),
        knowledge_key: String(row[6] || ''),
        answer_signature: String(row[7] || ''),
        category: String(row[8] || ''),
        allowed: row[9] === true || String(row[9]).toUpperCase() === 'TRUE'
      };
    });
  }

  function decide(request) {
    request = request || {};
    var sheets = ensureSheets();
    var contracts = loadContracts(sheets.contracts);
    var targetId = required(request.contract_id, 'Contract_ID');
    var target = null;
    for (var i = 0; i < contracts.length; i += 1) {
      if (contracts[i].contract_id === targetId) {
        target = contracts[i];
        break;
      }
    }
    if (!target) {
      throw Utility.createError('CONTRACT_NOT_FOUND', '契約が見つかりません: ' + targetId);
    }
    var assignments = loadAssignments(sheets.decisions);
    var result = evaluate(request, target, assignments, contracts);
    var decisionId = Utility.uuid();
    var decidedAt = Utility.nowIso();
    var row = [
      decisionId, decidedAt, target.contract_id, target.tenant, target.account_type,
      target.account_id, required(request.knowledge_key, 'Knowledge_Key'),
      result.answer_signature, required(request.category, 'Category').toUpperCase(),
      result.allowed, result.reason, result.disclosure_required
    ];
    sheets.decisions.getRange(sheets.decisions.getLastRow() + 1, 1, 1, DECISION_HEADERS.length).setValues([row]);
    return {
      decision_id: decisionId,
      allowed: result.allowed,
      reason: result.reason,
      disclosure_required: result.disclosure_required,
      answer_signature: result.answer_signature
    };
  }

  return {
    CONTRACT_SHEET_NAME: CONTRACT_SHEET_NAME,
    DECISION_SHEET_NAME: DECISION_SHEET_NAME,
    CONTRACT_HEADERS: CONTRACT_HEADERS.slice(),
    DECISION_HEADERS: DECISION_HEADERS.slice(),
    ensureSheets: ensureSheets,
    normalizeContract: normalizeContract,
    isActive: isActive,
    includesCategory: includesCategory,
    answerSignature: answerSignature,
    evaluate: evaluate,
    loadContracts: loadContracts,
    loadAssignments: loadAssignments,
    decide: decide
  };
}());

function evaluateProjectGateRecommendation(request) {
  'use strict';
  return ContractPolicyEngine.decide(request);
}

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

/**
 * Project GATE - MarketplaceEngine.gs
 * 承認済みの複数EC購入先を商品へ付与する。
 * 商品自体の推薦順位には影響させず、同一商品の購入先だけを顧客負担額で整列する。
 */
var MarketplaceEngine = (function () {
  'use strict';

  var SHEET_NAME = 'Marketplace_Offers';
  var VALIDATION_SHEET_NAME = 'Marketplace_Offer_Validation';
  var HEADERS = [
    'Offer_ID', 'Tenant', 'ASIN', 'Marketplace', 'External_Product_ID', 'Product_URL',
    'Price', 'Shipping_Fee', 'Currency', 'Stock_Status', 'Delivery_Days',
    'Seller_Name', 'Approved', 'Updated_At'
  ];
  var MARKETPLACES = {
    AMAZON_JP: ['amazon.co.jp'],
    RAKUTEN_JP: ['rakuten.co.jp'],
    YAHOO_JP: ['shopping.yahoo.co.jp', 'store.shopping.yahoo.co.jp']
  };
  var STOCK_STATUSES = { IN_STOCK: true, OUT_OF_STOCK: true, UNKNOWN: true };
  var MAX_OFFERS_PER_PRODUCT = 3;
  var VALIDATION_HEADERS = [
    'Row_Number', 'Offer_ID', 'Tenant', 'ASIN', 'Marketplace',
    'Approved', 'Status', 'Error_Code', 'Details', 'Checked_At'
  ];

  function ensureSheet() {
    return Utility.ensureSheet(Config.getSpreadsheet(), SHEET_NAME, HEADERS);
  }

  function ensureValidationSheet() {
    return Utility.ensureSheet(Config.getSpreadsheet(), VALIDATION_SHEET_NAME, VALIDATION_HEADERS);
  }

  function isTrue(value) {
    return value === true || String(value || '').toUpperCase() === 'TRUE';
  }

  function hostnameFromHttpsUrl(value) {
    var url = Utility.trim(value);
    var match = /^https:\/\/([^\/?#]+)(?:[\/?#]|$)/i.exec(url);
    if (!match || match[1].indexOf('@') >= 0 || match[1].indexOf(':') >= 0) { return ''; }
    return match[1].toLowerCase().replace(/\.$/, '');
  }

  function hostAllowed(host, domains) {
    return domains.some(function (domain) {
      return host === domain || host.slice(-(domain.length + 1)) === '.' + domain;
    });
  }

  function validateUrl(marketplace, url) {
    var domains = MARKETPLACES[marketplace];
    var host = hostnameFromHttpsUrl(url);
    return Boolean(domains && host && hostAllowed(host, domains));
  }

  function nonNegativeNumber(value, field) {
    var number = Number(value === '' || value == null ? 0 : value);
    if (!isFinite(number) || number < 0) {
      throw Utility.createError('MARKETPLACE_' + field + '_INVALID', field + 'は0以上の数値で入力してください。');
    }
    return number;
  }

  function normalizeOffer(input) {
    input = input || {};
    var marketplace = Utility.trim(input.marketplace).toUpperCase();
    var asin = Utility.trim(input.asin).toUpperCase();
    var productUrl = Utility.trim(input.product_url);
    var stockStatus = Utility.trim(input.stock_status || 'UNKNOWN').toUpperCase();
    if (!Utility.trim(input.offer_id)) {
      throw Utility.createError('MARKETPLACE_OFFER_ID_REQUIRED', 'Offer_IDは必須です。');
    }
    if (!Utility.trim(input.tenant)) {
      throw Utility.createError('MARKETPLACE_TENANT_REQUIRED', 'Tenantは必須です。');
    }
    if (!MARKETPLACES[marketplace]) {
      throw Utility.createError('MARKETPLACE_UNSUPPORTED', '未対応のMarketplaceです: ' + marketplace);
    }
    if (!/^[A-Z0-9]{10}$/.test(asin)) {
      throw Utility.createError('MARKETPLACE_ASIN_INVALID', 'ASINは英数字10文字で入力してください。');
    }
    if (!validateUrl(marketplace, productUrl)) {
      throw Utility.createError('MARKETPLACE_URL_INVALID', 'Marketplaceと購入先URLのドメインが一致しません。');
    }
    if (!STOCK_STATUSES[stockStatus]) {
      throw Utility.createError('MARKETPLACE_STOCK_INVALID', 'Stock_StatusはIN_STOCK、OUT_OF_STOCK、UNKNOWNのいずれかです。');
    }
    var price = nonNegativeNumber(input.price, 'PRICE');
    if (price <= 0) {
      throw Utility.createError('MARKETPLACE_PRICE_INVALID', 'PRICEは0より大きい数値で入力してください。');
    }
    var shippingFee = nonNegativeNumber(input.shipping_fee, 'SHIPPING_FEE');
    return {
      offer_id: Utility.trim(input.offer_id),
      tenant: Utility.trim(input.tenant).toLowerCase(),
      asin: asin,
      marketplace: marketplace,
      external_product_id: Utility.trim(input.external_product_id),
      product_url: productUrl,
      price: price,
      shipping_fee: shippingFee,
      total_cost: price + shippingFee,
      currency: Utility.trim(input.currency || 'JPY').toUpperCase(),
      stock_status: stockStatus,
      delivery_days: nonNegativeNumber(input.delivery_days, 'DELIVERY_DAYS'),
      seller_name: Utility.trim(input.seller_name),
      approved: isTrue(input.approved),
      updated_at: Utility.trim(input.updated_at)
    };
  }

  function fromRow(row) {
    return normalizeOffer({
      offer_id: row[0], tenant: row[1], asin: row[2], marketplace: row[3],
      external_product_id: row[4], product_url: row[5], price: row[6],
      shipping_fee: row[7], currency: row[8], stock_status: row[9],
      delivery_days: row[10], seller_name: row[11], approved: row[12], updated_at: row[13]
    });
  }

  function rankOffers(offers) {
    return offers.slice().sort(function (left, right) {
      var leftAvailable = left.stock_status === 'OUT_OF_STOCK' ? 1 : 0;
      var rightAvailable = right.stock_status === 'OUT_OF_STOCK' ? 1 : 0;
      if (leftAvailable !== rightAvailable) { return leftAvailable - rightAvailable; }
      if (left.total_cost !== right.total_cost) { return left.total_cost - right.total_cost; }
      if (left.delivery_days !== right.delivery_days) { return left.delivery_days - right.delivery_days; }
      if (left.marketplace !== right.marketplace) { return left.marketplace.localeCompare(right.marketplace); }
      return left.offer_id.localeCompare(right.offer_id);
    }).slice(0, MAX_OFFERS_PER_PRODUCT);
  }

  function loadApprovedOffers(sheet, tenant) {
    if (!sheet || sheet.getLastRow() < 2) { return {}; }
    var normalizedTenant = Utility.trim(tenant).toLowerCase();
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
    var map = {};
    rows.forEach(function (row) {
      try {
        var offer = fromRow(row);
        if (!offer.approved || offer.tenant !== normalizedTenant) { return; }
        var key = offer.tenant + '|' + offer.asin;
        map[key] = map[key] || [];
        map[key].push(offer);
      } catch (ignoreInvalidOffer) {}
    });
    Object.keys(map).forEach(function (key) { map[key] = rankOffers(map[key]); });
    return map;
  }

  function attachOffers(records, offerMap) {
    return records.map(function (record) {
      var copy = {};
      Object.keys(record).forEach(function (key) { copy[key] = record[key]; });
      var key = Utility.trim(record.tenant).toLowerCase() + '|' + Utility.trim(record.asin).toUpperCase();
      copy.marketplace_offers = (offerMap[key] || []).map(function (offer) {
        return {
          marketplace: offer.marketplace,
          product_url: offer.product_url,
          price: offer.price,
          shipping_fee: offer.shipping_fee,
          total_cost: offer.total_cost,
          currency: offer.currency,
          stock_status: offer.stock_status,
          delivery_days: offer.delivery_days
        };
      });
      return copy;
    });
  }

  function existingKeys(rows) {
    var keys = {};
    (rows || []).forEach(function (row) {
      var key = Utility.trim(row[1]).toLowerCase() + '|' + Utility.trim(row[2]).toUpperCase() + '|' + Utility.trim(row[3]).toUpperCase();
      if (key !== '||') { keys[key] = true; }
    });
    return keys;
  }

  function buildLegacyAmazonDraftRows(records, existingRows, nowIso) {
    var keys = existingKeys(existingRows);
    var drafts = [];
    (records || []).forEach(function (record) {
      var tenant = Utility.trim(record.tenant).toLowerCase();
      var asin = Utility.trim(record.asin).toUpperCase();
      var url = Utility.trim(record.amazon_jp_url);
      var key = tenant + '|' + asin + '|AMAZON_JP';
      if (!tenant || !/^[A-Z0-9]{10}$/.test(asin) || !validateUrl('AMAZON_JP', url) || keys[key]) { return; }
      var price = Number(record.sale_price || record.jp_lowest || record.price_lowest || 0);
      var shipping = Math.max(0, Number(record.shipping || 0));
      drafts.push([
        'LEGACY-AMAZON-' + tenant + '-' + asin, tenant, asin, 'AMAZON_JP', asin, url,
        price > 0 ? price : '', shipping, 'JPY', Number(record.stock || 0) > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
        '', '', false, Utility.trim(record.updated_at || record.imported_at || nowIso)
      ]);
      keys[key] = true;
    });
    return drafts;
  }

  function createLegacyAmazonDrafts() {
    var sheet = ensureSheet();
    var existing = sheet.getLastRow() > 1
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues() : [];
    var records = DatabaseEngine.getAllRecords();
    var drafts = buildLegacyAmazonDraftRows(records, existing, Utility.nowIso());
    if (drafts.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, drafts.length, HEADERS.length).setValues(drafts);
    }
    return { added: drafts.length, skipped: records.length - drafts.length };
  }

  function validateRows(rows, checkedAt) {
    var reportRows = [];
    var summary = { approved_valid: 0, approved_invalid: 0, draft_valid: 0, draft_incomplete: 0 };
    (rows || []).forEach(function (row, index) {
      var approved = isTrue(row[12]);
      var status = approved ? 'PASS' : 'DRAFT_READY';
      var code = '';
      var details = approved ? '公開可能' : 'ApprovedをTRUEにすると公開可能';
      try {
        fromRow(row);
        if (approved) { summary.approved_valid += 1; } else { summary.draft_valid += 1; }
      } catch (error) {
        code = error.code || 'MARKETPLACE_INVALID';
        details = error.message || String(error);
        if (approved) {
          status = 'FAIL';
          summary.approved_invalid += 1;
        } else {
          status = 'DRAFT_INCOMPLETE';
          summary.draft_incomplete += 1;
        }
      }
      reportRows.push([
        index + 2, row[0], row[1], row[2], row[3], approved, status, code, details, checkedAt
      ]);
    });
    return { rows: reportRows, summary: summary };
  }

  function validateSheet(sheet) {
    sheet = sheet || ensureSheet();
    var rows = sheet.getLastRow() > 1
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues() : [];
    return validateRows(rows, Utility.nowIso());
  }

  function refreshValidation() {
    var result = validateSheet(ensureSheet());
    var validationSheet = ensureValidationSheet();
    if (validationSheet.getLastRow() > 1) {
      validationSheet.getRange(2, 1, validationSheet.getLastRow() - 1, VALIDATION_HEADERS.length).clearContent();
    }
    if (result.rows.length > 0) {
      validationSheet.getRange(2, 1, result.rows.length, VALIDATION_HEADERS.length).setValues(result.rows);
    }
    return result.summary;
  }

  return {
    SHEET_NAME: SHEET_NAME,
    VALIDATION_SHEET_NAME: VALIDATION_SHEET_NAME,
    HEADERS: HEADERS.slice(),
    VALIDATION_HEADERS: VALIDATION_HEADERS.slice(),
    MARKETPLACES: MARKETPLACES,
    MAX_OFFERS_PER_PRODUCT: MAX_OFFERS_PER_PRODUCT,
    ensureSheet: ensureSheet,
    ensureValidationSheet: ensureValidationSheet,
    validateUrl: validateUrl,
    normalizeOffer: normalizeOffer,
    rankOffers: rankOffers,
    loadApprovedOffers: loadApprovedOffers,
    attachOffers: attachOffers,
    buildLegacyAmazonDraftRows: buildLegacyAmazonDraftRows,
    createLegacyAmazonDrafts: createLegacyAmazonDrafts,
    validateRows: validateRows,
    validateSheet: validateSheet,
    refreshValidation: refreshValidation
  };
}());

function refreshProjectGateMarketplaceOffers() {
  'use strict';
  var drafts = MarketplaceEngine.createLegacyAmazonDrafts();
  var validation = MarketplaceEngine.refreshValidation();
  SpreadsheetApp.getUi().alert(
    '購入先の下書き作成・検証が完了しました。\n' +
    '追加: ' + drafts.added + '件\n' +
    '承認済み有効: ' + validation.approved_valid + '件\n' +
    '承認済みエラー: ' + validation.approved_invalid + '件\n' +
    '未完成下書き: ' + validation.draft_incomplete + '件'
  );
  return { drafts: drafts, validation: validation };
}

/**
 * Project GATE - MultilingualSeoEngine.gs
 * 日本語・英語・中国語・韓国語とローマ字検索用コンテンツを管理する。
 */
var MultilingualSeoEngine = (function () {
  'use strict';

  var ALIAS_SHEET_NAME = 'Search_Alias';
  var CONTENT_SHEET_NAME = 'Localized_Content';
  var SCORE_SHEET_NAME = 'Multilingual_SEO';
  var ALIAS_HEADERS = ['Tenant', 'ASIN', 'Alias', 'Language', 'Source', 'Approved', 'Updated_At'];
  var CONTENT_HEADERS = [
    'Tenant', 'ASIN', 'Language', 'Display_Name', 'Description', 'Keywords',
    'Source', 'Approved', 'Updated_At'
  ];
  var SCORE_HEADERS = [
    'Tenant', 'ASIN', 'Product_Name', 'Auto_Romaji', 'Approved_Romaji_Count',
    'Approved_English_Count', 'Approved_Chinese_Count', 'Approved_Korean_Count',
    'Multilingual_SEO_Score', 'Missing_Actions', 'Updated_At'
  ];
  var SUPPORTED_LANGUAGES = ['JA', 'EN', 'ZH', 'KO', 'ROMAJI'];

  var BASIC = {
    'あ':'a','い':'i','う':'u','え':'e','お':'o','か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko',
    'さ':'sa','し':'shi','す':'su','せ':'se','そ':'so','た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to',
    'な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no','は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
    'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo','や':'ya','ゆ':'yu','よ':'yo',
    'ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro','わ':'wa','を':'o','ん':'n',
    'が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go','ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo',
    'だ':'da','ぢ':'ji','づ':'zu','で':'de','ど':'do','ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo',
    'ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po','ぁ':'a','ぃ':'i','ぅ':'u','ぇ':'e','ぉ':'o'
  };
  var PAIRS = {
    'きゃ':'kya','きゅ':'kyu','きょ':'kyo','しゃ':'sha','しゅ':'shu','しょ':'sho',
    'ちゃ':'cha','ちゅ':'chu','ちょ':'cho','にゃ':'nya','にゅ':'nyu','にょ':'nyo',
    'ひゃ':'hya','ひゅ':'hyu','ひょ':'hyo','みゃ':'mya','みゅ':'myu','みょ':'myo',
    'りゃ':'rya','りゅ':'ryu','りょ':'ryo','ぎゃ':'gya','ぎゅ':'gyu','ぎょ':'gyo',
    'じゃ':'ja','じゅ':'ju','じょ':'jo','びゃ':'bya','びゅ':'byu','びょ':'byo',
    'ぴゃ':'pya','ぴゅ':'pyu','ぴょ':'pyo','ふぁ':'fa','ふぃ':'fi','ふぇ':'fe','ふぉ':'fo',
    'てぃ':'ti','でぃ':'di','うぃ':'wi','うぇ':'we','うぉ':'wo','しぇ':'she','ちぇ':'che','じぇ':'je'
  };

  function ensureSheets() {
    return {
      aliases: Utility.ensureSheet(Config.getSpreadsheet(), ALIAS_SHEET_NAME, ALIAS_HEADERS),
      content: Utility.ensureSheet(Config.getSpreadsheet(), CONTENT_SHEET_NAME, CONTENT_HEADERS),
      scores: Utility.ensureSheet(Config.getSpreadsheet(), SCORE_SHEET_NAME, SCORE_HEADERS)
    };
  }

  function toHiragana(value) {
    return String(value || '').replace(/[ァ-ヶ]/g, function (char) {
      return String.fromCharCode(char.charCodeAt(0) - 0x60);
    });
  }

  function lastVowel(value) {
    var match = String(value || '').match(/[aeiou](?!.*[aeiou])/);
    return match ? match[0] : '';
  }

  function romanizeText(value) {
    var text = toHiragana(value).toLowerCase();
    var output = '';
    var geminate = false;
    for (var i = 0; i < text.length; i += 1) {
      var char = text.charAt(i);
      if (char === 'っ') {
        geminate = true;
        continue;
      }
      if (char === 'ー') {
        output += lastVowel(output);
        continue;
      }
      var pair = text.slice(i, i + 2);
      var romaji = PAIRS[pair];
      if (romaji) {
        i += 1;
      } else {
        romaji = BASIC[char];
      }
      if (romaji) {
        if (geminate && /^[bcdfghjklmnpqrstvwxyz]/.test(romaji)) {
          output += romaji.charAt(0);
        }
        output += romaji;
        geminate = false;
      } else if (/[a-z0-9]/.test(char)) {
        output += char;
      } else {
        output += ' ';
        geminate = false;
      }
    }
    return output.replace(/\s+/g, ' ').trim();
  }

  function normalizeAliasRow(row) {
    return {
      tenant: Utility.trim(row[0]).toLowerCase(),
      asin: Utility.trim(row[1]).toUpperCase(),
      alias: Utility.trim(row[2]),
      language: Utility.trim(row[3]).toUpperCase(),
      source: Utility.trim(row[4]),
      approved: row[5] === true || String(row[5]).toUpperCase() === 'TRUE',
      updated_at: row[6]
    };
  }

  function loadApprovedAliases(sheet, tenant) {
    var byAsin = {};
    if (sheet.getLastRow() < 2) {
      return byAsin;
    }
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, ALIAS_HEADERS.length).getValues();
    for (var i = 0; i < rows.length; i += 1) {
      var alias = normalizeAliasRow(rows[i]);
      if (!alias.approved || SUPPORTED_LANGUAGES.indexOf(alias.language) < 0 || alias.tenant !== String(tenant || '').toLowerCase() || !alias.asin || !alias.alias) {
        continue;
      }
      if (!byAsin[alias.asin]) { byAsin[alias.asin] = []; }
      byAsin[alias.asin].push(alias);
    }
    return byAsin;
  }

  function loadApprovedContent(sheet, tenant, language) {
    var byAsin = {};
    if (sheet.getLastRow() < 2) {
      return byAsin;
    }
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, CONTENT_HEADERS.length).getValues();
    var normalizedTenant = String(tenant || '').toLowerCase();
    var normalizedLanguage = String(language || 'JA').toUpperCase();
    for (var i = 0; i < rows.length; i += 1) {
      var approved = rows[i][7] === true || String(rows[i][7]).toUpperCase() === 'TRUE';
      if (!approved || Utility.trim(rows[i][0]).toLowerCase() !== normalizedTenant || Utility.trim(rows[i][2]).toUpperCase() !== normalizedLanguage) {
        continue;
      }
      var asin = Utility.trim(rows[i][1]).toUpperCase();
      if (!asin) { continue; }
      byAsin[asin] = {
        language: normalizedLanguage,
        display_name: Utility.trim(rows[i][3]),
        description: Utility.trim(rows[i][4]),
        keywords: Utility.trim(rows[i][5]),
        source: Utility.trim(rows[i][6]),
        updated_at: rows[i][8]
      };
    }
    return byAsin;
  }

  function attachAliases(records, aliasMap) {
    return records.map(function (record) {
      var copy = {};
      Object.keys(record).forEach(function (key) { copy[key] = record[key]; });
      copy.search_aliases = (aliasMap[String(record.asin || '').toUpperCase()] || []).map(function (item) {
        return item.alias;
      });
      return copy;
    });
  }

  function attachLocalizedContent(records, contentMap, language) {
    return records.map(function (record) {
      var copy = {};
      Object.keys(record).forEach(function (key) { copy[key] = record[key]; });
      var localized = contentMap[String(record.asin || '').toUpperCase()] || null;
      copy.requested_language = String(language || 'JA').toUpperCase();
      copy.localized_content = localized;
      if (localized) {
        copy.search_aliases = (copy.search_aliases || []).concat([
          localized.display_name, localized.description, localized.keywords
        ].filter(function (value) { return Boolean(value); }));
      }
      return copy;
    });
  }

  function detectLanguage(value) {
    var text = String(value || '');
    if (/[\uac00-\ud7af]/.test(text)) { return 'KO'; }
    if (/[\u3040-\u30ff]/.test(text)) { return 'JA'; }
    if (/[\u3400-\u9fff]/.test(text)) { return 'ZH'; }
    if (/[a-z]/i.test(text)) { return 'EN'; }
    return 'JA';
  }

  function scoreRecord(record, aliases) {
    aliases = aliases || [];
    var romajiCount = aliases.filter(function (item) { return item.language === 'ROMAJI'; }).length;
    var englishCount = aliases.filter(function (item) { return item.language === 'EN'; }).length;
    var chineseCount = aliases.filter(function (item) { return item.language === 'ZH'; }).length;
    var koreanCount = aliases.filter(function (item) { return item.language === 'KO'; }).length;
    var autoRomaji = romanizeText(record.product_name || '');
    var score = 0;
    if (autoRomaji.length >= 3) { score += 10; }
    if (romajiCount > 0) { score += 20; }
    if (englishCount > 0) { score += 25; }
    if (chineseCount > 0) { score += 20; }
    if (koreanCount > 0) { score += 20; }
    if (/[a-z]/i.test(String(record.manufacturer || ''))) { score += 5; }
    var missing = [];
    if (!autoRomaji) { missing.push('商品名にカナ読みを追加'); }
    if (romajiCount === 0) { missing.push('承認済みローマ字別名を追加'); }
    if (englishCount === 0) { missing.push('承認済み英語別名を追加'); }
    if (chineseCount === 0) { missing.push('承認済み中国語別名を追加'); }
    if (koreanCount === 0) { missing.push('承認済み韓国語別名を追加'); }
    return {
      auto_romaji: autoRomaji, romaji_count: romajiCount, english_count: englishCount,
      chinese_count: chineseCount, korean_count: koreanCount, score: score, missing: missing
    };
  }

  function refresh() {
    var sheets = ensureSheets();
    var records = DatabaseEngine.getAllRecords();
    var aliasCache = {};
    var rows = [];
    var now = Utility.nowIso();
    for (var i = 0; i < records.length; i += 1) {
      var tenant = String(records[i].tenant || '').toLowerCase();
      if (!aliasCache[tenant]) {
        aliasCache[tenant] = loadApprovedAliases(sheets.aliases, tenant);
      }
      var aliases = aliasCache[tenant][String(records[i].asin || '').toUpperCase()] || [];
      var result = scoreRecord(records[i], aliases);
      rows.push([
        tenant, records[i].asin, records[i].product_name, result.auto_romaji,
        result.romaji_count, result.english_count, result.chinese_count,
        result.korean_count, result.score,
        result.missing.join(' / '), now
      ]);
    }
    if (sheets.scores.getLastRow() > 1) {
      sheets.scores.getRange(2, 1, sheets.scores.getLastRow() - 1, SCORE_HEADERS.length).clearContent();
    }
    if (rows.length > 0) {
      sheets.scores.getRange(2, 1, rows.length, SCORE_HEADERS.length).setValues(rows);
    }
    return { scored: rows.length };
  }

  return {
    ALIAS_SHEET_NAME: ALIAS_SHEET_NAME,
    CONTENT_SHEET_NAME: CONTENT_SHEET_NAME,
    SCORE_SHEET_NAME: SCORE_SHEET_NAME,
    ALIAS_HEADERS: ALIAS_HEADERS.slice(),
    CONTENT_HEADERS: CONTENT_HEADERS.slice(),
    SCORE_HEADERS: SCORE_HEADERS.slice(),
    ensureSheets: ensureSheets,
    romanizeText: romanizeText,
    detectLanguage: detectLanguage,
    loadApprovedAliases: loadApprovedAliases,
    loadApprovedContent: loadApprovedContent,
    attachAliases: attachAliases,
    attachLocalizedContent: attachLocalizedContent,
    scoreRecord: scoreRecord,
    refresh: refresh
  };
}());

function refreshProjectGateMultilingualSeo() {
  'use strict';
  return MultilingualSeoEngine.refresh();
}

/**
 * Project GATE - ProductIdentifierEngine.gs
 * 日本語商品マスターのASINへJAN / EAN / UPCを承認制で紐付ける。
 */
var ProductIdentifierEngine = (function () {
  'use strict';

  var SHEET_NAME = 'Product_Identifiers';
  var COVERAGE_SHEET_NAME = 'Identifier_Coverage';
  var CONFLICT_SHEET_NAME = 'Identifier_Conflicts';
  var HEADERS = ['Tenant', 'ASIN', 'Identifier_Type', 'Identifier_Value', 'Source', 'Approved', 'Updated_At'];
  var COVERAGE_HEADERS = [
    'Tenant', 'ASIN', 'Product_Name', 'Approved_Identifier_Count',
    'Identifier_Types', 'Missing_Action', 'Updated_At'
  ];
  var CONFLICT_HEADERS = ['Tenant', 'Identifier_Value', 'ASINs', 'Status', 'Updated_At'];
  var TYPES = ['JAN', 'EAN', 'UPC'];

  function ensureSheets() {
    return {
      identifiers: Utility.ensureSheet(Config.getSpreadsheet(), SHEET_NAME, HEADERS),
      coverage: Utility.ensureSheet(Config.getSpreadsheet(), COVERAGE_SHEET_NAME, COVERAGE_HEADERS),
      conflicts: Utility.ensureSheet(Config.getSpreadsheet(), CONFLICT_SHEET_NAME, CONFLICT_HEADERS)
    };
  }

  function normalizeIdentifier(value) {
    var text = Utility.trim(value).replace(/[\s-]/g, '');
    if (!/^\d{8,14}$/.test(text)) {
      throw Utility.createError('IDENTIFIER_FORMAT_INVALID', '商品コードは8〜14桁の数字で入力してください。');
    }
    return text;
  }

  function hasValidCheckDigit(value) {
    var code;
    try {
      code = normalizeIdentifier(value);
    } catch (error) {
      return false;
    }
    if ([8, 12, 13, 14].indexOf(code.length) < 0) { return false; }
    var sum = 0;
    var position = 0;
    for (var i = code.length - 2; i >= 0; i -= 1) {
      sum += Number(code.charAt(i)) * (position % 2 === 0 ? 3 : 1);
      position += 1;
    }
    return (10 - (sum % 10)) % 10 === Number(code.charAt(code.length - 1));
  }

  function validateType(type, value) {
    type = Utility.trim(type).toUpperCase();
    var code = normalizeIdentifier(value);
    if (TYPES.indexOf(type) < 0) {
      throw Utility.createError('IDENTIFIER_TYPE_INVALID', '未対応の商品コード種別です: ' + type);
    }
    if (!hasValidCheckDigit(code)) {
      throw Utility.createError('IDENTIFIER_CHECK_DIGIT_INVALID', '商品コードのチェックディジットが不正です: ' + code);
    }
    if (type === 'JAN' && (code.length !== 13 || !/^(45|49)/.test(code))) {
      throw Utility.createError('JAN_FORMAT_INVALID', 'JANは45または49で始まる13桁を指定してください。');
    }
    if (type === 'UPC' && code.length !== 12) {
      throw Utility.createError('UPC_FORMAT_INVALID', 'UPCは12桁を指定してください。');
    }
    if (type === 'EAN' && [8, 13, 14].indexOf(code.length) < 0) {
      throw Utility.createError('EAN_FORMAT_INVALID', 'EANは8、13、14桁を指定してください。');
    }
    return code;
  }

  function normalizeRow(row, rowNumber) {
    var approved = row[5] === true || String(row[5]).toUpperCase() === 'TRUE';
    var result = {
      tenant: Utility.trim(row[0]).toLowerCase(),
      asin: Utility.trim(row[1]).toUpperCase(),
      type: Utility.trim(row[2]).toUpperCase(),
      value: Utility.trim(row[3]),
      source: Utility.trim(row[4]),
      approved: approved,
      updated_at: row[6],
      row_number: rowNumber
    };
    if (!approved) { return result; }
    if (!result.tenant || !/^[A-Z0-9]{10}$/.test(result.asin)) {
      throw Utility.createError('IDENTIFIER_TARGET_INVALID', '承認済み商品コードのTenantまたはASINが不正です。', { row: rowNumber });
    }
    result.value = validateType(result.type, result.value);
    return result;
  }

  function loadApproved(sheet, tenant) {
    var result = [];
    if (sheet.getLastRow() < 2) { return result; }
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
    var targetTenant = tenant == null ? '' : Utility.trim(tenant).toLowerCase();
    for (var i = 0; i < rows.length; i += 1) {
      var item = normalizeRow(rows[i], i + 2);
      if (item.approved && (!targetTenant || item.tenant === targetTenant)) { result.push(item); }
    }
    return result;
  }

  function buildIndex(mappings) {
    var index = {};
    for (var i = 0; i < mappings.length; i += 1) {
      var item = mappings[i];
      var key = item.tenant + '|' + item.value;
      if (!index[key]) { index[key] = []; }
      if (index[key].indexOf(item.asin) < 0) { index[key].push(item.asin); }
    }
    return index;
  }

  function findConflicts(mappings) {
    var index = buildIndex(mappings);
    return Object.keys(index).sort().filter(function (key) {
      return index[key].length > 1;
    }).map(function (key) {
      var separator = key.indexOf('|');
      return {
        tenant: key.slice(0, separator), identifier: key.slice(separator + 1),
        asins: index[key].slice().sort()
      };
    });
  }

  function lookup(records, mappings, tenant, value) {
    var code = normalizeIdentifier(value);
    if (!hasValidCheckDigit(code)) {
      throw Utility.createError('IDENTIFIER_CHECK_DIGIT_INVALID', '商品コードのチェックディジットが不正です。');
    }
    var normalizedTenant = Utility.trim(tenant).toLowerCase();
    var asins = buildIndex(mappings)[normalizedTenant + '|' + code] || [];
    if (asins.length === 0) { return { status: 'NOT_FOUND', identifier: code, records: [] }; }
    if (asins.length > 1) {
      return { status: 'AMBIGUOUS', identifier: code, asins: asins.slice(), records: [] };
    }
    var matched = records.filter(function (record) {
      return String(record.tenant || '').toLowerCase() === normalizedTenant &&
        String(record.asin || '').toUpperCase() === asins[0];
    });
    if (matched.length !== 1) {
      return { status: 'MASTER_MISMATCH', identifier: code, asins: asins.slice(), records: [] };
    }
    return { status: 'FOUND', identifier: code, asins: asins.slice(), records: matched };
  }

  function lookupForTenant(tenant, value) {
    var sheets = ensureSheets();
    return lookup(
      DatabaseEngine.getAllRecords(),
      loadApproved(sheets.identifiers, tenant),
      tenant,
      value
    );
  }

  function refreshCoverage() {
    var sheets = ensureSheets();
    var mappings = loadApproved(sheets.identifiers, null);
    var byProduct = {};
    for (var i = 0; i < mappings.length; i += 1) {
      var key = mappings[i].tenant + '|' + mappings[i].asin;
      if (!byProduct[key]) { byProduct[key] = []; }
      byProduct[key].push(mappings[i]);
    }
    var now = Utility.nowIso();
    var rows = DatabaseEngine.getAllRecords().map(function (record) {
      var tenant = String(record.tenant || '').toLowerCase();
      var items = byProduct[tenant + '|' + String(record.asin || '').toUpperCase()] || [];
      var types = {};
      items.forEach(function (item) { types[item.type] = true; });
      return [
        tenant, record.asin, record.product_name, items.length,
        Object.keys(types).sort().join(','),
        items.length > 0 ? '' : 'JAN/EAN/UPCを確認し、承認済み識別子を追加', now
      ];
    });
    if (sheets.coverage.getLastRow() > 1) {
      sheets.coverage.getRange(2, 1, sheets.coverage.getLastRow() - 1, COVERAGE_HEADERS.length).clearContent();
    }
    if (rows.length > 0) {
      sheets.coverage.getRange(2, 1, rows.length, COVERAGE_HEADERS.length).setValues(rows);
    }
    var conflicts = findConflicts(mappings).map(function (conflict) {
      return [conflict.tenant, conflict.identifier, conflict.asins.join(','), 'BLOCKED', now];
    });
    if (sheets.conflicts.getLastRow() > 1) {
      sheets.conflicts.getRange(2, 1, sheets.conflicts.getLastRow() - 1, CONFLICT_HEADERS.length).clearContent();
    }
    if (conflicts.length > 0) {
      sheets.conflicts.getRange(2, 1, conflicts.length, CONFLICT_HEADERS.length).setValues(conflicts);
    }
    return {
      products: rows.length,
      covered: rows.filter(function (row) { return row[3] > 0; }).length,
      conflicts: conflicts.length
    };
  }

  return {
    SHEET_NAME: SHEET_NAME,
    COVERAGE_SHEET_NAME: COVERAGE_SHEET_NAME,
    CONFLICT_SHEET_NAME: CONFLICT_SHEET_NAME,
    HEADERS: HEADERS.slice(),
    COVERAGE_HEADERS: COVERAGE_HEADERS.slice(),
    CONFLICT_HEADERS: CONFLICT_HEADERS.slice(),
    ensureSheets: ensureSheets,
    normalizeIdentifier: normalizeIdentifier,
    hasValidCheckDigit: hasValidCheckDigit,
    validateType: validateType,
    normalizeRow: normalizeRow,
    loadApproved: loadApproved,
    buildIndex: buildIndex,
    findConflicts: findConflicts,
    lookup: lookup,
    lookupForTenant: lookupForTenant,
    refreshCoverage: refreshCoverage
  };
}());

function refreshProjectGateIdentifierCoverage() {
  'use strict';
  return ProductIdentifierEngine.refreshCoverage();
}

/**
 * Project GATE - KnowledgeEngine.gs
 * エンドユーザーの質問と商品情報を照合し、根拠付き候補を返す。
 * 利益はランキングへ使用せず、質問との関連性・情報充足・在庫だけを使う。
 */
var KnowledgeEngine = (function () {
  'use strict';

  var QUERY_LOG_SHEET_NAME = 'Knowledge_Query_Log';
  var QUERY_LOG_HEADERS = [
    'Query_ID', 'Queried_At', 'Tenant', 'Account_Type', 'Account_ID',
    'Contract_ID', 'Query_Hash', 'Language', 'Category', 'Result_Count', 'Confidence',
    'Decision_ID', 'Status'
  ];
  var MAX_RESULTS = 3;
  var MIN_RELEVANCE = 0.2;

  function ensureSheet() {
    return Utility.ensureSheet(Config.getSpreadsheet(), QUERY_LOG_SHEET_NAME, QUERY_LOG_HEADERS);
  }

  function normalizeText(value) {
    var text = String(value == null ? '' : value).toLowerCase();
    if (text.normalize) {
      text = text.normalize('NFKC');
    }
    return text.replace(/[\s　]+/g, ' ').trim();
  }

  function tokenize(value) {
    var text = normalizeText(value);
    var tokens = [];
    var ascii = text.match(/[a-z0-9]{2,}/g) || [];
    tokens = tokens.concat(ascii);
    var japanese = text.match(/[\u3040-\u30ff\u3400-\u9fffー]{2,}/g) || [];
    for (var i = 0; i < japanese.length; i += 1) {
      var segment = japanese[i];
      tokens.push(segment);
      for (var j = 0; j < segment.length - 1; j += 1) {
        tokens.push(segment.slice(j, j + 2));
      }
    }
    var korean = text.match(/[\uac00-\ud7af]{2,}/g) || [];
    for (var k = 0; k < korean.length; k += 1) {
      tokens.push(korean[k]);
      for (var h = 0; h < korean[k].length - 1; h += 1) {
        tokens.push(korean[k].slice(h, h + 2));
      }
    }
    var seen = {};
    return tokens.filter(function (token) {
      if (!token || seen[token]) {
        return false;
      }
      seen[token] = true;
      return true;
    });
  }

  function informationScore(record) {
    var score = 0;
    if (Utility.trim(record.product_name)) { score += 30; }
    if (Utility.trim(record.manufacturer)) { score += 20; }
    if (Utility.trim(record.image)) { score += 20; }
    if ((record.marketplace_offers || []).length > 0 || Utility.trim(record.amazon_jp_url) || Utility.trim(record.amazon_us_url)) { score += 20; }
    if (Number(record.stock || 0) > 0) { score += 10; }
    return score;
  }

  function confidenceFor(relevance) {
    if (relevance >= 0.65) { return 'HIGH'; }
    if (relevance >= 0.35) { return 'MEDIUM'; }
    return 'LOW';
  }

  function scoreRecord(queryTokens, normalizedQuery, record) {
    var baseText = [
      record.product_name || '', record.manufacturer || '', record.asin || '', record.sku || '',
      (record.search_aliases || []).join(' ')
    ].join(' ');
    var searchable = normalizeText([
      baseText, MultilingualSeoEngine.romanizeText(baseText)
    ].join(' '));
    var matched = [];
    for (var i = 0; i < queryTokens.length; i += 1) {
      if (searchable.indexOf(queryTokens[i]) >= 0) {
        matched.push(queryTokens[i]);
      }
    }
    var relevance = queryTokens.length > 0 ? matched.length / queryTokens.length : 0;
    if (normalizedQuery.length >= 2 && searchable.indexOf(normalizedQuery) >= 0) {
      relevance = 1;
    }
    var info = informationScore(record);
    var matchScore = Math.round((relevance * 85 + (info / 100) * 15) * 100) / 100;
    return {
      record: record,
      relevance: relevance,
      match_score: matchScore,
      confidence: confidenceFor(relevance),
      matched_terms: matched,
      information_score: info
    };
  }

  function search(query, records, limit) {
    var normalizedQuery = normalizeText(query);
    if (normalizedQuery.length < 2) {
      throw Utility.createError('KNOWLEDGE_QUERY_TOO_SHORT', '質問は2文字以上で入力してください。');
    }
    var queryTokens = tokenize(normalizedQuery);
    if (queryTokens.length === 0) {
      throw Utility.createError('KNOWLEDGE_QUERY_EMPTY', '検索可能な語句がありません。');
    }
    var scored = records.map(function (record) {
      return scoreRecord(queryTokens, normalizedQuery, record);
    }).filter(function (item) {
      return item.relevance >= MIN_RELEVANCE;
    });
    scored.sort(function (left, right) {
      if (right.match_score !== left.match_score) { return right.match_score - left.match_score; }
      if (right.information_score !== left.information_score) { return right.information_score - left.information_score; }
      return String(left.record.asin || '').localeCompare(String(right.record.asin || ''));
    });
    return scored.slice(0, Math.min(Number(limit || MAX_RESULTS), MAX_RESULTS)).map(function (item, index) {
      return {
        rank: index + 1,
        asin: item.record.asin,
        sku: item.record.sku || '',
        product_name: item.record.product_name,
        display_name: item.record.localized_content && item.record.localized_content.display_name
          ? item.record.localized_content.display_name : item.record.product_name,
        description: item.record.localized_content ? item.record.localized_content.description : '',
        language: item.record.requested_language || 'JA',
        manufacturer: item.record.manufacturer || '',
        image: item.record.image || '',
        stock: Number(item.record.stock || 0),
        amazon_jp_url: item.record.amazon_jp_url || '',
        amazon_us_url: item.record.amazon_us_url || '',
        offers: (item.record.marketplace_offers || []).slice(0, MarketplaceEngine.MAX_OFFERS_PER_PRODUCT),
        match_score: item.match_score,
        confidence: item.confidence,
        evidence: {
          matched_terms: item.matched_terms,
          information_score: item.information_score,
          source_hash: item.record.row_hash || '',
          imported_at: item.record.imported_at || ''
        }
      };
    });
  }

  function findContract(contractId) {
    var sheets = ContractPolicyEngine.ensureSheets();
    var contracts = ContractPolicyEngine.loadContracts(sheets.contracts);
    for (var i = 0; i < contracts.length; i += 1) {
      if (contracts[i].contract_id === contractId) {
        return contracts[i];
      }
    }
    throw Utility.createError('CONTRACT_NOT_FOUND', '契約が見つかりません: ' + contractId);
  }

  function writeQueryLog(values) {
    var sheet = ensureSheet();
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, QUERY_LOG_HEADERS.length).setValues([values]);
  }

  function filterRecordsByTenant(records, tenant) {
    var normalizedTenant = String(tenant || '').toLowerCase();
    return records.filter(function (record) {
      return String(record.tenant || '').toLowerCase() === normalizedTenant;
    });
  }

  function answer(request) {
    request = request || {};
    if (request.consent !== true) {
      throw Utility.createError('KNOWLEDGE_CONSENT_REQUIRED', '質問処理には利用同意が必要です。');
    }
    var query = Utility.trim(request.query);
    var category = Utility.trim(request.category).toUpperCase();
    if (!category) {
      throw Utility.createError('KNOWLEDGE_CATEGORY_REQUIRED', 'Categoryは必須です。');
    }
    var contract = findContract(Utility.trim(request.contract_id));
    var allRecords = DatabaseEngine.getAllRecords();
    var tenantRecords = filterRecordsByTenant(allRecords, contract.tenant);
    var offerSheet = MarketplaceEngine.ensureSheet();
    var offerMap = MarketplaceEngine.loadApprovedOffers(offerSheet, contract.tenant);
    tenantRecords = MarketplaceEngine.attachOffers(tenantRecords, offerMap);
    var aliasSheets = MultilingualSeoEngine.ensureSheets();
    var aliasMap = MultilingualSeoEngine.loadApprovedAliases(aliasSheets.aliases, contract.tenant);
    tenantRecords = MultilingualSeoEngine.attachAliases(tenantRecords, aliasMap);
    var language = MultilingualSeoEngine.detectLanguage(query);
    var contentMap = MultilingualSeoEngine.loadApprovedContent(aliasSheets.content, contract.tenant, language);
    tenantRecords = MultilingualSeoEngine.attachLocalizedContent(tenantRecords, contentMap, language);
    var candidates = search(query, tenantRecords, MAX_RESULTS);
    var queryId = Utility.uuid();
    var queriedAt = Utility.nowIso();
    var queryHash = Utility.sha256(normalizeText(query));
    var dateJst = new Date(new Date(queriedAt).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

    if (candidates.length === 0) {
      writeQueryLog([
        queryId, queriedAt, contract.tenant, contract.account_type, contract.account_id,
        contract.contract_id, queryHash, language, category, 0, '', '', 'NO_MATCH'
      ]);
      return {
        query_id: queryId,
        status: 'NO_MATCH',
        language: language,
        message: localizedMessage('NO_MATCH', language),
        candidates: []
      };
    }

    var policy = ContractPolicyEngine.decide({
      contract_id: contract.contract_id,
      date_jst: dateJst,
      category: category,
      knowledge_key: queryHash,
      answer_payload: candidates.map(function (candidate) {
        return { asin: candidate.asin, rank: candidate.rank, evidence: candidate.evidence.source_hash };
      })
    });
    var status = policy.allowed ? 'ANSWERED' : 'BLOCKED_BY_POLICY';
    writeQueryLog([
      queryId, queriedAt, contract.tenant, contract.account_type, contract.account_id,
      contract.contract_id, queryHash, language, category, policy.allowed ? candidates.length : 0,
      candidates[0].confidence, policy.decision_id, status
    ]);
    return {
      query_id: queryId,
      status: status,
      language: language,
      message: localizedMessage(policy.allowed ? 'ANSWERED' : 'BLOCKED', language),
      disclosure_required: policy.disclosure_required,
      policy_reason: policy.reason,
      candidates: policy.allowed ? candidates : []
    };
  }

  function localizedMessage(status, language) {
    var messages = {
      JA: {
        ANSWERED: '質問との関連性と確認可能な商品情報を基に候補を表示します。',
        NO_MATCH: '確認できる根拠が不足しているため、商品を推薦できません。',
        BLOCKED: '契約・競合ポリシーにより、この回答は表示できません。'
      },
      EN: {
        ANSWERED: 'Here are products supported by the available product data.',
        NO_MATCH: 'I could not find enough verified information to recommend a product.',
        BLOCKED: 'This answer cannot be displayed under the contract and competition policy.'
      },
      ZH: {
        ANSWERED: '以下商品候选基于您的问题和已确认的商品信息。',
        NO_MATCH: '没有足够的已确认信息，因此无法推荐商品。',
        BLOCKED: '根据合同及竞争政策，无法显示此回答。'
      },
      KO: {
        ANSWERED: '질문과 확인된 상품 정보를 바탕으로 후보 상품을 안내합니다.',
        NO_MATCH: '확인된 정보가 부족하여 상품을 추천할 수 없습니다.',
        BLOCKED: '계약 및 경쟁 정책에 따라 이 답변을 표시할 수 없습니다.'
      }
    };
    var selected = messages[language] || messages.JA;
    return selected[status];
  }

  return {
    QUERY_LOG_SHEET_NAME: QUERY_LOG_SHEET_NAME,
    QUERY_LOG_HEADERS: QUERY_LOG_HEADERS.slice(),
    ensureSheet: ensureSheet,
    normalizeText: normalizeText,
    tokenize: tokenize,
    informationScore: informationScore,
    filterRecordsByTenant: filterRecordsByTenant,
    localizedMessage: localizedMessage,
    search: search,
    answer: answer
  };
}());

function buildProjectGateKnowledgeAnswer(request) {
  'use strict';
  return KnowledgeEngine.answer(request);
}

/**
 * Project GATE - LineIntegration.gs
 * Cloudflare Workerで署名検証済みのLINEイベントを受け取り、Knowledge回答とKPI計測を行う。
 * LINEのChannel Secret / Access TokenはGASへ保存しない。
 */
var LineIntegration = (function () {
  'use strict';

  var EVENT_SHEET_NAME = 'LINE_Event_Log';
  var EVENT_HEADERS = [
    'Webhook_Event_ID', 'Received_At', 'Event_Type', 'User_Hash', 'Message_Hash',
    'Status', 'Response_JSON', 'Finished_At', 'Error_Code'
  ];
  var PROPERTY_BRIDGE_SECRET = 'LINE_BRIDGE_SECRET';
  var PROPERTY_CONTRACT_ID = 'LINE_CONTRACT_ID';
  var PROPERTY_DEFAULT_CATEGORY = 'LINE_DEFAULT_CATEGORY';
  var PROPERTY_PWA_CONTRACT_ID = 'PWA_CONTRACT_ID';
  var PROPERTY_PWA_DEFAULT_CATEGORY = 'PWA_DEFAULT_CATEGORY';
  var CHANNELS = ['LINE', 'PWA'];
  var TRACK_EVENT_TYPES = ['IMPRESSION', 'CLICK', 'OUTBOUND'];

  function ensureSheet() {
    return Utility.ensureSheet(Config.getSpreadsheet(), EVENT_SHEET_NAME, EVENT_HEADERS);
  }

  function getRequiredProperty(name) {
    var value = Utility.trim(PropertiesService.getScriptProperties().getProperty(name));
    if (!value) {
      throw Utility.createError('LINE_PROPERTY_MISSING', 'Script Propertyが未設定です: ' + name);
    }
    return value;
  }

  function secureEquals(left, right) {
    left = String(left || '');
    right = String(right || '');
    var mismatch = left.length ^ right.length;
    var length = Math.max(left.length, right.length);
    for (var i = 0; i < length; i += 1) {
      mismatch |= (left.charCodeAt(i % Math.max(left.length, 1)) || 0) ^
        (right.charCodeAt(i % Math.max(right.length, 1)) || 0);
    }
    return mismatch === 0;
  }

  function verifyBridgeSecret(received) {
    var expectedHash = Utility.sha256(getRequiredProperty(PROPERTY_BRIDGE_SECRET));
    var receivedHash = Utility.sha256(String(received || ''));
    if (!secureEquals(expectedHash, receivedHash)) {
      throw Utility.createError('LINE_BRIDGE_UNAUTHORIZED', 'LINE Bridgeの認証に失敗しました。');
    }
  }

  function findExistingEvent(sheet, webhookEventId) {
    if (sheet.getLastRow() < 2) { return null; }
    var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    for (var i = ids.length - 1; i >= 0; i -= 1) {
      if (String(ids[i][0]) === webhookEventId) {
        var rowNumber = i + 2;
        var values = sheet.getRange(rowNumber, 1, 1, EVENT_HEADERS.length).getValues()[0];
        return {
          row_number: rowNumber, received_at: String(values[1] || ''),
          status: String(values[5] || ''), response_json: String(values[6] || '')
        };
      }
    }
    return null;
  }

  function appendStarted(sheet, event) {
    var source = event.source || {};
    var userId = Utility.trim(source.userId || source.groupId || source.roomId);
    var messageText = event.message && event.message.type === 'text' ? String(event.message.text || '') : '';
    var row = [
      Utility.trim(event.webhookEventId), Utility.nowIso(), Utility.trim(event.type).toUpperCase(),
      userId ? Utility.sha256(userId) : '', messageText ? Utility.sha256(messageText) : '',
      'STARTED', '', '', ''
    ];
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, EVENT_HEADERS.length).setValues([row]);
    return sheet.getLastRow();
  }

  function finish(sheet, rowNumber, status, response, errorCode) {
    sheet.getRange(rowNumber, 6, 1, 4).setValues([[
      status, Utility.safeJson(response || {}), Utility.nowIso(), errorCode || ''
    ]]);
  }

  function localizedHelp(language, welcome) {
    var copy = {
      JA: welcome
        ? 'P-GATEへようこそ。探している商品を日本語・英語・中国語・韓国語・ローマ字で送ってください。'
        : '探している商品を文章で送ってください。例：アメリカのシリアルが食べたい',
      EN: welcome
        ? 'Welcome to P-GATE. Ask for a product in Japanese, English, Chinese, Korean, or romaji.'
        : 'Tell me what product you are looking for. Example: I want a breakfast cereal.',
      ZH: welcome
        ? '欢迎使用P-GATE。请用日语、英语、中文、韩语或罗马字描述您想找的商品。'
        : '请用一句话描述您想找的商品。例如：我想找早餐麦片。',
      KO: welcome
        ? 'P-GATE에 오신 것을 환영합니다. 일본어, 영어, 중국어, 한국어 또는 로마자로 상품을 찾아보세요.'
        : '찾고 있는 상품을 문장으로 보내 주세요. 예: 아침 시리얼을 찾고 있어요.'
    };
    return copy[language] || copy.JA;
  }

  function responseForEvent(event) {
    var eventType = Utility.trim(event.type).toLowerCase();
    if (eventType === 'follow') {
      return { status: 'WELCOME', language: 'JA', message: localizedHelp('JA', true), candidates: [] };
    }
    if (eventType !== 'message' || !event.message || event.message.type !== 'text') {
      return { status: 'HELP', language: 'JA', message: localizedHelp('JA', false), candidates: [] };
    }
    var query = Utility.trim(event.message.text);
    var language = MultilingualSeoEngine.detectLanguage(query);
    if (query.length < 2) {
      return { status: 'HELP', language: language, message: localizedHelp(language, false), candidates: [] };
    }
    return KnowledgeEngine.answer({
      query: query,
      category: getRequiredProperty(PROPERTY_DEFAULT_CATEGORY),
      contract_id: getRequiredProperty(PROPERTY_CONTRACT_ID),
      consent: true
    });
  }

  function handleEvent(event) {
    event = event || {};
    var webhookEventId = Utility.trim(event.webhookEventId);
    if (!webhookEventId) {
      throw Utility.createError('LINE_EVENT_ID_REQUIRED', 'webhookEventIdは必須です。');
    }
    var sheet = ensureSheet();
    var existing = findExistingEvent(sheet, webhookEventId);
    if (existing && existing.status === 'SUCCESS' && existing.response_json) {
      return JSON.parse(existing.response_json);
    }
    if (existing && existing.status === 'STARTED') {
      var startedAt = new Date(existing.received_at).getTime();
      if (isFinite(startedAt) && Date.now() - startedAt < 10 * 60 * 1000) {
        return { status: 'PROCESSING', language: 'JA', message: '', candidates: [] };
      }
    }
    var rowNumber = appendStarted(sheet, event);
    try {
      var response = responseForEvent(event);
      finish(sheet, rowNumber, 'SUCCESS', response, '');
      return response;
    } catch (error) {
      var safeResponse = {
        status: 'ERROR', language: 'JA',
        message: '現在回答を作成できません。時間をおいて、もう一度お試しください。', candidates: []
      };
      finish(sheet, rowNumber, 'FAILED', safeResponse, error.code || 'UNEXPECTED_ERROR');
      throw error;
    }
  }

  function channelProperty(channel, lineProperty, pwaProperty) {
    channel = Utility.trim(channel).toUpperCase();
    if (CHANNELS.indexOf(channel) < 0) {
      throw Utility.createError('CHANNEL_INVALID', '未対応のチャネルです: ' + channel);
    }
    return getRequiredProperty(channel === 'PWA' ? pwaProperty : lineProperty);
  }

  function answerPublic(request) {
    request = request || {};
    if (request.consent !== true) {
      throw Utility.createError('PWA_CONSENT_REQUIRED', '質問処理には利用同意が必要です。');
    }
    var query = Utility.trim(request.query);
    if (query.length < 2 || query.length > 200) {
      throw Utility.createError('PWA_QUERY_LENGTH_INVALID', '質問は2〜200文字で入力してください。');
    }
    return KnowledgeEngine.answer({
      query: query,
      category: channelProperty('PWA', PROPERTY_DEFAULT_CATEGORY, PROPERTY_PWA_DEFAULT_CATEGORY),
      contract_id: channelProperty('PWA', PROPERTY_CONTRACT_ID, PROPERTY_PWA_CONTRACT_ID),
      consent: true
    });
  }

  function findConfiguredContract(channel) {
    var contractId = channelProperty(channel, PROPERTY_CONTRACT_ID, PROPERTY_PWA_CONTRACT_ID);
    var sheets = ContractPolicyEngine.ensureSheets();
    var contracts = ContractPolicyEngine.loadContracts(sheets.contracts);
    for (var i = 0; i < contracts.length; i += 1) {
      if (contracts[i].contract_id === contractId) { return contracts[i]; }
    }
    throw Utility.createError('LINE_CONTRACT_NOT_FOUND', 'LINE用契約が見つかりません。');
  }

  function track(events, channel) {
    if (!Array.isArray(events) || events.length === 0 || events.length > 100) {
      throw Utility.createError('LINE_TRACK_BATCH_INVALID', 'LINE計測イベントは1〜100件で指定してください。');
    }
    channel = Utility.trim(channel || 'LINE').toUpperCase();
    var contract = findConfiguredContract(channel);
    var normalized = events.map(function (event) {
      var eventType = Utility.trim(event.event_type).toUpperCase();
      if (TRACK_EVENT_TYPES.indexOf(eventType) < 0) {
        throw Utility.createError('LINE_TRACK_TYPE_INVALID', '未対応のLINE計測種別です: ' + eventType);
      }
      return {
        event_id: Utility.trim(event.event_id), occurred_at: event.occurred_at || Utility.nowIso(),
        tenant: contract.tenant, account_type: contract.account_type,
        account_id: contract.account_id, session_id: Utility.trim(event.user_hash),
        recommendation_id: Utility.trim(event.recommendation_id), campaign_id: channel + '_PILOT',
        experiment_variant: 'P_GATE', asin: Utility.trim(event.asin), event_type: eventType,
        consent: true, source: channel
      };
    });
    return MeasurementEngine.record(normalized);
  }

  function handleBridge(payload) {
    payload = payload || {};
    verifyBridgeSecret(payload.bridge_secret);
    var action = Utility.trim(payload.action).toUpperCase();
    if (action === 'EVENT') { return handleEvent(payload.event); }
    if (action === 'KNOWLEDGE') { return answerPublic(payload.request); }
    if (action === 'TRACK') { return track(payload.events, payload.channel || 'LINE'); }
    throw Utility.createError('LINE_ACTION_INVALID', '未対応のLINE Bridge actionです。');
  }

  return {
    EVENT_SHEET_NAME: EVENT_SHEET_NAME,
    EVENT_HEADERS: EVENT_HEADERS.slice(),
    PROPERTY_BRIDGE_SECRET: PROPERTY_BRIDGE_SECRET,
    PROPERTY_CONTRACT_ID: PROPERTY_CONTRACT_ID,
    PROPERTY_DEFAULT_CATEGORY: PROPERTY_DEFAULT_CATEGORY,
    PROPERTY_PWA_CONTRACT_ID: PROPERTY_PWA_CONTRACT_ID,
    PROPERTY_PWA_DEFAULT_CATEGORY: PROPERTY_PWA_DEFAULT_CATEGORY,
    ensureSheet: ensureSheet,
    secureEquals: secureEquals,
    localizedHelp: localizedHelp,
    responseForEvent: responseForEvent,
    answerPublic: answerPublic,
    handleEvent: handleEvent,
    track: track,
    handleBridge: handleBridge
  };
}());

function doPost(e) {
  'use strict';
  var output;
  try {
    var payload = JSON.parse(e && e.postData ? e.postData.contents : '{}');
    output = { ok: true, result: LineIntegration.handleBridge(payload) };
  } catch (error) {
    output = { ok: false, error: { code: error.code || 'UNEXPECTED_ERROR', message: error.message || String(error) } };
  }
  return ContentService.createTextOutput(JSON.stringify(output)).setMimeType(ContentService.MimeType.JSON);
}

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

/**
 * Project GATE - Main.gs
 * トリガーの入口とパイプライン制御だけを担当する。
 */
var PROJECT_GATE_MAX_FILES_PER_RUN = 1;

function runProjectGate() {
  'use strict';

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return;
  }

  try {
    Config.validate();
    var recoveredCount = ImportLog.recoverStaleStarted(30);
    if (recoveredCount > 0) {
      AppLogger.startBatch('SYSTEM');
      AppLogger.warn('STALE_EXECUTION_RECOVERED', '未完了の取込ログを失敗として確定しました。', {
        recovered: recoveredCount
      });
      AppLogger.flush();
    }
    var files = DriveService.listInputZipFiles();
    if (files.length === 0) {
      // 5分ごとの空振りを永続ログへ残すと、1日288件の不要ログになるため記録しない。
      return;
    }

    // 大容量ZIPを同一実行で連続処理するとGASの実行時間上限に達する。
    // 残りは次の5分トリガーへ委ね、必ず古いZIPから1件ずつ処理する。
    var runCount = Math.min(files.length, PROJECT_GATE_MAX_FILES_PER_RUN);
    for (var i = 0; i < runCount; i += 1) {
      processZipFile_(files[i]);
    }
  } finally {
    lock.releaseLock();
  }
}

function processZipFile_(file) {
  'use strict';

  if (ImportLog.hasSucceeded(file.getId())) {
    return;
  }

  var batchId = Utility.uuid();
  var importLogRow;
  var tenant = '';
  var csvCount = 0;
  var readRows = 0;
  var validRows = 0;
  var errorCount = 0;

  AppLogger.startBatch(batchId);
  importLogRow = ImportLog.begin(batchId, file);
  AppLogger.info('BATCH_STARTED', 'ZIP取込を開始しました。', {
    fileId: file.getId(),
    fileName: file.getName()
  });

  try {
    var extracted = ZipEngine.extract(file, batchId);
    tenant = extracted.tenant;
    csvCount = extracted.csvFiles.length;
    AppLogger.info('ZIP_EXTRACTED', 'ZIPを解凍しました。', extracted);

    var targetAsins = getMvpTargetAsins_();
    var targetMap = {};
    targetAsins.forEach(function (asin) { targetMap[asin] = true; });
    var selectedRows = [];
    var selectedHeaders = [];

    for (var c = 0; c < extracted.csvFiles.length && selectedRows.length < 100; c += 1) {
      var remaining = 100 - selectedRows.length;
      var sourceIndex = null;
      var csvResult = ImportEngine.readCsv(extracted.csvFiles[c].id, {
        encoding: 'Shift_JIS',
        limit: remaining,
        acceptRecord: function (header, row) {
          if (targetAsins.length === 0) {
            return true;
          }
          if (sourceIndex === null) {
            sourceIndex = MappingEngine.findAsinIndex(header);
          }
          return Boolean(targetMap[Utility.trim(row[sourceIndex]).toUpperCase()]);
        }
      });
      readRows += csvResult.scannedRows;
      for (var s = 0; s < csvResult.rows.length; s += 1) {
        selectedRows.push(csvResult.rows[s]);
        selectedHeaders.push(csvResult.header);
      }
    }

    if (selectedRows.length === 0) {
      throw Utility.createError('MVP_TARGET_NOT_FOUND', 'MVP対象商品をCSVから取得できませんでした。');
    }
    if (selectedRows.length < 100) {
      AppLogger.warn('MVP_TARGET_SHORTAGE', 'MVP対象が100件未満です。', {
        selected: selectedRows.length,
        configuredTargets: targetAsins.length
      });
    }

    var mappedRows = [];
    var cachedHeader = null;
    var cachedIndex = null;
    for (var r = 0; r < selectedRows.length; r += 1) {
      var headerKey = JSON.stringify(selectedHeaders[r]);
      if (headerKey !== cachedHeader) {
        cachedHeader = headerKey;
        cachedIndex = MappingEngine.buildIndex(selectedHeaders[r]);
      }
      mappedRows.push(MappingEngine.mapRow(
        selectedRows[r],
        cachedIndex,
        selectedRows[r].__sourceRowNumber || (r + 2)
      ));
    }

    var normalized = NormalizeEngine.normalizeAll(mappedRows, tenant, batchId);
    var validation = ValidationEngine.validate(normalized);
    validRows = validation.validRecords.length;
    errorCount = validation.errors.length;
    if (validation.errors.length > 0) {
      AppLogger.warn('VALIDATION_ERRORS', '無効行をMaster更新から除外しました。', validation.errors);
    }
    if (validation.warnings.length > 0) {
      AppLogger.warn('VALIDATION_WARNINGS', '重複キーを検出しました。', validation.warnings);
    }
    if (validRows === 0) {
      throw Utility.createError('NO_VALID_RECORDS', '有効な商品データがありません。');
    }

    var syncResult = DatabaseEngine.sync(validation.validRecords, batchId);
    // OpportunityはMVPの「対象100商品」に限定する。
    // Master_Databaseには過去バッチ・複数tenantの履歴を保持するため、全件を再採点しない。
    var opportunityResult = OpportunityEngine.refresh(validation.validRecords);
    AppLogger.info('DATABASE_SYNCED', 'Master Databaseを同期しました。', syncResult);
    AppLogger.info('OPPORTUNITY_UPDATED', 'Opportunityを更新しました。', opportunityResult);

    DriveService.moveFile(file, Config.getRequired('ARCHIVE_FOLDER_ID'));
    ImportLog.finish(importLogRow, {
      tenant: tenant,
      status: 'SUCCESS',
      csvCount: csvCount,
      readRows: readRows,
      validRows: validRows,
      inserted: syncResult.inserted,
      updated: syncResult.updated,
      unchanged: syncResult.unchanged,
      errorCount: errorCount
    });
    AppLogger.info('BATCH_SUCCEEDED', 'ZIP取込が完了しました。');
  } catch (error) {
    AppLogger.error('BATCH_FAILED', 'ZIP取込に失敗しました。', error);
    try {
      DriveService.moveFile(file, Config.getRequired('ERROR_FOLDER_ID'));
    } catch (moveError) {
      AppLogger.error('ERROR_MOVE_FAILED', 'ZIPを04_Errorへ移動できませんでした。', moveError);
    }
    ImportLog.finish(importLogRow, {
      tenant: tenant,
      status: 'FAILED',
      csvCount: csvCount,
      readRows: readRows,
      validRows: validRows,
      errorCount: errorCount + 1,
      errorCode: error.code || 'UNEXPECTED_ERROR',
      errorMessage: error.message || String(error)
    });
  } finally {
    AppLogger.flush();
  }
}

function getMvpTargetAsins_() {
  'use strict';

  var spreadsheet = Config.getSpreadsheet();
  var sheet = spreadsheet.getSheetByName('MVP_Target');
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.min(2, sheet.getLastColumn())).getValues();
  var seen = {};
  var result = [];
  for (var i = 0; i < values.length && result.length < 100; i += 1) {
    var asin = Utility.trim(values[i][0]).toUpperCase();
    var enabled = values[i].length < 2 || values[i][1] === '' || values[i][1] === true || String(values[i][1]).toUpperCase() === 'TRUE';
    if (asin && enabled && !seen[asin]) {
      seen[asin] = true;
      result.push(asin);
    }
  }
  return result;
}

/**
 * 初回だけ手動実行する。Configと各出力シートを作成する。
 */
function setupProjectGate() {
  'use strict';

  Config.ensureTemplate();
  ImportLog.ensureSheet();
  AppLogger.ensureSheet();
  DatabaseEngine.ensureSheet();
  OpportunityEngine.ensureSheets();
  MeasurementEngine.ensureSheets();
  ContractPolicyEngine.ensureSheets();
  BenchmarkEngine.ensureSheet();
  MarketplaceEngine.ensureSheet();
  MarketplaceEngine.ensureValidationSheet();
  MultilingualSeoEngine.ensureSheets();
  ProductIdentifierEngine.ensureSheets();
  KnowledgeEngine.ensureSheet();
  LineIntegration.ensureSheet();
  PreflightEngine.ensureSheet();
  Utility.ensureSheet(Config.getSpreadsheet(), 'MVP_Target', ['ASIN', 'Enabled', 'Note']);
  SpreadsheetApp.getUi().alert(
    '初期シートを作成しました。Configシートの5つのFolder IDを入力してから、runProjectGateを実行してください。'
  );
}

/**
 * Google Driveには「ファイル追加」ネイティブトリガーがないため、MVPは5分監視を採用する。
 */
function installProjectGateTrigger() {
  'use strict';

  uninstallProjectGateTrigger();
  ScriptApp.newTrigger('runProjectGate').timeBased().everyMinutes(5).create();
}

function uninstallProjectGateTrigger() {
  'use strict';

  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i += 1) {
    if (triggers[i].getHandlerFunction() === 'runProjectGate') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

function onOpen() {
  'use strict';

  SpreadsheetApp.getUi()
    .createMenu('Project GATE')
    .addItem('初期設定を作成', 'setupProjectGate')
    .addItem('今すぐ実行', 'runProjectGate')
    .addItem('KPI集計を更新', 'refreshProjectGateKpiSummary')
    .addItem('匿名ベンチマークを更新', 'refreshProjectGateAnonymousBenchmark')
    .addItem('複数EC購入先を準備・検証', 'refreshProjectGateMarketplaceOffers')
    .addItem('多言語SEOを更新', 'refreshProjectGateMultilingualSeo')
    .addItem('商品コード整備状況を更新', 'refreshProjectGateIdentifierCoverage')
    .addItem('公開前チェック', 'runProjectGatePreflight')
    .addItem('5分トリガーを設定', 'installProjectGateTrigger')
    .addItem('トリガーを解除', 'uninstallProjectGateTrigger')
    .addToUi();
}
