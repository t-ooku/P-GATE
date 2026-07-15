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
