#!/usr/bin/env node
// 2026-10-16 大隆さん指示「セラー募集のLPは文字ばかりで実画像がないから全然だめ。人は視認性で判断する。
// ホシルの訴求ポイントや推し機能を、実際の画像を掲載して。表示できない部分はぼかせばよい」。
// 本番の HOSHILU の画面（検索・掲載見本・ホシっとく・ホシルバズ・値下がり）をスマホ幅で撮り、出品者向けページ（/for-sellers）に載せる
// 素の画面写真（JPEG）を作る。枠や説明は LP 側の HTML/CSS で付ける。
// - 商品の金額・割引率・差額はぼかす。商品写真は見せるが、販促文字が入りやすい下側の帯はぼかす（build-social-screens と同じ処理）。
// - 検索語は固定の見本（利用者の検索ではない）。AI 生成なし・課金なし。
// - 撮れなかった画面は出力しない（manifest の failures に理由）。1 枚も撮れなければ失敗。
// - 2026-10-17: build-social-carousels.yml の定時（cron）は既定ブランチに無いと動かない。このファイルの push で撮影を動かすことがある。
// 掲載先: public/for-sellers.html の第一画面と「これが、HOSHILUの実際の画面です。」（#646）。
// その画面は、セラー向けの実画像カルーセル（build-social-screens の seller セット、#655・#656）にも写る。
// 10/16 #658: 掲載見本（listing）・ホシっとく（keep）を追加。この行の追加で撮影を動かす（Issue 経由の反映では撮影が動かないため）。
// 10/16 #658 の 2 回目: 撮影では service worker を止める（PR 枠の差し替えが効かなかったため）。
// 10/17 #661: PR 枠を画面の中でも組み立てる・出品者向けカルーセルを枠で切らない。この行の追加で撮影を動かす。
// 10/17 #666: 値下がり中のセット（drops）を撮って確かめる。この行の追加で撮影を動かす。
// 10/18: main の定時（daily-social-screens.yml）が動かなかったため、この行の追加で撮影を動かす。
// 使い方: node scripts/build-seller-lp-shots.mjs <出力フォルダ> [--base https://hoshilu.app]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { capture, setScreensBase } from './build-social-screens.mjs';

export const SAMPLE_QUERY = '玄関に置ける スリムな傘立て';

export const LP_SHOTS = Object.freeze([
  // 1. 名前が分からなくても、言葉で探せる（入力した状態のトップ）
  { id: 'search', url: '/', selector: '#knowledgeForm', min: 1, fromTop: true, typeOnly: SAMPLE_QUERY, hide: '#searchSuggestList', maxHeight: 700 },
  // 2. 掲載見本（第一画面・相談フォーム）。2026-10-16 大隆さん指示「リアルな掲載見本を画面掲載して」。
  // 本番の検索結果の先頭 2 件を、撮る画面の中だけ「PR」枠へ移す（build-social-screens の samplePrResponse。店名は「あなたのお店（見本）」・価格なし）。
  // 件数の行（.unified-head）から下を撮る＝件数 → PR枠 → 通常の列、の順に写る。
  // 10/16 の 2 回は応答の差し替えが効かず PR 枠が出なかった（pr=0）。件数の行が出たら、画面の中でも PR 枠を組み立てる（injectSamplePr）。
  // 以前の検索結果だけの画面（results、#647〜#653 の経緯）は撮らない。results.jpg は掲載見本が撮れるまでの代わりとして残す。
  { id: 'listing', url: '/', selector: '.unified-pr-card', ready: '.unified-head', section: '.unified-head', min: 1, search: SAMPLE_QUERY, hide: '#searchSuggestList', maxHeight: 900, retries: 1, prSample: true },
  // 3. ホシっとく（見つからない物を保存 → 探されている需要としてお店に届く）。「探していた人を、呼び戻す」の横に載せる
  { id: 'keep', url: '/', selector: '#resultCards > .continuous-search-card', ready: '#resultCards > .continuous-search-card', section: '#resultCards > .continuous-search-card', min: 1, search: SAMPLE_QUERY, hide: '#searchSuggestList', maxHeight: 760, retries: 1 },
  // 4. ホシルバズ（ジャンル別のいま売れている物）
  // 棚 2 つ分を縦長に撮る（LP のスマホ枠 9:16 に収まる長さ）
  { id: 'buzz', url: '/#tab-buzz', selector: '#buzzTab .buzz-home-shelf', min: 2, count: 2, maxHeight: 900 },
  // 5. 買い物ノートの値下がり（毎日の価格記録）
  { id: 'drops', url: '/media/price-drops', selector: '.media-drop:has(.media-drop-figure img)', min: 2, count: 2, maxHeight: 900 }
]);

