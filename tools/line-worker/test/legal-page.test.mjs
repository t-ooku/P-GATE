import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 2026-09-28 大隆さん決定「請求があれば遅滞なく開示します」で特定商取引法に基づく表記を出す。
// 本名・住所・電話番号はページに書かない。開示の請求経路と、請求時に遅滞なく送る旨を必ず書く。
const html = readFileSync(new URL('../public/legal.html', import.meta.url), 'utf8');

test('氏名・所在地・電話番号は「請求があれば遅滞なく開示します」', () => {
  for (const heading of ['販売事業者（氏名）', '所在地', '電話番号']) {
    assert.ok(html.includes(`<h2>${heading}</h2>\n    <p>請求があれば遅滞なく開示します。</p>`), heading);
  }
  assert.match(html, /href="\/for-sellers#businessForm"/u, '開示の請求経路');
  assert.match(html, /遅滞なくお送りします/u);
  assert.doesNotMatch(html, /0[789]0-?\d{4}-?\d{4}|〒\d{3}/u, '電話番号・住所を直接書かない');
});

test('料金・支払時期・解約が現行条件と一致し、旧料金を書かない', () => {
  assert.match(html, /月額1,980円（税込）/u);
  assert.match(html, /30日間（30×24時間）無料/u);
  assert.match(html, /31日目/u);
  assert.match(html, /解約して自動更新を停止する/u);
  assert.match(html, /<span data-seller-enrollment-pending>現在、この条件での体験開始は準備中です。<\/span>/u);
  assert.doesNotMatch(html, /4,?980円|3か月|値下げ|永久|今だけ/u);
});

test('/legal は受付開始時に準備中表示が外れる対象で、/legal.html は /legal へ寄せる', () => {
  const source = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(source, /\['\/terms','\/for-sellers','\/for-creators','\/legal'\]\.includes\(url\.pathname\)/u);
  assert.match(source, /\['\/legal\.html', '\/legal'\]/u);
  for (const page of ['for-sellers.html', 'terms.html']) {
    assert.match(readFileSync(new URL(`../public/${page}`, import.meta.url), 'utf8'), /href="\/legal"/u, page);
  }
});
