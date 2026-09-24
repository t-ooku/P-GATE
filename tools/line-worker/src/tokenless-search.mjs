// 2026-09-24 大隆さん決定「ボット確認が通らない時は、上限付きで確認なしで検索させる」。
//
// 事実（D1 growth_events、直近14日・QA除く）:
//   Threads から来た 89人のうち、検索に成功したのは 0人。
//   検索が始まった 7人は 7人とも縮退し、縮退の理由は 100% TURNSTILE_TOKEN_UNAVAILABLE だった
//   （Threads / Instagram のアプリ内ブラウザで Cloudflare Turnstile のトークンが出ない）。
//   Threads はいま一番人が来ている入口なので、来た人がそこで全員止まっていた。
//
// そこで、公開のテキスト検索（/api/knowledge、写真・投稿URLなし）に限り、トークンが無くても
// 次の上限の中でだけ通す。上限を超えたら従来どおりトークンを要求する。
//   ・同じ接続元（IP）は 1時間に 3回まで
//   ・全体で 1日（JST）100回まで（環境変数 TOKENLESS_SEARCH_DAILY_LIMIT で変えられる、最大500）
//   ・TOKENLESS_SEARCH_ENABLED=false で止められる
// 費用がかかるのは検索のうち Gemini の呼び出しだけで、上限がそのまま最悪の場合の天井になる。
//
// 数えるために growth_events に 1件ずつ残す（event_type='search_tokenless_allowed'）。
// IP はそのまま持たない。日ごとに変わる鍵（日付＋Turnstile の秘密鍵）で混ぜたハッシュの
// 先頭16桁だけを残す。翌日には別の値になるので、日をまたいで人を追えない。
// 検索文も会員IDも残さない。

export const TOKENLESS_DAILY_LIMIT_DEFAULT = 100;
export const TOKENLESS_DAILY_LIMIT_MAX = 500;
export const TOKENLESS_PER_IP_HOURLY = 3;
export const TOKENLESS_EVENT_TYPE = 'search_tokenless_allowed';
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const toHex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

export function tokenlessDailyLimit(env = {}) {
  const value = Math.trunc(Number(env.TOKENLESS_SEARCH_DAILY_LIMIT));
  if (!Number.isFinite(value) || value <= 0) return TOKENLESS_DAILY_LIMIT_DEFAULT;
  return Math.min(TOKENLESS_DAILY_LIMIT_MAX, value);
}

export function tokenlessSearchEnabled(env = {}) {
  return !['false', '0', 'off', 'no'].includes(String(env.TOKENLESS_SEARCH_ENABLED ?? 'true').trim().toLowerCase());
}

// IPv6 は1台で /64 ぶんの住所を持てるので、上位64ビットでまとめて数える（IP を替えて回数を稼げない）。
export function tokenlessClientAddress(ip) {
  const value = String(ip || '').trim().toLowerCase();
  if (!value.includes(':')) return value;
  // ::ffff:1.2.3.4 のような IPv4 の書き換え形は、中の IPv4 で数える（全員が同じ枠にならないように）
  const mapped = value.match(/(\d{1,3}(?:\.\d{1,3}){3})$/u);
  if (mapped) return mapped[1];
  const [head, tail = ''] = value.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = value.includes('::') && tail ? tail.split(':') : [];
  const missing = Math.max(0, 8 - headParts.length - tailParts.length);
  const full = value.includes('::') ? [...headParts, ...Array(missing).fill('0'), ...tailParts] : headParts;
  return `${full.slice(0, 4).map((part) => (part || '0').replace(/^0+(?=.)/u, '')).join(':')}::/64`;
}

export function jstDayStart(now) {
  const shifted = new Date(now.getTime() + JST_OFFSET_MS);
  const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - JST_OFFSET_MS;
  return new Date(start);
}

export async function tokenlessClientKey(ip, env = {}, now = new Date()) {
  const day = jstDayStart(now).toISOString().slice(0, 10);
  const source = new TextEncoder().encode(`${day}|${tokenlessClientAddress(ip)}|${String(env.TURNSTILE_SECRET_KEY || '')}`);
  return `ip:${toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', source))).slice(0, 16)}`;
}

// 通せるなら記録して true を返す。通せないときは理由のコードを投げる（呼び出し側は 429 を返し、
// 画面は「セキュリティ確認を完了してください」を出す）。
// 同時に何件来ても上限を超えないよう、数えるのと書くのを1つの INSERT … SELECT … WHERE で行い、
// 実際に1行入ったときだけ通す。D1 の失敗も 429（UNAVAILABLE）にして、画面が再試行しないようにする。
export async function admitTokenlessSearch(env, request, now = new Date()) {
  if (!tokenlessSearchEnabled(env)) throw new Error('TURNSTILE_TOKENLESS_DISABLED');
  if (!env?.PRODUCT_DB) throw new Error('TURNSTILE_TOKENLESS_UNAVAILABLE');
  const ip = String(request?.headers?.get?.('cf-connecting-ip') || '').trim();
  if (!ip) throw new Error('TURNSTILE_TOKENLESS_UNAVAILABLE');
  const key = await tokenlessClientKey(ip, env, now);
  const dayStart = jstDayStart(now).toISOString();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const limit = tokenlessDailyLimit(env);
  let result;
  try {
    result = await env.PRODUCT_DB.prepare(
      `INSERT INTO growth_events
       (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class)
       SELECT ?1,?2,'JA','server','tokenless','',?3,'',?4,'UNATTRIBUTED'
       WHERE (SELECT COUNT(*) FROM growth_events WHERE event_type=?2 AND occurred_at>=?5) < ?7
         AND (SELECT COUNT(*) FROM growth_events WHERE event_type=?2 AND occurred_at>=?6 AND content=?3) < ?8`
    ).bind(crypto.randomUUID(), TOKENLESS_EVENT_TYPE, key, now.toISOString(), dayStart, hourAgo, limit, TOKENLESS_PER_IP_HOURLY).run();
  } catch {
    throw new Error('TURNSTILE_TOKENLESS_UNAVAILABLE');
  }
  if (Number(result?.meta?.changes ?? 0) === 1) return true;
  // 入らなかった理由を見分ける（表示は同じ。運用で数字を見るときのため）。
  let row = null;
  try {
    row = await env.PRODUCT_DB.prepare(
      `SELECT COUNT(*) AS today FROM growth_events WHERE event_type=?1 AND occurred_at>=?2`
    ).bind(TOKENLESS_EVENT_TYPE, dayStart).first();
  } catch { /* 理由が分からなくても止めることに変わりはない */ }
  if (Number(row?.today || 0) >= limit) throw new Error('TURNSTILE_TOKENLESS_DAILY_LIMIT');
  throw new Error('TURNSTILE_TOKENLESS_RATE_LIMITED');
}
