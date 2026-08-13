import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Gemini整理検索と従来HOSHILU検索を上書きせず統合する', async () => {
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(source, /const originalSearchCandidates = filterCategoryMismatches/);
  assert.match(source, /interleaveCandidatesBySource\(\[refinedCandidates, originalLaneCandidates\]\)/);
  assert.match(source, /gemini_refined_count: refinedCandidates\.length/);
  assert.match(source, /hoshilu_original_count: originalLaneCandidates\.length/);
  assert.match(source, /rankMerchantCandidates\([\s\S]*?expandedQuery\.query/);
});
