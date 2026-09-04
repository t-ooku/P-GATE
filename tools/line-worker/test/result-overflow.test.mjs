import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('確認済み商品の縦一覧は10件まで、11件目以降は横スワイプの回転スクロールへ', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /const CONFIRMED_LIST_LIMIT=10;/u);
  assert.match(app, /cards\.slice\(0,CONFIRMED_LIST_LIMIT\)/u);
  assert.match(app, /result-row result-row-recommended result-row-overflow/u);
  assert.match(app, /resultCarousel\(overflow,'recommended'\)/u);
  assert.equal(app, readFileSync(new URL('../public/assets-v147/app.js', import.meta.url), 'utf8'));
  const css = readFileSync(new URL('../public/experience-layer.css', import.meta.url), 'utf8');
  assert.match(css, /\.result-row-overflow\{/u);
});

test('口コミ（Experience）はカード末尾の全幅に置き、見出し行に投稿ボタンをまとめる', () => {
  const client = readFileSync(new URL('../public/experience-layer.mjs', import.meta.url), 'utf8');
  assert.match(client, /title: '口コミ'/u);
  assert.match(client, /post: '口コミを投稿する'/u);
  assert.match(client, /card\.append\(block\)/u);
  assert.doesNotMatch(client, /anchor\.before\(block\)/u);
  const css = readFileSync(new URL('../public/experience-layer.css', import.meta.url), 'utf8');
  assert.match(css, /\.result-track>\.product-card>\.experience-block\{grid-column:1 \/ -1/u);
  assert.match(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'), /experience-layer\.mjs\?v=2/u);
});
