/**
 * 輸入不可・キャンセル需要を匿名化し、国内代替候補の検索条件へ変換する。
 * 注文番号原文・氏名・住所・連絡先・理由全文は保存しない。
 */
var UnmetDemandEngine = (function () {
  'use strict';
  var MAX_RECORDS_PER_REQUEST = 200;
  var DEFAULT_SYNC_ENDPOINT = 'https://hoshilu.app/api/internal/unmet-demand/sync';
  var RULES = [
    { code: 'LITHIUM_BATTERY', risk: 'HIGH', words: ['リチウム','バッテリー','電池','lithium','battery'] },
    { code: 'LIQUID', risk: 'HIGH', words: ['液体','リキッド','液状','liquid','fluid','ml','oz'] },
    { code: 'HAZARDOUS_AIR_CARGO', risk: 'HIGH', words: ['危険物','可燃','引火','エアゾール','スプレー','hazardous','flammable','aerosol'] },
    { code: 'OVERSIZE_OR_OVERWEIGHT', risk: 'MEDIUM', words: ['大型','重量','重すぎ','サイズ超過','oversize','overweight','too large'] },
    { code: 'FOOD_PLANT_ANIMAL', risk: 'HIGH', words: ['食品','肉','植物','種子','動物','food','meat','plant','seed','animal'] },
    { code: 'REGULATORY_OR_CERTIFICATION', risk: 'HIGH', words: ['医薬品','薬機法','pse','技適','認証','規制','medical','certification','regulated'] },
    { code: 'OUT_OF_STOCK', risk: 'LOW', words: ['在庫切れ','欠品','売り切れ','out of stock','unavailable'] },
    { code: 'DELIVERY_TIME', risk: 'LOW', words: ['納期','間に合わ','遅い','delivery','too late'] },
    { code: 'PRICE', risk: 'LOW', words: ['価格','高い','予算','price','expensive','cost'] },
    { code: 'CUSTOMER_CHANGED_MIND', risk: 'LOW', words: ['不要になった','気が変わった','間違え','changed mind','ordered by mistake'] }
  ];

  function normalize(value) {
    return String(value || '').normalize ? String(value || '').normalize('NFKC').toLowerCase() : String(value || '').toLowerCase();
  }

  function classify(reason) {
    var text = normalize(reason);
    for (var i = 0; i < RULES.length; i += 1) {
      for (var j = 0; j < RULES[i].words.length; j += 1) {
        if (text.indexOf(RULES[i].words[j]) >= 0) {
          return { restriction_class: RULES[i].code, risk: RULES[i].risk, evidence_code: RULES[i].words[j] };
        }
      }
    }
    return { restriction_class: 'UNKNOWN', risk: 'MEDIUM', evidence_code: '' };
  }

  function occurredMonth(value) {
    var date = value instanceof Date ? value : new Date(value);
    return isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 7);
  }

  function buildRecord(input) {
    input = input || {};
    var classification = classify(input.import_restriction || input.customer_cancellation || '');
    return {
      tenant: Utility.trim(input.tenant).toLowerCase(),
      source_order_hash: Utility.sha256(Utility.trim(input.order_id)),
      source_product_id: Utility.trim(input.asin || input.product_id).toUpperCase(),
      desired_use: Utility.trim(input.desired_use).slice(0, 200),
      desired_function: Utility.trim(input.desired_function).slice(0, 200),
      desired_ingredient_or_material: Utility.trim(input.desired_ingredient_or_material).slice(0, 200),
      restriction_class: classification.restriction_class,
      restriction_evidence: classification.evidence_code,
      requested_country: Utility.trim(input.requested_country || 'JP').toUpperCase(),
      occurred_month: occurredMonth(input.occurred_at),
      anonymous_demand_count: 1,
      domestic_alternative_status: 'UNRESOLVED',
      verification_level: classification.risk === 'HIGH' ? 'HUMAN_REQUIRED' : 'UNVERIFIED'
    };
  }

  function alternativeSearchTerms(record, productName) {
    var terms = [Utility.trim(productName), record.desired_use, record.desired_function, record.desired_ingredient_or_material];
    if (record.restriction_class === 'LIQUID') { terms.push('国内販売', '同用途', '非液体'); }
    if (record.restriction_class === 'LITHIUM_BATTERY') { terms.push('国内PSE', '電池別売'); }
    if (record.restriction_class === 'OVERSIZE_OR_OVERWEIGHT') { terms.push('小型', '軽量', '国内配送'); }
    if (record.restriction_class === 'HAZARDOUS_AIR_CARGO') { terms.push('非危険物', '国内販売'); }
    var seen = {};
    return terms.filter(function (term) {
      term = Utility.trim(term);
      if (!term || seen[term]) { return false; }
      seen[term] = true;
      return true;
    });
  }

  function syncRecord(record) {
    return {
      tenant: Utility.trim(record.tenant).toLowerCase(),
      source_order_hash: Utility.trim(record.source_order_hash).toLowerCase(),
      source_product_id: Utility.trim(record.source_product_id).toUpperCase(),
      restriction_class: Utility.trim(record.restriction_class).toUpperCase(),
      occurred_month: Utility.trim(record.occurred_month),
      anonymous_demand_count: Math.max(1, Number(record.anonymous_demand_count || 1)),
      domestic_alternative_status: Utility.trim(record.domestic_alternative_status || 'UNRESOLVED').toUpperCase(),
      verified_alternative_ids: (record.verified_alternative_ids || []).slice(0, 3),
      verification_level: Utility.trim(record.verification_level || 'UNVERIFIED').toUpperCase()
    };
  }

  function sync(records) {
    records = records || [];
    if (!records.length) { return { requests: 0, sent: 0 }; }
    var properties = PropertiesService.getScriptProperties();
    var secret = properties.getProperty('UNMET_DEMAND_SYNC_SECRET') || '';
    if (secret.length < 32) {
      throw Utility.createError('UNMET_DEMAND_SYNC_SECRET_MISSING', 'UNMET_DEMAND_SYNC_SECRETが未設定です。');
    }
    var endpoint = properties.getProperty('UNMET_DEMAND_SYNC_URL') || DEFAULT_SYNC_ENDPOINT;
    var requests = 0;
    var sent = 0;
    for (var offset = 0; offset < records.length; offset += MAX_RECORDS_PER_REQUEST) {
      var chunk = records.slice(offset, offset + MAX_RECORDS_PER_REQUEST).map(syncRecord);
      var response = UrlFetchApp.fetch(endpoint, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-hoshilu-internal-secret': secret },
        payload: JSON.stringify({ records: chunk }),
        muteHttpExceptions: true
      });
      requests += 1;
      if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
        throw Utility.createError('UNMET_DEMAND_SYNC_HTTP_ERROR', '輸入制限Knowledgeの同期に失敗しました。', {
          status: response.getResponseCode(), offset: offset
        });
      }
      sent += chunk.length;
    }
    return { requests: requests, sent: sent };
  }

  return {
    MAX_RECORDS_PER_REQUEST: MAX_RECORDS_PER_REQUEST,
    RULES: RULES.slice(),
    classify: classify,
    buildRecord: buildRecord,
    alternativeSearchTerms: alternativeSearchTerms,
    syncRecord: syncRecord,
    sync: sync
  };
}());
