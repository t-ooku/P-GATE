import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

// v4.2 項目14・15・17: SHOPLIST/MUSINSAを新規検索導線から外し、ロフト・
// ハンズ・マツキヨ・@cosme・ABC-MARTを追加。「主要5モール/ファッション5
// モール」という分け方は「まとめて検索2モール/個別に探す11モール」
// (integrated/direct)に置き換えた。
test('公開UIは4言語でまとめて検索2・個別に探す最大13モールへ統一する', () => {
  for (const copy of [
    'HOSHILUが2モールをまとめて比較し、その他11を含む合計最大13モールで探せます',
    'HOSHILU compares 2 marketplaces together, plus up to 13 in total',
    'HOSHILU可整合比较2个商城，最多可在13个商城查找',
    'HOSHILU가 함께 비교하는 2개 쇼핑몰을 포함해 최대 13개 쇼핑몰'
  ]) assert.match(app, new RegExp(copy));

  assert.match(app, /13モールとSNSを横断して探す/);
  assert.match(app, /Yahoo!ショッピング/);
  assert.doesNotMatch(app, /主要4モール|最大9モール|Search nine marketplaces|four core marketplaces|九个商城|9개 쇼핑몰/);
  assert.doesNotMatch(app, /10モールとSNSを横断して探す/);
});
