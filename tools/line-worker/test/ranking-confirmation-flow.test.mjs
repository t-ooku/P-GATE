import test from 'node:test';
import assert from 'node:assert/strict';
import { createRankingConfirmationFlow, currentRankingCategoryProposal, rejectRankingCategoryProposal } from '../public/ranking-confirmation-flow.mjs';

const options = ['ハンディファン', '卓上扇風機', '首掛け扇風機'].map((label, index) => ({
  value: `genre_${index}`, genre_id: String(100 + index), label
}));

test('ランキング小ジャンルは1件ずつ提示しNOごとに次候補へ進む', () => {
  let flow = createRankingConfirmationFlow(options);
  assert.equal(currentRankingCategoryProposal(flow).label, 'ハンディファン');
  let outcome = rejectRankingCategoryProposal(flow); flow = outcome.flow;
  assert.equal(outcome.action, 'show_next');
  assert.equal(outcome.proposal.label, '卓上扇風機');
  outcome = rejectRankingCategoryProposal(flow); flow = outcome.flow;
  assert.equal(outcome.action, 'show_next');
  assert.equal(outcome.proposal.label, '首掛け扇風機');
});

test('NOの3回目は候補を表示せず検索窓へ戻す', () => {
  let flow = createRankingConfirmationFlow(options);
  flow = rejectRankingCategoryProposal(flow).flow;
  flow = rejectRankingCategoryProposal(flow).flow;
  const outcome = rejectRankingCategoryProposal(flow);
  assert.equal(outcome.action, 'return_to_search');
  assert.equal(outcome.proposal, null);
  assert.equal(outcome.flow.rejectionCount, 3);
});

test('次候補が無い時はNO回数を維持して検索文の追加を求める', () => {
  const outcome = rejectRankingCategoryProposal(createRankingConfirmationFlow(options.slice(0, 1)));
  assert.equal(outcome.action, 'needs_refinement');
  assert.equal(outcome.flow.rejectionCount, 1);
});
