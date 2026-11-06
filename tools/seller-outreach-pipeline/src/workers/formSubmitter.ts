import { chromium, type Browser, type Locator, type Page } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { publicAddress, assertRobotsAllowed, AGENT } from '../lib/publicWeb.js';
import { Ledger, storeKey } from '../lib/ledger.js';
import { environmentDryRun } from '../config.js';
import { requestLimiter } from '../utils/rateLimiter.js';
import { retryRead, RetryableReadError, isTransientReadError } from '../utils/retry.js';
import { logPlannedMessage } from '../utils/plannedMessage.js';
import { BLOCK_MARKERS, detectBlock } from '../utils/blockDetection.js';
import type { SellerInfo, SenderInfo, Pitch, SubmissionResult } from '../types/index.js';

type Role = 'name' | 'email' | 'company' | 'subject' | 'message';
export interface SubmitOptions {
  mode: 'preview' | 'send';
  dryRun?: boolean;
  plannedLogPath?: string;
  ledgerPath: string;
  screenshotDir: string;
  successSelector?: string;
  successUrl?: string;
  submissionUrl?: string;
  /** Fresh, verified export covering existing email/form contacts and opt-outs. */
  suppressionSnapshot: { capturedAt: string; source: string; storeUrls: string[] };
}

function inferRole(label: string, tag: string): Role | null {
  if (/email|e-mail|メール/iu.test(label)) return 'email';
  if (/company|会社|法人|組織/iu.test(label)) return 'company';
  if (/subject|title|件名|題名/iu.test(label)) return 'subject';
  if (tag === 'TEXTAREA' || /message|body|本文|お問い合わせ内容|問合せ内容/iu.test(label)) return 'message';
  if (/name|氏名|お名前|担当者名/iu.test(label)) return 'name';
  return null;
}

