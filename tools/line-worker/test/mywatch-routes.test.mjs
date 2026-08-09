import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deliverDueWebNotifications, handleMywatchRoutes
} from '../src/mywatch-routes.mjs';

// Mirrors member-auth.mjs's private pack()/sign()/b64() cookie scheme (not
// exported) just enough to fabricate a valid hoshilu_member_session cookie
// for testing the authenticated test-seed/delete routes below.
const encoder = new TextEncoder();
function b64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}
async function memberCookie(profile, secret) {
  const body = b64(encoder.encode(JSON.stringify({ ...profile, exp: Math.floor(Date.now() / 1000) + 3600 })));
  return `hoshilu_member_session=${encodeURIComponent(`${body}.${await sign(body, secret)}`)}`;
}
function fakeD1() {
  const rows = [];
  const audit = [];
  return {
    rows,
    audit,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              if (/^INSERT OR IGNORE INTO mywatch_notifications/.test(sql)) {
                rows.push({
                  notification_id: values[0], member_id: values[1], wish_id: values[2],
                  event_key: values[3], event_type: values[4]
                });
                return { meta: { changes: 1 } };
              }
              if (/^DELETE FROM mywatch_notifications/.test(sql)) {
                const [memberId, wishId] = values;
                const before = rows.length;
                for (let i = rows.length - 1; i >= 0; i -= 1) {
                  if (rows[i].member_id === memberId && rows[i].wish_id === wishId) rows.splice(i, 1);
                }
                return { meta: { changes: before - rows.length } };
              }
              if (/^DELETE FROM mywatch_delivery_audit/.test(sql)) {
                audit.push(values[0]);
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            },
            async all() {
              if (/^SELECT notification_id FROM mywatch_notifications/.test(sql)) {
                const [memberId, wishId] = values;
                return { results: rows.filter((row) => row.member_id === memberId && row.wish_id === wishId) };
              }
              return { results: [] };
            }
          };
        }
      };
    }
  };
}

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
  assert.match(serviceWorker, /hoshilu-shell-v339/);
  // RC2で使った投入・削除ボタンは本番UIへ残さない。テスト用API自体は
  // 下記の回帰テストからだけ明示的にフラグを立てて検証する。
  const indexMarkup = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const wrangler = fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /mywatchTestControls|テスト通知を4件表示|テスト通知を削除/);
  assert.doesNotMatch(indexMarkup, /mywatchTestControls/);
  assert.doesNotMatch(wrangler, /MYWATCH_TEST_EVENTS_ENABLED/);
});

test('縦回転はスクロールスナップを一時停止して滑らかに移動し再描画時に解除する', async () => {
  const fs = await import('node:fs');
  const ticker = fs.readFileSync(new URL('../public/vertical-ticker.mjs', import.meta.url), 'utf8');
  assert.match(ticker, /STEP_DURATION_MS = 600/);
  assert.match(ticker, /viewport\.style\.scrollSnapType = 'none'/);
  assert.match(ticker, /viewport\.style\.scrollSnapType = previousScrollSnapType/);
  assert.match(ticker, /existing\.cancelAnimation\(\)/);
  assert.match(ticker, /existing\.cancelResume\(\)/);
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

// RC2: 開発・検証専用のテスト通知投入。フラグOFFなら404で完全に無効化され、
// フラグONかつ会員ログイン時のみ4種(値下げ/クーポン/再入荷/販売開始)を
// DELIVERED状態で即時投入し、専用センチネルwish_idで後から確実に削除できる。
test('テスト通知投入APIはフラグOFFなら404、ONなら4種類をDELIVEREDで即時投入する', async () => {
  const secret = 'a-secure-secret-that-is-at-least-32-characters';
  const cookie = await memberCookie({ id: 'member-1', provider: 'LINE' }, secret);

  const disabledDb = fakeD1();
  const disabledResponse = await handleMywatchRoutes(
    new Request('https://hoshilu.app/api/member/notifications/test-seed', {
      method: 'POST', headers: { cookie }
    }),
    { LINK_SIGNING_SECRET: secret, PRODUCT_DB: disabledDb, MYWATCH_TEST_EVENTS_ENABLED: '0' }
  );
  assert.equal(disabledResponse.status, 404);
  assert.equal(disabledDb.rows.length, 0);

  const db = fakeD1();
  const seedResponse = await handleMywatchRoutes(
    new Request('https://hoshilu.app/api/member/notifications/test-seed', {
      method: 'POST', headers: { cookie }
    }),
    { LINK_SIGNING_SECRET: secret, PRODUCT_DB: db, MYWATCH_TEST_EVENTS_ENABLED: '1' }
  );
  assert.equal(seedResponse.status, 200);
  const seedPayload = await seedResponse.json();
  assert.equal(seedPayload.queued, 4);
  assert.deepEqual(db.rows.map((row) => row.event_type).sort(), ['COUPON', 'PRICE_DROP', 'RESTOCK', 'SALE_START']);
  assert.ok(db.rows.every((row) => row.wish_id === 'AI_WATCH_TEST'));
  assert.ok(db.rows.every((row) => row.member_id === 'member-1'));

  const deleteResponse = await handleMywatchRoutes(
    new Request('https://hoshilu.app/api/member/notifications/test-seed', {
      method: 'DELETE', headers: { cookie }
    }),
    { LINK_SIGNING_SECRET: secret, PRODUCT_DB: db, MYWATCH_TEST_EVENTS_ENABLED: '1' }
  );
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual(await deleteResponse.json(), { ok: true, deleted: 4 });
  assert.equal(db.rows.length, 0);
});

test('テスト通知削除は他会員のテストデータへ影響しない', async () => {
  const secret = 'a-secure-secret-that-is-at-least-32-characters';
  const cookieA = await memberCookie({ id: 'member-a', provider: 'LINE' }, secret);
  const cookieB = await memberCookie({ id: 'member-b', provider: 'LINE' }, secret);
  const db = fakeD1();
  const env = { LINK_SIGNING_SECRET: secret, PRODUCT_DB: db, MYWATCH_TEST_EVENTS_ENABLED: '1' };
  await handleMywatchRoutes(new Request('https://hoshilu.app/api/member/notifications/test-seed', { method: 'POST', headers: { cookie: cookieA } }), env);
  await handleMywatchRoutes(new Request('https://hoshilu.app/api/member/notifications/test-seed', { method: 'POST', headers: { cookie: cookieB } }), env);
  assert.equal(db.rows.length, 8);
  await handleMywatchRoutes(new Request('https://hoshilu.app/api/member/notifications/test-seed', { method: 'DELETE', headers: { cookie: cookieA } }), env);
  assert.equal(db.rows.length, 4);
  assert.ok(db.rows.every((row) => row.member_id === 'member-b'));
});
