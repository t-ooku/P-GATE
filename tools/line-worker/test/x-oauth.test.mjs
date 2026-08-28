import test from 'node:test';
import assert from 'node:assert/strict';
import cryptoModule from 'node:crypto';

globalThis.crypto ??= cryptoModule.webcrypto;
globalThis.btoa ??= value => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ??= value => Buffer.from(value, 'base64').toString('binary');

const {
  getXPublishCredentials,
  handleXOAuthRoutes,
  xOAuthReadiness,
  X_OAUTH_REQUIRED_SCOPES
} = await import('../src/x-oauth.mjs');

const ACCOUNT_ID = '1234567890123456789';
const USERNAME = 'hoshilu_app';
const SCOPES = X_OAUTH_REQUIRED_SCOPES.join(' ');

function createDatabase() {
  let row = null;
  return {
    get row() { return row; },
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              if (sql.includes('INSERT INTO x_oauth_credentials')) {
                row = {
                  account_id: values[0],
                  username: values[1],
                  access_token_ciphertext: values[2],
                  access_token_iv: values[3],
                  refresh_token_ciphertext: values[4],
                  refresh_token_iv: values[5],
                  token_type: values[6],
                  scopes: values[7],
                  expires_at: values[8],
                  status: 'ACTIVE',
                  last_refreshed_at: values[9]
                };
              }
              return { meta: { changes: 1 } };
            }
          };
        },
        async first() {
          if (sql.includes('FROM x_oauth_credentials')) return row;
          return null;
        }
      };
    }
  };
}

function environment(database = createDatabase()) {
  return {
    PRODUCT_DB: database,
    X_CLIENT_ID: 'x-client-id',
    X_CLIENT_SECRET: 'x-client-secret',
    X_EXPECTED_USERNAME: USERNAME,
    X_OAUTH_REDIRECT_URI: 'https://hoshilu.app/api/oauth/x/callback',
    SOCIAL_OAUTH_ENCRYPTION_KEY: 'x'.repeat(64)
  };
}

function cookieFrom(response) {
  return response.headers.get('set-cookie').split(';')[0];
}

async function begin(env) {
  const response = await handleXOAuthRoutes(
    new Request('https://hoshilu.app/api/oauth/x/start'), env
  );
  return {
    response,
    authorize: new URL(response.headers.get('location')),
    cookie: cookieFrom(response)
  };
}

async function connect(env, tokenPayload = {}, profilePayload = {}) {
  const started = await begin(env);
  const callback = await handleXOAuthRoutes(new Request(
    `${env.X_OAUTH_REDIRECT_URI}?code=one-time-code&state=${encodeURIComponent(started.authorize.searchParams.get('state'))}`,
    { headers: { cookie: started.cookie } }
  ), env, async (url, options = {}) => {
    if (url === 'https://api.x.com/2/oauth2/token') {
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
      assert.match(options.headers.authorization, /^Basic /);
      assert.doesNotMatch(options.body, /x-client-secret/);
      assert.match(options.body, /code_verifier=/);
      return Response.json({
        access_token: 'x-access-token',
        refresh_token: 'x-refresh-token',
        expires_in: 7200,
        token_type: 'bearer',
        scope: SCOPES,
        ...tokenPayload
      });
    }
    if (url === 'https://api.x.com/2/users/me?user.fields=username') {
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.authorization, `Bearer ${tokenPayload.access_token || 'x-access-token'}`);
      return Response.json({ data: { id: ACCOUNT_ID, username: USERNAME, ...profilePayload } });
    }
    return Response.json({}, { status: 404 });
  });
  return { ...started, callback };
}

