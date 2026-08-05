import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deliverDueWebNotifications, handleMywatchRoutes
} from '../src/mywatch-routes.mjs';

test('MYWATCH内部イベントAPIは32文字以上の共有秘密なしで拒否する', async () => {
  const request = new Request('https://hoshilu.app/api/internal/mywatch/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hoshilu-internal-secret': 'wrong' },
    body: JSON.stringify({ event: {} })
  });
  const response = await handleMywatchRoutes(request, {
    MYWATCH_CRON_SECRET: 'a-secure-secret-that-is-at-least-32-characters'
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'MYWATCH_UNAUTHORIZED');
});

test('MYWATCH会員通知APIは未認証利用者へ情報を返さない', async () => {
  const request = new Request('https://hoshilu.app/api/member/notifications');
  const response = await handleMywatchRoutes(request, {
    LINK_SIGNING_SECRET: 'a-secure-secret-that-is-at-least-32-characters'
  });
  assert.equal(response.status, 401);
});

test('配信時刻を迎えたWeb通知だけを配信済みにする', async () => {
  const writes = [];
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async all() {
              assert.match(sql, /status='PENDING'/);
              assert.equal(values[0], '2026-07-26T00:00:00.000Z');
              return { results: [{ notification_id: 'due-notification' }] };
            },
            async run() {
              writes.push({ sql, values });
              return { meta: { changes: 1 } };
            }
          };
        }
      };
    }
  };
  const result = await deliverDueWebNotifications(
    { PRODUCT_DB: db },
    new Date('2026-07-26T00:00:00.000Z')
  );
  assert.deepEqual(result, { delivered: 1 });
  assert.equal(writes.length, 2);
  assert.match(writes[0].sql, /SET status='DELIVERED'/);
  assert.match(writes[1].sql, /mywatch_delivery_audit/);
});

test('会員画面でWeb通知を縦回転ティッカーで一覧・既読操作できる', async () => {
  const fs = await import('node:fs');
  const [html, app, css, serviceWorker] = [
    '../public/index.html', '../public/app.js', '../public/mywatch.css',
    '../public/service-worker.js'
  ].map((path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
  assert.match(html, /id="notificationList"/);
  assert.match(html, /mywatch\.css/);
  assert.match(app, /fetch\('\/api\/member\/notifications'/);
  assert.match(app, /updateNotification\(item\.notification_id,'READ'\)/);
  // 2026-08-05 v4.0: the first ticker pass (v3.0) dropped the read/dismiss
  // buttons to fit a compact one-line row; v4.0 explicitly requires not
  // removing existing functionality, so both actions - and the row's own
  // product-click-through - were restored as small buttons within the row.
  assert.match(app, /updateNotification\(item\.notification_id,'DISMISS'\)/);
  assert.match(app, /window\.open\(sourceUrl/);
  assert.match(app, /notificationRow/);
  assert.doesNotMatch(app, /const fallback=body\.match/);
  // 2026-08-05 v3.0: the 3-card-per-page horizontal carousel was replaced by
  // a shared vertical ticker (see vertical-ticker.mjs), which also fixed the
  // partially-cut-off neighboring card reported on mobile.
  assert.match(app, /attachVerticalTicker\(list\)/);
  assert.match(app, /unreadDiff/);
  assert.doesNotMatch(app, /notification-carousel/);
  assert.match(css, /\.notification-row\.unread/);
  assert.match(css, /\.notification-thumb/);
  assert.match(css, /\.notification-row-action/);
  assert.match(serviceWorker, /mywatch\.css/);
  assert.match(serviceWorker, /hoshilu-shell-v303/);
});

// v3.4 CTO instruction: AIウォッチ(個別商品監視)とSALE RADAR(市場全体)の通知は
// 完全分離する。SALE RADARの内容は sale-center.mjs/#saleRail が
// marketplace_sale_events から独立して表示しているため、AIウォッチ通知
// パネル(このAPI)は市場全体のセール通知(wish_id='MARKETPLACE_SALES')を
// 除外し、実際に商品を指す個別イベントの列(asin/marketplace/image_url)
// だけを返す。
test('AIウォッチ通知一覧はSALE RADAR(MARKETPLACE_SALES)を除外し商品単位の列を返す', async () => {
  const fs = await import('node:fs');
  const source = fs.readFileSync(new URL('../src/mywatch-routes.mjs', import.meta.url), 'utf8');
  assert.match(source, /n\.wish_id!='MARKETPLACE_SALES'/);
  assert.match(source, /n\.asin,n\.marketplace,n\.image_url/);
});
