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
  assert.match(html, /for-sellers\.js\?v=1980-9/u, 'キャッシュを更新');
});

// 2026-10-31 大隆さん OK（改善 2）: 7 日で出品者ページ 15 回・申込ボタン 0 回。スマホの 1 画面目に申込ボタンが無かった。
test('出品者ページ: スマホの画面下に固定の申込ボタン（既存の文言のまま・ほかのボタンかフォームが見えている間は隠す）', () => {
  const html = readFileSync(new URL('../public/for-sellers.html', import.meta.url), 'utf8');
  assert.match(html, /<a class="primary seller-sticky-cta" href="#businessForm" data-seller-cta="sticky-inquiry" hidden>無料の見本掲載を申し込む<\/a>/u);
  assert.match(html, /for-sellers-real\.css\?v=4/u);
  assert.match(source, /querySelectorAll\('\.seller-showcase-hero \.hero-actions, \.included-cta, #businessForm'\)/u);
  assert.match(source, /stickyCta\.hidden = visible\.size > 0;/u);
  const css = readFileSync(new URL('../public/for-sellers-real.css', import.meta.url), 'utf8');
  assert.match(css, /\.seller-sticky-cta\{display:none\}/u, 'PC では出さない');
  assert.match(html, /<meta name="description" content="まずは30日間、無料の見本掲載で/u, '検索結果の説明文も今の入口に合わせる');
});
