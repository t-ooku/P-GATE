/**
 * MYGATE - SocialKnowledgeEngine.gs
 *
 * SNSのコメント・アンケート回答を、同意告知、匿名化、人手審査を経て
 * MYTREASURE向けの匿名需要集計へ変換する。
 * 既存のKnowledge_Query_Logや商品Masterへ直接書き込まない。
 */
var SocialKnowledgeEngine = (function () {
  'use strict';

  var INBOX_SHEET_NAME = 'Social_Knowledge_Inbox';
  var AGGREGATE_SHEET_NAME = 'Social_Knowledge_Aggregates';
  var HASHTAG_AGGREGATE_SHEET_NAME = 'Social_Hashtag_Aggregates';
  var INBOX_HEADERS = [
    'Response_ID', 'Collected_At', 'Source', 'Post_ID', 'Campaign_ID',
    'Response_Type', 'Response_Text_Redacted', 'Poll_Option', 'Language',
    'Consent_Basis', 'Disclosure_Version', 'Author_Hash', 'Duplicate_Hash',
    'Suggested_Category', 'Suggested_Need_Key', 'Approved_Category',
    'Approved_Need_Key', 'Review_Status', 'Reviewed_At', 'Reviewer',
    'Exclusion_Reason'
  ];
  var AGGREGATE_HEADERS = [
    'Need_Key', 'Category', 'Language', 'Response_Count', 'Unique_Authors',
    'First_Seen_At', 'Last_Seen_At', 'Source_Count', 'Campaign_Count', 'Updated_At'
  ];
  var HASHTAG_HEADERS = [
    'Hashtag', 'Response_Count', 'Unique_Authors', 'Source_Count',
    'Campaign_Count', 'First_Seen_At', 'Last_Seen_At', 'Updated_At'
  ];
  var ALLOWED_SOURCES = ['INSTAGRAM', 'TIKTOK', 'X', 'YOUTUBE', 'LINE', 'WEB', 'MANUAL'];
  var ALLOWED_RESPONSE_TYPES = ['COMMENT', 'POLL', 'FORM'];
  var ALLOWED_CONSENT_BASES = ['EXPLICIT', 'POST_DISCLOSURE'];
  var AUTO_REJECT_CATEGORIES = [
    'THREAT', 'HATE', 'SEXUAL_EXPLOITATION', 'PERSONAL_DATA', 'MALICIOUS_SPAM'
  ];
  var FLAG_CATEGORIES = [
    'HARASSMENT', 'SEXUAL', 'PROFANITY', 'SELF_HARM', 'OFF_TOPIC', 'COMMERCIAL_SPAM'
  ];

  function ensureSheets() {
    var spreadsheet = Config.getSpreadsheet();
    return {
      inbox: Utility.ensureSheet(spreadsheet, INBOX_SHEET_NAME, INBOX_HEADERS),
      aggregates: Utility.ensureSheet(spreadsheet, AGGREGATE_SHEET_NAME, AGGREGATE_HEADERS),
      hashtags: Utility.ensureSheet(
        spreadsheet,
        HASHTAG_AGGREGATE_SHEET_NAME,
        HASHTAG_HEADERS
      )
    };
  }

  function required(value, code, message) {
    var text = Utility.trim(value);
    if (!text) {
      throw Utility.createError(code, message);
    }
    return text;
  }

  function allowed(value, values, code, label) {
    var normalized = required(value, code, label + 'は必須です。').toUpperCase();
    if (values.indexOf(normalized) < 0) {
      throw Utility.createError(code, label + 'が許可値ではありません。', {
        value: normalized,
        allowed: values
      });
    }
    return normalized;
  }

  function normalizeText(value) {
    var text = String(value == null ? '' : value);
    if (text.normalize) {
      text = text.normalize('NFKC');
    }
    return text.replace(/[\s\u3000]+/g, ' ').trim();
  }

  function redactPersonalData(value) {
    var text = normalizeText(value);
    return text
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
      .replace(/https?:\/\/\S+/gi, '[URL]')
      .replace(/(^|\s)@[A-Z0-9_\.]+/gi, '$1[HANDLE]')
      .replace(/(?:\+?81[-\s]?)?(?:0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4})/g, '[PHONE]')
      .slice(0, 1000);
  }

  function extractHashtags(value) {
    var text = normalizeText(value);
    var matches = text.match(/[#＃][\p{L}\p{N}_ー-]{1,50}/gu) || [];
    var seen = {};
    return matches.map(function (tag) {
      return tag.replace(/^[#＃]/, '').toLowerCase();
    }).filter(function (tag) {
      if (!tag || seen[tag]) { return false; }
      seen[tag] = true;
      return true;
    }).slice(0, 20);
  }

  /**
   * 固定ルールと外部AI判定結果を統合する。
   * 正当な批判や商品への不満は除外しない。高危険度のみ自動除外し、
   * 曖昧な内容は必ず人手確認へ回す。
   */
  function moderateContent(text, aiModeration) {
    var normalized = normalizeText(text);
    var lower = normalized.toLowerCase();
    var categories = [];
    var reasons = [];
    var highRiskPatterns = [
      { category: 'THREAT', pattern: /(?:殺す|死ね|消えろ|危害|kill\s+you|i(?:'|’)ll\s+kill)/i },
      { category: 'PERSONAL_DATA', pattern: /\[(?:EMAIL|PHONE)\]/i },
      { category: 'MALICIOUS_SPAM', pattern: /(?:今すぐ稼げる|必ず儲かる|送金して|口座番号|暗号資産を送|guaranteed\s+profit|send\s+(?:money|crypto))/i }
    ];
    var reviewPatterns = [
      { category: 'HARASSMENT', pattern: /(?:バカ|馬鹿|アホ|無能|きもい|クズ|idiot|stupid|moron)/i },
      { category: 'PROFANITY', pattern: /(?:くそ|クソ|fuck|shit)/i },
      { category: 'OFF_TOPIC', pattern: /(?:フォローして|相互フォロー|follow\s+me|dm\s+me)/i },
      { category: 'COMMERCIAL_SPAM', pattern: /(?:副業紹介|無料プレゼント|限定オファー|promo\s+code|buy\s+followers)/i }
    ];

    highRiskPatterns.concat(reviewPatterns).forEach(function (rule) {
      if (rule.pattern.test(lower) && categories.indexOf(rule.category) < 0) {
        categories.push(rule.category);
        reasons.push('RULE:' + rule.category);
      }
    });

    aiModeration = aiModeration || {};
    var aiCategories = aiModeration.categories || [];
    var aiConfidence = Number(aiModeration.confidence || 0);
    for (var i = 0; i < aiCategories.length; i += 1) {
      var aiCategory = String(aiCategories[i] || '').toUpperCase();
      if (aiCategory && categories.indexOf(aiCategory) < 0) {
        categories.push(aiCategory);
      }
    }
    if (aiCategories.length) {
      reasons.push('AI:' + categories.join(',') + ':' + aiConfidence.toFixed(2));
    }

    var autoReject = categories.some(function (category) {
      return AUTO_REJECT_CATEGORIES.indexOf(category) >= 0;
    }) && (!aiCategories.length || aiConfidence >= 0.85 || reasons.some(function (reason) {
      return reason.indexOf('RULE:') === 0;
    }));
    var flagged = categories.some(function (category) {
      return FLAG_CATEGORIES.indexOf(category) >= 0;
    }) || (aiCategories.length > 0 && aiConfidence >= 0.5);

    return {
      status: autoReject ? 'AUTO_REJECTED' : (flagged ? 'REVIEW_FLAGGED' : 'REVIEW'),
      categories: categories,
      reason: reasons.join('|').slice(0, 500)
    };
  }

  function findDuplicate(sheet, duplicateHash) {
    if (sheet.getLastRow() < 2) { return ''; }
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, INBOX_HEADERS.length).getValues();
    var duplicateColumn = INBOX_HEADERS.indexOf('Duplicate_Hash');
    for (var i = 0; i < values.length; i += 1) {
      if (String(values[i][duplicateColumn]) === duplicateHash) {
        return String(values[i][0]);
      }
    }
    return '';
  }

  function ingest(request) {
    request = request || {};
    var sheets = ensureSheets();
    var source = allowed(request.source, ALLOWED_SOURCES, 'SOCIAL_SOURCE_INVALID', 'Source');
    var responseType = allowed(
      request.response_type,
      ALLOWED_RESPONSE_TYPES,
      'SOCIAL_RESPONSE_TYPE_INVALID',
      'Response_Type'
    );
    var consentBasis = allowed(
      request.consent_basis,
      ALLOWED_CONSENT_BASES,
      'SOCIAL_CONSENT_REQUIRED',
      'Consent_Basis'
    );
    var disclosureVersion = required(
      request.disclosure_version,
      'SOCIAL_DISCLOSURE_REQUIRED',
      'Disclosure_Versionは必須です。'
    );
    var postId = required(request.post_id, 'SOCIAL_POST_ID_REQUIRED', 'Post_IDは必須です。');
    var platformResponseId = required(
      request.platform_response_id,
      'SOCIAL_RESPONSE_ID_REQUIRED',
      'Platform response IDは必須です。'
    );
    var redactedText = redactPersonalData(request.response_text);
    var pollOption = normalizeText(request.poll_option).slice(0, 200);
    if (!redactedText && !pollOption) {
      throw Utility.createError('SOCIAL_RESPONSE_EMPTY', 'コメント本文または投票選択肢が必要です。');
    }
    var authorHash = request.author_platform_id
      ? Utility.sha256(source + ':' + String(request.author_platform_id)) : '';
    var duplicateHash = Utility.sha256(source + ':' + postId + ':' + platformResponseId);
    var existingId = findDuplicate(sheets.inbox, duplicateHash);
    if (existingId) {
      return { status: 'DUPLICATE', response_id: existingId };
    }

    var responseId = Utility.uuid();
    var collectedAt = Utility.nowIso();
    var moderation = moderateContent(redactedText || pollOption, request.ai_moderation);
    sheets.inbox.getRange(
      sheets.inbox.getLastRow() + 1,
      1,
      1,
      INBOX_HEADERS.length
    ).setValues([[
      responseId,
      collectedAt,
      source,
      postId,
      Utility.trim(request.campaign_id),
      responseType,
      redactedText,
      pollOption,
      Utility.trim(request.language || 'JA').toUpperCase(),
      consentBasis,
      disclosureVersion,
      authorHash,
      duplicateHash,
      Utility.trim(request.suggested_category).toUpperCase(),
      Utility.trim(request.suggested_need_key).toLowerCase(),
      '',
      '',
      moderation.status,
      '',
      moderation.status === 'AUTO_REJECTED' ? 'AUTO_MODERATION' : '',
      moderation.reason
    ]]);
    return {
      status: moderation.status,
      response_id: responseId,
      moderation_categories: moderation.categories
    };
  }

  function ingestMany(requests) {
    requests = requests || [];
    var results = [];
    for (var i = 0; i < requests.length; i += 1) {
      try {
        results.push(ingest(requests[i]));
      } catch (error) {
        results.push({ status: 'ERROR', error: Utility.serializeError(error) });
      }
    }
    return results;
  }

  function review(responseId, decision) {
    decision = decision || {};
    var sheets = ensureSheets();
    var values = sheets.inbox.getDataRange().getValues();
    var status = Utility.trim(decision.status).toUpperCase();
    if (['APPROVED', 'REJECTED'].indexOf(status) < 0) {
      throw Utility.createError('SOCIAL_REVIEW_STATUS_INVALID', 'StatusはAPPROVEDまたはREJECTEDです。');
    }
    for (var i = 1; i < values.length; i += 1) {
      if (String(values[i][0]) !== String(responseId)) { continue; }
      if (status === 'APPROVED') {
        var category = required(
          decision.category,
          'SOCIAL_CATEGORY_REQUIRED',
          '承認時はCategoryが必要です。'
        ).toUpperCase();
        var needKey = required(
          decision.need_key,
          'SOCIAL_NEED_KEY_REQUIRED',
          '承認時はNeed_Keyが必要です。'
        ).toLowerCase();
        values[i][INBOX_HEADERS.indexOf('Approved_Category')] = category;
        values[i][INBOX_HEADERS.indexOf('Approved_Need_Key')] = needKey;
      }
      values[i][INBOX_HEADERS.indexOf('Review_Status')] = status;
      values[i][INBOX_HEADERS.indexOf('Reviewed_At')] = Utility.nowIso();
      values[i][INBOX_HEADERS.indexOf('Reviewer')] = Utility.trim(decision.reviewer);
      values[i][INBOX_HEADERS.indexOf('Exclusion_Reason')] = Utility.trim(decision.exclusion_reason);
      sheets.inbox.getRange(i + 1, 1, 1, INBOX_HEADERS.length).setValues([values[i]]);
      rebuildAggregates();
      return { status: status, response_id: responseId };
    }
    throw Utility.createError('SOCIAL_RESPONSE_NOT_FOUND', 'Response_IDが見つかりません。');
  }

  function uniqueCount(map) {
    return Object.keys(map).length;
  }

  function rebuildAggregates() {
    var sheets = ensureSheets();
    var values = sheets.inbox.getDataRange().getValues();
    var indexes = {};
    for (var h = 0; h < INBOX_HEADERS.length; h += 1) { indexes[INBOX_HEADERS[h]] = h; }
    var groups = {};
    var hashtagGroups = {};
    for (var i = 1; i < values.length; i += 1) {
      var row = values[i];
      if (String(row[indexes.Review_Status]) !== 'APPROVED') { continue; }
      var needKey = String(row[indexes.Approved_Need_Key] || '');
      var category = String(row[indexes.Approved_Category] || '');
      var language = String(row[indexes.Language] || 'JA');
      if (!needKey || !category) { continue; }
      var key = [needKey, category, language].join('|');
      if (!groups[key]) {
        groups[key] = {
          needKey: needKey,
          category: category,
          language: language,
          count: 0,
          authors: {},
          sources: {},
          campaigns: {},
          first: String(row[indexes.Collected_At]),
          last: String(row[indexes.Collected_At])
        };
      }
      var group = groups[key];
      group.count += 1;
      if (row[indexes.Author_Hash]) { group.authors[String(row[indexes.Author_Hash])] = true; }
      group.sources[String(row[indexes.Source])] = true;
      if (row[indexes.Campaign_ID]) { group.campaigns[String(row[indexes.Campaign_ID])] = true; }
      var collectedAt = String(row[indexes.Collected_At]);
      if (collectedAt < group.first) { group.first = collectedAt; }
      if (collectedAt > group.last) { group.last = collectedAt; }

      extractHashtags(row[indexes.Response_Text_Redacted]).forEach(function (tag) {
        if (!hashtagGroups[tag]) {
          hashtagGroups[tag] = {
            count: 0, authors: {}, sources: {}, campaigns: {},
            first: collectedAt, last: collectedAt
          };
        }
        var hashtag = hashtagGroups[tag];
        hashtag.count += 1;
        if (row[indexes.Author_Hash]) { hashtag.authors[String(row[indexes.Author_Hash])] = true; }
        hashtag.sources[String(row[indexes.Source])] = true;
        if (row[indexes.Campaign_ID]) { hashtag.campaigns[String(row[indexes.Campaign_ID])] = true; }
        if (collectedAt < hashtag.first) { hashtag.first = collectedAt; }
        if (collectedAt > hashtag.last) { hashtag.last = collectedAt; }
      });
    }

    var rows = Object.keys(groups).sort().map(function (key) {
      var group = groups[key];
      return [
        group.needKey,
        group.category,
        group.language,
        group.count,
        uniqueCount(group.authors),
        group.first,
        group.last,
        uniqueCount(group.sources),
        uniqueCount(group.campaigns),
        Utility.nowIso()
      ];
    });
    if (sheets.aggregates.getLastRow() > 1) {
      sheets.aggregates.getRange(
        2,
        1,
        sheets.aggregates.getLastRow() - 1,
        AGGREGATE_HEADERS.length
      ).clearContent();
    }
    if (rows.length > 0) {
      sheets.aggregates.getRange(2, 1, rows.length, AGGREGATE_HEADERS.length).setValues(rows);
    }
    var hashtagRows = Object.keys(hashtagGroups).sort().map(function (tag) {
      var item = hashtagGroups[tag];
      return [
        tag, item.count, uniqueCount(item.authors), uniqueCount(item.sources),
        uniqueCount(item.campaigns), item.first, item.last, Utility.nowIso()
      ];
    });
    if (sheets.hashtags.getLastRow() > 1) {
      sheets.hashtags.getRange(
        2, 1, sheets.hashtags.getLastRow() - 1, HASHTAG_HEADERS.length
      ).clearContent();
    }
    if (hashtagRows.length > 0) {
      sheets.hashtags.getRange(
        2, 1, hashtagRows.length, HASHTAG_HEADERS.length
      ).setValues(hashtagRows);
    }
    return { aggregate_count: rows.length, hashtag_count: hashtagRows.length };
  }

  return {
    INBOX_SHEET_NAME: INBOX_SHEET_NAME,
    AGGREGATE_SHEET_NAME: AGGREGATE_SHEET_NAME,
    HASHTAG_AGGREGATE_SHEET_NAME: HASHTAG_AGGREGATE_SHEET_NAME,
    ensureSheets: ensureSheets,
    redactPersonalData: redactPersonalData,
    extractHashtags: extractHashtags,
    moderateContent: moderateContent,
    ingest: ingest,
    ingestMany: ingestMany,
    review: review,
    rebuildAggregates: rebuildAggregates
  };
}());

function importSocialKnowledgeResponse(request) {
  'use strict';
  return SocialKnowledgeEngine.ingest(request);
}

function importSocialKnowledgeResponses(requests) {
  'use strict';
  return SocialKnowledgeEngine.ingestMany(requests);
}

function reviewSocialKnowledgeResponse(responseId, decision) {
  'use strict';
  return SocialKnowledgeEngine.review(responseId, decision);
}

function rebuildSocialKnowledgeAggregates() {
  'use strict';
  return SocialKnowledgeEngine.rebuildAggregates();
}
