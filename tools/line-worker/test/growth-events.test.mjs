import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGrowthTraffic, handleGrowthEvent, normalizeGrowthEvent } from '../src/growth-events.mjs';

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

test('rejects unknown event types and marketplace values', () => {
  assert.throws(() => normalizeGrowthEvent({ event_type: 'raw_query_saved' }), /GROWTH_EVENT_INVALID/);
  assert.equal(normalizeGrowthEvent({ event_type: 'landing_view', marketplace: 'unknown' }).marketplace, '');
});

test('accepts anonymous registration and inquiry events across all ten marketplaces', () => {
  assert.equal(normalizeGrowthEvent({ event_type: 'member_registered' }).event_type, 'member_registered');
  assert.equal(normalizeGrowthEvent({ event_type: 'inquiry_submitted' }).event_type, 'inquiry_submitted');
  for (const marketplace of [
    'AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP', 'QOO10_JP', 'SHEIN_JP',
    'ZOZOTOWN_JP', 'SHOPLIST_JP', 'MUSINSA_JP', 'BUYMA_JP', 'SNKRDUNK_JP'
  ]) {
    assert.equal(normalizeGrowthEvent({ event_type: 'marketplace_click', marketplace }).marketplace, marketplace);
  }
});

test('accepts the official-launch commerce journey KPIs without storing search text', () => {
  for (const event_type of [
    'search_failed', 'ai_result_clicked', 'ranking_result_clicked',
    'price_comparison_opened', 'returning_visit'
  ]) {
    const normalized = normalizeGrowthEvent({ event_type, query: '保存してはいけない検索文' });
    assert.equal(normalized.event_type, event_type);
    assert.equal('query' in normalized, false);
  }
});

test('separates SEO article views and transitions from search starts', () => {
  assert.equal(normalizeGrowthEvent({ event_type: 'seo_article_view', content: 'find-product-without-name' }).event_type, 'seo_article_view');
  assert.equal(normalizeGrowthEvent({ event_type: 'seo_search_transition', content: 'find-product-without-name' }).event_type, 'seo_search_transition');
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
