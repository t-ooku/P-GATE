// 2026-09-22 指示書「検索結果UI統合改修」の画面側。
// ・「見つかった商品」1セクションにまとめ、元の2つは畳む（§1）
// ・スマホは横スライド、PCは複数列グリッド＋縦スクロール（§5・追加指示§1/§4）
// ・HOSHILU商品だけ価格。Web商品は「価格は商品ページで確認」（§7）
// ・12件ずつ出す。60枚の画像を最初から読み込ませない（§11・§13）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../public/${path}`, import.meta.url), 'utf8');
const ui = () => read('unified-results-ui.mjs');
const css = () => read('unified-results-ui.css');

test('サーバーが決めた順番をそのまま描く（画面で並べ替えない）', () => {
  const source = ui();
  assert.ok(!/\.sort\(/u.test(source), 'ここで並べ替えると、Web結果が遅れて届くたびに位置が動く（§28）');
  assert.match(source, /items\.slice\(0, PAGE\)/u);
});

test('1セクションにまとめ、元の「ホシルからの提案」と web検索の枠は畳む', () => {
  const source = ui();
  assert.match(source, /title: '見つかった商品'/u);
  assert.match(source, /result-row-confirmed/u);
  assert.match(source, /#googleMallResults/u);
  // レコメンド（関連商品）は別の話なので畳まない
  assert.ok(!source.includes('result-row-recommended'), 'レコメンドまで消さない');
});

test('12件ずつ。最初から60枚の画像を読ませない', () => {
  const source = ui();
  assert.match(source, /const PAGE = 12;/u);
  assert.match(source, /img\.loading = 'lazy';/u);
  assert.match(source, /img\.decoding = 'async';/u);
  // 画像が落ちても列全体を壊さない（§13）
  assert.match(source, /img\.addEventListener\('error'/u);
});

test('HOSHILU商品だけ価格。Web商品は価格を書かない', () => {
  const source = ui();
  assert.match(source, /if \(Number\(item\.price_jpy\) > 0\)/u);
  assert.match(source, /priceUnknown: '価格は商品ページで確認'/u);
  // Web の価格（listed_price_jpy）をここで拾わない
  assert.ok(!source.includes('listed_price_jpy'), 'ページに書いてあっただけの数字を出さない');
});

test('件数の書き方で「全部で60件しかない」と誤解させない（§9）', () => {
  const source = ui();
  assert.match(source, /capped: \(n\) => `\$\{n\}件表示中`/u);
  assert.match(source, /unified\.truncated \? COPY\.capped/u);
  assert.match(source, /narrow: '条件を絞ると、さらに近い商品を探せます。'/u);
});

test('ソースは小さいバッジだけ（大きく分離しない §8）', () => {
  const source = ui();
  assert.match(source, /badge: \{ HOSHILU: 'HOSHILU', HOSHILU_SHOP: 'HOSHILU SHOP', WEB: 'Web' \}/u);
  assert.match(css(), /\.unified-badge\{[^}]*font-size:9\.5px/u);
});

test('ホシっとくは app.js の保存先をそのまま使う（別の保存を作らない）', () => {
  const source = ui();
  assert.match(source, /window\.HoshiluKeep/u);
  assert.ok(!source.includes('localStorage'), '保存先を二重に持たない');
});

test('スマホは横スライド、PCは複数列グリッド＋縦スクロール', () => {
  const sheet = css();
  const mobile = sheet.slice(sheet.indexOf('@media (max-width:760px)'), sheet.indexOf('@media (min-width:761px)'));
  assert.match(mobile, /\.unified-list\{[^}]*overflow-x:auto/u);
  assert.match(mobile, /\.unified-card\{flex:0 0 min\(200px,43vw\)/u, '2商品＋次が少し見える幅');
  const desktop = sheet.slice(sheet.indexOf('@media (min-width:761px)'));
  assert.match(desktop, /\.unified-list\{display:grid;gap:14px;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/u);
  assert.match(desktop, /@media \(min-width:1000px\)\{\s*\.unified-list\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}/u);
  assert.match(desktop, /@media \(min-width:1360px\)\{\s*\.unified-list\{grid-template-columns:repeat\(5,minmax\(0,1fr\)\)\}/u);
  assert.ok(!desktop.includes('overflow-x:auto'), 'PCで横スクロールは使わない');
});

test('商品名は2行で切り、カードの高さをそろえる', () => {
  assert.match(css(), /\.unified-card-name\{[^}]*-webkit-line-clamp:2/u);
  assert.match(css(), /\.unified-card-name\{[^}]*min-height:2\.8em/u);
});

test('index.html が読み、app.js が unified_results を渡している', () => {
  const html = read('index.html');
  assert.match(html, /unified-results-ui\.css\?v=1/u);
  assert.match(html, /unified-results-ui\.mjs\?v=1/u);
  const app = read('app.js');
  assert.match(app, /unified_results:result\?\.unified_results\|\|null/u);
  assert.equal(app, read('assets-v147/app.js'));
});
