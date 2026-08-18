import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICIAL_STORE_SEARCHES, officialStoreForProductUrl } from '../src/official-mall-stores.mjs';
import fs from 'node:fs';

// 2026-08-18方針:「アフィリエイト報酬対象でなくてもよいから、検索したら
// あらゆるモールの商品が提示されることが最優先。提示反映基準はルールに
// 基づき平等に」。楽天/Yahoo!内のモール公式店を表示ラベルで見せる。

test('楽天・Yahoo!内のモール公式店を商品URLから判定できる', () => {
  assert.deepEqual(
    officialStoreForProductUrl('https://store.shopping.yahoo.co.jp/zozo/12345.html'),
    { marketplace: 'ZOZOTOWN_JP', label: 'ZOZOTOWN公式 Yahoo!店' }
  );
  assert.deepEqual(
    officialStoreForProductUrl('https://item.rakuten.co.jp/hands-net/4901234567890/'),
    { marketplace: 'HANDS_JP', label: 'ハンズ公式 楽天市場店' }
  );
  assert.deepEqual(
    officialStoreForProductUrl('https://item.rakuten.co.jp/matsukiyo/abc123/'),
    { marketplace: 'MATSUKIYO_JP', label: 'マツキヨ公式 楽天市場店' }
  );
  assert.deepEqual(
    officialStoreForProductUrl('https://store.shopping.yahoo.co.jp/cosmecom/x1.html'),
    { marketplace: 'COSME_JP', label: '@cosme公式 Yahoo!店' }
  );
  assert.deepEqual(
    officialStoreForProductUrl('https://item.rakuten.co.jp/abc-mart/sku99/'),
    { marketplace: 'ABCMART_JP', label: 'ABC-MART公式 楽天市場店' }
  );
});

test('楽天アフィリエイトURLはpc=内の実URLで判定する', () => {
  const inner = encodeURIComponent('https://item.rakuten.co.jp/abc-mart/sku99/');
  assert.deepEqual(
    officialStoreForProductUrl(`https://hb.afl.rakuten.co.jp/hgc/xxxx/?pc=${inner}`),
    { marketplace: 'ABCMART_JP', label: 'ABC-MART公式 楽天市場店' }
  );
});

test('公式店でない・不正なURLはnull(通常モール表示のまま)', () => {
  assert.equal(officialStoreForProductUrl('https://item.rakuten.co.jp/someshop/item1/'), null);
  assert.equal(officialStoreForProductUrl('https://store.shopping.yahoo.co.jp/other-store/1.html'), null);
  // ホスト偽装: パスやサブドメインに紛れても誤判定しない
  assert.equal(officialStoreForProductUrl('https://evil.example.com/item.rakuten.co.jp/abc-mart/x/'), null);
  assert.equal(officialStoreForProductUrl('https://item.rakuten.co.jp.evil.example.com/abc-mart/x/'), null);
  assert.equal(officialStoreForProductUrl('http://item.rakuten.co.jp/abc-mart/x/'), null, 'httpsのみ');
  assert.equal(officialStoreForProductUrl(''), null);
  assert.equal(officialStoreForProductUrl('not a url'), null);
});

test('判定は表示ラベル専用で、順位に使う項目を持たない', () => {
  const store = officialStoreForProductUrl('https://store.shopping.yahoo.co.jp/zozo/1.html');
  // marketplaceとlabel以外の項目(スコア・優先度等)が生えたらこのテストを
  // 見直すこと。順位への影響はモール平等の方針に反する。
  assert.deepEqual(Object.keys(store).sort(), ['label', 'marketplace']);
});

// 2026-08-18のユーザー指摘「楽天市場とYahoo!ショッピングしか出ないね」への対応。
// URL判定だけでは、たまたま公式店の商品が混ざったときにラベルが付くだけで、
// 一般的な検索では出番がほぼ無かった。店舗を名指しで検索する経路を固定する。
test('公式店の名指し検索は1モール1ソースで、5モール分が定義されている', () => {
  const keys = OFFICIAL_STORE_SEARCHES.map((item) => item.key);
  assert.equal(new Set(keys).size, keys.length, 'keyが重複している');
  const marketplaces = OFFICIAL_STORE_SEARCHES.map((item) => item.marketplace);
  assert.equal(new Set(marketplaces).size, marketplaces.length, '同じモールを二重に叩いている');
  assert.deepEqual([...marketplaces].sort(), ['ABCMART_JP', 'COSME_JP', 'HANDS_JP', 'MATSUKIYO_JP', 'ZOZOTOWN_JP']);
  for (const store of OFFICIAL_STORE_SEARCHES) {
    if (store.platform === 'RAKUTEN') assert.ok(store.shopCode, `${store.key}: shopCodeが無い`);
    else if (store.platform === 'YAHOO') assert.ok(store.sellerId, `${store.key}: sellerIdが無い`);
    else assert.fail(`${store.key}: 未知のplatform ${store.platform}`);
  }
});

test('名指し検索の店舗コードはURL判定側の登録と一致する', () => {
  // 片方だけ直して食い違うと、「検索では出るのにラベルが付かない」状態になる。
  for (const store of OFFICIAL_STORE_SEARCHES) {
    const url = store.platform === 'RAKUTEN'
      ? `https://item.rakuten.co.jp/${store.shopCode}/item-1/`
      : `https://store.shopping.yahoo.co.jp/${store.sellerId}/item-1.html`;
    const detected = officialStoreForProductUrl(url);
    assert.ok(detected, `${store.key}: URL判定に登録が無い (${url})`);
    assert.equal(detected.marketplace, store.marketplace, `${store.key}: モールが食い違っている`);
  }
});

test('検索経路は公式店にshopCode/seller_idを付け、本体検索には付けない', () => {
  const source = fs.readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(source, /shopCode: store\.shopCode/);
  assert.match(source, /sellerId: store\.sellerId/);
  // 個別の店舗が落ちても本体検索を巻き込まないこと(既存のallSettled合流に乗せる)。
  assert.match(source, /marketplaceSearches\.push\(\{[\s\S]{0,400}store\.key/);
  // コード変更なしで止められること。
  assert.match(source, /OFFICIAL_STORE_SEARCH_ENABLED !== 'false'/);
});
