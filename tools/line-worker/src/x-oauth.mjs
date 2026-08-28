const encoder = new TextEncoder();
const decoder = new TextDecoder();
const OAUTH_COOKIE = 'hoshilu_x_oauth_session';
const REQUIRED_SCOPES = Object.freeze([
  'tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access'
]);
const REFRESH_WINDOW_MS = 10 * 60 * 1000;

const clean = (value, max = 500) => String(value || '')
  .normalize('NFKC')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .trim()
  .slice(0, max);

function base64UrlEncode(value) {
  const bytes = value instanceof Uint8Array ? value : encoder.encode(String(value));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = String(value || '').replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

async function encryptionKey(secret) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptValue(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, await encryptionKey(secret), encoder.encode(value)
  );
  return {
    ciphertext: base64UrlEncode(new Uint8Array(encrypted)),
    iv: base64UrlEncode(iv)
  };
}

async function decryptValue(ciphertext, iv, secret, errorCode) {
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64UrlDecode(iv) },
      await encryptionKey(secret),
      base64UrlDecode(ciphertext)
    );
    return decoder.decode(decrypted);
  } catch {
    throw new Error(errorCode);
  }
}

function config(env = {}) {
  return {
    clientId: clean(env.X_CLIENT_ID, 200),
    clientSecret: String(env.X_CLIENT_SECRET || '').trim(),
    encryptionSecret: String(env.SOCIAL_OAUTH_ENCRYPTION_KEY || '').trim(),
    expectedUsername: clean(env.X_EXPECTED_USERNAME, 80).replace(/^@/, '').toLowerCase()
  };
}

function oauthRedirectUri(request, env) {
  const configured = clean(env.X_OAUTH_REDIRECT_URI, 500);
  return configured || new URL('/api/oauth/x/callback', request.url).toString();
}

function oauthConfigReady(env) {
  const current = config(env);
  return Boolean(
    current.clientId && current.clientSecret && current.encryptionSecret.length >= 32
    && current.expectedUsername && env.PRODUCT_DB
  );
}

function cookieValue(request, name) {
  for (const entry of String(request.headers.get('cookie') || '').split(';')) {
    const [key, ...value] = entry.trim().split('=');
    if (key === name) return value.join('=');
  }
  return '';
}

function secureHeaders(extra = {}) {
  return {
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    ...extra
  };
}

function htmlResponse(title, message, status = 200, extraHeaders = {}) {
  const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:640px;margin:12vh auto;padding:24px;line-height:1.7;color:#15202b}main{border:1px solid #d8dee4;border-radius:16px;padding:28px}h1{font-size:1.35rem}</style><main><h1>${title}</h1><p>${message}</p></main></html>`;
  return new Response(html, {
    status,
    headers: secureHeaders({ 'content-type': 'text/html; charset=utf-8', ...extraHeaders })
  });
}

function storageMissing(error) {
  return /no such table|x_oauth_credentials/i.test(String(error?.message || error));
}

async function credentialRow(env) {
  if (!env.PRODUCT_DB) return null;
  try {
    return await env.PRODUCT_DB.prepare(`SELECT account_id,username,access_token_ciphertext,
      access_token_iv,refresh_token_ciphertext,refresh_token_iv,token_type,scopes,
      expires_at,status,last_refreshed_at FROM x_oauth_credentials
      WHERE platform='X' LIMIT 1`).first();
  } catch (error) {
    if (storageMissing(error)) return null;
    throw error;
  }
}

function scopeSet(value) {
  return new Set(String(value || '').split(/[\s,]+/).map(scope => scope.trim()).filter(Boolean));
}

function requireScopes(value) {
  const scopes = scopeSet(value);
  if (!REQUIRED_SCOPES.every(scope => scopes.has(scope))) {
    throw new Error('X_OAUTH_SCOPE_MISSING');
  }
  return REQUIRED_SCOPES.join(' ');
}

async function saveCredential(env, credential) {
  const current = config(env);
  const now = new Date().toISOString();
  const access = await encryptValue(credential.accessToken, current.encryptionSecret);
  const refresh = await encryptValue(credential.refreshToken, current.encryptionSecret);
  await env.PRODUCT_DB.prepare(`INSERT INTO x_oauth_credentials (
    platform,account_id,username,access_token_ciphertext,access_token_iv,
    refresh_token_ciphertext,refresh_token_iv,token_type,scopes,expires_at,status,
    last_refreshed_at,last_error,created_at,updated_at
  ) VALUES ('X',?1,?2,?3,?4,?5,?6,?7,?8,?9,'ACTIVE',?10,'',?10,?10)
  ON CONFLICT(platform) DO UPDATE SET account_id=excluded.account_id,
    username=excluded.username,access_token_ciphertext=excluded.access_token_ciphertext,
    access_token_iv=excluded.access_token_iv,
    refresh_token_ciphertext=excluded.refresh_token_ciphertext,
    refresh_token_iv=excluded.refresh_token_iv,token_type=excluded.token_type,
    scopes=excluded.scopes,expires_at=excluded.expires_at,status='ACTIVE',
    last_refreshed_at=excluded.last_refreshed_at,last_error='',updated_at=excluded.updated_at`)
    .bind(
      credential.accountId, credential.username, access.ciphertext, access.iv,
      refresh.ciphertext, refresh.iv, clean(credential.tokenType || 'bearer', 40),
      requireScopes(credential.scopes), credential.expiresAt, now
    ).run();
}

