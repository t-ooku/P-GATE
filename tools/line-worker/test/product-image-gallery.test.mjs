import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sanitizePublicCandidate } from '../src/index.mjs';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('公開候補は取得元のHTTPS画像だけを重複なく最大8枚返す', () => {
  const candidate = sanitizePublicCandidate({
    image: 'https://images.example.test/main.jpg',
    image_urls: [
      'https://images.example.test/main.jpg',
      'https://images.example.test/second.jpg',
      'javascript:alert(1)'
    ]
  });
  assert.deepEqual(candidate.image_urls, [
    'https://images.example.test/main.jpg',
    'https://images.example.test/second.jpg'
  ]);
  assert.equal(candidate.image, candidate.image_urls[0]);
});

test('複数画像がある商品カードだけ前後ボタンと枚数表示を出す', async () => {
  const app = await read('app.js');
  const css = await read('ai-search-layout-fix.css');
  assert.match(app, /function productImageGallery\(candidate\)/);
  assert.match(app, /if\(urls\.length===1\)return gallery/);
  assert.match(app, /product-image-gallery-button previous/);
  assert.match(app, /product-image-gallery-count/);
  assert.match(css, /\.product-image-gallery\{/);
  assert.match(css, /-webkit-line-clamp:2/);
  // 楽天市場の参照画面どおり、PCは縦長4列、スマホは画像左・情報右。
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /grid-template-columns:minmax\(112px,38%\) minmax\(0,1fr\)/);
  assert.match(css, /\.result-track>\.product-card \.price-offer b\{[^}]*color:#c90000/);
  assert.match(css, /\.watch-settings-button/);
  assert.match(app, /JA:'保存＆通知設定'/);
});
