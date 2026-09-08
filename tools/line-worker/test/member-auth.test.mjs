import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMemberRoutes } from '../src/member-auth.mjs';

const env = {
  LINE_LOGIN_CHANNEL_ID: '1234567890',
  LINE_LOGIN_CHANNEL_SECRET: 'line-login-secret',
  MEMBER_SESSION_SECRET: 'member-session-secret-32-characters-minimum'
};

test('未設定のLINE Loginは安全に503を返す', async () => {
  const response = await handleMemberRoutes(new Request('https://hoshilu.app/api/member/line/start'), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'LINE_LOGIN_NOT_CONFIGURED');
});

test('LINE Login開始はPKCE・state・nonceとHttpOnly Cookieを使う', async () => {
  const response = await handleMemberRoutes(new Request('https://hoshilu.app/api/member/line/start'), env);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('location'));
  assert.equal(location.origin, 'https://access.line.me');
  assert.equal(location.searchParams.get('client_id'), env.LINE_LOGIN_CHANNEL_ID);
  assert.equal(location.searchParams.get('redirect_uri'), 'https://hoshilu.app/api/member/line/callback');
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(location.searchParams.get('state'));
  assert.ok(location.searchParams.get('nonce'));
  assert.ok(location.searchParams.get('code_challenge'));
  assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/);
});

test('workers.devからのLINE Login開始は正式ドメインへ移動する', async () => {
  const response = await handleMemberRoutes(
    new Request('https://project-gate-line-bridge.mygate-jp.workers.dev/api/member/line/start'),
    env
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://hoshilu.app/api/member/line/start');
  assert.equal(response.headers.get('set-cookie'), null);
});

test('会員セッションなしでは個人情報を返さない', async () => {
  const response = await handleMemberRoutes(new Request('https://hoshilu.app/api/member/session'), env);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, member: null });
});

test('ログアウトは会員Cookieを失効する', async () => {
  const response = await handleMemberRoutes(new Request('https://hoshilu.app/api/member/logout', { method: 'POST' }), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
});

test('文字列のChannel IDはLINEへ転送せず安全に拒否する', async () => {
  const response = await handleMemberRoutes(new Request('https://hoshilu.app/api/member/line/start'), {
    ...env,
    LINE_LOGIN_CHANNEL_ID: 'hoshilu19850613'
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, error: 'LINE_LOGIN_NOT_CONFIGURED' });
});
