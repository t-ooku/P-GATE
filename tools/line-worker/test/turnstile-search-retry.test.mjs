import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('search waits for a fresh Turnstile token before every API request', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /async function waitForTurnstileToken\(\)/);
  assert.match(app, /const token=await waitForTurnstileToken\(\)/);
  assert.match(app, /if\(!token\)throw new Error\('TURNSTILE_TOKEN_UNAVAILABLE'\)/);
  assert.match(app, /attempt===0&&turnstileWidget!==null/);
  assert.match(app, /setTimeout\(resolve,100\)/);
  assert.match(app, /lastIssuedTurnstileToken/);
  assert.match(app, /function issueTurnstileToken\(token\)/);
  assert.match(app, /token&&token!==lastIssuedTurnstileToken/);
  assert.match(app, /if\(token&&token!==lastIssuedTurnstileToken\)return issueTurnstileToken\(token\)/);
});
