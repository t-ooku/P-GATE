import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// 2026-10-23: 画面に出ていない読込（先読み・リンク取得）の確認欄失敗を Seller フォーム失敗に数えない。
const source = readFileSync(new URL('../public/for-sellers.js', import.meta.url), 'utf8');
const landing = source.slice(source.indexOf('let sellerLandingCounted'), source.indexOf('// 2026-10-16 Cowork 依頼'));
const failure = source.slice(source.indexOf('const failureSent'), source.indexOf('// ショップURLは'));

function page(visibilityState) {
  const events = [], listeners = new Map();
  let timer = null;
  const add = (type, fn) => listeners.set(type, fn);
  const context = createContext({
    sellerAttribution: { content: '' },
    sendSellerEvent(type, extra) { events.push({ type, content: extra.content }); },
    document: { visibilityState, addEventListener: add, removeEventListener() {} },
    addEventListener: add, removeEventListener() {},
    setTimeout(fn) { timer = fn; return 1; }, clearTimeout() { timer = null; }
  });
  runInContext(landing, context);
  runInContext(failure, context);
  return { events, fail: code => runInContext(`sendFormFailure(${JSON.stringify(code)})`, context), elapse: () => timer?.(), tap: () => listeners.get('pointerdown')() };
}

test('hidden prefetch load records no seller_form_failed', () => {
  const p = page('hidden');
  p.fail('turnstile_unavailable');
  p.fail('turnstile_unavailable');
  assert.deepEqual(p.events, []);
});

test('failure before the view is counted is sent once, after seller_landing_view', () => {
  const p = page('visible');
  p.fail('turnstile_unavailable');
  assert.deepEqual(p.events, []);
  p.elapse();
  p.tap();
  assert.deepEqual(p.events, [
    { type: 'seller_landing_view', content: 'for-sellers' },
    { type: 'seller_form_failed', content: 'turnstile_unavailable' }
  ]);
});

test('failures after a counted view are sent immediately as fixed codes', () => {
  const p = page('hidden');
  p.tap();
  p.fail('browser_validation:contact_email');
  p.fail('network');
  assert.deepEqual(p.events.map(e => e.content), ['for-sellers', 'browser_validation:contact_email', 'network']);
});
