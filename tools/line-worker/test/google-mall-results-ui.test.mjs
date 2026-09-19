import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('index.html は google-mall-results の css/mjs を読み、app.js は results-rendered イベントで結果を渡す', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../public/assets-v147/app.js', import.meta.url), 'utf8');
  assert.ok(html.includes('href="/google-mall-results.css?v=1"'));
  assert.ok(html.includes('src="/google-mall-results.mjs?v=1"'));
  assert.match(app, /hoshilu:results-rendered/u);
  assert.match(app, /google_mall_results:result\?\.google_mall_results\|\|null/u);
});
