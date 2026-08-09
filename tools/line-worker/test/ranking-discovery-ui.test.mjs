import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../public/', import.meta.url);

test('ランキングで検索は小分類確定後にHOSHILUの人気・最安値を別ボタンで選ぶ', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  const app = await readFile(new URL('app.js', root), 'utf8');
  const css = await readFile(new URL('styles.css', root), 'utf8');
  assert.match(html, /ランキングで検索/);
  assert.match(html, /id="rankingModeList"/);
  assert.match(app, /prepareHoshiluRankings\(\);/);
  assert.match(app, /function renderRankingModeChoices/);
  assert.match(app, /function renderHoshiluRanking/);
  assert.match(app, /HOSHILU総合人気ランキング/);
  assert.match(app, /HOSHILU最安値ランキング/);
  assert.match(app, /rankingKind==='cheapest'/);
  assert.doesNotMatch(app, /\/api\/ranking-capabilities/);
  assert.doesNotMatch(app, /runRankingSearch/);
  assert.doesNotMatch(app, /result\.marketplace\.label/);
  assert.match(css, /ranking-mode-button\[data-mode="popularity"\]/);
  assert.match(css, /ranking-mode-button\[data-mode="cheapest"\]/);
  assert.match(app, /AI推定価格 約¥/);
  assert.match(app, /確認済み送料込み価格/);
});

test('曖昧検索向けの従来2モードはランキング導線と分離して維持する', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  const app = await readFile(new URL('app.js', root), 'utf8');
  assert.match(html, /AIに確認して探す/);
  assert.match(html, /すぐ検索/);
  assert.match(app, /currentSearchMode\(\)==='identify'/);
  assert.match(app, /window\.HoshiluIdentifySearch\.open/);
});

test('小分類未確定時はAI候補チップと自由入力の両方でHOSHILUへ指示できる', async () => {
  const app = await readFile(new URL('app.js', root), 'utf8');
  const css = await readFile(new URL('styles.css', root), 'utf8');
  assert.match(app, /function renderRankingClarification/);
  assert.match(app, /AI候補：/);
  assert.match(app, /公式小分類：/);
  assert.match(app, /category_selection:categorySelection/);
  assert.match(app, /この小分類で調べる/);
  assert.match(app, /ランキングの小分類を入力/);
  assert.match(css, /ranking-category-instruction/);
});
