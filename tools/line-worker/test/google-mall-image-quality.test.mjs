// 2026-09-21 大隆さん報告「画像出てないよ」（Amazon・マツキヨココカラのカードにモールのロゴが出ていた）。
// og:image はページが商品ページでもサイト共通のロゴを返すことが多い。それを商品画像として出すと
// その商品の見た目を偽って伝えることになるので、ロゴ・既定OGP・アイコンは捨てて画像なしにする
// （画面側はモール名のタイルへ落ちる）。画像URLの推測生成はしない。
// あわせて、同スクリーンショットの「Amazon.co.jp: 燃焼系サプリメント - ダイエットサプリメント」は
// Amazon のカテゴリページ。Amazon は商品ページの形が決まっているので厳しく判定する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { usableGoogleMallImage, isGoogleMallProductPage } from '../src/google-mall-search.mjs';

test('本物の商品画像は通す', () => {
  for (const url of [
    'https://m.media-amazon.com/images/I/71abcdEFGH._AC_SL1500_.jpg',
    'https://www.matsukiyococokara-online.com/img/goods/4902430123456_1.jpg',
    'https://image.rakuten.co.jp/shop/cabinet/item/1234.jpg'
  ]) assert.equal(usableGoogleMallImage(url), url, url);
});

test('モールのロゴ・既定OGP・アイコンは商品画像として使わない', () => {
  for (const url of [
    'https://m.media-amazon.com/images/G/09/social_share/amazon_logo._CB633266945_.png',
    'https://www.matsukiyococokara-online.com/assets/images/logo.png',
    'https://example.jp/img/site-logo-2x.png',
    'https://example.jp/img/ogp_default.jpg',
    'https://example.jp/img/default-og.png',
    'https://example.jp/img/no_image.png',
    'https://example.jp/img/noimage.gif',
    'https://example.jp/img/placeholder.webp',
    'https://example.jp/apple-touch-icon.png',
    'https://example.jp/favicon.ico',
    'https://example.jp/img/sprite.svg'
  ]) assert.equal(usableGoogleMallImage(url), '', url);
});

test('http・空・長すぎる URL は使わない', () => {
  assert.equal(usableGoogleMallImage('http://example.jp/a.jpg'), '');
  assert.equal(usableGoogleMallImage(''), '');
  assert.equal(usableGoogleMallImage(), '');
  assert.equal(usableGoogleMallImage(`https://example.jp/${'a'.repeat(1100)}.jpg`), '');
});

test('Amazon は /dp/ か /gp/product/ の形でだけ商品ページとみなす', () => {
  assert.equal(isGoogleMallProductPage('AMAZON_JP', '/dp/B08XYZ1234'), true);
  assert.equal(isGoogleMallProductPage('AMAZON_JP', '/%E3%83%AC%E3%83%8E%E3%82%A2/dp/B08XYZ1234?th=1'), true);
  assert.equal(isGoogleMallProductPage('AMAZON_JP', '/gp/product/B08XYZ1234'), true);
  assert.equal(isGoogleMallProductPage('AMAZON_JP', '/gp/aw/d/B08XYZ1234'), true);
  // 報告されたカテゴリ（ブラウズノード）ページ
  assert.equal(isGoogleMallProductPage('AMAZON_JP', '/b?node=123456'), false);
  assert.equal(isGoogleMallProductPage('AMAZON_JP', '/%E7%87%83%E7%84%BC%E7%B3%BB/b/?ie=UTF8&node=123456'), false);
  assert.equal(isGoogleMallProductPage('AMAZON_JP', '/s?k=%E3%82%B5%E3%83%97%E3%83%AA'), false);
});

test('形が決まっていないモールは従来どおりの判定を使う', () => {
  assert.equal(isGoogleMallProductPage('MATSUKIYO_JP', '/goods/4902430123456.html'), true);
  assert.equal(isGoogleMallProductPage('MATSUKIYO_JP', '/search?q=%E6%9F%94%E8%BB%9F%E5%89%A4'), false);
  assert.equal(isGoogleMallProductPage('ZOZOTOWN_JP', '/shop/nike/goods/12345/'), true);
  assert.equal(isGoogleMallProductPage('', '/category/bags'), false);
});
