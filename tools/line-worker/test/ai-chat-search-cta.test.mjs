import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

// v4.3 指示書 section 6: 会話が完了(needs_clarification=false)しても、
// 自動でHOSHILU検索へ進んではいけない。チャット内に明確な
// 「この条件で探す」CTAを設置し、押した時にだけ検索へ進む。
// (Gemini自身が商品一覧を創作して会話を終える設計は禁止 - これはこのCTAが
// 「会話結果をHOSHILU検索へ渡す」唯一の明示的なトリガーであることの裏付け)

test('v4.3項目6: チャット内に「この条件で探す」という明確なCTAが存在する', async () => {
  const script = await read('ai-search-ui.mjs');
  assert.match(script, /searchCta: 'この条件で探す'/);
  assert.match(script, /function showSearchCta\(refinedQuery\)/);
  assert.match(script, /cta\.className = 'ai-chat-search-cta'/);
  assert.match(script, /cta\.textContent = copy\.searchCta/);
});

test('v4.3項目6: 会話完了直後は自動検索せず、CTAを押した時だけrunFinalSearchが呼ばれる', async () => {
  const script = await read('ai-search-ui.mjs');
  // runTurn内でneeds_clarificationがfalseになった後の分岐は、
  // showSearchCta(refinedQuery)を呼ぶだけで、runFinalSearchを直接呼ばない。
  const runTurnStart = script.indexOf('async function runTurn()');
  const runTurnEnd = script.indexOf('\n  form.addEventListener', runTurnStart);
  const runTurnBody = script.slice(runTurnStart, runTurnEnd);
  assert.match(runTurnBody, /showSearchCta\(refinedQuery\)/);
  assert.doesNotMatch(runTurnBody, /await runFinalSearch\(refinedQuery\)/);
  // runFinalSearchはCTAのクリックハンドラ内(showSearchCta)からのみ呼ばれる。
  const ctaStart = script.indexOf('function showSearchCta(refinedQuery)');
  const ctaEnd = script.indexOf('\n  async function runTurn()', ctaStart);
  const ctaBody = script.slice(ctaStart, ctaEnd);
  assert.match(ctaBody, /await runFinalSearch\(refinedQuery\)/);
  assert.match(ctaBody, /cta\.addEventListener\('click', async \(\) => \{/);
});

test('v4.3項目6: CTA押下後、通常結果または13モール縮退結果を表示できた時に閉じる', async () => {
  const script = await read('ai-search-ui.mjs');
  const ctaStart = script.indexOf('function showSearchCta(refinedQuery)');
  const ctaEnd = script.indexOf('\n  async function runTurn()', ctaStart);
  const ctaBody = script.slice(ctaStart, ctaEnd);
  assert.match(ctaBody, /if \(outcome\.ok \|\| outcome\.degraded\) \{\s*dialog\.close\(\);/);
  assert.match(ctaBody, /showSearchError\(refinedQuery\)/);
});

test('v4.3項目6: CTAの多言語ラベル(EN/ZH/KO)が用意されている', async () => {
  const script = await read('ai-search-ui.mjs');
  assert.match(script, /searchCta: 'Search with this'/);
  assert.match(script, /searchCta: '用这个条件搜索'/);
  assert.match(script, /searchCta: '이 조건으로 찾기'/);
});

test('v4.3項目6: CTAボタンのスタイルが定義されている', async () => {
  const css = await read('ai-search-ui.css');
  assert.match(css, /\.ai-chat-search-cta\{/);
});
