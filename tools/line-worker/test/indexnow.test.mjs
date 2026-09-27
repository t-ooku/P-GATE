import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INDEXNOW_KEY, indexNowDue, indexNowUrls, runIndexNowSubmission, sitemapEntries } from '../src/indexnow.mjs';

const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');

test('IndexNow の鍵ファイルは public/<鍵>.txt に鍵そのものを置く', () => {
  assert.match(INDEXNOW_KEY, /^[a-f0-9]{32}$/u);
  assert.equal(readFileSync(new URL(`../public/${INDEXNOW_KEY}.txt`, import.meta.url), 'utf8').trim(), INDEXNOW_KEY);
});

test('sitemap から hoshilu.app の https URL だけを読む', () => {
  const entries = sitemapEntries(sitemap);
  assert.ok(entries.length >= 100);
  assert.ok(entries.every((entry) => entry.loc.startsWith('https://hoshilu.app/')));
  assert.deepEqual(sitemapEntries('<url><loc>https://evil.example/x</loc></url><url><loc>http://hoshilu.app/a</loc></url>'), []);
});

test('送るのは JST 4時台の1回だけ。平日は更新3日以内と主要ページ、月曜は全 URL', () => {
  assert.equal(indexNowDue(new Date('2026-09-27T19:00:00Z')), true); // 9/28 04:00 JST
  assert.equal(indexNowDue(new Date('2026-09-27T19:15:00Z')), false);
  assert.equal(indexNowDue(new Date('2026-09-27T20:00:00Z')), false);
  const entries = [
    { loc: 'https://hoshilu.app/', lastmod: '' },
    { loc: 'https://hoshilu.app/ja/new', lastmod: '2026-09-27' },
    { loc: 'https://hoshilu.app/ja/old', lastmod: '2026-08-01' }
  ];
  const tuesday = indexNowUrls(entries, new Date('2026-09-28T19:00:00Z')); // 9/29 火
  assert.ok(tuesday.includes('https://hoshilu.app/ja/new'));
  assert.ok(!tuesday.includes('https://hoshilu.app/ja/old'));
  assert.ok(tuesday.includes('https://hoshilu.app/for-sellers'));
  const monday = indexNowUrls(entries, new Date('2026-09-27T19:00:00Z')); // 9/28 月
  assert.ok(monday.includes('https://hoshilu.app/ja/old'));
});

test('送信は host・key・keyLocation・urlList だけ。時間外は送らない。失敗しても投げない', async () => {
  const calls = [];
  const env = { ASSETS: { fetch: async () => new Response(sitemap) } };
  const fetchImpl = async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return new Response('', { status: 202 }); };
  assert.deepEqual(await runIndexNowSubmission(env, new Date('2026-09-27T12:00:00Z'), fetchImpl), { status: 'NOT_DUE' });
  const result = await runIndexNowSubmission(env, new Date('2026-09-27T19:00:00Z'), fetchImpl);
  assert.equal(result.status, 'SUBMITTED');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.indexnow.org/indexnow');
  assert.deepEqual(Object.keys(calls[0].body).sort(), ['host', 'key', 'keyLocation', 'urlList']);
  assert.equal(calls[0].body.host, 'hoshilu.app');
  assert.equal(calls[0].body.keyLocation, `https://hoshilu.app/${INDEXNOW_KEY}.txt`);
  assert.ok(calls[0].body.urlList.length >= 100, '月曜は全 URL');
  const failed = await runIndexNowSubmission(env, new Date('2026-09-27T19:00:00Z'), async () => { throw new Error('network'); });
  assert.equal(failed.status, 'FAILED');
  assert.deepEqual(await runIndexNowSubmission({ ...env, INDEXNOW_ENABLED: 'false' }, new Date('2026-09-27T19:00:00Z'), fetchImpl), { status: 'DISABLED' });
  const src = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(src, /runIndexNowSubmission\(env, scheduledAt\)/u);
});
