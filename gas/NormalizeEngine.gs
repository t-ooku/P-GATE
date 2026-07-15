/**
 * Project GATE - NormalizeEngine.gs
 * Mapping後の値を内部型へ正規化する。
 */
var NormalizeEngine = (function () {
  'use strict';

  var NUMBER_FIELDS = [
    'profit', 'price_lowest', 'fba_shipping', 'shipping', 'expenses', 'stock',
    'jp_lowest', 'sale_price', 'amazon_fee', 'us_lowest', 'customs_duty', 'state_tax'
  ];

  function normalizeUrl(value) {
    var text = Utility.trim(value);
    if (!text) {
      return '';
    }
    return /^https?:\/\//i.test(text) ? text : text;
  }

  function normalize(mapped, tenant, batchId) {
    var record = {};
    var fields = MappingEngine.getFields();
    for (var i = 0; i < fields.length; i += 1) {
      record[fields[i]] = Utility.trim(mapped[fields[i]]);
    }
    for (var n = 0; n < NUMBER_FIELDS.length; n += 1) {
      record[NUMBER_FIELDS[n]] = NUMBER_FIELDS[n] === 'stock'
        ? Utility.parseInteger(mapped[NUMBER_FIELDS[n]])
        : Utility.parseNumber(mapped[NUMBER_FIELDS[n]]);
    }
    record.asin = record.asin.toUpperCase();
    record.sku = record.sku.toUpperCase();
    record.image = normalizeUrl(record.image);
    record.amazon_jp_url = normalizeUrl(record.amazon_jp_url);
    record.amazon_us_url = normalizeUrl(record.amazon_us_url);
    record.tenant = tenant;
    record.batch_id = batchId;
    record.source_row = mapped.source_row || 0;
    record.record_key = tenant + '|' + (record.sku || record.asin);
    return record;
  }

  function normalizeAll(mappedRows, tenant, batchId) {
    return mappedRows.map(function (row) {
      return normalize(row, tenant, batchId);
    });
  }

  return {
    normalize: normalize,
    normalizeAll: normalizeAll
  };
}());
