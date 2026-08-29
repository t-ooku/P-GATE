import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyGrowthTraffic, handleGrowthEvent, normalizeGrowthEvent,
  recordSearchClientDegradation, recordSearchOperationalFailure, recordSearchProviderDegradation
} from '../src/growth-events.mjs';

test('accepts only anonymous allowlisted growth dimensions', () => {
  assert.deepEqual(normalizeGrowthEvent({
    event_type: 'marketplace_click',
    locale: 'en',
    source: 'instagram',
    medium: 'organic_social',
    campaign: 'ambiguous search',
    content: 'reel_01',
    marketplace: 'qoo10_jp',
    query: 'must not be stored'
  }), {
    event_type: 'marketplace_click',
    locale: 'EN',
    source: 'instagram',
    medium: 'organic_social',
    campaign: 'ambiguoussearch',
    content: 'reel_01',
    marketplace: 'QOO10_JP'
    ,visitor_id: '', session_id: ''
  });
});

test('accepts only random anonymous visitor and session identifiers', () => {
  const event = normalizeGrowthEvent({ event_type: 'landing_view', visitor_id: '550e8400-e29b-41d4-a716-446655440000', session_id: 'bad' });
  assert.equal(event.visitor_id, '550e8400-e29b-41d4-a716-446655440000');
  assert.equal(event.session_id, '');
});

test('search input mix accepts only fixed enums and never stores raw inputs', () => {
  const execution_id = '450e8400-e29b-41d4-a716-446655440000';
  const session_id = '650e8400-e29b-41d4-a716-446655440000';
  for (const event_type of [
    'search_input_text', 'search_input_screenshot', 'search_input_camera', 'search_input_social_url',
    'search_input_text_screenshot', 'search_input_text_camera', 'search_input_text_social_url',
    'search_input_screenshot_social_url', 'search_input_camera_social_url',
    'search_input_text_screenshot_social_url', 'search_input_text_camera_social_url',
    'search_completed_text', 'search_completed_screenshot', 'search_completed_camera', 'search_completed_social_url',
    'search_completed_text_screenshot', 'search_completed_text_camera', 'search_completed_text_social_url',
    'search_completed_screenshot_social_url', 'search_completed_camera_social_url',
    'search_completed_text_screenshot_social_url', 'search_completed_text_camera_social_url',
    'search_outbound_text', 'search_outbound_screenshot', 'search_outbound_camera', 'search_outbound_social_url',
    'search_outbound_text_screenshot', 'search_outbound_text_camera', 'search_outbound_text_social_url',
    'search_outbound_screenshot_social_url', 'search_outbound_camera_social_url',
    'search_outbound_text_screenshot_social_url', 'search_outbound_text_camera_social_url'
  ]) {
    const event = normalizeGrowthEvent({
      event_type, query: '保存禁止の検索文', social_url: 'https://example.invalid/private',
      image: '保存禁止のbase64', execution_id, session_id
    });
    assert.equal(event.event_type, event_type);
    assert.equal(event.execution_id, execution_id);
    assert.equal('query' in event, false);
    assert.equal('social_url' in event, false);
    assert.equal('image' in event, false);
    assert.doesNotMatch(JSON.stringify(event), /保存禁止|example\.invalid/u);
  }
  assert.throws(() => normalizeGrowthEvent({
    event_type: 'search_input_text', session_id
  }), /GROWTH_EVENT_CORRELATION_INVALID/u);
});

