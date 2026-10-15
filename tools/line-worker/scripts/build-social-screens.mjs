#!/usr/bin/env node
// 2026-10-15 大隆さん指示「オウンドメディアの実画像を載せたり、ホシルのバズページも載せたり、もっと見る人が興味を持つ
// フィード投稿を」「価格だけぼかす」「今後の投稿も、実画像を踏まえて投稿して」。
// 本番の画面をスマホ幅で撮影し、HOSHILU の見出しを付けた 1080×1350 のカルーセル画像にする。セットは 3 つ:
//   notes  … 買い物ノート（表紙・値下がり・ランキング×価格）＋ホシルバズ＋検索（ユーザー向け）
//   buzz   … ホシルバズのジャンル棚 4 つ＋検索（ユーザー向け）
//   seller … 出品者向けページ（/for-sellers）の第一画面・できること・需要・料金・相談（セラー向け）
// - 商品の金額・値下がり率・差額は撮影前にぼかす（SNS に価格を載せない）。商品写真はそのまま（大隆さん判断）。
//   出品者向けページは HOSHILU 自身の料金（1,980円）なので、ぼかさない（従来のセラー向け画像と同じ）。
// - 撮れなかった・中身が空のセットは出力しない（壊れた画像を投稿しない）。3 セットとも撮れなければ失敗。
// - 出力: <出力フォルダ>/<セット>/<n>.jpg と <出力フォルダ>/manifest.json（撮れたセットだけ載る）。
//   投稿の差し替えは Worker（src/social-screens.mjs）が manifest を見て、当日の未投稿の行だけに行う。
// - AI 生成なし・課金なし。GitHub Actions（.github/workflows/build-social-carousels.yml）で毎日 17:30 JST に実行する。
// 使い方: node scripts/build-social-screens.mjs <出力フォルダ> [--base https://hoshilu.app]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

let outDir = '';
let BASE = 'https://hoshilu.app';

// SNS に出さないもの（商品の価格・値下がり率・差額）。見えなくなるまでぼかす。
export const PRICE_SELECTORS = Object.freeze([
  '.media-drop-prices', '.media-drop-rate', '.media-tile-price', '.media-tile-badge-down', '.media-tile-badge-up',
  '.buzz-home-price', '.price', '.price-offer', '.product-price', '.unified-card-price'
]);
// 商品名（店が付けた題名）にも金額・割引率が入る（例「79%OFF」「830円〜」「クーポンで1000円OFF」）。文字ごとにぼかす。
export const PRICE_TEXT = /(?:[¥￥]\s?\d[\d,]*|\d[\d,]*\s?円|\d+(?:\.\d+)?\s?[%％](?:\s?(?:OFF|off|オフ))?|\d{1,3}(?:,\d{3})+)/gu;
const BLUR_CSS = `${PRICE_SELECTORS.join(',')},.hoshilu-price-mask{filter:blur(9px)!important;user-select:none!important}
.hoshilu-price-mask{display:inline-block}`;
const LAYOUT_CSS = `.tab-bar,.install-banner,.pwa-install,.toast,[role="dialog"],.seller-sticky-cta{display:none!important}
.topbar,.seo-header{position:static!important}
html{scroll-behavior:auto!important}`;

const SEARCH_SLIDE = Object.freeze({
  id: 'search', url: '/', selector: '#knowledgeForm', min: 1, fromTop: true,
  kicker: 'SEARCH', title: '名前が分からなくても、\nまとめて探せる。',
  body: '見た目・用途・スクショから。\n登録なしで使えます。プロフィールのリンクから。'
});

