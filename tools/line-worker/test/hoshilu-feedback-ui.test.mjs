import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test('通知先、確認済み最新情報、送料込み価格比較を画面に明示する', async () => {
  const [html, app, sale, knowledge, migration] = await Promise.all([
    readFile(join(root, 'public/index.html'), 'utf8'),
    readFile(join(root, 'public/app.js'), 'utf8'),
    readFile(join(root, 'public/sale-center.mjs'), 'utf8'),
    readFile(join(root, 'src/knowledge-search.mjs'), 'utf8'),
    readFile(join(root, 'migrations/0030_notification_delivery_channels.sql'), 'utf8')
  ]);
  assert.doesNotMatch(html, /<article><strong>名前が分からなくても探せる<\/strong>/);
  assert.match(html, /id="settingsChannels"/);
  for (const channel of ['APP', 'LINE', 'EMAIL', 'SMS']) assert.match(sale, new RegExp(`'${channel}'`));
  assert.match(migration, /delivery_channels/);
  assert.match(sale, /確認済みの最新情報はまだありません/);
  assert.match(sale, /if\(!sale\.official\)card\.append\(link\)/);
  assert.match(app, /\.sort\(\(a,b\)=>Number\(a\.total_cost\)-Number\(b\.total_cost\)\)/);
  assert.match(app, /送料込み価格が確認できた/);
  assert.match(app, /price-offer-scroll/);
  assert.match(knowledge, /snack: \['チップス','スナック菓子','さつまいも・野菜系'/);
  assert.match(knowledge, /チップス\|スナック菓子\|ポテトチップ/);
  assert.doesNotMatch(app, /一緒に使える便利グッズ/);
});
