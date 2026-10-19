import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

// 2026-08-08 依頼: 検索履歴と検索例を一つにまとめる。両者はステートに応じた
// 表示ロジックが別々に必要(検索履歴は会員かつ履歴がある時だけ表示、検索例は
// 未ログイン時のCTA/履歴なし時の案内/パーソナライズ済みチップの3状態)なので
// レンダリング関数自体は分けたまま、DOM上は1つの入れ物(#searchHintsSection)
// にまとめ、検索履歴も検索例と同じチップ調のスタイルへ揃える。

test('検索履歴は#searchHintsSectionに、検索例は検索窓のすぐ下にある（2026-10-19 入口の改善案）', async () => {
  const html = await read('index.html');
  const wrapStart = html.indexOf('id="searchHintsSection"');
  assert.notEqual(wrapStart, -1);
  const wrapEnd = html.indexOf('</form>', wrapStart);
  const wrapSection = html.slice(wrapStart, wrapEnd);
  assert.match(wrapSection, /id="searchHistorySection"/);
  assert.match(wrapSection, /id="searchHistoryList"/);
  assert.match(wrapSection, /id="deleteAllSearchHistory"/);
  // 2026-10-19 大隆さん OK: 訪問の 16% しか検索を始めていない。押すだけで探せる例を、検索窓（.query-field）の直後・検索ボタンより前へ
  const field = html.indexOf('<div class="query-field">');
  const quick = html.indexOf('id="quickQueries"');
  assert.ok(field !== -1 && quick > field, '検索窓の後');
  assert.ok(quick < html.indexOf('id="searchCluesDetails"'), '写真・SNS投稿の開閉より前');
  assert.ok(quick < html.indexOf('id="submitButton"'), '検索ボタンより前');
  const formStart = html.indexOf('<form id="knowledgeForm">');
  const formEnd = html.indexOf('</form>', formStart);
  assert.ok(quick > formStart && quick < formEnd, 'フォームの中（押すとそのまま検索）');
  // 「今日の値下がり」はフォームのすぐ後
  const drops = html.indexOf('id="topDrops"');
  assert.ok(drops > formEnd && drops < html.indexOf('class="panel-heading-details"'));
});

test('検索履歴の各行は検索例と同じ丸みのあるチップ調に統一され、×削除ボタンを内包する', async () => {
  const css = await read('ai-search-layout-fix.css');
  assert.match(css, /\.search-history-row\{[\s\S]*?border-radius:999px/);
  assert.match(css, /\.search-history-apply\{/);
  assert.match(css, /\.search-history-row-delete\{/);
  assert.match(css, /\.search-history-list\{[\s\S]*?display:flex/);
  assert.match(css, /\.search-history-toolbar\{/);
});

test('検索履歴の削除ロジックを保ち、履歴由来の×なし重複チップは表示しない', async () => {
  const app = await read('app.js');
  assert.match(app, /function renderSearchHistory\(\)/);
  assert.match(app, /function renderQuickExamples\(/);
  assert.match(app, /function deleteSearchHistoryEntry\(value\)/);
  assert.match(app, /function deleteAllSearchHistory\(\)/);
  assert.match(app, /quick:\$\('#quickQueries'\)/);
  assert.match(app, /searchHistorySection:\$\('#searchHistorySection'\)/);
  assert.doesNotMatch(app, /function personalizedQuickExamples/);
  assert.match(app, /if\(memberSession\)return/);
});
