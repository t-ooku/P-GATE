import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

// 2026-08-08 依頼: 「HOSHILU AIが見つけた商品候補は、リンクが必要。どの
// モールで見ればよいか分からない」。
//
// 調査の結果、リンク自体(marketplace_search_links経由のモール別検索ボタン)
// は既に候補ごとに表示されていたが、marketplaceLinks()はモール名だけを
// 表示し「で探す/で検索」を落とすため(SNSボタンとの表示差分のための既存
// 仕様、cross-search-buttons.test.mjsで固定化済み)、ボタンが商品ページへの
// 直リンクであるかのように見えていた。実際は候補ごとのAI生成キーワードに
// よるモール検索リンクであり、確実にその商品が見つかる保証はない
// (aiDiscoveryWithSignedCandidateLinks / SEARCH_FALLBACK)。このテストは
// ボタンの直前に「検索リンクであり保証はない」ことを明示するcaptionが
// 追加されていることを固定化する。
test('AI候補カードのモールボタン直前に、検索リンクであることを明示するcaptionを表示する', async () => {
  const app = await read('app.js');
  assert.match(app, /linksNote:'気になったら、下のモールで検索して確認してください/);
  assert.match(
    app,
    /if\(links\)\{card\.append\(textElement\('p','ai-candidate-links-note',labels\.linksNote\)\);card\.append\(links\);\}/
  );
  // 4言語すべてに用意されている。
  for (const marker of [
    "linksNote:'気になったら、下のモールで検索して確認してください",
    "linksNote:'Tap a marketplace below to search for this item",
    "linksNote:'如果感兴趣，请在下方商城搜索确认",
    'linksNote:\'관심 있으면 아래 쇼핑몰에서 검색해 확인해 주세요'
  ]) {
    assert.ok(app.includes(marker), `missing linksNote translation: ${marker}`);
  }
});

test('captionはCSSで補助テキストとして視認できるスタイルを持つ', async () => {
  const css = await read('ai-search-layout-fix.css');
  assert.match(css, /\.ai-candidate-links-note\{/);
});
