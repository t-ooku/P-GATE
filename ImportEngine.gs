/**
 * Project GATE - DatabaseEngine.gs
 * Master_Databaseを一括読込し、Hash差分がある行だけをsetValuesで更新する。
 */
var DatabaseEngine = (function () {
  'use strict';

  var SHEET_NAME = 'Master_Database';
  var HEADERS = [
    'Tenant', 'Record_Key', 'ASIN', 'SKU', '商品名', 'メーカー', '画像', '利益',
    '売値_最安値', 'FBA出荷', '送料', '諸経費', 'サイズ情報', '在庫数', '登録日時',
    '日本最安値', '販売価格', '更新日時', '販売手数料', '米国最安値', '関税', '州税',
    'ツール外出品', '日本Amazon', '米国Amazon', 'Row_Hash', 'Batch_ID', 'Imported_At'
  ];

  function ensureSheet() {
    return Utility.ensureSheet(Config.getSpreadsheet(), SHEET_NAME, HEADERS);
  }

  function toRow(record) {
    return [
      record.tenant, record.record_key, record.asin, record.sku, record.product_name,
      record.manufacturer, record.image, record.profit, record.price_lowest,
      record.fba_shipping, record.shipping, record.expenses, record.dimensions, record.stock,
      record.registered_at, record.jp_lowest, record.sale_price, record.updated_at,
      record.amazon_fee, record.us_lowest, record.customs_duty, record.state_tax,
      record.external_listing, record.amazon_jp_url, record.amazon_us_url,
      record.row_hash, record.batch_id, record.imported_at
    ];
  }

  function fromRow(row) {
    return {
      tenant: row[0], record_key: row[1], asin: row[2], sku: row[3], product_name: row[4],
      manufacturer: row[5], image: row[6], profit: Number(row[7] || 0),
      price_lowest: Number(row[8] || 0), fba_shipping: Number(row[9] || 0),
      shipping: Number(row[10] || 0), expenses: Number(row[11] || 0), dimensions: row[12],
      stock: Number(row[13] || 0), registered_at: row[14], jp_lowest: Number(row[15] || 0),
      sale_price: Number(row[16] || 0), updated_at: row[17], amazon_fee: Number(row[18] || 0),
      us_lowest: Number(row[19] || 0), customs_duty: Number(row[20] || 0),
      state_tax: Number(row[21] || 0), external_listing: row[22], amazon_jp_url: row[23],
      amazon_us_url: row[24], row_hash: row[25], batch_id: row[26], imported_at: row[27]
    };
  }

  function groupContiguous(updates) {
    if (updates.length === 0) {
      return [];
    }
    updates.sort(function (a, b) { return a.rowNumber - b.rowNumber; });
    var groups = [];
    var current = { startRow: updates[0].rowNumber, rows: [updates[0].row] };
    for (var i = 1; i < updates.length; i += 1) {
      if (updates[i].rowNumber === current.startRow + current.rows.length) {
        current.rows.push(updates[i].row);
      } else {
        groups.push(current);
        current = { startRow: updates[i].rowNumber, rows: [updates[i].row] };
      }
    }
    groups.push(current);
    return groups;
  }

  function sync(records, batchId) {
    var sheet = ensureSheet();
    var existingValues = sheet.getLastRow() > 1
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues()
      : [];
    var existingByKey = {};
    for (var i = 0; i < existingValues.length; i += 1) {
      existingByKey[String(existingValues[i][1])] = {
        rowNumber: i + 2,
        hash: String(existingValues[i][25] || '')
      };
    }

    var updates = [];
    var inserts = [];
    var changedRecords = [];
    var unchanged = 0;
    for (var r = 0; r < records.length; r += 1) {
      var record = records[r];
      record.row_hash = HashEngine.calculate(record);
      record.batch_id = batchId;
      record.imported_at = Utility.nowIso();
      var existing = existingByKey[record.record_key];
      if (existing && existing.hash === record.row_hash) {
        unchanged += 1;
        continue;
      }
      var row = toRow(record);
      if (existing) {
        updates.push({ rowNumber: existing.rowNumber, row: row });
      } else {
        inserts.push(row);
      }
      changedRecords.push(record);
    }

    var groups = groupContiguous(updates);
    for (var g = 0; g < groups.length; g += 1) {
      sheet.getRange(groups[g].startRow, 1, groups[g].rows.length, HEADERS.length).setValues(groups[g].rows);
    }
    if (inserts.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, inserts.length, HEADERS.length).setValues(inserts);
    }

    return {
      inserted: inserts.length,
      updated: updates.length,
      unchanged: unchanged,
      changedRecords: changedRecords
    };
  }

  function getAllRecords() {
    var sheet = ensureSheet();
    if (sheet.getLastRow() < 2) {
      return [];
    }
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length)
      .getValues()
      .map(fromRow);
  }

  return {
    SHEET_NAME: SHEET_NAME,
    HEADERS: HEADERS.slice(),
    ensureSheet: ensureSheet,
    sync: sync,
    getAllRecords: getAllRecords,
    groupContiguous: groupContiguous
  };
}());

