import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildApprovalSql, buildAssCutA, buildAssCutB, buildJobId, buildJobSql, buildPostId, buildRejectSql,
  evaluateFaces, evaluateTranscript, nextPublishSlot, parseVolume, similarity
} from '../scripts/auto-runway-reel-lib.mjs';

const themes = JSON.parse(readFileSync(new URL('../ops/runway/auto/themes.json', import.meta.url), 'utf8'));

test('2026-09-06 大隆さん決定: 月・水・土の型が揃い、セリフに固有名詞・数字がなく、キャプションにAI開示がある', () => {
  assert.deepEqual(Object.keys(themes.slots), ['mon', 'wed', 'sat']);
  for (const key of Object.values(themes.slots)) {
    const theme = themes.themes[key];
    assert.ok(theme, `theme ${key}`);
    assert.doesNotMatch(theme.spoken_line, /HOSHILU|ホシル|ホスル|Amazon|楽天|\d|円|%/u, `${key} spoken_line`);
    assert.ok(theme.spoken_line.length <= 45, `${key} spoken_line length ${theme.spoken_line.length}`);
    assert.match(theme.caption, /AI生成/u);
    assert.doesNotMatch(theme.caption, /\d+%|\d+円|最安|必ず/u, `${key} caption must not claim numbers`);
    assert.ok(theme.subtitles.length >= 2 && theme.subtitles.every((s) => s.end <= themes.duration_seconds));
    assert.ok(theme.scenes.length >= 2, '再生成用に別シーンが必要');
  }
  assert.match(themes.character_image_url, /^https:\/\/hoshilu\.app\/social\/runway\//u);
  assert.match(themes.product_image_url, /^https:\/\/hoshilu\.app\/social\/runway\//u);
});

test('次の投稿枠は月・水・土 20:15 JST。直近すぎる枠は飛ばす', () => {
  const sunday = new Date('2026-09-06T01:00:00Z'); // JST 日曜 10:00
  const slot = nextPublishSlot(sunday, themes);
  assert.equal(slot.slot, 'mon');
  assert.equal(slot.theme_key, 'want_at_price');
  assert.equal(slot.publish_at.toISOString(), '2026-09-07T11:15:00.000Z');
  assert.equal(slot.date_key, '20260907');
  const mondayLate = new Date('2026-09-07T10:30:00Z'); // JST 月曜 19:30（90分未満）
  assert.equal(nextPublishSlot(mondayLate, themes).slot, 'wed');
  assert.equal(nextPublishSlot(sunday, themes, { slotOverride: 'sat' }).date_key, '20260912');
});

test('job_id / post_id / SQL は既存の ops/runway/reel_job_*.sql と同じ列構成で、再投入しても重複しない', () => {
  const jobId = buildJobId('want_at_price', '20260907');
  assert.equal(jobId, 'runway-auto-want-at-price-20260907');
  assert.equal(buildJobId('want_at_price', '20260907', 2), 'runway-auto-want-at-price-20260907-r2');
  assert.equal(buildPostId(jobId), 'hoshilu-runway-auto-want-at-price-20260907');
  const sql = buildJobSql({ themes, theme: themes.themes.want_at_price, jobId, dateKey: '20260907', now: new Date('2026-09-06T01:00:00Z'), publishAt: new Date('2026-09-07T11:15:00Z') });
  const statements = sql.split('\n');
  assert.equal(statements.length, 3);
  for (const statement of statements) assert.match(statement, /^INSERT OR IGNORE INTO runway_[a-z_]+ \(/u);
  assert.match(statements[0], /'APPROVED','product_ugc','2026-06'/u);
  assert.match(statements[0], /,8,'720:1280',1,/u);
  assert.match(statements[0], /,336,1,1,1,'PENDING',/u, '8秒 720:1280 = 336クレジット');
  assert.match(statements[0], /utm_content=runway_auto_want_at_price_20260907/u);
  assert.match(statements[0], /画面内の文字・UI・字幕・テロップは一切生成しない/u);
  // 2回目は別シーン
  const retry = buildJobSql({ themes, theme: themes.themes.want_at_price, jobId: `${jobId}-r2`, dateKey: '20260907', attempt: 2, now: new Date(), publishAt: new Date() });
  assert.match(retry, /キッチン/u);
  assert.doesNotMatch(statements[0], /キッチン/u);
});

test('字幕(.ass)は ブランド帯・AI表記・固定セリフ、カットBは実画面表記・CTA・URL', () => {
  const a = buildAssCutA(themes.themes.want_at_price, 8);
  assert.match(a, /Brand,,0,0,0,,HOSHILU {2}\| {2}hoshilu\.app/u);
  assert.match(a, /Disclosure,,0,0,0,,AI生成・AI加工映像/u);
  assert.match(a, /0:00:00\.00,0:00:02\.90,Subtitle,,0,0,0,,これ、もう少し安かったら.N買うのに。/u);
  assert.match(a, /PlayResX: 720\nPlayResY: 1280/u);
  const b = buildAssCutB(themes, 6);
  assert.match(b, /実際の画面（AI生成ではありません）/u);
  assert.match(b, /Cta,,0,0,0,,「この価格になったら教えて」を登録。.Nあとは待つだけ。.N欲しい商品に、希望価格を入れてみて。/u);
  assert.match(b, /Url,,0,0,0,,hoshilu\.app/u);
});

test('セリフの自動QA: 表記ゆれは通し、別のセリフ・サービス名の発話は落とす', () => {
  const theme = themes.themes.want_at_price;
  assert.ok(similarity('これもう少し安かったら買うのにそんな時は欲しい値段を決めてあとは待つだけ', theme.spoken_line) > 0.95);
  assert.equal(evaluateTranscript('これ、もう少し安かったら買うのに。そんなときは、欲しいねだんを決めて、あとはまつだけ。', theme, themes).ok, true);
  assert.equal(evaluateTranscript('9月はセールが続くから先に欲しい物の名前を決めておくと迷わないよ', theme, themes).ok, false);
  const branded = evaluateTranscript('これ、もう少し安かったら買うのに。ホシルで欲しい値段を決めて、あとは待つだけ。', theme, themes);
  assert.equal(branded.ok, false);
  assert.deepEqual(branded.forbidden, ['ホシル']);
  assert.equal(evaluateTranscript('', theme, themes).ok, false);
});

test('顔の自動QA: 各フレームで顔がちょうど1つ・鮮明・セーフサーチ問題なし', () => {
  const good = { faceAnnotations: [{ detectionConfidence: 0.96, blurredLikelihood: 'VERY_UNLIKELY' }], safeSearchAnnotation: { adult: 'VERY_UNLIKELY', racy: 'UNLIKELY', violence: 'VERY_UNLIKELY' } };
  const twoFaces = { faceAnnotations: [{ detectionConfidence: 0.9 }, { detectionConfidence: 0.8 }], safeSearchAnnotation: {} };
  const noFace = { faceAnnotations: [], safeSearchAnnotation: {} };
  assert.equal(evaluateFaces([good, good, good, good, good]).ok, true);
  assert.equal(evaluateFaces([good, good, good, good, noFace]).ok, true, '5枚中4枚で合格');
  assert.equal(evaluateFaces([good, good, good, twoFaces, noFace]).ok, false);
  assert.equal(evaluateFaces([{ ...good, safeSearchAnnotation: { racy: 'LIKELY' } }, good, good, good, good]).ok, false);
  assert.equal(evaluateFaces([]).ok, false);
});

test('承認SQLは後処理済みキーへ差し替えてから APPROVED_FOR_POST/PASSED → キュー APPROVED(20:15 JST) → X 相互投稿', () => {
  const sha = 'a'.repeat(64);
  const sql = buildApprovalSql({ jobId: 'runway-auto-want-at-price-20260907', postId: 'hoshilu-runway-auto-want-at-price-20260907', storageKey: `runway/runway-auto-want-at-price-20260907/postprocessed-${sha}.mp4`, sizeBytes: 1234567, sha256: sha, publishAt: new Date('2026-09-07T11:15:00Z'), evidence: { faces: { passed: 5, total: 5 } }, now: new Date('2026-09-06T02:00:00Z') });
  const statements = sql.split('\n');
  assert.equal(statements.length, 4);
  assert.match(statements[0], /^UPDATE runway_generation_jobs SET storage_key='runway\/runway-auto-want-at-price-20260907\/postprocessed-a{64}\.mp4',storage_etag=NULL,storage_size_bytes=1234567,storage_content_type='video\/mp4',status='APPROVED_FOR_POST',qa_status='PASSED'/u);
  assert.match(statements[1], /QA_APPROVED_FOR_POST/u);
  assert.match(statements[1], /"reviewed_by_owner_in_chat":false,"automated":true/u, '人がチャットで見たと偽らない');
  assert.match(statements[2], /^UPDATE social_post_queue SET status='APPROVED',scheduled_at='2026-09-07T11:15:00\.000Z'/u);
  assert.match(statements[2], /status='REVIEW_REQUIRED' AND external_post_id='' AND platform_job_id='' AND published_at=''/u);
  assert.match(statements[3], /^INSERT INTO social_post_queue .*'hoshilu-runway-auto-want-at-price-20260907-x','X'/u);
  const reject = buildRejectSql({ jobId: 'j1', postId: 'p1', reason: "face_check,speech_similarity_0.2 it's", now: new Date() });
  assert.match(reject, /status='FAILED_FINAL',qa_status='FAILED',last_error_code='AUTO_QA_FAILED'/u);
  assert.match(reject, /it''s/u, 'SQL escape');
  assert.match(reject, /UPDATE social_post_queue SET status='CANCELLED'/u);
});

test('volumedetect の平均音量を読む', () => {
  assert.equal(parseVolume('[Parsed_volumedetect_0 @ 0x1] mean_volume: -21.3 dB\nmax_volume: -3.0 dB'), -21.3);
  assert.equal(parseVolume(''), Number.NEGATIVE_INFINITY);
});

test('同じ枠のAI女優日次リール（既存素材）は Runway 新規生成に置き換える: APPROVED の行だけ CANCELLED にする', async () => {
  const { buildReplaceDailyReelSql } = await import('../scripts/auto-runway-reel-lib.mjs');
  const sql = buildReplaceDailyReelSql({ postIds: ['hoshilu-ai-actress-daily-v1-instagram-2026-09-07'], replacedBy: 'hoshilu-runway-auto-want-at-price-20260907', now: new Date('2026-09-06T03:00:00Z') });
  assert.match(sql, /^UPDATE social_post_queue SET status='CANCELLED',last_error='replaced_by:hoshilu-runway-auto-want-at-price-20260907'/u);
  assert.match(sql, /campaign_id='hoshilu-ai-actress-daily-v1' AND status='APPROVED' AND external_post_id='' AND platform_job_id=''/u);
  const runner = readFileSync(new URL('../scripts/auto-runway-reel.mjs', import.meta.url), 'utf8');
  assert.match(runner, /replaceable = competing\.filter\(\(row\) => row\.campaign_id === 'hoshilu-ai-actress-daily-v1' && row\.status === 'APPROVED'\)/u);
  assert.match(runner, /if \(!qualityFailure\) \{ log\('non-quality failure; job left as-is for a re-run'/u, '生成物以外の理由では FAILED_FINAL にしない');
});
