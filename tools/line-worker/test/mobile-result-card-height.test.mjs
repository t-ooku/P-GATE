import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('商品提示はPC4列・モバイル横長行で縦回転する', async () => {
  const [app, styles] = await Promise.all([read('app.js'), read('ai-search-layout-fix.css')]);
  assert.match(styles, /\.result-track\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\);[\s\S]*?overflow-y:auto;[\s\S]*?scroll-snap-type:y mandatory;/);
  assert.match(styles, /@media\(max-width:760px\)\{[\s\S]*?\.result-track\{[\s\S]*?flex-direction:column/);
  assert.match(styles, /grid-template-columns:minmax\(126px,40%\) minmax\(0,1fr\)/);
  assert.match(app, /attachVerticalTicker\(track,\{intervalMs:6500,rowSelector:':scope > \.product-card',useRowOffsets:true\}\)/);
  assert.match(app, /scrollBy\(\{top:/);
});

test('PC4列では画像と価格が同じ表示範囲に収まるようカードをコンパクト化する', async () => {
  const styles = await read('ai-search-layout-fix.css');
  assert.match(styles, /@media\(min-width:761px\)\{[\s\S]*?\.result-track>\.product-card\{min-height:0;gap:6px;padding:10px\}/);
  assert.match(styles, /height:clamp\(180px,15vw,225px\);[\s\S]*?aspect-ratio:auto/);
  assert.match(styles, /\.result-track>\.product-card p\{-webkit-line-clamp:1;line-clamp:1/);
  assert.match(styles, /\.result-track>\.product-card \.price-offer\{padding:7px 8px\}/);
});
