/**
 * Project GATE - ProductIdentifierSyncEngine.gs
 * HOSHILU公開検索用D1へ、Product_Identifiersシートの全行(承認状態Approved
 * を含む)を転送する。Sheetsは承認UIの正本のまま、D1はWorker側での
 * JAN/EAN/UPC→ASIN検索専用の再構築可能な索引として扱う
 * (gas/ContractPolicySyncEngine.gs, gas/MultilingualSeoSyncEngine.gsと同じ考え方)。
 *
 * 非承認行も含めて全行pushするのは、Sheets上で承認を取り消した場合に
 * D1側のapprovedフラグも追従させるため。
 *
 * 現時点ではトリガー未設置。手動でsyncProductIdentifiersToD1()を実行すること。
 * Secret登録・本番同期はdocs/HOSHILU_COMMAND_GOVERNANCE_2026-08-02.mdにより
 * 大久津さんの承認後に行う。
 */
var ProductIdentifierSyncEngine = (function () {
  'use strict';
  var MAX_RECORDS_PER_REQUEST = 200;
  var DEFAULT_ENDPOINT = 'https://hoshilu.app/api/internal/product-identifiers/sync';

  function property(name, fallback) {
    return PropertiesService.getScriptProperties().getProperty(name) || fallback || '';
  }

  function publicIdentifier(row) {
    return {
      tenant: Utility.trim(row[0]).toLowerCase(),
      asin: Utility.trim(row[1]).toUpperCase(),
      identifier_type: Utility.trim(row[2]).toUpperCase(),
      identifier_value: Utility.trim(row[3]),
      source: Utility.trim(row[4]),
      approved: row[5] === true || String(row[5]).toUpperCase() === 'TRUE',
      updated_at: row[6] || Utility.nowIso()
    };
  }

  function sync(identifiers) {
    identifiers = identifiers || [];
    if (identifiers.length === 0) { return { requests: 0, sent: 0 }; }
    var secret = property('PRODUCT_IDENTIFIER_SYNC_SECRET', property('LINE_BRIDGE_SECRET', ''));
    if (secret.length < 32) {
      throw Utility.createError('PRODUCT_IDENTIFIER_SYNC_SECRET_MISSING', 'PRODUCT_IDENTIFIER_SYNC_SECRETまたはLINE_BRIDGE_SECRETが未設定です。');
    }
    var endpoint = property('PRODUCT_IDENTIFIER_SYNC_URL', DEFAULT_ENDPOINT);
    var requests = 0;
    var sent = 0;
    for (var offset = 0; offset < identifiers.length; offset += MAX_RECORDS_PER_REQUEST) {
      var chunk = identifiers.slice(offset, offset + MAX_RECORDS_PER_REQUEST).map(publicIdentifier);
      var response = UrlFetchApp.fetch(endpoint, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + secret },
        payload: JSON.stringify({
          batch_id: Utility.uuid() + ':' + Math.floor(offset / MAX_RECORDS_PER_REQUEST),
          identifiers: chunk
        }),
        muteHttpExceptions: true
      });
      requests += 1;
      if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
        throw Utility.createError('PRODUCT_IDENTIFIER_SYNC_HTTP_ERROR', 'D1商品コード索引への同期に失敗しました。', {
          status: response.getResponseCode(), offset: offset
        });
      }
      sent += chunk.length;
    }
    return { requests: requests, sent: sent };
  }

  function syncAll() {
    var sheets = ProductIdentifierEngine.ensureSheets();
    var sheet = sheets.identifiers;
    var rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, ProductIdentifierEngine.HEADERS.length).getValues();
    return sync(rows);
  }

  return {
    MAX_RECORDS_PER_REQUEST: MAX_RECORDS_PER_REQUEST,
    publicIdentifier: publicIdentifier,
    sync: sync,
    syncAll: syncAll
  };
}());

/**
 * 手動実行用の入口。Product_Identifiers全行をD1へ同期する。
 */
function syncProductIdentifiersToD1() {
  'use strict';
  return ProductIdentifierSyncEngine.syncAll();
}
