const encoder = new TextEncoder();
const decoder = new TextDecoder();
const OAUTH_COOKIE = 'hoshilu_ig_oauth_state';
const REQUIRED_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'];
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

async function signPayload(payload, secret) {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(encoded));
  return `${encoded}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function verifyPayload(token, secret) {
  const [encoded, signature, extra] = String(token || '').split('.');
  if (!encoded || !signature || extra) throw new Error('INSTAGRAM_OAUTH_STATE_INVALID');
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      'HMAC', await hmacKey(secret), base64UrlDecode(signature), encoder.encode(encoded)
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new Error('INSTAGRAM_OAUTH_STATE_INVALID');
  try {
    return JSON.parse(decoder.decode(base64UrlDecode(encoded)));
  } catch {
    throw new Error('INSTAGRAM_OAUTH_STATE_INVALID');
  }
}

async function encryptionKey(secret) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptToken(token, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, await encryptionKey(secret), encoder.encode(token)
  );
  return {
    ciphertext: base64UrlEncode(new Uint8Array(encrypted)),
    iv: base64UrlEncode(iv)
  };
}

async function decryptToken(ciphertext, iv, secret) {
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64UrlDecode(iv) },
      await encryptionKey(secret),
      base64UrlDecode(ciphertext)
    );
    return decoder.decode(decrypted);
  } catch {
    throw new Error('INSTAGRAM_OAUTH_TOKEN_DECRYPT_FAILED');
  }
}

function config(env = {}) {
  return {
    appId: clean(env.INSTAGRAM_APP_ID, 80),
    appSecret: String(env.INSTAGRAM_APP_SECRET || '').trim(),
    encryptionSecret: String(env.SOCIAL_OAUTH_ENCRYPTION_KEY || '').trim(),
    expectedAccountId: clean(env.INSTAGRAM_ACCOUNT_ID, 80),
    expectedUsername: clean(env.INSTAGRAM_EXPECTED_USERNAME, 80).replace(/^@/, '').toLowerCase()
  };
}

function oauthRedirectUri(request, env) {
  const configured = clean(env.INSTAGRAM_OAUTH_REDIRECT_URI, 500);
  return configured || new URL('/api/oauth/instagram/callback', request.url).toString();
}

function oauthConfigReady(env) {
  const current = config(env);
  return Boolean(
    current.appId && current.appSecret && current.encryptionSecret.length >= 32
    && current.expectedUsername && env.PRODUCT_DB
  );
}

function cookieValue(request, name) {
  const source = request.headers.get('cookie') || '';
  for (const entry of source.split(';')) {
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
  return /no such table|instagram_oauth_credentials/i.test(String(error?.message || error));
}

async function credentialRow(env) {
  if (!env.PRODUCT_DB) return null;
  try {
    return await env.PRODUCT_DB.prepare(`SELECT account_id,access_token_ciphertext,access_token_iv,
      scopes,expires_at,status,last_refreshed_at FROM instagram_oauth_credentials
      WHERE platform='INSTAGRAM' LIMIT 1`).first();
  } catch (error) {
    if (storageMissing(error)) return null;
    throw error;
  }
}

async function saveCredential(env, credential) {
  const now = new Date().toISOString();
  const encrypted = await encryptToken(credential.accessToken, config(env).encryptionSecret);
  await env.PRODUCT_DB.prepare(`INSERT INTO instagram_oauth_credentials (
    platform,account_id,access_token_ciphertext,access_token_iv,token_type,scopes,
    expires_at,status,last_refreshed_at,last_error,created_at,updated_at
  ) VALUES ('INSTAGRAM',?1,?2,?3,?4,?5,?6,'ACTIVE',?7,'',?7,?7)
  ON CONFLICT(platform) DO UPDATE SET account_id=excluded.account_id,
    access_token_ciphertext=excluded.access_token_ciphertext,
    access_token_iv=excluded.access_token_iv,token_type=excluded.token_type,
    scopes=excluded.scopes,expires_at=excluded.expires_at,status='ACTIVE',
    last_refreshed_at=excluded.last_refreshed_at,last_error='',updated_at=excluded.updated_at`)
    .bind(
      credential.accountId,
      encrypted.ciphertext,
      encrypted.iv,
      clean(credential.tokenType || 'bearer', 40),
      clean(credential.scopes || REQUIRED_SCOPES.join(','), 500),
      credential.expiresAt,
      now
    ).run();
}

async function removeCredential(env, accountId) {
  if (!env.PRODUCT_DB) return;
  try {
    await env.PRODUCT_DB.prepare(`DELETE FROM instagram_oauth_credentials
      WHERE platform='INSTAGRAM' AND account_id=?1`).bind(clean(accountId, 80)).run();
  } catch (error) {
    if (!storageMissing(error)) throw error;
  }
}

async function exchangeAuthorizationCode(code, request, env, fetchImpl) {
  const current = config(env);
  const form = new URLSearchParams({
    client_id: current.appId,
    client_secret: current.appSecret,
    grant_type: 'authorization_code',
    redirect_uri: oauthRedirectUri(request, env),
    code
  });
  const shortResponse = await fetchImpl('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });
  if (!shortResponse.ok) throw new Error(`INSTAGRAM_OAUTH_CODE_EXCHANGE_${shortResponse.status}`);
  const short = await shortResponse.json();
  const oauthAccountId = clean(short?.user_id, 80);
  const shortToken = String(short?.access_token || '').trim();
  if (!oauthAccountId || !shortToken) throw new Error('INSTAGRAM_OAUTH_CODE_EXCHANGE_INVALID');

  const profileUrl = new URL('https://graph.instagram.com/me');
  profileUrl.searchParams.set('fields', 'user_id,username');
  profileUrl.searchParams.set('access_token', shortToken);
  const profileResponse = await fetchImpl(profileUrl.toString(), { redirect: 'manual' });
  if (!profileResponse.ok) throw new Error(`INSTAGRAM_OAUTH_PROFILE_${profileResponse.status}`);
  const profile = await profileResponse.json();
  const profileAccountId = clean(profile?.user_id || profile?.id, 80);
  const profileUsername = clean(profile?.username, 80).replace(/^@/, '').toLowerCase();
  if (!profileAccountId || profileUsername !== current.expectedUsername) {
    throw new Error('INSTAGRAM_OAUTH_ACCOUNT_MISMATCH');
  }

  const longUrl = new URL('https://graph.instagram.com/access_token');
  longUrl.searchParams.set('grant_type', 'ig_exchange_token');
  longUrl.searchParams.set('client_secret', current.appSecret);
  longUrl.searchParams.set('access_token', shortToken);
  const longResponse = await fetchImpl(longUrl.toString(), { redirect: 'manual' });
  if (!longResponse.ok) throw new Error(`INSTAGRAM_OAUTH_LONG_TOKEN_${longResponse.status}`);
  const long = await longResponse.json();
  const accessToken = String(long?.access_token || '').trim();
  const expiresIn = Number(long?.expires_in || 0);
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('INSTAGRAM_OAUTH_LONG_TOKEN_INVALID');
  }
  return {
    accountId: profileAccountId,
    accessToken,
    tokenType: clean(long?.token_type || 'bearer', 40),
    scopes: Array.isArray(short?.permissions) ? short.permissions.join(',') : REQUIRED_SCOPES.join(','),
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
  };
}

async function refreshCredential(row, env, fetchImpl) {
  const current = config(env);
  const accessToken = await decryptToken(
    row.access_token_ciphertext, row.access_token_iv, current.encryptionSecret
  );
  const expiresAt = Date.parse(row.expires_at || '');
  if (Number.isFinite(expiresAt) && expiresAt - Date.now() > REFRESH_WINDOW_MS) {
    return { accountId: row.account_id, accessToken };
  }
  const refreshUrl = new URL('https://graph.instagram.com/refresh_access_token');
  refreshUrl.searchParams.set('grant_type', 'ig_refresh_token');
  refreshUrl.searchParams.set('access_token', accessToken);
  const response = await fetchImpl(refreshUrl.toString(), { redirect: 'manual' });
  if (!response.ok) {
    if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
      return { accountId: row.account_id, accessToken };
    }
    throw new Error(`INSTAGRAM_OAUTH_REFRESH_${response.status}`);
  }
  const payload = await response.json();
  const refreshedToken = String(payload?.access_token || '').trim();
  const expiresIn = Number(payload?.expires_in || 0);
  if (!refreshedToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('INSTAGRAM_OAUTH_REFRESH_INVALID');
  }
  await saveCredential(env, {
    accountId: row.account_id,
    accessToken: refreshedToken,
    tokenType: payload?.token_type || 'bearer',
    scopes: row.scopes,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
  });
  return { accountId: row.account_id, accessToken: refreshedToken };
}

export async function getInstagramPublishCredentials(env, fetchImpl = fetch) {
  const staticToken = String(env.INSTAGRAM_ACCESS_TOKEN || '').trim();
  const staticAccount = clean(env.INSTAGRAM_ACCOUNT_ID, 80);
  const current = config(env);
  if (env.PRODUCT_DB && current.encryptionSecret.length >= 32) {
    try {
      const row = await credentialRow(env);
      if (row?.status === 'ACTIVE') {
        return await refreshCredential(row, env, fetchImpl);
      }
    } catch (error) {
      if (!staticToken || !staticAccount) throw error;
    }
  }
  if (staticToken && staticAccount) return { accountId: staticAccount, accessToken: staticToken };
  throw new Error('SOCIAL_INSTAGRAM_NOT_CONFIGURED');
}

export async function instagramOAuthReadiness(env) {
  const configured = oauthConfigReady(env);
  let connected = false;
  if (configured) {
    try {
      const row = await credentialRow(env);
      connected = Boolean(
        row?.status === 'ACTIVE' && Number.isFinite(Date.parse(row.expires_at))
        && Date.parse(row.expires_at) > Date.now()
      );
    } catch {
      connected = false;
    }
  }
  return { configured, connected };
}

async function signedRequestPayload(request, env) {
  const form = await request.formData();
  const signedRequest = String(form.get('signed_request') || '');
  const [signature, encodedPayload, extra] = signedRequest.split('.');
  if (!signature || !encodedPayload || extra) throw new Error('INSTAGRAM_SIGNED_REQUEST_INVALID');
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      'HMAC', await hmacKey(config(env).appSecret),
      base64UrlDecode(signature), encoder.encode(encodedPayload)
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new Error('INSTAGRAM_SIGNED_REQUEST_INVALID');
  try {
    return JSON.parse(decoder.decode(base64UrlDecode(encodedPayload)));
  } catch {
    throw new Error('INSTAGRAM_SIGNED_REQUEST_INVALID');
  }
}

async function handleStart(request, env) {
  if (!oauthConfigReady(env)) {
    return Response.json({ ok: false, error: 'INSTAGRAM_OAUTH_NOT_CONFIGURED' }, {
      status: 503, headers: secureHeaders()
    });
  }
  const nonce = crypto.randomUUID();
  const state = await signPayload({ nonce, exp: Math.floor(Date.now() / 1000) + 600 }, config(env).appSecret);
  const authorize = new URL('https://www.instagram.com/oauth/authorize');
  authorize.searchParams.set('force_reauth', 'true');
  authorize.searchParams.set('client_id', config(env).appId);
  authorize.searchParams.set('redirect_uri', oauthRedirectUri(request, env));
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', REQUIRED_SCOPES.join(','));
  authorize.searchParams.set('state', state);
  return new Response(null, {
    status: 302,
    headers: secureHeaders({
      location: authorize.toString(),
      'set-cookie': `${OAUTH_COOKIE}=${state}; Max-Age=600; Path=/api/oauth/instagram/callback; Secure; HttpOnly; SameSite=Lax`
    })
  });
}

async function handleCallback(request, env, fetchImpl) {
  if (!oauthConfigReady(env)) {
    return htmlResponse('Instagram接続エラー', '接続設定がまだ完了していません。', 503);
  }
  const url = new URL(request.url);
  const code = clean(url.searchParams.get('code'), 2000);
  const state = clean(url.searchParams.get('state'), 4000);
  const cookieState = cookieValue(request, OAUTH_COOKIE);
  if (!code || !state || !cookieState || state !== cookieState) {
    return htmlResponse('Instagram接続エラー', '認証の有効期限が切れたか、確認情報が一致しません。最初からやり直してください。', 400);
  }
  try {
    const statePayload = await verifyPayload(state, config(env).appSecret);
    if (!statePayload?.nonce || Number(statePayload.exp || 0) < Math.floor(Date.now() / 1000)) {
      throw new Error('INSTAGRAM_OAUTH_STATE_EXPIRED');
    }
    const credential = await exchangeAuthorizationCode(code, request, env, fetchImpl);
    await saveCredential(env, credential);
    return htmlResponse(
      'Instagram接続完了',
      'HOSHILU公式Instagramとの接続を安全に保存しました。この画面は閉じて構いません。',
      200,
      { 'set-cookie': `${OAUTH_COOKIE}=; Max-Age=0; Path=/api/oauth/instagram/callback; Secure; HttpOnly; SameSite=Lax` }
    );
  } catch (error) {
    const rawCode = clean(error?.message || error, 100);
    const codeValue = /^INSTAGRAM_OAUTH_[A-Z0-9_]+$/.test(rawCode)
      ? rawCode
      : 'INSTAGRAM_OAUTH_FAILED';
    const status = codeValue === 'INSTAGRAM_OAUTH_ACCOUNT_MISMATCH' ? 403 : 502;
    return htmlResponse('Instagram接続エラー', `接続を完了できませんでした。（${codeValue}）`, status);
  }
}

async function handleDeauthorize(request, env) {
  if (!config(env).appSecret) return Response.json({ ok: false }, { status: 503, headers: secureHeaders() });
  try {
    const payload = await signedRequestPayload(request, env);
    if (!clean(payload?.user_id, 80)) throw new Error('INSTAGRAM_SIGNED_REQUEST_INVALID');
    await removeCredential(env, payload?.user_id);
    return Response.json({ success: true }, { headers: secureHeaders() });
  } catch (error) {
    const invalid = clean(error?.message, 100) === 'INSTAGRAM_SIGNED_REQUEST_INVALID';
    return Response.json({ success: false }, { status: invalid ? 400 : 503, headers: secureHeaders() });
  }
}

async function handleDataDeletion(request, env) {
  if (!config(env).appSecret) return Response.json({ error: 'NOT_CONFIGURED' }, { status: 503, headers: secureHeaders() });
  try {
    const payload = await signedRequestPayload(request, env);
    if (!clean(payload?.user_id, 80)) throw new Error('INSTAGRAM_SIGNED_REQUEST_INVALID');
    await removeCredential(env, payload?.user_id);
    const confirmationCode = crypto.randomUUID();
    const statusToken = await signPayload({ confirmationCode, deleted: true }, config(env).appSecret);
    const statusUrl = new URL('/api/oauth/instagram/data-deletion/status', request.url);
    statusUrl.searchParams.set('code', statusToken);
    return Response.json({ url: statusUrl.toString(), confirmation_code: confirmationCode }, {
      headers: secureHeaders()
    });
  } catch (error) {
    const invalid = clean(error?.message, 100) === 'INSTAGRAM_SIGNED_REQUEST_INVALID';
    return Response.json({ error: invalid ? 'INVALID_REQUEST' : 'DELETE_FAILED' }, {
      status: invalid ? 400 : 503, headers: secureHeaders()
    });
  }
}

async function handleDeletionStatus(request, env) {
  if (!config(env).appSecret) return htmlResponse('確認できません', '削除確認コードが無効です。', 400);
  try {
    const payload = await verifyPayload(new URL(request.url).searchParams.get('code'), config(env).appSecret);
    if (!payload?.deleted || !payload?.confirmationCode) throw new Error('INVALID');
    return htmlResponse('データ削除完了', `Instagram連携データは削除済みです。確認コード: ${clean(payload.confirmationCode, 80)}`);
  } catch {
    return htmlResponse('確認できません', '削除確認コードが無効です。', 400);
  }
}

export async function handleInstagramOAuthRoutes(request, env, fetchImpl = fetch) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/api/oauth/instagram/')) return null;
  if (request.method === 'GET' && path === '/api/oauth/instagram/start') return handleStart(request, env);
  if (request.method === 'GET' && path === '/api/oauth/instagram/callback') return handleCallback(request, env, fetchImpl);
  if (request.method === 'POST' && path === '/api/oauth/instagram/deauthorize') return handleDeauthorize(request, env);
  if (request.method === 'POST' && path === '/api/oauth/instagram/data-deletion') return handleDataDeletion(request, env);
  if (request.method === 'GET' && path === '/api/oauth/instagram/data-deletion/status') return handleDeletionStatus(request, env);
  return Response.json({ ok: false, error: 'NOT_FOUND' }, { status: 404, headers: secureHeaders() });
}
