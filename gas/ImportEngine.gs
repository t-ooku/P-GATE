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
