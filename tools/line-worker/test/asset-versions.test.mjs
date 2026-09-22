// 2026-09-21: アセットの版番号を literal で pin するのは **このファイルだけ**。
// UI を直して `?v=` を上げたら、ここの EXPECTED を 1 箇所直せば済む。
// 他のテストは test/helpers/asset-version.mjs を使い、版番号そのものは見ない。
// （以前は 6 つのテストに literal が散らばっており、UI 修正のたびにパッチが肥大して
//   転記ミスの原因になっていた。）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assetVersion, assetVersionsAgree } from './helpers/asset-version.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// index.html が参照している版。UI を変えたらここを上げる。
const EXPECTED = Object.freeze({
  'assets-v147/app.js': '194',
  'assets-v126/ai-search-layout-fix.css': '134',
  'mywatch.css': '12',
  'tab-nav.css': '4',
  'tab-nav.mjs': '10',
  'site-i18n.js': '9',
  'growth-analytics.mjs': '16',
  'ai-search-ui.mjs': '16',
  'search-suggest.mjs': '3',
  'buzz-home.mjs': '10',
  'google-mall-results.css': '6',
  'google-mall-results.mjs': '5',
  'usual-barcode.css': '1',
  'usual-barcode.mjs': '1',
  'today-hoshilu.css': '1',
  'today-hoshilu.mjs': '1',
  'usual-hoshiru.css': '4',
  'usual-hoshiru.mjs': '5',
  'result-compact.css': '3',
  'unified-results-ui.css': '8',
  'unified-results-ui.mjs': '6',
  'instagram-look.css': '5'
});

test('index.html のアセット版番号は pin したとおり', () => {
  const html = read('public/index.html');
  for (const [asset, version] of Object.entries(EXPECTED)) {
    assert.equal(assetVersion(html, asset), version, asset);
  }
});

test('同じアセットへの参照は全部同じ版（片方だけ上げる事故を防ぐ）', () => {
  const html = read('public/index.html');
  for (const asset of Object.keys(EXPECTED)) {
    assert.ok(assetVersionsAgree(html, asset), asset);
  }
});

test('growth-analytics は全ページ・ショップHTMLで同じ版を読む', () => {
  const version = EXPECTED['growth-analytics.mjs'];
  for (const path of ['public/index.html', 'public/login.html', 'public/buzz.html', 'src/seller-shop.mjs']) {
    assert.equal(assetVersion(read(path), 'growth-analytics.mjs'), version, path);
    assert.ok(assetVersionsAgree(read(path), 'growth-analytics.mjs'), path);
  }
});

test('配信する app.js と versioned コピーは同一ファイル', () => {
  assert.equal(read('public/app.js'), read('public/assets-v147/app.js'));
});
