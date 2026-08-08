import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleMemberWishRoutes } from '../src/member-wish-v2.mjs';

test('MYWISH APIはD1未設定時に安全に停止する', async () => {
  const response = await handleMemberWishRoutes(new Request('https://hoshilu.app/api/member/wishes'), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'MEMBER_STORE_NOT_CONFIGURED');
});

test('MYWISH以外のURLは処理しない', async () => {
  const response = await handleMemberWishRoutes(new Request('https://hoshilu.app/api/knowledge'), {});
  assert.equal(response, null);
});

test('MYWISH更新・削除は通知条件を扱い、削除後は匿名イベントだけを残す', async () => {
  const source = await import('node:fs').then(fs => fs.readFileSync(new URL('../src/member-wish-v2.mjs', import.meta.url), 'utf8'));
  assert.match(source, /request\.method === 'PATCH'/);
  assert.match(source, /DELETED_BY_MEMBER/);
  assert.match(source, /member_wish_events/);
  assert.match(source, /watch_frequency/);
  assert.match(source, /DELETE FROM mywatch_notifications WHERE member_id=\?1 AND wish_id=\?2/);
  assert.doesNotMatch(source, /INSERT INTO member_wish_events\([^)]*query_text/);
  assert.doesNotMatch(source, /INSERT INTO member_wish_events\([^)]*member_id/);
});

test('MYWATCH通知頻度をAPIと会員画面の両方で変更できる', async () => {
  const [source, app] = await Promise.all([
    import('node:fs').then(fs => fs.readFileSync(new URL('../src/member-wish-v2.mjs', import.meta.url), 'utf8')),
    import('node:fs').then(fs => fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'))
  ]);
  assert.match(source, /WATCH_FREQUENCIES/);
  // HOSHILU INSIGHT v1.0: 保存条件エディタ(wishItem)はもうwatch_sale等の
  // 4フラグを送らないため、watch_frequencyもCOALESCEで部分更新される
  // (未指定なら既存値を温存)側に変わった。AIウォッチの🔔ダイアログは
  // 引き続きpayloadForで4フラグ全部を明示的に送るので、そちらの挙動は
  // 今までと同一(常に上書き)のまま。
  assert.match(source, /watch_frequency=COALESCE\(\?9,member_wishes\.watch_frequency\)/);
  assert.match(app, /watchFrequencyFor/);
  assert.match(app, /\['MUTED','通知を停止'\]/);
  assert.match(app, /updateInsightWatch\(record,notifyNewMatch,frequency\.value\)/);
});

// HOSHILU INSIGHT delete controls (2026-08-07 request). Removing one AI Watch
// item meant opening the row's <details>, finding 削除 in the editor and
// confirming - three interactions to undo one. The row now carries its own
// one-tap delete and the toolbar a bulk one.
test('AIウォッチは行ごとの1タップ削除と一括削除を持つ', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/wish-carousel.css', import.meta.url), 'utf8');

  // ローカル一覧・通知条件・会員レコード・サーバー記録をまとめて消す実装が
  // 1つだけあり、行ボタンとエディタの削除が両方それを呼ぶ
  assert.match(app, /async function deleteWish\(value\)\{/);
  assert.match(app, /memberWishRecords=memberWishRecords\.filter\(item=>item\.query_text!==value\)/);
  assert.match(app, /await deleteWish\(value\);renderWishes\(\);/);
  assert.match(app, /function wishRowDeleteButton\(value,actions\)/);
  // 行の削除ボタンは<summary>内にあるので、押しても<details>が開いてしまわない
  assert.match(app, /event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*await deleteWish\(value\)/);
  // 一括削除は確認あり（1件は再検索で戻せるが全件は戻せない）
  assert.match(app, /async function deleteAllWishes\(actions\)/);
  assert.match(app, /if\(!values\.length\|\|!confirm\(actions\.deleteAllConfirm\)\)return;/);
  // 0件のときは一括削除ボタンを出さない
  assert.match(app, /deleteAll\.classList\.toggle\('hidden',!allWishes\.length\)/);
  assert.match(html, /id="deleteAllWishes"[^>]*class="wish-delete-all hidden"/);
  // 4言語ぶんのラベル
  ['JA', 'EN', 'ZH', 'KO'].forEach((language) => {
    assert.match(app, new RegExp(`${language}:\\{[^\n]*?deleteWishAria:'[^']+',deleteAllWishes:'[^']+',deleteAllConfirm:'[^']+'`));
  });
  // タップ領域44px
  assert.match(css, /\.wish-row-delete\s*\{[^}]*width:\s*44px;[\s\S]*?height:\s*44px/);
});
