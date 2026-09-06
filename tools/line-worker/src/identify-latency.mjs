// 2026-09-06 大隆さん指示（読み込み時間の最短化）: 直したと言うためには実測が要る。
// 「これですか？」が出るまでの所要時間を段階ごとに残す。
//
// 残すのはミリ秒とキャッシュ状態だけ。質問文・画像・会員ID・セッションIDは入れない。
// 14日で消す（古い数字は改善の判断に使わない）。
export const IDENTIFY_LATENCY_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const CACHE_STATES = new Set(['hit', 'miss', 'off']);
const ROUTES = new Set(['identify', 'ai_chat_identify']);

const milliseconds = (value) => Math.max(0, Math.min(600000, Math.round(Number(value) || 0)));

export function identifyLatencyRow({ route = '', cacheState = '', aiMs = 0, previewMs = 0, totalMs = 0, now = new Date() } = {}) {
  if (!ROUTES.has(String(route)) || !CACHE_STATES.has(String(cacheState))) return null;
  return {
    log_id: crypto.randomUUID(),
    route: String(route),
    cache_state: String(cacheState),
    ai_ms: milliseconds(aiMs),
    preview_ms: milliseconds(previewMs),
    total_ms: milliseconds(totalMs),
    created_at: now.toISOString()
  };
}

export async function recordIdentifyLatency(env, input = {}) {
  const row = identifyLatencyRow(input);
  if (!env?.PRODUCT_DB || !row) return false;
  try {
    await env.PRODUCT_DB.prepare(
      `INSERT INTO identify_latency_log (log_id,route,cache_state,ai_ms,preview_ms,total_ms,created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7)`
    ).bind(row.log_id, row.route, row.cache_state, row.ai_ms, row.preview_ms, row.total_ms, row.created_at).run();
    return true;
  } catch {
    // 計測が落ちても検索は止めない。
    return false;
  }
}

export function purgeIdentifyLatencyLog(env, now = new Date()) {
  if (!env?.PRODUCT_DB) return Promise.resolve();
  return env.PRODUCT_DB.prepare(`DELETE FROM identify_latency_log WHERE created_at<=?1`)
    .bind(new Date(now.getTime() - IDENTIFY_LATENCY_RETENTION_MS).toISOString()).run().catch(() => {});
}
