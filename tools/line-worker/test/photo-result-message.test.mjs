// 2026-11-15 写真検索の実機（評価セット v1 の 5・7・10）: 価格未確認の Web 結果だけが
// 出ている時も「それは何に使うものですか？ 今は特定できないため…」が出ていた。
// app.js の renderResults の文言判定を取り出して、商品が 1 件でも出る時は消えることを確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const start = source.indexOf("  const resultMessageText=String(result.message||'');");
const end = source.indexOf('elements.message.textContent=(contradictsShownProducts', start);
const lineEnd = source.indexOf('\n', end);
assert.ok(start > 0 && end > start, 'renderResults の文言判定が見つからない');
const body = source.slice(start, lineEnd);
// eslint-disable-next-line no-new-func
const decide = new Function('result', 'confirmed', 'fallbackProducts', 'recommended',
  `const elements={message:{textContent:null}};${body}\nreturn elements.message.textContent;`);

const USE_WISH = 'それは何に使うものですか？ 今は特定できないため、ほしっとくへ保存して後日もう一度照合できます。';

test('価格未確認の商品だけが出ている時も「何に使うもの／特定できない」を出さない', () => {
  assert.equal(decide({ message: USE_WISH }, [], [{ product_name: 'たけのこの里' }], []), '');
  assert.equal(decide({ message: 'それは何に使うものですか？' }, [], [], [{ product_name: 'x' }]), '');
  assert.equal(decide({ message: USE_WISH }, [{ product_name: 'y' }], [], []), '');
  assert.equal(decide({ message: 'What would you use it for? There is not enough information yet. Save it to MYWISH and HOSHILU can match it again later.' }, [], [{}], []), '');
});

test('商品が 1 件も無い時は、行き止まりにしないため聞き返しの文言を残す', () => {
  assert.equal(decide({ message: USE_WISH }, [], [], []), USE_WISH);
});

test('商品がある時も、聞き返しでない通常の案内文は残す', () => {
  assert.equal(decide({ message: '近い商品を表示しています。' }, [], [{}], []), '近い商品を表示しています。');
});
