/**
 * Project GATE - HashEngine.gs
 * 業務値だけを正規順序でSHA-256化する。取込日時はHash対象外。
 */
var HashEngine = (function () {
  'use strict';

  var HASH_FIELDS = [
    'tenant', 'asin', 'sku', 'product_name', 'manufacturer', 'image', 'profit',
    'price_lowest', 'fba_shipping', 'shipping', 'expenses', 'dimensions', 'stock',
    'jp_lowest', 'sale_price', 'amazon_fee', 'us_lowest', 'customs_duty', 'state_tax',
    'external_listing', 'amazon_jp_url', 'amazon_us_url'
  ];

  function calculate(record) {
    return Utility.sha256(Utility.stableStringify(record, HASH_FIELDS));
  }

  return {
    HASH_FIELDS: HASH_FIELDS.slice(),
    calculate: calculate
  };
}());
