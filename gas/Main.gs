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
    if (recoveredCount