import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKeywordExpansionPrompt,
  createStagingBatch,
  deterministicSample,
  evaluateStagingBatch,
  findNearDuplicate,
  validateGeneratedKeywordEntry
} from '../src/search-quality/keyword-expansion-staging.mjs';

const valid = (number) => ({ category: '生活用品', query: `用途から探す曖昧な言い方 ${number}`, keywords: [`商品語 ${number}`, `用途語 ${number}`] });

test('Phase 6.5 generation remains disabled and writes only to staging', () => {
  assert.equal(createStagingBatch({ entries: [valid(1)] }, {}).status, 'DISABLED');
  const staged = createStagingBatch({ entries: [valid(1)] }, { HOSHILU_KEYWORD_EXPANSION_ENABLED: 'true' });
  assert.equal(staged.status, 'STAGED');
  assert.equal(staged.entries.length, 1);
});

test('prompt contains bounded few-shot data and demands JSON-only output', () => {
  const prompt = buildKeywordExpansionPrompt({ category: '生活用品', batchSize: 100, examples: Array.from({ length: 12 }, (_, i) => valid(i)), canonicalExcerpt: { SMALL_SIZE: ['小型'] } });
  assert.match(prompt, /20件/u);
  assert.match(prompt, /JSON配列のみ/u);
  assert.doesNotMatch(prompt, /用途から探す曖昧な言い方 11/u);
});

test('schema rejects malformed or commercial output', () => {
  assert.deepEqual(validateGeneratedKeywordEntry(valid(1)), []);
  assert.ok(validateGeneratedKeywordEntry({ category: 'x', query: 'q', keywords: ['one'], product_url: 'https://example.com' }).length >= 2);
});

test('duplicate detector catches equal and near-identical normalized queries', () => {
  assert.ok(findNearDuplicate('抱っこ紐 の 中で 使える涼しいやつ', ['抱っこ紐の中で使える涼しいやつ']));
  assert.equal(findNearDuplicate('全く別の商品を用途から探す', ['抱っこ紐の中で使える涼しいやつ']), null);
});

test('first three batches review 100 percent and later batches review 20 percent', () => {
  const entries = Array.from({ length: 20 }, (_, i) => valid(i));
  assert.equal(deterministicSample(entries, 1).length, 20);
  assert.equal(deterministicSample(entries, 3).length, 20);
  assert.equal(deterministicSample(entries, 4).length, 4);
});

test('a batch cannot auto-approve without Claude naturalness review', () => {
  const entries = Array.from({ length: 10 }, (_, i) => valid(i));
  const pending = evaluateStagingBatch({ entries, existingQueries: [], batchNumber: 1 });
  assert.equal(pending.status, 'PENDING_CLAUDE_REVIEW');
  assert.equal(pending.approved, false);
  const approved = evaluateStagingBatch({ entries, existingQueries: [], batchNumber: 1, claudeReview: () => true });
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.pass_rate, 1);
});

test('less than 90 percent passes rejects the entire batch, not individual rows', () => {
  const entries = Array.from({ length: 10 }, (_, i) => valid(i));
  const result = evaluateStagingBatch({ entries, existingQueries: [], batchNumber: 1, claudeReview: (entry) => !entry.query.endsWith(' 0') && !entry.query.endsWith(' 1') });
  assert.equal(result.pass_rate, 0.8);
  assert.equal(result.status, 'REJECTED');
  assert.equal(result.approved, false);
});
