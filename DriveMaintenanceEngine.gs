/**
 * Project GATE - DriveMaintenanceEngine.gs
 *
 * Google Drive上のProject GATE運用フォルダを安全に整理する。
 * 対象:
 *   01_Input_Zip
 *   02_Extracted_CSV
 *   03_Archive
 *   04_Error
 *   05_Log
 *
 * 安全設計:
 * - 初期値はDRY_RUN=true（実際には移動・削除しない）
 * - 完全削除は行わず、古いファイルはGoogle Driveのゴミ箱へ移動
 * - 01_Input_Zipは最新ファイルを必ず一定数残す
 * - 1回の処理件数に上限を設ける
 * - 同時実行をScriptLockで防止
 */
var DriveMaintenanceEngine = (function () {