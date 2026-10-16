#!/usr/bin/env node
// 2026-10-16 大隆さん指示「セラー募集のLPは文字ばかりで実画像がないから全然だめ。人は視認性で判断する。
// ホシルの訴求ポイントや推し機能を、実際の画像を掲載して。表示できない部分はぼかせばよい」。
// 本番の HOSHILU の画面（検索・検索結果・ホシルバズ・値下がり）をスマホ幅で撮り、出品者向けページ（/for-sellers）に載せる
// 素の画面写真（JPEG）を作る。枠や説明は LP 側の HTML/CSS で付ける。
// - 商品の金額・割引率・差額はぼかす。商品写真は見せるが、販促文字が入りやすい下側の帯はぼかす（build-social-screens と同じ処理）。
// - 検索語は固定の見本（利用者の検索ではない）。AI 生成なし・課金なし。
// - 撮れなかった画面は出力しない（manifest の failures に理由）。1 枚も撮れなければ失敗。
// 掲載先: public/for-sellers.html の第一画面と「これが、HOSHILUの実際の画面です。」（#646）。
// 使い方: node scripts/build-seller-lp-shots.mjs <出力フォルダ> [--base https://hoshilu.app]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { capture, setScreensBase } from './build-social-screens.mjs';

export const SAMPLE_QUERY = '玄関に置ける スリムな傘立て';

export const LP_SHOTS = Object.freeze([
  // 1. 名前が分からなくても、言葉で探せる（入力した状態のトップ）
  { id: 'search', url: '/', selector: '#knowledgeForm', min: 1, fromTop: true, typeOnly: SAMPLE_QUERY, hide: '#searchSuggestList', maxHeight: 700 },
  // 2. 検索結果（モール横断の商品カード。価格はぼかす）。条件に合う検索では、この一覧の一番上に「PR」枠が入る
  // 10/16 初回は商品カード 1 枚だけを切り出して上下が欠けたため、商品カードがそろってから結果の枠ごと上から撮る
  // 10/16 2 回目は 90 秒以内に商品カードが出ず失敗（検索の混み具合で遅れる）。一覧（#resultCards）の上から撮り、失敗したら 1 回だけ撮り直す
  // 10/16 3 回目の記録（#649）: 結果は出ていた（result-row・商品カードあり）。最初に見つかる .product-card が畳まれた行の中で見えず待ち続けていた。
  // 目印を「結果の行」（#resultCards > .result-row）にする
  { id: 'results', url: '/', selector: '#resultCards', ready: '#resultCards > .result-row', min: 1, search: SAMPLE_QUERY, hide: '#searchSuggestList', maxHeight: 1000, retries: 1 },
  // 3. ホシルバズ（ジャンル別のいま売れている物）
  // 棚 2 つ分を縦長に撮る（LP のスマホ枠 9:16 に収まる長さ）
  { id: 'buzz', url: '/#tab-buzz', selector: '#buzzTab .buzz-home-shelf', min: 2, count: 2, maxHeight: 900 },
  // 4. 買い物ノートの値下がり（毎日の価格記録）
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
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1 HOSHILU-SocialScreens/1.0'
  });
  const encoder = await browser.newPage({ viewport: { width: 780, height: 800 }, deviceScaleFactor: 1 });
  await mkdir(outDir, { recursive: true });
  const files = [];
  const failures = {};
  for (const shot of LP_SHOTS) {
    let page = await mobile.newPage();
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
        return `resultsSection=${visible('#resultsSection')} cards=${visible('#resultCards > *')} product=${visible('.product-card')} msg=${text('#resultMessage')} status=${text('#searchStatus, .search-progress, [role="status"]')} classes=${[...document.querySelectorAll('#resultCards > *')].slice(0, 4).map((n) => n.className).join('|').slice(0, 160)}`;
      }).catch((e) => `evaluate_failed:${String(e?.message || e).slice(0, 80)}`);
      failures[shot.id] = `${String(error?.message || error).split('\n')[0].slice(0, 200)} / seen: ${seen}`;
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
