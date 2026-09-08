import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('公開UIは4言語で主要5・ファッション最大10モールへ統一する', () => {
  for (const copy of [
    '主要5モール、ファッション含めて最大10モール',
    'five core marketplaces, or up to ten including fashion',
    '五个主要商城，包含时尚商城时最多十个',
    '주요 5개 쇼핑몰과 패션을 포함해 최대 10개 쇼핑몰'
  ]) assert.match(app, new RegExp(copy));

  assert.match(app, /10モールとSNSを横断して探す/);
  assert.match(app, /Yahoo!ショッピング/);
  assert.doesNotMatch(app, /主要4モール|最大9モール|Search nine marketplaces|four core marketplaces|九个商城|9개 쇼핑몰/);
});
