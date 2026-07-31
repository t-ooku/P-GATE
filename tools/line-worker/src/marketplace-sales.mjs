import { readMemberSession } from './member-auth.mjs';

export const SALE_MARKETPLACES = Object.freeze([
  'AMAZON_JP', 'RAKUTEN_JP', 'QOO10_JP', 'SHEIN_JP',
  'ZOZOTOWN', 'SHOPLIST', 'MUSINSA', 'BUYMA'
]);

const MARKETPLACE_LABELS = Object.freeze({
  AMAZON_JP: 'Amazon', RAKUTEN_JP: '楽天市場', QOO10_JP: 'Qoo10',
  SHEIN_JP: 'SHEIN', ZOZOTOWN: 'ZOZOTOWN', SHOPLIST: 'SHOPLIST',
  MUSINSA: 'MUSINSA', BUYMA: 'BUYMA'
});

function safeSale(row) {
  return {
    sale_id: row.sale_id,
    marketplace: row.marketplace,
    marketplace_label: MARKETPLACE_LABELS[row.marketplace] || row.marketplace,
    title: row.title,
    summary: row.summary,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    source_url: row.source_url,
    image_url: row.image_rights_status === 'APPROVED' ? row.image_url : ''
  };
}

export async function listPublicSales(env, now = new Date()) {
  if (!env.PRODUCT_DB) return [];
  const at = now.toISOString();
  const result = await env.PRODUCT_DB.prepare(
    `SELECT sale_id,marketplace,title,summary,starts_at,ends_at,source_url,image_url,image_rights_status
     FROM marketplace_sale_events
     WHERE status='APPROVED' AND ends_at>=?1
     ORDER BY starts_at ASC LIMIT 40`
  ).bind(at).all();
  return (result?.results || []).map(safeSale);
}

