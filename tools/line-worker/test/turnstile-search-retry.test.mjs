import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Turnstile uses callback delivery, serializes token requests, and rebuilds an invalid widget', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /callback:onTurnstileToken/);
  assert.match(app, /'expired-callback':clearTurnstileToken/);
  assert.match(app, /'error-callback':code=>/);
  assert.match(app, /window\.turnstile\?\.remove\(turnstileWidget\)/);
  assert.match(app, /async function recoverTurnstileWidget\(\)/);
  assert.match(app, /function waitForTurnstileToken\(\)/);
  assert.match(app, /turnstileRequestQueue\.then\(\(\)=>acquireTurnstileToken\(\)\)/);
  assert.match(app, /const token=await waitForTurnstileToken\(\)/);
  assert.match(app, /if\(!token\)throw new Error\('TURNSTILE_TOKEN_UNAVAILABLE'\)/);
  assert.match(app, /lastIssuedTurnstileToken/);
  assert.match(app, /function issueTurnstileToken\(token\)/);
  assert.match(app, /token&&token!==lastIssuedTurnstileToken/);
  assert.doesNotMatch(app, /turnstile\?\.getResponse|turnstile\.getResponse/);
  assert.doesNotMatch(app, /finally\{elements\.submit\.disabled=false;if\(turnstileWidget!==null\).*reset/);
});
