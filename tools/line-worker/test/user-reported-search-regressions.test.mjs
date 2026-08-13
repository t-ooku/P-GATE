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
