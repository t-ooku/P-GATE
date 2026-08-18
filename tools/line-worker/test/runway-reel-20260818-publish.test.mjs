import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// AI女優リール第2弾の再公開(repost)一式が、互いに矛盾しないことを固定する。
//
// 初回公開(post v1)は一部フレームで合成画面がスマホからはみ出しており、
// Instagram上の投稿は削除された。公開するのは「ベゼル検出を修正し、
// 大隆さんが再確認したバイト列」だけであり、ワークフロー・SQL・リポジトリ内の
// 動画ファイルが同じSHA256とサイズを指していなければならない。

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, '..');
const root = path.resolve(worker, '..', '..');

const MEDIA = 'ops/runway/media/reel_20260818_recommend_voice_v5.mp4';
const SHA256 = 'df4088af79c3ce7a3dd72ccc53448f1db07cf3f9b8610b9496e0005e374b1c5c';
const SIZE = 2878075;
const JOB_ID = 'runway-hoshilu-recommend-voice-20260818-v1';
const POST_ID = 'hoshilu-runway-recommend-voice-20260818-v2';
const OLD_POST_ID = 'hoshilu-runway-recommend-voice-20260818-v1';
const STORAGE_KEY = `runway/${JOB_ID}/postprocessed-${SHA256}.mp4`;
const CAPTION = '名前が分からなくても、覚えている特徴から探せる。見つかった商品は、まとめて比較する2モールに加えて最大13モールで探せます。AIは理解、HOSHILUは探す。続きは @hoshilu.app のプロフィールから。※この動画はAI生成・AI加工映像です。 #ホシル #あいまい検索 #AI生成';

const read = (relative, base = worker) => fs.readFileSync(path.join(base, relative), 'utf8');
const stage = read('ops/runway/stage_reel_20260818_recommend_voice_repost.sql');
const release = read('ops/runway/release_reel_20260818_recommend_voice_repost.sql');
const workflow = read('.github/workflows/publish-runway-reel-20260818.yml', root);

test('公開する動画は再確認済みのバイト列そのもの', () => {
  const bytes = fs.readFileSync(path.join(worker, MEDIA));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), SHA256);
  assert.equal(bytes.length, SIZE);
});

