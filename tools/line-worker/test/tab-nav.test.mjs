import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 2026-09-16 大隆さん指示: 下部固定メニュー（探す／ショップ／ホシる中／セール／マイアカウント）と上部のページ名帯
const read = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('トップは tab-nav を読み込み、5 タブと節の割り当てを持つ', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="stylesheet" href="\/tab-nav\.css\?v=1">/);
  assert.match(html, /<script type="module" src="\/tab-nav\.mjs\?v=1"><\/script><script type="module" src="\/assets-v147\/app\.js\?v=\d+"><\/script>/);
  assert.match(html, /<section id="accountPanel"/);
  assert.match(html, /<section id="shopCouponsNote"/);
  const nav = read('tab-nav.mjs');
  for (const id of ['search', 'shops', 'hoshiru', 'sale', 'account']) assert.match(nav, new RegExp(`id: '${id}'`));
  for (const label of ['探す', 'ショップ', 'ホシる中', 'セール', 'マイアカウント']) assert.ok(nav.includes(`label: '${label}'`), label);
  assert.match(nav, /\['#insight', 'hoshiru'\]/);
  assert.match(nav, /\['#buzzHome', 'hoshiru'\]/);
  assert.match(nav, /\['#watchDemand', 'hoshiru'\]/);
  assert.match(nav, /\['\.sale-center', 'sale'\]/);
  assert.match(nav, /\['#shopDirectory', 'shops'\]/);
  assert.match(nav, /\['#officialSocial', 'account'\]/);
  // ページ内リンクは属するタブを開いてからスクロール
  assert.match(nav, /target\.closest\('\[data-view\]'\)/);
  // 未実装のユーザーポイントは出さない
  assert.doesNotMatch(html, /ポイント管理/);
  const css = read('tab-nav.css');
  assert.match(css, /\.tab-bar\{position:fixed/);
  assert.match(css, /\.view-hidden\{display:none!important\}/);
  assert.match(read('service-worker.js'), /'\/tab-nav\.css', '\/tab-nav\.mjs'/);
});
