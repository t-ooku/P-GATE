import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { storeKey } from '../src/lib/ledger.js';
import { retryRead } from '../src/utils/retry.js';
import { environmentDryRun } from '../src/config.js';
import { logPlannedMessage } from '../src/utils/plannedMessage.js';
import { submitContactForm, type SubmitOptions } from '../src/workers/formSubmitter.js';
import type { SellerInfo, Pitch } from '../src/types/index.js';

// These hosts never resolve or receive traffic: every browser request is fulfilled in-process.
const seller: SellerInfo = { name: '模擬店舗', platform: 'BASE', storeUrl: 'https://shop.example/',
  contactFormUrl: 'https://shop.example/contact', email: null, categories: [], mainProducts: [],
  features: '模擬データ', fetchedAt: '', sourceUrls: [] };
const pitch = { subject: 'テスト', body: 'これは模擬フォーム専用の本文です。' } as Pitch;
const sender = { name: 'テスト担当', email: 'sender@example.com', company: 'テスト会社' };
const form = `<form action="/submit" method="post">
  <label>お名前<input name="name" required></label>
  <label>メール<input type="email" name="email" required></label>
  <label>メール（確認）<input type="email" name="emailConfirm" required></label>
  <label>件名<input name="subject" required></label>
  <label>本文<textarea name="message" required></textarea></label>
  <button type="submit">送信する</button></form>`;

async function fixture(html: string, status = 200, confirmation: boolean | 'captcha' | 'redirect' = true,
  reads: { status?: number; failFirst?: number; abortFirst?: number } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'hoshilu-form-'));
  let posts = 0;
  let submitted = '';
  let gets = 0;
  const options: SubmitOptions = { mode: 'send', ledgerPath: join(directory, 'ledger.db'),
    screenshotDir: directory, successSelector: '#success',
    suppressionSnapshot: { source: 'TEST_EXPORT', capturedAt: '2026-11-06T00:00:00Z', storeUrls: [] } };
  const overrides = {
    dryRun: () => false, wait: async () => {}, block: () => {},
    retry: <T>(work: () => Promise<T>) => retryRead(work, { pause: async () => {} }),
    now: () => new Date('2026-11-06T01:00:00Z'),
    resolve: async (raw: string) => ({ url: new URL(raw), address: '203.0.113.1', family: 4 }),
    robots: async () => {}, exclusions: async () => '',
    onError: (error: unknown) => console.error('MOCK_ONLY_DIAGNOSTIC', error),
    launch: async (): Promise<Browser> => {
      const browser = await chromium.launch({ headless: true,
        ...(process.env.TEST_CHROMIUM_PATH ? { executablePath: process.env.TEST_CHROMIUM_PATH } : {}) });
      const original = browser.newContext.bind(browser);
      browser.newContext = async config => {
        const context: BrowserContext = await original(config);
        await context.route('**/*', async route => {
          assert.equal(new URL(route.request().url()).origin, 'https://shop.example');
          if (route.request().method() === 'POST') {
            posts++; submitted = route.request().postData() ?? '';
            return route.fulfill({ status, contentType: 'text/html; charset=utf-8',
              body: confirmation === 'redirect' ? '<script>location.assign("/thanks")</script>'
                : confirmation === 'captcha' ? '<div class="cf-turnstile" data-sitekey="test"></div>'
                : confirmation ? '<p id="success">送信を受け付けました</p>' : '<p>エラー</p>' });
          }
          if (new URL(route.request().url()).pathname === '/thanks') return route.fulfill({
            status: 200, contentType: 'text/html; charset=utf-8', body: '<p>受け付けました</p>' });
          gets++;
          if (gets <= (reads.abortFirst ?? 0)) return route.abort('timedout');
          const getStatus = gets <= (reads.failFirst ?? 0) ? 503 : reads.status ?? 200;
          return route.fulfill({ status: getStatus, contentType: 'text/html; charset=utf-8', body: html });
        });
        return context;
      };
      return browser;
    }
  };
  return { options, overrides, posts: () => posts, gets: () => gets, submitted: () => submitted,
    close: () => rmSync(directory, { recursive: true, force: true }) };
}

