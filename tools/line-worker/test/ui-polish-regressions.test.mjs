import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('スマホ商品番号は通常配置になり商品名へ重ならない', async () => {
  const css = await read('ai-search-layout-fix.css');
  assert.match(css, /\.result-track>\.product-card>\.rank\{position:static;grid-column:2;justify-self:start/);
  assert.doesNotMatch(css, /\.result-track>\.product-card>\.rank\{top:20px;left:14px\}/);
});

test('共有ボタンはSNS限定と誤認させず他アプリ共有と表示する', async () => {
  const app = await read('app.js');
  assert.match(app, /button:'他アプリでシェア'/);
  assert.doesNotMatch(app, /button:'SNSでシェア'/);
  assert.match(app, /button:'Share with another app'/);
});

test('INSIGHT補足は短い3項目の箇条書きで表示する', async () => {
  const [html, i18n] = await Promise.all([read('index.html'), read('site-i18n.js')]);
  assert.match(html, /<ul class="insight-diff-note">/);
  assert.equal((html.match(/data-i18n="insight\.diff(?:Insight|Watch|Sale)"/g) || []).length, 3);
  assert.doesNotMatch(html, /data-i18n="insight\.diffNote"/);
  assert.match(i18n, /'insight\.diffInsight':'INSIGHT：保存条件に合う新着商品'/);
});
