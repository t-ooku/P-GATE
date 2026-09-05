import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('確認済み商品（最大30件）は縦の回転スクロール、レコメンドだけ横の回転', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /function attachConfirmedTicker\(track\)/u);
  assert.match(app, /attachVerticalTicker\(track,\{intervalMs:6000,rowSelector:':scope > \.product-card',useRowOffsets:true\}\)/u);
  assert.match(app, /result-track-vertical-ticker/u);
  assert.doesNotMatch(app, /CONFIRMED_LIST_LIMIT|result-row-overflow/u);
  assert.equal(app, readFileSync(new URL('../public/assets-v147/app.js', import.meta.url), 'utf8'));
  const css = readFileSync(new URL('../public/experience-layer.css', import.meta.url), 'utf8');
  assert.match(css, /\.result-row-confirmed \.result-track\.result-track-vertical-ticker\{max-height:min\(82vh,760px\);overflow-y:auto/u);
});

test('カードは「ホシっとく」→「AI最安比較」、購入希望価格ウォッチは口コミの上に横一面、口コミの見出しは改行しない', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /if\(priceComparisonButton\)mediaActions\.append\(priceComparisonButton\);\s*watch\.bell\.classList\.add\('watch-full-row'\);\s*card\.append\(watch\.bell\);/u);
  assert.doesNotMatch(app, /mediaActions\.append\(watch\.bell\)/u);
  const client = readFileSync(new URL('../public/experience-layer.mjs', import.meta.url), 'utf8');
  assert.match(client, /title: '口コミ'/u);
  assert.match(client, /card\.append\(block\)/u);
  const css = readFileSync(new URL('../public/experience-layer.css', import.meta.url), 'utf8');
  assert.match(css, /\.result-track>\.product-card>\.watch-full-row\{grid-column:1 \/ -1/u);
  assert.match(css, /\.experience-head strong\{[^}]*white-space:nowrap/u);
  // 2026-09-04 大隆さん指示: 「この価格になったら教えて」が一番目立つ（グラデーション）、AI最安比較は控えめ
  assert.match(css, /\.watch-full-row\.watch-settings-button\{[^}]*background:linear-gradient/u);
  assert.match(css, /\.result-row \.result-track>\.product-card \.product-card-media-actions \.ai-price-compare-button\{[^}]*background:#fff/u);
  assert.match(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'), /experience-layer\.css\?v=13/u);
});