async function main() {
  const args = process.argv.slice(2);
  const outDir = args.find((value, index) => !value.startsWith('--') && args[index - 1] !== '--base') || '';
  const baseIndex = args.indexOf('--base');
  const base = baseIndex >= 0 ? String(args[baseIndex + 1] || '') : 'https://hoshilu.app';
  if (!outDir || !/^https?:\/\//u.test(base)) throw new Error('usage: build-seller-lp-shots.mjs <outDir> [--base URL]');
  setScreensBase(base);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', isMobile: true, hasTouch: true,
    bypassCSP: true,
    // 10/16 #658 の初回: 掲載見本の PR 枠が出なかった（pr=0）。本番の画面は service worker を登録し、それが効いている画面の
    // 通信は page.route で差し替えられない。撮影では service worker を止める（本番の画面の動きは変えない）。
    serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1 HOSHILU-SocialScreens/1.0'
  });
  const encoder = await browser.newPage({ viewport: { width: 780, height: 800 }, deviceScaleFactor: 1 });
  await mkdir(outDir, { recursive: true });
  const files = [];
  const failures = {};
  for (const shot of LP_SHOTS) {
    let page = await mobile.newPage();
    // 検索の応答（/api/knowledge）が何回来たか（掲載見本が撮れなかったときの記録用。中身は残さない）
    let knowledge = 0;
    const countKnowledge = (response) => { if (response.url().includes('/api/knowledge')) knowledge += 1; };
    page.on('response', countKnowledge);
    try {
      let result;
      for (let attempt = 0; ; attempt += 1) {
        try {
          result = await capture(page, shot);
          break;
        } catch (error) {
          if (attempt >= Number(shot.retries || 0)) throw error;
          console.error(`lp shot ${shot.id} retry ${attempt + 1}: ${String(error?.message || error).split('\n')[0].slice(0, 160)}`);
          await page.close();
          page = await mobile.newPage();
          page.on('response', countKnowledge);
        }
      }
      // PNG（2 倍）を 780px 幅の JPEG にする（LP の表示幅に十分・軽い）
      await encoder.setContent(`<!doctype html><html><body style="margin:0;background:#fff"><img id="s" style="display:block;width:780px" src="data:image/png;base64,${result.shot.toString('base64')}"></body></html>`, { waitUntil: 'load' });
      const height = await encoder.$eval('#s', (img) => Math.round(img.getBoundingClientRect().height));
      await encoder.setViewportSize({ width: 780, height });
      await writeFile(path.join(outDir, `${shot.id}.jpg`), await encoder.screenshot({ type: 'jpeg', quality: 84, clip: { x: 0, y: 0, width: 780, height } }));
      files.push({ file: `${shot.id}.jpg`, id: shot.id, width: 780, height, items: result.found, blurred: result.blurred, photos: result.photos, photo_masked: result.photoMasked });
      console.log(`lp shot ${shot.id}: items=${result.found} blurred=${result.blurred} photos=${result.photoMasked}/${result.photos} h=${height}`);
    } catch (error) {
      // 何が画面に出ていたかを残す（検索語は固定の見本なので利用者の情報は含まない）
      const seen = await page.evaluate(() => {
        const visible = (selector) => [...document.querySelectorAll(selector)].filter((n) => n.getBoundingClientRect().height > 0).length;
        const text = (selector) => String(document.querySelector(selector)?.innerText || '').replace(/\s+/gu, ' ').trim().slice(0, 120);
        return `resultsSection=${visible('#resultsSection')} cards=${visible('#resultCards > *')} product=${visible('.product-card')} pr=${visible('.unified-pr-card')} keep=${visible('.continuous-search-card')} msg=${text('#resultMessage')} status=${text('#searchStatus, .search-progress, [role="status"]')} classes=${[...document.querySelectorAll('#resultCards > *')].slice(0, 4).map((n) => n.className).join('|').slice(0, 160)}`;
      }).catch((e) => `evaluate_failed:${String(e?.message || e).slice(0, 80)}`);
      failures[shot.id] = `${String(error?.message || error).split('\n')[0].slice(0, 200)} / seen: ${seen} knowledge=${knowledge}`;
      console.error(`lp shot ${shot.id} skipped: ${failures[shot.id]}`);
    } finally {
      await page.close();
    }
  }
  await browser.close();
  if (!files.length) throw new Error(`LP_SHOTS_ALL_FAILED:${JSON.stringify(failures)}`);
  await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify({ base, captured_at: new Date().toISOString(), query: SAMPLE_QUERY, files, failures }, null, 2)}\n`);
  console.log(`wrote ${files.length} lp shots to ${outDir}`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) await main();
