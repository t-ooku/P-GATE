import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// HOSHILU INSIGHT 通知仕様変更指示書 v1.0 section5・9・10・11・12・18の
// UIテキスト要件をソース上で確認する。

test('section5: 登録UIの文言は指示書どおり「この条件で新着を通知」+補足文', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /insightToggleLabel:'この条件で新着を通知'/);
  assert.match(app, /insightToggleDescription:'この検索条件に合う商品が新しく見つかったらお知らせします。'/);
  // 検索結果ページの空状態CTA(「この条件で新着を通知」ボタン)も同じ文言
  assert.match(app, /wish:'この条件で新着を通知'/);
});

test('section3・5: HOSHILU INSIGHTの文言から「値下げ通知」の概念が除かれている', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  // wishItem(保存条件エディタ)はもう4種類のAIウォッチ用チェックボックス
  // (watchLabels)を描画しない - insight-toggleだけを持つ
  const wishItemMatch = app.match(/function wishItem\(value,t,actions\)\{[\s\S]*?\n(?=function wishCycle)/);
  assert.ok(wishItemMatch, 'wishItem関数が見つかりません');
  assert.doesNotMatch(wishItemMatch[0], /t\.watchLabels/);
  assert.doesNotMatch(wishItemMatch[0], /optionGrid/);
  assert.match(wishItemMatch[0], /insight-toggle/);
  assert.match(wishItemMatch[0], /actions\.insightToggleLabel/);
});

test('section9・10: AIウォッチの説明文は変更されない(値下げ・クーポン・再入荷・販売開始の4種別を維持)', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /watchDescription:'AIがこの商品の価格・在庫・クーポンを24時間監視します。'/);
  assert.match(app, /watchLabels:\['値下げ','クーポン','再入荷','販売開始'\]/);
  // createWatchOptions(🔔ダイアログ)は今までどおりwatchLabelsの4チェック
  // ボックスを描画する
  const bellMatch = app.match(/function createWatchOptions\(t\)\{[\s\S]*?\n(?=function saveWatchChoice)/);
  assert.ok(bellMatch, 'createWatchOptions関数が見つかりません');
  assert.match(bellMatch[0], /t\.watchLabels\.map/);
  assert.match(bellMatch[0], /t\.watchTitle/);
  assert.match(bellMatch[0], /t\.watchDescription/);
});

test('section11・12: 3つの責務(HOSHILU INSIGHT/AIウォッチ/SALE RADAR)を明示的に分けた説明文になっている', async () => {
  const i18n = await readFile(new URL('../public/site-i18n.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const source of [i18n, html]) {
    assert.match(source, /HOSHILU INSIGHT/);
    assert.match(source, /AIウォッチ/);
    assert.match(source, /SALE RADAR/);
  }
});

test('section18: index.htmlの#insightセクションから「AIウォッチ中の商品」ベースの文言が除かれている', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const insightSection = html.match(/<section id="insight"[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(insightSection, /AIウォッチ中の商品/);
  assert.match(insightSection, /保存した検索条件/);
});

test('section18: AIウォッチ自身の🔔ダイアログ関連の値下げ表記は維持される(このリストのみ除去する)', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /値下げ/); // createWatchOptions/watchLabels側には残る
});
