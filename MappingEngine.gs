/**
 * Project GATE - OpportunityEngine.gs
 * MVP範囲のProfitとSEOを100点満点で別々に出力する。
 * SEOは固定費ゼロの再現可能な情報充足度スコアとし、結果をAI_Cacheへ保存する。
 */
var OpportunityEngine = (function () {
  'use strict';

  var SHEET_NAME = 'Opportunity';
  var CACHE_SHEET_NAME = 'AI_Cache';
  var SCORE_VERSION = 'mvp-v1';
  var HEADERS = [
    'Tenant', 'Record_Key', 'ASIN', 'SKU', 'Profit', 'Profit_Score',
    'SEO_Score', 'Score_Version', 'Source_Hash', 'Updated_At'
  ];
  var CACHE_HEADERS = ['Cache_Key', 'Source_Hash', 'Payload_JSON', 'Updated_At', 'Expires_At'];

  function ensureSheets() {
    return {
      opportunity: Utility.ensureSheet(Config.getSpreadsheet(), SHEET_NAME, HEADERS),
      cache: Utility.ensureSheet(Config.getSpreadsheet(), CACHE_SHEET_NAME, CACHE_HEADERS)
    };
  }

  function calculateProfitScores(records) {
    var positives = records
      .map(function (record) { return Number(record.profit || 0); })
      .filter(function (value) { return value > 0; })
      .sort(function (a, b) { return a - b; });
    return records.map(function (record) {
      var profit = Number(record.profit || 0);
      if (profit <= 0 || positives.length === 0) {
        return 0;
      }
      var rank = 0;
      for (var i = 0; i < positives.length; i += 1) {
        if (positives[i] <= profit) {
          rank = i + 1;
        }
      }
      return Math.round((rank / positives.length) * 100);
    });
  }

  function calculateSeoScore(record) {
    var score = 0;
    var titleLength = String(record.product_name || '').length;
    if (titleLength >= 20 && titleLength <= 160) {
      score += 40;
    }
    if (String(record.manufacturer || '').trim()) {
      score += 20;
    }
    if (String(record.image || '').trim()) {
      score += 20;
    }
    if (String(record.amazon_jp_url || '').trim() || String(record.amazon_us_url || '').trim()) {
      score += 20;
    }
    return score;
  }

  function seoSourceHash(record) {
    return Utility.sha256(JSON.stringify({
      product_name: record.product_name || '',
      manufacturer: record.manufacturer || '',
      image: record.image || '',
      amazon_jp_url: record.amazon_jp_url || '',
      amazon_us_url: record.amazon_us_url || '',
      version: SCORE_VERSION
    }));
  }

  function loadCache(sheet) {
    var map = {};
    if (sheet.getLastRow() < 2) {
      return map;
    }
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, CACHE_HEADERS.length).getValues();
    for (var i = 0; i < values.length; i += 1) {
      map[String(values[i][0])] = values[i];
    }
    return map;
  }

  function refresh(records) {
    var sheets = ensureSheets();
    var cache = loadCache(sheets.cache);
    var profitScores = calculateProfitScores(records);
    var now = new Date();
    var expires = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
    var outputRows = [];

    for (var i = 0; i < records.length; i += 1) {
      var record = records[i];
      var sourceHash = seoSourceHash(record);
      var cacheKey = 'seo:' + SCORE_VERSION + ':' + record.record_key;
      var cached = cache[cacheKey];
      var seoScore;
      if (cached && String(cached[1]) === sourceHash && new Date(cached[4]).getTime() > now.getTime()) {
        seoScore = JSON.parse(String(cached[2])).seoScore;
      } else {
        seoScore = calculateSeoScore(record);
        cache[cacheKey] = [
          cacheKey,
          sourceHash,
          JSON.stringify({ seoScore: seoScore }),
          now.toISOString(),
          expires
        ];
      }
      outputRows.push([
        record.tenant,
        record.record_key,
        record.asin,
        record.sku,
        Number(record.profit || 0),
        profitScores[i],
        seoScore,
        SCORE_VERSION,
        sourceHash,
        now.toISOString()
      ]);
    }

    if (sheets.opportunity.getLastRow() > 1) {
      sheets.opportunity.getRange(2, 1, sheets.opportunity.getLastRow() - 1, HEADERS.length).clearContent();
    }
    if (outputRows.length > 0) {
      sheets.opportunity.getRange(2, 1, outputRows.length, HEADERS.length).setValues(outputRows);
    }

    var cacheRows = Object.keys(cache).sort().map(function (key) { return cache[key]; });
    if (sheets.cache.getLastRow() > 1) {
      sheets.cache.getRange(2, 1, sheets.cache.getLastRow() - 1, CACHE_HEADERS.length).clearContent();
    }
    if (cacheRows.length > 0) {
      sheets.cache.getRange(2, 1, cacheRows.length, CACHE_HEADERS.length).setValues(cacheRows);
    }
    return { scored: outputRows.length, cacheEntries: cacheRows.length };
  }

  return {
    SHEET_NAME: SHEET_NAME,
    CACHE_SHEET_NAME: CACHE_SHEET_NAME,
    SCORE_VERSION: SCORE_VERSION,
    HEADERS: HEADERS.slice(),
    CACHE_HEADERS: CACHE_HEADERS.slice(),
    ensureSheets: ensureSheets,
    calculateProfitScores: calculateProfitScores,
    calculateSeoScore: calculateSeoScore,
    refresh: refresh
  };
}());

