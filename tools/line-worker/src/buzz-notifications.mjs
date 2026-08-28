import { readMemberSession } from './member-auth.mjs';
import { buzzThemeStateFor } from './buzz-shelf.mjs';

const CHANNELS = Object.freeze(['APP', 'LINE', 'EMAIL']);
const BUZZ_WISH_ID = 'HOSHILU_BUZZ';

async function availableChannels(env, memberId) {
  const result = await env.PRODUCT_DB.prepare(
    `SELECT channel FROM member_notification_destinations
     WHERE member_id=?1 AND channel IN ('LINE','EMAIL')`
  ).bind(memberId).all();
  return ['APP', ...(result?.results || []).map((row) => row.channel)
    .filter((channel) => channel === 'LINE' || channel === 'EMAIL')];
}

async function ensurePreference(env, memberId) {
  const now = new Date().toISOString();
  await env.PRODUCT_DB.prepare(
    `INSERT OR IGNORE INTO member_buzz_preferences
     (member_id,enabled,delivery_channels,language,created_at,updated_at)
     VALUES(?1,0,'APP','JA',?2,?2)`
  ).bind(memberId, now).run();
  return env.PRODUCT_DB.prepare(
    `SELECT enabled,delivery_channels,language,updated_at
     FROM member_buzz_preferences WHERE member_id=?1`
  ).bind(memberId).first();
}

async function memberPreference(request, env, member) {
  const available = await availableChannels(env, member.id);
  if (request.method === 'GET') {
    return Response.json({ ok: true, preference: await ensurePreference(env, member.id), available_delivery_channels: available }, {
      headers: { 'cache-control': 'no-store' }
    });
  }
  const input = await request.json();
  const enabled = input.enabled === true ? 1 : 0;
  const requested = Array.isArray(input.delivery_channels)
    ? input.delivery_channels.filter((channel) => CHANNELS.includes(channel) && available.includes(channel))
    : available;
  const channels = [...new Set(requested)].join(',') || 'APP';
  const language = ['JA', 'EN', 'ZH', 'KO'].includes(String(input.language || '').toUpperCase())
    ? String(input.language).toUpperCase() : 'JA';
  const now = new Date().toISOString();
  await env.PRODUCT_DB.prepare(
    `INSERT INTO member_buzz_preferences
     (member_id,enabled,delivery_channels,language,created_at,updated_at)
     VALUES(?1,?2,?3,?4,?5,?5)
     ON CONFLICT(member_id) DO UPDATE SET enabled=excluded.enabled,
       delivery_channels=excluded.delivery_channels,language=excluded.language,updated_at=excluded.updated_at`
  ).bind(member.id, enabled, channels, language, now).run();
  return Response.json({ ok: true, preference: {
    enabled, delivery_channels: channels, language, updated_at: now
  }, available_delivery_channels: available }, { headers: { 'cache-control': 'no-store' } });
}

export async function handleBuzzNotificationRoutes(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/member/buzz-preferences') return null;
  const member = await readMemberSession(request, env);
  if (!member) return Response.json({ ok: false, error: 'MEMBER_REQUIRED' }, { status: 401 });
  if (request.method === 'GET' || request.method === 'PATCH') return memberPreference(request, env, member);
  return Response.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
}

function copyFor(theme, language) {
  if (language === 'EN') return {
    title: 'HOSHILU BUZZ has a new theme',
    body: `Now featuring “${theme.label}”. Themes refresh every Tuesday and Friday.\n\nOpen HOSHILU BUZZ\nhttps://hoshilu.app/buzz`
  };
  if (language === 'ZH') return {
    title: 'HOSHILU BUZZ 主题已更新',
    body: `本期主题是“${theme.label}”。每周二、周五更新。\n\n打开 HOSHILU BUZZ\nhttps://hoshilu.app/buzz`
  };
  if (language === 'KO') return {
    title: 'HOSHILU BUZZ 테마가 바뀌었어요',
    body: `이번 테마는 '${theme.label}'입니다. 매주 화요일과 금요일에 업데이트됩니다.\n\nHOSHILU BUZZ 열기\nhttps://hoshilu.app/buzz`
  };
  return {
    title: 'HOSHILU BUZZのテーマが変わりました',
    body: `今のテーマは「${theme.label}」。火曜・金曜に更新します。\n\nHOSHILU BUZZを開く\nhttps://hoshilu.app/buzz`
  };
}

export async function queueBuzzThemeNotifications(env, now = new Date()) {
  if (!env.PRODUCT_DB) return { queued: 0, skipped: 'NO_DB' };
  try {
    const preferences = await env.PRODUCT_DB.prepare(
      `SELECT member_id,delivery_channels,language
       FROM member_buzz_preferences WHERE enabled=1 LIMIT 1000`
    ).all();
    const themeState = buzzThemeStateFor(now);
    const eventKey = `BUZZ_THEME:${themeState.updated_key}:${themeState.theme.id}`;
    const createdAt = new Date(now).toISOString();
    let queued = 0;
    for (const preference of preferences?.results || []) {
      const available = new Set(await availableChannels(env, preference.member_id));
      const channels = String(preference.delivery_channels || 'APP').split(',')
        .filter((channel) => CHANNELS.includes(channel) && available.has(channel));
      const copy = copyFor(themeState.theme, String(preference.language || 'JA').toUpperCase());
      for (const channel of channels) {
        const notificationId = crypto.randomUUID();
        const app = channel === 'APP';
        const result = await env.PRODUCT_DB.prepare(
          `INSERT OR IGNORE INTO mywatch_notifications
           (notification_id,member_id,wish_id,event_key,event_type,channel,title,body,status,
            attempts,next_attempt_at,delivered_at,created_at,updated_at)
           VALUES(?1,?2,?3,?4,'BUZZ_THEME_CHANGED',?5,?6,?7,?8,?9,?10,?11,?10,?10)`
        ).bind(notificationId, preference.member_id, BUZZ_WISH_ID, eventKey, channel,
          copy.title, copy.body, app ? 'DELIVERED' : 'PENDING', app ? 1 : 0,
          createdAt, app ? createdAt : null).run();
        const inserted = Number(result?.meta?.changes || 0) > 0;
        if (!inserted) continue;
        queued += 1;
        if (app) {
          await env.PRODUCT_DB.prepare(
            `INSERT INTO mywatch_delivery_audit
             (audit_id,notification_id,action,channel,result,error_code,occurred_at)
             VALUES(?1,?2,'DELIVER','APP','SUCCESS','',?3)`
          ).bind(crypto.randomUUID(), notificationId, createdAt).run();
        }
      }
    }
    return { queued, theme_id: themeState.theme.id, updated_key: themeState.updated_key };
  } catch {
    // Migration rollout and transient D1 failures must not stop the shared cron.
    return { queued: 0, skipped: 'TABLE_UNAVAILABLE' };
  }
}
