import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

// 2026-08-08 依頼: 検索履歴と検索例を一つにまとめる。両者はステートに応じた
// 表示ロジックが別々に必要(検索履歴は会員かつ履歴がある時だけ表示、検索例は
// 未ログイン時のCTA/履歴なし時の案内/パーソナライズ済みチップの3状態)なので
// レンダリング関数自体は分けたまま、DOM上は1つの入れ物(#searchHintsSection)
// にまとめ、検索履歴も検索例と同じチップ調のスタイルへ揃える。

test('検索履歴と検索例は#searchHintsSectionという1つの入れ物にまとまっている', async () => {
  const html = await read('index.html');
  const wrapStart = html.indexOf('id="searchHintsSection"');
  assert.notEqual(wrapStart, -1);
  const wrapEnd = html.indexOf('</div>', html.indexOf('id="quickQueries"', wrapStart));
  const wrapSection = html.slice(wrapStart, wrapEnd);
  assert.match(wrapSection, /id="searchHistorySection"/);
  assert.match(wrapSection, /id="searchHistoryList"/);
  assert.match(wrapSection, /id="deleteAllSearchHistory"/);
  assert.match(wrapSection, /id="quickQueries"/);
  // 検索履歴(過去の検索)を先に、検索例(次の提案)を後に表示する。
  assert.ok(html.indexOf('id="searchHistorySection"') < html.indexOf('id="quickQueries"'));
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
