import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  MARKETPLACE_INFO_TYPES, SALE_MARKETPLACES, handleMarketplaceSaleRoutes,
  nextMarketplaceNotificationAt, runMarketplaceContentCycle
} from '../src/marketplace-sales.mjs';

test('セール通知は掲載10モールだけを対象にする', () => {
  assert.deepEqual(SALE_MARKETPLACES, [
    'AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP', 'QOO10_JP', 'SHEIN_JP',
    'ZOZOTOWN', 'SHOPLIST', 'MUSINSA', 'BUYMA', 'SNKRDUNK'
  ]);
});

test('セールだけが初期ONで他の情報ジャンルは明示選択式', () => {
  assert.deepEqual(MARKETPLACE_INFO_TYPES, [
    'SALE', 'COUPON', 'NEW_ARRIVAL', 'LIMITED', 'RESTOCK', 'EDITORIAL'
  ]);
});

test('通知頻度とおやすみ時間をJSTで尊重する', () => {
  assert.equal(
    nextMarketplaceNotificationAt(
      { frequency: 'INSTANT', quiet_start: '21:00', quiet_end: '08:00' },
      new Date('2026-07-31T13:00:00.000Z')
    ),
    '2026-07-31T23:00:00.000Z'
  );
  assert.equal(
    nextMarketplaceNotificationAt(
      { frequency: 'DAILY', quiet_start: '21:00', quiet_end: '08:00' },
      new Date('2026-07-31T03:00:00.000Z')
    ),
    '2026-08-01T00:00:00.000Z'
  );
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
  assert.match(html, /id="notificationSettingsDialog"/);
  assert.match(html, /id="settingsInfoTypes"/);
  assert.match(html, /id="settingsMarketplaces"/);
  assert.match(html, /SearchAction/);
  assert.match(html, /hreflang="x-default"/);
  assert.match(css, /scroll-snap-type:x mandatory/);
  const client = await readFile(new URL('../public/sale-center.mjs', import.meta.url), 'utf8');
  assert.match(client, /data-language-select.*addEventListener\('change'/s);
  assert.match(client, /const officialUpdates=\[/);
  assert.match(client, /Amazon.*楽天市場.*Qoo10.*SHEIN.*ZOZOTOWN.*SHOPLIST.*MUSINSA.*BUYMA.*SNKRDUNK/s);
  assert.match(client, /掲載10モール/);
  assert.doesNotMatch(client, /掲載8モール|eight marketplaces|八个商城|8개 쇼핑몰/);
  assert.match(client, /Official updates always available/);
  assert.match(sw, /hoshilu-shell-v131/);
  assert.match(sw, /sale-center\.mjs/);
  assert.match(sw, /hero-slides\.mjs/);
  assert.match(sw, /hoshilu-fashion-collage-v1\.png/);
  assert.match(sw, /hoshilu-electronics-collage-v1\.png/);
});

test('商品画像はAPPROVEDになるまで公開しない契約を持つ', async () => {
  const source = await readFile(new URL('../src/marketplace-sales.mjs', import.meta.url), 'utf8');
  assert.match(source, /image_rights_status === 'APPROVED'/);
  assert.match(source, /status='APPROVED'/);
});

test('10 marketplace content and notification runs are recorded for monitoring', async () => {
  const writes=[];
  const env={PRODUCT_DB:{
    prepare(sql){
      return{
        bind(...values){
          return{
            all:async()=>({results:[]}),
            first:async()=>({approved_active_events:3,covered_marketplaces:2}),
            run:async()=>{writes.push({sql,values});return{meta:{changes:1}};}
          };
        },
        all:async()=>({results:[]})
      };
    }
  }};
  const result=await runMarketplaceContentCycle(env,new Date('2026-08-01T00:00:00.000Z'));
  assert.deepEqual(result,{status:'SUCCESS',queued:0,approved_active_events:3,covered_marketplaces:2});
  assert.equal(writes.length,1);
  assert.match(writes[0].sql,/marketplace_content_run_audit/);
  assert.deepEqual(writes[0].values.slice(1),['2026-08-01T00:00:00.000Z',3,2,0]);
});
