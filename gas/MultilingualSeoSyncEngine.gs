/**
 * Project GATE - MultilingualSeoSyncEngine.gs
 * HOSHILU公開検索用D1へ、Search_Alias / Localized_Contentシートの全行
 * (承認状態Approvedを含む)を転送する。Sheetsは承認UIの正本のまま、D1は
 * Worker側での読み出し専用の再構築可能な索引として扱う
 * (gas/ProductIndexSyncEngine.gs, gas/ContractPolicySyncEngine.gsと同じ考え方)。
 *
 * 非承認行も含めて全行pushするのは、Sheets上で承認を取り消した場合に
 * D1側のapprovedフラグも追従させるため(承認済み行だけをpushすると、
 * 取り消し後の差分がD1に反映されない)。
 *
 * 現時点ではトリガー未設置。手動でsyncMultilingualSeoToD1()を実行すること。
 * Secret登録・本番同期はdocs/HOSHILU_COMMAND_GOVERNANCE_2026-08-02.mdにより
 * 大久津さんの承認後に行う。
 */
var MultilingualSeoSyncEngine = (function () {
  'use strict';
  var MAX_RECORDS_PER_REQUEST = 200;
  var DEFAULT_ENDPOINT = 'https://hoshilu.app/api/internal/multilingual/sync';

  function property(name, fallback) {
    return PropertiesService.getScriptProperties().getProperty(name) || fallback || '';
  }

  function publicAlias(row) {
    return {
      tenant: Utility.trim(row[0]).toLowerCase(),
      asin: Utility.trim(row[1]).toUpperCase(),
      alias: Utility.trim(row[2]),
      language: Utility.trim(row[3]).toUpperCase(),
      source: Utility.trim(row[4]),
      approved: row[5] === true || String(row[5]).toUpperCase() === 'TRUE',
      updated_at: row[6] || Utility.nowIso()
    };
  }

  function publicContent(row) {
    return {
      tenant: Utility.trim(row[0]).toLowerCase(),
      asin: Utility.trim(row[1]).toUpperCase(),
      language: Utility.trim(row[2]).toUpperCase(),
      display_name: Utility.trim(row[3]),
      description: Utility.trim(row[4]),
      keywords: Utility.trim(row[5]),
      source: Utility.trim(row[6]),
      approved: row[7] === true || String(row[7]).toUpperCase() === 'TRUE',
      updated_at: row[8] || Utility.nowIso()
    };
  }

  function readRows(sheet, columnCount) {
    if (sheet.getLastRow() < 2) { return []; }
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, columnCount).getValues();
  }

  function post(endpoint, secret, payload) {
    var response = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + secret },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
      throw Utility.createError('MULTILINGUAL_SYNC_HTTP_ERROR', 'D1多言語索引への同期に失敗しました。', {
        status: response.getResponseCode()
      });
    }
  }

  function chunk(list, size) {
    var chunks = [];
    for (var i = 0; i < list.length; i += size) {
      chunks.push(list.slice(i, i + size));
    }
    return chunks.length ? chunks : [[]];
  }

  function sync(aliases, content) {
    aliases = aliases || [];
    content = content || [];
    if (aliases.length === 0 && content.length === 0) { return { requests: 0, sentAliases: 0, sentContent: 0 }; }
    var secret = property('MULTILINGUAL_SYNC_SECRET', property('LINE_BRIDGE_SECRET', ''));
    if (secret.length < 32) {
      throw Utility.createError('MULTILINGUAL_SYNC_SECRET_MISSING', 'MULTILINGUAL_SYNC_SECRETまたはLINE_BRIDGE_SECRETが未設定です。');
    }
    var endpoint = property('MULTILINGUAL_SYNC_URL', DEFAULT_ENDPOINT);
    var aliasChunks = chunk(aliases, MAX_RECORDS_PER_REQUEST);
    var contentChunks = chunk(content, MAX_RECORDS_PER_REQUEST);
    var rounds = Math.max(aliasChunks.length, contentChunks.length);
    var requests = 0;
    var sentAliases = 0;
    var sentContent = 0;
    for (var i = 0; i < rounds; i += 1) {
      var aliasChunk = aliasChunks[i] || [];
      var contentChunk = contentChunks[i] || [];
      if (aliasChunk.length === 0 && contentChunk.length === 0) { continue; }
      post(endpoint, secret, {
        batch_id: Utility.uuid() + ':' + i,
        aliases: aliasChunk,
        content: contentChunk
      });
      requests += 1;
      sentAliases += aliasChunk.length;
      sentContent += contentChunk.length;
    }
    return { requests: requests, sentAliases: sentAliases, sentContent: sentContent };
  }

  function syncAll() {
    var sheets = MultilingualSeoEngine.ensureSheets();
    var aliases = readRows(sheets.aliases, MultilingualSeoEngine.ALIAS_HEADERS.length).map(publicAlias);
    var content = readRows(sheets.content, MultilingualSeoEngine.CONTENT_HEADERS.length).map(publicContent);
    return sync(aliases, content);
  }

  return {
    MAX_RECORDS_PER_REQUEST: MAX_RECORDS_PER_REQUEST,
    publicAlias: publicAlias,
    publicContent: publicContent,
    sync: sync,
    syncAll: syncAll
  };
}());

/**
 * 手動実行用の入口。Search_Alias / Localized_Content全行をD1へ同期する。
 */
function syncMultilingualSeoToD1() {
  'use strict';
  return MultilingualSeoSyncEngine.syncAll();
}
