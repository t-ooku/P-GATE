/**
 * Project GATE - MarketplaceEngine.gs
 * 承認済みの複数EC購入先を商品へ付与する。
 * 商品自体の推薦順位には影響させず、同一商品の購入先だけを顧客負担額で整列する。
 */
var MarketplaceEngine = (function () {
  'use strict';

  var SHEET_NAME = 'Marketplace_Offers';
  var VALIDATION_SHEET_NAME = 'Marketplace_Offer_Validation';
  var HEADERS = [
    'Offer_ID', 'Tenant', 'ASIN', 'Marketplace', 'External_Product_ID', 'Product_URL',
    'Price', 'Shipping_Fee', 'Currency', 'Stock_Status', 'Delivery_Days',
    'Seller_Name', 'Approved', 'Updated_At', 'Merchant_ID', 'Seller_SKU', 'Offer_Listing_ID',
    'Seller_Plan', 'Registered_At', 'Listing_Status'
  ];
  var MARKETPLACES = {
    AMAZON_JP: ['amazon.co.jp'],
    RAKUTEN_JP: ['rakuten.co.jp'],
    YAHOO_JP: ['shopping.yahoo.co.jp', 'store.shopping.yahoo.co.jp']
  };
  var STOCK_STATUSES = { IN_STOCK: true, OUT_OF_STOCK: true, UNKNOWN: true };
  var SELLER_PLANS = { PARTNER: 0, PRO: 1, GROWTH: 2, LITE: 3 };
  var LISTING_STATUSES = { ACTIVE: true, INACTIVE: true, SUSPENDED: true, REMOVED: true };
  var MAX_OFFERS_PER_PRODUCT = 3;
  var VALIDATION_HEADERS = [
    'Row_Number', 'Offer_ID', 'Tenant', 'ASIN', 'Marketplace',
    'Approved', 'Status', 'Error_Code', 'Details', 'Checked_At'
  ];

  function ensureSheet() {
    return Utility.ensureSheet(Config.getSpreadsheet(), SHEET_NAME, HEADERS);
  }

  function ensureValidationSheet() {
    return Utility.ensureSheet(Config.getSpreadsheet(), VALIDATION_SHEET_NAME, VALIDATION_HEADERS);
  }

  function configureSheet(sheet) {
    sheet = sheet || ensureSheet();
    var dataRows = 1000;
    var marketplaceRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(Object.keys(MARKETPLACES), true).setAllowInvalid(false)
      .setHelpText('AMAZON_JP、RAKUTEN_JP、YAHOO_JPから選択してください。').build();
    var priceRule = SpreadsheetApp.newDataValidation()
      .requireNumberGreaterThan(0).setAllowInvalid(false)
      .setHelpText('販売価格を0より大きい数値で入力してください。').build();
    var nonNegativeRule = SpreadsheetApp.newDataValidation()
      .requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false)
      .setHelpText('0以上の数値で入力してください。').build();
    var currencyRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['JPY'], true).setAllowInvalid(false).build();
    var stockRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(Object.keys(STOCK_STATUSES), true).setAllowInvalid(false)
      .setHelpText('在庫あり、在庫切れ、不明のいずれかを選択してください。').build();
    var approvedRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    var planRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(Object.keys(SELLER_PLANS), true).setAllowInvalid(false).build();
    var listingRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(Object.keys(LISTING_STATUSES), true).setAllowInvalid(false).build();

    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(3);
    sheet.getRange(2, 4, dataRows, 1).setDataValidation(marketplaceRule);
    sheet.getRange(2, 7, dataRows, 1).setDataValidation(priceRule).setNumberFormat('#,##0');
    sheet.getRange(2, 8, dataRows, 1).setDataValidation(nonNegativeRule).setNumberFormat('#,##0');
    sheet.getRange(2, 9, dataRows, 1).setDataValidation(currencyRule);
    sheet.getRange(2, 10, dataRows, 1).setDataValidation(stockRule);
    sheet.getRange(2, 11, dataRows, 1).setDataValidation(nonNegativeRule).setNumberFormat('0');
    sheet.getRange(2, 13, dataRows, 1).setDataValidation(approvedRule);
    sheet.getRange(2, 18, dataRows, 1).setDataValidation(planRule);
    sheet.getRange(2, 20, dataRows, 1).setDataValidation(listingRule);
    sheet.getRange(1, 1, 1, HEADERS.length).setNotes([[
      '自動生成または任意の一意ID', '商品マスターと同じtenant', '英数字10文字',
      'プルダウンから選択', 'EC側の商品ID（公開しない）', '許可ECのHTTPS URL',
      '0より大きい販売価格', '0以上の送料', 'JPY', '在庫状態',
      '配送目安日数。未確認は0', '内部管理用（公開しない）',
      '担当者確認後のみチェック', '最終確認日時',
      '契約時に登録するEC側マーチャントID（内部管理用）', 'セラー側SKU（内部管理用）',
      'Amazon等のオファー識別子。直接送客URL生成に必要な場合のみ登録',
      'PARTNER、PRO、GROWTH、LITEのいずれか', '契約後の初回登録日時。運営管理値',
      'ACTIVE、INACTIVE、SUSPENDED、REMOVEDのいずれか'
    ]]);
    return sheet;
  }

  function isTrue(value) {
    return value === true || String(value || '').toUpperCase() === 'TRUE';
  }

  function hostnameFromHttpsUrl(value) {
    var url = Utility.trim(value);
    var match = /^https:\/\/([^\/?#]+)(?:[\/?#]|$)/i.exec(url);
    if (!match || match[1].indexOf('@') >= 0 || match[1].indexOf(':') >= 0) { return ''; }
    return match[1].toLowerCase().replace(/\.$/, '');
  }

  function hostAllowed(host, domains) {
    return domains.some(function (domain) {
      return host === domain || host.slice(-(domain.length + 1)) === '.' + domain;
    });
  }

  function validateUrl(marketplace, url) {
    var domains = MARKETPLACES[marketplace];
    var host = hostnameFromHttpsUrl(url);
    return Boolean(domains && host && hostAllowed(host, domains));
  }

  function nonNegativeNumber(value, field) {
    var number = Number(value === '' || value == null ? 0 : value);
    if (!isFinite(number) || number < 0) {
      throw Utility.createError('MARKETPLACE_' + field + '_INVALID', field + 'は0以上の数値で入力してください。');
    }
    return number;
  }

  function normalizeOffer(input) {
    input = input || {};
    var marketplace = Utility.trim(input.marketplace).toUpperCase();
    var asin = Utility.trim(input.asin).toUpperCase();
    var productUrl = Utility.trim(input.product_url);
    var stockStatus = Utility.trim(input.stock_status || 'UNKNOWN').toUpperCase();
    var sellerPlan = Utility.trim(input.seller_plan || 'LITE').toUpperCase();
    var listingStatus = Utility.trim(input.listing_status || 'ACTIVE').toUpperCase();
    if (!Utility.trim(input.offer_id)) {
      throw Utility.createError('MARKETPLACE_OFFER_ID_REQUIRED', 'Offer_IDは必須です。');
    }
    if (!Utility.trim(input.tenant)) {
      throw Utility.createError('MARKETPLACE_TENANT_REQUIRED', 'Tenantは必須です。');
    }
    if (!MARKETPLACES[marketplace]) {
      throw Utility.createError('MARKETPLACE_UNSUPPORTED', '未対応のMarketplaceです: ' + marketplace);
    }
    if (!/^[A-Z0-9]{10}$/.test(asin)) {
      throw Utility.createError('MARKETPLACE_ASIN_INVALID', 'ASINは英数字10文字で入力してください。');
    }
    if (!validateUrl(marketplace, productUrl)) {
      throw Utility.createError('MARKETPLACE_URL_INVALID', 'Marketplaceと購入先URLのドメインが一致しません。');
    }
    if (!STOCK_STATUSES[stockStatus]) {
      throw Utility.createError('MARKETPLACE_STOCK_INVALID', 'Stock_StatusはIN_STOCK、OUT_OF_STOCK、UNKNOWNのいずれかです。');
    }
    if (SELLER_PLANS[sellerPlan] == null) {
      throw Utility.createError('MARKETPLACE_SELLER_PLAN_INVALID', 'Seller_PlanはPARTNER、PRO、GROWTH、LITEのいずれかです。');
    }
    if (!LISTING_STATUSES[listingStatus]) {
      throw Utility.createError('MARKETPLACE_LISTING_STATUS_INVALID', 'Listing_Statusが不正です。');
    }
    var price = nonNegativeNumber(input.price, 'PRICE');
    if (price <= 0) {
      throw Utility.createError('MARKETPLACE_PRICE_INVALID', 'PRICEは0より大きい数値で入力してください。');
    }
    var shippingFee = nonNegativeNumber(input.shipping_fee, 'SHIPPING_FEE');
    return {
      offer_id: Utility.trim(input.offer_id),
      tenant: Utility.trim(input.tenant).toLowerCase(),
      asin: asin,
      marketplace: marketplace,
      external_product_id: Utility.trim(input.external_product_id),
      product_url: productUrl,
      price: price,
      shipping_fee: shippingFee,
      total_cost: price + shippingFee,
      currency: Utility.trim(input.currency || 'JPY').toUpperCase(),
      stock_status: stockStatus,
      delivery_days: nonNegativeNumber(input.delivery_days, 'DELIVERY_DAYS'),
      seller_name: Utility.trim(input.seller_name),
      merchant_id: Utility.trim(input.merchant_id),
      seller_sku: Utility.trim(input.seller_sku),
      offer_listing_id: Utility.trim(input.offer_listing_id),
      seller_plan: sellerPlan,
      registered_at: Utility.trim(input.registered_at),
      listing_status: listingStatus,
      approved: isTrue(input.approved),
      updated_at: Utility.trim(input.updated_at)
    };
  }

  function fromRow(row) {
    return normalizeOffer({
      offer_id: row[0], tenant: row[1], asin: row[2], marketplace: row[3],
      external_product_id: row[4], product_url: row[5], price: row[6],
      shipping_fee: row[7], currency: row[8], stock_status: row[9],
      delivery_days: row[10], seller_name: row[11], approved: row[12], updated_at: row[13],
      merchant_id: row[14], seller_sku: row[15], offer_listing_id: row[16],
      seller_plan: row[17], registered_at: row[18], listing_status: row[19]
    });
  }

  function rankOffers(offers) {
    return offers.filter(function (offer) {
      return offer.listing_status === 'ACTIVE' && offer.stock_status !== 'OUT_OF_STOCK';
    }).sort(function (left, right) {
      var leftAvailable = left.stock_status === 'OUT_OF_STOCK' ? 1 : 0;
      var rightAvailable = right.stock_status === 'OUT_OF_STOCK' ? 1 : 0;
      if (leftAvailable !== rightAvailable) { return leftAvailable - rightAvailable; }
      var planDifference = SELLER_PLANS[left.seller_plan] - SELLER_PLANS[right.seller_plan];
      if (planDifference !== 0) { return planDifference; }
      var leftRegistered = Date.parse(left.registered_at) || Number.MAX_SAFE_INTEGER;
      var rightRegistered = Date.parse(right.registered_at) || Number.MAX_SAFE_INTEGER;
      if (leftRegistered !== rightRegistered) { return leftRegistered - rightRegistered; }
      return left.offer_id.localeCompare(right.offer_id);
    }).slice(0, MAX_OFFERS_PER_PRODUCT);
  }

  function loadApprovedOffers(sheet) {
    if (!sheet || sheet.getLastRow() < 2) { return {}; }
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
    var map = {};
    var seenOfferIds = {};
    rows.forEach(function (row) {
      try {
        var offer = fromRow(row);
        var uniqueOfferKey = offer.tenant + '|' + offer.offer_id;
        if (!offer.approved || seenOfferIds[uniqueOfferKey]) { return; }
        seenOfferIds[uniqueOfferKey] = true;
        var key = offer.asin;
        map[key] = map[key] || [];
        map[key].push(offer);
      } catch (ignoreInvalidOffer) {}
    });
    Object.keys(map).forEach(function (key) { map[key] = rankOffers(map[key]); });
    return map;
  }

  function attachOffers(records, offerMap) {
    return records.map(function (record) {
      var copy = {};
      Object.keys(record).forEach(function (key) { copy[key] = record[key]; });
      var key = Utility.trim(record.asin).toUpperCase();
      copy.marketplace_offers = (offerMap[key] || []).map(function (offer) {
        return {
          marketplace: offer.marketplace,
          product_url: offer.product_url,
          price: offer.price,
          shipping_fee: offer.shipping_fee,
          total_cost: offer.total_cost,
          currency: offer.currency,
          stock_status: offer.stock_status,
          delivery_days: offer.delivery_days,
          seller_plan: offer.seller_plan,
          registered_at: offer.registered_at,
          listing_status: offer.listing_status,
          merchant_id: offer.merchant_id,
          offer_listing_id: offer.offer_listing_id
        };
      });
      return copy;
    });
  }

  function existingKeys(rows) {
    var keys = {};
    (rows || []).forEach(function (row) {
      var key = Utility.trim(row[1]).toLowerCase() + '|' + Utility.trim(row[2]).toUpperCase() + '|' + Utility.trim(row[3]).toUpperCase();
      if (key !== '||') { keys[key] = true; }
    });
    return keys;
  }

  function buildLegacyAmazonDraftRows(records, existingRows, nowIso) {
    var keys = existingKeys(existingRows);
    var drafts = [];
    (records || []).forEach(function (record) {
      var tenant = Utility.trim(record.tenant).toLowerCase();
      var asin = Utility.trim(record.asin).toUpperCase();
      var url = Utility.trim(record.amazon_jp_url);
      var key = tenant + '|' + asin + '|AMAZON_JP';
      if (!tenant || !/^[A-Z0-9]{10}$/.test(asin) || !validateUrl('AMAZON_JP', url) || keys[key]) { return; }
      var price = Number(record.sale_price || record.jp_lowest || record.price_lowest || 0);
      var shipping = Math.max(0, Number(record.shipping || 0));
      drafts.push([
        'LEGACY-AMAZON-' + tenant + '-' + asin, tenant, asin, 'AMAZON_JP', asin, url,
        price > 0 ? price : '', shipping, 'JPY', Number(record.stock || 0) > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
        '', '', false, Utility.trim(record.updated_at || record.imported_at || nowIso), '', '', '',
        'LITE', Utility.trim(record.registered_at || nowIso), 'INACTIVE'
      ]);
      keys[key] = true;
    });
    return drafts;
  }

  function createLegacyAmazonDrafts() {
    var sheet = configureSheet(ensureSheet());
    var existing = sheet.getLastRow() > 1
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues() : [];
    var records = DatabaseEngine.getAllRecords();
    var drafts = buildLegacyAmazonDraftRows(records, existing, Utility.nowIso());
    if (drafts.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, drafts.length, HEADERS.length).setValues(drafts);
    }
    return { added: drafts.length, skipped: records.length - drafts.length };
  }

  function validateRows(rows, checkedAt) {
    var reportRows = [];
    var summary = { approved_valid: 0, approved_invalid: 0, draft_valid: 0, draft_incomplete: 0 };
    (rows || []).forEach(function (row, index) {
      var approved = isTrue(row[12]);
      var status = approved ? 'PASS' : 'DRAFT_READY';
      var code = '';
      var details = approved ? '公開可能' : 'ApprovedをTRUEにすると公開可能';
      try {
        fromRow(row);
        if (approved) { summary.approved_valid += 1; } else { summary.draft_valid += 1; }
      } catch (error) {
        code = error.code || 'MARKETPLACE_INVALID';
        details = error.message || String(error);
        if (approved) {
          status = 'FAIL';
          summary.approved_invalid += 1;
        } else {
          status = 'DRAFT_INCOMPLETE';
          summary.draft_incomplete += 1;
        }
      }
      reportRows.push([
        index + 2, row[0], row[1], row[2], row[3], approved, status, code, details, checkedAt
      ]);
    });
    return { rows: reportRows, summary: summary };
  }

  function validateSheet(sheet) {
    sheet = sheet || ensureSheet();
    var rows = sheet.getLastRow() > 1
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues() : [];
    return validateRows(rows, Utility.nowIso());
  }

  function refreshValidation() {
    var result = validateSheet(ensureSheet());
    var validationSheet = ensureValidationSheet();
    if (validationSheet.getLastRow() > 1) {
      validationSheet.getRange(2, 1, validationSheet.getLastRow() - 1, VALIDATION_HEADERS.length).clearContent();
    }
    if (result.rows.length > 0) {
      validationSheet.getRange(2, 1, result.rows.length, VALIDATION_HEADERS.length).setValues(result.rows);
    }
    return result.summary;
  }

  return {
    SHEET_NAME: SHEET_NAME,
    VALIDATION_SHEET_NAME: VALIDATION_SHEET_NAME,
    HEADERS: HEADERS.slice(),
    VALIDATION_HEADERS: VALIDATION_HEADERS.slice(),
    MARKETPLACES: MARKETPLACES,
    MAX_OFFERS_PER_PRODUCT: MAX_OFFERS_PER_PRODUCT,
    ensureSheet: ensureSheet,
    ensureValidationSheet: ensureValidationSheet,
    configureSheet: configureSheet,
    validateUrl: validateUrl,
    normalizeOffer: normalizeOffer,
    rankOffers: rankOffers,
    loadApprovedOffers: loadApprovedOffers,
    attachOffers: attachOffers,
    buildLegacyAmazonDraftRows: buildLegacyAmazonDraftRows,
    createLegacyAmazonDrafts: createLegacyAmazonDrafts,
    validateRows: validateRows,
    validateSheet: validateSheet,
    refreshValidation: refreshValidation
  };
}());

function refreshProjectGateMarketplaceOffers() {
  'use strict';
  var drafts = MarketplaceEngine.createLegacyAmazonDrafts();
  var validation = MarketplaceEngine.refreshValidation();
  SpreadsheetApp.getUi().alert(
    '購入先の下書き作成・検証が完了しました。\n' +
    '追加: ' + drafts.added + '件\n' +
    '承認済み有効: ' + validation.approved_valid + '件\n' +
    '承認済みエラー: ' + validation.approved_invalid + '件\n' +
    '未完成下書き: ' + validation.draft_incomplete + '件'
  );
  return { drafts: drafts, validation: validation };
}
