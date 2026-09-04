import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { filterCategoryMismatches } from '../src/knowledge-search.mjs';
import { expandSearchQuery } from '../src/query-expansion.mjs';

const candidate = (asin, name) => ({ asin, product_name: name, offers: [] });

test('スモーキークォーツ リング検索ではピアスを除外し指輪だけを残す', () => {
  const results = filterCategoryMismatches('スモーキークォーツ リング オシャレ', [
    candidate('RING', 'スモーキークォーツ 天然石 リング 指輪'),
    candidate('PIERCE', 'スモーキークォーツ パール ピアス')
  ]);
  assert.deepEqual(results.map((item) => item.asin), ['RING']);
});

test('自立トートバッグは構造属性を保った検索語へ展開し別種バッグを除外する', () => {
  const expanded = expandSearchQuery('自立トートバッグ');
  assert.equal(expanded.expansion?.rule_id, 'self-standing-tote-bag');
  assert.match(expanded.query, /自立/);
  assert.match(expanded.query, /トートバッグ/);
  assert.match(expanded.query, /底板/);
  const results = filterCategoryMismatches(expanded.query, [
    candidate('TOTE', '底板付き 自立 トートバッグ A4'),
    candidate('SHOULDER', '自立 ショルダーバッグ')
  ]);
  assert.deepEqual(results.map((item) => item.asin), ['TOTE']);
});

test('商品一覧は内部縦スクロールを使わず検索窓だけを固定する', async () => {
  const [layout, sticky, app] = await Promise.all([
    readFile(new URL('../public/ai-search-layout-fix.css', import.meta.url), 'utf8'),
    readFile(new URL('../public/sticky-nav.css', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8')
  ]);
  assert.match(layout, /\.result-track\{[\s\S]*?max-height:none;[\s\S]*?overflow-y:visible;/);
  assert.match(sticky, /\.search-results-active \.topbar,[\s\S]*?position:\s*static/);
  assert.match(sticky, /\.search-results-active \.sticky-search\s*\{[\s\S]*?top:\s*0/);
  assert.match(app, /document\.documentElement\.classList\.add\('search-results-active'\)/);
});

test('本革トートバッグはショルダーバッグ単体と財布を除外する', () => {
  const results = filterCategoryMismatches('本革 トートバッグ', [
    candidate('TOTE', '本革 トートバッグ レディース A4'),
    candidate('SHOULDER', '本革 ショルダーバッグ'),
    candidate('WALLET', '本革 長財布')
  ]);
  assert.deepEqual(results.map((item) => item.asin), ['TOTE']);
});

test('商品棚の表示順位は候補の旧rankではなく必ずNO.1から振り直す', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /const safeRank=index\+1/);
  assert.doesNotMatch(app, /Number\(candidate\.rank\)\|\|index\+1/);
});

// 2026-09-04 大隆さん実機報告: 「底開口 水筒」で底が外せる水筒（ドウシシャ sokomo
// 「そこまで洗えるボトル」等）が出ない。展開規則の正式名詞がモール検索語の段階で
// 「水筒」まで削られていた。
test('底開口 水筒 は「そこまで洗えるボトル 水筒」へ展開され、その語がモールへ第1候補として渡る', async () => {
  const { buildRakutenSearchKeywordCandidates, buildAmazonSearchKeywords, buildMarketplaceApiKeywordCandidates } = await import('../src/index.mjs');
  for (const raw of ['底開口 水筒', '底が外せる水筒', '底まで洗えるボトル', '分解して洗える 水筒']) {
    const expanded = expandSearchQuery(raw);
    assert.equal(expanded.expansion?.rule_id, 'bottom-removable-bottle', raw);
    assert.equal(buildRakutenSearchKeywordCandidates(expanded.query, expanded.query)[0], 'そこまで洗えるボトル 水筒', raw);
    assert.equal(buildAmazonSearchKeywords(expanded.query), 'そこまで洗えるボトル 水筒', raw);
    assert.equal(buildMarketplaceApiKeywordCandidates(expanded.query, '水筒', '水筒')[0], 'そこまで洗えるボトル 水筒', raw);
  }
  // 展開規則の無い検索は従来どおり
  assert.equal(expandSearchQuery('水筒 500ml').expanded, false);
  const results = filterCategoryMismatches(expandSearchQuery('底開口 水筒').query, [
    candidate('SOKOMO', '【そこまで洗えるボトル】ドウシシャ 水筒 ステンレスボトル 1.0L 真空断熱 sokomo'),
    candidate('BRUSH', '水筒 洗浄ブラシ 底まで届く')
  ]);
  assert.ok(results.some((item) => item.asin === 'SOKOMO'));
});

// 2026-09-04 大隆さん実機報告（続き）: AI が「底開口 水筒」を「ドウシシャ sokomo そこまで洗えるボトル 水筒」
// へ直しても、その後の組み立てで「水筒」1語まで削られ AI 変換が無駄になっていた。
test('AI が直した短い検索語は、そのまま楽天/Yahoo の候補に残る', async () => {
  const { verbatimRefinedQueryCandidate, buildRakutenSearchKeywordCandidates, buildMarketplaceApiKeywordCandidates } = await import('../src/index.mjs');
  const refined = 'ドウシシャ sokomo そこまで洗えるボトル 水筒';
  assert.equal(verbatimRefinedQueryCandidate(refined, '底開口 水筒'), refined);
  assert.ok(buildRakutenSearchKeywordCandidates(refined, '底開口 水筒').includes(refined));
  assert.ok(buildMarketplaceApiKeywordCandidates(refined, '水筒', '水筒', '底開口 水筒').includes(refined));
  // 一般語「水筒」は後段の候補として残る
  assert.ok(buildRakutenSearchKeywordCandidates(refined, '底開口 水筒').includes('水筒'));
  // AI 変換が無い（元の語と同じ）／長文／句読点入りは対象外
  assert.equal(verbatimRefinedQueryCandidate('水筒 500ml', '水筒 500ml'), '');
  assert.equal(verbatimRefinedQueryCandidate('水筒 500ml', ''), '');
  assert.equal(verbatimRefinedQueryCandidate('底が取り外せて分解して丸洗いできる真空断熱のステンレス製の大容量の水筒 1リットル 子ども用', '底開口 水筒'), '');
  assert.equal(verbatimRefinedQueryCandidate('底が外せる水筒、ありますか？', '底開口 水筒'), '');
});
