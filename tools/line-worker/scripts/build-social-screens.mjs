#!/usr/bin/env node
// 2026-10-15 大隆さん指示「オウンドメディアの実画像を載せたり、ホシルのバズページも載せたり、もっと見る人が興味を持つ
// フィード投稿を」「価格だけぼかす」「今後の投稿も、実画像を踏まえて投稿して」。
// 本番の画面をスマホ幅で撮影し、HOSHILU の見出しを付けた 1080×1350 のカルーセル画像にする。セットは 3 つ:
//   notes  … 買い物ノート（表紙・値下がり・ランキング×価格）＋ホシルバズ＋検索（ユーザー向け）
//   buzz   … ホシルバズのジャンル棚 4 つ＋検索（ユーザー向け）
//   seller … 出品者向けページ（/for-sellers）の第一画面・できること・需要・料金・相談（セラー向け）
// - 商品の金額・値下がり率・差額は撮影前にぼかす（SNS に価格を載せない）。商品写真は見せるが、写真に焼き込まれた販促文字
//   （価格・割引率）が入りやすい下側の帯だけぼかす（2026-10-16、PHOTO_BAND_RATIO）。
//   出品者向けページは HOSHILU 自身の料金（1,980円）なので、ぼかさない（従来のセラー向け画像と同じ）。
// - 撮れなかった・中身が空のセットは出力しない（壊れた画像を投稿しない）。3 セットとも撮れなければ失敗。
// - 出力: <出力フォルダ>/<セット>/<n>.jpg と <出力フォルダ>/manifest.json（撮れたセットだけ載る）。
//   投稿の差し替えは Worker（src/social-screens.mjs）が manifest を見て、当日の未投稿の行だけに行う。
// - AI 生成なし・課金なし。GitHub Actions（.github/workflows/build-social-carousels.yml）で毎日 17:30 JST に実行する。
// 使い方: node scripts/build-social-screens.mjs <出力フォルダ> [--base https://hoshilu.app]
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
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
// 商品写真（店の画像）の中にも価格・割引率が焼き込まれている（2026-10-16 Codex 点検: notes/2.jpg の写真右下「クーポン利用で10%OFF」）。
// DOM の文字ではないので上のぼかしは届かない。楽天・Yahoo! の商品画像の販促文字は下側の帯に入ることが多いため、
// 写真の下側 PHOTO_BAND_RATIO を必ずぼかす（写真全体は消さない）。同じ写真の複製に blur を掛け、下帯だけ切り抜いて重ねる
// （backdrop-filter は撮影ブラウザでほとんど効かず、文字が読めたため不採用）。外部 OCR・課金なし。
// 限界: 上側や中央に焼き込まれた文字はこの帯では隠れない（端末内 OCR も試したが、この代表例を読めず採用しなかった）。
// 「未検出＝漏れなし」とはしないので、公開前の目視確認は残す。
// 2026-10-16: 出品者向けページ用の検索結果の撮影（scripts/build-seller-lp-shots.mjs）でも同じ下帯ぼかしを掛ける（.product-image-gallery）。
export const PHOTO_SELECTORS = Object.freeze(['.media-drop-figure', '.media-tile-figure', '.buzz-home-thumb', '.product-image-gallery', '.unified-pr-image']);
export const PHOTO_BAND_RATIO = 0.3;
// 2026-10-16 20:13 追加（Claude、20261016/buzz/3.jpg で写真の左上に「50%OFF 3,850円」が読めた）: 下帯の外に焼き込まれた
// 価格・割引率を、撮影直前の画面を端末内の tesseract（OS パッケージ、外部送信・課金なし）で読み、読めた文字が載っている写真だけを
// 写真全体ぼかしに切り替える。写真全体を一律に消すのではなく、読めた写真だけ。読めなかった＝漏れなし、とはしない（目視確認は残す）。
// OCR が無い環境では manifest の photo_ocr を unavailable にして従来どおり撮る（SOCIAL_SCREENS_REQUIRE_OCR=1 なら止める）。
// 写真の中の順位バッジ（「30位」→「304%」等）を拾わないよう、% 単独は数えず OFF・金額（3,850 / ¥ / 円）だけを数える。
export const PHOTO_OCR_TEXT = /(?:OFF|[¥￥]\s?\d|\d\s?円|\d{1,3}[,.]\d{3}(?!\d))/iu;
export const PHOTO_OCR_SCALE = 3;
// tesseract の TSV（level 5 = 単語）と、写真の位置（撮影範囲の CSS px）から、価格らしい文字が載っている写真の番号を返す。
export function photoIndexesWithPriceText(tsv, rects, scale = PHOTO_OCR_SCALE) {
  const hits = new Set();
  const words = [];
  for (const line of String(tsv || '').split('\n').slice(1)) {
    const cols = line.split('\t');
    if (cols.length < 12 || cols[0] !== '5') continue;
    const text = cols.slice(11).join('\t').trim();
    if (!text || !PHOTO_OCR_TEXT.test(text)) continue;
    const [left, top, width, height] = cols.slice(6, 10).map(Number);
    const cx = (left + width / 2) / scale;
    const cy = (top + height / 2) / scale;
    const index = rects.findIndex((r) => cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height);
    words.push({ text, inPhoto: index >= 0 });
    if (index >= 0) hits.add(index);
  }
  return { indexes: [...hits].sort((a, b) => a - b), words };
}
let ocrAvailable;
export async function runTesseract(png, crop = null) {
  if (ocrAvailable === false) return null;
  const dir = await mkdtemp(path.join(os.tmpdir(), 'hoshilu-ocr-'));
  try {
    const file = path.join(dir, 'probe.png');
    await writeFile(file, png);
    if (crop) {
      // Small promotional badges disappear in OCR of a whole Japanese page.
      // Crop the already captured pixels locally; never fetch another image.
      await new Promise((resolve, reject) => execFile('python3', ['-c',
        'import sys,json;from PIL import Image;p=sys.argv[1];r=json.loads(sys.argv[2]);im=Image.open(p);im.crop(tuple(r)).resize(((r[2]-r[0])*2,(r[3]-r[1])*2)).save(p)',
        file, JSON.stringify(crop)], { timeout: 10000 }, error => error ? reject(error) : resolve()));
    }
    const out = await new Promise((resolve, reject) => {
      execFile('tesseract', [file, 'stdout', '-l', 'eng', '--psm', '11', 'tsv'], { maxBuffer: 32 * 1024 * 1024, timeout: 120_000 },
        (error, stdout) => (error ? reject(error) : resolve(stdout)));
    });
    ocrAvailable = true;
    return out;
  } catch (error) {
    if (error?.code === 'ENOENT') { ocrAvailable = false; return null; }
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function photoPriceCropIndexes(png, rects, clip, recognize = runTesseract) {
  const indexes = [];
  for (let index = 0; index < rects.length; index += 1) {
    const r = rects[index];
    const left = Math.max(0, r.x), top = Math.max(0, r.y);
    const right = Math.min(clip.width, r.x + r.width), bottom = Math.min(clip.height, r.y + r.height);
    if (right - left < 8 || bottom - top < 8) continue;
    const crop = [left, top, right, bottom].map(n=>Math.round(n * PHOTO_OCR_SCALE));
    const tsv = await recognize(png, crop);
    if (tsv === null) throw new Error('PHOTO_OCR_UNAVAILABLE:CROP');
    const priceFound = String(tsv).split('\n').slice(1).some(line => {
      const cols = line.split('\t');
      return cols[0] === '5' && cols.length >= 12 && PHOTO_OCR_TEXT.test(cols.slice(11).join('\t'));
    });
    if (priceFound) indexes.push(index);
  }
  return indexes;
}
// 撮る範囲の画面を読み、価格らしい文字が載った写真を全体ぼかしにする。2 回目でも残れば、そのセットは出さない。
async function ocrMaskPhotos(page, clip, slideId) {
  const rectsOf = () => page.evaluate(({ selectors, top }) => [...document.querySelectorAll(selectors.join(','))].map((n) => {
    const r = n.getBoundingClientRect();
    return { x: r.left, y: r.top + window.scrollY - top, width: r.width, height: r.height };
  }), { selectors: PHOTO_SELECTORS, top: clip.y });
  let full = 0;
  for (let round = 0; round < 2; round += 1) {
    const png = await page.screenshot({ type: 'png', clip, fullPage: true });
    const tsv = await runTesseract(png);
    if (tsv === null) {
      if (process.env.SOCIAL_SCREENS_REQUIRE_OCR === '1') throw new Error(`PHOTO_OCR_UNAVAILABLE:${slideId}`);
      return { ocr: 'unavailable', full: 0 };
    }
    const rects = await rectsOf();
    const { indexes: pageIndexes, words } = photoIndexesWithPriceText(tsv, rects);
    const cropIndexes = await photoPriceCropIndexes(png, rects, clip);
    const indexes = [...new Set([...pageIndexes, ...cropIndexes])];
    if (cropIndexes.length) console.log(`ocr ${slideId} photo crops detected: ${cropIndexes.length}`);
    if (words.length) console.log(`ocr ${slideId} round${round + 1}: ${words.map((w) => `${w.inPhoto ? 'photo' : 'page'}:${w.text}`).join(' ')}`);
    if (!indexes.length) return { ocr: 'tesseract', full };
    if (round === 1) throw new Error(`PHOTO_PRICE_OCR_REMAINS:${slideId}:${indexes.length}`);
    full += await page.evaluate(({ selectors, indexes }) => {
      const nodes = [...document.querySelectorAll(selectors.join(','))];
      for (const i of indexes) nodes[i]?.classList.add('hoshilu-photo-full');
      return indexes.length;
    }, { selectors: PHOTO_SELECTORS, indexes });
    await page.waitForTimeout(300);
  }
  return { ocr: 'tesseract', full };
}
const PHOTO_RANK_SELECTORS = Object.freeze(['.media-drop-rank', '.media-tile-rank', '.buzz-home-rank']);
export const BLUR_CSS = `${PRICE_SELECTORS.join(',')},.hoshilu-price-mask{filter:blur(9px)!important;user-select:none!important}
.hoshilu-price-mask{display:inline-block}
${PHOTO_SELECTORS.join(',')}{position:relative!important}
.hoshilu-photo-band{position:absolute!important;inset:0!important;margin:0!important;overflow:hidden!important;background:#fff!important;clip-path:inset(${Math.round((1 - PHOTO_BAND_RATIO) * 100)}% 0 0 0)!important;z-index:1!important;pointer-events:none!important}
.hoshilu-photo-band img{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;margin:0!important;filter:blur(12px) saturate(.7)!important;transform:scale(1.3)!important;transform-origin:50% 85%!important}
.hoshilu-photo-full>.hoshilu-photo-band{clip-path:inset(0 0 0 0)!important}
.hoshilu-photo-full>.hoshilu-photo-band img{filter:blur(16px) saturate(.7)!important}
${PHOTO_RANK_SELECTORS.join(',')}{z-index:2!important}`;
const LAYOUT_CSS = `.tab-bar,.install-banner,.pwa-install,.toast,[role="dialog"],.seller-sticky-cta{display:none!important}
.topbar,.seo-header,.business-top{position:static!important}
html{scroll-behavior:auto!important}`;

// 出品者向けページの「実際の画面」は、スマホ幅では横スワイプの列になる。撮影の時だけ縦に並べて 1 枚ずつ撮る。
const SELLER_REAL_CSS = '.real-screens-track{display:block!important;overflow:visible!important;margin:0!important;padding:0!important}'
  + '.real-screen{width:84%!important;margin:0 auto 28px!important}.real-swipe-hint{display:none!important}';

// 出品者向けの撮影で使う検索語（固定の見本。利用者の検索ではない）。scripts/build-seller-lp-shots.mjs の SAMPLE_QUERY と同じ
export const SELLER_SAMPLE_QUERY = '玄関に置ける スリムな傘立て';

// 値下がりの商品カードを、写真を大きく（縦に積む）・下がり幅の札を大きくして撮る。撮影の時だけ当てる。
const DROP_CARD_CSS = '.media-drop a{grid-template-columns:1fr!important}.media-drop-figure{width:100%!important;max-width:none!important}'
  + '.media-drop-figure img{width:100%!important;height:auto!important;aspect-ratio:1/1;object-fit:cover}'
  + '.media-drop-rate{padding:.45rem .8rem!important;border-radius:16px!important}.media-drop-rate b{font-size:2.6rem!important}'
  + '.media-drop-prices{font-size:1.25rem!important}'
  // 2026-10-17 大隆さん「商品名にぼかし入れて」: 店が付けた商品名は丸ごとぼかす（ジャンルの札・写真・記録した価格で見せる）
  + '.media-drop-body strong{filter:blur(7px)!important;user-select:none!important}';

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
  // 2026-10-17 大隆さん「価格履歴から、何%下がってる最中のリアル画像を Web や SNS で販促に。デカデカとアピール。
  // 若い者向けや主婦向け、流行ってるアパレルや生活雑貨も。特に韓国系。ホシルで検索するよう促しも」。
  // 「買い物ノート」の値下がりページ（/media/price-drops）の商品カードを 1 枚ずつ撮る。並びはページの data-focus
  // （owned-media.mjs の withDropFocus: 韓国系 → アパレル → 生活雑貨 → 美容 を 1 つずつ回す）。
  // ホシルが記録した価格と下がり幅はぼかさず、下がり幅は大きく出す。書き方は「記録の事実」（14 日間の最高値から・撮影日の時点）。
  drops: Object.freeze([
    // 2026-10-17 大隆さん「リアル画像をいろんなパターンで出していこう。商品は半無限にあるわけだから」: 1 投稿に 6 商品まで。
    // 5・6 枚目は、その日の値下がりが足りなければ出さない（optional）。先頭のジャンルは日替わり（withDropFocus の rotate）。
    ...[1, 2, 3, 4, 5, 6].map((focus) => Object.freeze({
      id: `drop-${focus}`, url: '/media/price-drops', selector: `.media-drop[data-focus="${focus}"]`, min: 1, count: 1, optional: focus > 4,
      unmask: Object.freeze(['.media-drop-prices', '.media-drop-rate']), css: DROP_CARD_CSS, fit: true, maxHeight: 760,
      labelFrom: '.media-drop-genre', bigFrom: '.media-drop-rate', bigNote: Object.freeze(['値下がり中', '下がってる今', '最高値から↓']),
      kicker: 'PRICE DROP', title: '今、\n値下がり中。',
      body: '{date} ホシルの記録で、14日間の最高値から下がった幅です。\n価格は変わります。欲しい物は、ホシルで検索。'
    })),
    Object.freeze({
      ...SEARCH_SLIDE, id: 'drops-search',
      kicker: 'SEARCH', title: '欲しい物は、\nホシルで検索。',
      body: '名前が分からなくても、言葉やスクショで。\n値下がりしたら、お知らせします。プロフィールのリンクから。'
    })
  ]),
  // 2026-10-16 大隆さん「肝心なリアル画像が全ページ見切れてる」（20:15 の投稿を削除）: 出品者向けページをスマホ枠ごと撮ると、
  // 中の実画面がカルーセルの枠で切れていた。本番の画面の「部品」だけ（PR 枠・ホシっとく・検索欄・売れ筋の棚・需要・料金・相談の流れ）を
  // 上端から下端まで撮り、枠をその大きさに合わせる（fit）。どの画面も途中で切らない。
  // 並び（1〜7 枚目）は予約済みの投稿（Threads は 1・3・4・5・6・7 枚目を 1 枚ずつ使う）に合わせて変えない。
  seller: Object.freeze([
    {
      // 掲載見本: 本番の検索結果の先頭 2 件を、撮る画面の中だけ PR 枠へ移す（店名「あなたのお店（見本）」・価格なし）
      id: 'seller-hero', url: '/', selector: '.unified-pr-card', ready: '.unified-head', from: '.unified-head', extend: '.unified-pr', min: 1,
      search: SELLER_SAMPLE_QUERY, hide: '#searchSuggestList', prSample: true, fit: true, maxHeight: 760,
      kicker: 'FOR SELLERS', title: '探している人の、\n目の前へ。',
      body: '条件に合う検索で、一番上の「PR」枠に（最大2件）。\n本番の画面です（PR枠の商品は見本）。'
    },
    {
      id: 'seller-real-results', url: '/', selector: '#resultCards > .continuous-search-card', ready: '#resultCards > .continuous-search-card', min: 1,
      search: SELLER_SAMPLE_QUERY, hide: '#searchSuggestList', fit: true, maxHeight: 760,
      kicker: 'REAL SCREENS', title: '見つからない物は、\n「ホシっとく」。',
      body: '保存された条件は、お店に「探されている需要」として\n届きます（個人が分からない形・5人以上）。'
    },
    {
      id: 'seller-real-search', url: '/', selector: '#knowledgeForm', extend: '#submitButton', min: 1,
      typeOnly: SELLER_SAMPLE_QUERY, hide: '#searchSuggestList', fit: true, maxHeight: 760,
      kicker: 'REAL SCREENS', title: '名前が分からなくても、\n探される。',
      body: '「玄関に置ける スリムな傘立て」のような言葉で、\nお客さまが商品を探します。'
    },
    {
      id: 'seller-real-buzz', url: '/#tab-buzz', selector: '#buzzTab .buzz-home-shelf', min: 1, count: 1, fit: true, maxHeight: 760,
      kicker: 'REAL SCREENS', title: '売れ筋の棚と、\n「価格通知」。',
      body: '今すぐ買わないお客さまも、\n「気になる」「価格通知」で商品を残せます。'
    },
    {
      id: 'seller-demand', url: '/for-sellers#demand-now', selector: '#demandNow > article', min: 1, count: 3, mask: false, fit: true, maxHeight: 760,
      kicker: 'FOR SELLERS', title: 'いま探されている物が、\n見える。',
      body: 'HOSHILUで探されて、見つからなかった需要を\n個人が分からない形でお見せします。'
    },
    {
      id: 'seller-pricing', url: '/for-sellers', selector: '.seller-showcase-hero .hero-price', min: 1, mask: false, fit: true, maxHeight: 760,
      kicker: 'FOR SELLERS', title: '料金は、\nページのとおり。',
      body: '無料期間・カード登録・自動更新の条件も\nこのページに書いてあります。'
    },
    {
      id: 'seller-form', url: '/for-sellers#businessForm', selector: '#businessForm .entry-summary', extend: '#businessForm .payment-note', min: 1,
      mask: false, fit: true, maxHeight: 760,
      kicker: 'FOR SELLERS', title: 'まずは、\n掲載見本の相談から。',
      body: '相談フォームの送信だけでは課金されません。\nプロフィールのリンクから。'
    }
  ])
});
// 互換: 10/15 の最初の版（notes 1 セット）
export const SLIDES = SCREEN_SETS.notes;

