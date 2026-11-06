import type { Page } from 'playwright';

export const CAPTCHA = '[data-sitekey],.g-recaptcha,.h-captcha,.cf-turnstile,'
  + 'iframe[src*="captcha"],iframe[src*="challenges.cloudflare"],'
  + 'input[name*="captcha" i],input[name="cf-turnstile-response"]';
export const BLOCK_MARKERS = CAPTCHA + ',#cf-challenge-running,#challenge-form,#cf-error-details,.cf-error-code';

export async function detectBlock(page: Page, status?: number): Promise<string | null> {
  if (status === 403 || status === 429) return `HTTP_${status}`;
  if (await page.locator(CAPTCHA).count()) return 'CAPTCHA';
  if (await page.locator('#cf-challenge-running,#challenge-form,#cf-error-details,.cf-error-code').count()) {
    return 'CLOUDFLARE_BLOCK';
  }
  const url = new URL(page.url());
  if (url.pathname.startsWith('/cdn-cgi/challenge-platform/') || [...url.searchParams.keys()]
    .some(k => k.startsWith('__cf_chl_'))) return 'CHALLENGE_URL';
  const title = await page.title();
  if (/^just a moment|attention required.{0,8}cloudflare/iu.test(title)) return 'BLOCK_PAGE_TITLE';
  const text = (await page.locator('body').innerText()).slice(0, 12000).replace(/\s+/gu, ' ');
  if (/sorry, you have been blocked|checking your browser|アクセスがブロックされ|ブラウザを確認しています/iu.test(text)) {
    return 'BLOCK_PAGE_TEXT';
  }
  return null;
}
