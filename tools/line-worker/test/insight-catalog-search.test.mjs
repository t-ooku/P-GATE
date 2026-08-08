import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchCandidatesForInsight } from '../src/insight-catalog-search.mjs';

// section16: 「単純な部分文字列一致を使ってはいけない」「Teacher Dataset・
// カテゴリマッチング・ランキング基盤をできる限り再利用する」。実際に
// knowledge-search.mjs の applyIndexedSearchPolicy/filterCategoryMismatches/
// rankMerchantCandidates を呼び出していることをソース上で確認しつつ、通信・
// D1索引データを持たない環境でも安全に空配列を返すことを確認する(D1索引
// データを使ったカテゴリ不一致除去そのものの検証は、既存の
// test/knowledge-search*.test.mjs 側と、このリポジトリの重複防止ロジックを
// 検証する test/insight-routes.test.mjs 側(実際のfilterCategoryMismatches
// を使った固定データで検証)に譲る)。

test('section16: 実際のマッチング品質基盤(D1索引・カテゴリ不一致除去・ランキング)を再利用する実装になっている', () => {
  const source = readFileSync(new URL('../src/insight-catalog-search.mjs', import.meta.url), 'utf8');
  assert.match(source, /applyIndexedSearchPolicy/);
  assert.match(source, /filterCategoryMismatches/);
  assert.match(source, /rankMerchantCandidates/);
  assert.match(source, /from '\.\/knowledge-search\.mjs'/);
});

test('空文字/空白のみのクエリは検索を実行せず空配列を返す', async () => {
  assert.deepEqual(await searchCandidatesForInsight({}, ''), []);
  assert.deepEqual(await searchCandidatesForInsight({}, '   '), []);
});

test('PRODUCT_DB未設定でも例外を投げず空配列を返す(section16の基盤呼び出しがD1未設定を安全に扱う)', async () => {
  const result = await searchCandidatesForInsight({}, '白 長袖 レディース カットソー', 'JA');
  assert.deepEqual(result, []);
});
