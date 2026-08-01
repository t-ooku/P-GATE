import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = name => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('トップ画面で主要5モールとファッション追加5モールを区別して表示する', async () => {
  const [html, css, module, layout, serviceWorker] = await Promise.all([
    read('index.html'),
    read('marketplace-coverage.css'),
    read('marketplace-coverage.mjs'),
    read('lp-layout.mjs'),
    read('service-worker.js')
  ]);

  assert.match(html, /MARKETPLACE COVERAGE/);
  assert.match(html, /すべてのジャンル/);
  assert.match(html, /ファッション検索で追加/);
  for (const mall of ['Amazon', '楽天市場', 'Qoo10', 'SHEIN', 'ZOZOTOWN', 'SHOPLIST', 'MUSINSA', 'BUYMA', 'SNKRDUNK']) {
    assert.match(html, new RegExp(`>${mall}<`));
  }
  assert.match(html, /最大10モール対応/);
  assert.match(html, /class="marketplace-yahoo"><span>Yahoo!<br>ショッピング<\/span>/);
  assert.match(html, /出品を確認できた商品は商品ページへ/);
  assert.doesNotMatch(html, /すべてのジャンルで8モール/);

  assert.match(css, /\.marketplace-groups/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /grid-template-columns: 1fr/);
  assert.match(css, /\.marketplace-group > p \{\s*display: none/s);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 390px\)[\s\S]*\.marketplace-group-fashion ul \{\s*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.marketplace-group-fashion li \{[\s\S]*white-space: nowrap/);
  assert.match(layout, /item\.setAttribute\('role', 'button'\)/);
  assert.match(layout, /scrollIntoView\(\{ behavior: 'smooth'/);
  assert.match(layout, /insight\.after\(saleRadar, benefits\)/);
  assert.match(layout, /ホシル検索/);

  for (const language of ['JA', 'EN', 'ZH', 'KO']) {
    assert.match(module, new RegExp(`${language}: \\{`));
  }
  assert.match(module, /hoshilu:languagechange/);
  assert.match(module, /Up to 10 marketplaces/);
  assert.match(module, /Instagram, X, TikTok, and YouTube/);
  assert.match(module, /最多支持10个商城/);
  assert.match(module, /최대 10개 쇼핑몰/);

  assert.match(serviceWorker, /hoshilu-shell-v211/);
  assert.match(serviceWorker, /marketplace-coverage\.css/);
  assert.match(serviceWorker, /marketplace-coverage\.mjs/);
});
