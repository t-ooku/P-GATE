import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { localizedDemoWishes, localizedWishLabel } from '../public/wish-localization.mjs';

test('保存済みデモ検索例を表示言語へ翻訳する', () => {
  assert.equal(Object.keys(localizedDemoWishes).length, 4);
  for (const [japanese, translations] of Object.entries(localizedDemoWishes)) {
    assert.equal(localizedWishLabel(japanese, 'JA'), japanese);
    assert.equal(localizedWishLabel(japanese, 'EN'), translations.EN);
    assert.equal(localizedWishLabel(japanese, 'ZH'), translations.ZH);
    assert.equal(localizedWishLabel(japanese, 'KO'), translations.KO);
  }
});

test('ユーザー自身の検索文は意味を変えず原文を保つ', () => {
  const query = '祖母が昔使っていた青い台所道具';
  assert.equal(localizedWishLabel(query, 'KO'), query);
});

test('画面は翻訳ラベルを使い、元検索語を再検索用に保持する', async () => {
  const [app, serviceWorker] = await Promise.all([
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8')
  ]);
  assert.match(app, /localizedWishLabel\(value,elements\.language\.value\)/);
  assert.match(app, /elements\.query\.value=value/);
  assert.match(serviceWorker, /hoshilu-shell-v78/);
  assert.match(serviceWorker, /wish-localization\.mjs/);
});
