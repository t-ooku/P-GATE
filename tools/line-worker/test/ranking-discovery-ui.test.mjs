import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../public/', import.meta.url);

test('ランキングで探すは小分類をYES確認後に人気・最安値を別ボタンで選ぶ', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  const app = await readFile(new URL('app.js', root), 'utf8');
  const css = await readFile(new URL('styles.css', root), 'utf8');
  assert.match(html, /ランキングで探す/);
  assert.match(html, /id="rankingModeList"/);
  assert.match(app, /prepareHoshiluRankings\(null,\{confirmationOnly:true,preserveRejections:false\}\)/);
  assert.match(app, /function renderRankingModeChoices/);
  assert.match(app, /function renderHoshiluRanking/);
  assert.match(app, /function renderRankingCategoryConfirmation/);
  assert.match(app, /confirmation_only:confirmationOnly/);
  assert.match(app, /yes\.textContent='YES'/);
  assert.match(app, /no\.textContent='NO'/);
  assert.match(app, /outcome\.action==='return_to_search'/);
  assert.match(app, /returnFromRankingToSearch/);
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

test('小分類未確定時は一候補ずつ確認し、候補切れなら自由入力で再判定できる', async () => {
  const app = await readFile(new URL('app.js', root), 'utf8');
  const css = await readFile(new URL('styles.css', root), 'utf8');
  assert.match(app, /function renderRankingCategoryConfirmation/);
  assert.match(app, /createRankingConfirmationFlow/);
  assert.match(app, /rejectRankingCategoryProposal/);
  assert.match(app, /category_selection:categorySelection/);
  assert.match(app, /AIにもう一度聞く/);
  assert.match(app, /ランキングの小分類を入力/);
  assert.match(css, /ranking-category-instruction/);
  const worker = await readFile(new URL('service-worker.js', root), 'utf8');
  assert.match(worker, /ranking-confirmation-flow\.mjs/);
});

test('ランキング商品は商品名を2行に省略し詳細を押した時だけ全文と補足を表示する', async () => {
  const app = await readFile(new URL('app.js', root), 'utf8');
  const css = await readFile(new URL('styles.css', root), 'utf8');
  assert.match(app, /title\.classList\.add\('ranking-product-title'\)/);
  assert.match(app, /description\?\.remove\(\)/);
  assert.match(app, /details\.className='ranking-product-details'/);
  assert.match(app, /ranking-details-open','詳細を見る'/);
  assert.match(app, /ranking-full-product-title/);
  assert.match(app, /ranking-product-description/);
  assert.match(css, /\.ranking-product-title\{[^}]*-webkit-line-clamp:2/);
  assert.match(css, /\.ranking-details-close\{display:none\}/);
  assert.match(css, /\.ranking-product-details\[open\] \.ranking-details-open\{display:none\}/);
});
