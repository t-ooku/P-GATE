#!/usr/bin/env node
// 2026-10-15 大隆さん指示「オウンドメディアの実画像を載せたり、ホシルのバズページも載せたり、もっと見る人が興味を持つ
// フィード投稿を」「価格だけぼかす」。本番の画面（買い物ノート・値下がり・ランキング×価格・ホシルバズ・検索）を
// スマホ幅で撮影し、HOSHILU の見出しを付けた 1080×1350 のカルーセル画像にする。
// - 金額・値下がり率・差額は撮影前に CSS でぼかす（SNS に価格を載せない）。商品写真はそのまま（大隆さん判断）。
// - 撮れなかった・中身が空の画面があれば失敗にする（壊れた画像を投稿しない）。
// - AI 生成なし・課金なし。GitHub Actions（.github/workflows/build-social-carousels.yml）で実行する。
// 使い方: node scripts/build-social-screens.mjs <出力フォルダ> [--base https://hoshilu.app]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

let outDir = '';
let BASE = 'https://hoshilu.app';

// SNS に出さないもの（価格・値下がり率・差額）。見えなくなるまでぼかす。
export const PRICE_SELECTORS = Object.freeze([
  '.media-drop-prices', '.media-drop-rate', '.media-tile-price', '.media-tile-badge-down', '.media-tile-badge-up',
  '.buzz-home-price', '.price', '.price-offer', '.product-price', '.unified-card-price'
]);
const BLUR_CSS = `${PRICE_SELECTORS.join(',')}{filter:blur(9px)!important;user-select:none!important}
.tab-bar,.install-banner,.pwa-install,.toast,[role="dialog"]{display:none!important}
.topbar,.seo-header{position:static!important}
html{scroll-behavior:auto!important}`;

export const SLIDES = Object.freeze([
  {
    id: 'notes-top', url: '/media', selector: '.media-hero', min: 1, extend: '.media-stats',
    kicker: 'HOSHILU NOTES', title: '毎日の値動きを、\nノートにしています。',
    body: 'ホシルが楽天市場・Yahoo!ショッピングの価格を\n毎日記録。「買い物ノート」で読めます。'
  },
  {
    id: 'price-drops', url: '/media/price-drops', selector: '.media-drop:has(.media-drop-figure img)', min: 2, count: 2,
    kicker: 'PRICE DROPS', title: '今週、\n値下がりした物。',
    body: '記録の中で、下がった商品だけを集めています。\n価格の動きはグラフで。（画像の価格はぼかしています）'
  },
  {
    id: 'ranking-price', url: '/media#ranking', selector: '.media-shelf', min: 1, count: 1,
    kicker: 'RANKING × PRICE', title: '売れてる物、\n値段は上がった？',
    body: 'モール公式ランキングの上位を、\nホシルの価格記録と並べています。'
  },
  {
    id: 'buzz', url: '/#tab-buzz', selector: '#buzzTab .buzz-home-shelf', min: 2, count: 2,
    kicker: 'HOSHILU BUZZ', title: '今、みんなが\nホシってる。',
    body: 'ジャンル別のトレンドを、ホシルバズに。\n気になったら、そのまま探せます。'
  },
  {
    id: 'search', url: '/', selector: '#knowledgeForm', min: 1, fromTop: true,
    kicker: 'SEARCH', title: '名前が分からなくても、\nまとめて探せる。',
    body: '見た目・用途・スクショから。\n登録なしで使えます。プロフィールのリンクから。'
  }
]);

async function capture(page, slide) {
  // トップは常時通信があり networkidle にならない（10/15 CI で 60 秒超過）。load 後は waitForSelector で待つ。
  await page.goto(`${BASE}${slide.url}`, { waitUntil: 'load', timeout: 60_000 });
  await page.addStyleTag({ content: BLUR_CSS });
  await page.waitForSelector(slide.selector, { state: 'visible', timeout: 45_000 });
  await page.waitForTimeout(1500);
  const found = await page.$$eval(slide.selector, (nodes) => nodes.filter((n) => n.getBoundingClientRect().height > 0).length);
  if (found < slide.min) throw new Error(`SCREEN_EMPTY:${slide.id}:${found}`);
  // 画像の読み込みを待つ（商品写真が空白のまま撮らない）
  await page.evaluate(async () => {
    const images = [...document.images].filter((img) => {
      const r = img.getBoundingClientRect();
      return r.top < window.innerHeight * 3 && r.width > 0;
    });
    await Promise.all(images.map((img) => img.complete ? null : new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
      setTimeout(resolve, 8000);
    })));
  });
  const blurred = await page.$$eval(PRICE_SELECTORS.join(','), (nodes) => nodes.filter((n) => getComputedStyle(n).filter.includes('blur')).length);
  const box = await page.evaluate(({ selector, count, extend, section, fromTop }) => {
    const nodes = [...document.querySelectorAll(selector)].filter((n) => n.getBoundingClientRect().height > 0);
    const first = section ? (document.querySelector(section) || nodes[0]) : nodes[0];
    const last = extend ? (document.querySelector(extend) || nodes[Math.min(nodes.length, count || 1) - 1])
      : nodes[Math.min(nodes.length, count || 1) - 1];
    if (fromTop) {
      window.scrollTo(0, 0);
      return { top: 0, height: Math.ceil(window.innerHeight * 1.1) };
    }
    first.scrollIntoView({ block: 'start' });
    const top = first.getBoundingClientRect().top + window.scrollY;
    const bottom = section ? top + window.innerHeight * 1.15 : last.getBoundingClientRect().bottom + window.scrollY;
    return { top: Math.max(0, Math.floor(top - 12)), height: Math.ceil(bottom - top + 24) };
  }, slide);
  const height = Math.min(box.height, 1100);
  const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: box.top, width: 390, height }, fullPage: true });
  return { shot, blurred, found };
}

