/**
 * Project GATE - KnowledgeEngine.gs
 * エンドユーザーの質問と商品情報を照合し、根拠付き候補を返す。
 * 利益はランキングへ使用せず、質問との関連性・情報充足・在庫だけを使う。
 */
var KnowledgeEngine = (function () {
  'use strict';

  var QUERY_LOG_SHEET_NAME = 'Knowledge_Query_Log';
  var QUERY_LOG_HEADERS = [
    'Query_ID', 'Queried_At', 'Tenant', 'Account_Type', 'Account_ID',
    'Contract_ID', 'Query_Hash', 'Language', 'Category', 'Result_Count', 'Confidence',
    'Decision_ID', 'Status'
  ];
  var MAX_RESULTS = 3;
  var MIN_RELEVANCE = 0.2;

  function ensureSheet() {
    return Utility.ensureSheet(Config.getSpreadsheet(), QUERY_LOG_SHEET_NAME, QUERY_LOG_HEADERS);
  }

  function normalizeText(value) {
    var text = String(value == null ? '' : value).toLowerCase();
    if (text.normalize) {
      text = text.normalize('NFKC');
    }
    return text.replace(/[\s　]+/g, ' ').trim();
  }

  function tokenize(value) {
    var text = normalizeText(value);
    var tokens = [];
    var ascii = text.match(/[a-z0-9]{2,}/g) || [];
    tokens = tokens.concat(ascii);
    var japanese = text.match(/[\u3040-\u30ff\u3400-\u9fffー]{2,}/g) || [];
    for (var i = 0; i < japanese.length; i += 1) {
      var segment = japanese[i];
      tokens.push(segment);
      for (var j = 0; j < segment.length - 1; j += 1) {
        tokens.push(segment.slice(j, j + 2));
      }
    }
    var korean = text.match(/[\uac00-\ud7af]{2,}/g) || [];
    for (var k = 0; k < korean.length; k += 1) {
      tokens.push(korean[k]);
      for (var h = 0; h < korean[k].length - 1; h += 1) {
        tokens.push(korean[k].slice(h, h + 2));
      }
    }
    var seen = {};
    return tokens.filter(function (token) {
      if (!token || seen[token]) {
        return false;
      }
      seen[token] = true;
      return true;
    });
  }

  function informationScore(record) {
    var score = 0;
    if (Utility.trim(record.product_name)) { score += 30; }
    if (Utility.trim(record.manufacturer)) { score += 20; }
    if (Utility.trim(record.image)) { score += 20; }
    if (Utility.trim(record.amazon_jp_url) || Utility.trim(record.amazon_us_url)) { score += 20; }
    if (Number(record.stock || 0) > 0) { score += 10; }
    return score;
  }

  function confidenceFor(relevance) {
    if (relevance >= 0.65) { return 'HIGH'; }
    if (relevance >= 0.35) { return 'MEDIUM'; }
    return 'LOW';
  }

  function scoreRecord(queryTokens, normalizedQuery, record) {
    var baseText = [
      record.product_name || '', record.manufacturer || '', record.asin || '', record.sku || '',
      (record.search_aliases || []).join(' ')
    ].join(' ');
    var searchable = normalizeText([
      baseText, MultilingualSeoEngine.romanizeText(baseText)
    ].join(' '));
    var matched = [];
    for (var i = 0; i < queryTokens.length; i += 1) {
      if (searchable.indexOf(queryTokens[i]) >= 0) {
        matched.push(queryTokens[i]);
      }
    }
    var relevance = queryTokens.length > 0 ? matched.length / queryTokens.length : 0;
    if (normalizedQuery.length >= 2 && searchable.indexOf(normalizedQuery) >= 0) {
      relevance = 1;
    }
    var info = informationScore(record);
    var matchScore = Math.round((relevance * 85 + (info / 100) * 15) * 100) / 100;
    return {
      record: record,
      relevance: relevance,
      match_score: matchScore,
      confidence: confidenceFor(relevance),
      matched_terms: matched,
      information_score: info
    };
  }

  function search(query, records, limit) {
    var normalizedQuery = normalizeText(query);
    if (normalizedQuery.length < 2) {
      throw Utility.createError('KNOWLEDGE_QUERY_TOO_SHORT', '質問は2文字以上で入力してください。');
    }
    var queryTokens = tokenize(normalizedQuery);
    if (queryTokens.length === 0) {
      throw Utility.createError('KNOWLEDGE_QUERY_EMPTY', '検索可能な語句がありません。');
    }
    var scored = records.map(function (record) {
      return scoreRecord(queryTokens, normalizedQuery, record);
    }).filter(function (item) {
      return item.relevance >= MIN_RELEVANCE;
    });
    scored.sort(function (left, right) {
      if (right.match_score !== left.match_score) { return right.match_score - left.match_score; }
      if (right.information_score !== left.information_score) { return right.information_score - left.information_score; }
      return String(left.record.asin || '').localeCompare(String(right.record.asin || ''));
    });
    return scored.slice(0, Math.min(Number(limit || MAX_RESULTS), MAX_RESULTS)).map(function (item, index) {
      return {
        rank: index + 1,
        asin: item.record.asin,
        sku: item.record.sku || '',
        product_name: item.record.product_name,
        display_name: item.record.localized_content && item.record.localized_content.display_name
          ? item.record.localized_content.display_name : item.record.product_name,
        description: item.record.localized_content ? item.record.localized_content.description : '',
        language: item.record.requested_language || 'JA',
        manufacturer: item.record.manufacturer || '',
        image: item.record.image || '',
        stock: Number(item.record.stock || 0),
        amazon_jp_url: item.record.amazon_jp_url || '',
        amazon_us_url: item.record.amazon_us_url || '',
        match_score: item.match_score,
        confidence: item.confidence,
        evidence: {
          matched_terms: item.matched_terms,
          information_score: item.information_score,
          source_hash: item.record.row_hash || '',
          imported_at: item.record.imported_at || ''
        }
      };
    });
  }

  function findContract(contractId) {
    var sheets = ContractPolicyEngine.ensureSheets();
    var contracts = ContractPolicyEngine.loadContracts(sheets.contracts);
    for (var i = 0; i < contracts.length; i += 1) {
      if (contracts[i].contract_id === contractId) {
        return contracts[i];
      }
    }
    throw Utility.createError('CONTRACT_NOT_FOUND', '契約が見つかりません: ' + contractId);
  }

  function writeQueryLog(values) {
    var sheet = ensureSheet();
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, QUERY_LOG_HEADERS.length).setValues([values]);
  }

  function filterRecordsByTenant(records, tenant) {
    var normalizedTenant = String(tenant || '').toLowerCase();
    return records.filter(function (record) {
      return String(record.tenant || '').toLowerCase() === normalizedTenant;
    });
  }

  function answer(request) {
    request = request || {};
    if (request.consent !== true) {
      throw Utility.createError('KNOWLEDGE_CONSENT_REQUIRED', '質問処理には利用同意が必要です。');
    }
    var query = Utility.trim(request.query);
    var category = Utility.trim(request.category).toUpperCase();
    if (!category) {
      throw Utility.createError('KNOWLEDGE_CATEGORY_REQUIRED', 'Categoryは必須です。');
    }
    var contract = findContract(Utility.trim(request.contract_id));
    var allRecords = DatabaseEngine.getAllRecords();
    var tenantRecords = filterRecordsByTenant(allRecords, contract.tenant);
    var aliasSheets = MultilingualSeoEngine.ensureSheets();
    var aliasMap = MultilingualSeoEngine.loadApprovedAliases(aliasSheets.aliases, contract.tenant);
    tenantRecords = MultilingualSeoEngine.attachAliases(tenantRecords, aliasMap);
    var language = MultilingualSeoEngine.detectLanguage(query);
    var contentMap = MultilingualSeoEngine.loadApprovedContent(aliasSheets.content, contract.tenant, language);
    tenantRecords = MultilingualSeoEngine.attachLocalizedContent(tenantRecords, contentMap, language);
    var candidates = search(query, tenantRecords, MAX_RESULTS);
    var queryId = Utility.uuid();
    var queriedAt = Utility.nowIso();
    var queryHash = Utility.sha256(normalizeText(query));
    var dateJst = new Date(new Date(queriedAt).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

    if (candidates.length === 0) {
      writeQueryLog([
        queryId, queriedAt, contract.tenant, contract.account_type, contract.account_id,
        contract.contract_id, queryHash, language, category, 0, '', '', 'NO_MATCH'
      ]);
      return {
        query_id: queryId,
        status: 'NO_MATCH',
        language: language,
        message: localizedMessage('NO_MATCH', language),
        candidates: []
      };
    }

    var policy = ContractPolicyEngine.decide({
      contract_id: contract.contract_id,
      date_jst: dateJst,
      category: category,
      knowledge_key: queryHash,
      answer_payload: candidates.map(function (candidate) {
        return { asin: candidate.asin, rank: candidate.rank, evidence: candidate.evidence.source_hash };
      })
    });
    var status = policy.allowed ? 'ANSWERED' : 'BLOCKED_BY_POLICY';
    writeQueryLog([
      queryId, queriedAt, contract.tenant, contract.account_type, contract.account_id,
      contract.contract_id, queryHash, language, category, policy.allowed ? candidates.length : 0,
      candidates[0].confidence, policy.decision_id, status
    ]);
    return {
      query_id: queryId,
      status: status,
      language: language,
      message: localizedMessage(policy.allowed ? 'ANSWERED' : 'BLOCKED', language),
      disclosure_required: policy.disclosure_required,
      policy_reason: policy.reason,
      candidates: policy.allowed ? candidates : []
    };
  }

  function localizedMessage(status, language) {
    var messages = {
      JA: {
        ANSWERED: '質問との関連性と確認可能な商品情報を基に候補を表示します。',
        NO_MATCH: '確認できる根拠が不足しているため、商品を推薦できません。',
        BLOCKED: '契約・競合ポリシーにより、この回答は表示できません。'
      },
      EN: {
        ANSWERED: 'Here are products supported by the available product data.',
        NO_MATCH: 'I could not find enough verified information to recommend a product.',
        BLOCKED: 'This answer cannot be displayed under the contract and competition policy.'
      },
      ZH: {
        ANSWERED: '以下商品候选基于您的问题和已确认的商品信息。',
        NO_MATCH: '没有足够的已确认信息，因此无法推荐商品。',
        BLOCKED: '根据合同及竞争政策，无法显示此回答。'
      },
      KO: {
        ANSWERED: '질문과 확인된 상품 정보를 바탕으로 후보 상품을 안내합니다.',
        NO_MATCH: '확인된 정보가 부족하여 상품을 추천할 수 없습니다.',
        BLOCKED: '계약 및 경쟁 정책에 따라 이 답변을 표시할 수 없습니다.'
      }
    };
    var selected = messages[language] || messages.JA;
    return selected[status];
  }

  return {
    QUERY_LOG_SHEET_NAME: QUERY_LOG_SHEET_NAME,
    QUERY_LOG_HEADERS: QUERY_LOG_HEADERS.slice(),
    ensureSheet: ensureSheet,
    normalizeText: normalizeText,
    tokenize: tokenize,
    informationScore: informationScore,
    filterRecordsByTenant: filterRecordsByTenant,
    localizedMessage: localizedMessage,
    search: search,
    answer: answer
  };
}());

function buildProjectGateKnowledgeAnswer(request) {
  'use strict';
  return KnowledgeEngine.answer(request);
}
