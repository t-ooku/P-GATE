/**
 * Project GATE - MappingEngine.gs
 * CSVヘッダーと内部フィールドの対応を一か所に集約する。
 */
var MappingEngine = (function () {
  'use strict';

  var DEFINITIONS = [
    { field: 'asin', aliases: ['ASIN'] },
    { field: 'image', aliases: ['画像', '画像URL', 'Image URL'] },
    { field: 'product_name', aliases: ['商品名', 'Title'] },
    { field: 'profit', aliases: ['利益', 'Profit'] },
    { field: 'price_lowest', aliases: ['売値/最安値', '売価'] },
    { field: 'fba_shipping', aliases: ['FBA出荷'] },
    { field: 'shipping', aliases: ['送料'] },
    { field: 'expenses', aliases: ['諸経費'] },
    { field: 'dimensions', aliases: ['幅インチ、長さインチ、高さインチ', 'サイズ情報'] },
    { field: 'stock', aliases: ['在庫数', '在庫'] },
    { field: 'registered_at', aliases: ['登録日時'] },
    { field: 'sku', aliases: ['SKU', 'Seller SKU'] },
    { field: 'manufacturer', aliases: ['メーカー', 'Brand'] },
    { field: 'jp_lowest', aliases: ['日本最安値'] },
    { field: 'sale_price', aliases: ['販売価格', 'Price'] },
    { field: 'updated_at', aliases: ['更新日時'] },
    { field: 'amazon_fee', aliases: ['販売手数料', 'Amazon手数料', 'Amazon Fee'] },
    { field: 'us_lowest', aliases: ['米国最安値'] },
    { field: 'customs_duty', aliases: ['関税', 'Import Tax'] },
    { field: 'state_tax', aliases: ['州税'] },
    { field: 'external_listing', aliases: ['ツール外出品'] },
    { field: 'amazon_jp_url', aliases: ['日本Amazon'] },
    { field: 'amazon_us_url', aliases: ['米国Amazon'] }
  ];

  function buildIndex(header) {
    var source = {};
    for (var i = 0; i < header.length; i += 1) {
      source[Utility.normalizeHeader(header[i])] = i;
    }
    var index = {};
    for (var d = 0; d < DEFINITIONS.length; d += 1) {
      var definition = DEFINITIONS[d];
      index[definition.field] = -1;
      for (var a = 0; a < definition.aliases.length; a += 1) {
        var normalized = Utility.normalizeHeader(definition.aliases[a]);
        if (Object.prototype.hasOwnProperty.call(source, normalized)) {
          index[definition.field] = source[normalized];
          break;
        }
      }
    }

    var missing = [];
    ['asin', 'product_name'].forEach(function (field) {
      if (index[field] < 0) {
        missing.push(field);
      }
    });
    if (missing.length > 0) {
      throw Utility.createError('CSV_REQUIRED_COLUMN_MISSING', 'CSVの必須列がありません: ' + missing.join(', '), {
        header: header,
        missing: missing
      });
    }
    return index;
  }

  function mapRow(row, index, sourceRowNumber) {
    var record = { source_row: sourceRowNumber || 0 };
    for (var i = 0; i < DEFINITIONS.length; i += 1) {
      var field = DEFINITIONS[i].field;
      var position = index[field];
      record[field] = position >= 0 ? row[position] : '';
    }
    return record;
  }

  function findAsinIndex(header) {
    return buildIndex(header).asin;
  }

  function getFields() {
    return DEFINITIONS.map(function (definition) { return definition.field; });
  }

  return {
    buildIndex: buildIndex,
    mapRow: mapRow,
    findAsinIndex: findAsinIndex,
    getFields: getFields
  };
}());