test('typed search stages use one deduplicated execution key without storing the raw id', async () => {
  const writes = [];
  const env = { PRODUCT_DB: { prepare: sql => ({ bind: (...values) => ({
    run: async () => { writes.push({ sql, values }); return { success: true }; }
  }) }) } };
  const body = {
    event_type: 'search_input_text',
    execution_id: '450e8400-e29b-41d4-a716-446655440000',
    session_id: '650e8400-e29b-41d4-a716-446655440000'
  };
  for (let index = 0; index < 2; index += 1) {
    const response = await handleGrowthEvent(new Request('https://hoshilu.app/api/events', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
      body: JSON.stringify(body)
    }), env);
    assert.equal(response.status, 202);
  }
  const completed = await handleGrowthEvent(new Request('https://hoshilu.app/api/events', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
    body: JSON.stringify({ ...body, event_type: 'search_completed_text' })
  }), env);
  assert.equal(completed.status, 202);
  assert.equal(writes[0].values[0], writes[1].values[0]);
  assert.match(writes[0].values[0], /^search_[a-f0-9]{64}:input$/u);
  assert.equal(writes[0].values[0].slice(0, 71), writes[2].values[0].slice(0, 71));
  assert.match(writes[2].values[0], /:completed$/u);
  assert.match(writes[0].sql, /INSERT OR IGNORE INTO growth_events/u);
  assert.doesNotMatch(JSON.stringify(writes), /450e8400-e29b-41d4-a716-446655440000/u);
});

test('search_degraded accepts only a bounded code and UUID-shaped request ID', () => {
  assert.deepEqual(normalizeGrowthEvent({
    event_type: 'search_degraded',
    failure_code: 'turnstile_token_unavailable',
    request_id: 'E309D1AD-2A34-4F2F-913B-47FCCDBBE24C',
    query: '保存禁止の検索文'
  }), {
    event_type: 'search_degraded', locale: 'JA', source: '', medium: '', campaign: '', content: '',
    marketplace: '', visitor_id: '', session_id: '', failure_code: 'TURNSTILE_TOKEN_UNAVAILABLE',
    request_id: 'e309d1ad-2a34-4f2f-913b-47fccdbbe24c'
  });
  const sanitized = normalizeGrowthEvent({
    event_type: 'search_degraded', failure_code: '検索本文を含む例外', request_id: 'invalid'
  });
  assert.equal(sanitized.failure_code, 'SEARCH_CLIENT_FAILURE');
  assert.equal(sanitized.request_id, '');
  assert.equal('query' in sanitized, false);
});

test('rejects unknown event types and marketplace values', () => {
  assert.throws(() => normalizeGrowthEvent({ event_type: 'raw_query_saved' }), /GROWTH_EVENT_INVALID/);
  assert.throws(() => normalizeGrowthEvent({ event_type: 'search_provider_degraded' }), /GROWTH_EVENT_INVALID/);
  assert.equal(normalizeGrowthEvent({ event_type: 'landing_view', marketplace: 'unknown' }).marketplace, '');
});

test('server operational failures store only request ID and bounded code', async () => {
  const calls = [];
  const env = { PRODUCT_DB: { prepare: sql => ({ bind: (...values) => ({ run: async () => { calls.push({ sql, values }); } }) }) } };
  assert.equal(await recordSearchOperationalFailure(env, {
    requestId: 'e309d1ad-2a34-4f2f-913b-47fccdbbe24c',
    code: 'MARKETPLACE_TIMEOUT', query: '保存禁止の検索文'
  }), true);
  assert.equal(calls[0].values[1], 'search_backend_failed');
  assert.equal(calls[0].values[5], 'MARKETPLACE_TIMEOUT');
  assert.equal(calls[0].values[6], 'e309d1ad-2a34-4f2f-913b-47fccdbbe24c');
  assert.doesNotMatch(JSON.stringify(calls), /保存禁止/u);
});

test('AI chat operational failures are distinguishable without storing conversation text', async () => {
  const calls = [];
  const env = { PRODUCT_DB: { prepare: sql => ({ bind: (...values) => ({ run: async () => { calls.push({ sql, values }); } }) }) } };
  assert.equal(await recordSearchOperationalFailure(env, {
    requestId: 'e309d1ad-2a34-4f2f-913b-47fccdbbe24d',
    code: 'unexpected provider detail',
    component: 'ai_chat',
    history: '保存禁止の会話本文'
  }), true);
  assert.equal(calls[0].values[1], 'search_backend_failed');
  assert.equal(calls[0].values[4], 'ai_chat');
  assert.equal(calls[0].values[5], 'AI_CHAT_INTERNAL_ERROR');
  assert.equal(calls[0].values[6], 'e309d1ad-2a34-4f2f-913b-47fccdbbe24d');
  assert.doesNotMatch(JSON.stringify(calls), /保存禁止/u);
});

