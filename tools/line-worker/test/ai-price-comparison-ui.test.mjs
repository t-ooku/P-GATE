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
  assert.match(script, /appendSearchLink\(item, row, t\)/);
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
});

test('service-workerがAI最安比較の新規ファイルをプリキャッシュ対象に含む', async () => {
  const worker = await read('service-worker.js');
  assert.match(worker, /hoshilu-shell-v345/);
  assert.match(worker, /ai-price-comparison-ui\.mjs/);
  assert.match(worker, /ai-price-comparison-ui\.css/);
});
