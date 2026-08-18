import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// AI女優リール第2弾の公開一式が、互いに矛盾しないことを固定する。
//
// 公開するのは「大隆さんが実際に再生して確認したバイト列」だけであり、
// ワークフロー・3本のSQL・リポジトリ内の動画ファイルが同じSHA256とサイズを
// 指していなければならない。どれか1つを直して他を直し忘れると、確認していない
// 映像が公開されうるので、ここで揃っていることを機械的に確認する。

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, '..');
const root = path.resolve(worker, '..', '..');

const MEDIA = 'ops/runway/media/reel_20260818_recommend_voice_v1.mp4';
const SHA256 = '9c012c8e7675a740f5f608a9dac57684dc8ddee7725eda3baa1e26847ef66dd2';
const SIZE = 2946863;
const JOB_ID = 'runway-hoshilu-recommend-voice-20260818-v1';
const POST_ID = 'hoshilu-runway-recommend-voice-20260818-v1';
const STORAGE_KEY = `runway/${JOB_ID}/postprocessed-${SHA256}.mp4`;
const CAPTION = '名前が分からなくても、覚えている特徴から探せる。見つかった商品は、まとめて比較する2モールに加えて最大13モールで探せます。AIは理解、HOSHILUは探す。続きは @hoshilu.app のプロフィールから。※この動画はAI生成・AI加工映像です。 #ホシル #あいまい検索 #AI生成';

const read = (relative, base = worker) => fs.readFileSync(path.join(base, relative), 'utf8');
const stage = read('ops/runway/stage_reel_20260818_recommend_voice.sql');
const approve = read('ops/runway/approve_reel_20260818_recommend_voice.sql');
const release = read('ops/runway/release_reel_20260818_recommend_voice.sql');
const workflow = read('.github/workflows/publish-runway-reel-20260818.yml', root);

test('公開する動画はレビュー済みのバイト列そのもの', () => {
  const bytes = fs.readFileSync(path.join(worker, MEDIA));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), SHA256);
  assert.equal(bytes.length, SIZE);
});

test('ワークフローと3本のSQLが同じ動画を指している', () => {
  assert.match(workflow, new RegExp(`MEDIA_SHA256: ${SHA256}`));
  assert.match(workflow, new RegExp(`MEDIA_SIZE: '${SIZE}'`));
  assert.match(workflow, new RegExp(`MEDIA_FILE: ${MEDIA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(workflow, new RegExp(`JOB_ID: ${JOB_ID}`));
  assert.match(workflow, new RegExp(`POST_ID: ${POST_ID}`));
  for (const [name, sql] of [['stage', stage], ['approve', approve], ['release', release]]) {
    assert.ok(sql.includes(STORAGE_KEY), `${name}: storage_key mismatch`);
    assert.ok(sql.includes(`storage_size_bytes=${SIZE}`), `${name}: size mismatch`);
    assert.ok(sql.includes(JOB_ID), `${name}: job_id missing`);
    assert.ok(sql.includes(POST_ID), `${name}: post_id missing`);
  }
});

test('キャプションは3本のSQLで完全に一致し、AI生成である旨を含む', () => {
  for (const [name, sql] of [['stage', stage], ['approve', approve], ['release', release]]) {
    assert.ok(sql.includes(CAPTION), `${name}: caption mismatch`);
  }
  assert.ok(CAPTION.includes('AI生成'));
  assert.ok(CAPTION.includes('hoshilu.app'));
  // 価格・在庫・ランキング・レビュー件数などの断定を本文へ書かない。
  assert.doesNotMatch(CAPTION, /最安|円|%|在庫あり|レビュー\d|ランキング\d|No\.?1/u);
});

test('公開キューをAPPROVEDにするのは release SQL だけ', () => {
  const approvesQueue = (sql) => /UPDATE\s+social_post_queue[\s\S]*?SET[\s\S]*?status='APPROVED'/i.test(sql);
  assert.equal(approvesQueue(release), true);
  assert.equal(approvesQueue(stage), false);
  assert.equal(approvesQueue(approve), false);
  // stage/approve の段階ではキューは REVIEW_REQUIRED のまま残る条件を持つ。
  assert.ok(stage.includes("status='REVIEW_REQUIRED'"));
  assert.ok(approve.includes("status='REVIEW_REQUIRED'"));
});

test('ワークフローは二段階の確認入力を要求する', () => {
  assert.match(workflow, /inputs\.confirm \}\}" != "PUBLISH"/);
  assert.match(workflow, /if: github\.event\.inputs\.release == 'RELEASE'/);
  // 公開段だけが release 入力で守られていること。
  const releaseStep = workflow.slice(workflow.indexOf('Release for Instagram publication'));
  assert.match(releaseStep, /release_reel_20260818_recommend_voice\.sql/);
  const beforeRelease = workflow.slice(0, workflow.indexOf('Release for Instagram publication'));
  assert.ok(!beforeRelease.includes('release_reel_20260818_recommend_voice.sql'));
});

test('字幕はブランド・URL・AI開示を含み、価格や在庫を断定しない', () => {
  const subtitles = read('ops/runway/reel_overlay_20260818_recommend_voice.ass');
  assert.ok(subtitles.includes('hoshilu.app'));
  assert.ok(subtitles.includes('AI生成・AI加工映像'));
  const dialogue = subtitles.split('\n').filter((line) => line.startsWith('Dialogue:')).join('\n');
  assert.doesNotMatch(dialogue, /最安|円|在庫|ランキング|No\.?1/u);
  // サイト本文と同じ「まとめて比較は2モール、検索は最大13モール」の区別を保つ。
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
