import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('index.html は google-mall-results の css/mjs を読み、app.js は results-rendered イベントで結果を渡す', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../public/assets-v147/app.js', import.meta.url), 'utf8');
  assert.ok(html.includes('href="/google-mall-results.css?v=3"'));
  assert.ok(html.includes('src="/google-mall-results.mjs?v=3"'));
  assert.match(app, /hoshilu:results-rendered/u);
  assert.match(app, /google_mall_results:result\?\.google_mall_results\|\|null/u);
});

// 2026-09-21 大隆さん指示: Google 枠のカードは「ホシルからの提案」と同じ幅。
// 「商品を見る →」と「ホシっとく」の間の空きは詰める。
test('Google 枠のカード幅は提案カードと同じで、保存ボタンは内容の直下に置く', () => {
  const css = readFileSync(new URL('../public/google-mall-results.css', import.meta.url), 'utf8');
  assert.ok(css.includes('.google-mall-track>.google-mall-card{flex:0 0 min(300px,82vw);width:min(300px,82vw);max-width:none;min-width:0}'));
  assert.ok(css.includes('.google-mall-card>.google-mall-card-link{flex:0 0 auto}'));
  assert.ok(css.includes('.google-mall-card>.google-mall-card-save{padding:2px 10px 10px}'));
});
