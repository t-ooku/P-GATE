import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Turnstile uses callback delivery, serializes token requests, and rebuilds an invalid widget', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /callback:onTurnstileToken/);
  assert.match(app, /'expired-callback':clearTurnstileToken/);
  assert.match(app, /'error-callback':code=>/);
  assert.match(app, /window\.turnstile\?\.remove\?\.\(turnstileWidget\)/);
  assert.match(app, /typeof window\.turnstile\?\.render==='function'/);
  assert.match(app, /async function waitForTurnstileApi\(\)/);
  assert.doesNotMatch(app, /window\.turnstile\.ready\(/);
  assert.match(app, /async function recoverTurnstileWidget\(\)/);
  assert.match(app, /function waitForTurnstileToken\(callbackTimeoutMs=15000\)/);
  assert.match(app, /turnstileRequestQueue\.then\(\(\)=>acquireTurnstileToken\(callbackTimeoutMs\)\)/);
  assert.match(app, /const token=await waitForTurnstileToken\(\)/);
  assert.match(app, /if\(!token\)throw new Error\('TURNSTILE_TOKEN_UNAVAILABLE'\)/);
  assert.match(app, /lastIssuedTurnstileToken/);
  assert.match(app, /function issueTurnstileToken\(token\)/);
  assert.match(app, /token&&token!==lastIssuedTurnstileToken/);
  assert.doesNotMatch(app, /turnstile\?\.getResponse|turnstile\.getResponse/);
  assert.doesNotMatch(app, /finally\{elements\.submit\.disabled=false;if\(turnstileWidget!==null\).*reset/);
});

test('AI chat rebuilds Turnstile after a rejected token before retrying', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const chat = fs.readFileSync(new URL('../public/ai-search-ui.mjs', import.meta.url), 'utf8');
  assert.match(app, /invalidateToken:\(\)=>recoverTurnstileWidget\(\)/);
  assert.match(chat, /if \(\/TURNSTILE_\/u\.test\(code\)\) await auth\?\.invalidateToken\?\.\(\)/);
  assert.match(chat, /requestToken\?\.\(AI_TOKEN_CALLBACK_TIMEOUT_MS\)/);
  assert.match(chat, /signal: AbortSignal\.timeout\(AI_CHAT_HTTP_TIMEOUT_MS\)/);
});

test('Main search retries once and returns a traceable 13-mall degraded result', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /for\(let attempt=0;attempt<maxAttempts;attempt\+=1\)/);
  assert.match(app, /response\.status>=500/);
  assert.match(app, /await recoverTurnstileWidget\(\)/);
  assert.match(app, /x-request-id/);
  assert.match(app, /hoshilu:search-degraded/);
  assert.match(app, /timedAbortController\(Math\.min\(KNOWLEDGE_HTTP_TIMEOUT_MS,remainingBeforeFetch\)\)/);
  assert.match(app, /activeKnowledgeFetch\?\.abort\(\)/);
  assert.match(app, /SEARCH_SUPERSEDED/);
  assert.match(app, /SEARCH_DEADLINE_EXCEEDED/);
  assert.match(app, /searchDeadlineAt=Date\.now\(\)\+60000/);
  assert.match(app, /hoshilu:search-cancelled/);
  assert.match(app, /error\?\.name==='TimeoutError'/);
  assert.match(app, /error\?\.name==='AbortError'/);
  assert.match(app, /parseFailed=true/);
  assert.match(app, /if\(parseFailed&&attempt\+1<maxAttempts\)continue/);
  assert.match(app, /Number\(error\?\.status\|\|0\)>=500/);
  assert.match(app, /hoshilu:search-execution-started/);
  assert.match(app, /Math\.min\(15000,Number\(options\.tokenCallbackTimeoutMs\)\|\|15000\)/);
  assert.match(app, /degraded:true/);
  assert.match(app, /const maxAttempts=Math\.max\(1,Math\.min\(2,Number\(options\.maxAttempts\)\|\|2\)\)/);
  assert.match(app, /Math\.floor\(\(remainingBeforeToken-1000\)\/2\)/);
  assert.match(app, /waitForTurnstileToken\(tokenWaitBudget\)/);
});

test('AI chat failure automatically continues to the resilient main search', () => {
  const chat = fs.readFileSync(new URL('../public/ai-search-ui.mjs', import.meta.url), 'utf8');
  assert.match(chat, /const directQuery = history\.filter/);
  assert.match(chat, /const outcome = await runFinalSearch\(directQuery,null,/);
  assert.match(chat, /outcome\.ok \|\| outcome\.degraded/);
  assert.match(chat, /maxAttempts:1/);
});

test('Turnstile verification is bounded on the Worker', () => {
  const worker = fs.readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(worker, /siteverify[\s\S]{0,500}signal: AbortSignal\.timeout\(5000\)/);
  assert.match(worker, /throw new Error\('TURNSTILE_TIMEOUT'\)/);
});
