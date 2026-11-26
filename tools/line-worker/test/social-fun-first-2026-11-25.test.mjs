// 2026-11-25 大隆さん決定「顧客は Instagram を、何か購入したい・どこかと契約したいと思って開いていない。
// サービスに直結した投稿は週 1 回でよく、それ以外は間接的なことや楽しいこと。リールも楽しく明るく」
// （docs/handoff/claude-inbox/2026-11-25-cowork-instagram-fun-first.md）。11/30 以降の枠だけ変える。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCarouselPosts, buildReelFallbackPosts, loadCarouselSets, FUN_FIRST_PLAN } from '../src/social-weekly-plan-v3.mjs';
import { captionSetFor, screenCaption, screenSetsForRow } from '../src/social-screens.mjs';
import { buildAssCutB, cutBSeconds, nextPublishSlot, slotsFor, voiceoverPlan } from '../scripts/auto-runway-reel-lib.mjs';
import { expectedFormatForDate } from '../scripts/check-social-ai-actress-sla.mjs';

const themes = JSON.parse(readFileSync(new URL('../ops/runway/auto/themes.json', import.meta.url), 'utf8'));
const doc = JSON.parse(readFileSync(new URL('../ops/social/carousels-v3.json', import.meta.url), 'utf8'));

test('楽しい・役に立つカルーセルは 3 種（どっち派・あるある・買い物の小ワザ）、ホシルの案内は本文の最後の 1 行だけ', () => {
  const fun = loadCarouselSets().fun;
  assert.ok(fun.length >= 3);
  assert.deepEqual([...new Set(fun.map((set) => set.kind))].sort(), ['aruaru', 'tips', 'which']);
  for (const set of fun) {
    assert.equal(set.audience, 'fun');
    assert.equal(set.link_path, '/');
    assert.ok(set.slides.length >= 2 && set.slides.length <= 10);
    const text = JSON.stringify(set);
    assert.doesNotMatch(text, /最安|買い時|底値|必ず|確実に|\d+円|\d+%|人気No|ランキング1位/u, set.id);
    assert.doesNotMatch(JSON.stringify(set.slides), /ホシル|HOSHILU|登録|希望価格|価格通知/u, `${set.id} slides are not service ads`);
    const lines = set.caption.split('\n').filter(Boolean);
    const mentions = lines.filter((line) => /ホシル|HOSHILU/u.test(line) && !line.startsWith('#'));
    assert.equal(mentions.length, 1, `${set.id} mentions HOSHILU once`);
    assert.equal(lines.at(-2), mentions[0], `${set.id} mention is the last line before tags`);
  }
  // 通常の順送り（order）には入れない（11/29 以前の枠は変わらない）
  assert.ok(doc.order.every((id) => !id.startsWith('fun-')));
});

test('11/30 以降: 月=楽しい、水=カルーセルなし、土=サービス直結 1 本。11/29 以前は今のまま', () => {
  const posts = buildCarouselPosts(new Date('2026-11-26T00:30:00Z'), 28).filter((post) => post.platform === 'INSTAGRAM');
  const byDate = new Map(posts.map((post) => [post.jst_publish_date, post]));
  assert.equal(byDate.get('2026-11-28').content_id, 'carousel-user-price-watch', '11/28（土）は既存のまま');
  assert.match(byDate.get('2026-11-30').content_id, /^carousel-fun-/u);
  assert.equal(byDate.has('2026-12-02'), false, '水曜はカルーセルなし');
  assert.match(byDate.get('2026-12-05').content_id, /^carousel-user-/u);
  assert.match(byDate.get('2026-12-07').content_id, /^carousel-fun-/u);
  assert.notEqual(byDate.get('2026-11-30').content_id, byDate.get('2026-12-07').content_id);
  const service = posts.filter((post) => post.jst_publish_date >= FUN_FIRST_PLAN.start_jst && !/carousel-fun-/u.test(post.content_id));
  assert.ok(service.every((post) => new Date(`${post.jst_publish_date}T00:00:00Z`).getUTCDay() === 6), 'サービス直結は土曜だけ');
});

