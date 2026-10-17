// 2026-10-17 大隆さん「スレッズはどうすればいいの？」→「おけ、続けて」:
// Threads の長期アクセストークンは 60 日で切れる（8 月に入れた物が 10/16 に切れ、投稿が THREADS_CREATE_401 で止まった）。
// 期限内のトークンは GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token で延長でき、
// 延長するとまた 60 日になる（作ってから 24 時間以上たった物だけ。切れた物は延長できない）。
// - 種: 大隆さんが入れた Worker secret（THREADS_ACCESS_TOKEN）。secret が入れ替わったら（指紋が違えば）新しい方を種にし直す。
// - 3 日ごとに延長し、延長後のトークンを D1（threads_token_store）に暗号化して置く（鍵は Instagram と同じ SOCIAL_OAUTH_ENCRYPTION_KEY）。
// - 延長に失敗したら 6 時間は再試行しない（API を叩き続けない）。失敗しても手元の有効なトークンで投稿は続ける。
// - 表・暗号鍵が無いときは、これまでどおり secret をそのまま使う（止めない）。
const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const THREADS_REFRESH_EVERY_MS = 3 * 24 * 60 * 60 * 1000;
export const THREADS_RETRY_AFTER_MS = 6 * 60 * 60 * 1000;
const REFRESH_URL = 'https://graph.threads.net/refresh_access_token';

const b64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
const unb64 = (value) => {
  const text = String(value || '').replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = text + '='.repeat((4 - (text.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};
async function aesKey(secret) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function encrypt(token, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), encoder.encode(token));
  return { ciphertext: b64(new Uint8Array(data)), iv: b64(iv) };
}
async function decrypt(ciphertext, iv, secret) {
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(secret), unb64(ciphertext));
  return decoder.decode(data);
}
export async function tokenFingerprint(token) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`threads:${token}`)));
  return [...digest].slice(0, 16).map((n) => n.toString(16).padStart(2, '0')).join('');
}

async function readRow(db) {
  try {
    return await db.prepare(`SELECT access_token_ciphertext,access_token_iv,seed_fingerprint,expires_at,last_refreshed_at,last_error,updated_at
      FROM threads_token_store WHERE platform='THREADS' LIMIT 1`).first();
  } catch (error) {
    if (/no such table|threads_token_store/iu.test(String(error?.message || error))) return undefined; // 表がまだ無い
    throw error;
  }
}

async function saveRow(db, secret, { token, fingerprint, expiresAt = '', refreshedAt }) {
  const sealed = await encrypt(token, secret);
  await db.prepare(`INSERT INTO threads_token_store
      (platform,access_token_ciphertext,access_token_iv,seed_fingerprint,expires_at,last_refreshed_at,last_error,created_at,updated_at)
      VALUES ('THREADS',?1,?2,?3,?4,?5,'',?5,?5)
      ON CONFLICT(platform) DO UPDATE SET access_token_ciphertext=excluded.access_token_ciphertext,access_token_iv=excluded.access_token_iv,
        seed_fingerprint=excluded.seed_fingerprint,expires_at=excluded.expires_at,last_refreshed_at=excluded.last_refreshed_at,
        last_error='',updated_at=excluded.updated_at`)
    .bind(sealed.ciphertext, sealed.iv, fingerprint, expiresAt, refreshedAt).run();
}