async function screenshot(page: Page, directory: string, key: string): Promise<string> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${key}-${Date.now()}.png`);
  await page.screenshot({ path, mask: [page.locator('input,textarea')], timeout: 5000 });
  return path;
}

/** No arbitrary submit-button guesses: inspect one form, skip ambiguity. */
export async function inspectForm(page: Page): Promise<{
  form: Locator; fields: Array<{ locator: Locator; role: Role }>; submit: Locator;
} | null> {
  const forms = page.locator('form').filter({ has: page.locator('textarea') });
  const candidates: Locator[] = [];
  for (let i = 0; i < await forms.count(); i++) if (await forms.nth(i).isVisible()) candidates.push(forms.nth(i));
  if (candidates.length !== 1) return null;
  const form = candidates[0], inputs = form.locator('input,textarea,select');
  const fields: Array<{ locator: Locator; role: Role }> = [];
  for (let i = 0; i < await inputs.count(); i++) {
    const locator = inputs.nth(i);
    if (!await locator.isVisible()) continue;
    const info = await locator.evaluate(el => {
      const field = el as HTMLInputElement;
      return { tag: el.tagName, type: field.type?.toLowerCase(), required: field.required,
        label: [...Array.from(field.labels ?? []).map(l => l.textContent),
          field.getAttribute('aria-label'), field.name, field.id, field.placeholder].filter(Boolean).join(' ') };
    });
    if (['submit', 'button', 'reset'].includes(info.type)) continue;
    const role = inferRole(info.label, info.tag);
    const supported = info.tag !== 'SELECT' && ['text', 'email', 'textarea', 'search', ''].includes(info.type ?? '');
    if (!role || !supported || !await locator.isEditable()) {
      if (info.required) return null;
      continue;
    }
    if (fields.some(f => f.role === role) && role !== 'email') return null;
    fields.push({ locator, role });
  }
  if (!fields.some(f => f.role === 'email') || !fields.some(f => f.role === 'message')) return null;
  const submit = form.getByRole('button', { name: /^(?:送信|送信する|この内容で送信|send|send message|submit)$/iu });
  if (await submit.count() !== 1 || !await submit.isVisible()) return null;
  return { form, fields, submit };
}

/** Runtime dependencies are injectable only for deterministic local tests. */
interface Dependencies {
  resolve: typeof publicAddress;
  robots: typeof assertRobotsAllowed;
  launch: (host: string, address: string) => Promise<Browser>;
  exclusions: (...values: string[]) => Promise<string>;
  now: () => Date;
  onError: (error: unknown) => void;
  dryRun: () => boolean;
  logPlan: typeof logPlannedMessage;
  wait: (url: string, signal?: AbortSignal) => Promise<unknown>;
  block: (url: string) => void;
  retry: typeof retryRead;
}
const defaults: Dependencies = {
  resolve: publicAddress, robots: assertRobotsAllowed,
  launch: (host, address) => chromium.launch({ headless: true, chromiumSandbox: true,
    args: [`--host-resolver-rules=MAP ${host} ${address.includes(':') ? `[${address}]` : address}`] }),
  exclusions: async (...values) => {
    // Reuse the existing RIZAP/ITG exclusion rules; missing adapter fails closed.
    const moduleUrl = new URL('../../../line-worker/src/seller-outreach.mjs', import.meta.url).href;
    const adapter = await import(moduleUrl) as { findExcludedOrganization: (...v: string[]) => string };
    return adapter.findExcludedOrganization(...values);
  },
  now: () => new Date(), onError: () => {}, dryRun: environmentDryRun,
  logPlan: logPlannedMessage, wait: (url, signal) => requestLimiter.wait(url, signal),
  block: url => requestLimiter.block(url), retry: retryRead
};

export async function submitContactForm(seller: SellerInfo, pitch: Pitch, sender: SenderInfo,
  options: SubmitOptions, overrides: Partial<Dependencies> = {}): Promise<SubmissionResult> {
  const deps = { ...defaults, ...overrides };
  const skip = (reason: string): SubmissionResult => ({ status: 'SKIPPED', reason });
  if (options.mode === 'preview' || options.dryRun === true || deps.dryRun()) {
    await deps.logPlan(seller, pitch, options.plannedLogPath ?? 'logs/planned.jsonl');
    return { status: 'DRY_RUN', reason: 'PLANNED_WITHOUT_BROWSER_OR_SENDING' };
  }
  if (!seller.contactFormUrl) return skip('NO_CONTACT_FORM');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(sender.email) || !sender.name.trim() || !sender.company.trim()) {
    throw new Error('VERIFIED_SENDER_CONFIG_REQUIRED');
  }
  if (await deps.exclusions(seller.name, seller.storeUrl, seller.contactFormUrl)) return skip('EXCLUDED_ORGANIZATION');
  const snapshot = options.suppressionSnapshot;
  const age = deps.now().getTime() - Date.parse(snapshot.capturedAt);
  if (!snapshot.source || !Array.isArray(snapshot.storeUrls) || !Number.isFinite(age)
    || age < 0 || age > 24 * 3600000) return skip('FRESH_SUPPRESSION_EXPORT_REQUIRED');
  const key = storeKey(seller.storeUrl);
  if (snapshot.storeUrls.some(url => storeKey(url) === key)) return skip('PRIOR_CONTACT_OR_OPT_OUT');
  if (options.mode === 'send' && !options.successSelector && !options.successUrl) return skip('SUCCESS_SELECTOR_OR_URL_REQUIRED');
  if (options.mode === 'send') {
    const jst = new Date(deps.now().getTime() + 9 * 3600000);
    if (jst.getUTCHours() < 9 || jst.getUTCHours() >= 18) {
      return skip('OUTSIDE_JST_BUSINESS_HOURS');
    }
  }
  let browser: Browser | undefined;
  let page: Page | undefined;
  let ledger: Ledger | undefined, reserved = false, requestAttempted = false;
  let intentRecorded = false;
  let blockHandler: ((reason: string) => Promise<SubmissionResult>) | undefined;
  let responseStatus: number | undefined;
  let routing = new AbortController();
  let readBlock: string | null = null;
  try {
    ledger = new Ledger(options.ledgerPath);
    if (ledger.isBlocked(key)) return skip('PERSISTED_BLOCKED_OR_CAPTCHA');
    await deps.robots(seller.contactFormUrl);
    const { url, address } = await deps.retry(() => deps.resolve(seller.contactFormUrl!));
    browser = await deps.launch(url.hostname, address);
    const context = await browser.newContext({ userAgent: AGENT, serviceWorkers: 'block', acceptDownloads: false });
    let armed = false;
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', async route => {
      const req = route.request();
      const destination = new URL(req.url());
      if (destination.origin !== url.origin || !['GET', 'HEAD', 'POST'].includes(req.method())) {
        return route.abort();
      }
      if (req.method() === 'POST' && !armed) return route.abort();
      try { await deps.wait(req.url(), routing.signal); } catch { return route.abort().catch(() => {}); }
      if (armed && (req.method() === 'POST' || req.isNavigationRequest())) requestAttempted = true;
      return route.fallback();
    });
    page = await context.newPage();
    page.setDefaultTimeout(10000);
    let activePage = page;
    const activeLedger = ledger;
    blockHandler = async reason => {
      let path: string | undefined;
      try { path = await screenshot(activePage, options.screenshotDir || 'logs/blocked', key); }
      catch (error) { deps.onError(error); }
      activeLedger.recordBlocked(key, reason, path);
      if (reserved) activeLedger.finish(key, intentRecorded ? 'UNKNOWN' : 'SKIPPED', reason);
      deps.block(url.href);
      return { status: intentRecorded ? 'UNKNOWN' : 'SKIPPED',
        reason: intentRecorded ? 'CAPTCHA_OR_BLOCK_AFTER_SUBMIT_REVIEW_REQUIRED' : reason,
        ...(path ? { screenshot: path } : {}) };
    };
    const navigation = await deps.retry(async () => {
      responseStatus = undefined;
      try {
        const response = await activePage.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 120000 });
        responseStatus = response?.status();
        if (!await detectBlock(activePage, responseStatus) && responseStatus
          && [408, 500, 502, 503, 504].includes(responseStatus)) throw new RetryableReadError('TRANSIENT_FORM_READ_HTTP');
        return response;
      } catch (error) {
        readBlock = await detectBlock(activePage, responseStatus).catch(() => null);
        if (readBlock) throw new Error('BLOCKED_DURING_READ_NO_RETRY');
        if (isTransientReadError(error)) {
          // A failed Chromium navigation can commit chrome-error after goto rejects.
          // Cancel its resource queue and use a fresh page before any read retry.
          routing.abort();
          await activePage.close().catch(() => {});
          routing = new AbortController();
          activePage = await context.newPage(); page = activePage;
          activePage.setDefaultTimeout(10000);
        }
        throw error;
      }
    });
    const initialBlock = await detectBlock(page, navigation?.status());
    if (initialBlock) return await blockHandler(initialBlock);
    if (/営業(?:目的)?.{0,12}(?:お断り|禁止|ご遠慮)|勧誘.{0,8}(?:禁止|お断り)|no solicitation/iu
      .test((await page.locator('body').innerText()).replace(/\s+/gu, ' '))) return skip('SOLICITATION_PROHIBITED');
    const plan = await inspectForm(page);
    if (!plan) return skip('FORM_AMBIGUOUS_OR_UNSUPPORTED');
    const successUrl = options.successUrl ? new URL(options.successUrl, url).href : undefined;
    if (successUrl && new URL(successUrl).origin !== url.origin) return skip('CROSS_ORIGIN_SUCCESS_URL');
    if ((options.successSelector && await page.locator(options.successSelector).isVisible())
      || (successUrl && page.url() === successUrl)) return skip('SUCCESS_MARKER_ALREADY_VISIBLE');
    if (!ledger.reserve(key, 10, deps.now())) return { status: 'DUPLICATE', reason: 'ALREADY_RESERVED_OR_DAILY_LIMIT' };
    reserved = true;
    const values: Record<Role, string> = { ...sender, subject: pitch.subject, message: pitch.body };
    for (const field of plan.fields) await field.locator.fill(values[field.role]);
    if (!await plan.form.evaluate(el => (el as HTMLFormElement).checkValidity())) {
      ledger.finish(key, 'SKIPPED', 'VALIDATION_OR_REQUIRED_CONSENT'); return skip('VALIDATION_OR_REQUIRED_CONSENT');
    }
    const filledBlock = await detectBlock(page);
    if (filledBlock) return await blockHandler(filledBlock);
    // Persist before the final click: crashes/timeouts are never blindly retried.
    ledger.finish(key, 'UNKNOWN', 'SUBMIT_INTENT_RECORDED');
    intentRecorded = true;
    const action = new URL(options.submissionUrl ?? await plan.form.getAttribute('action') ?? page.url(), page.url());
    if (action.origin !== url.origin) throw new Error('CROSS_ORIGIN_ACTION_REQUIRES_REVIEW');
    const accepted = page.waitForResponse(response => {
      const u = new URL(response.url());
      return u.origin === action.origin && u.pathname === action.pathname
        && response.request().method() === 'POST';
    }, { timeout: 15000 });
    armed = true;
    const [response] = await Promise.all([accepted, plan.submit.click({ noWaitAfter: true })]);
    responseStatus = response.status();
    const submissionBlock = await detectBlock(page, responseStatus);
    if (submissionBlock) return await blockHandler(submissionBlock);
    if (response.status() < 200 || response.status() >= 400) throw new Error('SUBMISSION_HTTP_FAILED');
    const successWaits: Promise<string>[] = [];
    if (options.successSelector) successWaits.push(page.locator(options.successSelector)
      .waitFor({ state: 'visible', timeout: 15000 }).then(() => 'success'));
    if (successUrl) successWaits.push(page.waitForURL(u => u.href === successUrl,
      { timeout: 15000, waitUntil: 'domcontentloaded' }).then(() => 'success'));
    const outcome = await Promise.race([...successWaits,
      page.locator(BLOCK_MARKERS).first().waitFor({ state: 'attached', timeout: 15000 }).then(() => 'block')]);
    const finalBlock = await detectBlock(page);
    if (outcome === 'block' || finalBlock) return await blockHandler(finalBlock ?? 'BLOCK_MARKER');
    if (!requestAttempted) throw new Error('UNVERIFIED_SUBMISSION');
    ledger.finish(key, 'SUBMITTED', 'CONFIRMATION_OBSERVED');
    return { status: 'SUBMITTED', reason: 'CONFIRMATION_OBSERVED_NOT_DELIVERY_OR_CONVERSION' };
  } catch (error) {
    deps.onError(error);
    if (page && blockHandler) {
      try {
        const blocked = readBlock ?? await detectBlock(page, responseStatus);
        if (blocked) return await blockHandler(blocked);
      } catch (recordError) { deps.onError(recordError); }
    }
    if (reserved) ledger?.finish(key, 'UNKNOWN', 'REVIEW_REQUIRED_NO_AUTOMATIC_RETRY');
    return { status: reserved ? 'UNKNOWN' : 'SKIPPED', reason: 'REVIEW_REQUIRED_NO_AUTOMATIC_RETRY' };
  } finally { routing.abort(); ledger?.close(); await browser?.close(); }
}