// 撮影ページの中で動く（page.evaluate に渡す）。写る商品写真ごとに、ぼかした複製を下帯だけ重ね、効いている枚数を返す。
export function applyPhotoBands(selectors) {
  const visible = [...document.querySelectorAll(selectors.join(','))].filter((n) => {
    const r = n.getBoundingClientRect();
    const source = n.querySelector('img:not(.hoshilu-photo-band img)');
    // 読み込めなかった写真（何も写っていない）は数えない
    return r.width > 0 && r.height > 0 && source && source.naturalWidth > 0;
  });
  for (const figure of visible) {
    if (figure.querySelector(':scope > .hoshilu-photo-band')) continue;
    const source = figure.querySelector('img:not(.hoshilu-photo-band img)');
    // 不透明の下地＋ぼかした複製。写真の端でぼかしが透けて元の文字が見えないように、複製は拡大して端を外に出す
    const band = document.createElement('span');
    band.className = 'hoshilu-photo-band';
    band.setAttribute('aria-hidden', 'true');
    const copy = source.cloneNode(false);
    copy.removeAttribute('loading');
    copy.removeAttribute('width');
    copy.removeAttribute('height');
    copy.removeAttribute('class');
    copy.alt = '';
    copy.style.objectFit = getComputedStyle(source).objectFit;
    band.append(copy);
    figure.append(band);
  }
  const masked = visible.filter((figure) => {
    const band = figure.querySelector(':scope > .hoshilu-photo-band');
    const copy = band?.querySelector('img');
    if (!copy) return false;
    const bandStyle = getComputedStyle(band);
    return copy.complete && copy.naturalWidth > 0 && /blur/u.test(getComputedStyle(copy).filter) && /inset/u.test(bandStyle.clipPath)
      && bandStyle.backgroundColor === 'rgb(255, 255, 255)' && band.getBoundingClientRect().height >= figure.getBoundingClientRect().height * 0.9;
  });
  return { photos: visible.length, masked: masked.length };
}

