import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildYouthSearchPost, youthSearchThemes } from '../src/social-content-generator.mjs';

test('young-audience generator provides twelve distinct discovery themes', () => {
  assert.equal(youthSearchThemes.length, 12);
  assert.equal(new Set(youthSearchThemes.map((theme) => theme.id)).size, 12);
});

test('generated posts lead to HOSHILU with marketplace discovery attribution', () => {
  for (let index = 0; index < youthSearchThemes.length; index += 1) {
    const post = buildYouthSearchPost(index, ['X', 'INSTAGRAM', 'TIKTOK'][index % 3]);
    const url = new URL(post.link);
    assert.equal(url.origin, 'https://hoshilu.app');
    assert.ok(url.searchParams.get('q').length >= 5);
    assert.equal(url.searchParams.get('utm_campaign'), 'youth_marketplace_discovery');
    assert.equal(post.status, 'REVIEW_REQUIRED');
    assert.match(post.caption, /Amazon/);
    assert.match(post.caption, /楽天市場/);
    assert.match(post.caption, /Qoo10/);
    assert.match(post.caption, /SHEIN/);
  }
});

test('social rotation covers cross-market, ambiguous trends, popular wishes, and occasional reels', () => {
  const posts = youthSearchThemes.map((_, index) => buildYouthSearchPost(index, 'INSTAGRAM'));
  assert.deepEqual(
    new Set(posts.map((post) => post.campaign_pillar)),
    new Set(['CROSS_MARKET', 'AMBIGUOUS_TREND', 'POPULAR_WISH'])
  );
  const reels = posts.filter((post) => post.content_format === 'REEL');
  assert.equal(reels.length, 4);
  reels.forEach((post) => {
    assert.equal(post.reel_script.aspect_ratio, '9:16');
    assert.equal(post.reel_script.scenes.length, 4);
    assert.match(post.reel_script.asset_policy, /権利確認済み/);
  });
  assert.ok(posts.some((post) => /ほしっトク|ほしっとく/.test(post.caption)));
  assert.ok(posts.some((post) => /あいまい検索/.test(post.caption)));
});

test('next 14-day queue includes four marketplaces and recurring reel posts', async () => {
  const csv = await readFile(
    new URL('../../../marketing/social/HOSHILU_NEXT_14_DAY_YOUTH_GROWTH_QUEUE.csv', import.meta.url),
    'utf8'
  );
  const rows = csv.trim().split(/\r?\n/);
  assert.equal(rows.length, 15);
  assert.match(csv, /Amazon/);
  assert.match(csv, /楽天市場/);
  assert.match(csv, /Qoo10/);
  assert.match(csv, /SHEIN/);
  assert.ok((csv.match(/,REEL,/g) || []).length >= 4);
  assert.match(csv, /ほしっトク/);
});