function tokenAuthorization(current) {
  const encoded = encoder.encode(`${current.clientId}:${current.clientSecret}`);
  return `Basic ${btoa(String.fromCharCode(...encoded))}`;
}

async function tokenRequest(form, env, fetchImpl, errorCode) {
  const current = config(env);
  const response = await fetchImpl('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    redirect: 'manual',
    headers: {
      authorization: tokenAuthorization(current),
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  });
  if (!response.ok) throw new Error(`${errorCode}_${response.status}`);
  const payload = await response.json();
  const accessToken = String(payload?.access_token || '').trim();
  const expiresIn = Number(payload?.expires_in || 0);
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error(`${errorCode}_INVALID`);
  }
  return { payload, accessToken, expiresIn };
}

async function authenticatedProfile(accessToken, env, fetchImpl) {
  const response = await fetchImpl('https://api.x.com/2/users/me?user.fields=username', {
    redirect: 'manual',
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(`X_OAUTH_PROFILE_${response.status}`);
  const payload = await response.json();
  const accountId = clean(payload?.data?.id, 80);
  const username = clean(payload?.data?.username, 80).replace(/^@/, '');
  if (!accountId || !username || username.toLowerCase() !== config(env).expectedUsername) {
    throw new Error('X_OAUTH_ACCOUNT_MISMATCH');
  }
  return { accountId, username };
}

async function exchangeAuthorizationCode(code, verifier, request, env, fetchImpl) {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: oauthRedirectUri(request, env),
    code_verifier: verifier
  });
  const { payload, accessToken, expiresIn } = await tokenRequest(
    form, env, fetchImpl, 'X_OAUTH_CODE_EXCHANGE'
  );
  const refreshToken = String(payload?.refresh_token || '').trim();
  if (!refreshToken) throw new Error('X_OAUTH_REFRESH_TOKEN_MISSING');
  const scopes = requireScopes(payload?.scope);
  const profile = await authenticatedProfile(accessToken, env, fetchImpl);
  return {
    ...profile,
    accessToken,
    refreshToken,
    tokenType: clean(payload?.token_type || 'bearer', 40),
    scopes,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
  };
}

async function refreshCredential(row, env, fetchImpl) {
  const current = config(env);
  const expiresAt = Date.parse(row.expires_at || '');
  const accessToken = await decryptValue(
    row.access_token_ciphertext, row.access_token_iv, current.encryptionSecret,
    'X_OAUTH_ACCESS_TOKEN_DECRYPT_FAILED'
  );
  if (Number.isFinite(expiresAt) && expiresAt - Date.now() > REFRESH_WINDOW_MS) {
    return {
      accountId: row.account_id,
      username: row.username,
      accessToken,
      scopes: requireScopes(row.scopes)
    };
  }
  const existingRefreshToken = await decryptValue(
    row.refresh_token_ciphertext, row.refresh_token_iv, current.encryptionSecret,
    'X_OAUTH_REFRESH_TOKEN_DECRYPT_FAILED'
  );
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: existingRefreshToken
  });
  const refreshed = await tokenRequest(form, env, fetchImpl, 'X_OAUTH_REFRESH');
  const refreshToken = String(refreshed.payload?.refresh_token || '').trim() || existingRefreshToken;
  const scopes = requireScopes(refreshed.payload?.scope || row.scopes);
  const profile = await authenticatedProfile(refreshed.accessToken, env, fetchImpl);
  if (profile.accountId !== row.account_id) throw new Error('X_OAUTH_ACCOUNT_MISMATCH');
  await saveCredential(env, {
    ...profile,
    accessToken: refreshed.accessToken,
    refreshToken,
    tokenType: refreshed.payload?.token_type || row.token_type || 'bearer',
    scopes,
    expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()
  });
  return { ...profile, accessToken: refreshed.accessToken, scopes };
}

export async function getXPublishCredentials(env, fetchImpl = fetch) {
  if (!oauthConfigReady(env)) throw new Error('SOCIAL_X_OAUTH_NOT_CONFIGURED');
  const row = await credentialRow(env);
  if (!row || row.status !== 'ACTIVE') throw new Error('SOCIAL_X_OAUTH_NOT_CONNECTED');
  if (String(row.username || '').toLowerCase() !== config(env).expectedUsername) {
    throw new Error('X_OAUTH_ACCOUNT_MISMATCH');
  }
  return refreshCredential(row, env, fetchImpl);
}

