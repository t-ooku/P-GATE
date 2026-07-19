/**
 * Project GATE - DriveMaintenanceEngine.gs
 *
 * Google Drive上のProject GATE運用フォルダを安全に整理する。
 * 対象: 01_Input_Zip / 02_Extracted_CSV / 03_Archive / 04_Error / 05_Log
 *
 * 安全設計:
 * - DRIVE_DRY_RUN=TRUE の間は移動・削除を行わない
 * - 完全削除は行わず、Google Driveのゴミ箱へ移動する
 * - 01_Input_Zipは最新ファイルを指定件数残す
 * - 1回の処理件数をMAX_MAINTENANCE_FILESで制限する
 * - ScriptLockで同時実行を防止する
 */
var DriveMaintenance