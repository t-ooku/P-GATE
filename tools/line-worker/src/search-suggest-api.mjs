// 2026-09-06 大隆さん指摘: 「検索窓に入力した際に、連想や関連するセカンドワードが候補に
// 上がってこない。Amazonと同等レベルに仕上げて」。
//
// これまでの候補は、手書きの辞書（public/search-suggest-data.mjs）だけで作っていた。
// 辞書に無いジャンルを打つと「安い」「人気」のような当たり障りのない語しか出ず、
// 在庫に無い組み合わせも出ていた。
//
// ここでは **実際のデータ** から候補を作る。
//   (1) 商品名（fts5 product_search）: 入力語で引いた商品名に一緒に出てくる語を数え、
//       多い順に「入力語 + その語」を返す。在庫にある組み合わせしか出ない。
//   (2) 教師データ（teacher_queries）: 実際に使われた検索文の続きを返す。
// どちらも取れなければ空を返し、画面側は従来どおり辞書の候補を出す（劣化させない）。
//
// 保存はしない。返すのは検索語だけで、会員IDもセッションIDも扱わない。
import { shopKeywordTokens } from './shop-facets.mjs';

export const SUGGEST_LIMIT = 10;
export const SUGGEST_TITLE_SAMPLE = 120;
const CACHE_TTL_MS = 300000;
const CACHE_MAX = 300;
const cache = new Map(); // `${language}|${query}` -> { at, suggestions }

export function normalizeSuggestQuery(value) {
  return String(value || '').normalize('NFKC').replace(/[\s　]+/gu, ' ').trim().slice(0, 60);
}

// fts5 に渡す安全な MATCH 文字列（記号は落とし、前方一致にする）。
export function suggestMatchExpression(query) {
  const words = normalizeSuggestQuery(query)
    .split(' ')
    .map((word) => word.replace(/["'*(){}:^-]/gu, '').trim())
    .filter((word) => word.length >= 1)
    .slice(0, 4);
  if (!words.length) return '';
  return words.map((word) => `"${word}"*`).join(' AND ');
}

// 商品名から「入力語と一緒に出てくる語」を数える。
// 在庫の商品名は型番や梱包の言葉だらけなので、条件を厳しくして「探す言葉」だけ残す。
//   - 同じ語が3件以上、かつ調べた商品名の15%以上に出ていること
//   - 型番・売り文句（並行輸入品、正規品…）は捨てる
export const RELATED_MIN_COUNT = 3;
export const RELATED_MIN_RATIO = 0.15;
const RELATED_STOPWORDS = new Set([
  '並行輸入品', '並行輸入', '正規品', '新品', '送料無料', '国内正規品', 'メーカー', '純正',
  '在庫', 'ポイント', '限定', '対応', '交換用', '互換', 'セット内容', 'ブランド', '商品',
  'Amazon', 'amazon', 'Model', 'Series', 'Pack', 'New', 'Type'
]);
// 型番らしい語（英字と数字が混ざる／英大文字だけ）は探す言葉にならない。
function looksLikeModelCode(token) {
  if (/^[A-Za-z][A-Za-z0-9-]*$/u.test(token)) return /\d/u.test(token) || /^[A-Z0-9-]+$/u.test(token);
  return false;
}

export function relatedWordsFromTitles(titles = [], query = '', limit = SUGGEST_LIMIT) {
  const asked = new Set(normalizeSuggestQuery(query).toLowerCase().split(' ').filter(Boolean));
  const sample = titles.filter(Boolean).length;
  if (!sample) return [];
  const counts = new Map();
  for (const title of titles) {
    for (const token of new Set(shopKeywordTokens(title))) {
      const lower = token.toLowerCase();
      if (asked.has(lower) || RELATED_STOPWORDS.has(token) || looksLikeModelCode(token)) continue;
      // 入力語そのものを含む語（「水筒カバー」など）は、二重に見えるので出さない。
      if ([...asked].some((word) => word && (lower.includes(word) || word.includes(lower)))) continue;
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  const floor = Math.max(RELATED_MIN_COUNT, Math.ceil(sample * RELATED_MIN_RATIO));
  return [...counts.entries()]
    .filter(([, count]) => count >= floor)
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'ja'))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

async function titlesFor(env, query) {
  const match = suggestMatchExpression(query);
  if (!match) return [];
  const rows = await env.PRODUCT_DB.prepare(
    `SELECT product_name FROM product_search WHERE product_search MATCH ?1 LIMIT ?2`
  ).bind(match, SUGGEST_TITLE_SAMPLE).all();
  return (rows.results || []).map((row) => String(row.product_name || '')).filter(Boolean);
}

async function curatedQueries(env, query) {
  const normalized = normalizeSuggestQuery(query);
  if (!normalized) return [];
  try {
    const rows = await env.PRODUCT_DB.prepare(
      `SELECT query_text FROM teacher_queries WHERE status='ACTIVE' AND query_text LIKE ?1 AND query_text<>?2 LIMIT 5`
    ).bind(`${normalized}%`, normalized).all();
    return (rows.results || []).map((row) => String(row.query_text || '').trim()).filter(Boolean);
  } catch {
    // 教師データのテーブルが無い環境でも、商品名からの候補だけで動く。
    return [];
  }
}

export async function suggestFromData(env, query, { language = 'JA', now = Date.now() } = {}) {
  const normalized = normalizeSuggestQuery(query);
  if (!env?.PRODUCT_DB || normalized.length < 1) return [];
  const key = `${language}|${normalized.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.suggestions;
  let suggestions = [];
  try {
    const [titles, curated] = await Promise.all([titlesFor(env, normalized), curatedQueries(env, normalized)]);
    const seen = new Set([normalized.toLowerCase()]);
    const push = (text, kind) => {
      const value = normalizeSuggestQuery(text);
      if (!value || seen.has(value.toLowerCase()) || value.length > 80) return;
      seen.add(value.toLowerCase());
      suggestions.push({ query: value, kind });
    };
    // 実データ由来の語は多くても4つ。残りは画面側の辞書候補に譲る。
    for (const word of relatedWordsFromTitles(titles, normalized, 4)) push(`${normalized} ${word.word}`, 'related');
    for (const text of curated) push(text, 'related');
    suggestions = suggestions.slice(0, SUGGEST_LIMIT);
  } catch {
    suggestions = [];
  }
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, { at: now, suggestions });
  return suggestions;
}

export async function handleSearchSuggestRoute(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/search/suggest') return null;
  if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
  const query = normalizeSuggestQuery(url.searchParams.get('q'));
  const language = ['JA', 'EN', 'ZH', 'KO'].includes(String(url.searchParams.get('language') || '').toUpperCase())
    ? String(url.searchParams.get('language')).toUpperCase() : 'JA';
  const suggestions = query ? await suggestFromData(env, query, { language }) : [];
  return Response.json({ ok: true, suggestions }, {
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}
