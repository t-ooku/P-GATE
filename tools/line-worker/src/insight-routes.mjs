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
// 2026-08-08 cron配線: applyIndexedSearchPolicy (insight-catalog-search.mjs
// が呼ぶ実体) はD1索引検索のみで、AI(Gemini/OpenAI)呼び出しは一切発生しない
// ため、mywatch/events(=まだ存在しない外部の価格監視パイプラインからの
// イベント受け口)と違い、このAPIは自己完結して定期実行できる。ただし
// ウォッチ件数が増えた将来にD1負荷が無制限に増えないよう、1回の実行で
// スキャンする件数に上限(INSIGHT_SCAN_BATCH_LIMIT)を設ける。上限に達した
// 場合は次回実行に持ち越されるだけで、超過分が永久にスキャンされなくなる
// わけではない(15分ごとに呼ばれるため、上限×1時間あたり4回ぶんが実質の
// スループット)。runInsightScan()がscheduled()から直接(HTTP経由でなく)
// 呼ばれる本体で、scan()はCRON_SECRET認証つきの手動/外部トリガー用HTTP
// エンドポイントとして両方を提供する。

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

// 1回のscheduled()呼び出しでスキャンするウォッチ件数の上限。D1負荷を
// ウォッチ総数に対して無制限に増やさないための保護であり、機能を無効化する
// ものではない(15分ごとに次のバッチへ進む)。
const INSIGHT_SCAN_BATCH_LIMIT = 300;

// scheduled()から直接呼ばれる本体。HTTPリクエスト/CRON_SECRET認証を必要と
// せず、Worker内部からの呼び出し専用(scan()はこの関数をHTTP経由で叩く薄い
// ラッパーとして以下に残す)。
export async function runInsightScan(env, now = new Date().toISOString()) {
  if (!env.PRODUCT_DB) return { scanned: 0, notifications_sent: 0, truncated: false };
  const wishes = await env.PRODUCT_DB.prepare(
    `SELECT member_id,wish_id,query_text,language,notify_new_match FROM member_wishes
    WHERE notify_new_match=1 ORDER BY wish_id ASC LIMIT ?1`
  ).bind(INSIGHT_SCAN_BATCH_LIMIT + 1).all();
  const rows = wishes?.results || [];
  const truncated = rows.length > INSIGHT_SCAN_BATCH_LIMIT;
  const batch = truncated ? rows.slice(0, INSIGHT_SCAN_BATCH_LIMIT) : rows;
  let scannedCount = 0;
  let matchedNotificationCount = 0;
  for (const wish of batch) {
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
  if (truncated) {
    console.warn('INSIGHT_SCAN_BATCH_TRUNCATED', { limit: INSIGHT_SCAN_BATCH_LIMIT });
  }
  return { scanned: scannedCount, notifications_sent: matchedNotificationCount, truncated };
}

async function scan(request, env) {
  if (!internalAuthorized(request, env)) {
    return Response.json({ ok: false, error: 'INSIGHT_UNAUTHORIZED' }, { status: 401 });
  }
  if (!env.PRODUCT_DB) return Response.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
  const now = new Date().toISOString();
  const result = await runInsightScan(env, now);
  return Response.json({ ok: true, scanned: result.scanned, notifications_sent: result.notifications_sent });
}

export async function handleInsightRoutes(request, env) {
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/api/internal/insight/scan') {
    return scan(request, env);
  }
  return null;
}
