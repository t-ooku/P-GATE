import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

// 2026-08-08 依頼: 「今日は、何が欲しい？」の直下にもう一つMARKETPLACE
// COVERAGEを設置し、検索窓が下へ行き過ぎないよう折りたたみ式にする。各
// ユーザー(ブラウザ)はログイン/訪問1回目だけ開いておき、2回目以降は
// 閉じておく。

test('ヒーロー直下にheroMarketplaceCoverageという折りたたみ式のMARKETPLACE COVERAGEを設置する', async () => {
  const html = await read('index.html');
  assert.match(html, /<details id="heroMarketplaceCoverage" class="marketplace-coverage hero-marketplace-coverage">/);
  assert.match(html, /<summary class="step hero-marketplace-coverage-summary">MARKETPLACE COVERAGE<\/summary>/);
  // ヒーロー(.hero)の直後、既存の検索フォーム(#hoshiluSearch)より前に置く。
  const heroEnd = html.indexOf('<div class="hero-visual" aria-hidden="true"></div>');
  const widgetStart = html.indexOf('id="heroMarketplaceCoverage"');
  const searchStart = html.indexOf('id="hoshiluSearch"');
  assert.notEqual(heroEnd, -1);
  assert.notEqual(widgetStart, -1);
  assert.notEqual(searchStart, -1);
  assert.ok(heroEnd < widgetStart, 'widget should come after the hero visual');
  assert.ok(widgetStart < searchStart, 'widget should come before the search form');
  // 既存の#marketplaceCoverageと同じ13モール内訳(integrated 3 / direct 10)。
  for (const mall of ['Amazon', '楽天市場', 'Qoo10', 'SHEIN', 'ZOZOTOWN', 'ロフト', 'ハンズ', 'マツキヨココカラ', '@cosme', 'ABC-MART', 'BUYMA', 'SNKRDUNK']) {
    const widgetSection = html.slice(widgetStart, html.indexOf('</details>', widgetStart));
    assert.match(widgetSection, new RegExp(`>${mall}<`), `missing ${mall} in hero widget`);
  }
});

test('hero-marketplace-coverage.mjsは既存のmarketplace-coverage.mjsの文言・分岐を再利用する(二重管理しない)', async () => {
  const module = await read('hero-marketplace-coverage.mjs');
  assert.match(module, /import \{ COPY, applyMarketplaceCoverageToNodes, selectedLanguage \} from '\.\/marketplace-coverage\.mjs'/);
  assert.match(module, /#heroMarketplaceCoverageTitle/);
  assert.match(module, /#heroMarketplaceCoverageLead/);
  assert.match(module, /#heroMarketplaceCoverageCount/);
  assert.match(module, /#heroMarketplaceIntegratedLabel/);
  assert.match(module, /#heroMarketplaceIntegratedList/);
  assert.match(module, /#heroMarketplaceDirectLabel/);
  assert.match(module, /#heroMarketplaceDirectList/);
  assert.match(module, /#heroMarketplaceCoverageNote/);
  assert.match(module, /hoshilu:languagechange/);

  // marketplace-coverage.mjs側もCOPY/applyMarketplaceCoverageToNodesを
  // exportし、既存の#marketplaceCoverage向けの挙動は変えていない。
  const base = await read('marketplace-coverage.mjs');
  assert.match(base, /export const COPY = \{/);
  assert.match(base, /export function applyMarketplaceCoverageToNodes\(targetNodes, language = selectedLanguage\(\)\)/);
  assert.match(base, /export function applyMarketplaceCoverage\(language = selectedLanguage\(\)\) \{\s*applyMarketplaceCoverageToNodes\(nodes, language\);\s*\}/);
});

test('ヒーローウィジェットは各ブラウザで初回訪問時だけ開き、2回目以降は閉じている', async () => {
  const app = await read('app.js');
  assert.match(app, /const heroMarketplaceCoverageDetails=document\.querySelector\('#heroMarketplaceCoverage'\);/);
  assert.match(app, /heroMarketplaceCoverageDetails\.open=!localStorage\.getItem\('hoshilu_hero_coverage_seen'\)/);
  assert.match(app, /localStorage\.setItem\('hoshilu_hero_coverage_seen','1'\)/);
});

test('service-workerがhero-marketplace-coverage.mjsをプリキャッシュ対象に含む', async () => {
  const sw = await read('service-worker.js');
  assert.match(sw, /'\/hero-marketplace-coverage\.mjs'/);
});

test('index.htmlがhero-marketplace-coverage.mjsを読み込む', async () => {
  const html = await read('index.html');
  assert.match(html, /<script type="module" src="\/hero-marketplace-coverage\.mjs"><\/script>/);
});
