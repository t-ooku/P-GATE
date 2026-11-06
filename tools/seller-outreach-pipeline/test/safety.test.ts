import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig, environmentDryRun } from '../src/config.js';
import { RateLimiter, OriginBlockedError } from '../src/utils/rateLimiter.js';
import { retryRead } from '../src/utils/retry.js';
import { logPlannedMessage } from '../src/utils/plannedMessage.js';
import { runJobs, type Job } from '../src/pipeline.js';
import type { SellerInfo, Pitch, DemandMatchResult } from '../src/types/index.js';

test('dry run is default; true overrides send; false also requires an explicit send flag', () => {
  assert.equal(environmentDryRun({}), true);
  assert.equal(readConfig({ DRY_RUN: 'true' }, ['--send']).dryRun, true);
  assert.equal(readConfig({ DRY_RUN: 'false' }, []).dryRun, true);
  assert.equal(readConfig({ DRY_RUN: 'false' }, ['--send']).dryRun, false);
  assert.throws(() => readConfig({ DRY_RUN: 'tru' }, ['--send']));
});
test('planned target, subject and body are identical in console and private JSONL', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hoshilu-dry-'));
  try {
    const lines: string[] = [], path = join(directory, 'planned.jsonl');
    const seller = { name: '模擬店舗', contactFormUrl: 'https://shop.example/contact', email: 'contact@example.com' } as SellerInfo;
    const pitch = { subject: '模擬件名', body: '模擬本文です。' } as Pitch;
    await logPlannedMessage(seller, pitch, path, line => { lines.push(line); });
    await logPlannedMessage(seller, pitch, path, line => { lines.push(line); });
    assert.equal(await readFile(path, 'utf8'), lines.join('\n') + '\n');
    assert.equal(JSON.parse(lines[0]).recipient.formUrl, seller.contactFormUrl);
    assert.equal(JSON.parse(lines[0]).subject, pitch.subject); assert.equal(JSON.parse(lines[0]).body, pitch.body);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('concurrent requests across different domains still share 3–7 second FIFO waits', async () => {
  let elapsed = 0; const starts: number[] = [], delays = [3000, 7000, 4500];
  const limiter = new RateLimiter(async ms => { elapsed += ms; }, () => delays.shift()!);
  await Promise.all(['https://one.example/', 'https://two.example/', 'https://one.example/again']
    .map(url => limiter.wait(url).then(() => { starts.push(elapsed); })));
  assert.deepEqual(starts, [3000, 10000, 14500]);
  limiter.block('https://one.example/contact');
  await assert.rejects(limiter.wait('https://one.example/other'), OriginBlockedError);
});
test('read retries use 1/2/4 second backoff and never exceed four attempts', async () => {
  let calls = 0; const pauses: number[] = [];
  const value = await retryRead(async () => {
    if (++calls < 4) throw Object.assign(new Error('reset'), { code: 'ECONNRESET' });
    return 'ok';
  }, { pause: async ms => { pauses.push(ms); } });
  assert.equal(value, 'ok'); assert.equal(calls, 4); assert.deepEqual(pauses, [1000, 2000, 4000]);
  calls = 0;
  await assert.rejects(retryRead(async () => { calls++; throw Object.assign(new Error(), { name: 'TimeoutError' }); },
    { pause: async () => {} }));
  assert.equal(calls, 4);
});
test('closing a browser cancels its queued request waits without delaying the next store', async () => {
  let waits = 0;
  const limiter = new RateLimiter((_ms, signal) => new Promise((_resolve, reject) => {
    waits++; signal!.addEventListener('abort', () => reject(signal!.reason), { once: true });
  }), () => 3000);
  const controller = new AbortController();
  const result = Promise.allSettled([limiter.wait('https://one.example/', controller.signal),
    limiter.wait('https://one.example/next', controller.signal)]);
  await Promise.resolve(); controller.abort();
  assert.deepEqual((await result).map(r => r.status), ['rejected', 'rejected']); assert.equal(waits, 1);
});
test('permanent refusal and block errors are never retried', async () => {
  let calls = 0;
  await assert.rejects(retryRead(async () => { calls++; throw new OriginBlockedError(); },
    { pause: async () => { throw Error('MUST_NOT_WAIT'); } }));
  assert.equal(calls, 1);
});
test('blocked result and an exception do not stop the next store; jobs remain sequential', async () => {
  const trace: string[] = [], output: string[] = [];
  const jobs = ['one', 'error', 'three'].map(name => ({ storeUrl: `https://${name}.example/`,
    sender: { name: 'テスト', email: 'sender@example.com', company: 'テスト' }, demands: [],
    submit: { suppressionSnapshot: { capturedAt: '', source: '', storeUrls: [] } } })) as Job[];
  await runJobs(jobs, readConfig({}, []), {
    scrape: async url => { trace.push('read:' + url); if (url.includes('error.')) throw Error('mock');
      return { storeUrl: url } as SellerInfo; },
    match: () => ({}) as DemandMatchResult, generate: async () => ({}) as Pitch,
    save: async () => {}, submit: async seller => {
      trace.push('submit:' + seller.storeUrl);
      return { status: 'SKIPPED', reason: 'CAPTCHA' };
    }, output: line => { output.push(line); }
  });
  assert.deepEqual(trace, ['read:https://one.example/', 'submit:https://one.example/',
    'read:https://error.example/', 'read:https://three.example/', 'submit:https://three.example/']);
  assert.equal(output.length, 3); assert.equal(JSON.parse(output[1]).reason, 'STORE_ERROR_CONTINUING_BATCH');
});
