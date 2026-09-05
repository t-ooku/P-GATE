// 2026-09-05 大隆さん指示: Amazonのように入力中に想定ワード・関連ワード候補を並べ、
// ジャンルから特定したメーカー名も候補に挙げる。詳細検索は投稿URLの右に置き、価格帯・
// ブランド・状態・配送を選べるようにする。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  suggestQueries, detectSuggestionCategory, CATEGORY_SUGGESTIONS, PRICE_BUCKETS, CONDITION_CHIPS
} from '../public/search-suggest-data.mjs';

test('ゴルフボールと入力すると、主要メーカーと関連ワードが候補に並ぶ', () => {
  const category = detectSuggestionCategory('ゴルフボール');
  assert.equal(category?.id, 'golf-ball');
  const items = suggestQueries('ゴルフボール', { limit: 30 });
  const queries = items.map((item) => item.query);
  assert.ok(queries.includes('ゴルフボール タイトリスト'));
  assert.ok(queries.includes('ゴルフボール キャロウェイ'));
  assert.ok(queries.includes('ゴルフボール ブリヂストン'));
  assert.ok(queries.includes('ゴルフボール 安い') || queries.includes('ゴルフボール ロストボール'));
  assert.ok(items.some((item) => item.kind === 'brand') && items.some((item) => item.kind === 'related'));
  // 既に含まれる語は重ねない
  assert.ok(!suggestQueries('ゴルフボール タイトリスト', { limit: 30 }).map((item) => item.query).includes('ゴルフボール タイトリスト タイトリスト'));
});

test('ジャンル未特定でも汎用の絞り込み語を出し、履歴は先頭に出す', () => {
  const items = suggestQueries('ほにゃらら', { limit: 5, extra: [{ query: 'ほにゃらら 前に探した', kind: 'history' }] });
  assert.equal(items[0].kind, 'history');
  assert.ok(items.length === 5);
  assert.equal(suggestQueries('').length, 0);
});

test('辞書は主婦層の日常ジャンルを広く持ち、各ジャンルにメーカーが複数ある', () => {
  assert.ok(CATEGORY_SUGGESTIONS.length >= 60);
  for (const entry of CATEGORY_SUGGESTIONS) {
    assert.ok(entry.match instanceof RegExp, entry.id);
    assert.ok(entry.brands.length >= 5, `${entry.id} brands`);
    assert.equal(new Set(entry.brands).size, entry.brands.length, `${entry.id} duplicate brand`);
    assert.equal(new Set(entry.modifiers).size, entry.modifiers.length, `${entry.id} duplicate modifier`);
  }
  for (const [query, id] of [['水筒 子供', 'water-bottle'], ['ワイヤレスイヤホン', 'earphones'], ['ベビーカー 軽量', 'stroller'], ['リップ', 'lip'], ['猫砂', 'cat']]) {
    assert.equal(detectSuggestionCategory(query)?.id, id, query);
  }
  // 価格帯は検索本文の予算解釈(◯円以下)に乗る形式
  assert.ok(PRICE_BUCKETS.every((bucket) => /^\d+円以下$/u.test(bucket.text)));
  assert.ok(CONDITION_CHIPS.some((group) => group.values.includes('中古')));
});

test('トップは候補モジュールを読み込み、詳細検索は投稿URLボタンの右に常設される', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../public/search-suggest.mjs', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../public/experience-layer.css', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(html, /<script type="module" src="\/search-suggest\.mjs\?v=1"><\/script>/u);
  assert.match(html, /id="socialUrlToggle"[\s\S]{0,900}<button id="advancedSearchToggle" type="button" class="search-input-action advanced-search-toggle"/u);
  assert.match(css, /#searchInputActions\.search-input-actions\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}/u);
  assert.match(css, /#searchInputActions \.search-social-action\{grid-column:auto\}/u);
  assert.match(css, /\.search-suggest-list\{/u);
  // 候補はタップで即検索、条件チップは #query に足す/外すだけ(検索契約は不変)
  assert.match(client, /form\.requestSubmit\(\)/u);
  assert.match(client, /localStorage\.getItem\(HISTORY_KEY\)/u);
  assert.doesNotMatch(client, /fetch\(/u);
  assert.match(client, /condition-group-brand/u);
  assert.match(app, /toggle\.querySelector\('#advancedSearchLabel'\)\|\|toggle/u);
});
