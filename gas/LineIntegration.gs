/**
 * Project GATE - LineIntegration.gs
 * Cloudflare Workerで署名検証済みのLINEイベントを受け取り、Knowledge回答とKPI計測を行う。
 * LINEのChannel Secret / Access TokenはGASへ保存しない。
 */
var LineIntegration = (function () {
  'use strict';

  var EVENT_SHEET_NAME = 'LINE_Event_Log';
  var EVENT_HEADERS = [
    'Webhook_Event_ID', 'Received_At', 'Event_Type', 'User_Hash', 'Message_Hash',
    'Status', 'Response_JSON', 'Finished_At', 'Error_Code'
  ];
  var PROPERTY_BRIDGE_SECRET = 'LINE_BRIDGE_SECRET';
  var PROPERTY_CONTRACT_ID = 'LINE_CONTRACT_ID';
  var PROPERTY_DEFAULT_CATEGORY = 'LINE_DEFAULT_CATEGORY';
  var PROPERTY_PWA_CONTRACT_ID = 'PWA_CONTRACT_ID';
  var PROPERTY_PWA_DEFAULT_CATEGORY = 'PWA_DEFAULT_CATEGORY';
  var CHANNELS = ['LINE', 'PWA'];
  var TRACK_EVENT_TYPES = ['IMPRESSION', 'CLICK', 'OUTBOUND'];

  function ensureSheet() {
    return Utility.ensureSheet(Config.getSpreadsheet(), EVENT_SHEET_NAME, EVENT_HEADERS);
  }

  function getRequiredProperty(name) {
    var value = Utility.trim(PropertiesService.getScriptProperties().getProperty(name));
    if (!value) {
      throw Utility.createError('LINE_PROPERTY_MISSING', 'Script Propertyが未設定です: ' + name);
    }
    return value;
  }

  function secureEquals(left, right) {
    left = String(left || '');
    right = String(right || '');
    var mismatch = left.length ^ right.length;
    var length = Math.max(left.length, right.length);
    for (var i = 0; i < length; i += 1) {
      mismatch |= (left.charCodeAt(i % Math.max(left.length, 1)) || 0) ^
        (right.charCodeAt(i % Math.max(right.length, 1)) || 0);
    }
    return mismatch === 0;
  }

  function verifyBridgeSecret(received) {
    var expectedHash = Utility.sha256(getRequiredProperty(PROPERTY_BRIDGE_SECRET));
    var receivedHash = Utility.sha256(String(received || ''));
    if (!secureEquals(expectedHash, receivedHash)) {
      throw Utility.createError('LINE_BRIDGE_UNAUTHORIZED', 'LINE Bridgeの認証に失敗しました。');
    }
  }

  function findExistingEvent(sheet, webhookEventId) {
    if (sheet.getLastRow() < 2) { return null; }
    var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    for (var i = ids.length - 1; i >= 0; i -= 1) {
      if (String(ids[i][0]) === webhookEventId) {
        var rowNumber = i + 2;
        var values = sheet.getRange(rowNumber, 1, 1, EVENT_HEADERS.length).getValues()[0];
        return {
          row_number: rowNumber, received_at: String(values[1] || ''),
          status: String(values[5] || ''), response_json: String(values[6] || '')
        };
      }
    }
    return null;
  }

  function appendStarted(sheet, event) {
    var source = event.source || {};
    var userId = Utility.trim(source.userId || source.groupId || source.roomId);
    var messageText = event.message && event.message.type === 'text' ? String(event.message.text || '') : '';
    var row = [
      Utility.trim(event.webhookEventId), Utility.nowIso(), Utility.trim(event.type).toUpperCase(),
      userId ? Utility.sha256(userId) : '', messageText ? Utility.sha256(messageText) : '',
      'STARTED', '', '', ''
    ];
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, EVENT_HEADERS.length).setValues([row]);
    return sheet.getLastRow();
  }

  function finish(sheet, rowNumber, status, response, errorCode) {
    sheet.getRange(rowNumber, 6, 1, 4).setValues([[
      status, Utility.safeJson(response || {}), Utility.nowIso(), errorCode || ''
    ]]);
  }

  function localizedHelp(language, welcome) {
    var copy = {
      JA: welcome
        ? 'P-GATEへようこそ。探している商品を日本語・英語・中国語・韓国語・ローマ字で送ってください。'
        : '探している商品を文章で送ってください。例：アメリカのシリアルが食べたい',
      EN: welcome
        ? 'Welcome to P-GATE. Ask for a product in Japanese, English, Chinese, Korean, or romaji.'
        : 'Tell me what product you are looking for. Example: I want a breakfast cereal.',
      ZH: welcome
        ? '欢迎使用P-GATE。请用日语、英语、中文、韩语或罗马字描述您想找的商品。'
        : '请用一句话描述您想找的商品。例如：我想找早餐麦片。',
      KO: welcome
        ? 'P-GATE에 오신 것을 환영합니다. 일본어, 영어, 중국어, 한국어 또는 로마자로 상품을 찾아보세요.'
        : '찾고 있는 상품을 문장으로 보내 주세요. 예: 아침 시리얼을 찾고 있어요.'
    };
    return copy[language] || copy.JA;
  }

  function responseForEvent(event) {
    var eventType = Utility.trim(event.type).toLowerCase();
    if (eventType === 'follow') {
      return { status: 'WELCOME', language: 'JA', message: localizedHelp('JA', true), candidates: [] };
    }
    if (eventType !== 'message' || !event.message || event.message.type !== 'text') {
      return { status: 'HELP', language: 'JA', message: localizedHelp('JA', false), candidates: [] };
    }
    var query = Utility.trim(event.message.text);
    var language = MultilingualSeoEngine.detectLanguage(query);
    if (query.length < 2) {
      return { status: 'HELP', language: language, message: localizedHelp(language, false), candidates: [] };
    }
    return KnowledgeEngine.answer({
      query: query,
      category: getRequiredProperty(PROPERTY_DEFAULT_CATEGORY),
      contract_id: getRequiredProperty(PROPERTY_CONTRACT_ID),
      consent: true
    });
  }

  function handleEvent(event) {
    event = event || {};
    var webhookEventId = Utility.trim(event.webhookEventId);
    if (!webhookEventId) {
      throw Utility.createError('LINE_EVENT_ID_REQUIRED', 'webhookEventIdは必須です。');
    }
    var sheet = ensureSheet();
    var existing = findExistingEvent(sheet, webhookEventId);
    if (existing && existing.status === 'SUCCESS' && existing.response_json) {
      return JSON.parse(existing.response_json);
    }
    if (existing && existing.status === 'STARTED') {
      var startedAt = new Date(existing.received_at).getTime();
      if (isFinite(startedAt) && Date.now() - startedAt < 10 * 60 * 1000) {
        return { status: 'PROCESSING', language: 'JA', message: '', candidates: [] };
      }
    }
    var rowNumber = appendStarted(sheet, event);
    try {
      var response = responseForEvent(event);
      finish(sheet, rowNumber, 'SUCCESS', response, '');
      return response;
    } catch (error) {
      var safeResponse = {
        status: 'ERROR', language: 'JA',
        message: '現在回答を作成できません。時間をおいて、もう一度お試しください。', candidates: []
      };
      finish(sheet, rowNumber, 'FAILED', safeResponse, error.code || 'UNEXPECTED_ERROR');
      throw error;
    }
  }

  function channelProperty(channel, lineProperty, pwaProperty) {
    channel = Utility.trim(channel).toUpperCase();
    if (CHANNELS.indexOf(channel) < 0) {
      throw Utility.createError('CHANNEL_INVALID', '未対応のチャネルです: ' + channel);
    }
    return getRequiredProperty(channel === 'PWA' ? pwaProperty : lineProperty);
  }

  function answerPublic(request) {
    request = request || {};
    if (request.consent !== true) {
      throw Utility.createError('PWA_CONSENT_REQUIRED', '質問処理には利用同意が必要です。');
    }
    var query = Utility.trim(request.query);
    if (query.length < 2 || query.length > 200) {
      throw Utility.createError('PWA_QUERY_LENGTH_INVALID', '質問は2〜200文字で入力してください。');
    }
    return KnowledgeEngine.answer({
      query: query,
      category: channelProperty('PWA', PROPERTY_DEFAULT_CATEGORY, PROPERTY_PWA_DEFAULT_CATEGORY),
      contract_id: channelProperty('PWA', PROPERTY_CONTRACT_ID, PROPERTY_PWA_CONTRACT_ID),
      consent: true
    });
  }

  function findConfiguredContract(channel) {
    var contractId = channelProperty(channel, PROPERTY_CONTRACT_ID, PROPERTY_PWA_CONTRACT_ID);
    var sheets = ContractPolicyEngine.ensureSheets();
    var contracts = ContractPolicyEngine.loadContracts(sheets.contracts);
    for (var i = 0; i < contracts.length; i += 1) {
      if (contracts[i].contract_id === contractId) { return contracts[i]; }
    }
    throw Utility.createError('LINE_CONTRACT_NOT_FOUND', 'LINE用契約が見つかりません。');
  }

  function track(events, channel) {
    if (!Array.isArray(events) || events.length === 0 || events.length > 100) {
      throw Utility.createError('LINE_TRACK_BATCH_INVALID', 'LINE計測イベントは1〜100件で指定してください。');
    }
    channel = Utility.trim(channel || 'LINE').toUpperCase();
    var contract = findConfiguredContract(channel);
    var marketplaceEvents = [];
    var normalized = events.map(function (event) {
      var eventType = Utility.trim(event.event_type).toUpperCase();
      if (TRACK_EVENT_TYPES.indexOf(eventType) < 0) {
        throw Utility.createError('LINE_TRACK_TYPE_INVALID', '未対応のLINE計測種別です: ' + eventType);
      }
      var normalizedEvent = {
        event_id: Utility.trim(event.event_id), occurred_at: event.occurred_at || Utility.nowIso(),
        tenant: contract.tenant, account_type: contract.account_type,
        account_id: contract.account_id, session_id: Utility.trim(event.user_hash),
        recommendation_id: Utility.trim(event.recommendation_id), campaign_id: channel + '_PILOT',
        experiment_variant: 'P_GATE', asin: Utility.trim(event.asin), event_type: eventType,
        consent: true, source: channel
      };
      var marketplace = Utility.trim(event.marketplace).toUpperCase();
      if (marketplace) {
        marketplaceEvents.push({
          event_id: normalizedEvent.event_id, occurred_at: normalizedEvent.occurred_at,
          tenant: contract.tenant, account_type: contract.account_type, account_id: contract.account_id,
          session_id: normalizedEvent.session_id, recommendation_id: normalizedEvent.recommendation_id,
          asin: normalizedEvent.asin, marketplace: marketplace, event_type: eventType,
          channel: channel, consent: true
        });
      }
      return normalizedEvent;
    });
    marketplaceEvents.forEach(function (event) { MarketplaceMeasurementEngine.normalizeEvent(event, Utility.nowIso()); });
    var measurement = MeasurementEngine.record(normalized);
    var marketplaceMeasurement = MarketplaceMeasurementEngine.record(marketplaceEvents);
    return { measurement: measurement, marketplace: marketplaceMeasurement };
  }

  function handleBridge(payload) {
    payload = payload || {};
    verifyBridgeSecret(payload.bridge_secret);
    var action = Utility.trim(payload.action).toUpperCase();
    if (action === 'EVENT') { return handleEvent(payload.event); }
    if (action === 'KNOWLEDGE') { return answerPublic(payload.request); }
    if (action === 'TRACK') { return track(payload.events, payload.channel || 'LINE'); }
    throw Utility.createError('LINE_ACTION_INVALID', '未対応のLINE Bridge actionです。');
  }

  return {
    EVENT_SHEET_NAME: EVENT_SHEET_NAME,
    EVENT_HEADERS: EVENT_HEADERS.slice(),
    PROPERTY_BRIDGE_SECRET: PROPERTY_BRIDGE_SECRET,
    PROPERTY_CONTRACT_ID: PROPERTY_CONTRACT_ID,
    PROPERTY_DEFAULT_CATEGORY: PROPERTY_DEFAULT_CATEGORY,
    PROPERTY_PWA_CONTRACT_ID: PROPERTY_PWA_CONTRACT_ID,
    PROPERTY_PWA_DEFAULT_CATEGORY: PROPERTY_PWA_DEFAULT_CATEGORY,
    ensureSheet: ensureSheet,
    secureEquals: secureEquals,
    localizedHelp: localizedHelp,
    responseForEvent: responseForEvent,
    answerPublic: answerPublic,
    handleEvent: handleEvent,
    track: track,
    handleBridge: handleBridge
  };
}());

function doPost(e) {
  'use strict';
  var output;
  try {
    var payload = JSON.parse(e && e.postData ? e.postData.contents : '{}');
    output = { ok: true, result: LineIntegration.handleBridge(payload) };
  } catch (error) {
    output = { ok: false, error: { code: error.code || 'UNEXPECTED_ERROR', message: error.message || String(error) } };
  }
  return ContentService.createTextOutput(JSON.stringify(output)).setMimeType(ContentService.MimeType.JSON);
}
