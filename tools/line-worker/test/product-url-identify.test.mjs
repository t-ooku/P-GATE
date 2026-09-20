import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { identifyProductUrl, parseProductPage, productUrlFromQuery } from '../src/product-url-identify.mjs';

// 2026-09-20 GPT 指示書 §P0「URL 貼り付け→ホシっとく」: 13 モールの商品ページ URL だけを読み、
// 価格はページに書かれた JPY だけ。読めなければ「自動追跡できません」（推測しない）。

test('検索窓の文字列が 1 本の商品 URL の時だけ対象（文＋URL・非対応サイト・一覧ページは対象外）', () => {
  assert.deepEqual(productUrlFromQuery(' https://www.amazon.co.jp/dp/B0EXAMPLE1 '), { url: 'https://www.amazon.co.jp/dp/B0EXAMPLE1', marketplace: 'AMAZON_JP' });
  assert.equal(productUrlFromQuery('https://zozo.jp/shop/example/goods/12345/').marketplace, 'ZOZOTOWN_JP');
  assert.equal(productUrlFromQuery('これ欲しい https://www.amazon.co.jp/dp/B0EXAMPLE1'), null);
  assert.equal(productUrlFromQuery('https://example.com/item/1'), null);
  assert.equal(productUrlFromQuery('https://www.amazon.co.jp/s?k=%E6%B0%B4%E7%AD%92'), null);
  assert.equal(productUrlFromQuery('子ども 水筒'), null);
});

const PAGE = `<html><head><title>ダミー | ZOZOTOWN</title>
<meta property="og:title" content="キッズ ステンレス水筒 500ml（OG）">
<meta property="og:image" content="https://c.imgz.jp/og.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"キッズ ステンレス水筒 500ml","image":["https://c.imgz.jp/1.jpg"],"brand":{"@type":"Brand","name":"サーモス"},"offers":[{"@type":"Offer","price":"2,980","priceCurrency":"JPY"},{"@type":"Offer","price":"2480","priceCurrency":"JPY"}]}</script>
</head><body></body></html>`;

test('JSON-LD Product/Offer を優先し、JPY の最安を価格にする', () => {
  const product = parseProductPage(PAGE, { url: 'https://zozo.jp/shop/example/goods/12345/', marketplace: 'ZOZOTOWN_JP' });
  assert.equal(product.name, 'キッズ ステンレス水筒 500ml');
  assert.equal(product.brand, 'サーモス');
  assert.equal(product.image_url, 'https://c.imgz.jp/1.jpg');
  assert.equal(product.price_jpy, 2480);
  assert.equal(product.price_available, true);
  assert.equal(product.marketplace_label, 'ZOZOTOWN');
});

test('JSON-LD が無ければ OG から名前・画像を取り、USD や価格なしは「自動追跡できません」', () => {
  const html = `<meta property="og:title" content="SHEIN kids bottle"><meta property="og:image" content="https://img.ltwebstatic.com/x.jpg"><meta property="product:price:amount" content="9.99"><meta property="product:price:currency" content="USD">`;
  const product = parseProductPage(html, { url: 'https://jp.shein.com/kids-bottle-p-999.html', marketplace: 'SHEIN_JP' });
  assert.equal(product.name, 'SHEIN kids bottle');
  assert.equal(product.image_url, 'https://img.ltwebstatic.com/x.jpg');
  assert.equal(product.price_jpy, 0);
  assert.equal(product.price_available, false);
  assert.match(product.price_note, /自動追跡できません/u);
  const jpy = parseProductPage(`<meta property="og:title" content="X"><meta property="product:price:amount" content="1980"><meta property="product:price:currency" content="JPY">`, { url: 'https://zozo.jp/shop/a/goods/1/', marketplace: 'ZOZOTOWN_JP' });
  assert.equal(jpy.price_jpy, 1980);
});

test('identifyProductUrl は対応 URL だけ取りに行き、HTTP エラー・時間切れは理由だけ返す', async () => {
  const calls = [];
  const fetcher = async (url, init) => { calls.push(String(url)); assert.match(init.headers['user-agent'], /HOSHILU-ProductPreview/u); return new Response(PAGE, { headers: { 'content-type': 'text/html' } }); };
  const ok = await identifyProductUrl({}, 'https://zozo.jp/shop/example/goods/12345/', { fetch: fetcher, cache: null });
  assert.equal(ok.ok, true);
  assert.equal(ok.product.name, 'キッズ ステンレス水筒 500ml');
  assert.deepEqual(calls, ['https://zozo.jp/shop/example/goods/12345/']);
  const skipped = await identifyProductUrl({}, 'https://example.com/x', { fetch: fetcher, cache: null });
  assert.deepEqual(skipped, { ok: false, reason: 'NOT_PRODUCT_URL' });
  assert.equal(calls.length, 1);
  const failed = await identifyProductUrl({}, 'https://zozo.jp/shop/example/goods/99/', { fetch: async () => new Response('nope', { status: 404 }), cache: null });
  assert.deepEqual(failed, { ok: false, reason: 'HTTP_404' });
  const empty = await identifyProductUrl({}, 'https://zozo.jp/shop/example/goods/98/', { fetch: async () => new Response('<html></html>'), cache: null });
  assert.deepEqual(empty, { ok: false, reason: 'PRODUCT_NOT_FOUND' });
});

test('トップは product-url-paste を読み、送信を capture で先に受けて URL の時だけ止める', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="\/product-url-paste\.css\?v=1">/u);
  assert.match(html, /<script type="module" src="\/product-url-paste\.mjs\?v=1"><\/script>/u);
  const client = readFileSync(new URL('../public/product-url-paste.mjs', import.meta.url), 'utf8');
  assert.match(client, /document\.addEventListener\('submit'[\s\S]*?, true\);/u);
  assert.match(client, /event\.stopImmediatePropagation\(\)/u);
  assert.match(client, /fetch\('\/api\/product-url\/identify'/u);
  assert.match(client, /この商品ですか？/u);
  assert.match(client, /window\.HoshiluWatch\?\.open\(/u);
  const worker = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(worker, /url\.pathname === '\/api\/product-url\/identify'/u);
});