test('provider degradation stores only fixed dimensions and a Worker request ID', async () => {
  const calls = [];
  const env = { PRODUCT_DB: { prepare: sql => ({ bind: (...values) => ({ run: async () => { calls.push({ sql, values }); } }) }) } };
  assert.equal(await recordSearchProviderDegradation(env, {
    requestId:'e309d1ad-2a34-4f2f-913b-47fccdbbe245',
    component:'ai_chat_primary', provider:'gemini', code:'AI_PROVIDER_TIMEOUT',
    query:'保存禁止の検索文', history:'保存禁止の会話', response:'保存禁止の外部応答',
    visitor_id:'保存禁止', session_id:'保存禁止'
  }), true);
  assert.equal(calls[0].values[1], 'search_provider_degraded');
  assert.equal(calls[0].values[3], 'worker');
  assert.equal(calls[0].values[4], 'ai_chat_primary');
  assert.equal(calls[0].values[5], 'AI_PROVIDER_TIMEOUT');
  assert.equal(calls[0].values[6], 'e309d1ad-2a34-4f2f-913b-47fccdbbe245');
  assert.equal(calls[0].values[7], 'GEMINI');
  assert.equal(calls[0].values[10], '');
  assert.equal(calls[0].values[11], '');
  assert.doesNotMatch(JSON.stringify(calls), /保存禁止/u);
});

test('multimodal input degradation is recorded without storing the image, URL, or query', async () => {
  const calls = [];
  const env = { PRODUCT_DB: { prepare: sql => ({ bind: (...values) => ({ run: async () => { calls.push({ sql, values }); } }) }) } };
  assert.equal(await recordSearchProviderDegradation(env, {
    requestId:'e309d1ad-2a34-4f2f-913b-47fccdbbe250',
    component:'search_input_analysis', provider:'gemini', code:'SEARCH_INPUT_ANALYSIS_NO_PUBLIC_EVIDENCE',
    query:'保存禁止の検索文', social_url:'https://example.invalid/private', image:'保存禁止のbase64'
  }), true);
  assert.equal(calls[0].values[4], 'search_input_analysis');
  assert.equal(calls[0].values[5], 'SEARCH_INPUT_ANALYSIS_NO_PUBLIC_EVIDENCE');
  assert.equal(calls[0].values[6], 'e309d1ad-2a34-4f2f-913b-47fccdbbe250');
  assert.equal(calls[0].values[7], 'GEMINI');
  assert.doesNotMatch(JSON.stringify(calls), /保存禁止|example\.invalid/u);
});

test('provider degradation uses a fixed code allowlist and rejects forged dimensions', async () => {
  const calls = [];
  const env = { PRODUCT_DB: { prepare: sql => ({ bind: (...values) => ({ run: async () => { calls.push({ sql, values }); } }) }) } };
  assert.equal(await recordSearchProviderDegradation(env, {
    requestId:'e309d1ad-2a34-4f2f-913b-47fccdbbe246',
    component:'ai_chat_all', provider:'all', code:'RAW_UPPERCASE_PROVIDER_MESSAGE'
  }), true);
  assert.equal(calls[0].values[5], 'AI_ALL_PROVIDERS_FAILED');
  assert.equal(await recordSearchProviderDegradation(env, {
    requestId:'e309d1ad-2a34-4f2f-913b-47fccdbbe248',
    component:'query_structurer_all', provider:'all', code:'AI_ALL_PROVIDERS_FAILED'
  }), true);
  assert.equal(calls[1].values[4], 'query_structurer_all');
  assert.equal(await recordSearchProviderDegradation(env, {
    requestId:'e309d1ad-2a34-4f2f-913b-47fccdbbe247',
    component:'unexpected_component', provider:'all', code:'AI_ALL_PROVIDERS_FAILED'
  }), false);
  assert.equal(await recordSearchProviderDegradation(env, {
    requestId:'not-a-worker-request',
    component:'ai_chat_all', provider:'all', code:'AI_ALL_PROVIDERS_FAILED'
  }), false);
  assert.equal(calls.length, 2);
});

