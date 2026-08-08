import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

// v4.2 項目10・11: 検索履歴に「×」による個別削除と「すべて削除」を追加する。
// hoshilu_member_search_history はサーバー同期を持たないlocalStorage専用の
// キーなので、削除はlocalStorageから消すだけで良く、ページ更新後も復活し
// ない(サーバー側の再取得経路が無いため)。
test('v4.2項目10: 検索履歴の各行に×削除ボタンがあり、押した項目だけ削除される', async () => {
  const app = await read('app.js');
  assert.match(app, /function deleteSearchHistoryEntry\(value\)\{setSearchHistory\(getSearchHistory\(\)\.filter\(item=>item!==value\)\)/);
  assert.match(app, /function searchHistoryRowDeleteButton\(value,t\)/);
  assert.match(app, /button\.className='search-history-row-delete'/);
  assert.match(app, /button\.textContent='×'/);
});

test('v4.2項目11: 検索履歴をすべて削除するボタンがあり、削除後にlocalStorageから完全に消える(再読込しても復活しない)', async () => {
  const app = await read('app.js');
  assert.match(app, /function deleteAllSearchHistory\(\)/);
  assert.match(app, /localStorage\.removeItem\('hoshilu_member_search_history'\)/);
  // wishesの全削除と違い、検索履歴はサーバーAPIへ再取得しに行く経路
  // (syncMemberWishesに相当するもの)が無いことを保証する - もしサーバー
  // 同期を後から追加する場合は、削除後に再取得して復活させないよう
  // 明示的に確認すること。
  assert.doesNotMatch(app, /search.history[\s\S]{0,80}\/api\//i);
});

test('v4.2項目10・11: 検索履歴セクションはHTML側に存在し、個別/全削除ボタンの入れ物を持つ', async () => {
  const html = await read('index.html');
  assert.match(html, /id="searchHistorySection"/);
  assert.match(html, /id="searchHistoryList"/);
  assert.match(html, /id="deleteAllSearchHistory"/);
});

test('renderSearchHistoryは言語切替・ログイン状態変化のたびに呼ばれ、常に最新表示になる', async () => {
  const app = await read('app.js');
  assert.match(app, /setLanguage=function\(language\)\{baseSetLanguage\(language\);renderQuickExamples\(language\);renderSearchHistory\(\);\}/);
  assert.match(app, /function renderMemberState\(\)\{[\s\S]{0,600}renderSearchHistory\(\);\}/);
  assert.match(app, /rememberMemberSearch\(query\)\{[\s\S]{0,300}renderSearchHistory\(\);\}/);
});

test('検索履歴の直下に×なしの履歴由来チップを重複表示しない', async () => {
  const app = await read('app.js');
  assert.doesNotMatch(app, /personalizedQuickExamples/);
  assert.match(app, /elements\.quick\.classList\.toggle\('hidden',Boolean\(memberSession\)\)/);
});
