import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const module = readFileSync(new URL('../public/genre-explorer.mjs', import.meta.url), 'utf8');

test('トップは §52 の並び: 検索 → 結果 → 主要モール → ジャンル探索 → BUZZ → セール → 人気 → INSIGHT → NEWS', () => {
  const order = ['id="hoshiluSearch"', 'id="resultsSection"', 'id="heroMarketplaceCoverage"', 'id="genreExplorer"', 'id="buzzHome"', 'class="sale-center"', 'id="popularGenres"', 'id="insight"', 'id="announcements"'];
  const positions = order.map((marker) => { const index = html.indexOf(marker); assert.notEqual(index, -1, marker); return index; });
  for (let i = 1; i < positions.length; i += 1) assert.ok(positions[i - 1] < positions[i], `${order[i - 1]} before ${order[i]}`);
  assert.match(html, /<script type="module" src="\/genre-explorer\.mjs\?v=1"><\/script>/u);
  assert.match(html, /experience-layer\.css\?v=7/u);
  assert.match(html, /id="genreBreadcrumb"/u);
  assert.match(html, /id="popularRankingButton"/u);
});

test('ジャンル探索はファッション → バッグ → トートバッグ → 本革 → 自立する まで掘れて、葉は既存の検索フォームを送信する', () => {
  for (const label of ["label: 'ファッション'", "label: 'バッグ'", "label: 'トートバッグ'", "label: '本革'", "label: '自立する', q: '自立する 本革 トートバッグ'"]) assert.ok(module.includes(label), label);
  assert.match(module, /form\.requestSubmit\(\)/u);
  assert.match(module, /#knowledgeForm/u);
  assert.match(module, /#rankingSearchButton/u);
  assert.doesNotMatch(module, /fetch\(|Math\.random|localStorage/u);
  // 葉のクエリは検索フォームの検証（isUsableProductQuery）を通る日本語の商品語
  const leaves = [...module.matchAll(/q: '([^']+)'/gu)].map((m) => m[1]);
  assert.ok(leaves.length > 60);
  for (const q of leaves) assert.ok(q.length >= 1 && q.length <= 40, q);
});

// 2026-09-04 大隆さん決定（主婦層25〜40代・差別化は希望価格ウォッチとクーポン通知）
test('トップの副文言は通知の価値を含み、結果直下に通知の入口（希望価格・クーポン）が1つにまとまる', () => {
  assert.match(html, /一度に検索。<br>希望価格になったら通知、クーポンも見逃さない。/u);
  assert.match(readFileSync(new URL('../public/experience-layer.css', import.meta.url), 'utf8'), /\.hero-sub\{white-space:pre-line\}/u);
  assert.match(html, /id="resultNoticeStrip"/u);
  assert.match(html, /href="#mywatchTitle" class="result-notice-link" data-notice="watch"/u);
  assert.match(html, /href="#saleCenterTitle" class="result-notice-link" data-notice="coupon"/u);
  assert.ok(html.indexOf('id="resultCards"') < html.indexOf('id="resultNoticeStrip"'));
  assert.ok(html.indexOf('id="resultNoticeStrip"') < html.indexOf('id="heroMarketplaceCoverage"'));
});
