// 2026-10-03 大隆さん指示（HOSHILU 検索時間を 2 秒短くする）: 直したと言うためには実測が要る。
// /api/knowledge（文字・写真・投稿URLの検索）の所要時間を段階ごとに残す。identify_latency_log と同じ流儀。
//
// 残すのはミリ秒・入力の種類・レーン数・利用区分（QA か実利用者か）だけ。検索文・画像・会員ID・
// セッションIDは入れない。14 日で消す（古い数字は改善の判断に使わない）。
export const KNOWLEDGE_LATENCY_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
// followup = 「さらに見る」で間に合わなかったモールだけを取り直した回（2026-10-03）。
const INPUT_KINDS = new Set(['text', 'image', 'social', 'confirmed', 'followup']);
const TRAFFIC_CLASSES = new Set(['QA', 'INTERNAL', 'ATTRIBUTED', 'UNATTRIBUTED']);
export const KNOWLEDGE_LATENCY_STAGES = Object.freeze([
  'gate_ms',        // ボット確認（Turnstile／トークン無しの上限）まで
  'analysis_ms',    // 写真・投稿URLの解釈（文字だけなら 0）
  'lookup_ms',      // GAS・D1・AI の検索語変換（並列）と、その後の D1 補完
  'marketplace_ms', // 楽天・Yahoo!・公式店の実時間（締め切り付き）
  'google_wait_ms', // Google モール検索の完了を待った時間（並列で走らせた残り）
  'decorate_ms',    // 署名付きリンク・関連商品・応答の組み立て
  'total_ms'
]);

const milliseconds = (value) => Math.max(0, Math.min(600000, Math.round(Number(value) || 0)));
const count = (value) => Math.max(0, Math.min(99, Math.round(Number(value) || 0)));
// 遅れたレーンの名前（rakuten_catalog_connected 等の固定の識別子だけ。検索文は入り得ない）。
const laneKeys = (keys) => (Array.isArray(keys) ? keys : [])
  .map((key) => String(key || '')).filter((key) => /^[a-z0-9_]{1,40}$/u.test(key)).slice(0, 8).join(',');

export function knowledgeLatencyRow(input = {}) {
  const inputKind = String(input.inputKind || '');
  const trafficClass = String(input.trafficClass || '');
  if (!INPUT_KINDS.has(inputKind) || !TRAFFIC_CLASSES.has(trafficClass)) return null;
  const stages = input.stages && typeof input.stages === 'object' ? input.stages : {};
  const row = { log_id: crypto.randomUUID(), input_kind: inputKind, traffic_class: trafficClass };
  for (const stage of KNOWLEDGE_LATENCY_STAGES) row[stage] = milliseconds(stages[stage]);
  row.lanes = count(input.lanes);
  row.late_lanes = count(input.lateLanes);
  row.late_lane_keys = laneKeys(input.lateLaneKeys);
  row.result_count = count(input.resultCount);
  row.created_at = (input.now instanceof Date ? input.now : new Date()).toISOString();
  return row;
}

export async function recordKnowledgeLatency(env, input = {}) {
  const row = knowledgeLatencyRow(input);
  if (!env?.PRODUCT_DB || !row) return false;
  try {
    await env.PRODUCT_DB.prepare(
      `INSERT INTO knowledge_latency_log (log_id,input_kind,traffic_class,gate_ms,analysis_ms,lookup_ms,marketplace_ms,google_wait_ms,decorate_ms,total_ms,lanes,late_lanes,late_lane_keys,result_count,created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)`
    ).bind(row.log_id, row.input_kind, row.traffic_class, row.gate_ms, row.analysis_ms, row.lookup_ms, row.marketplace_ms,
      row.google_wait_ms, row.decorate_ms, row.total_ms, row.lanes, row.late_lanes, row.late_lane_keys, row.result_count, row.created_at).run();
    return true;
  } catch {
    // 計測が落ちても検索は止めない。
    return false;
  }
}

export function purgeKnowledgeLatencyLog(env, now = new Date()) {
  if (!env?.PRODUCT_DB) return Promise.resolve();
  return env.PRODUCT_DB.prepare(`DELETE FROM knowledge_latency_log WHERE created_at<=?1`)
    .bind(new Date(now.getTime() - KNOWLEDGE_LATENCY_RETENTION_MS).toISOString()).run().catch(() => {});
}

// 段階の境目で呼ぶだけの小さな時計。mark() は前回の mark からの経過を返す。
export function createStageClock(now = () => Date.now()) {
  const startedAt = now();
  let last = startedAt;
  const stages = {};
  return {
    mark(stage) {
      const at = now();
      stages[stage] = (stages[stage] || 0) + (at - last);
      last = at;
      return stages[stage];
    },
    set(stage, ms) { stages[stage] = milliseconds(ms); },
    total() { return now() - startedAt; },
    stages() { return { ...stages, total_ms: now() - startedAt }; }
  };
}
