import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildYouthSearchPost, youthSearchThemes } from '../src/social-content-generator.mjs';

test('若者向け投稿は12種類の検索テーマを提供する', () => {
  assert.equal(youthSearchThemes.length, 12);
  assert.equal(new Set(youthSearchThemes.map((theme) => theme.id)).size, 12);
});

// v4.2 項目14: SHOPLIST/MUSINSAは検索導線から外れ、最大モール数は13になった。
// 「主要5モール」表記も、HOSHILUがまとめて比較できるAmazon・楽天市場・
// 正式運用では楽天市場・Yahoo!ショッピングだけをAPI連携表示する。
test('投稿はまとめて比較3モール・個別に探す最大13モール対応、コメント誘導、自然なハッシュタグを含む', () => {
  for (let index = 0; index < youthSearchThemes.length; index += 1) {
    const post = buildYouthSearchPost(index, ['X', 'INSTAGRAM', 'TIKTOK'][index % 3]);
    const url = new URL(post.link);
    assert.equal(url.origin, 'https://hoshilu.app');
    assert.ok(url.searchParams.get('q').length >= 5);
    assert.ok(url.searchParams.get('utm_campaign'));
    assert.equal(post.status, 'REVIEW_REQUIRED');
    assert.match(post.caption, /Amazon/);
    assert.match(post.caption, /楽天市場/);
    assert.match(post.caption, /Qoo10/);
    assert.match(post.caption, /SHEIN/);
    assert.match(post.caption, /コメント/);
    assert.match(post.caption, /#ホシル/);
    assert.match(post.caption, /楽天市場・Yahoo!ショッピングをまとめて比較/);
    assert.match(post.caption, /最大13モール/);
    assert.match(post.caption, /#13モール横断/);
  }
});

test('Qoo10・SHEIN専用テーマは別キャンペーンで効果測定できる', () => {
  const posts = youthSearchThemes.map((_, index) => buildYouthSearchPost(index, 'INSTAGRAM'));
  const qoo10 = posts.filter((post) => post.marketplace_focus === 'QOO10_JP');
  const shein = posts.filter((post) => post.marketplace_focus === 'SHEIN_JP');
  assert.equal(qoo10.length, 2);
  assert.equal(shein.length, 2);
  qoo10.forEach((post) => {
    assert.equal(new URL(post.link).searchParams.get('utm_campaign'), 'youth_qoo10_discovery');
    assert.match(post.caption, /#Qoo10購入品/);
  });
  shein.forEach((post) => {
    assert.equal(new URL(post.link).searchParams.get('utm_campaign'), 'youth_shein_discovery');
    assert.match(post.caption, /#SHEIN購入品/);
  });
});

test('投稿ローテーションは横断・あいまい検索・人気商品と定期リールを含む', () => {
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
  assert.ok(posts.some((post) => /ほしっとく/.test(post.caption)));
  assert.ok(posts.some((post) => /あいまい検索/.test(post.caption)));
});

test('Qoo10・SHEIN強化キューは全件レビュー必須でリールを含む', async () => {
  const csv = await readFile(
    new URL('../../../marketing/social/HOSHILU_QOO10_SHEIN_GROWTH_QUEUE.csv', import.meta.url),
    'utf8'
  );
  const rows = csv.trim().split(/\r?\n/);
  assert.equal(rows.length, 9);
  assert.match(csv, /Qoo10/);
  assert.match(csv, /SHEIN/);
  assert.ok((csv.match(/,REEL,/g) || []).length >= 3);
  rows.slice(1).forEach((row) => assert.match(row, /,REVIEW_REQUIRED$/));
});
