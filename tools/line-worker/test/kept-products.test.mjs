import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');

// 2026-09-20 大隆さん報告: 気になる商品をタップしても検索トップに飛ぶだけで何も起きない。
// 商品 URL を保存できていない行が href="#" になっていた（行き止まり）。
// URL が無いときは商品名で探し直す。画像も image_urls（配列）から拾う。
test('気になる商品は URL が無ければ探し直す（href="#" の行き止まりを作らない）', () => {
  const app = read('app.js');
  assert.ok(app.includes("const link=document.createElement(item.url?'a':'button');"));
  assert.ok(!app.includes("link.href=item.url||'#';"));
  assert.ok(app.includes('function keptImageFrom(candidate){'));
  assert.ok(app.includes("url:String(offer.product_url||offer.url||offer.tracking_url||candidate?.product_url||candidate?.url||candidate?.tracking_url||'').slice(0,800),"));
  assert.ok(read('mywatch.css').includes('button.kept-card-link{width:100%;padding:0;border:0;background:none;font:inherit;text-align:left;cursor:pointer}'));
  assert.equal(app, read('assets-v147/app.js'));
});