test('preview logs planned content without launching a browser', async () => {
  const f = await fixture(form);
  try {
    const planned: unknown[] = [];
    const r = await submitContactForm(seller, pitch, sender, { ...f.options, mode: 'preview' },
      { ...f.overrides, launch: async () => { throw Error('MUST_NOT_LAUNCH'); },
        logPlan: async (...args) => { planned.push(args); } });
    assert.equal(r.status, 'DRY_RUN', JSON.stringify(r)); assert.equal(f.posts(), 0);
    assert.equal(planned.length, 1);
  } finally { f.close(); }
});

test('environment DRY_RUN=true wins over send mode and logs without browser or DB access', async () => {
  const f = await fixture(form); const old = process.env.DRY_RUN;
  try {
    process.env.DRY_RUN = 'true'; const lines: string[] = [];
    const path = join(f.options.screenshotDir, 'planned.jsonl');
    const r = await submitContactForm(seller, pitch, sender,
      { ...f.options, dryRun: false, plannedLogPath: path }, {
        ...f.overrides, dryRun: environmentDryRun,
        launch: async () => { throw Error('MUST_NOT_LAUNCH'); },
        logPlan: (s, p, logPath) => logPlannedMessage(s, p, logPath, line => { lines.push(line); })
      });
    assert.equal(r.status, 'DRY_RUN'); assert.equal(f.posts(), 0); assert.equal(f.gets(), 0);
    assert.equal(existsSync(f.options.ledgerPath), false); assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).body, pitch.body); assert.ok(existsSync(path));
  } finally { if (old === undefined) delete process.env.DRY_RUN; else process.env.DRY_RUN = old; f.close(); }
});

test('HTTP 403, 429 and Cloudflare DOM are stored as blocked without retries', async () => {
  for (const [html, status] of [[form, 403], [form, 429],
    ['<title>Just a moment...</title><div id="challenge-form">Checking your browser</div>', 200]] as const) {
    const f = await fixture(html, 200, true, { status });
    try {
      const r = await submitContactForm(seller, pitch, sender, f.options, f.overrides);
      assert.equal(r.status, 'SKIPPED'); assert.equal(f.posts(), 0); assert.equal(f.gets(), 1);
      assert.ok(r.screenshot && existsSync(r.screenshot));
      const db = new DatabaseSync(f.options.ledgerPath);
      assert.equal((db.prepare('SELECT status FROM seller_status').get() as { status: string }).status, 'blocked_or_captcha');
      db.close();
    } finally { f.close(); }
  }
});

test('transient navigation errors retry reads, then submit exactly once', async () => {
  for (const reads of [{ failFirst: 2 }, { abortFirst: 2 }]) {
    const f = await fixture(form, 200, true, reads);
    try {
      const r = await submitContactForm(seller, pitch, sender, f.options, f.overrides);
      assert.equal(r.status, 'SUBMITTED', JSON.stringify(r)); assert.equal(f.gets(), 3); assert.equal(f.posts(), 1);
    } finally { f.close(); }
  }
});

test('permanent read timeout stops after initial attempt plus three retries', async () => {
  const f = await fixture(form, 200, true, { abortFirst: 100 });
  try {
    const r = await submitContactForm(seller, pitch, sender, f.options, f.overrides);
    assert.equal(r.status, 'SKIPPED'); assert.equal(f.gets(), 4); assert.equal(f.posts(), 0);
  } finally { f.close(); }
});