async function maskPhotos(page) {
  await page.evaluate(applyPhotoBands, PHOTO_SELECTORS);
  // 複製の写真が描かれるまで待ってから数え直す（2 回目は複製を増やさない）
  await page.waitForFunction(() => [...document.querySelectorAll('.hoshilu-photo-band img')].every((img) => img.complete), null, { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(300);
  return page.evaluate(applyPhotoBands, PHOTO_SELECTORS);
}

// 2026-10-16: 出品者向けページの実画像（scripts/build-seller-lp-shots.mjs）からも使う。
export function setScreensBase(url) {
  BASE = String(url || '').replace(/\/$/u, '');
}

// 2026-10-16 大隆さん指示「リアルな掲載見本を画面掲載して」: 出品者向けページの掲載見本。
// まだ掲載店が無いので、本番の検索結果（/api/knowledge の応答）の先頭 2 件を、その画面の中だけ「PR」枠へ移して撮る。
// 店名は「あなたのお店（見本）」、価格は出さない（「価格はリンク先で確認」）。本番のデータ・D1 は変えない。撮った画像には「見本」と書く。
export const PR_SAMPLE_SHOP = 'あなたのお店（見本）';
export function samplePrResponse(body, base = BASE) {
  const unified = body?.unified_results;
  if (!unified || !Array.isArray(unified.items)) return body;
  const https = (value) => /^https:\/\//u.test(String(value || ''));
  const picks = unified.items.filter((item) => !item?.listing && https(item?.image_url) && https(item?.url) && item?.product_name).slice(0, 2);
  if (!picks.length) return body;
  const moved = new Set(picks.map((item) => item.position));
  unified.sponsored = picks.map((item, index) => ({
    label: 'PR', source: 'HOSHILU_PR', pilot_id: 'SAMPLE', product_id: String(index + 1), shop_name: PR_SAMPLE_SHOP,
    product_name: item.product_name, image_url: item.image_url, url: `${base}/for-sellers`, marketplace_label: '販売先',
    price_jpy: null, price_verified_at: ''
  }));
  unified.items = unified.items.filter((item) => !moved.has(item.position));
  if (Array.isArray(unified.price_order)) unified.price_order = unified.price_order.filter((position) => !moved.has(position));
  return body;
}

// 掲載見本の PR 枠を、画面の中で組み立てる（応答の差し替えが効かないときの代わり）。本番の画面と同じ class
// （unified-results-ui.mjs の prBlock と同じ形）で作るので、見た目は本番の PR 枠と同じ。通常の列の先頭 2 件を PR 枠へ移す。
// page.evaluate に渡すので、外の変数は使わない。
export function injectSamplePr(shop) {
  if (document.querySelector('.unified-pr-card')) return document.querySelectorAll('.unified-pr-card').length;
  const head = document.querySelector('.unified-head');
  if (!head) return 0;
  const cards = [...document.querySelectorAll('.unified-card:not(.unified-card-listing)')]
    .filter((card) => card.querySelector('.unified-card-image img') && card.querySelector('.unified-card-name')).slice(0, 2);
  if (!cards.length) return 0;
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const box = make('section', 'unified-pr');
  box.setAttribute('aria-label', 'PR：HOSHILU Seller の掲載商品');
  const title = make('p', 'unified-pr-head');
  title.append(make('span', 'unified-pr-badge', 'PR'), document.createTextNode('HOSHILU Seller の掲載商品'));
  box.append(title);
  const list = make('div', 'unified-pr-list');
  for (const card of cards) {
    const link = make('a', 'unified-pr-card');
    const figure = make('div', 'unified-pr-image');
    const img = document.createElement('img');
    img.src = card.querySelector('.unified-card-image img').src;
    img.alt = '';
    figure.append(img, make('span', 'unified-pr-badge unified-pr-badge-on-image', 'PR'));
    const body = make('div', 'unified-pr-body');
    body.append(make('strong', 'unified-pr-name', card.querySelector('.unified-card-name').textContent));
    body.append(make('span', 'unified-pr-shop', `${shop}・販売先`));
    body.append(make('span', 'unified-pr-price unified-pr-price-unknown', '価格はリンク先で確認'));
    body.append(make('span', 'unified-pr-open', '販売先で見る'));
    link.append(figure, body);
    list.append(link);
    card.remove();
  }
  box.append(list);
  head.after(box);
  return cards.length;
}

export async function capture(page, slide) {
  if (slide.prSample) {
    await page.route('**/api/knowledge', async (route) => {
      const response = await route.fetch();
      let body;
      try { body = await response.json(); } catch { return route.fulfill({ response }); }
      return route.fulfill({ response, json: samplePrResponse(body) });
    });
  }
  // トップは常時通信があり networkidle にならない（10/15 CI で 60 秒超過）。load 後は waitForSelector で待つ。
  await page.goto(`${BASE}${slide.url}`, { waitUntil: 'load', timeout: 60_000 });
  await page.addStyleTag({ content: slide.mask === false ? LAYOUT_CSS : `${BLUR_CSS}\n${LAYOUT_CSS}` });
  // unmask: ホシルが記録した価格・下がり幅だけはぼかさない（値下がり中の投稿。2026-10-17 大隆さん決定「記録の事実で書く」）。
  // 店が付けた商品名や写真の中の価格・割引率は、これまでどおりぼかす。
  if (slide.unmask?.length) await page.addStyleTag({ content: `${slide.unmask.join(',')}{filter:none!important}` });
  // 検索欄に言葉を入れる（typeOnly は入れるだけ、search は入れて検索する）。検索語は固定の見本（利用者の検索ではない）。
  if (slide.hide) await page.addStyleTag({ content: `${slide.hide}{display:none!important}` });
  if (slide.css) await page.addStyleTag({ content: slide.css });
  const words = slide.search || slide.typeOnly;
  if (words) {
    await page.waitForSelector('#query', { state: 'visible', timeout: 45_000 });
    await page.fill('#query', words);
    if (slide.search) await page.click('#submitButton');
  }
  // ready: 撮る範囲とは別に「中身がそろった」目印を待つ（検索結果は枠が先に出て、商品カードが後から入る）
  // 一致する要素が複数あると waitForSelector は先頭の 1 つが見えるまで待つ（10/16 #647〜#650: 先頭が畳まれた行で永久に待った）。
  // どれか 1 つでも見えれば進む。
  if (slide.ready) {
    await page.waitForFunction((selector) => [...document.querySelectorAll(selector)].some((n) => {
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }), slide.ready, { timeout: 90_000 });
  }
  if (slide.prSample) await page.evaluate(injectSamplePr, PR_SAMPLE_SHOP);
  await page.waitForSelector(slide.selector, { state: 'visible', timeout: slide.search ? 90_000 : 45_000 });
  await page.waitForTimeout(slide.search ? 4000 : 1500);
  // 後から届く結果で一覧が描き直されたら、もう一度組み立てる
  if (slide.prSample) await page.evaluate(injectSamplePr, PR_SAMPLE_SHOP);
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
    masked = await page.evaluate(({ source, skip }) => {
      const pattern = new RegExp(source, 'gu');
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const targets = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement?.closest('script,style,.hoshilu-price-mask')) continue;
        if (skip && node.parentElement?.closest(skip)) continue;
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
    }, { source: PRICE_TEXT.source, skip: (slide.unmask || []).join(',') });
  }
  // 写る商品写真がすべて下帯ぼかしになっているかを数える（1 枚でも外れていれば、そのセットは出さない）
  let photo = slide.mask === false ? { photos: 0, masked: 0 } : await maskPhotos(page);
  if (photo.masked < photo.photos) throw new Error(`PHOTO_PRICE_NOT_MASKED:${slide.id}:${photo.masked}/${photo.photos}`);
  const blurred = masked + (slide.mask === false ? 0
    : await page.$$eval(PRICE_SELECTORS.join(','), (nodes) => nodes.filter((n) => getComputedStyle(n).filter.includes('blur')).length));
  const box = await page.evaluate(({ selector, count, extend, section, from, fromTop, nth, labelFrom, bigFrom }) => {
    const nodes = [...document.querySelectorAll(selector)].filter((n) => n.getBoundingClientRect().height > 0);
    const first = section ? (document.querySelector(section) || nodes[nth]) : from ? (document.querySelector(from) || nodes[nth]) : nodes[nth];
    const lastIndex = Math.min(nodes.length, nth + (count || 1)) - 1;
    const last = extend ? (document.querySelector(extend) || nodes[lastIndex]) : nodes[lastIndex];
    const label = labelFrom ? String(first?.querySelector(labelFrom)?.textContent || '').replace(/\s+/gu, ' ').trim().slice(0, 24) : '';
    const big = bigFrom ? String(first?.querySelector(bigFrom)?.textContent || '').replace(/\s+/gu, '').trim().slice(0, 8) : '';
    if (fromTop) {
      window.scrollTo(0, 0);
      return { top: 0, height: Math.ceil(window.innerHeight * 1.1), label, big };
    }
    first.scrollIntoView({ block: 'start' });
    const top = first.getBoundingClientRect().top + window.scrollY;
    const bottom = section ? top + window.innerHeight * 1.15 : last.getBoundingClientRect().bottom + window.scrollY;
    return { top: Math.max(0, Math.floor(top - 12)), height: Math.ceil(bottom - top + 24), label, big };
  }, { selector: slide.selector, count: slide.count, extend: slide.extend, section: slide.section, from: slide.from, fromTop: slide.fromTop, nth, labelFrom: slide.labelFrom, bigFrom: slide.bigFrom });
  // 撮る位置へスクロールした後に読み込まれた写真にも下帯を掛け、撮影直前の状態で数え直す
  if (slide.mask !== false) {
    photo = await maskPhotos(page);
    if (photo.masked < photo.photos) throw new Error(`PHOTO_PRICE_NOT_MASKED:${slide.id}:${photo.masked}/${photo.photos}`);
  }
  const height = Math.min(box.height, slide.maxHeight || 1100);
  const clip = { x: 0, y: box.top, width: 390, height };
  const ocr = slide.mask === false || !photo.photos ? { ocr: 'skipped', full: 0 } : await ocrMaskPhotos(page, clip, slide.id);
  const shot = await page.screenshot({ type: 'png', clip, fullPage: true });
  return { shot, blurred, found, label: box.label, photos: photo.photos, photoMasked: photo.masked, photoOcr: ocr.ocr, photoFullBlur: ocr.full, size: { width: clip.width, height: clip.height }, big: box.big };
}

