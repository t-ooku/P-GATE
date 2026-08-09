import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('HOSHILU AI action stays onsite and marketplace buttons use accessible brand colors', async () => {
  const [html, script, styles, layout, worker, app] = await Promise.all([
    read('index.html'), read('ai-search-ui.mjs'), read('ai-search-ui.css'), read('ai-search-layout-fix.css'), read('service-worker.js'), read('app.js')
  ]);
  assert.match(html, /ai-search-ui\.mjs/);
  assert.match(html, /ai-search-ui\.css/);
  assert.match(html, /ai-search-layout-fix\.css/);
  assert.match(script, /AIで探す/);
  assert.doesNotMatch(script, /HOSHILU AIで探す/);
  assert.match(script, /#submitButton/);
  assert.doesNotMatch(script, /aistudio|gemini\.google|chatgpt|claude\.ai/i);
  for (const marketplace of ['AMAZON_JP','RAKUTEN_JP','YAHOO_JP','QOO10_JP','SHEIN_JP','ZOZOTOWN_JP','SHOPLIST_JP','MUSINSA_JP','BUYMA_JP','SNKRDUNK_JP']) {
    assert.match(styles, new RegExp(`data-marketplace="${marketplace}"`));
  }
  for (const channel of ['instagram','x','tiktok','youtube','line','gmail']) {
    assert.match(styles, new RegExp(`data-channel="${channel}"`));
  }
  assert.match(styles, /focus-visible/);
  assert.match(layout, /\.marketplace-fallback-group \.marketplace-links\{/);
  assert.match(layout, /@media\(max-width:760px\)/);
  assert.match(worker, /hoshilu-shell-v346/);
  assert.match(script, /function linkDisplayedProducts\(\)/);
  assert.match(script, /product-primary-link/);
  assert.match(script, /:scope > \.product-card-media-column/);
  assert.match(script, /mediaColumn\?\.nextSibling/);
  assert.match(script, /target = '_blank'/);
  assert.match(script, /a\.all-marketplaces-button/);
  assert.match(app, /link\.href='#marketplaceFallback'/);
  assert.match(worker, /ai-search-ui\.mjs/);
  assert.match(worker, /ai-search-layout-fix\.css/);
});

// 2026-08-08: ユーザーからの実際のロゴ・ブランドカラー指定に基づき、
// マツキヨ・ロフトは黄色系、ハンズは緑色系、@cosmeはエメラルドグリーン系
// へ変更した(従来はマツキヨ=青、ロフト=ピンク赤、ハンズ=赤、@cosme=
// ピンクだった)。厳密な色一致ではなく色系統だけを固定する - HSL変換で
// 色相(hue)を確認する。
function hexToHslHue(hex) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let hue;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

test('2026-08-08: マツキヨ・ロフトは黄色系、ハンズは緑色系、@cosmeはエメラルドグリーン系のボタン色になっている', async () => {
  const styles = await read('ai-search-ui.css');
  const colorFor = (marketplace) => {
    const match = styles.match(new RegExp(`data-marketplace="${marketplace}"\\]\\{background:(#[0-9a-f]{6})`));
    assert.ok(match, `${marketplace}の背景色が見つかりません`);
    return match[1];
  };
  // 黄色の色相はおよそ45-65度
  const yellowHue = hexToHslHue(colorFor('MATSUKIYO_JP'));
  assert.ok(yellowHue >= 40 && yellowHue <= 65, `マツキヨは黄色系であるべき (hue=${yellowHue})`);
  const loftHue = hexToHslHue(colorFor('LOFT_JP'));
  assert.ok(loftHue >= 40 && loftHue <= 65, `ロフトは黄色系であるべき (hue=${loftHue})`);
  // 緑〜エメラルドグリーンの色相はおよそ100-175度(エメラルドグリーンは
  // 青緑寄りで170度前後になる)
  const handsHue = hexToHslHue(colorFor('HANDS_JP'));
  assert.ok(handsHue >= 100 && handsHue <= 175, `ハンズは緑色系であるべき (hue=${handsHue})`);
  const cosmeHue = hexToHslHue(colorFor('COSME_JP'));
  assert.ok(cosmeHue >= 100 && cosmeHue <= 175, `@cosmeは緑色系(エメラルドグリーン)であるべき (hue=${cosmeHue})`);
});

test('WHY HOSHILU is concise and official social labels are not duplicated', async () => {
  const html = await read('index.html');
  assert.match(html, /<h2 id="benefitTitle">[^<]+<\/h2>/);
  assert.doesNotMatch(html, /<div class="benefit-grid">/);
  assert.doesNotMatch(html, /official-social-link[^>]*>\s*<span/);
});

// Regression for the RC2 real-device report: the AI chat dialog closed
// immediately after the last turn and only afterwards tried to trigger the
// real search by clicking #submitButton and polling its disabled state -
// which could not tell "results actually rendered" apart from "silently did
// nothing" (e.g. native required-field validation blocking the click), and
// once dialog.close() ran, the dialog (and any later error message appended
// to it) was already removed from the DOM. Fixed by running the real search
// directly (window.HoshiluSearch.run, awaited for a real ok/fail result) and
// only closing the dialog after a confirmed success.
test('AIチャットは検索の成功を確認してからダイアログを閉じ、失敗時は開いたまま再試行を出す', async () => {
  const [app, script] = await Promise.all([read('app.js'), read('ai-search-ui.mjs')]);
  assert.match(app, /window\.HoshiluSearch=\{run:runKnowledgeSearch\}/);
  assert.match(app, /async function runKnowledgeSearch\(\)/);
  assert.match(app, /return\{ok:true,result:payload\.result\}/);
  assert.match(app, /return\{ok:false,error:String\(error\?\.message\|\|error\)\}/);
  assert.match(script, /window\.HoshiluSearch\?\.run/);
  assert.doesNotMatch(script, /submitButton\.click\(\)/);
  // dialog.close() must only appear guarded behind a successful outcome,
  // never unconditionally right after the last chat turn resolves.
  assert.doesNotMatch(script, /needs_clarification[\s\S]{0,400}dialog\.close\(\)/);
  assert.match(script, /if \(outcome\.ok\) \{\s*dialog\.close\(\);/);
  assert.match(script, /function showSearchError\(refinedQuery\)/);
  assert.match(script, /ai-chat-retry/);
});

// AI Search v2 STEP2 (docs/HOSHILU_AI_SEARCH_V2_SPEC_2026-08-04.md section 8):
// the fallback UI previously only ever showed the first AI candidate's
// match score/reason and no per-candidate marketplace buttons. Every
// returned candidate (name, match rate, reason, matched features, and its
// own signed marketplace search links) must render, not just the first one.
// v4.2 項目4: 「HOSHILU AIで探す」表記の廃止。ボタン・ダイアログタイトルの
// どちらにも「HOSHILU AIで探す」/「HOSHILU AIチャット」という表示文言が
// 残っていないことを確認する(内部コメントやfeature名としてのHOSHILU AI Chat
// は対象外)。
test('v4.2項目4: AI関連の表示文言はすべて「AIで探す」/「AIチャット」に統一されている', async () => {
  const script = await read('ai-search-ui.mjs');
  assert.match(script, /JA: \['AIで探す',/);
  assert.match(script, /title: 'AIチャット'/);
  assert.doesNotMatch(script, /'HOSHILU AIでも候補を探す'/);
  assert.doesNotMatch(script, /title: 'HOSHILU AIチャット'/);
});

test('AIチャットのmodule scriptは直前のapp.jsタグに吸収されず独立して読み込まれる', async () => {
  const html = await read('index.html');
  assert.match(html, /<script type="module" src="\/app\.js\?v=103"><\/script><script type="module" src="\/ai-search-ui\.mjs"><\/script>/);
  assert.doesNotMatch(html, /src="\/app\.js\?v=100"<\/script>/);
});

// v4.2 項目6・7: 「AIで探す」を押した時点で直前の検索文を初期コンテキスト
// として渡す。空のチャットを開いて「何を探していますか？」と聞くのは禁止
// なので、チャット履歴の最初のエントリは必ず直前の検索文(originalQuery)で
// なければならない。
test('v4.2項目6・7: 「AIで探す」を押すと直前の検索文がチャットの初期コンテキストとして渡される', async () => {
  const script = await read('ai-search-ui.mjs');
  assert.match(script, /const originalQuery = String\(document\.querySelector\('#query'\)\?\.value \|\| ''\)\.trim\(\)/);
  assert.match(script, /if \(!originalQuery\) return;/);
  assert.match(script, /openChatDialog\(originalQuery, language\)/);
  assert.match(script, /const history = \[\{ role: 'user', text: originalQuery \}\]/);
  assert.match(script, /messages\.append\(chatMessageRow\('user', originalQuery\)\)/);
});

// v4.2 項目8・9: 会話の結果(refined_query)は #query へ書き戻され、既存の
// runKnowledgeSearch()(HOSHILU本体の検索)を通る。AIチャット自身が商品名・
// 価格・URLを生成することはない。
test('v4.2項目8・9: 会話結果は#queryへ書き戻され、HOSHILU本体の検索(runKnowledgeSearch)を通る', async () => {
  const script = await read('ai-search-ui.mjs');
  assert.match(script, /queryField\.value = refinedQuery/);
  assert.match(script, /queryField\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
  assert.match(script, /window\.HoshiluSearch\?\.run/);
});

test('v4.2項目9: AIチャットはGeminiを第一候補としOpenAIへフォールバックする(架空の商品情報を返さない)', async () => {
  const intent = await readFile(new URL('../src/ai-chat-intent.mjs', import.meta.url), 'utf8');
  assert.match(intent, /const providers = \[geminiConfigured && 'gemini', openAiConfigured && 'openai'\]/);
  assert.match(intent, /Never include a price, stock status, product URL, or a claim that you found a specific real product/);
});

test('AI検索候補は候補ごとにモール検索ボタン付きで表示される（1件目だけではない）', async () => {
  const [app, css] = await Promise.all([read('app.js'), read('ai-search-layout-fix.css')]);
  assert.match(app, /function aiCandidateCards\(/);
  assert.match(app, /function aiCandidateCard\(/);
  assert.match(app, /list\.forEach\(aiCandidate=>wrap\.append\(aiCandidateCard\(aiCandidate,labels\)\)\)/);
  assert.match(app, /marketplaceLinks\(aiCandidate\.marketplace_search_links,true\)/);
  assert.match(app, /candidateCards=aiCandidateCards\(analysis\?\.product_candidates,language\)/);
  // regression guard: the old implementation only ever read
  // product_candidates[0] for score/reason display.
  assert.doesNotMatch(app, /product_candidates\|\|\[\]\)\)\[0\]/);
  assert.match(css, /\.ai-candidate-card\{/);
  assert.match(css, /\.ai-candidate-list\{/);
});
