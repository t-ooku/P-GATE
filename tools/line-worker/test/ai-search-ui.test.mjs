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
  assert.match(script, /HOSHILU AIでも候補を探す/);
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
  assert.match(worker, /hoshilu-shell-v308/);
  assert.match(script, /function linkDisplayedProducts\(\)/);
  assert.match(script, /product-primary-link/);
  assert.match(script, /target = '_blank'/);
  assert.match(script, /a\.all-marketplaces-button/);
  assert.match(app, /link\.href='#marketplaceFallback'/);
  assert.match(worker, /ai-search-ui\.mjs/);
  assert.match(worker, /ai-search-layout-fix\.css/);
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
