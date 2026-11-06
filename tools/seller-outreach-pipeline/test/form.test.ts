import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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

async function fixture(html: string, status = 200, confirmation = true) {
  const directory = mkdtempSync(join(tmpdir(), 'hoshilu-form-'));
  let posts = 0;
  let submitted = '';
  const options: SubmitOptions = { mode: 'send', ledgerPath: join(directory, 'ledger.db'),
    screenshotDir: directory, successSelector: '#success',
    suppressionSnapshot: { source: 'TEST_EXPORT', capturedAt: '2026-11-06T00:00:00Z', storeUrls: [] } };
  const overrides = {
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
              body: confirmation ? '<p id="success">送信を受け付けました</p>' : '<p>エラー</p>' });
          }
          return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
        });
        return context;
      };
      return browser;
    }
  };
  return { options, overrides, posts: () => posts, submitted: () => submitted,
    close: () => rmSync(directory, { recursive: true, force: true }) };
}

test('preview never fills or sends a form', async () => {
  const f = await fixture(form);
  try {
    const r = await submitContactForm(seller, pitch, sender, { ...f.options, mode: 'preview' }, f.overrides);
    assert.equal(r.status, 'DRY_RUN', JSON.stringify(r)); assert.equal(f.posts(), 0);
  } finally { f.close(); }
});
test('CAPTCHA is skipped with a masked screenshot and no POST', async () => {
  const f = await fixture(form + '<div class="g-recaptcha" data-sitekey="test"></div>');
  try {
    const r = await submitContactForm(seller, pitch, sender, f.options, f.overrides);
    assert.equal(r.reason, 'CAPTCHA'); assert.equal(f.posts(), 0);
    assert.ok(r.screenshot && existsSync(r.screenshot));
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