export const SCREEN_SETS = Object.freeze({
  notes: Object.freeze([
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
    SEARCH_SLIDE
  ]),
  buzz: Object.freeze([
    {
      id: 'buzz-1', url: '/#tab-buzz', selector: '#buzzTab .buzz-home-shelf', min: 4, nth: 0, labelFrom: 'h3',
      kicker: 'HOSHILU BUZZ', title: '今、みんなが\nホシってる。',
      body: 'いま売れている物を、ジャンル別に。\n順位は楽天市場・Yahoo!ショッピングの公式ランキング。'
    },
    {
      id: 'buzz-2', url: '/#tab-buzz', selector: '#buzzTab .buzz-home-shelf', min: 4, nth: 1, labelFrom: 'h3',
      kicker: 'HOSHILU BUZZ', title: 'ジャンルごとに、\nいま売れてる物。',
      body: '気になる棚を、横にスワイプして見られます。\n（画像の価格はぼかしています）'
    },
    {
      id: 'buzz-3', url: '/#tab-buzz', selector: '#buzzTab .buzz-home-shelf', min: 4, nth: 2, labelFrom: 'h3',
      kicker: 'HOSHILU BUZZ', title: '気になったら、\nそのまま探せる。',
      body: '「価格通知」「気になる」「過去の価格と比べる」も\n棚からそのまま。'
    },
    {
      id: 'buzz-4', url: '/#tab-buzz', selector: '#buzzTab .buzz-home-shelf', min: 4, nth: 3, labelFrom: 'h3',
      kicker: 'HOSHILU BUZZ', title: '毎日、自動で\n新しくなる。',
      body: 'ランキングが変わると、棚も入れ替わります。\n明日はまた違う物が並びます。'
    },
    SEARCH_SLIDE
  ]),
  seller: Object.freeze([
    {
      id: 'seller-hero', url: '/for-sellers', selector: 'main', min: 1, fromTop: true, mask: false,
      kicker: 'FOR SELLERS', title: '探している人の、\n目の前へ。',
      body: 'Amazonや楽天の出店はそのまま。\n条件に合う検索で、検索結果の「PR」枠に。'
    },
    {
      id: 'seller-included', url: '/for-sellers#included', selector: '#included', min: 1, mask: false,
      kicker: 'FOR SELLERS', title: '掲載プランで\nできること。',
      body: '「PR」枠への掲載、探されている需要の確認まで。\nクリックによる追加料金はありません。'
    },
    {
      id: 'seller-demand', url: '/for-sellers#demand-now', selector: '#demand-now', min: 1, mask: false,
      kicker: 'FOR SELLERS', title: 'いま探されている物が、\n見える。',
      body: 'HOSHILUで探されて、見つからなかった需要を\n個人が分からない形でお見せします。'
    },
    {
      id: 'seller-pricing', url: '/for-sellers#pricing', selector: '#pricing', min: 1, mask: false,
      kicker: 'FOR SELLERS', title: '料金は、\nページのとおり。',
      body: '無料期間・カード登録・自動更新の条件も\nこのページに書いてあります。'
    },
    {
      id: 'seller-form', url: '/for-sellers#businessForm', selector: '#businessForm', min: 1, mask: false,
      kicker: 'FOR SELLERS', title: 'まずは、\n掲載見本の相談から。',
      body: '相談フォームの送信だけでは課金されません。\nプロフィールのリンクから。'
    }
  ])
});
// 互換: 10/15 の最初の版（notes 1 セット）
export const SLIDES = SCREEN_SETS.notes;

