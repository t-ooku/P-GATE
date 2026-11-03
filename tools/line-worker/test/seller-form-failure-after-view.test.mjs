import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// 2026-10-23: 画面に出ていない読込（先読み・リンク取得）の確認欄失敗を Seller フォーム失敗に数えない。
const source = readFileSync(new URL('../public/for-sellers.js', import.meta.url), 'utf8');
const landing = source.slice(source.indexOf('let sellerLandingCounted'), source.indexOf('// 2026-10-16 Cowork 依頼'));
const failure = source.slice(source.indexOf('const failureSent'), source.indexOf('// ショップURLは'));

function page(visibilityState, navigator = {}) {
  const events = [], listeners = new Map();
  let timer = null;
  const add = (type, fn) => listeners.set(type, fn);
  const context = createContext({
    sellerAttribution: { content: '' },
    sendSellerEvent(type, extra) { events.push({ type, content: extra.content }); },
    document: { visibilityState, addEventListener: add, removeEventListener() {} },
    addEventListener: add, removeEventListener() {},
    setTimeout(fn) { timer = fn; return 1; }, clearTimeout() { timer = null; },
    navigator
  });
  runInContext(landing, context);
  runInContext(failure, context);
  return { events, fail: code => runInContext(`sendFormFailure(${JSON.stringify(code)})`, context), elapse: () => timer?.(), tap: (type = 'pointerdown', ...event) => listeners.get(type)?.(...(event.length ? event : [{ isTrusted: true }])) };
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

// 2026-11-02 Cowork 依頼 §1・§2: 表示されているだけ（自動の閲覧）では数えず、確認欄の失敗も送らない。人が触った時だけ数える。
test('a visible page without any touch records neither the view nor the turnstile failure', () => {
  const p = page('visible');
  p.fail('turnstile_unavailable');
  p.elapse();
  assert.deepEqual(p.events, []);
});

test('an automated browser (navigator.webdriver) is never counted even when it clicks', () => {
  const p = page('visible', { webdriver: true });
  p.fail('turnstile_unavailable');
  p.tap();
  assert.deepEqual(p.events, []);
});

// 2026-11-03 Codex 受信箱 seller-synthetic-interaction-guard: スクリプトの合成イベント（isTrusted false・欠落）では数えない。
test('synthetic or unknown interaction events record neither the view nor the held failure', () => {
  for (const type of ['pointerdown', 'keydown', 'touchstart', 'wheel']) {
    const p = page('visible');
    p.fail('turnstile_unavailable');
    p.tap(type, { isTrusted: false });
    p.tap(type, {});
    p.tap(type, null);
    p.tap(type, { isTrusted: 'true' });
    p.elapse();
    assert.deepEqual(p.events, [], type);
  }
});

test('a trusted interaction sends one view and flushes the held failure exactly once', () => {
  for (const type of ['pointerdown', 'keydown', 'touchstart', 'wheel']) {
    const p = page('visible');
    p.fail('turnstile_unavailable');
    p.tap(type, { isTrusted: false });
    p.tap(type, { isTrusted: true });
    p.tap('pointerdown', { isTrusted: true });
    p.fail('turnstile_unavailable');
    assert.deepEqual(p.events, [
      { type: 'seller_landing_view', content: 'for-sellers' },
      { type: 'seller_form_failed', content: 'turnstile_unavailable' }
    ], type);
  }
});

test('navigator.webdriver stays excluded even for trusted interactions', () => {
  const p = page('visible', { webdriver: true });
  p.fail('turnstile_unavailable');
  for (const type of ['pointerdown', 'keydown', 'touchstart', 'wheel']) p.tap(type, { isTrusted: true });
  assert.deepEqual(p.events, []);
});
