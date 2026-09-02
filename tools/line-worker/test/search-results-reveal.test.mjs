import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 2026-09-02 実機フィードバック: 検索後に結果セクションが画面外のままだと
// 「検索できたのか分からない」。検索完了時に結果先頭へ視点を移す実装が
// 成功経路と縮退経路の両方に入っていることをソースmarkerで固定する。
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('検索完了時に結果セクションへ視点を移すrevealSearchResultsが存在する', () => {
  assert.match(app, /function revealSearchResults\(\)/u);
  // 既に結果の先頭に居る場合だけ動かさない。それ以外は常に結果へ移動する。
  assert.match(app, /rect\.top>=-8&&rect\.top<=120\)return;/u);
  // reduced-motion設定ではアニメーションを使わない。
  assert.match(app, /prefers-reduced-motion: reduce/u);
  assert.match(app, /scrollIntoView\(\{behavior:reducedMotion\?'auto':'smooth',block:'start'\}\)/u);
});

test('成功経路と縮退経路の両方の描画直後に呼ばれる', () => {
  assert.match(app, /finishInstantMarketplaceHandoff\(false\);revealSearchResults\(\);/u);
  assert.match(app, /finishInstantMarketplaceHandoff\(true\);revealSearchResults\(\);/u);
});

test('AIで探す(識別・チャット)完了後もモールリンクではなく結果セクションへ移動する', () => {
  const aiUi = readFileSync(new URL('../public/ai-search-ui.mjs', import.meta.url), 'utf8');
  assert.match(aiUi, /const revealResultsSoon=\(\)=>window\.setTimeout\(\(\)=>window\.HoshiluSearch\?\.revealResults\?\.\(\),120\);/u);
  // 検索成功・縮退で閉じる全経路がrevealResultsSoonを呼ぶ(5箇所)。
  assert.equal((aiUi.match(/revealResultsSoon\(\)/gu) || []).length, 5);
  // 完了後にmarketplaceFallbackへスクロールで固定する旧動作は残さない
  // (「先にモールで見る」browseNowのinstantMarketplaceFallbackは対象外)。
  assert.doesNotMatch(aiUi, /#marketplaceFallback,\.marketplace-fallback'\)\?\.scrollIntoView/u);
  // app.jsはrevealResultsを公開している。
  assert.match(app, /revealResults:revealSearchResults\}/u);
});
