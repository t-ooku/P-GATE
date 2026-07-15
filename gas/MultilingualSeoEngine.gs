/**
 * Project GATE - MultilingualSeoEngine.gs
 * 日本語・英語・中国語・韓国語とローマ字検索用コンテンツを管理する。
 */
var MultilingualSeoEngine = (function () {
  'use strict';

  var ALIAS_SHEET_NAME = 'Search_Alias';
  var CONTENT_SHEET_NAME = 'Localized_Content';
  var SCORE_SHEET_NAME = 'Multilingual_SEO';
  var ALIAS_HEADERS = ['Tenant', 'ASIN', 'Alias', 'Language', 'Source', 'Approved', 'Updated_At'];
  var CONTENT_HEADERS = [
    'Tenant', 'ASIN', 'Language', 'Display_Name', 'Description', 'Keywords',
    'Source', 'Approved', 'Updated_At'
  ];
  var SCORE_HEADERS = [
    'Tenant', 'ASIN', 'Product_Name', 'Auto_Romaji', 'Approved_Romaji_Count',
    'Approved_English_Count', 'Approved_Chinese_Count', 'Approved_Korean_Count',
    'Multilingual_SEO_Score', 'Missing_Actions', 'Updated_At'
  ];
  var SUPPORTED_LANGUAGES = ['JA', 'EN', 'ZH', 'KO', 'ROMAJI'];

  var BASIC = {
    'あ':'a','い':'i','う':'u','え':'e','お':'o','か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko',
    'さ':'sa','し':'shi','す':'su','せ':'se','そ':'so','た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to',
    'な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no','は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
    'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo','や':'ya','ゆ':'yu','よ':'yo',
    'ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro','わ':'wa','を':'o','ん':'n',
    'が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go','ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo',
    'だ':'da','ぢ':'ji','づ':'zu','で':'de','ど':'do','ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo',
    'ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po','ぁ':'a','ぃ':'i','ぅ':'u','ぇ':'e','ぉ':'o'
  };
  var PAIRS = {
    'きゃ':'kya','きゅ':'kyu','きょ':'kyo','しゃ':'sha','しゅ':'shu','しょ':'sho',
    'ちゃ':'cha','ちゅ':'chu','ちょ':'cho','にゃ':'nya','にゅ':'nyu','にょ':'nyo',
    'ひゃ':'hya','ひゅ':'hyu','ひょ':'hyo','みゃ':'mya','みゅ':'myu','みょ':'myo',
    'りゃ':'rya','りゅ':'ryu','りょ':'ryo','ぎゃ':'gya','ぎゅ':'gyu','ぎょ':'gyo',
    'じゃ':'ja','じゅ':'ju','じょ':'jo','びゃ':'bya','びゅ':'byu','びょ':'byo',
    'ぴゃ':'pya','ぴゅ':'pyu','ぴょ':'pyo','ふぁ':'fa','ふぃ':'fi','ふぇ':'fe','ふぉ':'fo',
    'てぃ':'ti','でぃ':'di','うぃ':'wi','うぇ':'we','うぉ':'wo','しぇ':'she','ちぇ':'che','じぇ':'je'
  };

  function ensureSheets() {
    return {
      aliases: Utility.ensureSheet(Config.getSpreadsheet(), ALIAS_SHEET_NAME, ALIAS_HEADERS),
      content: Utility.ensureSheet(Config.getSpreadsheet(), CONTENT_SHEET_NAME, CONTENT_HEADERS),
      scores: Utility.ensureSheet(Config.getSpreadsheet(), SCORE_SHEET_NAME, SCORE_HEADERS)
    };
  }

  function toHiragana(value) {
    return String(value || '').replace(/[ァ-ヶ]/g, function (char) {
      return String.fromCharCode(char.charCodeAt(0) - 0x60);
    });
  }

  function lastVowel(value) {
    var match = String(value || '').match(/[aeiou](?!.*[aeiou])/);
    return match ? match[0] : '';
  }

  function romanizeText(value) {
    var text = toHiragana(value).toLowerCase();
    var output = '';
    var geminate = false;
    for (var i = 0; i < text.length; i += 1) {
      var char = text.charAt(i);
      if (char === 'っ') {
        geminate = true;
        continue;
      }
      if (char === 'ー') {
        output += lastVowel(output);
        continue;
      }
      var pair = text.slice(i, i + 2);
      var romaji = PAIRS[pair];
      if (romaji) {
        i += 1;
      } else {
        romaji = BASIC[char];
      }
      if (romaji) {
        if (geminate && /^[bcdfghjklmnpqrstvwxyz]/.test(romaji)) {
          output += romaji.charAt(0);
        }
        output += romaji;
        geminate = false;
      } else if (/[a-z0-9]/.test(char)) {
        output += char;
      } else {
        output += ' ';
        geminate = false;
      }
    }
    return output.replace(/\s+/g, ' ').trim();
  }

  function normalizeAliasRow(row) {
    return {
      tenant: Utility.trim(row[0]).toLowerCase(),
      asin: Utility.trim(row[1]).toUpperCase(),
      alias: Utility.trim(row[2]),
      language: Utility.trim(row[3]).toUpperCase(),
      source: Utility.trim(row[4]),
      approved: row[5] === true || String(row[5]).toUpperCase() === 'TRUE',
      updated_at: row[6]
    };
  }

  function loadApprovedAliases(sheet, tenant) {
    var byAsin = {};
    if (sheet.getLastRow() < 2) {
      return byAsin;
    }
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, ALIAS_HEADERS.length).getValues();
    for (var i = 0; i < rows.length; i += 1) {
      var alias = normalizeAliasRow(rows[i]);
      if (!alias.approved || SUPPORTED_LANGUAGES.indexOf(alias.language) < 0 || alias.tenant !== String(tenant || '').toLowerCase() || !alias.asin || !alias.alias) {
        continue;
      }
      if (!byAsin[alias.asin]) { byAsin[alias.asin] = []; }
      byAsin[alias.asin].push(alias);
    }
    return byAsin;
  }

  function loadApprovedContent(sheet, tenant, language) {
    var byAsin = {};
    if (sheet.getLastRow() < 2) {
      return byAsin;
    }
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, CONTENT_HEADERS.length).getValues();
    var normalizedTenant = String(tenant || '').toLowerCase();
    var normalizedLanguage = String(language || 'JA').toUpperCase();
    for (var i = 0; i < rows.length; i += 1) {
      var approved = rows[i][7] === true || String(rows[i][7]).toUpperCase() === 'TRUE';
      if (!approved || Utility.trim(rows[i][0]).toLowerCase() !== normalizedTenant || Utility.trim(rows[i][2]).toUpperCase() !== normalizedLanguage) {
        continue;
      }
      var asin = Utility.trim(rows[i][1]).toUpperCase();
      if (!asin) { continue; }
      byAsin[asin] = {
        language: normalizedLanguage,
        display_name: Utility.trim(rows[i][3]),
        description: Utility.trim(rows[i][4]),
        keywords: Utility.trim(rows[i][5]),
        source: Utility.trim(rows[i][6]),
        updated_at: rows[i][8]
      };
    }
    return byAsin;
  }

  function attachAliases(records, aliasMap) {
    return records.map(function (record) {
      var copy = {};
      Object.keys(record).forEach(function (key) { copy[key] = record[key]; });
      copy.search_aliases = (aliasMap[String(record.asin || '').toUpperCase()] || []).map(function (item) {
        return item.alias;
      });
      return copy;
    });
  }

  function attachLocalizedContent(records, contentMap, language) {
    return records.map(function (record) {
      var copy = {};
      Object.keys(record).forEach(function (key) { copy[key] = record[key]; });
      var localized = contentMap[String(record.asin || '').toUpperCase()] || null;
      copy.requested_language = String(language || 'JA').toUpperCase();
      copy.localized_content = localized;
      if (localized) {
        copy.search_aliases = (copy.search_aliases || []).concat([
          localized.display_name, localized.description, localized.keywords
        ].filter(function (value) { return Boolean(value); }));
      }
      return copy;
    });
  }

  function detectLanguage(value) {
    var text = String(value || '');
    if (/[\uac00-\ud7af]/.test(text)) { return 'KO'; }
    if (/[\u3040-\u30ff]/.test(text)) { return 'JA'; }
    if (/[\u3400-\u9fff]/.test(text)) { return 'ZH'; }
    if (/[a-z]/i.test(text)) { return 'EN'; }
    return 'JA';
  }

  function scoreRecord(record, aliases) {
    aliases = aliases || [];
    var romajiCount = aliases.filter(function (item) { return item.language === 'ROMAJI'; }).length;
    var englishCount = aliases.filter(function (item) { return item.language === 'EN'; }).length;
    var chineseCount = aliases.filter(function (item) { return item.language === 'ZH'; }).length;
    var koreanCount = aliases.filter(function (item) { return item.language === 'KO'; }).length;
    var autoRomaji = romanizeText(record.product_name || '');
    var score = 0;
    if (autoRomaji.length >= 3) { score += 10; }
    if (romajiCount > 0) { score += 20; }
    if (englishCount > 0) { score += 25; }
    if (chineseCount > 0) { score += 20; }
    if (koreanCount > 0) { score += 20; }
    if (/[a-z]/i.test(String(record.manufacturer || ''))) { score += 5; }
    var missing = [];
    if (!autoRomaji) { missing.push('商品名にカナ読みを追加'); }
    if (romajiCount === 0) { missing.push('承認済みローマ字別名を追加'); }
    if (englishCount === 0) { missing.push('承認済み英語別名を追加'); }
    if (chineseCount === 0) { missing.push('承認済み中国語別名を追加'); }
    if (koreanCount === 0) { missing.push('承認済み韓国語別名を追加'); }
    return {
      auto_romaji: autoRomaji, romaji_count: romajiCount, english_count: englishCount,
      chinese_count: chineseCount, korean_count: koreanCount, score: score, missing: missing
    };
  }

  function refresh() {
    var sheets = ensureSheets();
    var records = DatabaseEngine.getAllRecords();
    var aliasCache = {};
    var rows = [];
    var now = Utility.nowIso();
    for (var i = 0; i < records.length; i += 1) {
      var tenant = String(records[i].tenant || '').toLowerCase();
      if (!aliasCache[tenant]) {
        aliasCache[tenant] = loadApprovedAliases(sheets.aliases, tenant);
      }
      var aliases = aliasCache[tenant][String(records[i].asin || '').toUpperCase()] || [];
      var result = scoreRecord(records[i], aliases);
      rows.push([
        tenant, records[i].asin, records[i].product_name, result.auto_romaji,
        result.romaji_count, result.english_count, result.chinese_count,
        result.korean_count, result.score,
        result.missing.join(' / '), now
      ]);
    }
    if (sheets.scores.getLastRow() > 1) {
      sheets.scores.getRange(2, 1, sheets.scores.getLastRow() - 1, SCORE_HEADERS.length).clearContent();
    }
    if (rows.length > 0) {
      sheets.scores.getRange(2, 1, rows.length, SCORE_HEADERS.length).setValues(rows);
    }
    return { scored: rows.length };
  }

  return {
    ALIAS_SHEET_NAME: ALIAS_SHEET_NAME,
    CONTENT_SHEET_NAME: CONTENT_SHEET_NAME,
    SCORE_SHEET_NAME: SCORE_SHEET_NAME,
    ALIAS_HEADERS: ALIAS_HEADERS.slice(),
    CONTENT_HEADERS: CONTENT_HEADERS.slice(),
    SCORE_HEADERS: SCORE_HEADERS.slice(),
    ensureSheets: ensureSheets,
    romanizeText: romanizeText,
    detectLanguage: detectLanguage,
    loadApprovedAliases: loadApprovedAliases,
    loadApprovedContent: loadApprovedContent,
    attachAliases: attachAliases,
    attachLocalizedContent: attachLocalizedContent,
    scoreRecord: scoreRecord,
    refresh: refresh
  };
}());

function refreshProjectGateMultilingualSeo() {
  'use strict';
  return MultilingualSeoEngine.refresh();
}