test('ワークフローとSQLが同じ動画・同じ行を指している', () => {
  assert.match(workflow, new RegExp(`MEDIA_SHA256: ${SHA256}`));
  assert.match(workflow, new RegExp(`MEDIA_SIZE: '${SIZE}'`));
  assert.match(workflow, new RegExp(`MEDIA_FILE: ${MEDIA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(workflow, new RegExp(`JOB_ID: ${JOB_ID}`));
  assert.match(workflow, new RegExp(`POST_ID: ${POST_ID}`));
  assert.match(workflow, new RegExp(`OLD_POST_ID: ${OLD_POST_ID}`));
  for (const [name, sql] of [['stage', stage], ['release', release]]) {
    assert.ok(sql.includes(STORAGE_KEY), `${name}: storage_key mismatch`);
    assert.ok(sql.includes(JOB_ID), `${name}: job_id missing`);
    assert.ok(sql.includes(POST_ID), `${name}: post_id missing`);
  }
  assert.ok(stage.includes(`storage_size_bytes=${SIZE}`), 'stage: size mismatch');
  assert.ok(release.includes(`storage_size_bytes=${SIZE}`), 'release: size mismatch');
});

test('キャプションはstageとreleaseで完全に一致し、AI生成である旨を含む', () => {
  for (const [name, sql] of [['stage', stage], ['release', release]]) {
    assert.ok(sql.includes(CAPTION), `${name}: caption mismatch`);
  }
  assert.ok(CAPTION.includes('AI生成'));
  assert.ok(CAPTION.includes('hoshilu.app'));
  assert.doesNotMatch(CAPTION, /最安|円|%|在庫あり|レビュー\d|ランキング\d|No\.?1/u);
});

test('v1の公開記録は書き換えず、削除の事実はauditに残す', () => {
  // stageはv1のstatus/external_post_idをUPDATEしない(履歴を保つ)。
  const v1Updates = stage.split(';').filter((s) =>
    /UPDATE\s+social_post_queue/i.test(s) && s.includes(OLD_POST_ID));
  assert.equal(v1Updates.length, 0, 'stage must not rewrite the v1 queue row');
  assert.ok(stage.includes('INSTAGRAM_POST_DELETED_BY_OWNER'));
  assert.ok(stage.includes('17902541781477801'));
  // 再公開の前提として、v1が公開済みだったことをWHEREで固定する。
  assert.ok(stage.includes("external_post_id='17902541781477801'"));
});

test('公開キューをAPPROVEDにするのは release SQL だけ', () => {
  const approvesQueue = (sql) => /UPDATE\s+social_post_queue[\s\S]*?SET[\s\S]*?status='APPROVED'/i.test(sql);
  assert.equal(approvesQueue(release), true);
  assert.equal(approvesQueue(stage), false);
  assert.ok(stage.includes("'REVIEW_REQUIRED'"));
  assert.ok(release.includes("status='REVIEW_REQUIRED'"));
});

test('ワークフローは二段階の確認入力を要求する', () => {
  assert.match(workflow, /inputs\.confirm \}\}" != "PUBLISH"/);
  assert.match(workflow, /if: github\.event\.inputs\.release == 'RELEASE'/);
  const releaseStep = workflow.slice(workflow.indexOf('Release for Instagram publication'));
  assert.match(releaseStep, /release_reel_20260818_recommend_voice_repost\.sql/);
  const beforeRelease = workflow.slice(0, workflow.indexOf('Release for Instagram publication'));
  assert.ok(!beforeRelease.includes('release_reel_20260818_recommend_voice_repost.sql'));
});

test('字幕はブランド・URL・AI開示を含み、価格や在庫を断定しない', () => {
  const subtitles = read('ops/runway/reel_overlay_20260818_recommend_voice.ass');
  assert.ok(subtitles.includes('hoshilu.app'));
  assert.ok(subtitles.includes('AI生成・AI加工映像'));
  const dialogue = subtitles.split('\n').filter((line) => line.startsWith('Dialogue:')).join('\n');
  assert.doesNotMatch(dialogue, /最安|円|在庫|ランキング|No\.?1/u);
  assert.ok(dialogue.includes('2モールの価格を比較。'));
  assert.ok(dialogue.includes('最大13モールで探せる。'));
});

test('画面差し替えの追跡データはレンダラーが期待する形をしている', () => {
  const track = JSON.parse(read('ops/runway/reel_screen_track_20260818_recommend_voice.json'));
  assert.ok(Number.isInteger(track.lo) && Number.isInteger(track.hi) && track.hi > track.lo);
  assert.equal(track.corners.length, track.hi - track.lo + 1);
  for (const frame of track.corners) {
    assert.equal(frame.length, 4);
    for (const point of frame) {
      assert.equal(point.length, 2);
      assert.ok(Number.isFinite(point[0]) && Number.isFinite(point[1]));
    }
  }
});

test('レンダラーははみ出し対策(ベゼル保存と暖色除外)を持つ', () => {
  const renderer = read('ops/runway/render_reel_20260818_recommend_voice.py');
  // 2026-08-19の公開版で発生した「画面がスマホの外へはみ出す」不具合の
  // 再発防止: 細いベゼルを消す大きな開き処理と、ソファ(暖色明部)への
  // 塗り込みを許す実装へ戻さないことを固定する。
  assert.ok(renderer.includes('value < 90'), 'bezel threshold must stay at 90');
  assert.ok(renderer.includes('warm'), 'warm-bright exclusion must exist');
  assert.doesNotMatch(renderer, /MORPH_OPEN, np\.ones\(\(9, 9\), np\.uint8\)\)\s*\n\s*candidate/);
});
