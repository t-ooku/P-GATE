import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// v4.2 項目12: プライバシー監査。
//
// 検索フォームとプライバシー方針は、質問・投稿URL・画像をHOSHILUへ
// 保存しないと明示している。ところが handleKnowledgeApi の
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

test('検索入力の非保存と外部AI処理を、チェックボックスなしで正確に開示する', async () => {
  const [app, html, privacy, analysis, visualWebDetection] = await Promise.all([
    read('../public/app.js'), read('../public/index.html'), read('../public/privacy.html'),
    read('../src/search-input-analysis.mjs'), read('../src/google-visual-web-detection.mjs')
  ]);
  assert.doesNotMatch(html, /id="consent"|type="checkbox" required/);
  // 2026-09-05 大隆さん指示: 入力欄の注意書きは一行に短縮。「保存しません」の約束は
  // プライバシーページ側で担保する(下のassertion)。入力欄は外部AI利用と顔・住所の注意のみ。
  assert.match(app, /候補抽出にGoogleのAIを利用。顔や住所は写さないでください。/);
  assert.match(app, /Google AI extracts candidates/);
  assert.doesNotMatch(app, /写真・URLは保存しません/);
  assert.match(html, /候補抽出にGoogleのAIを利用。顔や住所は写さないでください。/);
  assert.match(app, /Google\s?のAI|Google AI/u);
  assert.match(privacy, /Google Gemini API/);
  assert.match(privacy, /Google Cloud Vision API/);
  assert.match(privacy, /データベース、オブジェクトストレージには質問本文、投稿URL、撮影写真・画像を保存せず/);
  assert.match(privacy, /元画像のEXIF・位置情報を引き継ぎません/);
  assert.match(privacy, /整理された検索語を端末内の検索履歴へ保存/);
  assert.doesNotMatch(analysis, /console\.(?:info|log|warn)\([^)]*(?:query|socialUrl|data)/u);
  assert.doesNotMatch(visualWebDetection, /console\.(?:info|log|warn)/u);
  assert.doesNotMatch(visualWebDetection, /return\s+.*(?:page\?\.url|image\?\.url|image\.data)/u);
  assert.doesNotMatch(visualWebDetection, /cf-connecting-ip|fingerprint_hash|session_id/iu);
});
