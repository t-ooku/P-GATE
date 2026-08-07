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

// 老若男女カバレッジ拡充 (2026-08-07 batch-002/003/004)。
// batch-001 は child 19件 / elderly 10件と手薄で、子どもと高齢者が実際に
// 使う「商品名を知らない言い方」がほとんど入っていなかった。HOSHILUの前提
// (商品名が分からなくても探せる)が最も効くのがこの2ペルソナなので、ここを
// 厚くしたぶんが失われないよう件数と代表クエリを固定する。
test('教師データが全ペルソナで実用的な件数を保っている', () => {
  const stats = teacherDatasetStats();
  assert.ok(stats.entryCount >= 220, `expected at least 220 compiled entries, got ${stats.entryCount}`);
  assert.ok(stats.sourceBatches.length >= 4, `expected at least 4 batches, got ${stats.sourceBatches.length}`);
});

test('子ども・高齢者の言い換えから商品を引ける', () => {
  const cases = [
    // 子ども: 動作や見た目でしか説明できない言い方
    ['えんぴつの芯が出るやつ', 'child', 'シャープペンシル'],
    ['丸をかくやつ', 'child', 'コンパス'],
    ['字を消すやつ', 'child', '消しゴム'],
    ['こおりがとけないみずとう', 'child', '保冷'],
    ['あぶないときならすやつ', 'child', '防犯ブザー'],
    // 高齢者: 困りごとから要件を導く言い方
    ['小さい字を大きくして見るやつ', 'elderly', '拡大鏡'],
    ['びんのふたをあける道具', 'elderly', 'オープナー'],
    ['しゃがまずに靴をはくやつ', 'elderly', '靴べら'],
    ['くすりを飲みわすれないようにするやつ', 'elderly', '服薬'],
  ];
  for (const [query, persona, expected] of cases) {
    const entry = lookupTeacherDatasetEntry(query);
    assert.ok(entry, `missing teacher entry: ${query}`);
    assert.equal(entry.persona, persona, `${query}: persona`);
    assert.match(entry.ideal_answer, new RegExp(expected), `${query}: ideal_answer`);
  }
});

// 「丸をかくやつ」は製図用コンパスで、方位磁針ではない。この手の同名異物は
// excluded_conditions で明示していないと、モール側の検索で簡単に取り違える。
test('同名異物・別用途を excluded_conditions で除外している', () => {
  assert.deepEqual(lookupTeacherDatasetEntry('丸をかくやつ').excluded_conditions, ['方位磁針', '登山用コンパス', '方位磁石']);
  assert.ok(lookupTeacherDatasetEntry('うわばき').excluded_conditions.some((item) => item.includes('外')));
  assert.ok(lookupTeacherDatasetEntry('洗濯機の中を洗うもの').excluded_conditions.includes('柔軟剤'));
  assert.ok(lookupTeacherDatasetEntry('お風呂のカビを防ぐやつ').excluded_conditions.some((item) => item.includes('カビ取り剤')));
});

// 医療・健康に踏み込むクエリは、商品を断定せず確認を返す。誤った製品を勧める
// ことが実害になりうる領域なので confidence を低く保ち、ideal_answer を
// 問いかけにしておく。
test('医療判断が必要なクエリは断定せず確認を返す', () => {
  for (const query of ['耳が遠くなってきたので音を大きくするやつ', '血の数値をはかる機械', '腰にはるやつ']) {
    const entry = lookupTeacherDatasetEntry(query);
    assert.ok(entry, `missing teacher entry: ${query}`);
    assert.equal(entry.category, 'UNCLASSIFIED', `${query}: should stay unclassified`);
    assert.ok(entry.confidence <= 0.3, `${query}: confidence should stay low, got ${entry.confidence}`);
    assert.match(entry.ideal_answer, /か？|ください/, `${query}: should ask rather than assert`);
  }
});

test('外国語・ローマ字の言い回しからも同じ商品に着地する', () => {
  assert.match(lookupTeacherDatasetEntry('bentou baran plastic leaf').ideal_answer, /バラン/);
  assert.match(lookupTeacherDatasetEntry('suihanki hitori gurashi').ideal_answer, /炊飯器/);
  assert.match(lookupTeacherDatasetEntry('일본 밥솥 소형').ideal_answer, /炊飯器/);
  assert.match(lookupTeacherDatasetEntry('日本 电饭煲 小型 一人用').ideal_answer, /炊飯器/);
  assert.match(lookupTeacherDatasetEntry('kotatsu table heater').ideal_answer, /こたつ/);
});
