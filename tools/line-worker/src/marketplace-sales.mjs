import { readMemberSession } from './member-auth.mjs';
import { syncOfficialMarketplaceUpdates } from './official-marketplace-updates.mjs';

export const SALE_MARKETPLACES = Object.freeze([
  'AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP', 'QOO10_JP', 'SHEIN_JP',
  'ZOZOTOWN', 'LOFT_JP', 'HANDS_JP', 'MATSUKIYO_JP', 'COSME_JP',
  'ABCMART_JP', 'BUYMA', 'SNKRDUNK'
]);

// 2026-09-25 大隆さん指示「メガ割・プライムデーなどをホシル登録して見逃さない」。
// MAJOR_SALE は年に数回の大型セール（プライム感謝祭・メガ割など）。公式発表を人が確かめて
// 手動で登録する（公式ページの自動取得では作らない）。日々の「タイムセール」とは分けて、
//「大型セールだけ知らせて」を選べるようにする。SALE を受け取る人には MAJOR_SALE も届く。
export const MARKETPLACE_INFO_TYPES = Object.freeze([
  'SALE', 'MAJOR_SALE', 'COUPON', 'NEW_ARRIVAL', 'LIMITED', 'RESTOCK', 'EDITORIAL'
]);

export function wantsSaleInfo(infoTypes, infoType) {
  const wanted = String(infoTypes || 'SALE').split(',');
  return wanted.includes(infoType) || (infoType === 'MAJOR_SALE' && wanted.includes('SALE'));
}

const jstMonthDay = (value) => {
  const date = new Date(Date.parse(value) + 9 * 3600000);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
};

export function saleNotificationTitle(sale, advance, marketplaceLabel) {
  const infoType = sale.info_type || 'SALE';
  if (infoType === 'MAJOR_SALE') {
    const name = String(sale.title || '').trim().slice(0, 60) || `${marketplaceLabel}の大型セール`;
    return advance ? `【もうすぐ】${name}は${jstMonthDay(sale.starts_at)}から` : `${name}が始まりました`;
  }
  const titles = {
    COUPON:'クーポン情報', NEW_ARRIVAL:'新着商品', LIMITED:'限定品・コラボ',
    RESTOCK:'再入荷情報', EDITORIAL:'モール最新情報'
  };
  if (infoType === 'SALE') {
    return advance ? `${marketplaceLabel}のセールを事前にお知らせ` : `${marketplaceLabel}のセールが始まりました`;
  }
  return `${marketplaceLabel}の${titles[infoType]}`;
}

export const NOTIFICATION_DELIVERY_CHANNELS = Object.freeze(['APP', 'LINE', 'EMAIL']);

const OFFICIAL_SOURCE_DOMAINS = Object.freeze({
  AMAZON_JP: ['amazon.co.jp'], RAKUTEN_JP: ['rakuten.co.jp'], YAHOO_JP: ['shopping.yahoo.co.jp'],
  QOO10_JP: ['qoo10.jp'], SHEIN_JP: ['shein.com'], ZOZOTOWN: ['zozo.jp'],
  LOFT_JP: ['loft.co.jp'], HANDS_JP: ['hands.net'],
  MATSUKIYO_JP: ['matsukiyococokara-online.com'], COSME_JP: ['cosme.com'],
  ABCMART_JP: ['abc-mart.net'], BUYMA: ['buyma.com'], SNKRDUNK: ['snkrdunk.com']
});

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch { return null; }
}

export function isOfficialMarketplaceSource(marketplace, value) {
  const url = safeHttpsUrl(value);
  if (!url) return false;
  return (OFFICIAL_SOURCE_DOMAINS[marketplace] || [])
    .some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
}

export function buildSaleNotificationBody(sale) {
  const message = String(sale?.summary || sale?.title || '').trim();
  const source = isOfficialMarketplaceSource(sale?.marketplace, sale?.source_url)
    ? String(sale.source_url).trim() : '';
  return source ? `${message}\n\n公式ページを開く\n${source}` : message;
}

function jstParts(date) {
  const shifted = new Date(date.getTime() + 9 * 3600000);
  return {
    year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes(), weekday: shifted.getUTCDay()
  };
}

function jstTime(parts, hour, minute, addDays = 0) {
  return new Date(Date.UTC(parts.year, parts.month, parts.day + addDays, hour - 9, minute));
}

