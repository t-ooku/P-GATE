import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 2026-09-02 実機フィードバック: 検索後に結果セクションが画面外のままだと
// 「検索できたのか分からない」。検索完了時に結果先頭へ視点を移す実装が
// 成功経路と縮退経路の両方に入っていることをソースmarkerで固定する。
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('検索完了時に結果セクションへ視点を移すrevealSearchResultsが存在する', () => {
  assert.match(app, /function revealSearchResults\(\)/u);
  // 既に見えている場合は動かさない(再検索で画面が跳ねない)。
  assert.match(app, /rect\.top>=0&&rect\.top<=viewport\*0\.66\)return;/u);
  // reduced-motion設定ではアニメーションを使わない。
  assert.match(app, /prefers-reduced-motion: reduce/u);
  assert.match(app, /scrollIntoView\(\{behavior:reducedMotion\?'auto':'smooth',block:'start'\}\)/u);
});

test('成功経路と縮退経路の両方の描画直後に呼ばれる', () => {
  assert.match(app, /finishInstantMarketplaceHandoff\(false\);revealSearchResults\(\);/u);
  assert.match(app, /finishInstantMarketplaceHandoff\(true\);revealSearchResults\(\);/u);
});
