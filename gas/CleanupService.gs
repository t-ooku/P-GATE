/**
 * Project GATE - CleanupService.gs
 * Google Drive上の処理済み・一時ファイルを保持期限に従って整理する。
 */
var CleanupService = (function () {
  'use strict';

  function getPositiveInteger_(key, defaultValue) {
    var value = Number(Config.get(key, defaultValue));
    if (!isFinite(value) || value < 0) {
      return Number(defaultValue);
    }
    return Math.floor(value);
  }

  function isEnabled_(key, defaultValue) {
    var value = String(Config.get(key, defaultValue ? 'TRUE' : 'FALSE')).toUpperCase();
    return value !== 'FALSE' && value !== '0' && value !== 'NO';
  }

  function trashOlderThan_(folderId, retentionDays, nowMillis) {
    var folder = DriveService.getFolder(folderId);
    var files = folder.getFiles();
    var threshold = nowMillis - retentionDays * 24 * 60 * 60 * 1000;
    var deleted = 0;

    while (files.hasNext()) {
      var file = files.next();
      var updatedAt = file.getLastUpdated().getTime();
      if (updatedAt < threshold) {
        file.setTrashed(true);
        deleted += 1;
      }
    }
    return deleted;
  }

  function keepNewest_(folderId, keepCount) {
    var folder = DriveService.getFolder(folderId);
    var iterator = folder.getFiles();
    var files = [];
    while (iterator.hasNext()) {
      files.push(iterator.next());
    }
    files.sort(function (left, right) {
      return right.getLastUpdated().getTime() - left.getLastUpdated().getTime();
    });

    var deleted = 0;
    for (var i = Math.max(0, keepCount); i < files.length; i += 1) {
      files[i].setTrashed(true);
      deleted += 1;
    }
    return deleted;
  }

  function run() {
    if (!isEnabled_('ENABLE_AUTO_CLEANUP', true)) {
      return { enabled: false, archiveDeleted: 0, errorDeleted: 0, logDeleted: 0, extractedDeleted: 0 };
    }

    var nowMillis = new Date().getTime();
    var result = {
      enabled: true,
      archiveDeleted: trashOlderThan_(
        Config.getRequired('ARCHIVE_FOLDER_ID'),
        getPositiveInteger_('ARCHIVE_RETENTION_DAYS', 7),
        nowMillis
      ),
      errorDeleted: trashOlderThan_(
        Config.getRequired('ERROR_FOLDER_ID'),
        getPositiveInteger_('ERROR_RETENTION_DAYS', 30),
        nowMillis
      ),
      logDeleted: trashOlderThan_(
        Config.getRequired('LOG_FOLDER_ID'),
        getPositiveInteger_('LOG_RETENTION_DAYS', 30),
        nowMillis
      ),
      extractedDeleted: keepNewest_(
        Config.getRequired('EXTRACT_FOLDER_ID'),
        getPositiveInteger_('EXTRACT_KEEP_FILES', 1)
      )
    };

    return result;
  }

  return {
    run: run,
    trashOlderThan_: trashOlderThan_,
    keepNewest_: keepNewest_
  };
}());