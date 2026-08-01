import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGrowthTraffic, normalizeGrowthEvent } from '../src/growth-events.mjs';

test('accepts only anonymous allowlisted growth dimensions', () => {
  assert.deepEqual(normalizeGrowthEvent({
    event_type: 'marketplace_click',
    locale: 'en',
    source: 'instagram',
    medium: 'organic_social',
    campaign: 'ambiguous search',
    content: 'reel_01',
    experiment: 'lp_search_cta_v1',
    variant: 'benefit',
    marketplace: 'qoo10_jp',
    query: 'must not be stored'
  }), {
    event_type: 'marketplace_click',
    locale: 'EN',
    source: 'instagram',
    medium: 'organic_social',
    campaign: 'ambiguoussearch',
    content: 'reel_01',
    experiment: 'lp_search_cta_v1',
    variant: 'benefit',
    marketplace: 'QOO10_JP'
  });
});

test('rejects unknown event types and marketplace values', () => {
  assert.throws(() => normalizeGrowthEvent({ event_type: 'raw_query_saved' }), /GROWTH_EVENT_INVALID/);
  assert.equal(normalizeGrowthEvent({ event_type: 'landing_view', marketplace: 'unknown' }).marketplace, '');
});

test('accepts acquisition funnel events without personal data', () => {
  for (const event_type of ['registration_started', 'registration_completed', 'return_visit', 'pwa_install_prompted', 'pwa_install_completed']) {
    assert.equal(normalizeGrowthEvent({ event_type, content: 'email' }).event_type, event_type);
  }
});

test('accepts anonymous experiment exposure dimensions', () => {
  const event = normalizeGrowthEvent({
    event_type: 'experiment_exposure', experiment: 'lp_search_cta_v1', variant: 'benefit'
  });
  assert.equal(event.experiment, 'lp_search_cta_v1');
  assert.equal(event.variant, 'benefit');
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
