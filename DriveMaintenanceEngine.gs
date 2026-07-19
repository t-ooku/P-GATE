/**
 * Project GATE - DriveMaintenanceEngine.gs
 * Google Drive上のProject GATE運用フォルダを安全に整理する。
 */
var DriveMaintenanceEngine = (function () {
  'use strict';

  var DEFAULTS = {
    DRIVE_DRY_RUN: true,
    INPUT_KEEP_FILES: 3,
    CSV_RETENTION_DAYS: 1,
    ARCHIVE_RETENTION_DAYS: 30,
    ERROR_RETENTION_DAYS: 180,
    LOG_SUCCESS_RETENTION: 7,
    LOG_ERROR_RETENTION: 90,
    MAX_MAINTENANCE_FILES: 500
  };

  function toBoolean_(value,