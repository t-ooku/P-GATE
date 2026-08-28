import test from 'node:test';
import assert from 'node:assert/strict';
import cryptoModule from 'node:crypto';

globalThis.crypto ??= cryptoModule.webcrypto;
globalThis.btoa ??= value => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ??= value => Buffer.from(value, 'base64').toString('binary');

const {
  getInstagramPublishCredentials,
  handleInstagramOAuthRoutes,
  instagramOAuthReadiness
} = await import('../src/instagram-oauth.mjs');

const ACCOUNT_ID = '17841441143206766';
const OAUTH_SCOPED_ID = 'oauth-scoped-user-id';

function createDatabase() {
  let row = null;
  return {
    get row() { return row; },
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              if (sql.includes('INSERT INTO instagram_oauth_credentials')) {
                row = {
                  account_id: values[0],
                  access_token_ciphertext: values[1],
                  access_token_iv: values[2],
                  token_type: values[3],
                  scopes: values[4],
                  expires_at: values[5],
                  status: 'ACTIVE',
                  last_refreshed_at: values[6]
                };
              } else if (sql.includes('DELETE FROM instagram_oauth_credentials') && row?.account_id === values[0]) {
                row = null;
              }
              return { meta: { changes: 1 } };
            }
          };
        },
        async first() {
          if (sql.includes('FROM instagram_oauth_credentials')) return row;
          return null;
        }
      };
    }
  };
}

function testEnvironment(database = createDatabase()) {
  return {
    PRODUCT_DB: database,
    INSTAGRAM_APP_ID: '1349062573483200',
    INSTAGRAM_APP_SECRET: 'instagram-app-secret-for-tests',
    SOCIAL_OAUTH_ENCRYPTION_KEY: 'e'.repeat(64),
    INSTAGRAM_ACCOUNT_ID: ACCOUNT_ID,
    INSTAGRAM_EXPECTED_USERNAME: 'hoshilu.app',
    INSTAGRAM_OAUTH_REDIRECT_URI: 'https://hoshilu.app/api/oauth/instagram/callback'
  };
}

function cookieFrom(response) {
  return response.headers.get('set-cookie').split(';')[0];
}

