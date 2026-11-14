import { readMemberSession } from './member-auth.mjs';
const LANGUAGES = new Set(['JA', 'EN', 'ZH', 'KO']);
const WATCH_FREQUENCIES = new Set(['INSTANT', 'DAILY', 'WEEKLY', 'MUTED']);
const clean = (value) => String(value || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
const flag = (value, fallback = false) => value === undefined ? Number(fallback) : Number(value === true);
const frequency = (value, fallback = 'INSTANT') => {
  const normalized = String(value || fallback).trim().toUpperCase();
  return WATCH_FREQUENCIES.has(normalized) ? normalized : fallback;
};
const prefs = (payload = {}) => ({
  watch_sale: flag(payload.watch_sale, true), watch_price: flag(payload.watch_price, true),
  watch_coupon: flag(payload.watch_coupon), watch_restock: flag(payload.watch_restock),
  watch_frequency: frequency(payload.watch_frequency)
});
async function makeId(memberId, query) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${memberId}:${query.toLowerCase()}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
const validId = (value) => /^[a-f0-9]{32}$/.test(value);

export async function handleMemberWishRoutes(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/member/wishes')) return null;
  if (!env.PRODUCT_DB) return Response.json({ ok: false, error: 'MEMBER_STORE_NOT_CONFIGURED' }, { status: 503 });
  const member = await readMemberSession(request, env);
  if (!member) return Response.json({ ok: false, error: 'MEMBER_LOGIN_REQUIRED' }, { status: 401 });
  if (request.method === 'GET' && url.pathname === '/api/member/wishes') {
    const result = await env.PRODUCT_DB.prepare('SELECT wish_id,query_text,language,watch_sale,watch_price,watch_coupon,watch_restock,watch_frequency,created_at,updated_at FROM member_wishes WHERE member_id=?1 ORDER BY updated_at DESC LIMIT 100').bind(member.id).all();
    return Response.json({ ok: true, wishes: result.results || [] }, { headers: { 'cache-control': 'no-store' } });
  }
  if (request.method === 'POST' && url.pathname === '/api/member/wishes') {
    const payload = await request.json(), query = clean(payload.query), language = LANGUAGES.has(payload.language) ? payload.language : 'JA';
    if (query.length < 2) return Response.json({ ok: false, error: 'WISH_QUERY_INVALID' }, { status: 400 });
    const wishId = await makeId(member.id, query), now = new Date().toISOString(), watch = prefs(payload);
    await env.PRODUCT_DB.prepare('INSERT INTO member_wishes(member_id,wish_id,query_text,language,watch_sale,watch_price,watch_coupon,watch_restock,watch_frequency,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10) ON CONFLICT(member_id,wish_id) DO UPDATE SET query_text=excluded.query_text,language=excluded.language,watch_sale=excluded.watch_sale,watch_price=excluded.watch_price,watch_coupon=excluded.watch_coupon,watch_restock=excluded.watch_restock,watch_frequency=excluded.watch_frequency,updated_at=excluded.updated_at').bind(member.id, wishId, query, language, watch.watch_sale, watch.watch_price, watch.watch_coupon, watch.watch_restock, watch.watch_frequency, now).run();
    return Response.json({ ok: true, wish: { wish_id: wishId, query_text: query, language, ...watch, created_at: now, updated_at: now } });
  }
  const wishId = url.pathname.split('/').pop();
  if (!validId(wishId)) return Response.json({ ok: false, error: 'WISH_ID_INVALID' }, { status: 400 });
  if (request.method === 'PATCH') {
    const watch = prefs(await request.json()), now = new Date().toISOString();
    await env.PRODUCT_DB.prepare('UPDATE member_wishes SET watch_sale=?3,watch_price=?4,watch_coupon=?5,watch_restock=?6,watch_frequency=?7,updated_at=?8 WHERE member_id=?1 AND wish_id=?2').bind(member.id, wishId, watch.watch_sale, watch.watch_price, watch.watch_coupon, watch.watch_restock, watch.watch_frequency, now).run();
    return Response.json({ ok: true, wish: { wish_id: wishId, ...watch, updated_at: now } });
  }
  if (request.method === 'DELETE') {
    const existing = await env.PRODUCT_DB.prepare('SELECT language,watch_sale,watch_price,watch_coupon,watch_restock FROM member_wishes WHERE member_id=?1 AND wish_id=?2').bind(member.id, wishId).first();
    if (existing) await env.PRODUCT_DB.batch([
      env.PRODUCT_DB.prepare('INSERT INTO member_wish_events(event_id,event_type,language,watch_sale,watch_price,watch_coupon,watch_restock,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)').bind(crypto.randomUUID(), 'DELETED_BY_MEMBER', existing.language, existing.watch_sale, existing.watch_price, existing.watch_coupon, existing.watch_restock, new Date().toISOString()),
      env.PRODUCT_DB.prepare('DELETE FROM mywatch_notifications WHERE member_id=?1 AND wish_id=?2').bind(member.id, wishId),
      env.PRODUCT_DB.prepare('DELETE FROM member_wishes WHERE member_id=?1 AND wish_id=?2').bind(member.id, wishId)
    ]);
    return Response.json({ ok: true });
  }
  return Response.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
}