test('client degradation diagnostic stores no query, visitor, or session data', async () => {
  const calls = [];
  const env = { PRODUCT_DB: { prepare: sql => ({ bind: (...values) => ({ run: async () => { calls.push({ sql, values }); } }) }) } };
  assert.equal(await recordSearchClientDegradation(env, {
    requestId: 'e309d1ad-2a34-4f2f-913b-47fccdbbe249',
    code: 'TURNSTILE_TOKEN_UNAVAILABLE',
    trafficClass: 'ATTRIBUTED',
    query: '保存禁止の検索文', visitor_id: '保存禁止', session_id: '保存禁止'
  }), true);
  assert.equal(calls[0].values[1], 'search_client_degraded');
  assert.equal(calls[0].values[3], 'browser');
  assert.equal(calls[0].values[4], 'knowledge');
  assert.equal(calls[0].values[5], 'TURNSTILE_TOKEN_UNAVAILABLE');
  assert.equal(calls[0].values[6], 'e309d1ad-2a34-4f2f-913b-47fccdbbe249');
  assert.equal(calls[0].values[9], 'ATTRIBUTED');
  assert.equal(calls[0].values[10], '');
  assert.equal(calls[0].values[11], '');
  assert.doesNotMatch(JSON.stringify(calls), /保存禁止/u);
});

test('rejects server-owned conversions and accepts commerce events across all ten marketplaces', () => {
  assert.throws(() => normalizeGrowthEvent({ event_type: 'member_registered' }), /GROWTH_EVENT_INVALID/u);
  assert.throws(() => normalizeGrowthEvent({ event_type: 'inquiry_submitted' }), /GROWTH_EVENT_INVALID/u);
  for (const marketplace of [
    'AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP', 'QOO10_JP', 'SHEIN_JP',
    'ZOZOTOWN_JP', 'SHOPLIST_JP', 'MUSINSA_JP', 'BUYMA_JP', 'SNKRDUNK_JP'
  ]) {
    assert.equal(normalizeGrowthEvent({ event_type: 'marketplace_click', marketplace }).marketplace, marketplace);
  }
});

test('accepts the official-launch commerce journey KPIs without storing search text', () => {
  for (const event_type of [
    'search_failed', 'search_dead_end', 'search_degraded', 'ai_result_clicked', 'ranking_result_clicked',
    'price_comparison_opened', 'returning_visit', 'marketplace_fallback_click'
  ]) {
    const normalized = normalizeGrowthEvent({ event_type, query: '保存してはいけない検索文' });
    assert.equal(normalized.event_type, event_type);
    assert.equal('query' in normalized, false);
  }
});

test('separates SEO article views and transitions from search starts', () => {
  assert.equal(normalizeGrowthEvent({ event_type: 'seo_article_view', content: 'find-product-without-name' }).event_type, 'seo_article_view');
  assert.equal(normalizeGrowthEvent({ event_type: 'seo_search_transition', content: 'find-product-without-name' }).event_type, 'seo_search_transition');
  assert.equal(normalizeGrowthEvent({ event_type: 'seo_feature_transition', content: 'use-hoshilu-buzz-for-product-discovery' }).event_type, 'seo_feature_transition');
  assert.equal(normalizeGrowthEvent({ event_type: 'seo_comparison_view', content: 'find-product-without-name' }).event_type, 'seo_comparison_view');
  assert.equal(normalizeGrowthEvent({ event_type: 'seo_evidence_view', content: 'find-product-without-name' }).event_type, 'seo_evidence_view');
  assert.equal(normalizeGrowthEvent({ event_type: 'seo_review_guide_view', content: 'find-product-without-name' }).event_type, 'seo_review_guide_view');
  assert.equal(normalizeGrowthEvent({ event_type: 'seo_identity_guide_view', content: 'find-product-without-name' }).event_type, 'seo_identity_guide_view');
  assert.equal(normalizeGrowthEvent({ event_type: 'search_started', source: 'seo_article', medium: 'internal' }).event_type, 'search_started');
});

