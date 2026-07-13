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
      SYSTEM_VERSION: '1.0.0'
    };
    var rows = [];
    for (var j = 0; j < REQUIRED_KEYS.length; j += 1) {
      var key = REQUIRED_KEYS[j];
      rows.push([
        key,
        existing[key] ? existing[key][1] : defaults[key],
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

  return {
    SHEET_NAME: SHEET_NAME,
    HEADERS: HEADERS.slice(),
    ensureSheet: ensureSheet,
    hasSucceeded: hasSucceeded,
    begin: begin,
    finish: finish
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
 * Project GATE - Main.gs
 * トリガーの入口とパイプライン制御だけを担当する。
 */
function runProjectGate() {
  'use strict';

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return;
  }

  try {
    Config.validate();
    var files = DriveService.listInputZipFiles();
    if (files.length === 0) {
      AppLogger.startBatch('SYSTEM');
      AppLogger.info('NO_INPUT', '処理対象ZIPはありません。');
      AppLogger.flush();
      return;
    }

    for (var i = 0; i < files.length; i += 1) {
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
    var opportunityResult = OpportunityEngine.refresh(DatabaseEngine.getAllRecords());
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
    .addItem('5分トリガーを設定', 'installProjectGateTrigger')
    .addItem('トリガーを解除', 'uninstallProjectGateTrigger')
    .addToUi();
}
