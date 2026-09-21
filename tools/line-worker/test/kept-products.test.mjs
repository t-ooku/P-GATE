import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');

// 2026-09-20 大隆さん報告: 気になる商品をタップしても検索トップに飛ぶだけで何も起きない。
// 商品 URL を保存できていない行が href="#" になっていた（行き止まり）。
// URL が無いときは商品名で探し直す。画像も image_urls（配列）から拾う。
test('気になる商品は URL が無ければ探し直す（href="#" の行き止まりを作らない）', () => {
  const app = read('app.js');
  assert.ok(app.includes("const link=document.createElement(openUrl?'a':'button');"));
  assert.ok(!app.includes("link.href=item.url||'#';"));
  assert.ok(app.includes('function keptImageFrom(candidate){'));
  assert.ok(app.includes('url:keptProductUrl(offer,candidate),'));
  assert.ok(read('mywatch.css').includes('button.kept-card-link{width:100%;padding:0;border:0;background:none;font:inherit;text-align:left;cursor:pointer}'));
  assert.equal(app, read('assets-v147/app.js'));
});

// 2026-09-21 大隆さん報告: お気に入りをタップすると TRACK_TOKEN_SIGNATURE_INVALID の白画面。
// 署名付き計測URL（/go?token=…）を端末に保存していたため、800字で切れて署名が壊れていた。
test('気になる商品はモールの商品URLだけを保存し、計測URL・長すぎるURLは保存も表示もしない', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes('function usableKeptUrl(value){'));
  assert.ok(app.includes("if(text.indexOf('/go?token=')>=0)return '';"));
  assert.ok(app.includes("if(text.slice(0,8)!=='https://'||text.length>800)return '';"));
  // 保存時の候補に tracking_url を入れない（keptProductUrl の候補列に無いことで担保）
  assert.ok(app.includes('const list=[offer&&offer.product_url,offer&&offer.url,candidate&&candidate.product_url,candidate&&candidate.url];'));
  // 既に保存済みの壊れたURLも行き止まりにしない
  assert.ok(app.includes('const openUrl=usableKeptUrl(item.url);'));
  assert.ok(app.includes("const link=document.createElement(openUrl?'a':'button');"));
});