test('a configured exact success URL can confirm the one attempted submission', async () => {
  const f = await fixture(form, 200, 'redirect');
  try {
    const r = await submitContactForm(seller, pitch, sender,
      { ...f.options, successSelector: undefined, successUrl: 'https://shop.example/thanks' }, f.overrides);
    assert.equal(r.status, 'SUBMITTED', JSON.stringify(r)); assert.equal(f.posts(), 1);
  } finally { f.close(); }
});
test('CAPTCHA is skipped with a masked screenshot and no POST', async () => {
  const f = await fixture(form + '<div class="g-recaptcha" data-sitekey="test"></div>');
  try {
    const r = await submitContactForm(seller, pitch, sender, f.options, f.overrides);
    assert.equal(r.reason, 'CAPTCHA'); assert.equal(f.posts(), 0);
    assert.ok(r.screenshot && existsSync(r.screenshot));
    const db = new DatabaseSync(f.options.ledgerPath);
    assert.equal((db.prepare('SELECT status FROM seller_status WHERE store_key=?').get(storeKey(seller.storeUrl)) as { status: string }).status,
      'blocked_or_captcha'); db.close();
    const again = await submitContactForm(seller, pitch, sender, f.options,
      { ...f.overrides, launch: async () => { throw Error('MUST_NOT_LAUNCH'); } });
    assert.equal(again.reason, 'PERSISTED_BLOCKED_OR_CAPTCHA');
  } finally { f.close(); }
});
test('unsupported required fields, confirm steps, and solicitation bans do not submit', async () => {
  for (const [html, reason] of [
    [form.replace('</form>', '<input type="checkbox" required></form>'), 'FORM_AMBIGUOUS_OR_UNSUPPORTED'],
    [form.replace('送信する', '入力内容を確認'), 'FORM_AMBIGUOUS_OR_UNSUPPORTED'],
    [form + '<p>営業目的の送信はお断りします</p>', 'SOLICITATION_PROHIBITED']]) {
    const f = await fixture(html);
    try {
      const r = await submitContactForm(seller, pitch, sender, f.options, f.overrides);
      assert.equal(r.status, 'SKIPPED'); assert.equal(r.reason, reason); assert.equal(f.posts(), 0);
    } finally { f.close(); }
  }
});
test('labels are filled once, confirmation is required, and a second process cannot resubmit', async () => {
  const f = await fixture(form);
  try {
    const r = await submitContactForm(seller, pitch, sender, f.options, f.overrides);
    assert.equal(r.status, 'SUBMITTED', JSON.stringify(r)); assert.equal(f.posts(), 1);
    const body = new URLSearchParams(f.submitted());
    assert.equal(body.get('email'), sender.email); assert.equal(body.get('emailConfirm'), sender.email);
    assert.equal(body.get('name'), sender.name); assert.equal(body.get('message'), pitch.body);
    const again = await submitContactForm(seller, pitch, sender, f.options, f.overrides);
    assert.equal(again.status, 'DUPLICATE'); assert.equal(f.posts(), 1);
  } finally { f.close(); }
});
test('HTTP failure remains UNKNOWN and cannot be automatically retried', async () => {
  const f = await fixture(form, 500);
  try {
    const r = await submitContactForm(seller, pitch, sender, f.options, f.overrides);
    assert.equal(r.status, 'UNKNOWN', JSON.stringify(r)); assert.equal(f.posts(), 1);
    const again = await submitContactForm(seller, pitch, sender, f.options, f.overrides);
    assert.equal(again.status, 'DUPLICATE'); assert.equal(f.posts(), 1);
  } finally { f.close(); }
});
test('exclusions and opt-outs stop before launching a browser', async () => {
  const f = await fixture(form);
  const neverLaunch = async (): Promise<Browser> => { throw Error('MUST_NOT_LAUNCH'); };
  try {
    const excluded = await submitContactForm(seller, pitch, sender, f.options,
      { ...f.overrides, exclusions: async () => 'RIZAP', launch: neverLaunch });
    assert.equal(excluded.reason, 'EXCLUDED_ORGANIZATION');
    const suppressed = await submitContactForm(seller, pitch, sender,
      { ...f.options, suppressionSnapshot: { ...f.options.suppressionSnapshot, storeUrls: [seller.storeUrl] } },
      { ...f.overrides, launch: neverLaunch });
    assert.equal(suppressed.reason, 'PRIOR_CONTACT_OR_OPT_OUT');
  } finally { f.close(); }
});

test('CAPTCHA after the submit request keeps UNKNOWN, saves evidence and never retries', async () => {
  const f = await fixture(form, 200, 'captcha');
  try {
    const r = await submitContactForm(seller, pitch, sender, f.options, f.overrides);
    assert.equal(r.status, 'UNKNOWN'); assert.equal(r.reason, 'CAPTCHA_OR_BLOCK_AFTER_SUBMIT_REVIEW_REQUIRED');
    assert.equal(f.posts(), 1); assert.ok(r.screenshot && existsSync(r.screenshot));
    const again = await submitContactForm(seller, pitch, sender, f.options, f.overrides);
    assert.equal(again.reason, 'PERSISTED_BLOCKED_OR_CAPTCHA'); assert.equal(f.posts(), 1);
  } finally { f.close(); }
});
