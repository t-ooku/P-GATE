import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyGrowthTraffic } from '../src/growth-events.mjs';
import { searchSliSql } from '../scripts/check-production-search-sli.mjs';

test('Turnstile uses callback delivery, serializes token requests, and rebuilds an invalid widget', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /callback:onTurnstileToken/);
  assert.match(app, /'expired-callback':clearTurnstileToken/);
  assert.match(app, /'refresh-expired':'auto'/);
  assert.match(app, /'refresh-timeout':'auto'/);
  assert.match(app, /'timeout-callback':clearTurnstileToken/);
  assert.match(app, /'unsupported-callback':onTurnstileUnsupported/);
  assert.match(app, /'error-callback':code=>/);
  assert.match(app, /'error-callback':code=>\{[^}]*return false;/);
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
  assert.match(app, /function onTurnstileUnsupported\(\)\{[^}]*waiter\.reject\(new Error\('TURNSTILE_UNSUPPORTED'\)\)/);
  assert.match(app, /if\(turnstileUnsupported\)return Promise\.reject\(new Error\('TURNSTILE_UNSUPPORTED'\)\)/);
  const acquireBlock = app.slice(
    app.indexOf('async function acquireTurnstileToken'),
    app.indexOf('// Turnstile tokens are single-use')
  );
  assert.equal((acquireBlock.match(/waitForTurnstileCallback/gu) || []).length, 1);
  assert.doesNotMatch(acquireBlock, /recoverTurnstileWidget/);
  assert.doesNotMatch(app, /turnstile\?\.getResponse|turnstile\.getResponse/);
  assert.doesNotMatch(app, /finally\{elements\.submit\.disabled=false;if\(turnstileWidget!==null\).*reset/);
});

test('AI chat rebuilds Turnstile after a rejected token before retrying', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const chat = fs.readFileSync(new URL('../public/ai-search-ui.mjs', import.meta.url), 'utf8');
  assert.match(app, /invalidateToken:\(\)=>recoverTurnstileWidget\(\)/);
  assert.match(chat, /if \(\/TURNSTILE_\/u\.test\(code\)\) await auth\?\.invalidateToken\?\.\(\)/);
  assert.match(chat, /requestToken\?\.\(AI_TOKEN_CALLBACK_TIMEOUT_MS\)/);
  assert.match(chat, /const AI_CHAT_HTTP_TIMEOUT_MS = 12000/);
  assert.match(chat, /signal: AbortSignal\.timeout\(AI_CHAT_HTTP_TIMEOUT_MS\)/);
  assert.doesNotMatch(chat, /error\?\.name === 'TimeoutError' \|\| error\?\.name === 'AbortError'/);
  assert.match(chat, /error instanceof TypeError/);
});

test('Main search retries once and returns a traceable 13-mall degraded result', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /for\(let attempt=0;attempt<maxAttempts;attempt\+=1\)/);
  assert.match(app, /response\.status>=500/);
  assert.match(app, /await recoverTurnstileWidget\(\)/);
  assert.match(app, /x-request-id/);
  assert.match(app, /hoshilu:search-degraded/);
  assert.match(app, /const KNOWLEDGE_HTTP_TIMEOUT_MS = 25000/);
  assert.match(app, /const SUPPLEMENTAL_KNOWLEDGE_HTTP_TIMEOUT_MS = 45000/);
  assert.match(app, /const requestTimeoutMs=hasSupplementalInput\?SUPPLEMENTAL_KNOWLEDGE_HTTP_TIMEOUT_MS:KNOWLEDGE_HTTP_TIMEOUT_MS/);
  assert.match(app, /timedAbortController\(Math\.min\(requestTimeoutMs,remainingBeforeFetch\)\)/);
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
  assert.match(app, /const requestedMaxAttempts=Math\.max\(1,Math\.min\(2,Number\(options\.maxAttempts\)\|\|2\)\)/);
  // 2026-09-02: 画像付きも2回目を縮小画像で送り直す(空振りゼロ設計)。
  assert.match(app, /const maxAttempts=requestedMaxAttempts;/);
  assert.match(app, /let submittedImage=skipSupplementalInput\?null:preparedSearchImage;/);
  assert.match(app, /if\(attempt>0&&submittedImage\)\{submittedImage=await shrinkPreparedSearchImage\(submittedImage\);/);
  assert.match(app, /async function shrinkPreparedSearchImage\(payload\)/);
  assert.match(app, /const scale=1024\/longest/);
  assert.match(app, /canvasBlob\(canvas,'image\/jpeg',\.6\)/);
  assert.match(app, /Math\.max\(1000,remainingBeforeToken-1000\)/);
  assert.match(app, /waitForTurnstileToken\(tokenWaitBudget\)/);
  assert.match(app, /failureTelemetry\.error_code==='TURNSTILE_TOKEN_UNAVAILABLE'/);
  assert.match(app, /セキュリティ確認を完了して、もう一度「検索する」を押してください。/);
  assert.match(app, /failureTelemetry\.error_code==='TURNSTILE_UNSUPPORTED'/);
  assert.match(app, /コンテンツブロッカーを一時解除して再読み込みしてください。/);
  assert.match(app, /\['TURNSTILE_TOKEN_UNAVAILABLE','TURNSTILE_UNSUPPORTED'\]\.includes\(value\)/);
});

test('Turnstile token acquisition failure does not repeat the bounded visible-widget wait', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /function retryableOuterTurnstileFailure\(code\)/);
  assert.match(app, /!\['TURNSTILE_TOKEN_UNAVAILABLE','TURNSTILE_UNSUPPORTED'\]\.includes\(value\)/);
  assert.match(app, /const retryableTurnstileFailure=retryableOuterTurnstileFailure\(code\)/);
  assert.match(app, /attempt\+1<maxAttempts&&\(retryableTurnstileFailure\|\|code==='Failed to fetch'/);
  assert.match(app, /if\(retryableTurnstileFailure\)await recoverTurnstileWidget\(\)/);
});

test('production browser acceptance guidance classifies Codex audits as QA and keeps them out of real-user SLI', () => {
  const runbook = fs.readFileSync(new URL('../docs/VISUAL_WEB_SEARCH_RUNBOOK.md', import.meta.url), 'utf8');
  assert.match(runbook, /utm_source=codex_qa&utm_medium=qa&utm_campaign=acceptance_search/u);
  assert.equal(classifyGrowthTraffic({
    source: 'codex_qa', medium: 'qa', campaign: 'acceptance_search'
  }), 'QA');
  assert.match(searchSliSql(), /traffic_class<>'QA'/u);
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
  assert.match(worker, /function boundedRequestSignal[\s\S]{0,250}AbortSignal\.timeout/u);
  assert.match(worker, /siteverify[\s\S]{0,500}signal: boundedRequestSignal\(signal, 5000\)/u);
  assert.match(worker, /throw new Error\('TURNSTILE_TIMEOUT'\)/);
});
