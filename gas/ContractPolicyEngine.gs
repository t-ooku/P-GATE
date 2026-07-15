/**
 * Project GATE - ContractPolicyEngine.gs
 * 顧客契約、競合受入れ、独占条件を推薦前に判定する。
 */
var ContractPolicyEngine = (function () {
  'use strict';

  var CONTRACT_SHEET_NAME = 'Client_Contracts';
  var DECISION_SHEET_NAME = 'Recommendation_Decisions';
  var CONTRACT_HEADERS = [
    'Contract_ID', 'Tenant', 'Account_Type', 'Account_ID', 'Status',
    'Start_Date', 'End_Date', 'Category_Scope', 'Competitor_Group',
    'Exclusivity_Mode', 'Competitor_Acceptance', 'Benchmark_Consent', 'Updated_At'
  ];
  var DECISION_HEADERS = [
    'Decision_ID', 'Decided_At', 'Contract_ID', 'Tenant', 'Account_Type',
    'Account_ID', 'Knowledge_Key', 'Answer_Signature', 'Category', 'Allowed',
    'Reason', 'Disclosure_Required'
  ];
  var ACCOUNT_TYPES = ['SELLER', 'MANUFACTURER'];
  var STATUSES = ['ACTIVE', 'PAUSED', 'ENDED'];
  var EXCLUSIVITY_MODES = ['NONE', 'ANSWER', 'CATEGORY'];

  function ensureSheets() {
    return {
      contracts: Utility.ensureSheet(Config.getSpreadsheet(), CONTRACT_SHEET_NAME, CONTRACT_HEADERS),
      decisions: Utility.ensureSheet(Config.getSpreadsheet(), DECISION_SHEET_NAME, DECISION_HEADERS)
    };
  }

  function required(value, field) {
    var text = Utility.trim(value);
    if (!text) {
      throw Utility.createError('CONTRACT_FIELD_REQUIRED', field + 'は必須です。', { field: field });
    }
    return text;
  }

  function booleanValue(value) {
    return value === true || String(value || '').toUpperCase() === 'TRUE';
  }

  function normalizeDate(value, field, allowBlank) {
    var text = Utility.trim(value);
    if (!text && allowBlank) {
      return '';
    }
    var parsed = new Date(text + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
      throw Utility.createError('CONTRACT_DATE_INVALID', field + 'はYYYY-MM-DD形式で指定してください。');
    }
    return text;
  }

  function parseCategoryScope(value) {
    var categories = String(value || '*').split(',').map(function (item) {
      return Utility.trim(item).toUpperCase();
    }).filter(function (item) { return Boolean(item); });
    return categories.length > 0 ? categories : ['*'];
  }

  function normalizeContract(source) {
    source = source || {};
    var accountType = required(source.account_type, 'Account_Type').toUpperCase();
    var status = required(source.status, 'Status').toUpperCase();
    var exclusivity = required(source.exclusivity_mode || 'NONE', 'Exclusivity_Mode').toUpperCase();
    if (ACCOUNT_TYPES.indexOf(accountType) < 0) {
      throw Utility.createError('CONTRACT_ACCOUNT_TYPE_INVALID', '未対応のAccount_Typeです: ' + accountType);
    }
    if (STATUSES.indexOf(status) < 0) {
      throw Utility.createError('CONTRACT_STATUS_INVALID', '未対応のStatusです: ' + status);
    }
    if (EXCLUSIVITY_MODES.indexOf(exclusivity) < 0) {
      throw Utility.createError('CONTRACT_EXCLUSIVITY_INVALID', '未対応のExclusivity_Modeです: ' + exclusivity);
    }
    var startDate = normalizeDate(source.start_date, 'Start_Date', false);
    var endDate = normalizeDate(source.end_date, 'End_Date', true);
    if (endDate && endDate < startDate) {
      throw Utility.createError('CONTRACT_DATE_RANGE_INVALID', 'End_DateがStart_Dateより前です。');
    }
    return {
      contract_id: required(source.contract_id, 'Contract_ID'),
      tenant: required(source.tenant, 'Tenant').toLowerCase(),
      account_type: accountType,
      account_id: required(source.account_id, 'Account_ID'),
      status: status,
      start_date: startDate,
      end_date: endDate,
      categories: parseCategoryScope(source.category_scope),
      competitor_group: Utility.trim(source.competitor_group).toUpperCase(),
      exclusivity_mode: exclusivity,
      competitor_acceptance: booleanValue(source.competitor_acceptance),
      benchmark_consent: booleanValue(source.benchmark_consent),
      updated_at: source.updated_at || Utility.nowIso()
    };
  }

  function fromContractRow(row) {
    return normalizeContract({
      contract_id: row[0], tenant: row[1], account_type: row[2], account_id: row[3],
      status: row[4], start_date: row[5], end_date: row[6], category_scope: row[7],
      competitor_group: row[8], exclusivity_mode: row[9], competitor_acceptance: row[10],
      benchmark_consent: row[11], updated_at: row[12]
    });
  }

  function isActive(contract, dateKey) {
    if (!contract || contract.status !== 'ACTIVE') {
      return false;
    }
    return contract.start_date <= dateKey && (!contract.end_date || contract.end_date >= dateKey);
  }

  function includesCategory(contract, category) {
    var normalized = Utility.trim(category).toUpperCase();
    return contract.categories.indexOf('*') >= 0 || contract.categories.indexOf(normalized) >= 0;
  }

  function canonicalStringify(value) {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return '[' + value.map(canonicalStringify).join(',') + ']';
    }
    var keys = Object.keys(value).sort();
    return '{' + keys.map(function (key) {
      return JSON.stringify(key) + ':' + canonicalStringify(value[key]);
    }).join(',') + '}';
  }

  function answerSignature(answerPayload) {
    return Utility.sha256(canonicalStringify(answerPayload || {}));
  }

  function contractMap(contracts) {
    var map = {};
    for (var i = 0; i < contracts.length; i += 1) {
      map[contracts[i].contract_id] = contracts[i];
    }
    return map;
  }

  function allow(reason, disclosureRequired, signature) {
    return { allowed: true, reason: reason, disclosure_required: Boolean(disclosureRequired), answer_signature: signature };
  }

  function block(reason, signature) {
    return { allowed: false, reason: reason, disclosure_required: false, answer_signature: signature };
  }

  function evaluate(request, targetContract, existingAssignments, contracts) {
    request = request || {};
    existingAssignments = existingAssignments || [];
    contracts = contracts || [];
    var dateKey = normalizeDate(request.date_jst, 'Date_JST', false);
    var category = required(request.category, 'Category').toUpperCase();
    var signature = request.answer_signature || answerSignature(request.answer_payload);
    if (!isActive(targetContract, dateKey)) {
      return block('TARGET_CONTRACT_INACTIVE', signature);
    }
    if (!includesCategory(targetContract, category)) {
      return block('CATEGORY_OUT_OF_SCOPE', signature);
    }

    var byId = contractMap(contracts.concat([targetContract]));
    var disclosureRequired = false;
    for (var i = 0; i < existingAssignments.length; i += 1) {
      var assignment = existingAssignments[i];
      if (assignment.allowed === false || assignment.contract_id === targetContract.contract_id) {
        continue;
      }
      var existingContract = byId[assignment.contract_id];
      if (!isActive(existingContract, dateKey)) {
        continue;
      }
      if (!targetContract.competitor_group || targetContract.competitor_group !== existingContract.competitor_group) {
        continue;
      }
      var sameCategory = Utility.trim(assignment.category).toUpperCase() === category;
      var sameAnswer = String(assignment.answer_signature || '') === String(signature);
      if (sameCategory && (targetContract.exclusivity_mode === 'CATEGORY' || existingContract.exclusivity_mode === 'CATEGORY')) {
        return block('CATEGORY_EXCLUSIVITY_CONFLICT', signature);
      }
      if (sameAnswer && (targetContract.exclusivity_mode === 'ANSWER' || existingContract.exclusivity_mode === 'ANSWER')) {
        return block('ANSWER_EXCLUSIVITY_CONFLICT', signature);
      }
      if (sameAnswer) {
        if (!targetContract.competitor_acceptance || !existingContract.competitor_acceptance) {
          return block('COMPETITOR_ACCEPTANCE_REQUIRED', signature);
        }
        disclosureRequired = true;
      }
    }
    return allow(disclosureRequired ? 'ALLOWED_WITH_COMPETITOR_DISCLOSURE' : 'ALLOWED', disclosureRequired, signature);
  }

  function loadContracts(sheet) {
    if (sheet.getLastRow() < 2) {
      return [];
    }
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, CONTRACT_HEADERS.length).getValues().map(fromContractRow);
  }

  function loadAssignments(sheet) {
    if (sheet.getLastRow() < 2) {
      return [];
    }
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, DECISION_HEADERS.length).getValues().map(function (row) {
      return {
        decision_id: String(row[0] || ''),
        contract_id: String(row[2] || ''),
        knowledge_key: String(row[6] || ''),
        answer_signature: String(row[7] || ''),
        category: String(row[8] || ''),
        allowed: row[9] === true || String(row[9]).toUpperCase() === 'TRUE'
      };
    });
  }

  function decide(request) {
    request = request || {};
    var sheets = ensureSheets();
    var contracts = loadContracts(sheets.contracts);
    var targetId = required(request.contract_id, 'Contract_ID');
    var target = null;
    for (var i = 0; i < contracts.length; i += 1) {
      if (contracts[i].contract_id === targetId) {
        target = contracts[i];
        break;
      }
    }
    if (!target) {
      throw Utility.createError('CONTRACT_NOT_FOUND', '契約が見つかりません: ' + targetId);
    }
    var assignments = loadAssignments(sheets.decisions);
    var result = evaluate(request, target, assignments, contracts);
    var decisionId = Utility.uuid();
    var decidedAt = Utility.nowIso();
    var row = [
      decisionId, decidedAt, target.contract_id, target.tenant, target.account_type,
      target.account_id, required(request.knowledge_key, 'Knowledge_Key'),
      result.answer_signature, required(request.category, 'Category').toUpperCase(),
      result.allowed, result.reason, result.disclosure_required
    ];
    sheets.decisions.getRange(sheets.decisions.getLastRow() + 1, 1, 1, DECISION_HEADERS.length).setValues([row]);
    return {
      decision_id: decisionId,
      allowed: result.allowed,
      reason: result.reason,
      disclosure_required: result.disclosure_required,
      answer_signature: result.answer_signature
    };
  }

  return {
    CONTRACT_SHEET_NAME: CONTRACT_SHEET_NAME,
    DECISION_SHEET_NAME: DECISION_SHEET_NAME,
    CONTRACT_HEADERS: CONTRACT_HEADERS.slice(),
    DECISION_HEADERS: DECISION_HEADERS.slice(),
    ensureSheets: ensureSheets,
    normalizeContract: normalizeContract,
    isActive: isActive,
    includesCategory: includesCategory,
    answerSignature: answerSignature,
    evaluate: evaluate,
    loadContracts: loadContracts,
    loadAssignments: loadAssignments,
    decide: decide
  };
}());

function evaluateProjectGateRecommendation(request) {
  'use strict';
  return ContractPolicyEngine.decide(request);
}
