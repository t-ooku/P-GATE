// HOSHILU INSIGHT 通知仕様変更指示書 v1.0: 保存した検索条件を定期的に
// スキャンし、新しく一致する商品が見つかったらバッチ通知を作る内部API。
//
// mywatch-routes.mjs の /api/internal/mywatch/events (CRON_SECRET認証済みの
// 内部限定API)と同じ認証パターンを踏襲する。新しい秘密情報は増やさず、
// 既存の MYWATCH_CRON_SECRET をそのまま再利用する。
//
// section19で要求される「search_watch_id + canonical_product_id相当」の
// 重複防止は search_watch_matches テーブル(member_wishes.wish_idを
// search_watch_idとして流用)で行う。
//
// 既知の制約(誠実に明記): このAPIはscheduled()のcronへはまだ配線して
// いない(呼び出せば正しく動作するが、定期実行の自動起動はまだ無い)。
// 理由は insight-catalog-search.mjs 側のコメントと同じ - 全ウォッチ×検索
// 呼び出しを無制限にcron化する前に、レート制限・コスト面の設計を別途行う
// 必要があるため。既存の /api/internal/mywatch/events も同様に手動/内部API
// トリガー方式であり、この設計はリポジトリ内で既に確立されたパターン。

import { searchCandidatesForInsight } from './insight-catalog-search.mjs';
import { detectNewMatchesForWish } from './insight-search-watch.mjs';

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

async function loadAlreadyMatchedKeys(env, wishId) {
  const rows = await env.PRODUCT_DB.prepare(
    'SELECT product_identity_key FROM search_watch_matches WHERE wish_id=?1'
  ).bind(wishId).all();
  return new Set((rows?.results || []).map((row) => row.product_identity_key));
}

async function persistNewMatches(env, { memberId, wishId, notification, newMatches, now }) {
  const notificationId = crypto.randomUUID();
  const result = await env.PRODUCT_DB.prepare(
    `INSERT OR IGNORE INTO mywatch_notifications
    (notification_id,member_id,wish_id,event_key,event_type,channel,title,body,status,attempts,next_attempt_at,delivered_at,created_at,updated_at,asin,marketplace,image_url)
    VALUES(?1,?2,?3,?4,?5,'WEB',?6,?7,'DELIVERED',1,?8,?8,?8,?8,?9,?10,?11)`
  ).bind(
    notificationId, memberId, wishId, notification.event_key, notification.event_type,
    notification.title, notification.body, now, notification.asin, notification.marketplace, notification.image_url
  ).run();
  const queued = Number(result?.meta?.changes || 0) > 0;
  if (!queued) return { queued: false, notificationId: null };
  for (const match of newMatches) {
    const offer = Array.isArray(match.offers) ? match.offers[0] : match.selected_offer;
    await env.PRODUCT_DB.prepare(
      `INSERT OR IGNORE INTO search_watch_matches
      (member_id,wish_id,product_identity_key,asin,marketplace,matched_at,notification_id)
      VALUES(?1,?2,?3,?4,?5,?6,?7)`
    ).bind(
      memberId, wishId, match.product_identity_key,
      String(match.asin || '').slice(0, 20), String(match.marketplace || offer?.marketplace || '').slice(0, 20),
      now, notificationId
    ).run();
  }
  return { queued: true, notificationId };
}

// 1件の保存条件(wish)を検出→重複除外→バッチ通知作成→永続化まで行う。
// notify_new_match=0(HOSHILU INSIGHTをオフにした条件)は何もしない。
//
// searchCandidates は既定で本番と同じ searchCandidatesForInsight
// (=知識検索基盤を実際に通す)を使う。テストからは第4引数で差し替えられる
// ようにしておくことで、テストコード側で knowledge-search.mjs の重い
// D1索引データを用意しなくても「マッチング品質基盤を通過済みの候補だけを
// 新着判定する」というこのモジュール自身のロジック(重複除外・バッチ通知
// 作成・永続化)を検証できる。本番の呼び出し元(scan())はデフォルト値の
// ままなので、実際の挙動には一切影響しない。
export async function scanWishForNewMatches(env, wish, now = new Date().toISOString(), searchCandidates = searchCandidatesForInsight) {
  if (!wish || Number(wish.notify_new_match) !== 1) return { scanned: false, matched: 0 };
  const candidates = await searchCandidates(env, wish.query_text, wish.language || 'JA');
  const alreadyMatchedKeys = await loadAlreadyMatchedKeys(env, wish.wish_id);
  const { notification, newMatches } = detectNewMatchesForWish({
    memberId: wish.member_id,
    wishId: wish.wish_id,
    queryText: wish.query_text,
    candidates,
    alreadyMatchedKeys,
    language: wish.language || 'JA'
  });
  if (!notification) return { scanned: true, matched: 0 };
  const persisted = await persistNewMatches(env, {
    memberId: wish.member_id, wishId: wish.wish_id, notification, newMatches, now
  });
  return { scanned: true, matched: persisted.queued ? newMatches.length : 0 };
}

async function scan(request, env) {
  if (!internalAuthorized(request, env)) {
    return Response.json({ ok: false, error: 'INSIGHT_UNAUTHORIZED' }, { status: 401 });
  }
  if (!env.PRODUCT_DB) return Response.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
  const now = new Date().toISOString();
  const wishes = await env.PRODUCT_DB.prepare(
    'SELECT member_id,wish_id,query_text,language,notify_new_match FROM member_wishes WHERE notify_new_match=1'
  ).all();
  let scannedCount = 0;
  let matchedNotificationCount = 0;
  for (const wish of wishes?.results || []) {
    try {
      const outcome = await scanWishForNewMatches(env, wish, now);
      if (outcome.scanned) scannedCount += 1;
      if (outcome.matched > 0) matchedNotificationCount += 1;
    } catch (error) {
      console.warn('INSIGHT_SCAN_WISH_FAILED', {
        wish_id: String(wish.wish_id || ''), error: String(error?.message || error).slice(0, 200)
      });
    }
  }
  return Response.json({ ok: true, scanned: scannedCount, notifications_sent: matchedNotificationCount });
}

export async function handleInsightRoutes(request, env) {
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/api/internal/insight/scan') {
    return scan(request, env);
  }
  return null;
}
