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
test('投稿はまとめて比較2モール＋個別11モール＝合計最大13モールと正確に案内する', () => {
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
    assert.match(post.caption, /#HOSHILU/);
    assert.match(post.caption, /楽天市場・Yahoo!ショッピングの2モールをまとめて比較/);
    assert.match(post.caption, /11モールを個別に検索。合計最大13モール/);
    assert.doesNotMatch(post.caption, /個別(?:に探せる|にも探せます).*最大13モール/u);
    assert.match(post.caption, /#(?:Qoo10|SHEIN)/);
    assert.doesNotMatch(post.caption, /#ホシル|#あいまい検索|#13モール横断|#ほしっとく/u);
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

test('投稿ローテーションは横断・写真検索・見つかるまで探すと定期リールを含む', () => {
  const posts = youthSearchThemes.map((_, index) => buildYouthSearchPost(index, 'INSTAGRAM'));
  assert.deepEqual(
    new Set(posts.map((post) => post.campaign_pillar)),
    new Set(['CROSS_MARKET', 'AMBIGUOUS_TREND', 'CONTINUOUS_SEARCH'])
  );
  const reels = posts.filter((post) => post.content_format === 'REEL');
  assert.equal(reels.length, 4);
  reels.forEach((post) => {
    assert.equal(post.reel_script.aspect_ratio, '9:16');
    assert.equal(post.reel_script.scenes.length, 4);
    assert.match(post.reel_script.asset_policy, /権利確認済み/);
  });
  assert.ok(posts.some((post) => /見つかるまで探す/.test(post.caption)));
  assert.ok(posts.some((post) => /写真・保存画像・公開投稿URL/.test(post.caption)));
  assert.ok(posts.some((post) => /HOSHILU対応形式に合う投稿単体URL/.test(post.caption)));
  assert.ok(posts.every((post) => !/SNSで流行って|韓国で人気/.test(post.caption)));
  assert.ok(posts.every((post) => !/100点/.test(post.caption)));
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
