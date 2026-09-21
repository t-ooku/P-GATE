// 2026-09-21 指示書 ⑭⑱「Seller Dashboard を需要中心の画面にする」。
// ・商品一覧より先に「今あなたが応えられる需要」を出す
// ・3つの需要（探し中・値下がり待ち・いつものホシル）を並べる
// ・架空件数を出さない。集計できない系統は 0 と書かず「集計できていません」と言う（§30）
// ・探し中からは、そのまま「この需要に商品を登録」へ送れる（⑱）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = () => read('src/seller-page.mjs');
const script = () => read('public/seller.js');

test('需要の枠が、商品管理より前に置かれている', () => {
  const html = page();
  const demandFirst = html.indexOf('id="three-demands"');
  const catalog = html.indexOf('id="catalog"');
  const spApi = html.indexOf('AMAZON SP-API');
  assert.ok(demandFirst > 0, '枠がある');
  assert.ok(demandFirst < catalog, '商品管理より前');
  assert.ok(demandFirst < spApi, '商品同期より前');
});

test('管理メニューの先頭が「今の需要」', () => {
  const nav = page().match(/<nav class="seller-actions"[^>]*>([\s\S]*?)<\/nav>/u);
  assert.ok(nav, 'メニューがある');
  const first = nav[1].match(/href="#([a-z-]+)"/u);
  assert.equal(first[1], 'three-demands');
});

test('中身は JS が実データで埋める（サーバーが数字を書き込まない）', () => {
  const html = page();
  const block = html.slice(html.indexOf('id="three-demands"'), html.indexOf('AMAZON SP-API'));
  assert.ok(block.includes('id="sellerThreeDemands"'), '差し込み先がある');
  assert.ok(!/\d+人/u.test(block), 'HTML に人数を焼き込まない');
  assert.ok(!block.includes('${'), 'テンプレート変数で数字を入れない');
});

test('3つの需要をすべて描く', () => {
  const text = script();
  for (const label of ['探し中', '値下がり待ち', 'いつものホシル']) {
    assert.ok(text.includes(`demandLaneCard('${label}'`), label);
  }
});

test('集計できない系統は「0人」と言わない', () => {
  const text = script();
  assert.ok(text.includes('いまこの需要は集計できていません'), '計測不能を 0 と区別する');
  assert.ok(!/demand-lane-note', '0人/u.test(text), '0人と断定しない');
});

test('5人未満は人数を出さず、集計待ちとして伝える', () => {
  const text = script();
  assert.match(text, /人以上集まると、ここに出ます/u);
  assert.match(text, /人以上集まった需要だけを表示します/u);
});

test('⑱ 探し中からそのまま商品登録へ送れる', () => {
  const text = script();
  assert.match(text, /demandOfferButton\(item\.demand_key\)/u);
  assert.match(text, /'この需要に商品を登録'/u);
  assert.match(text, /select\.value = demandKey/u);
});

test('値下がり待ちは「どこまで下げれば届くか」を出す（§24）', () => {
  assert.match(script(), /中央値 \$\{jpy\(item\.median_target_jpy\)\}/u);
});

test('いつものホシルは補充の時期を出す（§23 需要予報）', () => {
  const text = script();
  assert.match(text, /within_30_days/u);
  assert.match(text, /within_7_days/u);
});

test('読み込みに失敗したら、空ではなく理由を出す', () => {
  assert.match(script(), /host\.replaceChildren\(demandNode\('p', 'metric-help', message\)\)/u);
});

test('個人情報を画面に出さない', () => {
  const text = script();
  const block = text.slice(text.indexOf('function renderThreeDemands'), text.indexOf('function renderDemand'));
  for (const key of ['member_id', 'session_id', 'visitor_id']) assert.ok(!block.includes(key), key);
});

test('枠のスタイルがある（Instagram 寄せ: 白地・1pxの線・影なし）', () => {
  const css = read('public/seller-console.css');
  assert.match(css, /\.three-demands\{display:grid/u);
  assert.match(css, /\.demand-lane\{[^}]*border:1px solid #dbdbdb/u);
  assert.ok(!/\.demand-lane\{[^}]*box-shadow/u.test(css), '影は使わない');
  assert.match(css, /@media\(max-width:900px\)\{\.three-demands\{grid-template-columns:1fr\}\}/u, 'スマホで1列');
});
