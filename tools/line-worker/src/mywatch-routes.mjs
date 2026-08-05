import { readMemberSession } from './member-auth.mjs';
import {
  normalizeWatchEvent, wishAcceptsEvent, nextDeliveryAt, notificationCopy, WATCH_EVENT_TYPES
} from './mywatch-policy.mjs';

function same(a, b) {
  const left = new TextEncoder().encode(String(a || ''));
  const right = new TextEncoder().encode(String(b || ''));
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

function internalAuthorized(request, env) {
  const expected = String(env.MYWATCH_CRON_SECRET || '');
  return expected.length >= 32
    && same(request.headers.get('x-hoshilu-internal-secret'), expected);
}

async function enqueue(request, env) {
  if (!internalAuthorized(request, env)) {
    return Response.json({ ok: false, error: 'MYWATCH_UNAUTHORIZED' }, { status: 401 });
  }
  const input = await request.json();
  const event = normalizeWatchEvent(input.event);
  const memberId = String(input.member_id || '').trim();
  const wishId = String(input.wish_id || '').trim();
  if (!memberId || !wishId) {
    return Response.json({ ok: false, error: 'MYWATCH_TARGET_REQUIRED' }, { status: 400 });
  }
  const wish = await env.PRODUCT_DB.prepare(
    'SELECT member_id,wish_id,language,watch_sale,watch_price,watch_coupon,watch_restock,watch_frequency FROM member_wishes WHERE member_id=?1 AND wish_id=?2'
  ).bind(memberId, wishId).first();
  if (!wish || !wishAcceptsEvent(wish, event)) {
    return Response.json({ ok: true, queued: false, reason: 'WATCH_DISABLED_OR_MISSING' });
  }
  const now = new Date().toISOString();
  const copy = notificationCopy(event, wish.language);
  const notificationId = crypto.randomUUID();
  const nextAt = nextDeliveryAt(wish.watch_frequency, event.occurred_at);
  const delivered = Date.parse(nextAt) <= Date.parse(now);
  const status = delivered ? 'DELIVERED' : 'PENDING';
  const attempts = delivered ? 1 : 0;
  const deliveredAt = delivered ? now : null;
  const result = await env.PRODUCT_DB.prepare(
    `INSERT OR IGNORE INTO mywatch_notifications
    (notification_id,member_id,wish_id,event_key,event_type,channel,title,body,status,attempts,next_attempt_at,delivered_at,created_at,updated_at,asin,marketplace,image_url)
    VALUES(?1,?2,?3,?4,?5,'WEB',?6,?7,?8,?9,?10,?11,?12,?12,?13,?14,?15)`
  ).bind(
    notificationId, memberId, wishId, event.event_key, event.event_type,
    copy.title, copy.body, status, attempts, nextAt, deliveredAt, now,
    event.asin, event.marketplace, event.image_url
  ).run();
  const queued = Number(result?.meta?.changes || 0) > 0;
  if (queued && delivered) {
    await env.PRODUCT_DB.prepare(
      `INSERT INTO mywatch_delivery_audit
      (audit_id,notification_id,action,channel,result,error_code,occurred_at)
      VALUES(?1,?2,'DELIVER','WEB','SUCCESS','',?3)`
    ).bind(crypto.randomUUID(), notificationId, now).run();
  }
  return Response.json({ ok: true, queued, duplicate: !queued });
}

// v3.4 CTO instruction: AIウォッチ(個別商品監視)とSALE RADAR(市場全体)の通知を
// 完全分離する。この2つは元々同じ mywatch_notifications テーブルへ書き込まれ
// ていた - enqueueSaleNotifications()(marketplace-sales.mjs, SALE RADAR/市場
// 全体、wish_id='MARKETPLACE_SALES' の固定センチネル)と、この下の enqueue()
// (個別 wish への実際の価格・在庫・クーポンイベント)の両方。SALE RADARの内容
// は既に sale-center.mjs/#saleRail が marketplace_sale_events から独立して
// 表示しているため、AIウォッチ通知パネル(このAPI)からは除外し、実際に商品を
// 指す個別イベントだけを返す。
async function list(request, env, member) {
  const result = await env.PRODUCT_DB.prepare(
    `SELECT n.notification_id,n.wish_id,n.event_type,n.title,n.body,n.status,
      n.delivered_at,n.read_at,n.created_at,n.asin,n.marketplace,n.image_url
    FROM mywatch_notifications n
    WHERE n.member_id=?1 AND n.status='DELIVERED' AND n.dismissed_at IS NULL
      AND n.wish_id!='MARKETPLACE_SALES'
    ORDER BY n.created_at DESC LIMIT 50`
  ).bind(member.id).all();
  return Response.json({ ok: true, notifications: result?.results || [] }, {
    headers: { 'cache-control': 'no-store' }
  });
}

async function update(request, env, member, notificationId) {
  const body = await request.json();
  const now = new Date().toISOString();
  const action = body.action === 'DISMISS' ? 'DISMISS' : 'READ';
  const sql = action === 'DISMISS'
    ? 'UPDATE mywatch_notifications SET dismissed_at=?3,updated_at=?3 WHERE member_id=?1 AND notification_id=?2'
    : 'UPDATE mywatch_notifications SET read_at=COALESCE(read_at,?3),updated_at=?3 WHERE member_id=?1 AND notification_id=?2';
  const result = await env.PRODUCT_DB.prepare(sql)
    .bind(member.id, notificationId, now).run();
  if (!Number(result?.meta?.changes || 0)) {
    return Response.json({ ok: false, error: 'MYWATCH_NOTIFICATION_NOT_FOUND' }, { status: 404 });
  }
  await env.PRODUCT_DB.prepare(
    `INSERT INTO mywatch_delivery_audit
    (audit_id,notification_id,action,channel,result,error_code,occurred_at)
    VALUES(?1,?2,?3,'WEB','SUCCESS','',?4)`
  ).bind(crypto.randomUUID(), notificationId, action, now).run();
  return Response.json({ ok: true, action });
}

// Sentinel wish_id for verification-only test notifications (mirrors the
// 'MARKETPLACE_SALES' sentinel marketplace-sales.mjs already uses for SALE
// RADAR). Never a real member_wishes row, so these never collide with a
// member's actual watched products, and can be found/purged by this one
// value alone.
const TEST_WISH_ID = 'AI_WATCH_TEST';

const TEST_EVENT_COPY = {
  JA: {
    SALE_START: ['販売が始まりました（テスト通知）', 'AIウォッチのテスト通知です。実際の販売開始ではありません。'],
    PRICE_DROP: ['価格が下がりました（テスト通知）', 'AIウォッチのテスト通知です。実際の値下げではありません。'],
    COUPON: ['クーポン情報があります（テスト通知）', 'AIウォッチのテスト通知です。実際のクーポンではありません。'],
    RESTOCK: ['再入荷しました（テスト通知）', 'AIウォッチのテスト通知です。実際の再入荷ではありません。']
  },
  EN: {
    SALE_START: ['Now available (test notification)', 'This is an AI Watch test notification, not a real sale start.'],
    PRICE_DROP: ['Price dropped (test notification)', 'This is an AI Watch test notification, not a real price drop.'],
    COUPON: ['Coupon available (test notification)', 'This is an AI Watch test notification, not a real coupon.'],
    RESTOCK: ['Back in stock (test notification)', 'This is an AI Watch test notification, not a real restock.']
  },
  ZH: {
    SALE_START: ['现已开售（测试通知）', '这是AI监控的测试通知，并非真实开售。'],
    PRICE_DROP: ['价格下降（测试通知）', '这是AI监控的测试通知，并非真实降价。'],
    COUPON: ['有可用优惠券（测试通知）', '这是AI监控的测试通知，并非真实优惠券。'],
    RESTOCK: ['已补货（测试通知）', '这是AI监控的测试通知，并非真实补货。']
  },
  KO: {
    SALE_START: ['판매가 시작되었습니다 (테스트 알림)', 'AI 워치 테스트 알림입니다. 실제 판매 시작이 아닙니다.'],
    PRICE_DROP: ['가격이 내려갔습니다 (테스트 알림)', 'AI 워치 테스트 알림입니다. 실제 가격 인하가 아닙니다.'],
    COUPON: ['쿠폰 정보가 있습니다 (테스트 알림)', 'AI 워치 테스트 알림입니다. 실제 쿠폰이 아닙니다.'],
    RESTOCK: ['재입고되었습니다 (테스트 알림)', 'AI 워치 테스트 알림입니다. 실제 재입고가 아닙니다.']
  }
};

function testEventsEnabled(env) {
  return String(env.MYWATCH_TEST_EVENTS_ENABLED || '') === '1';
}

// POST /api/member/notifications/test-seed - RC2 verification helper. Bypasses
// the real member_wishes/watch-flag gate enqueue() enforces (a test run
// should not require the tester to already have a matching wish configured)
// and inserts all 4 WATCH_EVENT_TYPES directly as DELIVERED so they show up
// in the panel immediately, without needing deliverDueWebNotifications' cron.
// This is not the production price/stock/coupon monitor - that external
// detection pipeline remains a separate, not-yet-built task (see
// docs/HOSHILU_AI_WATCH_FUTURE_DESIGN_v0.1.md).
async function seedTestNotifications(request, env, member) {
  if (!testEventsEnabled(env)) {
    return Response.json({ ok: false, error: 'MYWATCH_TEST_EVENTS_DISABLED' }, { status: 404 });
  }
  const language = ['JA', 'EN', 'ZH', 'KO'].includes(String(member.language || '').toUpperCase())
    ? String(member.language).toUpperCase() : 'JA';
  const copy = TEST_EVENT_COPY[language] || TEST_EVENT_COPY.JA;
  const now = new Date().toISOString();
  const demoProducts = {
    SALE_START: { asin: 'B0TESTSALE1', marketplace: 'AMAZON_JP', image_url: 'https://m.media-amazon.com/images/I/61aBSm2sVJL._AC_SL1500_.jpg' },
    PRICE_DROP: { asin: 'B0TESTPRICE', marketplace: 'RAKUTEN_JP', image_url: '' },
    COUPON: { asin: 'B0TESTCOUPN', marketplace: 'YAHOO_JP', image_url: '' },
    RESTOCK: { asin: 'B0TESTSTOCK', marketplace: 'AMAZON_JP', image_url: 'https://m.media-amazon.com/images/I/61aBSm2sVJL._AC_SL1500_.jpg' }
  };
  let queued = 0;
  for (const type of WATCH_EVENT_TYPES) {
    const [title, body] = copy[type];
    const demo = demoProducts[type];
    const notificationId = crypto.randomUUID();
    const eventKey = `TEST:${type}:${Date.now()}:${notificationId.slice(0, 8)}`;
    const result = await env.PRODUCT_DB.prepare(
      `INSERT OR IGNORE INTO mywatch_notifications
      (notification_id,member_id,wish_id,event_key,event_type,channel,title,body,status,attempts,next_attempt_at,delivered_at,created_at,updated_at,asin,marketplace,image_url)
      VALUES(?1,?2,?3,?4,?5,'WEB',?6,?7,'DELIVERED',1,?8,?8,?8,?8,?9,?10,?11)`
    ).bind(
      notificationId, member.id, TEST_WISH_ID, eventKey, type,
      title, body, now, demo.asin, demo.marketplace, demo.image_url
    ).run();
    queued += Number(result?.meta?.changes || 0);
  }
  return Response.json({ ok: true, queued });
}

// DELETE /api/member/notifications/test-seed - keeps test data from ever
// lingering in front of a real user: purges every test notification (and
// its audit trail) for the logged-in member only, identified solely by the
// TEST_WISH_ID sentinel so it can never touch a real watched-product event.
async function deleteTestNotifications(request, env, member) {
  const rows = await env.PRODUCT_DB.prepare(
    'SELECT notification_id FROM mywatch_notifications WHERE member_id=?1 AND wish_id=?2'
  ).bind(member.id, TEST_WISH_ID).all();
  const ids = (rows?.results || []).map((row) => row.notification_id);
  for (const id of ids) {
    await env.PRODUCT_DB.prepare('DELETE FROM mywatch_delivery_audit WHERE notification_id=?1').bind(id).run();
  }
  await env.PRODUCT_DB.prepare('DELETE FROM mywatch_notifications WHERE member_id=?1 AND wish_id=?2')
    .bind(member.id, TEST_WISH_ID).run();
  return Response.json({ ok: true, deleted: ids.length });
}

export async function deliverDueWebNotifications(env, now = new Date()) {
  if (!env.PRODUCT_DB) return { delivered: 0 };
  const occurredAt = new Date(now).toISOString();
  const due = await env.PRODUCT_DB.prepare(
    `SELECT notification_id,channel FROM mywatch_notifications
    WHERE channel IN ('WEB','APP') AND status='PENDING' AND next_attempt_at<=?1
    ORDER BY next_attempt_at ASC LIMIT 100`
  ).bind(occurredAt).all();
  let delivered = 0;
  for (const row of due?.results || []) {
    const result = await env.PRODUCT_DB.prepare(
      `UPDATE mywatch_notifications
      SET status='DELIVERED',attempts=attempts+1,delivered_at=?2,updated_at=?2
      WHERE notification_id=?1 AND channel IN ('WEB','APP') AND status='PENDING'`
    ).bind(row.notification_id, occurredAt).run();
    if (!Number(result?.meta?.changes || 0)) continue;
    delivered += 1;
    await env.PRODUCT_DB.prepare(
      `INSERT INTO mywatch_delivery_audit
      (audit_id,notification_id,action,channel,result,error_code,occurred_at)
      VALUES(?1,?2,'DELIVER',?3,'SUCCESS','',?4)`
    ).bind(crypto.randomUUID(), row.notification_id, row.channel, occurredAt).run();
  }
  return { delivered };
}

export async function handleMywatchRoutes(request, env) {
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/api/internal/mywatch/events') {
    return enqueue(request, env);
  }
  if (!url.pathname.startsWith('/api/member/notifications')) return null;
  const member = await readMemberSession(request, env);
  if (!member) return Response.json({ ok: false, error: 'MEMBER_REQUIRED' }, { status: 401 });
  if (request.method === 'GET' && url.pathname === '/api/member/notifications') {
    return list(request, env, member);
  }
  if (url.pathname === '/api/member/notifications/test-seed') {
    if (request.method === 'POST') return seedTestNotifications(request, env, member);
    if (request.method === 'DELETE') return deleteTestNotifications(request, env, member);
    return Response.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  }
  const match = url.pathname.match(/^\/api\/member\/notifications\/([A-Za-z0-9-]{8,80})$/);
  if (request.method === 'PATCH' && match) return update(request, env, member, match[1]);
  return Response.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
}
