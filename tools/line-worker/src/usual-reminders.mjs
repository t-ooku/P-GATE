// 2026-09-25 大隆さん指示「いつものホシルも、ホシルを使うきっかけや日々使う理由になるから販促しよう」。
//
// 画面には「そろそろの頃にお知らせします」と書いてあったのに、お知らせを出す仕組みが無かった
// （member_usual_items を読む cron が1つも無かった）。広告でこの言葉を使う前に、実際に届くようにする。
//
// 決まりごと:
//   ・知らせるのは「もうすぐ」（残りが周期の2割未満）になったとき。1周期に1回だけ
//     （event_key に next_due_at を入れるので、「買った！」で次の周期に進むとまた1回だけ届く）
//   ・届け先は、アプリ内のお知らせ（WEB）＋本人が連携済みの LINE／メールだけ。新しく連絡先は作らない
//   ・夜は送らない（JST 9時〜20時だけ積む）。2週間以上前に切れたままのものは、もう知らせない
//   ・止めた（PAUSED）・やめた（ARCHIVED）ものは知らせない
//   ・価格は書かない（ここでは確認していないので）。本文は商品名と「そろそろ」だけ
//   ・1回に25件まで（無料枠の D1 クエリ数を守る。SELECT 1回＋batch 1回）
import { usualState } from './member-usual.mjs';

export const USUAL_REMINDER_EVENT = 'USUAL_DUE';
export const USUAL_REMINDER_BATCH = 25;
export const USUAL_REMINDER_STALE_DAYS = 14;
const DAY_MS = 86_400_000;
const USUAL_LINK = 'https://hoshilu.app/?utm_source=usual_notification&utm_medium=notification#usualHoshiru';

export function usualReminderWindowOpen(now = new Date()) {
  const hour = (now.getUTCHours() + 9) % 24;
  return hour >= 9 && hour < 20;
}

export function usualReminderKey(usualId, nextDueAt) {
  return `${USUAL_REMINDER_EVENT}:${usualId}:${nextDueAt}`;
}

export function usualReminderCopy(item, now = new Date()) {
  const name = String(item?.product_name || '').normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, 60) || 'いつもの商品';
  const { days_left: daysLeft } = usualState(item?.next_due_at, item?.cycle_days, now.getTime());
  const when = !Number.isFinite(daysLeft) ? 'そろそろ' : daysLeft <= 0 ? 'そろそろなくなる頃です' : `あと${daysLeft}日くらいでなくなる頃です`;
  return {
    title: `いつもの「${name}」、そろそろです`,
    body: `いつものペースだと、${when}。なくなる前に、今の値段を見ておきませんか？\n\nいつものホシルを開く\n${USUAL_LINK}`
  };
}

export async function queueUsualDueNotifications(env, now = new Date()) {
  if (!env?.PRODUCT_DB) return { status: 'SKIPPED', queued: 0 };
  if (!usualReminderWindowOpen(now)) return { status: 'QUIET_HOURS', queued: 0 };
  const at = now.toISOString();
  const staleBefore = new Date(now.getTime() - USUAL_REMINDER_STALE_DAYS * DAY_MS).toISOString();
  let rows;
  try {
    rows = await env.PRODUCT_DB.prepare(
      `SELECT u.member_id,u.usual_id,u.product_name,u.next_due_at,u.cycle_days,
        (SELECT group_concat(d.channel) FROM member_notification_destinations d
          WHERE d.member_id=u.member_id AND d.channel IN ('LINE','EMAIL')) AS channels
       FROM member_usual_items u
       WHERE u.status='ACTIVE' AND u.next_due_at<>'' AND u.next_due_at>=?2
         AND (julianday(u.next_due_at)-julianday(?1)) < (u.cycle_days*0.2)
         AND NOT EXISTS (SELECT 1 FROM mywatch_notifications n
           WHERE n.member_id=u.member_id AND n.wish_id=u.usual_id AND n.channel='WEB'
             AND n.event_key=('${USUAL_REMINDER_EVENT}:'||u.usual_id||':'||u.next_due_at))
       ORDER BY u.next_due_at ASC LIMIT ?3`
    ).bind(at, staleBefore, USUAL_REMINDER_BATCH).all();
  } catch (error) {
    // migration 0085 より前（テーブルが無い）なら何もしない。他の cron を止めない。
    if (/no such table/iu.test(String(error?.message || error))) return { status: 'NO_TABLE', queued: 0 };
    throw error;
  }
  const statements = [];
  let queued = 0;
  // 「もうすぐ」かどうかは上の SQL（残り < 周期の2割）だけで決める。ここでもう一度判定しない
  //（判定の丸め方が少しでも違うと、SQL は通ったのに JS で落ちる行が LIMIT の枠を食いつぶす）。
  for (const item of rows?.results || []) {
    const copy = usualReminderCopy(item, now);
    const key = usualReminderKey(item.usual_id, item.next_due_at);
    const external = String(item.channels || '').split(',').filter((channel) => channel === 'LINE' || channel === 'EMAIL');
    for (const channel of ['WEB', ...new Set(external)]) {
      statements.push(env.PRODUCT_DB.prepare(
        `INSERT OR IGNORE INTO mywatch_notifications
         (notification_id,member_id,wish_id,event_key,event_type,channel,title,body,status,attempts,next_attempt_at,delivered_at,created_at,updated_at)
         VALUES(?1,?2,?3,?4,'${USUAL_REMINDER_EVENT}',?5,?6,?7,'PENDING',0,?8,NULL,?8,?8)`
      ).bind(crypto.randomUUID(), item.member_id, item.usual_id, key, channel, copy.title, copy.body, at));
    }
    queued += 1;
  }
  if (statements.length) await env.PRODUCT_DB.batch(statements);
  return { status: 'OK', queued };
}
