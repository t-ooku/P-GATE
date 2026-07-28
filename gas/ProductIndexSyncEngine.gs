/**
 * HOSHILU公開検索用D1へ、Master_Databaseで変更された商品だけを転送する。
 * Spreadsheetは監査用SSoT、D1は高速検索用の再構築可能な索引として扱う。
 */
var ProductIndexSyncEngine = (function () {
  'use strict';
  var MAX_RECORDS_PER_REQUEST = 200;
  var DEFAULT_ENDPOINT = 'https://hoshilu.app/api/internal/products/sync';

  function property(name, fallback) {
    return PropertiesService.getScriptProperties().getProperty(name) || fallback || '';
  }

  function publicRecord(record) {
    return {
      record_key: record.record_key,
      asin: record.asin,
      sku: record.sku || '',
      product_name: record.product_name,
      manufacturer: record.manufacturer || '',
      image: record.image || '',
      stock: Number(record.stock || 0),
      amazon_jp_url: record.amazon_jp_url || '',
      amazon_us_url: record.amazon_us_url || '',
      search_aliases: record.search_aliases || [],
      localized_content: record.localized_content || {},
      row_hash: record.row_hash,
      imported_at: record.imported_at
    };
  }

  function sync(tenant, batchId, records) {
    records = records || [];
    if (records.length === 0) { return { requests: 0, sent: 0 }; }
    var secret = property('PRODUCT_SYNC_SECRET', property('LINE_BRIDGE_SECRET', ''));
    if (secret.length < 32) {
      throw Utility.createError('PRODUCT_SYNC_SECRET_MISSING', 'PRODUCT_SYNC_SECRETまたはLINE_BRIDGE_SECRETが未設定です。');
    }
    var endpoint = property('PRODUCT_INDEX_SYNC_URL', DEFAULT_ENDPOINT);
    var requests = 0;
    var sent = 0;
    for (var offset = 0; offset < records.length; offset += MAX_RECORDS_PER_REQUEST) {
      var chunk = records.slice(offset, offset + MAX_RECORDS_PER_REQUEST).map(publicRecord);
      var response = UrlFetchApp.fetch(endpoint, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + secret },
        payload: JSON.stringify({
          tenant: tenant,
          batch_id: batchId + ':' + Math.floor(offset / MAX_RECORDS_PER_REQUEST),
          records: chunk
        }),
        muteHttpExceptions: true
      });
      requests += 1;
      if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
        throw Utility.createError('PRODUCT_SYNC_HTTP_ERROR', 'D1商品索引への同期に失敗しました。', {
          status: response.getResponseCode(), offset: offset
        });
      }
      sent += chunk.length;
    }
    return { requests: requests, sent: sent };
  }

  return {
    MAX_RECORDS_PER_REQUEST: MAX_RECORDS_PER_REQUEST,
    publicRecord: publicRecord,
    sync: sync
  };
}());
