import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adminLoginPageResponse, adminSpApiPageResponse } from '../src/admin-sp-api-page.mjs';

test('認証管理画面はSecretを埋め込まず監査集計だけを表示する', async () => {
  const login = await adminLoginPageResponse().text();
  const page = adminSpApiPageResponse();
  const html = await page.text();
  assert.match(login, /運用管理ログイン/);
  assert.match(html, /管理ログイン監査/);
  assert.match(html, /セラーログイン監査/);
  assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
  assert.doesNotMatch(`${login}${html}`, /SOCIAL_ADMIN_SECRET|ADMIN_SESSION_SECRET|AUTH_SESSION_SECRET/);
  const client = readFileSync(new URL('../public/admin-sp-api.js', import.meta.url), 'utf8');
  assert.match(client, /admin_auth_summary/);
  assert.match(client, /seller_auth_summary/);
  assert.doesNotMatch(client, /alert_states|alerts\/ack|sync_health/);
});

test('認証専用checkerは0025と0026を参照しない', () => {
  const checker = readFileSync(new URL('../scripts/check-auth-release.mjs', import.meta.url), 'utf8');
  assert.match(checker, /0027_admin_login_guard/);
  assert.match(checker, /0028_seller_login_guard/);
  assert.doesNotMatch(checker, /0025_|0026_|sp_api_sync_/);
});