export async function xOAuthReadiness(env) {
  const configured = oauthConfigReady(env);
  let connected = false;
  if (configured) {
    try {
      const row = await credentialRow(env);
      connected = Boolean(
        row?.status === 'ACTIVE'
        && String(row.username || '').toLowerCase() === config(env).expectedUsername
        && row.refresh_token_ciphertext && row.refresh_token_iv
        && REQUIRED_SCOPES.every(scope => scopeSet(row.scopes).has(scope))
      );
    } catch {
      connected = false;
    }
  }
  return { configured, connected };
}

async function handleStart(request, env) {
  if (!oauthConfigReady(env)) {
    return Response.json({ ok: false, error: 'X_OAUTH_NOT_CONFIGURED' }, {
      status: 503, headers: secureHeaders()
    });
  }
  const random = crypto.getRandomValues(new Uint8Array(64));
  const verifier = base64UrlEncode(random);
  const challenge = base64UrlEncode(new Uint8Array(
    await crypto.subtle.digest('SHA-256', encoder.encode(verifier))
  ));
  const state = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll('-', '')}`;
  const session = await encryptValue(JSON.stringify({
    state, verifier, exp: Math.floor(Date.now() / 1000) + 600
  }), config(env).encryptionSecret);
  const authorize = new URL('https://x.com/i/oauth2/authorize');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', config(env).clientId);
  authorize.searchParams.set('redirect_uri', oauthRedirectUri(request, env));
  authorize.searchParams.set('scope', REQUIRED_SCOPES.join(' '));
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 'S256');
  return new Response(null, {
    status: 302,
    headers: secureHeaders({
      location: authorize.toString(),
      'set-cookie': `${OAUTH_COOKIE}=${session.iv}.${session.ciphertext}; Max-Age=600; Path=/api/oauth/x/callback; Secure; HttpOnly; SameSite=Lax`
    })
  });
}

async function handleCallback(request, env, fetchImpl) {
  if (!oauthConfigReady(env)) {
    return htmlResponse('X接続エラー', '接続設定がまだ完了していません。', 503);
  }
  const url = new URL(request.url);
  const code = clean(url.searchParams.get('code'), 2000);
  const state = clean(url.searchParams.get('state'), 500);
  const sessionCookie = cookieValue(request, OAUTH_COOKIE);
  try {
    const [iv, ciphertext, extra] = sessionCookie.split('.');
    if (!code || !state || !iv || !ciphertext || extra) throw new Error('X_OAUTH_STATE_INVALID');
    const session = JSON.parse(await decryptValue(
      ciphertext, iv, config(env).encryptionSecret, 'X_OAUTH_STATE_INVALID'
    ));
    if (session?.state !== state || !session?.verifier
      || Number(session.exp || 0) < Math.floor(Date.now() / 1000)) {
      throw new Error('X_OAUTH_STATE_INVALID');
    }
    const credential = await exchangeAuthorizationCode(
      code, session.verifier, request, env, fetchImpl
    );
    await saveCredential(env, credential);
    return htmlResponse(
      'X接続完了',
      `HOSHILU公式X（@${credential.username}）との接続を安全に保存しました。この画面は閉じて構いません。`,
      200,
      { 'set-cookie': `${OAUTH_COOKIE}=; Max-Age=0; Path=/api/oauth/x/callback; Secure; HttpOnly; SameSite=Lax` }
    );
  } catch (error) {
    const rawCode = clean(error?.message || error, 120);
    const codeValue = /^X_OAUTH_[A-Z0-9_]+$/.test(rawCode)
      ? rawCode
      : /^X_OAUTH_[A-Z0-9_]+_[0-9]{3}$/.test(rawCode)
        ? rawCode
        : 'X_OAUTH_FAILED';
    const status = codeValue === 'X_OAUTH_ACCOUNT_MISMATCH'
      ? 403
      : codeValue === 'X_OAUTH_STATE_INVALID'
        ? 400
        : 502;
    return htmlResponse('X接続エラー', `接続を完了できませんでした。（${codeValue}）`, status, {
      'set-cookie': `${OAUTH_COOKIE}=; Max-Age=0; Path=/api/oauth/x/callback; Secure; HttpOnly; SameSite=Lax`
    });
  }
}

export async function handleXOAuthRoutes(request, env, fetchImpl = fetch) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/api/oauth/x/')) return null;
  if (request.method === 'GET' && path === '/api/oauth/x/start') return handleStart(request, env);
  if (request.method === 'GET' && path === '/api/oauth/x/callback') {
    return handleCallback(request, env, fetchImpl);
  }
  return Response.json({ ok: false, error: 'NOT_FOUND' }, {
    status: 404, headers: secureHeaders()
  });
}

export const X_OAUTH_REQUIRED_SCOPES = REQUIRED_SCOPES;
