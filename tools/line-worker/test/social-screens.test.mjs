import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRICE_SELECTORS, SLIDES } from '../scripts/build-social-screens.mjs';

// 2026-10-15 大隆さん指示: 実画面（買い物ノート・ホシルバズ）をフィード投稿に使う。価格だけぼかす。
test('実画面カルーセル: 価格・値下がり率・差額の表示クラスはすべてぼかし対象', () => {
  const media = readFileSync(new URL('../src/owned-media.mjs', import.meta.url), 'utf8');
  const buzz = readFileSync(new URL('../public/buzz-home.mjs', import.meta.url), 'utf8');
  for (const cls of ['media-drop-prices', 'media-drop-rate', 'media-tile-price', 'media-tile-badge-down', 'media-tile-badge-up']) {
    assert.ok(media.includes(cls), `owned-media に ${cls} がある`);
    assert.ok(PRICE_SELECTORS.includes(`.${cls}`), `${cls} をぼかす`);
  }
  assert.ok(buzz.includes("'buzz-home-price'"));
  assert.ok(PRICE_SELECTORS.includes('.buzz-home-price'));
});

test('実画面カルーセル: 5枚・買い物ノートとホシルバズを含み、見出しに価格・誇張表現がない', () => {
  assert.equal(SLIDES.length, 5);
  assert.deepEqual(SLIDES.map((slide) => slide.url), ['/media', '/media/price-drops', '/media#ranking', '/#tab-buzz', '/']);
  for (const slide of SLIDES) {
    const copy = `${slide.kicker}${slide.title}${slide.body}`;
    assert.doesNotMatch(copy, /[¥￥]|\d+\s*円|\d+\s*[%％]|最安|必ず|保証|No\.?1/u, slide.id);
  }
});

test('実画面カルーセル: 商品名に入った金額・割引率も文字ごとにぼかす', async () => {
  const { PRICE_TEXT } = await import('../scripts/build-social-screens.mjs');
  const hits = (text) => (String(text).match(new RegExp(PRICE_TEXT.source, 'gu')) || []);
  assert.deepEqual(hits('79%OFF!【10/14 10時〜24H限定：830円〜'), ['79%OFF', '830円']);
  assert.deepEqual(hits('65%OFF! 1,370'), ['65%OFF', '1,370']);
  assert.deepEqual(hits('【クーポンで1000円OFF】送料無料'), ['1000円']);
  assert.deepEqual(hits('¥2,980 → ¥1,980'), ['¥2,980', '¥1,980']);
  assert.deepEqual(hits('花王 キュレル 泡洗顔料 詰替 130ml 10/14 30位'), []);
});
