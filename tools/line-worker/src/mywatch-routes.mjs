import { readMemberSession } from './member-auth.mjs';
import {
  normalizeWatchEvent, wishAcceptsEvent, nextDeliveryAt, notificationCopy
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
    (notification_id,member_id,wish_id,event_key,event_type,channel,title,body,status,attempts,next_attempt_at,delivered_at,created_at,updated_at)
    VALUES(?1,?2,?3,?4,?5,'WEB',?6,?7,?8,?9,?10,?11,?12,?12)`
  ).bind(
    notificationId, memberId, wishId, event.event_key, event.event_type,
    copy.title, copy.body, status, attempts, nextAt, deliveredAt, now
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

async function list(request, env, member) {
  const result = await env.PRODUCT_DB.prepare(
    `SELECT notification_id,wish_id,event_type,title,body,status,delivered_at,read_at,created_at
    FROM mywatch_notifications
    WHERE member_id=?1 AND status='DELIVERED' AND dismissed_at IS NULL
    ORDER BY created_at DESC LIMIT 50`
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

export async function deliverDueWebNotifications(env, now = new Date()) {
  if (!env.PRODUCT_DB) return { delivered: 0 };
  const occurredAt = new Date(now).toISOString();
  const due = await env.PRODUCT_DB.prepare(
    `SELECT notification_id FROM mywatch_notifications
    WHERE channel='WEB' AND status='PENDING' AND next_attempt_at<=?1
    ORDER BY next_attempt_at ASC LIMIT 100`
  ).bind(occurredAt).all();
  let delivered = 0;
  for (const row of due?.results || []) {
    const result = await env.PRODUCT_DB.prepare(
      `UPDATE mywatch_notifications
      SET status='DELIVERED',attempts=attempts+1,delivered_at=?2,updated_at=?2
      WHERE notification_id=?1 AND channel='WEB' AND status='PENDING'`
    ).bind(row.notification_id, occurredAt).run();
    if (!Number(result?.meta?.changes || 0)) continue;
    delivered += 1;
    await env.PRODUCT_DB.prepare(
      `INSERT INTO mywatch_delivery_audit
      (audit_id,notification_id,action,channel,result,error_code,occurred_at)
      VALUES(?1,?2,'DELIVER','WEB','SUCCESS','',?3)`
    ).bind(crypto.randomUUID(), row.notification_id, occurredAt).run();
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
  const match = url.pathname.match(/^\/api\/member\/notifications\/([A-Za-z0-9-]{8,80})$/);
  if (request.method === 'PATCH' && match) return update(request, env, member, match[1]);
  return Response.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
}
