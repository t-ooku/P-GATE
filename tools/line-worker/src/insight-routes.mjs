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
import { detectNewMatchesForWish, filterNewMatches } from './insight-search-watch.mjs';
import { nextDeliveryAt } from './mywatch-policy.mjs';

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

const INSIGHT_BASELINE_KEY = 'INSIGHT_BASELINE';
const INSIGHT_SCAN_LEASE_MS = 10 * 60 * 1000;

async function acquireInsightScanLease(env, wishId) {
  const token = crypto.randomUUID();
  // Lease safety is based on actual acquisition time, not controller.scheduledTime.
  // A delayed cron may carry a timestamp older than the lease duration.
  const timestamp = new Date();
  const expiresAt = new Date(timestamp.getTime() + INSIGHT_SCAN_LEASE_MS).toISOString();
  try {
    const result = await env.PRODUCT_DB.prepare(
      `INSERT INTO insight_scan_leases(wish_id,lease_token,expires_at,updated_at)
       VALUES(?1,?2,?3,?4)
       ON CONFLICT(wish_id) DO UPDATE SET
         lease_token=excluded.lease_token,expires_at=excluded.expires_at,updated_at=excluded.updated_at
       WHERE insight_scan_leases.expires_at<=?4`
    ).bind(wishId, token, expiresAt, timestamp.toISOString()).run();
    return Number(result?.meta?.changes || 0) === 1 ? token : '';
  } catch (error) {
    // Worker deploy can precede migration 0066. Running without the lease
    // would reintroduce duplicate-body races, so fail closed until it exists.
    if (/no such table.*insight_scan_leases/iu.test(String(error?.message || error))) return '';
    throw error;
  }
}

async function releaseInsightScanLease(env, wishId, token) {
  await env.PRODUCT_DB.prepare(
    'DELETE FROM insight_scan_leases WHERE wish_id=?1 AND lease_token=?2'
  ).bind(wishId, token).run();
}

async function persistInsightBaseline(env, wish, candidates, now) {
  const identities = filterNewMatches(candidates, new Set()).map((candidate) => {
    const offer = Array.isArray(candidate.offers) ? candidate.offers[0] : candidate.selected_offer;
    return {
      key: candidate.product_identity_key,
      asin: String(candidate.asin || '').slice(0, 20),
      marketplace: String(candidate.marketplace || offer?.marketplace || '').slice(0, 20)
    };
  });
  const rows = [{ key: INSIGHT_BASELINE_KEY, asin: '', marketplace: '' }, ...identities];
  // json_each keeps the complete baseline in one atomic INSERT while using
  // only four bound parameters (D1 caps bound parameters per statement).
  const result = await env.PRODUCT_DB.prepare(
    `INSERT OR IGNORE INTO search_watch_matches
    (member_id,wish_id,product_identity_key,asin,marketplace,matched_at,notification_id)
    SELECT ?1,?2,
      json_extract(value,'$.key'),json_extract(value,'$.asin'),
      json_extract(value,'$.marketplace'),?4,NULL
    FROM json_each(?3)
    WHERE EXISTS(
      SELECT 1 FROM member_wishes w
      WHERE w.member_id=?1 AND w.wish_id=?2
        AND w.insight_enabled_at IS NOT NULL
        AND w.notify_new_match=1 AND w.watch_frequency<>'MUTED'
    )`
  ).bind(wish.member_id, wish.wish_id, JSON.stringify(rows), now).run();
  const created = Number(result?.meta?.changes || 0) > 0;
  return { created, count: created ? identities.length : 0 };
}