test('リール日の代替カルーセルは 11/30 以降、楽しいセットから', () => {
  const before = buildReelFallbackPosts(new Date('2026-11-27T10:40:00Z'))[0];
  assert.match(before.content_id, /^carousel-user-/u);
  for (const day of ['2026-12-01', '2026-12-04', '2026-12-08']) {
    const post = buildReelFallbackPosts(new Date(`${day}T10:40:00Z`))[0];
    assert.match(post.content_id, /^carousel-fun-/u, day);
  }
  const tue = buildReelFallbackPosts(new Date('2026-12-01T10:40:00Z'))[0].content_id;
  const fri = buildReelFallbackPosts(new Date('2026-12-04T10:40:00Z'))[0].content_id;
  assert.notEqual(tue, fri);
});

test('土曜のサービス直結は値下がりの実画像に差し替えない。水曜 21:00 の値下がりは軽い本文', () => {
  assert.deepEqual(screenSetsForRow({ content_id: 'carousel-user-price-watch' }, '2026-11-28'), ['drops', 'buzz', 'notes']);
  assert.deepEqual(screenSetsForRow({ content_id: 'carousel-user-wish-left-behind' }, '2026-12-05'), []);
  assert.equal(captionSetFor('drops', '2026-12-02'), 'drops_light');
  assert.equal(captionSetFor('drops', '2026-11-25'), 'drops');
  assert.equal(captionSetFor('drops', '2026-12-06'), 'drops');
  const caption = screenCaption('drops_light', new Date('2026-12-02T05:00:00Z'), { factLines: ['記録の事実'] });
  assert.match(caption, /セールの割引率ではありません/u);
  assert.doesNotMatch(caption, /買い時|底値|最安/u);
  const mentions = caption.split('\n').filter((line) => /ホシル/u.test(line) && !line.startsWith('#'));
  assert.equal(mentions.length, 1);
});

test('SNS 監視: 11/30 以降の水曜はカルーセルを要求しない', () => {
  assert.equal(expectedFormatForDate('2026-11-25'), 'CAROUSEL');
  assert.equal(expectedFormatForDate('2026-12-02'), '');
  assert.equal(expectedFormatForDate('2026-11-30'), 'CAROUSEL');
  assert.equal(expectedFormatForDate('2026-12-05'), 'CAROUSEL');
  assert.equal(expectedFormatForDate('2026-12-01'), 'REEL');
});

test('リール: 11/30 以降は火・金とも楽しい型（4 本以上）。ホシルは最後の短い画面と URL だけ', () => {
  const later = slotsFor(themes, new Date('2026-12-01T11:15:00Z'));
  const keys = [...later.tue, ...later.fri];
  assert.ok(new Set(keys).size >= 4);
  for (const key of keys) {
    const theme = themes.themes[key];
    assert.equal(theme.audience, 'fun');
    assert.equal(theme.layout, 'actress_first');
    assert.doesNotMatch(theme.spoken_line, /HOSHILU|ホシル|ホスル|Amazon|楽天|\d|円|%|韓国/u, key);
    assert.ok(theme.spoken_line.length <= 45);
    assert.match(theme.caption, /AI生成/u);
    assert.doesNotMatch(theme.caption, /\d+%|\d+円|最安|必ず|買い時/u);
    assert.ok(theme.subtitles.every((sub) => sub.end <= themes.duration_seconds));
    assert.ok(theme.scenes.length >= 2);
    assert.equal(voiceoverPlan(theme, 8), null, '画面の録画を主にしない');
    assert.equal(cutBSeconds(theme), 3);
    const ass = buildAssCutB(themes, 3, theme);
    assert.match(ass, /欲しい物は、ホシルで。/u);
    assert.doesNotMatch(ass, /希望価格/u);
  }
  // 11/27（金）は既存の型のまま、12/1（火）から楽しい型
  assert.equal(themes.themes[nextPublishSlot(new Date('2026-11-26T01:00:00Z'), themes).theme_key].audience, 'seller');
  assert.equal(themes.themes[nextPublishSlot(new Date('2026-11-28T01:00:00Z'), themes).theme_key].audience, 'fun');
  // 最低 10 秒（自動 QA）: 8 秒 + 最後の画面 3 秒
  assert.ok(8 + cutBSeconds(themes.themes[keys[0]]) >= 10);
  // 既存の型は今まで通り
  assert.equal(cutBSeconds(themes.themes.want_at_price), 6);
});
