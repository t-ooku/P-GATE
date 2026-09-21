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

// 2026-09-21 大隆さん指示: 写真 → 商品名 → 価格 → ボタン。ボタンの順は
// これ、今買う？ / この価格になったら教えて / いつものにする / 気になる / 口コミ。
test('カードは 写真→商品名→価格→ボタン の順。ボタンの並びは指示どおり、口コミは最後', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const card = app.slice(app.indexOf('function productCard('), app.indexOf('function rankingCard('));
  const at = (needle) => { const i = card.indexOf(needle); assert.ok(i > 0, needle); return i; };
  assert.ok(at("card.append(title)") < at("actions.className='product-card-actions'"), '商品名はボタンより先');
  assert.ok(at('const options=renderOfferOptions(') < at("actions.className='product-card-actions'"), '価格はボタンより先');
  // 置き場所を先に作り、外の部品が足す順に結果が左右されないようにする
  assert.match(card, /actions\.append\(buySlot,watchSlot,usualSlot,keepSlot\);/u);
  assert.match(card, /if\(priceComparisonButton\)buySlot\.append\(priceComparisonButton\);/u);
  assert.match(card, /watchSlot\.append\(watch\.bell\);/u);
  assert.match(card, /container:usualSlot/u);
  assert.match(card, /keepSlot\.append\(createKeepButton\(candidate\)\);/u);
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
  assert.match(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'), /experience-layer\.css\?v=16/u);
});
