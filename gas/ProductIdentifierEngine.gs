/**
 * Project GATE - ProductIdentifierEngine.gs
 * 日本語商品マスターのASINへJAN / EAN / UPCを承認制で紐付ける。
 */
var ProductIdentifierEngine = (function () {
  'use strict';

  var SHEET_NAME = 'Product_Identifiers';
  var COVERAGE_SHEET_NAME = 'Identifier_Coverage';
  var CONFLICT_SHEET_NAME = 'Identifier_Conflicts';
  var HEADERS = ['Tenant', 'ASIN', 'Identifier_Type', 'Identifier_Value', 'Source', 'Approved', 'Updated_At'];
  var COVERAGE_HEADERS = [
    'Tenant', 'ASIN', 'Product_Name', 'Approved_Identifier_Count',
    'Identifier_Types', 'Missing_Action', 'Updated_At'
  ];
  var CONFLICT_HEADERS = ['Tenant', 'Identifier_Value', 'ASINs', 'Status', 'Updated_At'];
  var TYPES = ['JAN', 'EAN', 'UPC'];

  function ensureSheets() {
    return {
      identifiers: Utility.ensureSheet(Config.getSpreadsheet(), SHEET_NAME, HEADERS),
      coverage: Utility.ensureSheet(Config.getSpreadsheet(), COVERAGE_SHEET_NAME, COVERAGE_HEADERS),
      conflicts: Utility.ensureSheet(Config.getSpreadsheet(), CONFLICT_SHEET_NAME, CONFLICT_HEADERS)
    };
  }

  function normalizeIdentifier(value) {
    var text = Utility.trim(value).replace(/[\s-]/g, '');
    if (!/^\d{8,14}$/.test(text)) {
      throw Utility.createError('IDENTIFIER_FORMAT_INVALID', '商品コードは8〜14桁の数字で入力してください。');
    }
    return text;
  }

  function hasValidCheckDigit(value) {
    var code;
    try {
      code = normalizeIdentifier(value);
    } catch (error) {
      return false;
    }
    if ([8, 12, 13, 14].indexOf(code.length) < 0) { return false; }
    var sum = 0;
    var position = 0;
    for (var i = code.length - 2; i >= 0; i -= 1) {
      sum += Number(code.charAt(i)) * (position % 2 === 0 ? 3 : 1);
      position += 1;
    }
    return (10 - (sum % 10)) % 10 === Number(code.charAt(code.length - 1));
  }

  function validateType(type, value) {
    type = Utility.trim(type).toUpperCase();
    var code = normalizeIdentifier(value);
    if (TYPES.indexOf(type) < 0) {
      throw Utility.createError('IDENTIFIER_TYPE_INVALID', '未対応の商品コード種別です: ' + type);
    }
    if (!hasValidCheckDigit(code)) {
      throw Utility.createError('IDENTIFIER_CHECK_DIGIT_INVALID', '商品コードのチェックディジットが不正です: ' + code);
    }
    if (type === 'JAN' && (code.length !== 13 || !/^(45|49)/.test(code))) {
      throw Utility.createError('JAN_FORMAT_INVALID', 'JANは45または49で始まる13桁を指定してください。');
    }
    if (type === 'UPC' && code.length !== 12) {
      throw Utility.createError('UPC_FORMAT_INVALID', 'UPCは12桁を指定してください。');
    }
    if (type === 'EAN' && [8, 13, 14].indexOf(code.length) < 0) {
      throw Utility.createError('EAN_FORMAT_INVALID', 'EANは8、13、14桁を指定してください。');
    }
    return code;
  }

  function normalizeRow(row, rowNumber) {
    var approved = row[5] === true || String(row[5]).toUpperCase() === 'TRUE';
    var result = {
      tenant: Utility.trim(row[0]).toLowerCase(),
      asin: Utility.trim(row[1]).toUpperCase(),
      type: Utility.trim(row[2]).toUpperCase(),
      value: Utility.trim(row[3]),
      source: Utility.trim(row[4]),
      approved: approved,
      updated_at: row[6],
      row_number: rowNumber
    };
    if (!approved) { return result; }
    if (!result.tenant || !/^[A-Z0-9]{10}$/.test(result.asin)) {
      throw Utility.createError('IDENTIFIER_TARGET_INVALID', '承認済み商品コードのTenantまたはASINが不正です。', { row: rowNumber });
    }
    result.value = validateType(result.type, result.value);
    return result;
  }

  function loadApproved(sheet, tenant) {
    var result = [];
    if (sheet.getLastRow() < 2) { return result; }
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
    var targetTenant = tenant == null ? '' : Utility.trim(tenant).toLowerCase();
    for (var i = 0; i < rows.length; i += 1) {
      var item = normalizeRow(rows[i], i + 2);
      if (item.approved && (!targetTenant || item.tenant === targetTenant)) { result.push(item); }
    }
    return result;
  }

  function buildIndex(mappings) {
    var index = {};
    for (var i = 0; i < mappings.length; i += 1) {
      var item = mappings[i];
      var key = item.tenant + '|' + item.value;
      if (!index[key]) { index[key] = []; }
      if (index[key].indexOf(item.asin) < 0) { index[key].push(item.asin); }
    }
    return index;
  }

  function findConflicts(mappings) {
    var index = buildIndex(mappings);
    return Object.keys(index).sort().filter(function (key) {
      return index[key].length > 1;
    }).map(function (key) {
      var separator = key.indexOf('|');
      return {
        tenant: key.slice(0, separator), identifier: key.slice(separator + 1),
        asins: index[key].slice().sort()
      };
    });
  }

  function lookup(records, mappings, tenant, value) {
    var code = normalizeIdentifier(value);
    if (!hasValidCheckDigit(code)) {
      throw Utility.createError('IDENTIFIER_CHECK_DIGIT_INVALID', '商品コードのチェックディジットが不正です。');
    }
    var normalizedTenant = Utility.trim(tenant).toLowerCase();
    var asins = buildIndex(mappings)[normalizedTenant + '|' + code] || [];
    if (asins.length === 0) { return { status: 'NOT_FOUND', identifier: code, records: [] }; }
    if (asins.length > 1) {
      return { status: 'AMBIGUOUS', identifier: code, asins: asins.slice(), records: [] };
    }
    var matched = records.filter(function (record) {
      return String(record.tenant || '').toLowerCase() === normalizedTenant &&
        String(record.asin || '').toUpperCase() === asins[0];
    });
    if (matched.length !== 1) {
      return { status: 'MASTER_MISMATCH', identifier: code, asins: asins.slice(), records: [] };
    }
    return { status: 'FOUND', identifier: code, asins: asins.slice(), records: matched };
  }

  function lookupForTenant(tenant, value) {
    var sheets = ensureSheets();
    return lookup(
      DatabaseEngine.getAllRecords(),
      loadApproved(sheets.identifiers, tenant),
      tenant,
      value
    );
  }

  function refreshCoverage() {
    var sheets = ensureSheets();
    var mappings = loadApproved(sheets.identifiers, null);
    var byProduct = {};
    for (var i = 0; i < mappings.length; i += 1) {
      var key = mappings[i].tenant + '|' + mappings[i].asin;
      if (!byProduct[key]) { byProduct[key] = []; }
      byProduct[key].push(mappings[i]);
    }
    var now = Utility.nowIso();
    var rows = DatabaseEngine.getAllRecords().map(function (record) {
      var tenant = String(record.tenant || '').toLowerCase();
      var items = byProduct[tenant + '|' + String(record.asin || '').toUpperCase()] || [];
      var types = {};
      items.forEach(function (item) { types[item.type] = true; });
      return [
        tenant, record.asin, record.product_name, items.length,
        Object.keys(types).sort().join(','),
        items.length > 0 ? '' : 'JAN/EAN/UPCを確認し、承認済み識別子を追加', now
      ];
    });
    if (sheets.coverage.getLastRow() > 1) {
      sheets.coverage.getRange(2, 1, sheets.coverage.getLastRow() - 1, COVERAGE_HEADERS.length).clearContent();
    }
    if (rows.length > 0) {
      sheets.coverage.getRange(2, 1, rows.length, COVERAGE_HEADERS.length).setValues(rows);
    }
    var conflicts = findConflicts(mappings).map(function (conflict) {
      return [conflict.tenant, conflict.identifier, conflict.asins.join(','), 'BLOCKED', now];
    });
    if (sheets.conflicts.getLastRow() > 1) {
      sheets.conflicts.getRange(2, 1, sheets.conflicts.getLastRow() - 1, CONFLICT_HEADERS.length).clearContent();
    }
    if (conflicts.length > 0) {
      sheets.conflicts.getRange(2, 1, conflicts.length, CONFLICT_HEADERS.length).setValues(conflicts);
    }
    return {
      products: rows.length,
      covered: rows.filter(function (row) { return row[3] > 0; }).length,
      conflicts: conflicts.length
    };
  }

  return {
    SHEET_NAME: SHEET_NAME,
    COVERAGE_SHEET_NAME: COVERAGE_SHEET_NAME,
    CONFLICT_SHEET_NAME: CONFLICT_SHEET_NAME,
    HEADERS: HEADERS.slice(),
    COVERAGE_HEADERS: COVERAGE_HEADERS.slice(),
    CONFLICT_HEADERS: CONFLICT_HEADERS.slice(),
    ensureSheets: ensureSheets,
    normalizeIdentifier: normalizeIdentifier,
    hasValidCheckDigit: hasValidCheckDigit,
    validateType: validateType,
    normalizeRow: normalizeRow,
    loadApproved: loadApproved,
    buildIndex: buildIndex,
    findConflicts: findConflicts,
    lookup: lookup,
    lookupForTenant: lookupForTenant,
    refreshCoverage: refreshCoverage
  };
}());

function refreshProjectGateIdentifierCoverage() {
  'use strict';
  return ProductIdentifierEngine.refreshCoverage();
}
