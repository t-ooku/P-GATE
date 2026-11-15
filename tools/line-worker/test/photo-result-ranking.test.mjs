// 2026-11-15 Cowork 依頼（docs/handoff/claude-inbox/2026-11-15-cowork-photo-result-ranking.md）。
// 写真の読み取りは正しいのに、出る商品が違った 3 例を固定データで持つ。
// ・龍角散：「タブレット」だけ当たった別商品が先頭に来ない（名前の語が当たらない候補は出さない）
// ・アルフォート：味の語が無い検索語で、味つき（ショコラサブレ・濃抹茶）が先頭に来ない
// ・特茶：今の正解（特茶 ジャスミン）が先頭のまま
// 文字の検索（photo なし）の並びは変えない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { extraVariantWordCount, photoAnchorLabels, unifyResults } from '../src/unified-results.mjs';
import { demandConditions } from '../src/shop-demand.mjs';
import { photoClarificationOverride } from '../src/index.mjs';

const web = (n, title, over = {}) => ({
  title,
  image_url: 'https://img.example/w.jpg',
  product_url: `https://www.amazon.co.jp/dp/B0PHOTO${String(n).padStart(3, '0')}`,
  tracking_url: `https://hoshilu.app/go?token=w${n}`,
  mall_label: 'Amazon', marketplace: 'AMAZON_JP', listed_price_jpy: 500,
  product_page: true,
  ...over
});
const hoshilu = (n, name) => ({
  display_name: name,
  asin: `B0RANK${String(n).padStart(4, '0')}`,
  image_urls: ['https://img.example/a.jpg'],
  product_url: `https://item.rakuten.co.jp/shop/${n}/`,
  offers: [{ total_cost: 600, marketplace: 'RAKUTEN_JP', tracking_url: `https://hoshilu.app/go?token=h${n}` }]
});
const names = (result) => result.items.map((item) => item.product_name);

test('龍角散: 「タブレット」だけ当たる別商品は写真検索で出さない', () => {
  const query = '龍角散ののどすっきりタブレット';
  const googleItems = [
    web(1, '10 Tabletas de CUAJO レンネット タブレット'),
    web(2, "明治 Mom's Tablet タブレット 葉酸"),
    web(3, '龍角散ののどすっきりタブレット シュガーレス 青 ミント'),
    web(4, '龍角散 のどすっきり タブレット ハーブ')
  ];
  const photo = unifyResults({ googleItems, query, photo: true });
  assert.ok(names(photo).length >= 1);
  assert.ok(names(photo).every((name) => name.includes('龍角散')), names(photo).join(' / '));
  assert.match(names(photo)[0], /龍角散/u);
  // 文字の検索は従来どおり（変えない）
  const text = unifyResults({ googleItems, query });
  assert.ok(names(text).some((name) => /CUAJO|Mom's/u.test(name)));
});

test('龍角散: 名前の語が当たる候補が 0 件なら、混ぜずに 0 件（画面はモールの検索リンク）', () => {
  const query = '龍角散ののどすっきりタブレット';
  const photo = unifyResults({ googleItems: [web(1, '10 Tabletas de CUAJO タブレット')], query, photo: true });
  assert.equal(photo.items.length, 0);
});

test('アルフォート: 味の語が無い検索語で、味つきが先頭に来ない（消さずに下げる）', () => {
  const query = 'ブルボン アルフォートミニチョコレート';
  const result = unifyResults({
    candidates: [
      hoshilu(1, 'ブルボン アルフォートミニチョコレート ショコラサブレ 12個'),
      hoshilu(2, 'ブルボン アルフォートミニチョコレート 濃抹茶 12個')
    ],
    googleItems: [web(3, 'ブルボン アルフォートミニチョコレート 12個入')],
    query,
    photo: true
  });
  assert.equal(names(result)[0], 'ブルボン アルフォートミニチョコレート 12個入');
  assert.equal(result.items.length, 3);
  // 味を指定した検索では、その味は下げない
  const matcha = unifyResults({
    candidates: [hoshilu(1, 'ブルボン アルフォートミニチョコレート 濃抹茶 12個')],
    googleItems: [web(3, 'ブルボン アルフォートミニチョコレート バニラホワイト')],
    query: 'ブルボン アルフォートミニチョコレート 濃抹茶',
    photo: true
  });
  assert.match(names(matcha)[0], /濃抹茶/u);
});

test('特茶: 今の正解（特茶 ジャスミン）が先頭のまま', () => {
  const query = 'サントリー 特茶 ジャスミン PREMIUM';
  const result = unifyResults({
    googleItems: [
      web(1, 'サントリー 特茶 ジャスミン 特定保健用食品 500ml×24本'),
      web(2, 'サントリー 伊右衛門 ジャスミン茶 600ml'),
      web(3, 'ジャスミン PREMIUM ティーバッグ')
    ],
    query,
    photo: true
  });
  assert.match(names(result)[0], /特茶 ジャスミン/u);
});

test('名前の語: 一般語・味の語は名前の語にしない', () => {
  assert.deepEqual(photoAnchorLabels(demandConditions('龍角散ののどすっきりタブレット')), ['龍角散']);
  assert.deepEqual(photoAnchorLabels(demandConditions('ブルボン アルフォートミニチョコレート')), ['ブルボン', 'アルフォートミニチョコレート']);
  assert.equal(extraVariantWordCount('アルフォート 濃抹茶', 'アルフォート'), 1);
  assert.equal(extraVariantWordCount('アルフォート 濃抹茶', 'アルフォート 濃抹茶'), 0);
  assert.equal(extraVariantWordCount('アルフォートミニチョコレート', 'アルフォート'), 0);
});

test('写真検索で商品が出ている時は聞き返しの文を出さない（0 件・文字の検索は従来どおり）', () => {
  const question = 'それは何に使うものですか？';
  const result = {
    message: `${question} 今は特定できないため、ほしっとくへ保存して後日もう一度照合できます。`,
    clarification: { required: false, question, options: [] }
  };
  assert.deepEqual(photoClarificationOverride(result, true, 6), {
    clarification: { required: false, question, options: [] }, message: ''
  });
  assert.deepEqual(photoClarificationOverride(result, true, 0), {});
  assert.deepEqual(photoClarificationOverride(result, false, 6), {});
  // 聞き返し以外の案内文（接続失敗など）は消さない
  const other = { message: '楽天市場・Yahoo!ショッピングとの接続に失敗しました。', clarification: { question, options: [] } };
  assert.equal(photoClarificationOverride(other, true, 3).message, undefined);
});
