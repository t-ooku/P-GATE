import test from 'node:test';
import assert from 'node:assert/strict';
import { officialStoreForProductUrl } from '../src/official-mall-stores.mjs';

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