async function signedRequest(userId, secret) {
  const encoded = Buffer.from(JSON.stringify({ user_id: userId })).toString('base64url');
  const signature = cryptoModule.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${signature}.${encoded}`;
}

test('Instagram Business Login stores only an encrypted long-lived token', async () => {
  const database = createDatabase();
  const env = testEnvironment(database);
  const start = await handleInstagramOAuthRoutes(
    new Request('https://hoshilu.app/api/oauth/instagram/start'), env
  );
  assert.equal(start.status, 302);
  const authorize = new URL(start.headers.get('location'));
  assert.equal(authorize.hostname, 'www.instagram.com');
  assert.equal(authorize.searchParams.get('client_id'), env.INSTAGRAM_APP_ID);
  assert.equal(authorize.searchParams.get('redirect_uri'), env.INSTAGRAM_OAUTH_REDIRECT_URI);
  assert.deepEqual(authorize.searchParams.get('scope').split(','), [
    'instagram_business_basic', 'instagram_business_content_publish'
  ]);
  const state = authorize.searchParams.get('state');
  const calls = [];
  const callback = await handleInstagramOAuthRoutes(new Request(
    `${env.INSTAGRAM_OAUTH_REDIRECT_URI}?code=one-time-code&state=${encodeURIComponent(state)}`,
    { headers: { cookie: cookieFrom(start) } }
  ), env, async (url, options = {}) => {
    calls.push({ url, options });
    if (url === 'https://api.instagram.com/oauth/access_token') {
      assert.match(options.body, /code=one-time-code/);
      return Response.json({
        access_token: 'short-lived-token',
        user_id: OAUTH_SCOPED_ID,
        permissions: ['instagram_business_basic', 'instagram_business_content_publish']
      });
    }
    if (url.startsWith('https://graph.instagram.com/me?')) {
      return Response.json({ user_id: ACCOUNT_ID, username: 'hoshilu.app' });
    }
    if (url.startsWith('https://graph.instagram.com/access_token?')) {
      return Response.json({ access_token: 'long-lived-token', token_type: 'bearer', expires_in: 5184000 });
    }
    return Response.json({}, { status: 404 });
  });
  assert.equal(callback.status, 200);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(({ options }) => options.redirect === 'error'));
  assert.equal(database.row.account_id, ACCOUNT_ID);
  assert.equal(database.row.access_token_ciphertext.includes('long-lived-token'), false);
  assert.equal(database.row.access_token_iv.includes('long-lived-token'), false);

  const credential = await getInstagramPublishCredentials(env, async () => {
    throw new Error('refresh must not run for a new token');
  });
  assert.deepEqual(credential, { accountId: ACCOUNT_ID, accessToken: 'long-lived-token' });
  assert.deepEqual(await instagramOAuthReadiness(env), { configured: true, connected: true });
});

test('expired Instagram credentials reject redirects while refreshing the access token', async () => {
  const database = createDatabase();
  const env = testEnvironment(database);
  const start = await handleInstagramOAuthRoutes(
    new Request('https://hoshilu.app/api/oauth/instagram/start'), env
  );
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  await handleInstagramOAuthRoutes(new Request(
    `${env.INSTAGRAM_OAUTH_REDIRECT_URI}?code=code&state=${encodeURIComponent(state)}`,
    { headers: { cookie: cookieFrom(start) } }
  ), env, async (url) => {
    if (url.startsWith('https://api.instagram.com/')) {
      return Response.json({ access_token: 'short-token', user_id: OAUTH_SCOPED_ID });
    }
    if (url.startsWith('https://graph.instagram.com/me?')) {
      return Response.json({ user_id: ACCOUNT_ID, username: 'hoshilu.app' });
    }
    return Response.json({ access_token: 'long-token', expires_in: 5184000 });
  });
  database.row.expires_at = '2000-01-01T00:00:00.000Z';

  const credential = await getInstagramPublishCredentials(env, async (url, options = {}) => {
    assert.match(url, /^https:\/\/graph\.instagram\.com\/refresh_access_token\?/);
    assert.equal(options.redirect, 'error');
    return Response.json({ access_token: 'refreshed-token', expires_in: 5184000 });
  });
  assert.deepEqual(credential, { accountId: ACCOUNT_ID, accessToken: 'refreshed-token' });
});

test('OAuth callback rejects a different Instagram account before storage', async () => {
  const database = createDatabase();
  const env = testEnvironment(database);
  const start = await handleInstagramOAuthRoutes(
    new Request('https://hoshilu.app/api/oauth/instagram/start'), env
  );
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const response = await handleInstagramOAuthRoutes(new Request(
    `${env.INSTAGRAM_OAUTH_REDIRECT_URI}?code=code&state=${encodeURIComponent(state)}`,
    { headers: { cookie: cookieFrom(start) } }
  ), env, async url => url.startsWith('https://api.instagram.com/')
    ? Response.json({ access_token: 'short', user_id: '999' })
    : Response.json({ user_id: '999', username: 'different.account' }));
  assert.equal(response.status, 403);
  assert.equal(database.row, null);
  assert.doesNotMatch(await response.text(), /short/);
});

test('Meta signed data-deletion request removes the credential and returns a verifiable status URL', async () => {
  const database = createDatabase();
  const env = testEnvironment(database);
  const start = await handleInstagramOAuthRoutes(
    new Request('https://hoshilu.app/api/oauth/instagram/start'), env
  );
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  await handleInstagramOAuthRoutes(new Request(
    `${env.INSTAGRAM_OAUTH_REDIRECT_URI}?code=code&state=${encodeURIComponent(state)}`,
    { headers: { cookie: cookieFrom(start) } }
  ), env, async url => {
    if (url.startsWith('https://api.instagram.com/')) {
      return Response.json({ access_token: 'short', user_id: OAUTH_SCOPED_ID });
    }
    if (url.startsWith('https://graph.instagram.com/me?')) {
      return Response.json({ user_id: ACCOUNT_ID, username: 'hoshilu.app' });
    }
    return Response.json({ access_token: 'long', expires_in: 5184000 });
  });
  assert.ok(database.row);

  const body = new URLSearchParams({
    signed_request: await signedRequest(ACCOUNT_ID, env.INSTAGRAM_APP_SECRET)
  });
  const deletion = await handleInstagramOAuthRoutes(new Request(
    'https://hoshilu.app/api/oauth/instagram/data-deletion',
    { method: 'POST', body }
  ), env);
  assert.equal(deletion.status, 200);
  const payload = await deletion.json();
  assert.match(payload.confirmation_code, /^[0-9a-f-]{36}$/);
  assert.equal(database.row, null);

  const status = await handleInstagramOAuthRoutes(new Request(payload.url), env);
  assert.equal(status.status, 200);
  assert.match(await status.text(), new RegExp(payload.confirmation_code));
});

test('invalid Meta signed_request is rejected without deleting stored credentials', async () => {
  const database = createDatabase();
  const env = testEnvironment(database);
  const body = new URLSearchParams({ signed_request: 'invalid.payload' });
  const response = await handleInstagramOAuthRoutes(new Request(
    'https://hoshilu.app/api/oauth/instagram/deauthorize',
    { method: 'POST', body }
  ), env);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { success: false });
});
