import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SALE_MARKETPLACES, handleMarketplaceSaleRoutes
} from '../src/marketplace-sales.mjs';

test('セール通知は掲載8モールだけを対象にする', () => {
  assert.deepEqual(SALE_MARKETPLACES, [
    'AMAZON_JP', 'RAKUTEN_JP', 'QOO10_JP', 'SHEIN_JP',
    'ZOZOTOWN', 'SHOPLIST', 'MUSINSA', 'BUYMA'
  ]);
});

test('公開セールAPIは未接続時も安全な空配列を返す', async () => {
  const response = await handleMarketplaceSaleRoutes(
    new Request('https://hoshilu.app/api/sales'), {}
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, sales: [] });
  assert.match(response.headers.get('cache-control'), /max-age=300/);
});

test('管理APIは内部Secretなしでセール情報を登録できない', async () => {
  const response = await handleMarketplaceSaleRoutes(
    new Request('https://hoshilu.app/api/internal/sales', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ marketplace: 'AMAZON_JP' })
    }),
    { MYWATCH_CRON_SECRET: 'x'.repeat(32) }
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'SALE_ADMIN_UNAUTHORIZED');
});

test('LPはセール専用通知・横スクロール・SEO構造化データを含む', async () => {
  const [html, css, sw] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/sale-center.css', import.meta.url), 'utf8'),
    readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /HOSHILU SALE RADAR/);
  assert.match(html, /セール専用通知/);
  assert.match(html, /SearchAction/);
  assert.match(html, /hreflang="x-default"/);
  assert.match(css, /scroll-snap-type:x mandatory/);
  assert.match(sw, /hoshilu-shell-v78/);
  assert.match(sw, /sale-center\.mjs/);
  assert.match(sw, /hero-slides\.mjs/);
});

test('商品画像はAPPROVEDになるまで公開しない契約を持つ', async () => {
  const source = await readFile(new URL('../src/marketplace-sales.mjs', import.meta.url), 'utf8');
  assert.match(source, /image_rights_status === 'APPROVED'/);
  assert.match(source, /status='APPROVED'/);
});
