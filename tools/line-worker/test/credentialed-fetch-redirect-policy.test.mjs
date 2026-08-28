import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fetchTrustedGasBackend } from '../src/index.mjs';

const source = (name) => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8');

test('credential-bearing Worker fetches disable automatic redirects', async () => {
  const minimumPolicies = new Map([
    ['index.mjs', 3],
    ['seller-business-inquiries.mjs', 1],
    ['member-email-auth.mjs', 1],
    ['member-auth.mjs', 2],
    ['member-notification-delivery.mjs', 2],
    ['amazon-creators-api.mjs', 2],
    ['sp-api-sync.mjs', 2],
    ['runway-client.mjs', 1],
    ['runway-generation.mjs', 1],
    ['rakuten-marketplace-api.mjs', 1],
    ['marketplace-ranking.mjs', 2],
    ['yahoo-shopping-api.mjs', 2],
    ['x-oauth.mjs', 2],
    ['instagram-oauth.mjs', 4],
    ['social-publisher.mjs', 14],
    ['ai-chat-intent.mjs', 1],
    ['ai-product-discovery.mjs', 1],
    ['ai-price-comparison.mjs', 1],
    ['related-product-recommendations.mjs', 1],
    ['search-input-analysis.mjs', 1]
  ]);
  for (const [name, minimum] of minimumPolicies) {
    const contents = await source(name);
    const policies = contents.match(/redirect\s*:\s*['"]manual['"]/gu) || [];
    assert.ok(policies.length >= minimum, `${name} must retain every credentialed redirect policy`);
    assert.doesNotMatch(contents, /redirect\s*:\s*['"]error['"]/u,
      `${name} must use the redirect mode supported by Cloudflare Workers`);
  }
});

test('GAS follows only trusted Apps Script redirects and preserves POST body', async () => {
  const calls = [];
  const body = JSON.stringify({ bridge_secret: 'secret-never-forwarded-arbitrarily', action: 'TRACK' });
  const signal = AbortSignal.timeout(5000);
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return new Response(null, {
        status: 303,
        headers: { location: 'https://script.googleusercontent.com/macros/echo?user_content_key=one' }
      });
    }
    return Response.json({ ok: true, result: {} });
  };

  const response = await fetchTrustedGasBackend(
    'https://script.google.com/macros/s/deployment-id/exec',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal },
    fetchImpl
  );

  assert.equal(response.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'https://script.googleusercontent.com/macros/echo?user_content_key=one');
  for (const call of calls) {
    assert.equal(call.options.redirect, 'manual');
    assert.equal(call.options.method, 'POST');
    assert.equal(call.options.body, body);
    assert.equal(call.options.signal, signal);
  }
});

test('GAS never forwards its bridge secret to an arbitrary redirect host', async () => {
  const calls = [];
  const body = JSON.stringify({ bridge_secret: 'secret-never-forwarded-arbitrarily' });
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), body: options.body });
    return new Response(null, {
      status: 307,
      headers: { location: 'https://attacker.example/collect' }
    });
  };

  await assert.rejects(
    fetchTrustedGasBackend(
      'https://script.google.com/macros/s/deployment-id/exec',
      { method: 'POST', body },
      fetchImpl
    ),
    /GAS_REDIRECT_NOT_TRUSTED/u
  );
  assert.deepEqual(calls, [{
    url: 'https://script.google.com/macros/s/deployment-id/exec',
    body
  }]);
});

test('GAS rejects an untrusted configured endpoint before sending any secret', async () => {
  let calls = 0;
  await assert.rejects(
    fetchTrustedGasBackend(
      'https://script.google.com.attacker.example/macros/s/deployment-id/exec',
      { method: 'POST', body: '{"bridge_secret":"secret"}' },
      async () => { calls += 1; return Response.json({ ok: true }); }
    ),
    /GAS_URL_NOT_TRUSTED/u
  );
  assert.equal(calls, 0);
});
