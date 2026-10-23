// 自動リールの「実際の画面」部分の録画（scripts/auto-runway-reel.mjs から使う）。
// 2026-10-23 大隆さん「女優が説明しながらスマホ映像をメインで、価格履歴の画面を案内しよう。最後に女優が出てくる構成」→
// 同日 見せた試作に「金額がぼやけてるよ。あと、価格履歴グラフが出てきてない」:
// - HOSHILU 自身の料金（出品者向けページの 月額1,980円）はぼかさない
// - 商品ページの「今いくら？」と価格の記録（グラフ・7日前・30日最安など）は HOSHILU が記録した事実として出す（値下がり投稿と同じ例外）。
//   店が付けた商品名・販売先の名前・販売先の表はぼかしたまま。商品写真は下側の帯をぼかす（店の画像に焼き込まれた価格対策）
// - セラー向けの型で theme.screen_then_product のものは、出品者向けページ → お客さまが見る商品ページの価格グラフ、の 2 画面
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { BLUR_CSS, PRICE_TEXT, applyPhotoBands } from './build-social-screens.mjs';
import { voiceoverScreenPath, voiceoverSecondScreen, voiceoverScreenSplit } from './auto-runway-reel-lib.mjs';

const VIEWPORT = Object.freeze({ width: 405, height: 720 });
const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 HOSHILU-auto-reel';

// 商品ページでぼかす所（店が付けた商品名・販売先・販売先ごとの表）。今の価格と価格の記録はぼかさない
export const REEL_PRODUCT_BLUR = Object.freeze(['.product-name', '.product-mall', '.product-now-note', '.product-offers', '.product-offer-table']);
// 文字の中の金額をぼかさない所: HOSHILU が記録した価格（今いくら？・価格の記録）
export const REEL_PRICE_TEXT_KEEP = '.product-now-price,.product-history';

export function reelScreenCss(target) {
  const seller = String(target).startsWith('/for-sellers');
  return `${BLUR_CSS}
${REEL_PRODUCT_BLUR.join(',')}{filter:blur(9px)!important;user-select:none!important}
${seller ? '.price-card .price{filter:none!important}\n' : ''}.tab-bar,.install-banner,.pwa-install,.toast,[role="dialog"],.seller-sticky-cta,.cookie-banner{display:none!important}
.topbar,.seo-header,.business-top{position:static!important}
.hoshilu-reel-photo{position:relative!important;display:block!important}`;
}

