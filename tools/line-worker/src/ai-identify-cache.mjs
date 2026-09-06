// 2026-09-06 大隆さん指示（AI検索ハイブリッド化・読み込み時間の最短化）:
// 「これですか？」の確認カードは、同じ質問なら毎回同じ候補になる。Gemini 呼び出し（3.5秒）と
// 参考画像の取得（最大5秒）を質問ごとに1回だけにして、2回目以降は D1 の1回読みで返す。
//
// 入れないもの: 価格（生鮮情報なので毎回取り直す）、個人を特定しうる情報、セッションID。
// キーは「正規化した質問文＋言語＋モード」の SHA-256。質問文そのものは保存しない。
export const IDENTIFY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PAYLOAD_CHARS = 8000;

// 全角空白・連続空白・大文字小文字・末尾の記号の違いで別キーにしない。
export function normalizeIdentifyQuery(query) {
  return String(query || '')
    .replace(/　/gu, ' ')
    .trim()
    .toLocaleLowerCase('ja-JP')
    .replace(/\s+/gu, ' ')
    .replace(/[?？!！。、,.]+$/gu, '')
    .slice(0, 200);
}

export async function identifyCacheKey(query, language, mode) {
  const normalized = normalizeIdentifyQuery(query);
  if (!normalized) return '';
  const source = new TextEncoder().encode(`${mode || 'IDENTIFY'}|${language || 'JA'}|${normalized}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', source));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// 保存してよいのは確認カードの表示に必要な項目だけ。想定外のキーは落とす。
export function sanitizeIdentifyPayload(result) {
  const source = result && typeof result === 'object' ? result : {};
  const text = (value, max) => String(value || '').trim().slice(0, max);
  const previews = (Array.isArray(source.candidate_previews) ? source.candidate_previews : [])
    .filter((item) => item && String(item.image || '').startsWith('https://') && item.name)
    .slice(0, 3)
    .map((item) => ({ name: text(item.name, 120), image: text(item.image, 600), marketplace: text(item.marketplace, 40) }));
  const candidateName = text(source.candidate_name, 160);
  if (!candidateName) return null;
  return {
    candidate_name: candidateName,
    candidate_brand: text(source.candidate_brand, 120),
    candidate_reason: text(source.candidate_reason, 300),
    refined_query: text(source.refined_query, 200),
    match_score: Math.max(0, Math.min(100, Math.round(Number(source.match_score || 0)))),
    matched_features: (Array.isArray(source.matched_features) ? source.matched_features : [])
      .map((item) => text(item, 100)).filter(Boolean).slice(0, 8),
    candidate_previews: previews
  };
}

export async function readIdentifyCache(env, cacheKey, now = new Date()) {
  if (!env?.PRODUCT_DB || !cacheKey) return null;
  try {
    const row = (await env.PRODUCT_DB.prepare(
      `SELECT payload FROM ai_identify_cache WHERE cache_key=?1 AND expires_at>?2`
    ).bind(cacheKey, now.toISOString()).all()).results?.[0];
    if (!row?.payload) return null;
    const parsed = JSON.parse(row.payload);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    // キャッシュは速度のためだけのもの。壊れていても検索は普通に続ける。
    return null;
  }
}

export function bumpIdentifyCacheHit(env, cacheKey) {
  if (!env?.PRODUCT_DB || !cacheKey) return Promise.resolve();
  return env.PRODUCT_DB.prepare(`UPDATE ai_identify_cache SET hits=hits+1 WHERE cache_key=?1`)
    .bind(cacheKey).run().catch(() => {});
}

export async function writeIdentifyCache(env, cacheKey, result, { language = 'JA', now = new Date() } = {}) {
  if (!env?.PRODUCT_DB || !cacheKey) return false;
  const payload = sanitizeIdentifyPayload(result);
  if (!payload) return false;
  const serialized = JSON.stringify(payload);
  if (serialized.length > MAX_PAYLOAD_CHARS) return false;
  try {
    await env.PRODUCT_DB.prepare(
      `INSERT INTO ai_identify_cache (cache_key,language,payload,hits,created_at,expires_at)
       VALUES (?1,?2,?3,0,?4,?5)
       ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at`
    ).bind(cacheKey, String(language || 'JA').slice(0, 8), serialized, now.toISOString(),
      new Date(now.getTime() + IDENTIFY_CACHE_TTL_MS).toISOString()).run();
    return true;
  } catch {
    return false;
  }
}

export function purgeExpiredIdentifyCache(env, now = new Date()) {
  if (!env?.PRODUCT_DB) return Promise.resolve();
  return env.PRODUCT_DB.prepare(`DELETE FROM ai_identify_cache WHERE expires_at<=?1`)
    .bind(now.toISOString()).run().catch(() => {});
}
