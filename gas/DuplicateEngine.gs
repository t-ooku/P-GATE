/**
 * Project GATE - DuplicateEngine.gs
 * ZIP内容のSHA-256を使って重複取込を防止する。
 */
var DuplicateEngine = (function () {
  'use strict';

  var PROPERTY_PREFIX = 'PROCESSED_ZIP_SHA256_';

  function calculateFileHash(file) {
    if (!file) {
      throw Utility.createError('DUPLICATE_FILE_MISSING', '重複判定対象のZIPがありません。');
    }
    return Utility.sha256(file.getBlob().getBytes());
  }

  function propertyKey_(hash) {
    return PROPERTY_PREFIX + String(hash || '').toUpperCase();
  }

  function isProcessedHash(hash) {
    if (!hash) {
      return false;
    }
    return Boolean(PropertiesService.getScriptProperties().getProperty(propertyKey_(hash)));
  }

  function inspect(file) {
    var hash = calculateFileHash(file);
    return {
      hash: hash,
      duplicate: isProcessedHash(hash),
      fileId: file.getId(),
      fileName: file.getName(),
      fileSize: file.getSize()
    };
  }

  function markProcessed(file, hash) {
    var resolvedHash = hash || calculateFileHash(file);
    PropertiesService.getScriptProperties().setProperty(
      propertyKey_(resolvedHash),
      JSON.stringify({
        fileId: file.getId(),
        fileName: file.getName(),
        fileSize: file.getSize(),
        processedAt: Utility.nowIso()
      })
    );
    return resolvedHash;
  }

  return {
    calculateFileHash: calculateFileHash,
    isProcessedHash: isProcessedHash,
    inspect: inspect,
    markProcessed: markProcessed
  };
}());
