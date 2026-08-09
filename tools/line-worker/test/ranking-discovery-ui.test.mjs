import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../public/', import.meta.url);

test('ランキング検索は総合人気を自動実行し、その下にAI最安ランキングを描画する', async () => {
  const app = await readFile(new URL('app.js', root), 'utf8');
  assert.match(app, /runHoshiluRanking\(\);/);
  assert.match(app, /result\.ai_cheapest\?\.candidates\?\.length/);
  assert.match(app, /rankingKind==='cheapest'/);
  assert.match(app, /AI推定価格 約¥/);
  assert.match(app, /確認済み送料込み価格/);
});

test('小分類未確定時はAI候補チップと自由入力の両方でHOSHILUへ指示できる', async () => {
  const app = await readFile(new URL('app.js', root), 'utf8');
  const css = await readFile(new URL('styles.css', root), 'utf8');
  assert.match(app, /function renderRankingClarification/);
  assert.match(app, /AI候補：/);
  assert.match(app, /この小分類で調べる/);
  assert.match(app, /ランキングの小分類を入力/);
  assert.match(css, /ranking-category-instruction/);
});
