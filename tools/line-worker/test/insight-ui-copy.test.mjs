import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// HOSHILU INSIGHT 通知仕様変更指示書 v1.0 section5・9・10・11・12・18の
// UIテキスト要件をソース上で確認する。

test('section5: 新着通知を「見つかるまで探す」価値として説明する', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /insightToggleLabel:'この条件を見つかるまで探す'/);
  assert.match(app, /insightToggleDescription:'HOSHILUが定期的に検索し、新しく一致する実在商品が見つかったときだけお知らせします。'/);
  assert.match(app, /wish:'この条件を見つかるまで探す'/);
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

test('購入希望価格ウォッチは実装済みのAPI価格閾値だけを案内する', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /watchDescription:'希望価格を設定すると、対象商品のAPI確認価格を定期確認し、条件を満たした場合にお知らせします。'/);
  assert.doesNotMatch(app, /watchLabels:/);
  const bellMatch = app.match(/function createWatchOptions\(candidate,t\)\{[\s\S]*?\n(?=function saveWatchChoice)/);
  assert.ok(bellMatch, 'createWatchOptions関数が見つかりません');
  assert.doesNotMatch(bellMatch[0], /watch-options|inputs\.map|return\{bell,dialog,inputs\}/);
  assert.match(bellMatch[0], /\[false,true,false,false\]/);
  assert.match(bellMatch[0], /targetInput\.required=true/);
  assert.match(bellMatch[0], /t\.watchTitle/);
  assert.match(bellMatch[0], /t\.watchDescription/);
});

test('3つの責務(HOSHILU INSIGHT/購入希望価格ウォッチ/SALE RADAR)を明示的に分ける', async () => {
  const i18n = await readFile(new URL('../public/site-i18n.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const source of [i18n, html]) {
    assert.match(source, /HOSHILU INSIGHT/);
    assert.match(source, /購入希望価格ウォッチ/);
    assert.match(source, /SALE RADAR/);
  }
});

test('section18: index.htmlの#insightセクションから「AIウォッチ中の商品」ベースの文言が除かれている', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const insightSection = html.match(/<section id="insight"[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(insightSection, /AIウォッチ中の商品/);
  assert.match(insightSection, /保存した検索条件/);
});

test('未実装の在庫・クーポン・販売開始監視を現行機能として表示しない', async () => {
  const sources = await Promise.all([
    '../public/app.js', '../public/index.html', '../public/site-i18n.js',
    '../public/login.html', '../public/terms.html', '../src/social-autopilot.mjs'
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  const combined = sources.join('\n');
  assert.doesNotMatch(combined, /価格[・、,]\s*在庫[・、,]\s*クーポン.{0,30}(?:24時間|around the clock|监控|지켜봅니다)/iu);
  assert.doesNotMatch(combined, /watchLabels:\s*\[/u);
  assert.match(combined, /API(?:で)?確認(?:できた)?価格|API prices|API价格|API 가격/iu);
});
