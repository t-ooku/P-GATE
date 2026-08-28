import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('continuous search is promoted on the home page and every result path', async () => {
  const [html, app, css] = await Promise.all([
    read('public/index.html'), read('public/app.js'), read('public/continuous-search.css')
  ]);
  assert.match(html, /検索は、1回で終わらない。/u);
  assert.match(html, /continuous-search\.css\?v=1/u);
  assert.match(app, /function continuousSearchCard\(query\)/u);
  assert.match(app, /if\(continuous\)resultCards\.push\(continuous\)/u);
  assert.match(app, /if\(continuous\)emptyCards\.push\(continuous\)/u);
  assert.match(app, /source:'continuous_search'/u);
  assert.match(css, /\.continuous-search-card/u);
});

test('continuous search copy promises only the implemented new-match behavior', async () => {
  const app = await read('public/app.js');
  assert.match(app, /新しく一致する実在商品/u);
  assert.match(app, /値下げ通知ではなく/u);
  assert.doesNotMatch(app, /必ず見つか/u);
});

test('seller inquiry removes the blocking consent checkbox without dropping consent recording', async () => {
  const [html, script] = await Promise.all([
    read('public/for-sellers.html'), read('public/for-sellers.js')
  ]);
  assert.doesNotMatch(html, /name="privacy_consent"/u);
  assert.match(html, /送信すると/u);
  assert.match(script, /privacy_consent: true/u);
});

test('approved launch promotion is queued for connected text channels', async () => {
  const migration = await read('migrations/0060_continuous_search_launch.sql');
  assert.match(migration, /'X'.*'continuous_search_launch_2026_08'/su);
  assert.match(migration, /'THREADS'.*'continuous_search_launch_2026_08'/su);
  assert.equal((migration.match(/'APPROVED'/gu) || []).length, 2);
});