export function nextMarketplaceNotificationAt(preference, now = new Date()) {
  const parts = jstParts(now);
  const [startHour,startMinute] = String(preference.quiet_start || '21:00').split(':').map(Number);
  const [endHour,endMinute] = String(preference.quiet_end || '08:00').split(':').map(Number);
  const current = parts.hour * 60 + parts.minute;
  const quietStart = startHour * 60 + startMinute;
  const quietEnd = endHour * 60 + endMinute;
  const quiet = quietStart > quietEnd
    ? current >= quietStart || current < quietEnd
    : current >= quietStart && current < quietEnd;
  if (quiet) {
    const addDays = current >= quietStart && quietStart > quietEnd ? 1 : 0;
    return jstTime(parts, endHour, endMinute, addDays).toISOString();
  }
  if (preference.frequency === 'DAILY') return jstTime(parts, 9, 0, 1).toISOString();
  if (preference.frequency === 'WEEKLY') {
    const daysUntilMonday = ((8 - parts.weekday) % 7) || 7;
    return jstTime(parts, 9, 0, daysUntilMonday).toISOString();
  }
  return now.toISOString();
}

const MARKETPLACE_LABELS = Object.freeze({
  AMAZON_JP: 'Amazon', RAKUTEN_JP: '楽天市場', YAHOO_JP: 'Yahoo!ショッピング',
  QOO10_JP: 'Qoo10', SHEIN_JP: 'SHEIN', ZOZOTOWN: 'ZOZOTOWN',
  LOFT_JP: 'ロフト', HANDS_JP: 'ハンズ', MATSUKIYO_JP: 'マツキヨココカラ',
  COSME_JP: '@cosme', ABCMART_JP: 'ABC-MART', BUYMA: 'BUYMA', SNKRDUNK: 'SNKRDUNK'
});

function safeSale(row) {
  return {
    sale_id: row.sale_id,
    marketplace: row.marketplace,
    marketplace_label: MARKETPLACE_LABELS[row.marketplace] || row.marketplace,
    info_type: row.info_type || 'SALE',
    title: row.title,
    summary: row.summary,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    updated_at: row.updated_at,
    source_url: row.source_url,
    image_url: row.image_rights_status === 'APPROVED' ? row.image_url : '',
    video_url: row.video_rights_status === 'APPROVED' ? row.video_url : ''
  };
}

export async function listPublicSales(env, now = new Date()) {
  if (!env.PRODUCT_DB) return [];
  const at = now.toISOString();
  const result = await env.PRODUCT_DB.prepare(
    `SELECT sale_id,marketplace,info_type,title,summary,starts_at,ends_at,updated_at,source_url,image_url,image_rights_status,video_url,video_rights_status
     FROM marketplace_sale_events
     WHERE status='APPROVED' AND ends_at>=?1
     ORDER BY CASE WHEN info_type='MAJOR_SALE' THEN 0 WHEN starts_at>?1 THEN 1 ELSE 2 END, starts_at ASC LIMIT 40`
  ).bind(at).all();
  // 2026-09-25: 大型セールとこれから始まるセールを先に取る。公式ページの自動取得の行
  //（最大52行・starts_at=取得時刻）に押し出されて、先の日程の大型セールが消えないように。
  // 旧対象（SHOPLIST/MUSINSA）の承認済み行がDBに残っていても、現在の13モール
  // 以外は公開しない。表示と通知設定の対象が再びずれないよう同じ定数を使う。
  return (result?.results || []).filter((row) => SALE_MARKETPLACES.includes(row.marketplace)).map(safeSale);
}

