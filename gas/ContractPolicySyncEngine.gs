/**
 * Project GATE - ContractPolicySyncEngine.gs
 * HOSHILU公開検索用D1へ、Client_Contractsの契約情報を転送する。
 * Spreadsheetは契約の監査用SSoTのまま、D1は高速な契約ポリシー判定用の
 * 再構築可能な索引として扱う(gas/ProductIndexSyncEngine.gsと同じ考え方)。
 *
 * 現時点ではトリガー未設置。手動でsyncContractPolicyToD1()を実行するか、
 * 将来installProjectGateTrigger()と同様の定期トリガーを追加する場合も、
 * Secret登録・本番同期はdocs/HOSHILU_COMMAND_GOVERNANCE_2026-08-02.mdにより
 * 大久津さんの承認後に行うこと。
 */
var ContractPolicySyncEngine = (function () {
  'use strict';
  var MAX_RECORDS_PER_REQUEST = 200;
  var DEFAULT_ENDPOINT = 'https://hoshilu.app/api/internal/contracts/sync';

  function property(name, fallback) {
    return PropertiesService.getScriptProperties().getProperty(name) || fallback || '';
  }

  function publicContract(contract) {
    return {
      contract_id: contract.contract_id,
      tenant: contract.tenant,
      account_type: contract.account_type,
      account_id: contract.account_id,
      status: contract.status,
      start_date: contract.start_date,
      end_date: contract.end_date,
      categories: contract.categories,
      competitor_group: contract.competitor_group,
      exclusivity_mode: contract.exclusivity_mode,
      competitor_acceptance: contract.competitor_acceptance,
      benchmark_consent: contract.benchmark_consent,
      updated_at: contract.updated_at
    };
  }

  function sync(contracts) {
    contracts = contracts || [];
    if (contracts.length === 0) { return { requests: 0, sent: 0 }; }
    var secret = property('CONTRACT_SYNC_SECRET', property('LINE_BRIDGE_SECRET', ''));
    if (secret.length < 32) {
      throw Utility.createError('CONTRACT_SYNC_SECRET_MISSING', 'CONTRACT_SYNC_SECRETまたはLINE_BRIDGE_SECRETが未設定です。');
    }
    var endpoint = property('CONTRACT_SYNC_URL', DEFAULT_ENDPOINT);
    var requests = 0;
    var sent = 0;
    for (var offset = 0; offset < contracts.length; offset += MAX_RECORDS_PER_REQUEST) {
      var chunk = contracts.slice(offset, offset + MAX_RECORDS_PER_REQUEST).map(publicContract);
      var response = UrlFetchApp.fetch(endpoint, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + secret },
        payload: JSON.stringify({
          batch_id: Utility.uuid() + ':' + Math.floor(offset / MAX_RECORDS_PER_REQUEST),
          contracts: chunk
        }),
        muteHttpExceptions: true
      });
      requests += 1;
      if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
        throw Utility.createError('CONTRACT_SYNC_HTTP_ERROR', 'D1契約ポリシー索引への同期に失敗しました。', {
          status: response.getResponseCode(), offset: offset
        });
      }
      sent += chunk.length;
    }
    return { requests: requests, sent: sent };
  }

  function syncAll() {
    var sheets = ContractPolicyEngine.ensureSheets();
    var contracts = ContractPolicyEngine.loadContracts(sheets.contracts);
    return sync(contracts);
  }

  return {
    MAX_RECORDS_PER_REQUEST: MAX_RECORDS_PER_REQUEST,
    publicContract: publicContract,
    sync: sync,
    syncAll: syncAll
  };
}());

/**
 * 手動実行用の入口。Client_Contracts全件をD1へ同期する。
 */
function syncContractPolicyToD1() {
  'use strict';
  return ContractPolicySyncEngine.syncAll();
}
