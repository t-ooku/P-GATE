import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('商品提示はモバイルでもコンパクトな縦回転リストになる', async () => {
  const [app, styles] = await Promise.all([read('app.js'), read('ai-search-layout-fix.css')]);
  assert.match(styles, /\.result-track\{[\s\S]*?flex-direction:column;[\s\S]*?overflow-y:auto;[\s\S]*?scroll-snap-type:y mandatory;/);
  assert.match(styles, /grid-template-columns:104px minmax\(0,1fr\)/);
  assert.match(app, /attachVerticalTicker\(track,\{intervalMs:6500,rowSelector:':scope > \.product-card',useRowOffsets:true\}\)/);
  assert.match(app, /scrollBy\(\{top:/);
});
