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
  MarketplaceMeasurementEngine.ensureSheets();
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
    .addItem('Marketplace別KPIを更新', 'refreshProjectGateMarketplaceKpiSummary')
    .addItem('匿名ベンチマークを更新', 'refreshProjectGateAnonymousBenchmark')
    .addItem('複数EC購入先を準備・検証', 'refreshProjectGateMarketplaceOffers')
    .addItem('多言語SEOを更新', 'refreshProjectGateMultilingualSeo')
    .addItem('商品コード整備状況を更新', 'refreshProjectGateIdentifierCoverage')
    .addItem('公開前チェック', 'runProjectGatePreflight')
    .addItem('5分トリガーを設定', 'installProjectGateTrigger')
    .addItem('トリガーを解除', 'uninstallProjectGateTrigger')
    .addToUi();
}