// 1 ページを録画する。返す offset は「ぼかしが掛かって画面を見せ始めた秒」（それより前は使わない）
async function recordPage(browser, dir, name, target, seconds, { base, atHistory = false }) {
  const seller = target.startsWith('/for-sellers');
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, locale: 'ja-JP', isMobile: true, hasTouch: true,
    // 本番は CSP（style-src 'self'）があり、ぼかし用の CSS を入れられない（10/23 /preview 2 回目で判明）。撮影ブラウザだけ外す
    bypassCSP: true,
    serviceWorkers: 'block', recordVideo: { dir: path.join(dir, `screen-video-${name}`), size: VIEWPORT }, userAgent: USER_AGENT });
  await context.route(/^https?:\/\/(?:[a-z0-9-]+\.)*valuecommerce\.(?:com|ne\.jp)(?:[/:?]|$)/iu, (route) => route.abort());
  // 読み込み中（ぼかし前）の画面が映らないよう、最初は隠しておく
  await context.addInitScript(() => { document.documentElement.style.visibility = 'hidden'; });
  const started = Date.now();
  const page = await context.newPage();
  await page.goto(`${base}${target}`, { waitUntil: 'load', timeout: 60000 });
  const ready = target.startsWith('/product') ? '.product-history, .product-now' : seller ? 'main, h1' : '.media-drop';
  await page.waitForSelector(ready, { timeout: 30000 });
  if (target.startsWith('/product')) await page.waitForSelector('.product-chart', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: reelScreenCss(target) });
  // 文字の中の金額・割引率をぼかす（出品者向けページは HOSHILU の料金だけなのでしない。商品ページは記録の価格以外）
  if (!seller) {
    await page.evaluate(([source, keep]) => {
      const pattern = new RegExp(source, 'gu');
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const targets = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (!parent || parent.closest('script,style,svg,.hoshilu-price-mask') || parent.closest(keep)) continue;
        pattern.lastIndex = 0;
        if (pattern.test(node.nodeValue)) targets.push(node);
      }
      for (const node of targets) {
        const fragment = document.createDocumentFragment();
        let last = 0;
        const text = node.nodeValue;
        pattern.lastIndex = 0;
        for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
          fragment.append(text.slice(last, match.index));
          const span = document.createElement('span');
          span.className = 'hoshilu-price-mask';
          span.textContent = match[0];
          fragment.append(span);
          last = match.index + match[0].length;
        }
        fragment.append(text.slice(last));
        node.replaceWith(fragment);
      }
    }, [PRICE_TEXT.source, REEL_PRICE_TEXT_KEEP]);
  }
  await page.evaluate(() => {
    for (const img of document.querySelectorAll('.product-head > img')) {
      const wrap = document.createElement('span');
      wrap.className = 'hoshilu-reel-photo';
      img.replaceWith(wrap);
      wrap.append(img);
    }
  });
  await page.evaluate(applyPhotoBands, ['.hoshilu-reel-photo', '.media-drop-figure', '.product-image-gallery']);
  await page.waitForTimeout(500);
  // 価格の記録（グラフ）が画面に収まる位置。入るなら「今いくら？」から、入らなければ記録の見出しから。グラフの下が切れるならグラフの下に合わせる
  const scrollToHistory = (smooth) => page.evaluate((behavior) => {
    const section = document.querySelector('.product-history') || document.querySelector('.real-screens, .media-drops, section:nth-of-type(2)');
    const chart = document.querySelector('.product-history .product-chart');
    const now = document.querySelector('.product-now');
    const top = (node) => node.getBoundingClientRect().top + window.scrollY - 70;
    let to = section ? top(section) : window.innerHeight * 1.2;
    if (chart) {
      const bottom = chart.getBoundingClientRect().bottom + window.scrollY + 40;
      if (now && bottom - top(now) <= window.innerHeight) to = top(now);
      else if (bottom - to > window.innerHeight) to = bottom - window.innerHeight;
    }
    window.scrollTo({ top: Math.max(0, to), behavior });
  }, smooth ? 'smooth' : 'instant');
  if (atHistory) await scrollToHistory(false);
  else await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => { document.documentElement.style.visibility = ''; });
  await page.waitForTimeout(200);
  const offset = (Date.now() - started) / 1000;
  if (atHistory || (seller && seconds < 5)) {
    // 2 画面目（すでにグラフの位置）・短い出品者向けページ（見出しの「月額1,980円」を見せたまま）は動かさない
    await page.waitForTimeout(seconds * 1000);
  } else {
    // 最初の 1.5 秒は上（商品と今の価格）、そのあとゆっくり価格の記録（グラフ）へ
    await page.waitForTimeout(1500);
    await scrollToHistory(true);
    await page.waitForTimeout(Math.max(1000, (seconds - 1.5) * 1000));
  }
  const video = page.video();
  await page.close();
  await context.close();
  return { file: await video.path(), offset };
}

// plan.screen 秒ぶんの画面の映像を作る。2 画面のときは 1 本につないで返す（offset 0）
export async function recordReelScreen({ theme, plan, dir, base = 'https://hoshilu.app', modulePath = 'playwright', log = () => {} }) {
  let href = '';
  try {
    const response = await fetch(`${base}/api/media/top-drops?auto-reel=${Date.now()}`, { headers: { accept: 'application/json' } });
    const data = await response.json();
    // 服を先に並べた「今日の値下がり」の 1 番目（画像のある商品）
    href = String(data?.items?.[0]?.href || '');
  } catch {}
  const target = voiceoverScreenPath(theme, href);
  const second = voiceoverSecondScreen(theme, href);
  const firstSeconds = second ? voiceoverScreenSplit(theme, plan) : plan.screen;
  const { chromium } = await import(modulePath);
  const browser = await chromium.launch();
  try {
    const a = await recordPage(browser, dir, 'a', target, firstSeconds + 1, { base });
    if (!second) {
      log('screen recorded (live)', { target: target.replace(/key=[^&]+/u, 'key=…'), offset: a.offset });
      return { file: a.file, live: true, offset: a.offset, target };
    }
    const restSeconds = plan.screen - firstSeconds;
    const b = await recordPage(browser, dir, 'b', second, restSeconds + 1, { base, atHistory: true });
    const file = path.join(dir, 'screen-joined.mp4');
    const part = (input, offset, duration) => `[${input}:v]trim=start=${offset.toFixed(2)},setpts=PTS-STARTPTS,fps=24,scale=${VIEWPORT.width * 2}:${VIEWPORT.height * 2}:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration=${duration.toFixed(2)},trim=duration=${duration.toFixed(2)},setpts=PTS-STARTPTS,format=yuv420p[v${input}]`;
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', a.file, '-i', b.file, '-filter_complex',
      `${part(0, a.offset, firstSeconds)};${part(1, b.offset, restSeconds)};[v0][v1]concat=n=2:v=1:a=0[v]`,
      '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '24', file], { stdio: 'inherit' });
    const shown = `${target} → ${second}`.replace(/key=[^&]+/gu, 'key=…');
    log('screen recorded (live, 2 screens)', { target: shown, firstSeconds, restSeconds });
    return { file, live: true, offset: 0, target: shown };
  } finally { await browser.close(); }
}