async function capture(page, slide) {
  // トップは常時通信があり networkidle にならない（10/15 CI で 60 秒超過）。load 後は waitForSelector で待つ。
  await page.goto(`${BASE}${slide.url}`, { waitUntil: 'load', timeout: 60_000 });
  await page.addStyleTag({ content: slide.mask === false ? LAYOUT_CSS : `${BLUR_CSS}\n${LAYOUT_CSS}` });
  await page.waitForSelector(slide.selector, { state: 'visible', timeout: 45_000 });
  await page.waitForTimeout(1500);
  const found = await page.$$eval(slide.selector, (nodes) => nodes.filter((n) => n.getBoundingClientRect().height > 0).length);
  if (found < slide.min) throw new Error(`SCREEN_EMPTY:${slide.id}:${found}`);
  const nth = Number(slide.nth || 0);
  // 撮る位置までスクロールしてから画像の読み込みを待つ（商品写真が空白のまま撮らない）
  await page.evaluate(({ selector, nth }) => {
    const nodes = [...document.querySelectorAll(selector)].filter((n) => n.getBoundingClientRect().height > 0);
    nodes[nth]?.scrollIntoView({ block: 'start' });
  }, { selector: slide.selector, nth });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const images = [...document.images].filter((img) => {
      const r = img.getBoundingClientRect();
      return r.top < window.innerHeight * 3 && r.bottom > -window.innerHeight && r.width > 0;
    });
    await Promise.all(images.map((img) => img.complete ? null : new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
      setTimeout(resolve, 8000);
    })));
  });
  let masked = 0;
  if (slide.mask !== false) {
    masked = await page.evaluate((source) => {
      const pattern = new RegExp(source, 'gu');
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const targets = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement?.closest('script,style,.hoshilu-price-mask')) continue;
        pattern.lastIndex = 0;
        if (pattern.test(node.nodeValue)) targets.push(node);
      }
      let count = 0;
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
          count += 1;
        }
        fragment.append(text.slice(last));
        node.replaceWith(fragment);
      }
      return count;
    }, PRICE_TEXT.source);
  }
  const blurred = masked + (slide.mask === false ? 0
    : await page.$$eval(PRICE_SELECTORS.join(','), (nodes) => nodes.filter((n) => getComputedStyle(n).filter.includes('blur')).length));
  const box = await page.evaluate(({ selector, count, extend, section, fromTop, nth, labelFrom }) => {
    const nodes = [...document.querySelectorAll(selector)].filter((n) => n.getBoundingClientRect().height > 0);
    const first = section ? (document.querySelector(section) || nodes[nth]) : nodes[nth];
    const lastIndex = Math.min(nodes.length, nth + (count || 1)) - 1;
    const last = extend ? (document.querySelector(extend) || nodes[lastIndex]) : nodes[lastIndex];
    const label = labelFrom ? String(first?.querySelector(labelFrom)?.textContent || '').replace(/\s+/gu, ' ').trim().slice(0, 24) : '';
    if (fromTop) {
      window.scrollTo(0, 0);
      return { top: 0, height: Math.ceil(window.innerHeight * 1.1), label };
    }
    first.scrollIntoView({ block: 'start' });
    const top = first.getBoundingClientRect().top + window.scrollY;
    const bottom = section ? top + window.innerHeight * 1.15 : last.getBoundingClientRect().bottom + window.scrollY;
    return { top: Math.max(0, Math.floor(top - 12)), height: Math.ceil(bottom - top + 24), label };
  }, { selector: slide.selector, count: slide.count, extend: slide.extend, section: slide.section, fromTop: slide.fromTop, nth, labelFrom: slide.labelFrom });
  const height = Math.min(box.height, 1100);
  const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: box.top, width: 390, height }, fullPage: true });
  return { shot, blurred, found, label: box.label };
}

function slideHtml(slide, index, total, shotBase64, label = '') {
  const lines = (value) => String(value).split('\n').map((line) => line.replace(/[&<>]/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])).join('<br>');
  const kicker = label ? `${slide.kicker}｜${label}` : slide.kicker;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1080px;height:1350px;overflow:hidden;font-family:"Noto Sans CJK JP","Noto Sans JP","Noto Color Emoji",sans-serif;color:#14142a;
