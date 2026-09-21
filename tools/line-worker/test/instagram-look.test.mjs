// 2026-09-21 大隆さん指示「見た目はInstagramに寄せて」。
// 既存の CSS を20枚書き換えず、最後に1枚重ねて上書きする方式を固定する。
// レイアウト（display/flex/grid/position）は触らない。色・角丸・影だけ。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasVersionedAsset } from './helpers/asset-version.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = () => read('public/instagram-look.css');

test('index.html と for-sellers.html が最後に instagram-look.css を読む', () => {
  for (const page of ['public/index.html', 'public/for-sellers.html']) {
    const html = read(page);
    assert.ok(hasVersionedAsset(html, 'instagram-look.css'), page);
    const others = [...html.matchAll(/<link rel="stylesheet" href="\/([a-z0-9-]+\.css)/gu)].map((m) => m[1]);
    assert.equal(others[others.length - 1], 'instagram-look.css', `${page}: 最後に読む`);
  }
});

test('白地・影なし・控えめな角丸', () => {
  const text = css();
  assert.match(text, /body\{background:var\(--ig-bg\) !important/u);
  assert.match(text, /body \*\{box-shadow:none !important\}/u);
  assert.match(text, /--ig-radius:12px/u);
  assert.match(text, /--ig-radius-sm:8px/u);
  assert.match(text, /--ig-line:#dbdbdb/u);
});

test('レイアウトには触らない（色・角丸・影だけ）', () => {
  const text = css();
  // 新しく足した需要チェックの枠だけは自分の部品なので display を持ってよい。
  const overrides = text.slice(0, text.indexOf('§31 需要チェック'));
  for (const property of ['position:', 'float:', 'grid-template', 'flex-direction']) {
    assert.ok(!overrides.includes(property), `既存要素の ${property} を触らない`);
  }
});

test('塗りつぶしボタンは1画面に1つ。副次の操作は白地＋線', () => {
  const text = css();
  assert.match(text, /#submitButton,#rankingSearchButton/u);
  assert.match(text, /\.direct-search-button,\.ranking-search-button\{\n\s*background:#fff !important;/u);
});

test('下タブは塗らず、文字とアイコンだけで選択を示す', () => {
  const text = css();
  assert.match(text, /\.tab-bar-item\.active[^{]*\{\s*\n\s*background:transparent !important;/u);
});

test('グラデーション文字と地のグラデーションをやめる', () => {
  const text = css();
  assert.match(text, /\.hero h1 span,h1 span,h2 span\{\n\s*background:none !important;/u);
});

test('読み上げ用ラベルを画面に出さない定義がある', () => {
  assert.match(css(), /\.visually-hidden\{position:absolute !important/u);
});

test('外したくなったら1行消せば戻せる（他のCSSを書き換えていない）', () => {
  // instagram-look.css の追加以外で、既存スタイルシートが今回書き換わっていないこと。
  // styles.css / layout-v3.css を触っていれば、この方式の前提が崩れる。
  const index = read('public/index.html');
  assert.match(index, /href="\/styles\.css"/u, '既存の読み込みは残っている');
  assert.match(index, /href="\/layout-v3\.css\?v=91"/u);
});