test('separates QA, attributed, and unattributed growth traffic', () => {
  assert.equal(classifyGrowthTraffic({
    source: 'codex_acceptance',
    medium: 'qa',
    campaign: 'growth_events_v1'
  }), 'QA');
  assert.equal(classifyGrowthTraffic({
    source: 'instagram',
    medium: 'organic_social',
    campaign: 'itg_brand_reel'
  }), 'ATTRIBUTED');
  assert.equal(classifyGrowthTraffic({}), 'UNATTRIBUTED');
});

test('visitor columnsのD1 migration適用前もイベント件数を保存する', async () => {
  const calls = [];
  const env = {
    PRODUCT_DB: {
      prepare(sql) {
        return {
          bind(...values) {
            calls.push({ sql, values });
            return {
              async run() {
                if (sql.includes('visitor_id,session_id')) throw new Error('table growth_events has no column named visitor_id');
                return { success: true };
              }
            };
          }
        };
      }
    }
  };
  const request = new Request('https://hoshilu.app/api/events', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      event_type: 'seo_article_view', source: 'codex_qa', medium: 'qa',
      visitor_id: '550e8400-e29b-41d4-a716-446655440000',
      session_id: '550e8400-e29b-41d4-a716-446655440001'
    })
  });
  const response = await handleGrowthEvent(request, env);
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true, identity_recorded: false });
  assert.equal(calls.length, 2);
  assert.match(calls[1].sql, /occurred_at,traffic_class\)/);
  assert.equal(calls[1].values.length, 10);
});

test('rejects cross-origin events and uncorrelated public dead-end signals', async () => {
  const env = { PRODUCT_DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } };
  const crossOrigin = await handleGrowthEvent(new Request('https://hoshilu.app/api/events', {
    method: 'POST', headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
    body: JSON.stringify({ event_type: 'landing_view' })
  }), env);
  assert.equal(crossOrigin.status, 403);
  const deadEnd = await handleGrowthEvent(new Request('https://hoshilu.app/api/events', {
    method: 'POST', headers: { origin: 'https://hoshilu.app', 'content-type': 'application/json' },
    body: JSON.stringify({
      event_type: 'search_dead_end',
      session_id: '550e8400-e29b-41d4-a716-446655440000'
    })
  }), env);
  assert.equal(deadEnd.status, 400);
});

test('correlated degraded event preserves attribution and adds a separate safe diagnostic', async () => {
  const writes = [];
  const env = { PRODUCT_DB: { prepare: sql => ({ bind: (...values) => ({
    first: async () => ({ found: 1 }),
    run: async () => { writes.push({ sql, values }); return { success: true }; }
  }) }) } };
  const response = await handleGrowthEvent(new Request('https://hoshilu.app/api/events', {
    method: 'POST', headers: { origin: 'https://hoshilu.app', 'content-type': 'application/json' },
    body: JSON.stringify({
      event_type: 'search_degraded', source: 'instagram', medium: 'organic_social',
      campaign: 'reel', content: 'creative_01',
      session_id: '550e8400-e29b-41d4-a716-446655440000',
      failure_code: 'SEARCH_TIMEOUT', request_id: 'e309d1ad-2a34-4f2f-913b-47fccdbbe250',
      query: '保存禁止の検索文'
    })
  }), env);
  assert.equal(response.status, 202);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].values[1], 'search_degraded');
  assert.equal(writes[0].values[3], 'instagram');
  assert.equal(writes[0].values[5], 'reel');
  assert.equal(writes[1].values[1], 'search_client_degraded');
  assert.equal(writes[1].values[4], 'knowledge');
  assert.equal(writes[1].values[5], 'SEARCH_TIMEOUT');
  assert.equal(writes[1].values[6], 'e309d1ad-2a34-4f2f-913b-47fccdbbe250');
  assert.doesNotMatch(JSON.stringify(writes), /保存禁止/u);
});