// fit: 撮った部品の縦横に合わせて枠の大きさを決める（820×760 の中に全体が入る大きさ。はみ出して切れない）
export function phoneBox(size) {
  const width = Number(size?.width) || 390;
  const height = Number(size?.height) || 0;
  if (!height) return null;
  const scale = Math.min(820 / width, 760 / height);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  return { width: w, height: h, top: 520 + Math.round((760 - h) / 2) };
}

// 大きな数字（値下がり中の下がり幅「-32%」）。形が違う時は出さない（通常の見出しにする）。
export function bigDropText(value) {
  const match = /^-(\d{1,2})%$/u.exec(String(value || '').trim());
  return match ? `-${match[1]}%` : '';
}
const jstMonthDay = (now = new Date()) => {
  const d = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

export function slideHtml(slide, index, total, shotBase64, label = '', size = null, big = '', now = new Date()) {
  const bigText = slide.bigFrom ? bigDropText(big) : '';
  // 見出しの言い回しは日替わり・枚ごとに変える（同じ文が並ばないように）
  const notes = Array.isArray(slide.bigNote) ? slide.bigNote : [slide.bigNote || ''];
  const dayNumber = Math.floor((now.getTime() + 9 * 60 * 60 * 1000) / 86_400_000);
  const bigNote = notes[(dayNumber + index) % notes.length] || '';
  const box = slide.fit ? phoneBox(size) : null;
  const fitCss = box ? `.phone{width:${box.width}px;height:${box.height}px;top:${box.top}px}` : '';
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
h1.big{top:196px;display:flex;align-items:flex-end;gap:26px}
.big-num{font-size:178px;line-height:.95;letter-spacing:-.05em;color:#e0245e;text-shadow:0 8px 26px rgba(224,36,94,.25)}
.big-note{padding-bottom:18px;font-size:46px;line-height:1.2;color:#14142a}
p.body{position:absolute;left:66px;right:64px;top:400px;font-size:27px;line-height:1.55;font-weight:600;color:#4b4b66}
.phone{position:absolute;left:50%;transform:translateX(-50%);top:520px;width:820px;height:760px;border-radius:44px;overflow:hidden;
background:#fff;box-shadow:0 30px 70px rgba(64,40,140,.22),0 0 0 10px #14142a}
.phone img{display:block;width:100%;height:auto}
</style></head><body>
<div class="brand"><i>H</i><span>HOSHILU<small>ホシル｜hoshilu.app</small></span></div>
<div class="count">${index + 1} / ${total}</div>
<span class="kicker">${lines(kicker)}</span>
${bigText ? `<h1 class="big"><span class="big-num">${bigText}</span><span class="big-note">${lines(bigNote)}</span></h1>` : `<h1>${lines(slide.title)}</h1>`}
<p class="body">${lines(String(slide.body).replaceAll('{date}', jstMonthDay(now)))}</p>
${fitCss ? `<style>${fitCss}</style>` : ''}<div class="phone"><img src="data:image/png;base64,${shotBase64}" alt=""></div>
</body></html>`;
}

async function buildSet(browser, composer, page, setId, allSlides) {
  const shots = [];
  const slides = [];
  for (const slide of allSlides) {
    let result;
    try {
      result = await capture(page, slide);
    } catch (error) {
      // optional の枚（その日の商品が足りない時の 5・6 枚目など）は出さずに進む
      if (!slide.optional) throw error;
      console.log(`skipped optional ${setId}/${slide.id}: ${String(error?.message || error).split('\n')[0].slice(0, 120)}`);
      continue;
    }
    console.log(`captured ${setId}/${slide.id}: items=${result.found} blurred=${result.blurred} photos_masked=${result.photoMasked}/${result.photos} ocr=${result.photoOcr} full_blur=${result.photoFullBlur} label=${result.label}`);
    shots.push(result);
    slides.push(slide);
  }
  // 商品の価格が出る画面（値下がり・ランキング）で、ぼかしが1つも効いていなければ止める
  for (const [index, slide] of slides.entries()) {
    if (['price-drops', 'ranking-price'].includes(slide.id) && shots[index].blurred < 1) throw new Error(`PRICE_NOT_BLURRED:${setId}/${slide.id}`);
  }
  const dir = path.join(outDir, setId);
  await mkdir(dir, { recursive: true });
  const files = [];
  for (const [index, slide] of slides.entries()) {
    await composer.setContent(slideHtml(slide, index, slides.length, shots[index].shot.toString('base64'), shots[index].label, shots[index].size, shots[index].big), { waitUntil: 'load' });
    await writeFile(path.join(dir, `${index + 1}.jpg`), await composer.screenshot({ type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: 1080, height: 1350 } }));
    files.push({ file: `${setId}/${index + 1}.jpg`, id: slide.id, items: shots[index].found, blurred: shots[index].blurred, photos: shots[index].photos, photo_band_masked: shots[index].photoMasked, photo_ocr: shots[index].photoOcr, photo_full_blur: shots[index].photoFullBlur, label: shots[index].label });
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
    // 掲載見本の応答の差し替え（page.route）を service worker に邪魔させない
    serviceWorkers: 'block',
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
