/**
 * Project GATE - MarketplaceEngine.gs
 * 承認済みの複数EC購入先を商品へ付与する。
 * 商品自体の推薦順位には影響させず、同一商品の購入先だけを顧客負担額で整列する。
 */
var MarketplaceEngine = (function () {
  'use strict';

  var SHEET_NAME = 'Marketplace_Offers';
  var HEADERS = [
    'Offer_ID', 'Tenant', 'ASIN', 'Marketplace', 'External_Product_ID', 'Product_URL',
    'Price', 'Shipping_Fee', 'Currency', 'Stock_Status', 'Delivery_Days',
    'Seller_Name', 'Approved', 'Updated_At'
  ];
  var MARKETPLACES = {
    AMAZON_JP: ['amazon.co.jp'],
    RAKUTEN_JP: ['rakuten.co.jp'],
    YAHOO_JP: ['shopping.yahoo.co.jp', 'store.shopping.yahoo.co.jp']
  };
  var STOCK_STATUSES = { IN_STOCK: true, OUT_OF_STOCK: true, UNKNOWN: true };
  var MAX_OFFERS_PER_PRODUCT = 3;

  function ensureSheet() {
    return Utility.ensureSheet(Config.getSpreadsheet(), SHEET_NAME, HEADERS);
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
      approved: isTrue(input.approved),
      updated_at: Utility.trim(input.updated_at)
    };
  }

  function fromRow(row) {
    return normalizeOffer({
      offer_id: row[0], tenant: row[1], asin: row[2], marketplace: row[3],
      external_product_id: row[4], product_url: row[5], price: row[6],
      shipping_fee: row[7], currency: row[8], stock_status: row[9],
      delivery_days: row[10], seller_name: row[11], approved: row[12], updated_at: row[13]
    });
  }

  function rankOffers(offers) {
    return offers.slice().sort(function (left, right) {
      var leftAvailable = left.stock_status === 'OUT_OF_STOCK' ? 1 : 0;
      var rightAvailable = right.stock_status === 'OUT_OF_STOCK' ? 1 : 0;
      if (leftAvailable !== rightAvailable) { return leftAvailable - rightAvailable; }
      if (left.total_cost !== right.total_cost) { return left.total_cost - right.total_cost; }
      if (left.delivery_days !== right.delivery_days) { return left.delivery_days - right.delivery_days; }
      if (left.marketplace !== right.marketplace) { return left.marketplace.localeCompare(right.marketplace); }
      return left.offer_id.localeCompare(right.offer_id);
    }).slice(0, MAX_OFFERS_PER_PRODUCT);
  }

  function loadApprovedOffers(sheet, tenant) {
    if (!sheet || sheet.getLastRow() < 2) { return {}; }
    var normalizedTenant = Utility.trim(tenant).toLowerCase();
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
    var map = {};
    rows.forEach(function (row) {
      try {
        var offer = fromRow(row);
        if (!offer.approved || offer.tenant !== normalizedTenant) { return; }
        var key = offer.tenant + '|' + offer.asin;
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
      var key = Utility.trim(record.tenant).toLowerCase() + '|' + Utility.trim(record.asin).toUpperCase();
      copy.marketplace_offers = (offerMap[key] || []).map(function (offer) {
        return {
          marketplace: offer.marketplace,
          product_url: offer.product_url,
          price: offer.price,
          shipping_fee: offer.shipping_fee,
          total_cost: offer.total_cost,
          currency: offer.currency,
          stock_status: offer.stock_status,
          delivery_days: offer.delivery_days
        };
      });
      return copy;
    });
  }

  return {
    SHEET_NAME: SHEET_NAME,
    HEADERS: HEADERS.slice(),
    MARKETPLACES: MARKETPLACES,
    MAX_OFFERS_PER_PRODUCT: MAX_OFFERS_PER_PRODUCT,
    ensureSheet: ensureSheet,
    validateUrl: validateUrl,
    normalizeOffer: normalizeOffer,
    rankOffers: rankOffers,
    loadApprovedOffers: loadApprovedOffers,
    attachOffers: attachOffers
  };
}());
