// 2026-09-21 大隆さん報告「画像出てないよ」と、そのあとの判断「無地になるならロゴでいいよ」
// 「提示商品が減るのはダメ」を固定する。
// ・ロゴ（Amazon の social_share ロゴ等）は弾かない。サイト自身が og:image として出している
//   本物の値であり、無地のタイルより画面として成立する、という大隆さん判断。
// ・残した改善は候補の順番だけ: product.image を og:image より先に見る。
// ・Amazon のカテゴリ（ブラウズノード）ページは商品ページとみなさない。ただし結果からは
//   捨てず、商品ページの後ろに残す（画面側で「一覧ページ」と明示し、ホシっとくは出さない）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { usableGoogleMallImage, isGoogleMallProductPage, parseGoogleMallItems } from '../src/google-mall-search.mjs';

test('本物の商品画像は通す', () => {
  for (const url of [
    'https://m.media-amazon.com/images/I/71abcdEFGH._AC_SL1500_.jpg',
    'https://www.matsukiyococokara-online.com/img/goods/4902430123456_1.jpg',
    'https://image.rakuten.co.jp/shop/cabinet/item/1234.jpg'
  ]) assert.equal(usableGoogleMallImage(url), url, url);
});

// 大隆さん判断「無地になるならAmazonや他も同じくロゴでいいよ」: ロゴは弾かない。
test('モールのロゴも画像として出す（無地のタイルにしない）', () => {
  for (const url of [
    'https://m.media-amazon.com/images/G/09/social_share/amazon_logo._CB633266945_.png',
    'https://www.matsukiyococokara-online.com/assets/images/logo.png',
    'https://example.jp/img/ogp_default.jpg'
  ]) assert.equal(usableGoogleMallImage(url), url, url);
});

test('商品として構造化された画像を og:image より先に見る', () => {
  const source = readFileSync(new URL('../src/google-mall-search.mjs', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('function firstImage'), source.indexOf('function firstImage') + 600);
  assert.ok(block.indexOf("product?.[0]?.image") < block.indexOf("'og:image'"));
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

// 大隆さん指示「提示商品が減るのはダメ」: 商品ページでないものも捨てず、後ろに残す。
test('一覧ページも結果から落とさず、商品ページの後ろに並べる', () => {
  const rows = [
    { title: 'Amazon.co.jp: 燃焼系サプリメント - ダイエットサプリメント', link: 'https://www.amazon.co.jp/b?node=123456' },
    { title: 'レノア ハピネス 夢ふわタッチ 柔軟剤', link: 'https://www.amazon.co.jp/dp/B08XYZ1234' }
  ];
  const items = parseGoogleMallItems(rows);
  assert.equal(items.length, 2, '件数を減らさない');
  assert.equal(items[0].product_page, true, '商品ページが先');
  assert.equal(items[1].product_page, false, '一覧ページは後ろ');
});

test('画面側は一覧ページを「商品を見る」と書かず、ホシっとくも出さない', () => {
  const ui = readFileSync(new URL('../public/google-mall-results.mjs', import.meta.url), 'utf8');
  assert.match(ui, /const isProduct = item\.product_page === true;/u);
  assert.match(ui, /isProduct \? c\.open : c\.openListing/u);
  assert.match(ui, /if \(!isProduct\) body\.append\(el\('span', 'google-mall-card-kind', c\.listing\)\);/u);
  assert.match(ui, /if\(item\.product_page===true\)\{/u);
  for (const key of ['openListing', 'listing']) {
    assert.equal((ui.match(new RegExp(`${key}:`, 'gu')) || []).length, 4, `${key} は4言語ぶん`);
  }
});