// 投稿・削除・インサイト取得で使う Threads のトークンを返す。{ token, source, expires_at?, refreshed?, error? }
export async function resolveThreadsToken(env = {}, { fetchImpl = fetch, now = new Date() } = {}) {
  const secretToken = String(env.THREADS_ACCESS_TOKEN || '').trim();
  const key = String(env.SOCIAL_OAUTH_ENCRYPTION_KEY || '').trim();
  if (!secretToken) return { token: '', source: 'none' };
  if (!env.PRODUCT_DB || key.length < 32 || env.THREADS_TOKEN_REFRESH_ENABLED === 'false') return { token: secretToken, source: 'secret' };
  const db = env.PRODUCT_DB;
  const at = now.toISOString();
  const fingerprint = await tokenFingerprint(secretToken);
  const row = await readRow(db);
  if (row === undefined) return { token: secretToken, source: 'secret', reason: 'no_table' };
  // secret が入れ替わった（大隆さんが入れ直した）ら、新しい方を種にする。延長は 24 時間以上たってから（3 日後）
  if (!row || row.seed_fingerprint !== fingerprint) {
    await saveRow(db, key, { token: secretToken, fingerprint, refreshedAt: at });
    return { token: secretToken, source: 'secret_seeded' };
  }
  let token;
  try {
    token = await decrypt(row.access_token_ciphertext, row.access_token_iv, key);
  } catch {
    // 鍵が変わった等で読めない時は secret から種にし直す
    await saveRow(db, key, { token: secretToken, fingerprint, refreshedAt: at });
    return { token: secretToken, source: 'secret_reseeded' };
  }
  const sinceRefresh = now.getTime() - Date.parse(row.last_refreshed_at || '');
  const sinceAttempt = now.getTime() - Date.parse(row.updated_at || '');
  const recentlyFailed = row.last_error && sinceAttempt < THREADS_RETRY_AFTER_MS;
  if (!(sinceRefresh >= THREADS_REFRESH_EVERY_MS) || recentlyFailed) {
    return { token, source: 'stored', expires_at: row.expires_at || '' };
  }
  const url = new URL(REFRESH_URL);
  url.searchParams.set('grant_type', 'th_refresh_token');
  url.searchParams.set('access_token', token);
  let payload = null;
  let failure = '';
  try {
    const response = await fetchImpl(url.toString(), { redirect: 'manual' });
    if (response.ok) payload = await response.json();
    else failure = `THREADS_REFRESH_${response.status}`;
  } catch (error) {
    failure = `THREADS_REFRESH_FETCH_${String(error?.name || 'ERROR').slice(0, 30)}`;
  }
  const refreshed = String(payload?.access_token || '').trim();
  const expiresIn = Number(payload?.expires_in || 0);
  if (!failure && refreshed && Number.isFinite(expiresIn) && expiresIn > 0) {
    const expiresAt = new Date(now.getTime() + expiresIn * 1000).toISOString();
    await saveRow(db, key, { token: refreshed, fingerprint, expiresAt, refreshedAt: at });
    return { token: refreshed, source: 'refreshed', expires_at: expiresAt, refreshed: true };
  }
  const error = failure || 'THREADS_REFRESH_INVALID';
  await db.prepare(`UPDATE threads_token_store SET last_error=?1,updated_at=?2 WHERE platform='THREADS'`).bind(error, at).run();
  return { token, source: 'stored', expires_at: row.expires_at || '', error };
}

// 投稿・削除・インサイト取得の入口で使う。同じ env では 10 分に 1 回だけ調べる（cron 1 周で 3 回呼ばれても D1 を読み直さない。
// Workers の env は同じ isolate の間ずっと同じ物なので、期限を付けて古い答えを使い続けない）。
// どんな失敗でも secret のまま続ける（投稿全体を止めない）。
const resolved = new WeakMap();
export const THREADS_RESOLVE_CACHE_MS = 10 * 60 * 1000;
export async function withThreadsToken(env, { fetchImpl = fetch, now = new Date() } = {}) {
  if (!env || typeof env !== 'object' || !String(env.THREADS_ACCESS_TOKEN || '').trim()) return env;
  const cached = resolved.get(env);
  if (!cached || Math.abs(now.getTime() - cached.at) >= THREADS_RESOLVE_CACHE_MS) {
    resolved.set(env, { at: now.getTime(), promise: resolveThreadsToken(env, { fetchImpl, now }).catch((error) => ({
      token: String(env.THREADS_ACCESS_TOKEN || '').trim(), source: 'secret', error: String(error?.message || error).slice(0, 80)
    })) });
  }
  const result = await resolved.get(env).promise;
  return result.token && result.token !== env.THREADS_ACCESS_TOKEN ? { ...env, THREADS_ACCESS_TOKEN: result.token } : env;
}
