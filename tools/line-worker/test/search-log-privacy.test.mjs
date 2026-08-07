import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// v4.2 項目12: プライバシー監査。
//
// 同意チェックボックスの文言(app.js copy.consent, 4言語)は「質問本文は
// サーバーログへ保存しません」(EN: "The raw question is not stored in
// server logs.")と明示している。ところが handleKnowledgeApi の
// SEARCH_TRACE と rakuten-marketplace-api.mjs の RAKUTEN_PIPELINE_TRACE は
// console.info経由でCloudflare Workersログへ出力されており、以前は
// query: input.query / keywords: query という形でユーザーの検索文その
// ものを含んでいた(=同意文言と矛盾)。
//
// これらのログはWorkerログという「サーバーログ」そのものであり、GASバック
// エンドへ実際に検索処理として送る callGas(...) 呼び出し(機能上必須)とは
// 別物である。このテストは、ログ出力側からユーザー入力の生文字列が完全に
// 消えていること(文字数などの非識別情報のみ残ること)を回帰的に保証する。
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('v4.2項目12: SEARCH_TRACEはユーザーの検索文そのものをログへ出力しない', async () => {
  const source = await read('../src/index.mjs');
  assert.doesNotMatch(source, /console\.info\('SEARCH_TRACE',[\s\S]{0,200}query:\s*input\.query/);
  assert.doesNotMatch(source, /console\.info\('SEARCH_TRACE',[\s\S]{0,200}original_query:/);
  assert.match(source, /query_length: input\.query\.length/);
});

test('v4.2項目12: RAKUTEN_PIPELINE_TRACEはユーザーの検索文そのものをログへ出力しない', async () => {
  const source = await read('../src/rakuten-marketplace-api.mjs');
  assert.doesNotMatch(source, /console\.info\('RAKUTEN_PIPELINE_TRACE',[\s\S]{0,200}keywords:\s*query\b/);
  const keywordLogCount = (source.match(/keywords_length: String\(query \|\| ''\)\.length/g) || []).length;
  assert.equal(keywordLogCount, 4);
});

test('v4.2項目12: 同意文言(4言語)は「質問本文はサーバーログへ保存しません」という約束を維持している', async () => {
  const app = await read('../public/app.js');
  assert.match(app, /質問本文はサーバーログへ保存しません/);
  assert.match(app, /raw question is not stored in server logs/i);
});
