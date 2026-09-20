// 2026-09-20 GPT 指示書 §P0/§6（大隆さん承認）「90 日無反応の探し中は自動停止」
//
// 「探し中」（notify_new_match=1 かつ insight_enabled_at あり かつ MUTED でない）のうち、
//   - 探し始めて 90 日以上、かつ
//   - 90 日間、発見（search_watch_matches のベースライン以外）も 本人の操作（updated_at）も無い
// ものに「まだ探し続けますか？」を 1 回だけ通知する（mywatch_notifications、event_type=INSIGHT_IDLE_CHECK）。
// 通知から 14 日たっても本人の操作（updated_at が通知より新しい）が無ければ、その条件を
// 「あとで見る」（notify_new_match=0、insight_enabled_at=NULL）へ移す。行は消さない。Seller 需要の
// 「◯人が探しています」からも自動的に外れる（active だけ数えるため）。
//
// 絶対に守ること: 本人が触った条件（updated_at が新しい）は止めない。通知は 1 条件 1 回。削除はしない。
const IDLE_DAYS = 90;
const GRACE_DAYS = 14;
const EVENT_TYPE = 'INSIGHT_IDLE_CHECK';

const iso = (ms) => new Date(ms).toISOString();

export async function runWishIdleStop(env, now = new Date()) {
  if (!env.PRODUCT_DB?.prepare) return { asked: 0, stopped: 0, skipped: 'NO_DB' };
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const idleSince = iso(nowMs - IDLE_DAYS * 86_400_000);
  const graceSince = iso(nowMs - GRACE_DAYS * 86_400_000);
  const nowIso = iso(nowMs);
  let asked = 0, stopped = 0;
  try {
    // 1) 90 日無反応の探し中で、まだ確認通知を出していない条件 → 「まだ探し続けますか？」
    const candidates = await env.PRODUCT_DB.prepare(`SELECT w.member_id, w.wish_id, w.query_text, w.language
      FROM member_wishes w
      WHERE w.notify_new_match=1 AND w.insight_enabled_at IS NOT NULL AND w.insight_enabled_at<>''
        AND UPPER(COALESCE(w.watch_frequency,'INSTANT'))<>'MUTED'
        AND w.insight_enabled_at<=?1 AND w.updated_at<=?1
        AND NOT EXISTS (SELECT 1 FROM search_watch_matches m WHERE m.wish_id=w.wish_id AND m.product_identity_key<>'INSIGHT_BASELINE' AND m.matched_at>?1)
        AND NOT EXISTS (SELECT 1 FROM mywatch_notifications n WHERE n.wish_id=w.wish_id AND n.event_type=?2)
      LIMIT 200`).bind(idleSince, EVENT_TYPE).all();
    for (const wish of candidates?.results || []) {
      const title = 'まだ探し続けますか？';
      const body = `「${String(wish.query_text || '').slice(0, 60)}」は ${IDLE_DAYS} 日間、新しい商品が見つかっていません。何もしなければ ${GRACE_DAYS} 日後に「あとで見る」へ移します（保存は残ります）。続けたい時は「ホシる中」で条件を開いて保存してください。\nHOSHILU: https://hoshilu.app/?utm_source=insight_idle_check&utm_medium=notification#laterWishes`;
      await env.PRODUCT_DB.prepare(`INSERT INTO mywatch_notifications
        (notification_id,member_id,wish_id,event_key,event_type,channel,title,body,status,attempts,next_attempt_at,delivered_at,created_at,updated_at)
        VALUES(?1,?2,?3,?4,?5,'WEB',?6,?7,'DELIVERED',1,?8,?8,?8,?8)`)
        .bind(crypto.randomUUID(), wish.member_id, wish.wish_id, `IDLE:${wish.wish_id}`, EVENT_TYPE, title, body, nowIso).run();
      asked += 1;
    }
    // 2) 確認通知から 14 日、本人の操作が無い → 「あとで見る」へ（notify_new_match=0、insight_enabled_at=NULL）
    const stale = await env.PRODUCT_DB.prepare(`SELECT w.member_id, w.wish_id
      FROM member_wishes w
      JOIN mywatch_notifications n ON n.wish_id=w.wish_id AND n.member_id=w.member_id AND n.event_type=?1 AND n.channel='WEB'
      WHERE w.notify_new_match=1 AND w.insight_enabled_at IS NOT NULL AND w.insight_enabled_at<>''
        AND n.created_at<=?2 AND w.updated_at<=n.created_at
      LIMIT 200`).bind(EVENT_TYPE, graceSince).all();
    for (const wish of stale?.results || []) {
      await env.PRODUCT_DB.prepare(`UPDATE member_wishes SET notify_new_match=0, insight_enabled_at=NULL, updated_at=?3
        WHERE member_id=?1 AND wish_id=?2 AND notify_new_match=1`).bind(wish.member_id, wish.wish_id, nowIso).run();
      stopped += 1;
    }
    return { asked, stopped };
  } catch (error) {
    return { asked, stopped, error: String(error?.message || 'WISH_IDLE_STOP_FAILED').slice(0, 80) };
  }
}
