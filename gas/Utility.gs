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
