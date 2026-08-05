import test from 'node:test';
import assert from 'node:assert/strict';
import { interleaveCandidatesBySource } from '../src/index.mjs';
import { rankMerchantCandidates } from '../src/knowledge-search.mjs';

// Regression for the 2026-08-05 v3.2 report: Rakuten candidates disappearing
// from results. Root cause (confirmed by a logged trace, not speculation):
// handleKnowledgeApi's marketplace loop called
// rankMerchantCandidates(...).slice(0, 10) once per source in push order
// (amazon_catalog_connected, then rakuten_catalog_connected, then
// yahoo_catalog_connected). When Amazon alone already supplied 10
// equally-scored candidates, Rakuten's accepted candidate(s) were appended
// last in arrival order, lost every tie-break in rankMerchantCandidates
// (which breaks ties by array position), and were sliced away - every time,
// regardless of relevance. Fixed by collecting every source's candidates
// first, interleaving them round-robin, and ranking+slicing exactly once.

test('interleaveCandidatesBySource は各ソースの1件目を優先し、単一ソースが全枠を占有しない', () => {
  const amazon = Array.from({ length: 10 }, (_, i) => ({ asin: `AMZ${i}` }));
  const rakuten = [{ asin: 'RAK0' }];
  const yahoo = [{ asin: 'YAH0' }];
  const interleaved = interleaveCandidatesBySource([amazon, rakuten, yahoo]);
  assert.deepEqual(interleaved.slice(0, 3).map((c) => c.asin), ['AMZ0', 'RAK0', 'YAH0']);
  assert.equal(interleaved.length, 12);
});

test('空配列や欠損グループを含んでも安全に処理する', () => {
  assert.deepEqual(interleaveCandidatesBySource([]), []);
  assert.deepEqual(interleaveCandidatesBySource([[], [{ asin: 'A' }]]), [{ asin: 'A' }]);
});

test('単純結合だとAmazon10件のタイでRakutenが脱落するが、ラウンドロビン後は残る', () => {
  const query = '';
  const amazon = Array.from({ length: 10 }, (_, i) => ({
    asin: `AMZ${i}`,
    offers: [{ marketplace: 'AMAZON_JP', product_url: `https://amazon.co.jp/dp/AMZ${i}` }]
  }));
  const rakuten = [{
    record_key: 'RAKUTEN:shop:1',
    offers: [{ marketplace: 'RAKUTEN_JP', product_url: 'https://item.rakuten.co.jp/shop/1/' }]
  }];

  const naiveConcat = rankMerchantCandidates([], [...amazon, ...rakuten], query).slice(0, 10);
  assert.ok(!naiveConcat.some((c) => c.record_key === 'RAKUTEN:shop:1'), 'naive concatenation should reproduce the bug');

  const interleaved = interleaveCandidatesBySource([amazon, rakuten]);
  const fixed = rankMerchantCandidates([], interleaved, query).slice(0, 10);
  assert.ok(fixed.some((c) => c.record_key === 'RAKUTEN:shop:1'), 'interleaving should surface the Rakuten candidate');
});