function insightResultUrl(wishId) {
  const id = String(wishId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return '';
  return `/?search_watch=${encodeURIComponent(id)}#hoshiluSearch`;
}

const EXTERNAL_RESULT_LABEL = {
  JA: 'HOSHILUで結果を見る', EN: 'View results on HOSHILU',
  ZH: '在 HOSHILU 查看结果', KO: 'HOSHILU에서 결과 보기'
};

function externalNotificationBody(notification, language) {
  const path = String(notification?.result_url || '');
  const resultUrl = /^\/\?search_watch=[A-Za-z0-9_-]{1,80}#hoshiluSearch$/.test(path)
    ? `https://hoshilu.app${path}` : 'https://hoshilu.app/#mywatchTitle';
  const label = EXTERNAL_RESULT_LABEL[String(language || '').toUpperCase()] || EXTERNAL_RESULT_LABEL.JA;
  const suffix = `\n\n${label}\n${resultUrl}`;
  return `${String(notification?.body || '').slice(0, Math.max(0, 500 - suffix.length))}${suffix}`;
}

async function notificationIdentity(wishId, matchedKeys) {
  const input = `${wishId}\0${[...(matchedKeys || [])].sort().join('\0')}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const hex = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  return {
    eventKey: `INSIGHT:${wishId}:${hex}`.slice(0, 160),
    notificationId: `insight-${hex.slice(0, 48)}`
  };
}

async function connectedExternalChannels(env, memberId, frequency) {
  if (String(frequency || '').toUpperCase() === 'MUTED') return [];
  try {
    const result = await env.PRODUCT_DB.prepare(
      `SELECT channel FROM member_notification_destinations
       WHERE member_id=?1 AND channel IN ('LINE','EMAIL') AND verified_at<>''`
    ).bind(memberId).all();
    return [...new Set((result?.results || []).map((row) => String(row.channel || ''))
      .filter((channel) => channel === 'LINE' || channel === 'EMAIL'))];
  } catch {
    // A delayed destination-table migration must not suppress the in-app row.
    return [];
  }
}

async function persistNewMatches(env, { memberId, wishId, notification, newMatches, now, language, frequency }) {
  const { eventKey, notificationId } = await notificationIdentity(
    wishId, notification.matched_product_identity_keys
  );
  const channels = await connectedExternalChannels(env, memberId, frequency);
  const nextAt = nextDeliveryAt(frequency, now);
  const webDelivered = Date.parse(nextAt) <= Date.parse(now);
  const externalBody = externalNotificationBody(notification, language);
  const buildStatements = (withResultUrl) => {
    const webColumns = withResultUrl ? ',result_url' : '';
    const webBindings = [
      notificationId, memberId, wishId, eventKey, notification.event_type,
      notification.title, notification.body, webDelivered ? 'DELIVERED' : 'PENDING',
      webDelivered ? 1 : 0, nextAt, webDelivered ? now : null, now,
      notification.asin, notification.marketplace, notification.image_url
    ];
    if (withResultUrl) webBindings.push(notification.result_url);
    const statements = [env.PRODUCT_DB.prepare(
      `INSERT OR IGNORE INTO mywatch_notifications
      (notification_id,member_id,wish_id,event_key,event_type,channel,title,body,status,attempts,next_attempt_at,delivered_at,created_at,updated_at,asin,marketplace,image_url${webColumns})
      SELECT ?1,?2,?3,?4,?5,'WEB',?6,?7,?8,?9,?10,?11,?12,?12,?13,?14,?15${withResultUrl ? ',?16' : ''}
      WHERE EXISTS(
        SELECT 1 FROM member_wishes w
        WHERE w.member_id=?2 AND w.wish_id=?3
          AND w.insight_enabled_at IS NOT NULL
          AND w.notify_new_match=1 AND w.watch_frequency<>'MUTED'
      )`
    ).bind(...webBindings)];
    for (const channel of channels) {
      const externalColumns = withResultUrl ? ',result_url' : '';
      const externalValue = withResultUrl ? ',?14' : '';
      const externalBindings = [
        `${notificationId}-${channel.toLowerCase()}`, memberId, wishId, eventKey,
        notification.event_type, channel, notification.title, externalBody, nextAt, now,
        notification.asin, notification.marketplace, notification.image_url
      ];
      if (withResultUrl) externalBindings.push(notification.result_url);
      statements.push(env.PRODUCT_DB.prepare(
        `INSERT OR IGNORE INTO mywatch_notifications
        (notification_id,member_id,wish_id,event_key,event_type,channel,title,body,status,attempts,next_attempt_at,delivered_at,created_at,updated_at,asin,marketplace,image_url${externalColumns})
        SELECT ?1,?2,?3,?4,?5,?6,?7,?8,'PENDING',0,?9,NULL,?10,?10,?11,?12,?13${externalValue}
        WHERE EXISTS(
          SELECT 1 FROM member_wishes w
          WHERE w.member_id=?2 AND w.wish_id=?3
            AND w.insight_enabled_at IS NOT NULL
            AND w.notify_new_match=1 AND w.watch_frequency<>'MUTED'
        )`
      ).bind(...externalBindings));
    }
    for (const match of newMatches) {
      const offer = Array.isArray(match.offers) ? match.offers[0] : match.selected_offer;
      statements.push(env.PRODUCT_DB.prepare(
        `INSERT OR IGNORE INTO search_watch_matches
        (member_id,wish_id,product_identity_key,asin,marketplace,matched_at,notification_id)
        SELECT ?1,?2,?3,?4,?5,?6,?7
        WHERE EXISTS(
          SELECT 1 FROM member_wishes w
          WHERE w.member_id=?1 AND w.wish_id=?2
            AND w.insight_enabled_at IS NOT NULL
            AND w.notify_new_match=1 AND w.watch_frequency<>'MUTED'
        )`
      ).bind(
        memberId, wishId, match.product_identity_key,
        String(match.asin || '').slice(0, 20), String(match.marketplace || offer?.marketplace || '').slice(0, 20),
        now, notificationId
      ));
    }
    return statements;
  };
  let results;
  try {
    results = await env.PRODUCT_DB.batch(buildStatements(true));
  } catch (error) {
    if (!/no such column.*result_url|has no column named result_url/iu.test(String(error?.message || error))) throw error;
    results = await env.PRODUCT_DB.batch(buildStatements(false));
  }
  const queued = Number(results?.[0]?.meta?.changes || 0) > 0;
  return { queued, notificationId: queued ? notificationId : null };
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
  if (!wish) return { scanned: false, matched: 0 };
  if (String(wish.watch_frequency || 'INSTANT').toUpperCase() === 'MUTED') {
    return { scanned: false, matched: 0, muted: true };
  }
  if (Number(wish.notify_new_match) !== 1 || !String(wish.insight_enabled_at || '').trim()) {
    return { scanned: false, matched: 0 };
  }
  const leaseToken = await acquireInsightScanLease(env, wish.wish_id);
  if (!leaseToken) return { scanned: false, matched: 0, lease_busy: true };
  try {
    const candidates = await searchCandidates(env, wish.query_text, wish.language || 'JA');
    const alreadyMatchedKeys = await loadAlreadyMatchedKeys(env, wish.wish_id);
    if (!alreadyMatchedKeys.has(INSIGHT_BASELINE_KEY)) {
      const baseline = await persistInsightBaseline(env, wish, candidates, now);
      return {
        scanned: true, matched: 0,
        baseline_created: baseline.created, baseline_count: baseline.count
      };
    }
    const { notification, newMatches } = detectNewMatchesForWish({
      memberId: wish.member_id,
      wishId: wish.wish_id,
      queryText: wish.query_text,
      candidates,
      alreadyMatchedKeys,
      language: wish.language || 'JA',
      resultUrl: insightResultUrl(wish.wish_id)
    });
    if (!notification) return { scanned: true, matched: 0 };
    const persisted = await persistNewMatches(env, {
      memberId: wish.member_id, wishId: wish.wish_id, notification, newMatches, now,
      language: wish.language || 'JA', frequency: wish.watch_frequency || 'INSTANT'
    });
    return { scanned: true, matched: persisted.queued ? newMatches.length : 0 };
  } finally {
    await releaseInsightScanLease(env, wish.wish_id, leaseToken);
  }
}

// D1のqueries/Worker invocation上限はFree 50、Paid 1,000。契約tierは
// リポジトリから判定できないため未設定は必ずFree側へ倒す。1条件は検索・
// 通知を含め最大24 statements（lease acquire/releaseを含む）、固定費は
// COUNT/page/wrapの最大3。Free 1件=27、Paid 40件=963に収める。
const INSIGHT_SCAN_FREE_BATCH_LIMIT = 1;
const INSIGHT_SCAN_PAID_BATCH_LIMIT = 40;
const INSIGHT_SCAN_INTERVAL_MS = 15 * 60 * 1000;

function insightScanBatchLimit(env) {
  return String(env?.INSIGHT_D1_QUERY_TIER || '').trim().toUpperCase() === 'PAID'
    ? INSIGHT_SCAN_PAID_BATCH_LIMIT : INSIGHT_SCAN_FREE_BATCH_LIMIT;
}

function insightScanOffset(now, total, limit) {
  if (total <= limit) return 0;
  const timestamp = Date.parse(String(now || ''));
  const slot = Number.isFinite(timestamp) ? Math.floor(timestamp / INSIGHT_SCAN_INTERVAL_MS) : 0;
  return (slot * limit) % total;
}

async function loadInsightScanBatch(env, total, now, limit) {
  const size = Math.min(total, limit);
  if (!size) return { rows: [], offset: 0 };
  const offset = insightScanOffset(now, total, limit);
  const select = (limit, rowOffset) => env.PRODUCT_DB.prepare(
    `SELECT member_id,wish_id,query_text,language,notify_new_match,watch_frequency,insight_enabled_at FROM member_wishes
    WHERE insight_enabled_at IS NOT NULL AND notify_new_match=1 AND watch_frequency<>'MUTED'
    ORDER BY wish_id ASC,member_id ASC LIMIT ?1 OFFSET ?2`
  ).bind(limit, rowOffset).all();
  const first = await select(size, offset);
  const rows = [...(first?.results || [])];
  if (rows.length < size && offset > 0) {
    const wrapped = await select(size - rows.length, 0);
    rows.push(...(wrapped?.results || []));
  }
  return { rows, offset };
}

// scheduled()から直接呼ばれる本体。HTTPリクエスト/CRON_SECRET認証を必要と
// せず、Worker内部からの呼び出し専用(scan()はこの関数をHTTP経由で叩く薄い
// ラッパーとして以下に残す)。
export async function runInsightScan(env, now = new Date().toISOString(), scanWish = scanWishForNewMatches) {
  if (!env.PRODUCT_DB) return { scanned: 0, notifications_sent: 0, truncated: false };
  const limit = insightScanBatchLimit(env);
  let count;
  try {
    count = await env.PRODUCT_DB.prepare(
      "SELECT COUNT(*) AS total FROM member_wishes WHERE insight_enabled_at IS NOT NULL AND notify_new_match=1 AND watch_frequency<>'MUTED'"
    ).first();
  } catch (error) {
    // Worker deploys can precede generic D1 migrations.  Before 0065 exists we
    // cannot prove explicit consent, so the only safe fallback is scanning zero
    // legacy rows (rather than treating 0044's DEFAULT 1 as an opt-in).
    if (/(?:no such column|has no column named).*insight_enabled_at/iu.test(String(error?.message || error))) {
      return { scanned: 0, notifications_sent: 0, truncated: false };
    }
    throw error;
  }
  const total = Math.max(0, Math.trunc(Number(count?.total || 0)));
  const truncated = total > limit;
  const { rows: batch, offset } = await loadInsightScanBatch(env, total, now, limit);
  let scannedCount = 0;
  let matchedNotificationCount = 0;
  for (const wish of batch) {
    try {
      const outcome = await scanWish(env, wish, now);
      if (outcome.scanned) scannedCount += 1;
      if (outcome.matched > 0) matchedNotificationCount += 1;
    } catch (error) {
      console.warn('INSIGHT_SCAN_WISH_FAILED', {
        wish_id: String(wish.wish_id || ''), error: String(error?.message || error).slice(0, 200)
      });
    }
  }
  if (truncated) {
    console.warn(JSON.stringify({
      event: 'INSIGHT_SCAN_BATCH_ROTATED', limit, total, offset
    }));
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
