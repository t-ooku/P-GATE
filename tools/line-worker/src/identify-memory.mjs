// 2026-09-06 大隆さん指示: 「探したい商品が見つかることが大切。一度やった検索は
// D1 があるからそこから回答すれば良い」。
//
// 「これですか？」への答え（YES / NO）を D1 に残して、次に同じ質問が来たときに使う。
// - YES があれば Gemini を呼ばずに D1 から即答する（速くて、しかも前回当たった答え）。
// - NO で否定された候補名は「これは違う」として次の候補出しに渡す。
//   同じ外し方を繰り返さないための記憶で、これが「見つかること」に直接効く。
//
// 残すのは正規化した質問文のハッシュ・言語・確定した候補・否定された候補名だけ。
// 質問文そのもの、会員ID、セッションID、価格は入れない。
import { normalizeIdentifyQuery } from './ai-identify-cache.mjs';

export const MAX_REJECTED_CANDIDATES = 8;

async function sha256Hex(text) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function identifyMemoryKey(query, language = 'JA') {
  const normalized = normalizeIdentifyQuery(query);
  if (!normalized) return '';
  return sha256Hex(`identify-memory|${String(language || 'JA')}|${normalized}`);
}

// 確定した候補として保存してよいのは、確認カードに出す項目だけ。
export function confirmedCandidate(candidate) {
  const source = candidate && typeof candidate === 'object' ? candidate : {};
  const text = (value, max) => String(value || '').trim().slice(0, max);
  const name = text(source.name || source.candidate_name, 160);
  if (!name) return null;
  return {
    candidate_name: name,
    candidate_brand: text(source.brand || source.candidate_brand, 120),
    candidate_reason: text(source.reason || source.candidate_reason, 300),
    refined_query: text(source.refined_query || source.search_keywords?.[0] || name, 200),
    match_score: Math.max(0, Math.min(100, Math.round(Number(source.match_score) || 0))),
    matched_features: (Array.isArray(source.matched_features) ? source.matched_features : [])
      .map((item) => text(item, 100)).filter(Boolean).slice(0, 8)
  };
}

export function rejectedName(value) {
  return String(value || '').trim().slice(0, 160);
}

function parseRejected(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map(rejectedName).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function readIdentifyMemory(env, query, language = 'JA') {
  const key = await identifyMemoryKey(query, language);
  if (!env?.PRODUCT_DB || !key) return { key: '', confirmed: null, rejected: [] };
  try {
    const row = (await env.PRODUCT_DB.prepare(
      `SELECT confirmed_json,rejected_json FROM identify_confirmations WHERE query_hash=?1 AND language=?2`
    ).bind(key, String(language || 'JA')).all()).results?.[0];
    if (!row) return { key, confirmed: null, rejected: [] };
    let confirmed = null;
    try { confirmed = row.confirmed_json ? JSON.parse(row.confirmed_json) : null; } catch { confirmed = null; }
    return { key, confirmed: confirmed?.candidate_name ? confirmed : null, rejected: parseRejected(row.rejected_json) };
  } catch {
    // 記憶が読めなくても、いつもどおり Gemini に聞けば答えは出せる。
    return { key: '', confirmed: null, rejected: [] };
  }
}

export async function rememberIdentifyAnswer(env, {
  query = '', language = 'JA', confirmed = null, rejected = '', now = new Date()
} = {}) {
  const key = await identifyMemoryKey(query, language);
  if (!env?.PRODUCT_DB || !key) return false;
  const candidate = confirmed ? confirmedCandidate(confirmed) : null;
  const rejectedCandidate = rejectedName(rejected);
  if (!candidate && !rejectedCandidate) return false;
  const timestamp = now.toISOString();
  const languageValue = String(language || 'JA').slice(0, 8);
  try {
    const existing = await readIdentifyMemory(env, query, languageValue);
    const rejectedList = rejectedCandidate
      ? [rejectedCandidate, ...existing.rejected.filter((item) => item !== rejectedCandidate)].slice(0, MAX_REJECTED_CANDIDATES)
      : existing.rejected;
    // YES があれば、それが正。NO だけのときは前回の確定候補を消さない。
    const confirmedJson = candidate ? JSON.stringify(candidate) : (existing.confirmed ? JSON.stringify(existing.confirmed) : '');
    await env.PRODUCT_DB.prepare(
      `INSERT INTO identify_confirmations (query_hash,language,confirmed_json,rejected_json,confirmed_count,rejected_count,created_at,updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?7)
       ON CONFLICT(query_hash,language) DO UPDATE SET
         confirmed_json=excluded.confirmed_json,
         rejected_json=excluded.rejected_json,
         confirmed_count=identify_confirmations.confirmed_count+?5,
         rejected_count=identify_confirmations.rejected_count+?6,
         updated_at=excluded.updated_at`
    ).bind(key, languageValue, confirmedJson, JSON.stringify(rejectedList),
      candidate ? 1 : 0, rejectedCandidate ? 1 : 0, timestamp).run();
    return true;
  } catch {
    return false;
  }
}
