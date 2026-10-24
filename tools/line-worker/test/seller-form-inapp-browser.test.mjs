import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 2026-10-24 大隆さん「問題を見て諸々改善」: 10/22 Threads からの来訪者が出品者向けページのフォームで
// turnstile_unavailable のまま止まり（相談 0 件）。アプリ内ブラウザでは待たせず・赤くせず・そのまま送れる案内にする。
const source = readFileSync(new URL('../public/for-sellers.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/for-sellers.html', import.meta.url), 'utf8');

function isInAppBrowser(userAgent) {
  const body = source.match(/export function isInAppBrowser\(userAgent = navigator\.userAgent\) \{\n([\s\S]*?)\n\}/u)[1];
  return new Function('userAgent', body)(userAgent);
}

test('アプリ内ブラウザの判定: Threads（Barcelona）・Instagram・LINE・Facebook は true、Safari・Chrome は false', () => {
  assert.equal(isInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 334.0.0.0'), true);
  assert.equal(isInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.0.0 (iPhone15,2; iOS 17_5; ja_JP)'), true);
  assert.equal(isInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.8.0'), true);
  assert.equal(isInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/400.0]'), true);
  assert.equal(isInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'), false);
  assert.equal(isInAppBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'), false);
  assert.equal(isInAppBrowser(''), false);
});

test('アプリ内ブラウザでは Turnstile を 4 秒だけ待ち、出なければ静かに「そのまま送信できます」と案内する', () => {
  assert.match(source, /const TURNSTILE_WAIT_MS = inAppBrowser \? 4000 : 15000;/u);
  assert.match(source, /async function waitForTurnstileApi\(timeoutMs = TURNSTILE_WAIT_MS\)/u);
  assert.match(source, /if \(inAppBrowser\) \{ showTurnstileFailure\('in_app_browser', \{ quiet: true \}\); return; \}/u, '読み込めないときは例外にせず案内');
  assert.match(source, /status\.className = quiet \? 'status' : 'status error';/u, '赤いエラーにしない');
  assert.match(source, /そのまま「内容を送信」を押してください（受け付けます）/u);
  assert.match(source, /sendFormFailure\(quiet \? 'turnstile_unavailable_inapp' : 'turnstile_unavailable'\)/u, '計測は分けて残す');
  // unsupported / error のコールバックでも同じ扱い
  assert.equal((source.match(/if \(inAppBrowser\) showTurnstileFailure\('in_app_browser', \{ quiet: true \}\);/gu) || []).length, 2);
  // 送信側: turnstileFailure が立っていればトークン無しで送る（既存の仕組み）
  assert.match(source, /if \(!turnstileToken && !turnstileFailure\) \{/u);
  assert.match(html, /for-sellers\.js\?v=1980-8/u, 'キャッシュを更新');
});
