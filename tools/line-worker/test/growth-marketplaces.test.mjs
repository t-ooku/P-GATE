import test from 'node:test';
import assert from 'node:assert/strict';
import { GROWTH_MARKETPLACES, growthMarketplace } from '../public/growth-marketplaces.mjs';

test('統合2モールと直接検索11モールを送客分類する(v4.2項目14で5モール追加)', () => {
  assert.equal(GROWTH_MARKETPLACES.length, 15);
  for (const marketplace of GROWTH_MARKETPLACES) {
    assert.equal(growthMarketplace(marketplace), marketplace);
  }
  assert.equal(growthMarketplace('', 'Yahoo!ショッピングで見る'), 'YAHOO_JP');
  assert.equal(growthMarketplace('', 'SNKRDUNKで見る'), 'SNKRDUNK_JP');
  assert.equal(growthMarketplace('', 'ロフトで見る'), 'LOFT_JP');
  assert.equal(growthMarketplace('', 'ABC-MARTで見る'), 'ABCMART_JP');
  assert.equal(growthMarketplace('', '不明なサイト'), '');
});

// 2026-10-16: 名乗らないリンク先取得（SNS 投稿の 40〜90 秒後に来て数秒で閉じる）を訪問に数えない。
test('landing_view は画面に 1.5 秒出ていたか、人が触った時に 1 回だけ送る', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../public/growth-analytics.mjs', import.meta.url), 'utf8');
  assert.match(source, /const LANDING_VIEW_VISIBLE_MS = 1500;/u);
  assert.doesNotMatch(source, /^send\('landing_view'\);$/mu, '読み込み直後に無条件で送らない');
  assert.match(source, /document\.visibilityState === 'visible'\) timer = setTimeout\(fire, LANDING_VIEW_VISIBLE_MS\)/u);
  assert.match(source, /\['pointerdown', 'keydown', 'touchstart', 'scroll'\]/u);
  assert.match(source, /if \(sent\) return;\n    sent = true;/u);
});