async function publicList(env) {
  return Response.json({ ok: true, sales: await listPublicSales(env) }, {
    headers: { 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' }
  });
}

async function ensurePreference(env, memberId, availableChannels = ['APP']) {
  const now = new Date().toISOString();
  const initialChannels = [...new Set(availableChannels
    .filter((value) => NOTIFICATION_DELIVERY_CHANNELS.includes(value)))].join(',') || 'APP';
  const inserted = await env.PRODUCT_DB.prepare(
    `INSERT OR IGNORE INTO member_sale_preferences
     (member_id,enabled,advance_notice,marketplaces,info_types,frequency,quiet_start,quiet_end,language,delivery_channels,created_at,updated_at)
     VALUES(?1,1,1,'ALL','SALE','INSTANT','21:00','08:00','JA',?2,?3,?3)`
  ).bind(memberId, initialChannels, now).run();
  const created = Number(inserted?.meta?.changes || 0) === 1;
  const preference = await env.PRODUCT_DB.prepare(
    `SELECT enabled,advance_notice,marketplaces,info_types,frequency,
     quiet_start,quiet_end,language,delivery_channels,updated_at
     FROM member_sale_preferences WHERE member_id=?1`
  ).bind(memberId).first();
  return { preference, created };
}

async function availableDeliveryChannels(env, memberId) {
  const result = await env.PRODUCT_DB.prepare(
    `SELECT channel FROM member_notification_destinations
     WHERE member_id=?1 AND channel IN ('LINE','EMAIL')`
  ).bind(memberId).all();
  return ['APP', ...(result?.results || []).map((row) => row.channel)
    .filter((value) => value === 'LINE' || value === 'EMAIL')];
}

async function memberPreference(request, env, member) {
  const availableChannels = await availableDeliveryChannels(env, member.id);
  if (request.method === 'GET') {
    const { preference, created } = await ensurePreference(env, member.id, availableChannels);
    // 2026-09-25: いま初めて作った設定かどうか。「大型セールを知らせて」から来た新しい会員は、
    // 毎日のタイムセールではなく大型セールだけにする（画面がこれを見て決める）。
    return Response.json({ ok: true, preference, preference_created: created, available_delivery_channels: availableChannels }, { headers: { 'cache-control': 'no-store' } });
  }
  const input = await request.json();
  const enabled = input.enabled === false ? 0 : 1;
  const advance = input.advance_notice === false ? 0 : 1;
  const requested = Array.isArray(input.marketplaces)
    ? input.marketplaces.filter((value) => SALE_MARKETPLACES.includes(value)) : [];
  const marketplaces = requested.length === SALE_MARKETPLACES.length || !requested.length
    ? 'ALL' : requested.join(',');
  const requestedTypes = Array.isArray(input.info_types)
    ? input.info_types.filter((value) => MARKETPLACE_INFO_TYPES.includes(value)) : ['SALE'];
  const infoTypes = requestedTypes.length ? [...new Set(requestedTypes)].join(',') : 'SALE';
  const frequency = ['INSTANT','DAILY','WEEKLY'].includes(input.frequency) ? input.frequency : 'INSTANT';
  const time = (value, fallback) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')) ? value : fallback;
  const quietStart = time(input.quiet_start, '21:00');
  const quietEnd = time(input.quiet_end, '08:00');
  const language = ['JA','EN','ZH','KO'].includes(input.language) ? input.language : 'JA';
  const requestedChannels = Array.isArray(input.delivery_channels)
    ? input.delivery_channels.filter((value) => NOTIFICATION_DELIVERY_CHANNELS.includes(value) && availableChannels.includes(value)) : ['APP'];
  const deliveryChannels = [...new Set(requestedChannels)].join(',') || 'APP';
  const now = new Date().toISOString();
  await env.PRODUCT_DB.prepare(
    `INSERT INTO member_sale_preferences
     (member_id,enabled,advance_notice,marketplaces,info_types,frequency,quiet_start,quiet_end,language,delivery_channels,created_at,updated_at)
     VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?11)
     ON CONFLICT(member_id) DO UPDATE SET
       enabled=excluded.enabled,advance_notice=excluded.advance_notice,
       marketplaces=excluded.marketplaces,info_types=excluded.info_types,
       frequency=excluded.frequency,quiet_start=excluded.quiet_start,
       quiet_end=excluded.quiet_end,language=excluded.language,
       delivery_channels=excluded.delivery_channels,updated_at=excluded.updated_at`
  ).bind(member.id, enabled, advance, marketplaces, infoTypes, frequency, quietStart, quietEnd, language, deliveryChannels, now).run();
  return Response.json({ ok: true, preference: {
    enabled, advance_notice: advance, marketplaces, info_types: infoTypes,
    frequency, quiet_start: quietStart, quiet_end: quietEnd, language, delivery_channels: deliveryChannels
  }, available_delivery_channels: availableChannels });
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
  const infoType = String(input.info_type || 'SALE').toUpperCase();
  if (!MARKETPLACE_INFO_TYPES.includes(infoType)) {
    return Response.json({ ok: false, error: 'MARKETPLACE_INFO_TYPE_INVALID' }, { status: 400 });
  }
  const source = safeHttpsUrl(input.source_url);
  if (!source || !isOfficialMarketplaceSource(marketplace, source.toString())) {
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
  const videoRights = input.video_rights_status === 'APPROVED' ? 'APPROVED' : 'NONE';
  const imageUrl = rights === 'APPROVED' ? safeHttpsUrl(input.image_url) : null;
  const videoUrl = videoRights === 'APPROVED' ? safeHttpsUrl(input.video_url) : null;
  if ((rights === 'APPROVED' && !imageUrl) || (videoRights === 'APPROVED' && !videoUrl)) {
    return Response.json({ ok: false, error: 'SALE_MEDIA_URL_INVALID' }, { status: 400 });
  }
  await env.PRODUCT_DB.prepare(
    `INSERT INTO marketplace_sale_events
     (sale_id,marketplace,info_type,title,summary,starts_at,ends_at,announced_at,source_url,image_url,image_rights_status,video_url,video_rights_status,status,created_at,updated_at)
     VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?15)
     ON CONFLICT(sale_id) DO UPDATE SET marketplace=excluded.marketplace,info_type=excluded.info_type,title=excluded.title,
       summary=excluded.summary,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
       announced_at=excluded.announced_at,source_url=excluded.source_url,
       image_url=excluded.image_url,image_rights_status=excluded.image_rights_status,
       video_url=excluded.video_url,video_rights_status=excluded.video_rights_status,
       status=excluded.status,updated_at=excluded.updated_at`
  ).bind(
    saleId, marketplace, infoType, String(input.title || '').trim().slice(0, 140),
    String(input.summary || '').trim().slice(0, 500), startsAt.toISOString(),
    endsAt.toISOString(), new Date(input.announced_at || now).toISOString(),
    source.toString(), imageUrl?.toString() || '',
    rights, videoUrl?.toString() || '',
    videoRights, approved, now
  ).run();
  return Response.json({ ok: true, sale_id: saleId, status: approved });
}

// 2026-09-25: 広告で会員が増えても、1回の cron の D1 クエリ数が膨らまないようにする。
// 以前は「全セール×全会員×全チャネル」に毎回 INSERT OR IGNORE を投げていたので、
// 会員100人・セール20件で1回数千クエリになり、無料枠の上限を超えてしまう形だった。
// いまは (1) 送り済みの組を1回の SELECT でまとめて除き、(2) 新しく送る組だけを
// 1回に SALE_NOTIFICATION_MAX_NEW_PER_RUN 組まで、batch でまとめて書く。残りは次の回（15分後）。
export const SALE_NOTIFICATION_MAX_NEW_PER_RUN = 25;

export async function enqueueSaleNotifications(env, now = new Date()) {
  if (!env.PRODUCT_DB) return { queued: 0 };
  const at = now.toISOString();
  const horizon = new Date(now.getTime() + 7 * 86400000).toISOString();
  const [sales, members, sent] = await Promise.all([
    env.PRODUCT_DB.prepare(
      `SELECT sale_id,marketplace,info_type,title,summary,starts_at,source_url FROM marketplace_sale_events
       WHERE status='APPROVED' AND starts_at<=?1 AND ends_at>=?2
       ORDER BY CASE WHEN info_type='MAJOR_SALE' THEN 0 ELSE 1 END, starts_at ASC`
    ).bind(horizon, at).all(),
    env.PRODUCT_DB.prepare(
      `SELECT member_id,advance_notice,marketplaces,info_types,frequency,quiet_start,quiet_end,delivery_channels
       FROM member_sale_preferences WHERE enabled=1`
    ).all(),
    // 送り済みの組は「いま通知の対象になっているセール × 通知を受け取る会員」の分だけ読む。
    env.PRODUCT_DB.prepare(
      `SELECT n.member_id,n.sale_id,n.notice_type FROM member_sale_notifications n
       JOIN marketplace_sale_events s ON s.sale_id=n.sale_id
       JOIN member_sale_preferences p ON p.member_id=n.member_id AND p.enabled=1
       WHERE s.status='APPROVED' AND s.starts_at<=?1 AND s.ends_at>=?2`
    ).bind(horizon, at).all()
  ]);
  const done = new Set((sent?.results || []).map((row) => `${row.member_id}|${row.sale_id}|${row.notice_type}`));
  const statements = [];
  let queued = 0;
  outer:
  for (const sale of sales?.results || []) {
    if (!SALE_MARKETPLACES.includes(sale.marketplace)) continue;
    const advance = Date.parse(sale.starts_at) > now.getTime();
    for (const member of members?.results || []) {
      const infoType = sale.info_type || 'SALE';
      if (!wantsSaleInfo(member.info_types, infoType)) continue;
      const saleLike = infoType === 'SALE' || infoType === 'MAJOR_SALE';
      if (saleLike && advance && !member.advance_notice) continue;
      if (member.marketplaces !== 'ALL' && !String(member.marketplaces).split(',').includes(sale.marketplace)) continue;
      const noticeType = saleLike ? (advance ? 'SALE_ADVANCE' : 'SALE_STARTED') : infoType;
      if (done.has(`${member.member_id}|${sale.sale_id}|${noticeType}`)) continue;
      if (queued >= SALE_NOTIFICATION_MAX_NEW_PER_RUN) break outer;
      const notificationId = crypto.randomUUID();
      const eventKey = `${sale.sale_id}:${noticeType}`;
      const title = saleNotificationTitle(sale, advance, MARKETPLACE_LABELS[sale.marketplace]);
      const nextAt = nextMarketplaceNotificationAt(member, now);
      const delivered = Date.parse(nextAt) <= now.getTime();
      const channels = String(member.delivery_channels || 'APP').split(',').filter((value) => NOTIFICATION_DELIVERY_CHANNELS.includes(value));
      for (const channel of new Set(channels)) {
        const channelNotificationId = channel === 'APP' ? notificationId : crypto.randomUUID();
        const channelDelivered = channel === 'APP' && delivered;
        statements.push(env.PRODUCT_DB.prepare(
          `INSERT OR IGNORE INTO mywatch_notifications
           (notification_id,member_id,wish_id,event_key,event_type,channel,title,body,status,attempts,next_attempt_at,delivered_at,created_at,updated_at)
           VALUES(?1,?2,'MARKETPLACE_SALES',?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12)`
        ).bind(
          channelNotificationId, member.member_id, `${eventKey}:${channel}`, noticeType, channel, title,
          buildSaleNotificationBody(sale), channelDelivered ? 'DELIVERED' : 'PENDING',
          channelDelivered ? 1 : 0, nextAt, channelDelivered ? at : null, at
        ));
      }
      statements.push(env.PRODUCT_DB.prepare(
        `INSERT OR IGNORE INTO member_sale_notifications
         (member_id,sale_id,notice_type,notification_id,created_at) VALUES(?1,?2,?3,?4,?5)`
      ).bind(member.member_id, sale.sale_id, noticeType, notificationId, at));
      done.add(`${member.member_id}|${sale.sale_id}|${noticeType}`);
      queued += 1;
    }
  }
  if (statements.length) await env.PRODUCT_DB.batch(statements);
  return { queued };
}

export async function runMarketplaceContentCycle(env, now = new Date()) {
  if (!env.PRODUCT_DB) return { status: 'SKIPPED', queued: 0, approved_active_events: 0, covered_marketplaces: 0 };
  const checkedAt = now.toISOString();
  const runId = crypto.randomUUID();
  try {
    const official = env.OFFICIAL_MARKETPLACE_SYNC_DISABLED === true
      ? { checked:0, updated:0, failed:0, skipped:true }
      : await syncOfficialMarketplaceUpdates(env, now);
    const result = await enqueueSaleNotifications(env, now);
    const coverage = await env.PRODUCT_DB.prepare(
      `SELECT COUNT(*) AS approved_active_events,COUNT(DISTINCT marketplace) AS covered_marketplaces
       FROM marketplace_sale_events
       WHERE status='APPROVED' AND ends_at>=?1`
    ).bind(checkedAt).first();
    const approvedActiveEvents = Number(coverage?.approved_active_events || 0);
    const coveredMarketplaces = Number(coverage?.covered_marketplaces || 0);
    await env.PRODUCT_DB.prepare(
      `INSERT INTO marketplace_content_run_audit
       (run_id,checked_at,status,approved_active_events,covered_marketplaces,queued_notifications,error_code)
       VALUES(?1,?2,'SUCCESS',?3,?4,?5,'')`
    ).bind(runId, checkedAt, approvedActiveEvents, coveredMarketplaces, result.queued).run();
    return { status: 'SUCCESS', queued: result.queued, approved_active_events: approvedActiveEvents, covered_marketplaces: coveredMarketplaces, official };
  } catch (error) {
    const errorCode = String(error?.message || 'MARKETPLACE_CONTENT_CYCLE_FAILED').slice(0, 80);
    try {
      await env.PRODUCT_DB.prepare(
        `INSERT INTO marketplace_content_run_audit
         (run_id,checked_at,status,approved_active_events,covered_marketplaces,queued_notifications,error_code)
         VALUES(?1,?2,'FAILED',0,0,0,?3)`
      ).bind(runId, checkedAt, errorCode).run();
    } catch {}
    throw error;
  }
}

export async function marketplaceContentHealth(request, env, now = new Date()) {
  if (!internalAuthorized(request, env)) {
    return Response.json({ ok: false, error: 'SALE_ADMIN_UNAUTHORIZED' }, { status: 401 });
  }
  if (!env.PRODUCT_DB) {
    return Response.json({ ok: false, error: 'PRODUCT_DB_NOT_CONFIGURED' }, { status: 503 });
  }
  try {
    const [latest, success, failure] = await Promise.all([
      env.PRODUCT_DB.prepare(
        `SELECT checked_at,status,approved_active_events,covered_marketplaces,queued_notifications,error_code
         FROM marketplace_content_run_audit ORDER BY checked_at DESC LIMIT 1`
      ).first(),
      env.PRODUCT_DB.prepare(
        `SELECT checked_at FROM marketplace_content_run_audit WHERE status='SUCCESS' ORDER BY checked_at DESC LIMIT 1`
      ).first(),
      env.PRODUCT_DB.prepare(
        `SELECT checked_at,error_code FROM marketplace_content_run_audit WHERE status='FAILED' ORDER BY checked_at DESC LIMIT 1`
      ).first()
    ]);
    const lastSuccessAt = String(success?.checked_at || '');
    const successTime = Date.parse(lastSuccessAt);
    const minutesSinceSuccess = Number.isFinite(successTime)
      ? Math.max(0, Math.floor((now.getTime() - successTime) / 60000)) : null;
    const status = !latest ? 'NEVER_RUN'
      : latest.status === 'FAILED' ? 'FAILED'
      : minutesSinceSuccess === null || minutesSinceSuccess > 30 ? 'STALE' : 'HEALTHY';
    return Response.json({
      ok: status === 'HEALTHY',
      status,
      expected_marketplaces: SALE_MARKETPLACES.length,
      latest: latest ? {
        checked_at: String(latest.checked_at || ''),
        status: String(latest.status || ''),
        approved_active_events: Number(latest.approved_active_events || 0),
        covered_marketplaces: Number(latest.covered_marketplaces || 0),
        queued_notifications: Number(latest.queued_notifications || 0),
        error_code: String(latest.error_code || '')
      } : null,
      last_success_at: lastSuccessAt,
      last_failure_at: String(failure?.checked_at || ''),
      last_failure_code: String(failure?.error_code || ''),
      minutes_since_success: minutesSinceSuccess
    }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ ok: false, error: 'MARKETPLACE_CONTENT_HEALTH_FAILED' }, { status: 500 });
  }
}

export async function handleMarketplaceSaleRoutes(request, env) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/api/sales') return publicList(env);
  if (request.method === 'GET' && url.pathname === '/api/internal/marketplace-content/health') {
    return marketplaceContentHealth(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/api/internal/sales') return upsertSale(request, env);
  if (url.pathname !== '/api/member/sale-preferences') return null;
  const member = await readMemberSession(request, env);
  if (!member) return Response.json({ ok: false, error: 'MEMBER_REQUIRED' }, { status: 401 });
  if (request.method === 'GET' || request.method === 'PATCH') return memberPreference(request, env, member);
  return Response.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
}
