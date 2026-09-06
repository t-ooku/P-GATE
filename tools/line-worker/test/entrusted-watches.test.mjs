import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('会員は「任せている商品」を希望価格と一緒に一覧で見られる', () => {
  const html = read('index.html');
  // 保存した検索条件（INSIGHT）や通知一覧とは別枠で、任せている商品だけを出す。
  assert.match(html, /<div id="entrustedWatches" class="entrusted-watches" aria-labelledby="entrustedTitle">/u);
  assert.match(html, /<h3 id="entrustedTitle">HOSHILUに任せている商品<\/h3>/u);
  assert.match(html, /<div id="entrustedList" class="entrusted-list" aria-live="polite">/u);
  const entrustedIndex = html.indexOf('id="entrustedWatches"');
  const mywatchIndex = html.indexOf('id="mywatch"');
  assert.ok(entrustedIndex > -1 && entrustedIndex < mywatchIndex, '通知一覧より前に置く');

  const app = read('app.js');
  assert.equal(app, read('assets-v147/app.js'), 'public/app.js と assets-v147/app.js は同一');
  // 希望価格を入れたものだけを対象にする（新着通知だけの保存条件は混ぜない）。
  assert.match(app, /return \(memberWishRecords\|\|\[\]\)\.filter\(item=>Number\(item\?\.target_price_jpy\)>0\)/u);
  // 逆ウォッチは「買った値段より安くなったら」と期限を出す。
  assert.match(app, /買った値段（\$\{yen\(item\.purchase_price_jpy\|\|Number\(item\.target_price_jpy\)\+1\)\}）より安くなったら知らせます/u);
  assert.match(app, /まで見張ります/u);
  // 未ログインでも壊れず、案内だけ出す。
  assert.match(app, /無料会員でログインすると、任せている商品を確認できます。/u);
  // 現在価格はここに出さない（取得時刻の説明が必要なため、検索結果側の責任）。
  const block = app.slice(app.indexOf('function renderEntrustedWatches()'), app.indexOf('function renderWishes()'));
  assert.doesNotMatch(block, /current_price|offers|marketplace/u);
  assert.match(read('mywatch.css'), /\.entrusted-row\{/u);
});
