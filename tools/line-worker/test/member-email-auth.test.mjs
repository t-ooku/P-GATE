import test from 'node:test';
import assert from 'node:assert/strict';
import cryptoModule from 'node:crypto';
globalThis.crypto ??= cryptoModule.webcrypto;
globalThis.btoa ??= (value) => Buffer.from(value, 'binary').toString('base64');
import { emailLoginConfigured, linkEmailDestination, requestEmailCode } from '../src/member-email-auth.mjs';

test('email login remains disabled until database, sender and API key exist', () => {
  assert.equal(emailLoginConfigured({}), false);
  assert.equal(emailLoginConfigured({ PRODUCT_DB: {}, RESEND_API_KEY: 're_test', MEMBER_EMAIL_FROM: 'notification@auth.hoshilu.app' }), true);
});

test('email login rejects invalid email before sending', async () => {
  const env = {
    PRODUCT_DB: { prepare() { return { bind() { return this; }, first: async () => null }; } },
    RESEND_API_KEY: 're_test', MEMBER_EMAIL_FROM: 'notification@auth.hoshilu.app',
    MEMBER_SESSION_SECRET: 'member-session-secret-32-characters-minimum'
  };
  const response = await requestEmailCode(new Request('https://hoshilu.app/api/member/email/request', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
    body: JSON.stringify({ email: 'not-an-email' })
  }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'EMAIL_INVALID');
});

test('linking an email notification destination requires a signed-in member', async () => {
  const response = await linkEmailDestination(new Request('https://hoshilu.app/api/member/email/link', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  }), {}, '');
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'MEMBER_REQUIRED');
});
