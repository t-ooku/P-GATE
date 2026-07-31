import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = name => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('トップ画面で主要4モールとファッション追加4モールを区別して表示する', async () => {
  const [html, css, module, serviceWorker] = await Promise.all([
    read('index.html'),
    read('marketplace-coverage.css'),
    read('marketplace-coverage.mjs'),
    read('service-worker.js')
  ]);

  assert.match(html, /MARKETPLACE COVERAGE/);
  assert.match(html, /すべてのジャンル/);
  assert.match(html, /ファッション検索で追加/);
  for (const mall of ['Amazon', '楽天市場', 'Qoo10', 'SHEIN', 'ZOZOTOWN', 'SHOPLIST', 'MUSINSA', 'BUYMA']) {
    assert.match(html, new RegExp(`>${mall}<`));
  }
  assert.match(html, /最大8モール対応/);
  assert.match(html, /出品を確認できた商品は商品ページへ/);
  assert.doesNotMatch(html, /すべてのジャンルで8モール/);

  assert.match(css, /\.marketplace-groups/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /grid-template-columns: 1fr/);

  for (const language of ['JA', 'EN', 'ZH', 'KO']) {
    assert.match(module, new RegExp(`${language}: \\{`));
  }
  assert.match(module, /hoshilu:languagechange/);
  assert.match(module, /Up to 8 marketplaces/);
  assert.match(module, /最多支持8个商城/);
  assert.match(module, /최대 8개 쇼핑몰/);

  assert.match(serviceWorker, /hoshilu-shell-v77/);
  assert.match(serviceWorker, /marketplace-coverage\.css/);
  assert.match(serviceWorker, /marketplace-coverage\.mjs/);
});
