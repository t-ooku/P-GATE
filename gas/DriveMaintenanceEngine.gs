/**
 * ==========================================================
 * Project GATE
 * DriveMaintenanceEngine.gs
 * ----------------------------------------------------------
 * Google Driveメンテナンス
 *
 * ・Input ZIP整理
 * ・Archive整理
 * ・Error整理
 * ・Log整理
 *
 * ==========================================================
 */

var DriveMaintenanceEngine = (function () {
  'use strict';

  var DEFAULT_KEEP_COUNT = 30;

  /**
   * メンテナンス実行
   */
  function execute() {

    AppLogger.info(
      'DRIVE_MAINTENANCE_START',
      'Drive Maintenance開始'
    );

    Config.validate();

    cleanupInputFolder();
    cleanupArchiveFolder();
    cleanupErrorFolder();
    cleanupLogFolder();

    AppLogger.info(
      'DRIVE_MAINTENANCE_FINISH',
      'Drive Maintenance終了'
    );
  }

  /**
   * Input ZIP整理
   */
  function cleanupInputFolder() {

    cleanupFolder(
      Config.getRequired('INPUT_FOLDER_ID'),
      DEFAULT_KEEP_COUNT,
      'INPUT'
    );

  }

  /**
   * Archive整理
   */
  function cleanupArchiveFolder() {

    cleanupFolder(
      Config.getRequired('ARCHIVE_FOLDER_ID'),
      DEFAULT_KEEP_COUNT,
      'ARCHIVE'
    );

  }

  /**
   * Error整理
   */
  function cleanupErrorFolder() {

    cleanupFolder(
      Config.getRequired('ERROR_FOLDER_ID'),
      DEFAULT_KEEP_COUNT,
      'ERROR'
    );

  }

  /**
   * Log整理
   */
  function cleanupLogFolder() {

    cleanupFolder(
      Config.getRequired('LOG_FOLDER_ID'),
      DEFAULT_KEEP_COUNT,
      'LOG'
    );

  }
    /**
   * フォルダ整理
   */
  function cleanupFolder(folderId, keepCount, category) {

    var folder = DriveService.getFolder(folderId);

    var iterator = folder.getFiles();

    var files = [];

    while (iterator.hasNext()) {
      files.push(iterator.next());
    }

    files.sort(function (a, b) {
      return b.getDateCreated().getTime() - a.getDateCreated().getTime();
    });

    if (files.length <= keepCount) {

      AppLogger.info(
        'DRIVE_SKIP',
        category + ' は整理不要',
        {
          count: files.length
        }
      );

      return;
    }

    for (var i = keepCount; i < files.length; i++) {

      var file = files[i];

      try {

var dryRun =
  String(Config.get('DRIVE_MAINTENANCE_DRY_RUN', 'TRUE')).toUpperCase() !== 'FALSE';

if (!dryRun) {
  file.setTrashed(true);
}

        AppLogger.info(
          dryRun ? 'FILE_DELETE_DRY_RUN' : 'FILE_DELETED',
          file.getName(),
          {
            folder: category,
            id: file.getId()
          }
        );

      } catch (e) {

        AppLogger.error(
          'DELETE_ERROR',
          file.getName(),
          e
        );

      }

    }

  }
    /**
   * 保持件数取得
   */
  function getKeepCount() {

    var value = Config.get('MAX_MAINTENANCE_FILES', '');

    if (!value) {
      return DEFAULT_KEEP_COUNT;
    }

    var count = Number(value);

    if (isNaN(count) || count < 1) {
      return DEFAULT_KEEP_COUNT;
    }

    return Math.floor(count);

  }

  /**
   * メンテナンス実行（保持件数をConfigから取得）
   */
  function executeWithConfig() {

    AppLogger.info(
      'DRIVE_MAINTENANCE_START',
      'Drive Maintenance開始'
    );

    Config.validate();

    var keepCount = getKeepCount();

    cleanupFolder(
      Config.getRequired('INPUT_FOLDER_ID'),
      keepCount,
      'INPUT'
    );

    cleanupFolder(
      Config.getRequired('ARCHIVE_FOLDER_ID'),
      keepCount,
      'ARCHIVE'
    );

    cleanupFolder(
      Config.getRequired('ERROR_FOLDER_ID'),
      keepCount,
      'ERROR'
    );

    cleanupFolder(
      Config.getRequired('LOG_FOLDER_ID'),
      keepCount,
      'LOG'
    );

    AppLogger.info(
      'DRIVE_MAINTENANCE_FINISH',
      'Drive Maintenance終了'
    );

  }
    /**
   * 外部公開API
   */
  return {
    execute: execute,
    executeWithConfig: executeWithConfig,
    cleanupInputFolder: cleanupInputFolder,
    cleanupArchiveFolder: cleanupArchiveFolder,
    cleanupErrorFolder: cleanupErrorFolder,
    cleanupLogFolder: cleanupLogFolder
  };

})();
/**
 * Drive Maintenance 安全テスト
 * 初期値はDRY RUNのため、ファイルを削除しない。
 */
function runDriveMaintenanceDryRun() {
  var batchId = 'drive-maintenance-dry-run-' + Utilities.getUuid();

  AppLogger.startBatch(batchId);

  try {
    AppLogger.info(
      'DRIVE_MAINTENANCE_DRY_RUN_START',
      'Drive MaintenanceのDRY RUNを開始します。',
      { batchId: batchId }
    );

    DriveMaintenanceEngine.executeWithConfig();

    AppLogger.info(
      'DRIVE_MAINTENANCE_DRY_RUN_SUCCESS',
      'Drive MaintenanceのDRY RUNが完了しました。',
      { batchId: batchId }
    );
  } catch (error) {
    AppLogger.error(
      'DRIVE_MAINTENANCE_DRY_RUN_ERROR',
      'Drive MaintenanceのDRY RUNでエラーが発生しました。',
      error
    );
    throw error;
  } finally {
    AppLogger.flush();
  }
}