async function publicList(env) {
  return Response.json({ ok: true, sales: await listPublicSales(env) }, {
    headers: { 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' }
  });
}

async function ensurePreference(env, memberId) {
  const now = new Date().toISOString();
  await env.PRODUCT_DB.prepare(
    `INSERT OR IGNORE INTO member_sale_preferences
     (member_id,enabled,advance_notice,marketplaces,created_at,updated_at)
     VALUES(?1,1,1,'ALL',?2,?2)`
  ).bind(memberId, now).run();
  return env.PRODUCT_DB.prepare(
    'SELECT enabled,advance_notice,marketplaces,updated_at FROM member_sale_preferences WHERE member_id=?1'
  ).bind(memberId).first();
}

async function memberPreference(request, env, member) {
  if (request.method === 'GET') {
    const preference = await ensurePreference(env, member.id);
    return Response.json({ ok: true, preference }, { headers: { 'cache-control': 'no-store' } });
  }
  const input = await request.json();
  const enabled = input.enabled === false ? 0 : 1;
  const advance = input.advance_notice === false ? 0 : 1;
  const requested = Array.isArray(input.marketplaces)
    ? input.marketplaces.filter((value) => SALE_MARKETPLACES.includes(value)) : [];
  const marketplaces = requested.length === SALE_MARKETPLACES.length || !requested.length
    ? 'ALL' : requested.join(',');
  const now = new Date().toISOString();
  await env.PRODUCT_DB.prepare(
    `INSERT INTO member_sale_preferences
     (member_id,enabled,advance_notice,marketplaces,created_at,updated_at)
     VALUES(?1,?2,?3,?4,?5,?5)
     ON CONFLICT(member_id) DO UPDATE SET
       enabled=excluded.enabled,advance_notice=excluded.advance_notice,
       marketplaces=excluded.marketplaces,updated_at=excluded.updated_at`
  ).bind(member.id, enabled, advance, marketplaces, now).run();
  return Response.json({ ok: true, preference: { enabled, advance_notice: advance, marketplaces } });
}

function internalAuthorized(request, env) {
  const expected = String(env.MYWATCH_CRON_SECRET || '');
  return expected.length >= 32
    && request.headers.get('x-hoshilu-internal-secret') === expected;
}

async function upsertSale(request, env) {
  if (!internalAuthorized(request, env)) {
    return Response.json({ ok: false, error: 'SALE_ADMIN_UNAUTHORIZED' }, { status: 401 });
  }
  const input = await request.json();
  const marketplace = String(input.marketplace || '').toUpperCase();
  if (!SALE_MARKETPLACES.includes(marketplace)) {
    return Response.json({ ok: false, error: 'SALE_MARKETPLACE_INVALID' }, { status: 400 });
  }
  const source = new URL(String(input.source_url || ''));
  if (source.protocol !== 'https:') {
    return Response.json({ ok: false, error: 'SALE_SOURCE_INVALID' }, { status: 400 });
  }
  const startsAt = new Date(input.starts_at);
  const endsAt = new Date(input.ends_at);
  if (!Number.isFinite(startsAt.valueOf()) || !Number.isFinite(endsAt.valueOf()) || endsAt <= startsAt) {
    return Response.json({ ok: false, error: 'SALE_PERIOD_INVALID' }, { status: 400 });
  }
  const now = new Date().toISOString();
  const saleId = String(input.sale_id || crypto.randomUUID()).slice(0, 80);
  const approved = input.status === 'APPROVED' ? 'APPROVED' : 'DRAFT';
  const rights = input.image_rights_status === 'APPROVED' ? 'APPROVED' : 'NONE';
  await env.PRODUCT_DB.prepare(
    `INSERT INTO marketplace_sale_events
     (sale_id,marketplace,title,summary,starts_at,ends_at,announced_at,source_url,image_url,image_rights_status,status,created_at,updated_at)
     VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12)
     ON CONFLICT(sale_id) DO UPDATE SET marketplace=excluded.marketplace,title=excluded.title,
       summary=excluded.summary,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
       announced_at=excluded.announced_at,source_url=excluded.source_url,
       image_url=excluded.image_url,image_rights_status=excluded.image_rights_status,
       status=excluded.status,updated_at=excluded.updated_at`
  ).bind(
    saleId, marketplace, String(input.title || '').trim().slice(0, 140),
    String(input.summary || '').trim().slice(0, 500), startsAt.toISOString(),
    endsAt.toISOString(), new Date(input.announced_at || now).toISOString(),
    source.toString(), rights === 'APPROVED' ? String(input.image_url || '') : '',
    rights, approved, now
  ).run();
  return Response.json({ ok: true, sale_id: saleId, status: approved });
}

export async function enqueueSaleNotifications(env, now = new Date()) {
  if (!env.PRODUCT_DB) return { queued: 0 };
  const at = now.toISOString();
  const horizon = new Date(now.getTime() + 7 * 86400000).toISOString();
  const [sales, members] = await Promise.all([
    env.PRODUCT_DB.prepare(
      `SELECT sale_id,marketplace,title,summary,starts_at FROM marketplace_sale_events
       WHERE status='APPROVED' AND starts_at<=?1 AND ends_at>=?2`
    ).bind(horizon, at).all(),
    env.PRODUCT_DB.prepare(
      `SELECT member_id,advance_notice,marketplaces FROM member_sale_preferences WHERE enabled=1`
    ).all()
  ]);
  let queued = 0;
  for (const sale of sales?.results || []) {
    const advance = Date.parse(sale.starts_at) > now.getTime();
    for (const member of members?.results || []) {
      if (advance && !member.advance_notice) continue;
      if (member.marketplaces !== 'ALL' && !String(member.marketplaces).split(',').includes(sale.marketplace)) continue;
      const noticeType = advance ? 'SALE_ADVANCE' : 'SALE_STARTED';
      const notificationId = crypto.randomUUID();
      const eventKey = `${sale.sale_id}:${noticeType}`;
      const title = advance
        ? `${MARKETPLACE_LABELS[sale.marketplace]}のセールを事前にお知らせ`
        : `${MARKETPLACE_LABELS[sale.marketplace]}のセールが始まりました`;
      const result = await env.PRODUCT_DB.prepare(
        `INSERT OR IGNORE INTO mywatch_notifications
         (notification_id,member_id,wish_id,event_key,event_type,channel,title,body,status,attempts,next_attempt_at,delivered_at,created_at,updated_at)
         VALUES(?1,?2,'MARKETPLACE_SALES',?3,?4,'WEB',?5,?6,'DELIVERED',1,?7,?7,?7,?7)`
      ).bind(notificationId, member.member_id, eventKey, noticeType, title, sale.summary || sale.title, at).run();
      if (!Number(result?.meta?.changes || 0)) continue;
      await env.PRODUCT_DB.prepare(
        `INSERT OR IGNORE INTO member_sale_notifications
         (member_id,sale_id,notice_type,notification_id,created_at) VALUES(?1,?2,?3,?4,?5)`
      ).bind(member.member_id, sale.sale_id, noticeType, notificationId, at).run();
      queued += 1;
    }
  }
  return { queued };
}

export async function handleMarketplaceSaleRoutes(request, env) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/api/sales') return publicList(env);
  if (request.method === 'POST' && url.pathname === '/api/internal/sales') return upsertSale(request, env);
  if (url.pathname !== '/api/member/sale-preferences') return null;
  const member = await readMemberSession(request, env);
  if (!member) return Response.json({ ok: false, error: 'MEMBER_REQUIRED' }, { status: 401 });
  if (request.method === 'GET' || request.method === 'PATCH') return memberPreference(request, env, member);
  return Response.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
}

