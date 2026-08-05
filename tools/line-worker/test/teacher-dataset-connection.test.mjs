import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupTeacherDatasetEntry, teacherDatasetStats } from '../src/search-quality/teacher-dataset-lookup.mjs';
import { structureSearchQuery } from '../src/search-quality/query-structurer.mjs';
import { filterCategoryMismatches } from '../src/knowledge-search.mjs';
import { buildAmazonSearchKeywords, buildRakutenSearchKeywords } from '../src/index.mjs';

test('Day1バッチがコンパイル済みアーティファクトへ反映されている', () => {
  const stats = teacherDatasetStats();
  assert.ok(stats.entryCount >= 90, `expected at least 90 compiled entries, got ${stats.entryCount}`);
  assert.ok(stats.sourceBatches.some((name) => name.includes('day1')));
});

test('子ども・高齢者・外国人ペルソナがそれぞれ最低件数カバーされている', async () => {
  const fs = await import('node:fs/promises');
  const raw = await fs.readFile(new URL('../evaluation/teacher-dataset/2026-08-06-day1-batch-001.json', import.meta.url), 'utf8');
  const records = JSON.parse(raw);
  const byPersona = (persona) => records.filter((item) => item.persona === persona).length;
  assert.ok(byPersona('child') >= 20, `child coverage: ${byPersona('child')}`);
  assert.ok(byPersona('elderly') >= 10, `elderly coverage: ${byPersona('elderly')}`);
  assert.ok(byPersona('foreign') >= 20, `foreign coverage: ${byPersona('foreign')}`);
});

test('query-structurerはUNKNOWNな曖昧クエリを教師データのideal_answerで解決する', () => {
  const result = structureSearchQuery('ゲームにつなぐやつ', 'ja');
  assert.ok(result.teacher_dataset_match);
  assert.match(result.teacher_dataset_match.ideal_answer, /ゲーム機/);
});

test('query-structurerは教師データの具体カテゴリでproduct_typeを解決する', () => {
  const result = structureSearchQuery('充電する線', 'ja');
  assert.equal(result.product_type, 'cable');
  assert.ok(result.teacher_dataset_match);
});

test('buildAmazonSearchKeywordsは教師データの検索語を直接使う(カットソー)', () => {
  assert.equal(buildAmazonSearchKeywords('カットソー'), 'カットソー レディース カットソー');
});

test('buildRakutenSearchKeywordsは教師データの検索語を直接使う(軽い掃除機)', () => {
  const result = buildRakutenSearchKeywords('軽い掃除機');
  assert.match(result, /軽量 掃除機/);
});

test('filterCategoryMismatchesは教師データのexcluded_conditionsで候補を除外する(カットソー)', () => {
  const entry = lookupTeacherDatasetEntry('カットソー');
  assert.ok(entry.excluded_conditions.includes('家具'));
  const filtered = filterCategoryMismatches('カットソー', [
    { asin: 'REAL01', product_name: 'レディース カットソー 長袖 白 トップス' },
    { asin: 'BAD01', product_name: 'ローテーブル 家具 木製' }
  ]);
  assert.deepEqual(filtered.map((item) => item.asin), ['REAL01']);
});

test('必須検索テストの6クエリすべてが教師データで解決またはUNCLASSIFIED確認質問を持つ', () => {
  const requiredQueries = [
    'カットソー',
    '透明ワイヤレスイヤホン',
    '韓国っぽいバッグ',
    'SNSで見た透明なやつ',
    '旅行で荷物を小さくしたい',
    '名前が分からないけど透明なやつ'
  ];
  for (const query of requiredQueries) {
    const entry = lookupTeacherDatasetEntry(query);
    assert.ok(entry, `no teacher-dataset entry for "${query}"`);
    assert.ok(entry.ideal_answer, `no ideal_answer for "${query}"`);
  }
});
