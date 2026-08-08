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

test('LPはセール専用通知・縦スクロール一覧・SEO構造化データを含む', async () => {
  const [html, css, sw] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/sale-center.css', import.meta.url), 'utf8'),
    readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /HOSHILU SALE RADAR/);
  assert.match(html, /全てのセールを、<br>先回りチェックしよう/);
  assert.match(html, /10モールのセール情報を横断。開始前にもお知らせし/);
  assert.match(html, /セール専用通知/);
  assert.match(html, /id="notificationSettingsDialog"/);
  assert.match(html, /id="settingsInfoTypes"/);
  assert.match(html, /id="settingsMarketplaces"/);
  assert.match(html, /SearchAction/);
  assert.match(html, /hreflang="x-default"/);
  assert.match(css, /\.sale-rail\{[^}]*overflow-y:auto/);
  assert.doesNotMatch(css, /scroll-snap-type:x mandatory/);
  const client = await readFile(new URL('../public/sale-center.mjs', import.meta.url), 'utf8');
  assert.match(client, /data-language-select.*addEventListener\('change'/s);
  assert.match(client, /const officialUpdates=\[/);
  assert.match(client, /Amazon.*楽天市場.*Qoo10.*SHEIN.*ZOZOTOWN.*SHOPLIST.*MUSINSA.*BUYMA.*SNKRDUNK/s);
  assert.match(client, /全てのセールを、\\n先回りチェックしよう/);
  assert.match(client, /10モールのセール情報を横断/);
  assert.doesNotMatch(client, /掲載8モール|eight marketplaces|八个商城|8개 쇼핑몰/);
  assert.match(client, /Unverified information is not published/);
  assert.match(html, /id="settingsChannels"/);
  assert.match(sw, /hoshilu-shell-v332/);
  assert.match(css, /\.sale-rail\{[^}]*overflow-y:auto/);
  assert.doesNotMatch(css, /\.sale-card\{/);
  assert.match(sw, /sale-center\.mjs/);
  assert.match(sw, /hero-slides\.mjs/);
  assert.match(sw, /hoshilu-fashion-collage-v1\.png/);
  assert.match(sw, /hoshilu-electronics-collage-v1\.png/);
});

// Regression for the 2026-08-05 report: on mobile (<=760px), SALE RADAR /
// HOSHILU NEWS ticker rows reflow the mall name and title onto their own
// full-width grid lines (see the max-width:760px block below), which needs
// roughly 3x the desktop row height. But .info-row is a flex item inside
// .sale-rail/.info-row-list (display:flex;flex-direction:column), and the
// default flex-shrink:1 let the browser shrink each row down toward its
// 44px min-height (sized for the desktop single-line layout) to fit more
// rows in the fixed-height scroll viewport. That squeezed the 3-line grid
// content into a box too short for it, collapsing the title's grid row to
// 0px and rendering the title text visually on top of the mall text above
// it (verified live: title.top < mall.bottom). Fixed with flex-shrink:0 so
// each row keeps its natural (3-line) content height and the ticker's
// existing overflow-y:auto scroll handles the rest, as intended.
test('モバイルのSALE RADAR行は3行スタック時に潰れて文字が重ならないようflex-shrink:0を持つ', async () => {
  const css = await readFile(new URL('../public/sale-center.css', import.meta.url), 'utf8');
  const mobileBlock = css.match(/@media\(max-width:760px\)\{([\s\S]*?)\}\}$/m)?.[0] || '';
  // 2026-08-07: scoped to :not(.notification-row) so this rule no longer
  // leaks into the AIウォッチ通知 list, which has its own mobile grid in
  // mywatch.css - but the flex-shrink:0 protection for SALE RADAR/NEWS rows
  // themselves must remain.
  assert.match(mobileBlock, /\.info-row:not\(\.notification-row\)\{[^}]*flex-shrink:0/);
});

// AIウォッチUI (Phase C item17, 2026-08-07). Scoping the rule above to
// :not(.notification-row) left the AIウォッチ rows with the default
// flex-shrink:1, so inside the fixed-height .info-row-list flex column they
// collapsed to their 44px min-height while the stacked title+mall+body
// content still needed ~51px (PC) / ~69px (mobile) - measured live: each
// row's content overflowed 7px (PC) / 14px (mobile) into the row below.
// Separately, sale-center.css colours .info-row-title/.info-row-date for
// the dark SALE RADAR/NEWS gradient (#fff / #cfc7ff); on the AIウォッチ
// list's near-white background that rendered the notification title white
// on white. Both are fixed in mywatch.css, scoped to .notification-list /
// .notification-row so the tickers keep their own styling.
test('AIウォッチ通知行は潰れず、タイトルが白抜けせず、タップ領域を44px確保する', async () => {
  const css = await readFile(new URL('../public/mywatch.css', import.meta.url), 'utf8');
  // 行が潰れて次の行に文字が重ならない
  assert.match(css, /\.notification-row\{[^}]*flex-shrink:0/);
  // 明るい背景の上でタイトル・日付が読める色に上書きされている
  assert.match(css, /\.notification-list \.info-row-title\{color:#211b3b\}/);
  assert.match(css, /\.notification-list \.info-row-date\{color:#6d6b80\}/);
  // サムネイル付き通知でも未読が分かる
  assert.match(css, /\.notification-row\.unread \.notification-thumb\{[^}]*box-shadow/);
  // スマホの✓/×はタップ領域44px以上（行自体がrole="link"のため誤タップが遷移になる）
  const mobileBlock = css.match(/@media\(max-width:760px\)\{[\s\S]*\}$/m)?.[0] || '';
  assert.match(mobileBlock, /\.notification-row-action\{[^}]*width:44px;height:44px/);
  // 通知行の高さに合わせたビューポート（44px想定のticker用高さを使わない）
  assert.match(css, /\.notification-list\.info-row-list\{height:auto;max-height:240px/);
  assert.match(mobileBlock, /\.notification-list\.info-row-list\{height:auto;max-height:300px\}/);
});

test('商品画像はAPPROVEDになるまで公開しない契約を持つ', async () => {
  const source = await readFile(new URL('../src/marketplace-sales.mjs', import.meta.url), 'utf8');
  assert.match(source, /image_rights_status === 'APPROVED'/);
  assert.match(source, /status='APPROVED'/);
});

test('10 marketplace content and notification runs are recorded for monitoring', async () => {
  const writes=[];
  const env={OFFICIAL_MARKETPLACE_SYNC_DISABLED:true,PRODUCT_DB:{
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
  assert.deepEqual(result,{status:'SUCCESS',queued:0,approved_active_events:3,covered_marketplaces:2,official:{checked:0,updated:0,failed:0,skipped:true}});
  assert.equal(writes.length,1);
  assert.match(writes[0].sql,/marketplace_content_run_audit/);
  assert.deepEqual(writes[0].values.slice(1),['2026-08-01T00:00:00.000Z',3,2,0]);
});
