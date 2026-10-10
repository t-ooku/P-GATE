import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/for-sellers.js', import.meta.url), 'utf8');
const submitScript = source.slice(source.indexOf('let inquiryRequestId ='), source.indexOf('// 2026-09-19 大隆さん指示 §8'));
function browser(fetcher) {
  let handler, serial = 0, timer;
  const button = { disabled: false };
  const fields = new Map([['organization_name', 'QA test'], ['contact_email', 'qa@example.invalid'], ['privacy_consent', 'on']]);
  const form = { valid: true, resets: 0, reportValidity() { return this.valid; }, querySelector() { return button; }, reset() { this.resets++; fields.clear(); }, addEventListener(event, fn) { handler = fn; } };
  const status = { textContent: '', className: '', classList: { contains: value => status.className.split(' ').includes(value) } };
  const context = {
    form, status, crypto: { randomUUID: () => `request-${++serial}` }, AbortController,
    FormData: class { get(key) { return fields.get(key); } getAll() { return []; } },
    turnstileToken: 'valid-test-token', turnstileFailure: '', turnstileWidget: 0,
    window: { turnstile: { reset() {} } }, fetch: fetcher,
    // 2026-10-10: 送信処理が呼ぶ計測・URL整形（ファイルの別の場所で定義）。ここでは何もしない。
    sendSellerEvent() {}, sendFormFailure() {}, tidyStorefront() {}, submitAfterTurnstile: false,
    setTimeout(fn, delay) { timer = { fn, delay, cleared: false }; return timer; }, clearTimeout(value) { value.cleared = true; }
  };
  runInNewContext(submitScript, context);
  return { form, fields, status, button, context, submit: () => handler({ preventDefault() {} }), timeout: () => timer, token() { context.turnstileToken = 'fresh-test-token'; } };
}
const receipt = { ok: true, status: 201, json: async () => ({ ok: true, inquiry_id: 'SBI_qa' }) };

test('lost receipt times out, preserves input and request ID, and retries once with the same ID', async () => {
  const requests = [];
  const page = browser(async (url, options) => {
    requests.push(JSON.parse(options.body));
    if (requests.length === 1) return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    return receipt;
  });
  const pending = page.submit();
  assert.equal(page.button.disabled, true);
  assert.equal(page.timeout().delay, 20000);
  page.timeout().fn();
  await pending;
  assert.equal(page.button.disabled, false);
  assert.equal(page.timeout().cleared, true);
  assert.equal(page.form.resets, 0);
  assert.equal(page.fields.get('organization_name'), 'QA test');
  assert.match(page.status.textContent, /受付結果を確認できません|同じ画面/);
  assert.doesNotMatch(page.status.textContent, /受付しました/);
  page.token();
  await page.submit();
  assert.equal(requests.length, 2);
  assert.equal(requests[0].request_id, requests[1].request_id);
  assert.equal(page.form.resets, 1);
  assert.match(page.status.textContent, /受付番号：SBI_qa/);
  page.token();
  await page.submit();
  assert.notEqual(requests[2].request_id, requests[1].request_id);
});

test('repeated submit while pending sends one request', async () => {
  let resolve, calls = 0;
  const page = browser(() => { calls++; return new Promise(done => { resolve = done; }); });
  const pending = page.submit();
  await page.submit();
  assert.equal(calls, 1);
  resolve(receipt);
  await pending;
  assert.equal(page.button.disabled, false);
  assert.equal(page.timeout().cleared, true);
});

test('server errors give a next action without clearing inputs or falsely acknowledging receipt', async () => {
  for (const [code, error, expected] of [[503, 'INQUIRY_SAVE_FAILED', /同じ画面/], [403, 'TURNSTILE_FAILED', /確認をやり直して/], [400, 'VALIDATION_FAILED', /必須の同意欄/], [429, 'RATE_LIMITED', /時間をおいて/]]) {
    const page = browser(async () => ({ ok: false, status: code, json: async () => ({ ok: false, error }) }));
    await page.submit();
    assert.match(page.status.textContent, expected);
    assert.equal(page.form.resets, 0);
    assert.equal(page.button.disabled, false);
    assert.equal(page.timeout().cleared, true);
    assert.doesNotMatch(page.status.textContent, /受付しました/);
  }
});

test('browser validation and an unfinished challenge still block a request', async () => {
  let calls = 0;
  const page = browser(async () => { calls++; return receipt; });
  page.form.valid = false;
  await page.submit();
  page.form.valid = true;
  page.context.turnstileToken = '';
  await page.submit();
  assert.equal(calls, 0);
  assert.equal(page.form.resets, 0);
});