test('X OAuth 2.0 PKCE requires exact publishing/media/offline scopes', async () => {
  const env = environment();
  const { response, authorize, cookie } = await begin(env);
  assert.equal(response.status, 302);
  assert.equal(authorize.origin, 'https://x.com');
  assert.equal(authorize.pathname, '/i/oauth2/authorize');
  assert.equal(authorize.searchParams.get('client_id'), env.X_CLIENT_ID);
  assert.equal(authorize.searchParams.get('redirect_uri'), env.X_OAUTH_REDIRECT_URI);
  assert.deepEqual(authorize.searchParams.get('scope').split(' '), X_OAUTH_REQUIRED_SCOPES);
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  assert.match(authorize.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
  assert.match(cookie, /^hoshilu_x_oauth_session=/);
  assert.doesNotMatch(cookie, /x-client-secret|code_verifier|offline\.access/);
});

test('X OAuth callback verifies the exact HOSHILU account and stores encrypted rotating tokens', async () => {
  const database = createDatabase();
  const env = environment(database);
  const { callback } = await connect(env);
  assert.equal(callback.status, 200);
  assert.match(await callback.text(), new RegExp(`@${USERNAME}`));
  assert.equal(database.row.account_id, ACCOUNT_ID);
  assert.equal(database.row.username, USERNAME);
  assert.equal(database.row.scopes, SCOPES);
  assert.doesNotMatch(database.row.access_token_ciphertext, /x-access-token/);
  assert.doesNotMatch(database.row.refresh_token_ciphertext, /x-refresh-token/);
  assert.deepEqual(await xOAuthReadiness(env), { configured: true, connected: true });

  const credential = await getXPublishCredentials(env, async () => {
    throw new Error('new credential must not refresh');
  });
  assert.deepEqual(credential, {
    accountId: ACCOUNT_ID,
    username: USERNAME,
    accessToken: 'x-access-token',
    scopes: SCOPES
  });
});

test('X OAuth rejects a different account before any credential is stored', async () => {
  const database = createDatabase();
  const env = environment(database);
  const { callback } = await connect(env, {}, { username: 'Findfunamazon' });
  assert.equal(callback.status, 403);
  assert.equal(database.row, null);
  const body = await callback.text();
  assert.match(body, /X_OAUTH_ACCOUNT_MISMATCH/);
  assert.doesNotMatch(body, /x-access-token|x-refresh-token/);
});

test('X OAuth rejects tokens missing media.write or offline.access', async () => {
  const database = createDatabase();
  const env = environment(database);
  const insufficient = SCOPES.replace('media.write ', '').replace('offline.access', '').trim();
  const { callback } = await connect(env, { scope: insufficient });
  assert.equal(callback.status, 502);
  assert.equal(database.row, null);
  assert.match(await callback.text(), /X_OAUTH_SCOPE_MISSING/);
});

test('X OAuth rejects a callback without its encrypted same-browser PKCE session', async () => {
  const env = environment();
  const { authorize } = await begin(env);
  let called = false;
  const callback = await handleXOAuthRoutes(new Request(
    `${env.X_OAUTH_REDIRECT_URI}?code=code&state=${encodeURIComponent(authorize.searchParams.get('state'))}`
  ), env, async () => { called = true; return Response.json({}); });
  assert.equal(callback.status, 400);
  assert.equal(called, false);
  assert.match(await callback.text(), /X_OAUTH_STATE_INVALID/);
});

test('expired X access tokens refresh, rotate and re-verify the same account', async () => {
  const database = createDatabase();
  const env = environment(database);
  await connect(env);
  database.row.expires_at = '2000-01-01T00:00:00.000Z';
  const calls = [];
  const credential = await getXPublishCredentials(env, async (url, options = {}) => {
    calls.push({ url, options });
    if (url === 'https://api.x.com/2/oauth2/token') {
      assert.match(options.body, /grant_type=refresh_token/);
      assert.equal(new URLSearchParams(options.body).get('refresh_token'), 'x-refresh-token');
      return Response.json({
        access_token: 'rotated-access-token',
        refresh_token: 'rotated-refresh-token',
        expires_in: 7200,
        token_type: 'bearer',
        scope: SCOPES
      });
    }
    return Response.json({ data: { id: ACCOUNT_ID, username: USERNAME } });
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ options }) => options.redirect === 'error'));
  assert.deepEqual(credential, {
    accountId: ACCOUNT_ID,
    username: USERNAME,
    accessToken: 'rotated-access-token',
    scopes: SCOPES
  });
  const stored = await getXPublishCredentials(env, async () => {
    throw new Error('rotated credential must not refresh immediately');
  });
  assert.equal(stored.accessToken, 'rotated-access-token');
  assert.doesNotMatch(database.row.refresh_token_ciphertext, /rotated-refresh-token/);
});
