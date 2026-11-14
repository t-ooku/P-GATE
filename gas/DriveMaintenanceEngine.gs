/**
 * Project GATE - DriveMaintenanceEngine.gs
 *
 * Safe archive maintenance policy:
 * - Never deletes files from 01_Input_Zip.
 * - Only handles ZIP files in 03_Archive.
 * - Moves ZIP files older than 30 days to Google Drive trash.
 * - Processes at most 500 files per run.
 * - Dry-run and production entry points are explicit.
 */
var DriveMaintenanceEngine = (function () {
  'use strict';

  var DEFAULT_ARCHIVE_RETENTION_DAYS = 30;
  var DEFAULT_MAX_FILES_PER_RUN = 500;

  function getPositiveInteger_(key, defaultValue) {
    var raw = Config.get(key, String(defaultValue));
    var value = Number(raw);
    if (!isFinite(value) || value < 1) {
      return defaultValue;
    }
    return Math.floor(value);
  }

  function cleanupArchiveFolder(dryRun) {
    Config.validate();

    var retentionDays = getPositiveInteger_(
      'ARCHIVE_RETENTION_DAYS',
      DEFAULT_ARCHIVE_RETENTION_DAYS
    );
    var maxFiles = getPositiveInteger_(
      'DRIVE_MAINTENANCE_MAX_FILES_PER_RUN',
      DEFAULT_MAX_FILES_PER_RUN
    );
    var folder = DriveService.getFolder(
      Config.getRequired('ARCHIVE_FOLDER_ID')
    );
    var cutoff = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000
    );
    var iterator = folder.getFiles();
    var candidates = [];

    while (iterator.hasNext()) {
      var file = iterator.next();
      var name = String(file.getName() || '');

      if (!/\.zip$/i.test(name)) {
        continue;
      }
      if (file.getLastUpdated().getTime() >= cutoff.getTime()) {
        continue;
      }

      candidates.push(file);
    }

    candidates.sort(function (a, b) {
      return a.getLastUpdated().getTime() - b.getLastUpdated().getTime();
    });

    var selected = candidates.slice(0, maxFiles);
    selected.forEach(function (file) {
      if (!dryRun) {
        file.setTrashed(true);
      }

      AppLogger.info(
        dryRun ? 'ARCHIVE_DELETE_DRY_RUN' : 'ARCHIVE_TRASHED',
        file.getName(),
        {
          id: file.getId(),
          lastUpdated: file.getLastUpdated().toISOString(),
          retentionDays: retentionDays
        }
      );
    });

    var result = {
      dryRun: dryRun,
      retentionDays: retentionDays,
      cutoff: cutoff.toISOString(),
      candidateCount: candidates.length,
      processedCount: selected.length,
      remainingCount: Math.max(0, candidates.length - selected.length)
    };

    AppLogger.info(
      dryRun ? 'ARCHIVE_MAINTENANCE_DRY_RUN_SUMMARY' : 'ARCHIVE_MAINTENANCE_SUMMARY',
      'Archive maintenance completed.',
      result
    );

    return result;
  }

  function executeWithConfig(dryRun) {
    return cleanupArchiveFolder(dryRun !== false);
  }

  return {
    execute: function () {
      return executeWithConfig(true);
    },
    executeWithConfig: executeWithConfig,
    cleanupArchiveFolder: cleanupArchiveFolder
  };
})();

/** Preview only. This function never deletes files. */
function runDriveMaintenanceDryRun() {
  var batchId = 'drive-maintenance-dry-run-' + Utilities.getUuid();
  AppLogger.startBatch(batchId);

  try {
    var result = DriveMaintenanceEngine.executeWithConfig(true);
    Logger.log(JSON.stringify(result));
    return result;
  } catch (error) {
    AppLogger.error(
      'DRIVE_MAINTENANCE_DRY_RUN_ERROR',
      'Archive maintenance dry-run failed.',
      error
    );
    throw error;
  } finally {
    AppLogger.flush();
  }
}

/** Production cleanup. Files are moved to Google Drive trash. */
function runDriveMaintenanceProduction() {
  var batchId = 'drive-maintenance-production-' + Utilities.getUuid();
  AppLogger.startBatch(batchId);

  try {
    var result = DriveMaintenanceEngine.executeWithConfig(false);
    Logger.log(JSON.stringify(result));
    return result;
  } catch (error) {
    AppLogger.error(
      'DRIVE_MAINTENANCE_PRODUCTION_ERROR',
      'Archive maintenance production run failed.',
      error
    );
    throw error;
  } finally {
    AppLogger.flush();
  }
}

/** Installs one daily production trigger at approximately 03:00. */
function installDriveMaintenanceDailyTrigger() {
  var handler = 'runDriveMaintenanceProduction';

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(handler)
    .timeBased()
    .everyDays(1)
    .atHour(3)
    .create();

  Logger.log('Daily archive maintenance trigger installed.');
}

function uninstallDriveMaintenanceDailyTrigger() {
  var handler = 'runDriveMaintenanceProduction';
  var removed = 0;

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(trigger);
      removed += 1;
    }
  });

  Logger.log('Removed triggers: ' + removed);
}

