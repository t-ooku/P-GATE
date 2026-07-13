/**
 * Project GATE - ValidationEngine.gs
 * Masterへ流す前の必須値・重複を検証する。
 */
var ValidationEngine = (function () {
  'use strict';

  function validateRecord(record) {
    var errors = [];
    if (!record.asin) {
      errors.push('ASIN_REQUIRED');
    } else if (!/^[A-Z0-9]{10}$/.test(record.asin)) {
      errors.push('ASIN_FORMAT_INVALID');
    }
    if (!record.product_name) {
      errors.push('PRODUCT_NAME_REQUIRED');
    }
    return errors;
  }

  function validate(records) {
    var byKey = {};
    var order = [];
    var errors = [];
    var warnings = [];

    for (var i = 0; i < records.length; i += 1) {
      var record = records[i];
      var recordErrors = validateRecord(record);
      if (recordErrors.length > 0) {
        errors.push({
          row: record.source_row,
          key: record.record_key,
          codes: recordErrors
        });
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(byKey, record.record_key)) {
        warnings.push({
          row: record.source_row,
          key: record.record_key,
          code: 'DUPLICATE_KEY_LAST_ROW_WINS'
        });
      } else {
        order.push(record.record_key);
      }
      byKey[record.record_key] = record;
    }

    return {
      validRecords: order.map(function (key) { return byKey[key]; }),
      errors: errors,
      warnings: warnings
    };
  }

  return {
    validateRecord: validateRecord,
    validate: validate
  };
}());

