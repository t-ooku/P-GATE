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

test('会員画面でWeb通知の一覧・既読・非表示を操作できる', async () => {
  const fs = await import('node:fs');
  const [html, app, css, serviceWorker] = [
    '../public/index.html', '../public/app.js', '../public/mywatch.css',
    '../public/service-worker.js'
  ].map((path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
  assert.match(html, /id="notificationList"/);
  assert.match(html, /mywatch\.css/);
  assert.match(app, /fetch\('\/api\/member\/notifications'/);
  assert.match(app, /updateNotification\(item\.notification_id,'READ'\)/);
  assert.match(app, /updateNotification\(item\.notification_id,'DISMISS'\)/);
  assert.match(app, /notification-source-link/);
  assert.doesNotMatch(app, /const fallback=body\.match/);
  assert.match(app, /source\.rel='noopener noreferrer'/);
  assert.match(app, /source\.textContent=ui\.open/);
  assert.match(css, /\.notification-item\.unread/);
  assert.match(css, /\.notification-source-link/);
  assert.match(app, /index\+=3/);
  assert.match(app, /notificationRotationTimer=setInterval\(\(\)=>move\(1\),6000\)/);
  assert.match(css, /\.notification-page\{[^}]*flex:0 0 100%/);
  assert.match(css, /scroll-snap-type:x mandatory/);
  assert.match(serviceWorker, /mywatch\.css/);
  assert.match(serviceWorker, /hoshilu-shell-v294/);
});

test('既存のモール通知にも承認済み公式URLを補完する', async () => {
  const fs = await import('node:fs');
  const source = fs.readFileSync(new URL('../src/mywatch-routes.mjs', import.meta.url), 'utf8');
  assert.match(source, /s\.sale_id=substr\(n\.event_key,1,instr\(n\.event_key,':'\)-1\)/);
  assert.match(source, /s\.status='APPROVED'/);
  assert.match(source, /s\.source_url LIKE 'https:\/\/%'/);
  assert.match(source, /AS source_url/);
});
