import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

// v4.3 指示書 Priority 3: フロントエンド側の配線を確認する。

test('v4.3項目12: index.htmlはAI最安比較のスクリプト・スタイルを読み込む', async () => {
  const html = await read('index.html');
  assert.match(html, /ai-price-comparison-ui\.mjs/);
  assert.match(html, /ai-price-comparison-ui\.css/);
});

test('v4.3項目12: productCard()はwindow.HoshiluPriceComparisonへ橋渡しする(ai-search-uiと同じブリッジパターン)', async () => {
  const app = await read('app.js');
  assert.match(app, /window\.HoshiluPriceComparison\?\.attach\(card,\{\.\.\.candidate,search_query:/);
});

test('AI推定価格の各モール横に、同じ検索語を引き継ぐ検索ボタンを表示する', async () => {
  const script = await read('ai-price-comparison-ui.mjs');
  assert.match(script, /search_query: String\(candidate\.search_query/);
  assert.match(script, /function appendSearchLink\(item, row, t\)/);
  assert.match(script, /price-compare-search-link/);
  assert.match(script, /price-compare-search-link'[\s\S]{0,180}link\.dataset\.marketplace = String\(row\.marketplace \|\| ''\)/);
  assert.match(script, /price-compare-link'[\s\S]{0,180}link\.dataset\.marketplace = String\(row\.marketplace \|\| ''\)/);
  assert.match(script, /価格の安い順で見る/);
  assert.match(script, /row\.search_sort === 'PRICE_ASC'/);
  assert.match(script, /appendSearchLink\(item, row, t\)/);
  assert.match(script, /function outboundRel\(marketplace\)/);
  assert.match(script, /sponsored nofollow noopener noreferrer/);
  assert.match(script, /price-compare-row-real[\s\S]*appendSearchLink\(item, row, t\)/);
  assert.match(script, /price-compare-row-unavailable[\s\S]*appendSearchLink\(item, row, t\)/);
});

test('v4.3項目13: UIは実価格(REAL)とAI推定(AI_ESTIMATE)を別のCSSクラスで描画し混同しない', async () => {
  const script = await read('ai-price-comparison-ui.mjs');
  assert.match(script, /price-compare-row-real/);
  assert.match(script, /price-compare-row-estimate/);
  assert.match(script, /price-compare-row-unavailable/);
  assert.doesNotMatch(script, /price-compare-row-real[\s\S]{0,200}range_min/);
});

test('v4.3項目15: 注意書きはresult.disclaimer_requiredがtrueの時だけ描画される', async () => {
  const script = await read('ai-price-comparison-ui.mjs');
  assert.match(script, /if \(result\.disclaimer_required\) container\.append/);
});

test('v4.3項目16: 断定文言(cheapest_claim)とヘッジ文言(hedged_claim)は別のCSSクラスで描画される', async () => {
  const script = await read('ai-price-comparison-ui.mjs');
  assert.match(script, /price-compare-claim-real/);
  assert.match(script, /price-compare-claim-hedged/);
  assert.match(script, /confirmed_price_note/);
  assert.match(script, /price-compare-confirmed-note/);
});

test('service-workerがAI最安比較の新規ファイルをプリキャッシュ対象に含む', async () => {
  const worker = await read('service-worker.js');
  assert.match(worker, /hoshilu-shell-v430/);
  assert.match(worker, /ai-price-comparison-ui\.mjs/);
  assert.match(worker, /ai-price-comparison-ui\.css/);
});

test('AI最安比較ダイアログは横揺れせず閉じるボタンを固定する', async () => {
  const css = await read('ai-price-comparison-ui.css');
  assert.match(css, /\.price-compare-dialog\{[^}]*overflow:hidden/);
  assert.match(css, /\.price-compare-body\{[^}]*overflow-y:auto[^}]*overflow-x:hidden/);
  assert.match(css, /\.price-compare-dialog-close\{[^}]*position:absolute[^}]*z-index:5/);
  assert.match(css, /@media\(max-width:480px\)\{\.price-compare-row\{display:grid/);
  assert.match(css, /\.price-compare-search-link\{grid-column:1\/-1[^}]*white-space:normal/);
});

// 2026-11-15 大隆さん指示: 写真で探す入口を検索窓のマイクの隣に。写真で探した結果は、写真を上に残して下からのシートで出す
test('写真で探す: 検索窓のカメラ入口と、写真を残す結果シートが読み込まれる（結果の描画後にだけ開く）', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="\/photo-lens\.css\?v=1">/);
  assert.match(html, /<script type="module" src="\/photo-lens\.mjs\?v=2"><\/script>/);
  assert.match(html, /id="searchCamera"/);
  const lens = await readFile(new URL('../public/photo-lens.mjs', import.meta.url), 'utf8');
  assert.match(lens, /label\.htmlFor = 'searchCamera'/);
  assert.match(lens, /addEventListener\('hoshilu:results-rendered', showResults\)/);
  // 2026-11-15 実機「写真撮ってから検索すると消えるよ」: 検索の開始・やり直しの合図では閉じない。写真は覚えておく
  assert.doesNotMatch(lens, /addEventListener\('hoshilu:search-(?:execution-started|cancelled)', closeLens\)/);
  assert.match(lens, /function rememberPhoto\(\)/);
  assert.doesNotMatch(lens, /fetch\(|google/iu, '写真を外へ送らない・他社の名前を使わない');
  const css = await readFile(new URL('../public/photo-lens.css', import.meta.url), 'utf8');
  assert.match(css, /body \.continuous-search-card\{grid-template-columns:minmax\(0,1fr\)\}/, '長い検索語で右へはみ出さない');
});
