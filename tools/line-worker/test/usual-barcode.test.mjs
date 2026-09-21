// 2026-09-21 指示書 P2「バーコードから いつものにする」。
// ・読み取れた番号しか使わない。桁を補ったり直したりしない
// ・番号から商品名を推測しない。商品は HOSHILU の検索結果（実データ）で確かめる
// ・読めないブラウザにはボタンを出さない（できないことを約束しない）
// ・映像は端末の中だけ。どこにも送らない・保存しない
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { barcodeSupported, normalizeBarcode, runSearch } from '../public/usual-barcode.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('バーコードとして成り立つ桁数だけ通す', () => {
  assert.equal(normalizeBarcode('4901234567894'), '4901234567894', 'JAN-13');
  assert.equal(normalizeBarcode('49123456'), '49123456', 'JAN-8');
  assert.equal(normalizeBarcode('012345678905'), '012345678905', 'UPC-A');
  assert.equal(normalizeBarcode('4901-234-567-894'), '4901234567894', '記号は落とす');
});

test('桁が足りない・多い番号は作らない', () => {
  assert.equal(normalizeBarcode('490123'), '', '足して13桁にしない');
  assert.equal(normalizeBarcode('49012345678941234'), '', '削って13桁にしない');
  assert.equal(normalizeBarcode(''), '');
  assert.equal(normalizeBarcode(), '');
  assert.equal(normalizeBarcode('よんきゅうまる'), '');
});

test('読めないブラウザでは使えないと判定する', () => {
  assert.equal(barcodeSupported({}), false);
  assert.equal(barcodeSupported({ BarcodeDetector: function detector() {} }), false, 'カメラが無ければ使えない');
  assert.equal(barcodeSupported({
    BarcodeDetector: function detector() {},
    navigator: { mediaDevices: { getUserMedia: () => {} } }
  }), true);
});

test('読めないブラウザにはボタンを出さない', () => {
  const source = read('public/usual-barcode.mjs');
  assert.match(source, /if \(!barcodeSupported\(\)\) return;/u);
});

test('番号は検索窓に入れて、いつもの検索をそのまま走らせる', () => {
  let submitted = false;
  const query = { value: '', dispatchEvent: () => true };
  const form = { requestSubmit: () => { submitted = true; } };
  const doc = { querySelector: (selector) => (selector === '#query' ? query : selector === '#knowledgeForm' ? form : null) };
  assert.equal(runSearch('4901234567894', doc), true);
  assert.equal(query.value, '4901234567894');
  assert.equal(submitted, true);
});

test('検索窓が無ければ何もしない', () => {
  assert.equal(runSearch('4901234567894', { querySelector: () => null }), false);
});

test('番号から商品を作らない（登録は検索結果から）', () => {
  const source = read('public/usual-barcode.mjs');
  assert.ok(!source.includes('/api/member/usual'), 'バーコードだけで いつもの を作らない');
  assert.ok(!source.includes('product_name'), '商品名を組み立てない');
});

test('映像をどこにも送らない・保存しない', () => {
  const source = read('public/usual-barcode.mjs');
  assert.ok(!/fetch\(|XMLHttpRequest|FormData|toDataURL|toBlob/u.test(source), '映像を外に出さない');
  assert.ok(!/localStorage|sessionStorage|indexedDB/u.test(source), '保存しない');
});

test('読み取れたらカメラを止める', () => {
  const source = read('public/usual-barcode.mjs');
  assert.match(source, /if \(found\) \{\s*\n\s*close\(\);\s*\n\s*runSearch\(found\);/u);
  assert.match(source, /track\.stop\(\)/u);
  // 見つからないまま回り続けない
  assert.match(source, /const deadline = Date\.now\(\) \+ 30_000;/u);
});

test('読めなかったときに、読めたふりをしない', () => {
  const source = read('public/usual-barcode.mjs');
  assert.ok(source.includes('読み取れませんでした'), '読めなければそう言う');
  assert.ok(source.includes('カメラを使えませんでした'), '許可が無ければそう言う');
});

test('index.html が読み込んでいる', () => {
  const html = read('public/index.html');
  assert.match(html, /<link rel="stylesheet" href="\/usual-barcode\.css\?v=1">/u);
  assert.match(html, /<script type="module" src="\/usual-barcode\.mjs\?v=1"><\/script>/u);
});

test('スタイルがある（読み取り中だけ出る）', () => {
  const css = read('public/usual-barcode.css');
  assert.match(css, /\.barcode-overlay\{position:fixed/u);
  assert.match(css, /\.barcode-status:empty\{display:none\}/u);
  assert.ok(!/box-shadow/u.test(css), '影は使わない');
});