function slideHtml(slide, index, total, shotBase64) {
  const lines = (value) => String(value).split('\n').map((line) => line.replace(/[&<>]/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])).join('<br>');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1080px;height:1350px;overflow:hidden;font-family:"Noto Sans CJK JP","Noto Sans JP",sans-serif;color:#14142a;
background:radial-gradient(circle at 12% 8%,#ffe3f1 0,transparent 42%),radial-gradient(circle at 92% 18%,#e3e0ff 0,transparent 46%),linear-gradient(160deg,#fff 0%,#f5f2ff 100%)}
.brand{position:absolute;left:64px;top:56px;display:flex;align-items:center;gap:16px;font-weight:900;font-size:34px;letter-spacing:.02em}
.brand i{width:60px;height:60px;border-radius:16px;background:linear-gradient(135deg,#ff4f9a,#7357ff 60%,#23b8ff);color:#fff;font-style:normal;display:grid;place-items:center;font-size:34px}
.brand small{display:block;font-size:18px;font-weight:700;color:#6b6b85}
.count{position:absolute;right:64px;top:72px;font-size:24px;font-weight:800;color:#7357ff}
.kicker{position:absolute;left:64px;top:160px;display:inline-block;padding:8px 18px;border-radius:999px;background:linear-gradient(110deg,#ff4f9a,#7357ff);color:#fff;font-size:22px;font-weight:800;letter-spacing:.14em}
h1{position:absolute;left:64px;right:64px;top:220px;font-size:66px;line-height:1.18;font-weight:900;letter-spacing:-.01em}
p.body{position:absolute;left:66px;right:64px;top:400px;font-size:27px;line-height:1.55;font-weight:600;color:#4b4b66}
.phone{position:absolute;left:50%;transform:translateX(-50%);top:520px;width:820px;height:760px;border-radius:44px;overflow:hidden;
background:#fff;box-shadow:0 30px 70px rgba(64,40,140,.22),0 0 0 10px #14142a}
.phone img{display:block;width:100%;height:auto}
</style></head><body>
<div class="brand"><i>H</i><span>HOSHILU<small>ホシル｜hoshilu.app</small></span></div>
<div class="count">${index + 1} / ${total}</div>
<span class="kicker">${lines(slide.kicker)}</span>
<h1>${lines(slide.title)}</h1>
<p class="body">${lines(slide.body)}</p>
<div class="phone"><img src="data:image/png;base64,${shotBase64}" alt=""></div>
</body></html>`;
}

async function main() {
  const args = process.argv.slice(2);
  outDir = args.find((value, index) => !value.startsWith('--') && args[index - 1] !== '--base') || '';
  const baseIndex = args.indexOf('--base');
  if (baseIndex >= 0) BASE = String(args[baseIndex + 1] || '').replace(/\/$/u, '');
  if (!outDir || !/^https?:\/\//u.test(BASE)) throw new Error('usage: build-social-screens.mjs <outDir> [--base URL]');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', isMobile: true, hasTouch: true,
    // 本番は CSP（style-src 'self'）で差し込みの CSS を拒む。撮影用のぼかしだけを当てるため、この撮影ブラウザでは CSP を無視する。
    bypassCSP: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1 HOSHILU-SocialScreens/1.0'
  });
  const page = await mobile.newPage();
  const shots = [];
  for (const slide of SLIDES) {
    const result = await capture(page, slide);
    console.log(`captured ${slide.id}: items=${result.found} blurred=${result.blurred}`);
    shots.push(result);
  }
  // 価格が出る画面（値下がり・ランキング）で、ぼかしが1つも効いていなければ止める
  for (const [index, slide] of SLIDES.entries()) {
    if (['price-drops', 'ranking-price'].includes(slide.id) && shots[index].blurred < 1) throw new Error(`PRICE_NOT_BLURRED:${slide.id}`);
  }
  await mkdir(outDir, { recursive: true });
  const composer = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  const files = [];
  for (const [index, slide] of SLIDES.entries()) {
    await composer.setContent(slideHtml(slide, index, SLIDES.length, shots[index].shot.toString('base64')), { waitUntil: 'load' });
    const file = path.join(outDir, `${index + 1}.jpg`);
    await writeFile(file, await composer.screenshot({ type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: 1080, height: 1350 } }));
    files.push({ file: `${index + 1}.jpg`, id: slide.id, items: shots[index].found, blurred: shots[index].blurred });
  }
  await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify({ base: BASE, captured_at: new Date().toISOString(), size: [1080, 1350], files }, null, 2)}\n`);
  await browser.close();
  console.log(`wrote ${files.length} slides to ${outDir}`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) await main();
