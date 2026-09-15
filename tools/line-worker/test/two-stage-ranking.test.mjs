import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCommercialRanking,
  maybeRankTwoStage,
  rankByRelevance,
  rankTwoStage,
  twoStageRankingEnabled
} from '../src/search-quality/two-stage-ranking.mjs';

test('Phase 7 two-stage ranking remains OFF by default', () => {
  assert.equal(twoStageRankingEnabled({}), false);
  const candidates = [{ id: 'legacy' }];
  assert.deepEqual(maybeRankTwoStage({}, candidates, {}).commercial, candidates);
});

test('soft score prioritizes preferred matches and confirmed evidence', () => {
  const query = { preferred_attributes: ['SMALL_SIZE', 'ROUND_SHAPE'] };
  const ranked = rankByRelevance(query, [
    { id: 'weak', hard_filter_passed: true, detected_attributes: ['SMALL_SIZE'], attribute_evidence: {} },
    { id: 'strong', hard_filter_passed: true, detected_attributes: ['SMALL_SIZE', 'ROUND_SHAPE'], attribute_evidence: { ROUND_SHAPE: { confirmed: true } } }
  ]);
  assert.deepEqual(ranked.map(({ id }) => id), ['strong', 'weak']);
});

test('commercial terms can reorder only an exact relevance tie', () => {
  const query = { preferred_attributes: [] };
  const result = rankTwoStage(query, [
    { id: 'organic', hard_filter_passed: true },
    { id: 'contracted', hard_filter_passed: true, commercial: { contracted: true } }
  ]);
  assert.deepEqual(result.relevance.map(({ id }) => id), ['organic', 'contracted']);
  assert.deepEqual(result.commercial.map(({ id }) => id), ['contracted', 'organic']);
});

test('a contracted irrelevant candidate cannot be rescued into either stage', () => {
  const query = { preferred_attributes: ['WATERPROOF'] };
  const result = rankTwoStage(query, [
    { id: 'relevant', hard_filter_passed: true, detected_attributes: ['WATERPROOF'] },
    { id: 'malicious-contract', hard_filter_passed: false, detected_attributes: ['ACCESSORY'], commercial: { contracted: true, boost: 999999 } }
  ]);
  assert.deepEqual(result.relevance.map(({ id }) => id), ['relevant']);
  assert.deepEqual(result.commercial.map(({ id }) => id), ['relevant']);
});

test('commercial API rejects raw or unfiltered candidates', () => {
  assert.throws(() => applyCommercialRanking([{ id: 'raw', commercial: { contracted: true } }]), /hard-filtered/u);
  assert.throws(() => applyCommercialRanking([{ id: 'not-ranked', hard_filter_passed: true }]), /hard-filtered/u);
});

test('relevance dominates commercial status when scores differ', () => {
  const query = { preferred_attributes: ['ROUND_SHAPE'] };
  const result = rankTwoStage(query, [
    { id: 'relevant', hard_filter_passed: true, detected_attributes: ['ROUND_SHAPE'] },
    { id: 'contracted', hard_filter_passed: true, detected_attributes: [], commercial: { contracted: true } }
  ]);
  assert.deepEqual(result.commercial.map(({ id }) => id), ['relevant', 'contracted']);
});