background:radial-gradient(circle at 12% 8%,#ffe3f1 0,transparent 42%),radial-gradient(circle at 92% 18%,#e3e0ff 0,transparent 46%),linear-gradient(160deg,#fff 0%,#f5f2ff 100%)}
.brand{position:absolute;left:64px;top:56px;display:flex;align-items:center;gap:16px;font-weight:900;font-size:34px;letter-spacing:.02em}
.brand i{width:60px;height:60px;border-radius:16px;background:linear-gradient(135deg,#ff4f9a,#7357ff 60%,#23b8ff);color:#fff;font-style:normal;display:grid;place-items:center;font-size:34px}
.brand small{display:block;font-size:18px;font-weight:700;color:#6b6b85}
.count{position:absolute;right:64px;top:72px;font-size:24px;font-weight:800;color:#7357ff}
.kicker{position:absolute;left:64px;top:160px;display:inline-block;max-width:952px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:8px 18px;border-radius:999px;background:linear-gradient(110deg,#ff4f9a,#7357ff);color:#fff;font-size:22px;font-weight:800;letter-spacing:.1em}
h1{position:absolute;left:64px;right:64px;top:220px;font-size:66px;line-height:1.18;font-weight:900;letter-spacing:-.01em}
p.body{position:absolute;left:66px;right:64px;top:400px;font-size:27px;line-height:1.55;font-weight:600;color:#4b4b66}
.phone{position:absolute;left:50%;transform:translateX(-50%);top:520px;width:820px;height:760px;border-radius:44px;overflow:hidden;
background:#fff;box-shadow:0 30px 70px rgba(64,40,140,.22),0 0 0 10px #14142a}
.phone img{display:block;width:100%;height:auto}
</style></head><body>
<div class="brand"><i>H</i><span>HOSHILU<small>ホシル｜hoshilu.app</small></span></div>
<div class="count">${index + 1} / ${total}</div>
<span class="kicker">${lines(kicker)}</span>
<h1>${lines(slide.title)}</h1>
<p class="body">${lines(slide.body)}</p>
<div class="phone"><img src="data:image/png;base64,${shotBase64}" alt=""></div>
</body></html>`;
}

async function buildSet(browser, composer, page, setId, slides) {
  const shots = [];
  for (const slide of slides) {
    const result = await capture(page, slide);
    console.log(`captured ${setId}/${slide.id}: items=${result.found} blurred=${result.blurred} label=${result.label}`);
    shots.push(result);
  }
  // 商品の価格が出る画面（値下がり・ランキング）で、ぼかしが1つも効いていなければ止める
  for (const [index, slide] of slides.entries()) {
    if (['price-drops', 'ranking-price'].includes(slide.id) && shots[index].blurred < 1) throw new Error(`PRICE_NOT_BLURRED:${setId}/${slide.id}`);
  }
  const dir = path.join(outDir, setId);
  await mkdir(dir, { recursive: true });
  const files = [];
  for (const [index, slide] of slides.entries()) {
    await composer.setContent(slideHtml(slide, index, slides.length, shots[index].shot.toString('base64'), shots[index].label), { waitUntil: 'load' });
    await writeFile(path.join(dir, `${index + 1}.jpg`), await composer.screenshot({ type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: 1080, height: 1350 } }));
    files.push({ file: `${setId}/${index + 1}.jpg`, id: slide.id, items: shots[index].found, blurred: shots[index].blurred, label: shots[index].label });
  }
  return files;
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
  const composer = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  await mkdir(outDir, { recursive: true });
  const sets = {};
  const failures = {};
  for (const [setId, slides] of Object.entries(SCREEN_SETS)) {
    const page = await mobile.newPage();
    try {
      sets[setId] = { files: await buildSet(browser, composer, page, setId, slides) };
    } catch (error) {
      failures[setId] = String(error?.message || error).split('\n')[0].slice(0, 300);
      console.error(`set ${setId} skipped: ${failures[setId]}`);
    } finally {
      await page.close();
    }
  }
  await browser.close();
  if (!Object.keys(sets).length) throw new Error(`SCREENS_ALL_FAILED:${JSON.stringify(failures)}`);
  await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify({ base: BASE, captured_at: new Date().toISOString(), size: [1080, 1350], sets, failures }, null, 2)}\n`);
  console.log(`wrote sets ${Object.keys(sets).join(',')} to ${outDir}`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) await main();
