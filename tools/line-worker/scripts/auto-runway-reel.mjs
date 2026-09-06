#!/usr/bin/env node
// 2026-09-06 大隆さん決定（指示書 2026-09-06 全面再設計版 §A）: 月・水・土の Reel を
// Runway 新規生成 → 後処理 → 自動QA → 投稿キューまで無人で通す実行本体。
// GitHub Actions（.github/workflows/auto-runway-reel.yml）から呼ばれる。
//
// 流れ:
//  1. ops/runway/auto/themes.json から当日の枠（月/水/土 20:15 JST）と型を選ぶ
//  2. 予算・同時実行・重複を D1 で確認し、runway_generation_jobs に APPROVED で投入
//  3. Worker の 15分 cron が Runway に投げる → GENERATED_REVIEW_REQUIRED になるまで待つ
//  4. R2 から生成動画を取得。Playwright で hoshilu.app の実画面を撮影
//  5. ffmpeg で カットA（生成8秒＋字幕＋ブランド＋AI表記）＋カットB（実画面6秒＋CTA＋URL）
//  6. 自動QA: 仕様・全フレームデコード・音量・顔（Cloud Vision）・セリフ（Whisper）・
//     焼き込み確認・重複・AI開示
//  7. 合格: R2 に postprocessed-<sha256>.mp4 を置き、D1 を APPROVED_FOR_POST / PASSED、
//     social_post_queue を APPROVED（20:15 JST）にする。不合格: 別シーンで1回だけ再生成、
//     それでも駄目なら FAILED_FINAL にして GitHub Issue で報告（黙って差し替えない）
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  REQUIRED_QA_CHECKS, buildApprovalSql, buildAssCutA, buildAssCutB, buildJobId, buildJobSql,
  buildPostId, buildRejectSql, d1Rows, evaluateFaces, evaluateTranscript, nextPublishSlot, parseVolume
} from './auto-runway-reel-lib.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const WORK = path.resolve(process.env.AUTO_REEL_WORKDIR || path.join(ROOT, 'auto-reel-work'));
const BUCKET = 'hoshilu-social-media';
const WRANGLER = ['--yes', 'wrangler@4.121.0'];
const CUT_B_SECONDS = 6;
const MAX_ATTEMPTS = 2;
const POLL_MINUTES = Number(process.env.AUTO_REEL_POLL_MINUTES || 55);
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), 'true']; }));
const themes = JSON.parse(readFileSync(path.join(ROOT, 'ops/runway/auto/themes.json'), 'utf8'));
mkdirSync(WORK, { recursive: true });
const report = { started_at: new Date().toISOString(), steps: [] };
const log = (message, extra = {}) => { const line = { at: new Date().toISOString(), message, ...extra }; report.steps.push(line); console.log(`[auto-reel] ${message}${Object.keys(extra).length ? ' ' + JSON.stringify(extra) : ''}`); };
const sha256File = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}
function d1(sql) {
  const out = run('npx', [...WRANGLER, 'd1', 'execute', 'PRODUCT_DB', '--remote', '--json', '--command', sql]);
  return d1Rows(out);
}
function d1File(file) {
  return run('npx', [...WRANGLER, 'd1', 'execute', 'PRODUCT_DB', '--remote', '--json', '--file', file, '--yes']);
}
function ffprobeJson(file) {
  return JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,sample_rate,channels', '-of', 'json', file]));
}

// ---------- 1. 枠と型 ----------
const now = new Date();
const slot = nextPublishSlot(now, themes, { slotOverride: args.slot || '', leadMinutes: Number(args.lead || 90) });
if (args.publish_at) slot.publish_at = new Date(args.publish_at);
const themeKey = args.theme || slot.theme_key;
const theme = themes.themes[themeKey];
if (!theme) throw new Error(`AUTO_REEL_THEME_UNKNOWN:${themeKey}`);
log('slot selected', { slot: slot.slot, theme: themeKey, publish_at: slot.publish_at.toISOString(), date_key: slot.date_key });
report.slot = { ...slot, publish_at: slot.publish_at.toISOString(), theme: themeKey };

// ---------- 2〜3. 投入と待機 ----------
async function ensureGenerated(attempt) {
  const jobId = buildJobId(themeKey, slot.date_key, attempt);
  const postId = buildPostId(jobId);
  const existing = d1(`SELECT job_id,status,qa_status,storage_key,storage_size_bytes,last_error_code,last_error_detail FROM runway_generation_jobs WHERE job_id='${jobId}';`);
  if (!existing.length) {
    const blockers = d1(`SELECT job_id,status FROM runway_generation_jobs WHERE status IN ('BUDGET_RESERVED','SUBMITTING','PROCESSING','AMBIGUOUS_SUBMISSION','GENERATED_REVIEW_REQUIRED');`);
    if (blockers.length) throw new Error(`AUTO_REEL_PIPELINE_BUSY:${blockers.map((b) => `${b.job_id}=${b.status}`).join(',')}`);
    const month = now.toISOString().slice(0, 7);
    const used = d1(`SELECT COALESCE(SUM(credits),0) AS credits FROM runway_cost_reservations WHERE scope='MONTH' AND period_key='${month}' AND status IN ('SETTLED','HELD');`)[0]?.credits || 0;
    const cap = Number(d1(`SELECT monthly_cap_credits FROM runway_budget_policy WHERE policy_id=1;`)[0]?.monthly_cap_credits || 0);
    if (Number(used) + 336 > cap) throw new Error(`AUTO_REEL_BUDGET:${used}/${cap}`);
    const sqlFile = path.join(WORK, `${jobId}.sql`);
    writeFileSync(sqlFile, buildJobSql({ themes, theme, jobId, dateKey: slot.date_key, attempt, now, publishAt: slot.publish_at }));
    d1File(sqlFile);
    log('job submitted', { job_id: jobId, attempt, month_used_before: Number(used), cap });
  } else {
    log('job already exists', { job_id: jobId, status: existing[0].status });
  }
  const deadline = Date.now() + POLL_MINUTES * 60 * 1000;
  while (Date.now() < deadline) {
    const row = d1(`SELECT status,qa_status,storage_key,storage_size_bytes,last_error_code,last_error_detail FROM runway_generation_jobs WHERE job_id='${jobId}';`)[0];
    if (!row) throw new Error('AUTO_REEL_JOB_MISSING');
    if (['GENERATED_REVIEW_REQUIRED', 'APPROVED_FOR_POST', 'PUBLISHED'].includes(row.status)) {
      log('generation ready', { job_id: jobId, status: row.status, storage_key: row.storage_key });
      return { jobId, postId, row };
    }
    if (['FAILED_FINAL', 'BUDGET_BLOCKED', 'AMBIGUOUS_SUBMISSION', 'CANCELLED'].includes(row.status)) {
      return { jobId, postId, row, failed: `${row.status}:${row.last_error_code}:${String(row.last_error_detail || '').slice(0, 300)}` };
    }
    await sleep(60 * 1000);
  }
  throw new Error(`AUTO_REEL_TIMEOUT:${jobId}`);
}

// ---------- 4. 素材 ----------
function fetchRaw(jobId, row, dir) {
  const raw = path.join(dir, 'raw.mp4');
  const key = String(row.storage_key || '');
  if (!key.startsWith(`runway/${jobId}/`)) throw new Error(`AUTO_REEL_STORAGE_KEY:${key}`);
  run('npx', [...WRANGLER, 'r2', 'object', 'get', `${BUCKET}/${key}`, '--file', raw, '--remote']);
  const size = statSync(raw).size;
  if (Number(row.storage_size_bytes) && size !== Number(row.storage_size_bytes)) throw new Error(`AUTO_REEL_RAW_SIZE:${size}!=${row.storage_size_bytes}`);
  log('raw media fetched', { key, size });
  return raw;
}

async function captureUi(dir) {
  const target = path.join(dir, 'ui.png');
  const fallback = path.join(ROOT, 'public/social/runway/hoshilu-product-screen-v1.jpg');
  const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
  try {
    const { chromium } = await import(modulePath);
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, locale: 'ja-JP', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 HOSHILU-auto-reel' });
      const page = await context.newPage();
      await page.goto(process.env.AUTO_REEL_UI_URL || 'https://hoshilu.app/', { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1500);
      await page.evaluate(() => { document.querySelectorAll('.cookie-banner,.install-banner,#installButton').forEach((el) => { el.style.display = 'none'; }); });
      await page.screenshot({ path: target });
      log('ui captured (live hoshilu.app)');
      return { file: target, live: true };
    } finally { await browser.close(); }
  } catch (error) {
    log('ui capture failed; using the approved real screenshot asset', { error: String(error.message || error).slice(0, 200) });
    return { file: fallback, live: false };
  }
}

// ---------- 5. 合成 ----------
function compose(raw, ui, dir, durationA) {
  const assA = path.join(dir, 'cut-a.ass');
  const assB = path.join(dir, 'cut-b.ass');
  writeFileSync(assA, buildAssCutA(theme, durationA));
  writeFileSync(assB, buildAssCutB(themes, CUT_B_SECONDS));
  const out = path.join(dir, 'reel.mp4');
  const bs = String.fromCharCode(92);
  const esc = (p) => p.split(':').join(`${bs}:`).split("'").join(`${bs}'`);
  const framesB = CUT_B_SECONDS * 24;
  const filter = [
    `[0:v]trim=duration=${durationA},setpts=PTS-STARTPTS,scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=24,format=yuv420p,ass='${esc(assA)}'[va]`,
    `[1:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,zoompan=z='min(zoom+0.0006,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${framesB}:s=720x1280:fps=24,trim=duration=${CUT_B_SECONDS},setpts=PTS-STARTPTS,format=yuv420p,ass='${esc(assB)}'[vb]`,
    `[0:a]atrim=duration=${durationA},asetpts=PTS-STARTPTS,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=out:st=${Math.max(0, durationA - 0.4)}:d=0.4[aa]`,
    `[2:a]atrim=duration=${CUT_B_SECONDS},asetpts=PTS-STARTPTS[ab]`,
    '[va][aa][vb][ab]concat=n=2:v=1:a=1[v][a]'
  ].join(';');
  run('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-i', ui, '-f', 'lavfi', '-t', String(CUT_B_SECONDS), '-i', 'anullsrc=r=44100:cl=stereo',
    '-filter_complex', filter, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high', '-level:v', '4.0', '-pix_fmt', 'yuv420p', '-r', '24',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', '-movflags', '+faststart', out]);
  log('composed', { out, size: statSync(out).size });
  return out;
}

// ---------- 6. 自動QA ----------
async function visionFaces(frames) {
  const key = process.env.GOOGLE_CLOUD_VISION_API_KEY || '';
  if (!key) return { skipped: 'GOOGLE_CLOUD_VISION_API_KEY missing' };
  const requests = frames.map((file) => ({ image: { content: readFileSync(file).toString('base64') }, features: [{ type: 'FACE_DETECTION', maxResults: 5 }, { type: 'SAFE_SEARCH_DETECTION' }] }));
  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requests }) });
  if (!response.ok) return { error: `vision http ${response.status}` };
  const data = await response.json();
  return { responses: data.responses || [] };
}

function transcribe(raw, dir, durationA) {
  const wav = path.join(dir, 'speech.wav');
  run('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-t', String(durationA), '-vn', '-ac', '1', '-ar', '16000', wav]);
  const py = `
import json,sys
from faster_whisper import WhisperModel
model = WhisperModel("small", device="cpu", compute_type="int8")
segments, info = model.transcribe(sys.argv[1], language="ja", beam_size=5, vad_filter=False)
text = "".join(s.text for s in segments)
print(json.dumps({"text": text, "language": info.language, "language_probability": info.language_probability}, ensure_ascii=False))
`;
  const result = spawnSync('python3', ['-c', py, wav], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) return { error: String(result.stderr || '').slice(-500) };
  const lastLine = String(result.stdout || '').trim().split('\n').pop();
  return JSON.parse(lastLine);
}

function frameDiff(a, b, dir, t, region) {
  const fa = path.join(dir, `diff-a-${t}.png`); const fb = path.join(dir, `diff-b-${t}.png`);
  run('ffmpeg', ['-y', '-v', 'error', '-ss', String(t), '-i', a, '-frames:v', '1', '-vf', `crop=${region}`, fa]);
  run('ffmpeg', ['-y', '-v', 'error', '-ss', String(t), '-i', b, '-frames:v', '1', '-vf', `crop=${region}`, fb]);
  const py = `
from PIL import Image, ImageChops, ImageStat
import sys
a=Image.open(sys.argv[1]).convert('L'); b=Image.open(sys.argv[2]).convert('L')
print(ImageStat.Stat(ImageChops.difference(a,b)).mean[0])
`;
  const result = spawnSync('python3', ['-c', py, fa, fb], { encoding: 'utf8' });
  return result.status === 0 ? Number(String(result.stdout).trim()) : -1;
}

async function autoQa(raw, out, dir, durationA, jobId, postId, uiLive) {
  const problems = [];
  const evidence = {};
  // 仕様
  const probe = ffprobeJson(out);
  const video = probe.streams.find((s) => s.codec_type === 'video');
  const audio = probe.streams.find((s) => s.codec_type === 'audio');
  const duration = Number(probe.format.duration);
  const size = Number(probe.format.size);
  if (!video || video.codec_name !== 'h264' || video.profile !== 'High' || video.width !== 720 || video.height !== 1280 || video.pix_fmt !== 'yuv420p' || video.r_frame_rate !== '24/1') problems.push('video_spec');
  if (!audio || audio.codec_name !== 'aac' || Number(audio.sample_rate) !== 44100 || Number(audio.channels) !== 2) problems.push('audio_spec');
  if (!(duration >= 10 && duration <= 60)) problems.push(`duration_${duration}`);
  if (!(size > 100000 && size < 50 * 1024 * 1024)) problems.push(`size_${size}`);
  evidence.spec = { duration, size, video: video && `${video.codec_name}/${video.profile}/${video.width}x${video.height}/${video.r_frame_rate}`, audio: audio && `${audio.codec_name}/${audio.sample_rate}/${audio.channels}` };
  // 全フレームデコード
  const decode = spawnSync('ffmpeg', ['-v', 'error', '-i', out, '-f', 'null', '-'], { encoding: 'utf8' });
  if (decode.status !== 0 || String(decode.stderr || '').trim()) problems.push('decode');
  // 音量（カットA）
  const vol = spawnSync('ffmpeg', ['-i', raw, '-t', String(durationA), '-af', 'volumedetect', '-vn', '-f', 'null', '-'], { encoding: 'utf8' });
  const meanVolume = parseVolume(vol.stderr);
  evidence.audio_mean_volume_db = meanVolume;
  if (!(meanVolume > -40)) problems.push('audio_silent');
  // 焼き込み確認（ブランド帯・字幕帯が生成映像と変わっていること）
  const topDiff = frameDiff(raw, out, dir, 1.0, '720:120:0:20');
  const bottomDiff = frameDiff(raw, out, dir, 1.0, '720:200:0:1020');
  evidence.overlay_diff = { top: topDiff, bottom: bottomDiff };
  if (!(topDiff > 6 && bottomDiff > 6)) problems.push('overlay_not_burned');
  // カットBが実画面であること（Playwright 撮影 or 承認済み実スクリーンショット）
  evidence.ui_cut = uiLive ? 'live_screenshot_hoshilu_app' : 'approved_real_screenshot_asset';
  // 顔（Cloud Vision）
  const frameFiles = [];
  for (const t of [0.8, 2.4, 4.0, 5.6, 7.2]) {
    const f = path.join(dir, `face-${t}.jpg`);
    run('ffmpeg', ['-y', '-v', 'error', '-ss', String(Math.min(t, durationA - 0.2)), '-i', raw, '-frames:v', '1', '-q:v', '3', f]);
    frameFiles.push(f);
  }
  const vision = await visionFaces(frameFiles);
  if (vision.responses) {
    const faces = evaluateFaces(vision.responses);
    evidence.faces = { passed: faces.passed, total: faces.total, details: faces.details };
    if (!faces.ok) problems.push('face_check');
  } else {
    evidence.faces = vision;
    problems.push('face_check_unavailable');
  }
  // セリフ（Whisper）
  const transcript = transcribe(raw, dir, durationA);
  if (transcript.text !== undefined) {
    const verdict = evaluateTranscript(transcript.text, theme, themes);
    evidence.speech = { transcript: transcript.text, ...verdict };
    if (!verdict.ok) problems.push(verdict.forbidden.length ? `speech_forbidden_${verdict.forbidden.join('_')}` : `speech_similarity_${verdict.score}`);
  } else {
    evidence.speech = transcript;
    problems.push('speech_check_unavailable');
  }
  // 重複・競合・AI開示
  const queue = d1(`SELECT post_id,status,caption,link,external_post_id FROM social_post_queue WHERE post_id='${postId}';`)[0];
  if (!queue || queue.status !== 'REVIEW_REQUIRED') problems.push(`queue_${queue?.status || 'missing'}`);
  if (!String(queue?.caption || '').includes('AI生成')) problems.push('caption_disclosure');
  if (!/^https:\/\/hoshilu\.app\//.test(String(queue?.link || ''))) problems.push('link');
  const collision = d1(`SELECT (SELECT COUNT(*) FROM social_post_queue WHERE post_id<>'${postId}' AND platform='INSTAGRAM' AND content_id='${jobId}' AND (status IN ('APPROVED','PUBLISHING','PUBLISHED') OR external_post_id<>'')) AS duplicate_count,(SELECT COUNT(*) FROM social_post_queue WHERE platform='INSTAGRAM' AND status IN ('APPROVED','PUBLISHING') AND scheduled_at BETWEEN '${new Date(slot.publish_at.getTime() - 30 * 60 * 1000).toISOString()}' AND '${new Date(slot.publish_at.getTime() + 30 * 60 * 1000).toISOString()}') AS competing_count;`)[0] || {};
  evidence.collision = collision;
  if (Number(collision.duplicate_count) !== 0) problems.push('duplicate');
  if (Number(collision.competing_count) !== 0) problems.push('competing_slot');
  // 一覧表（証跡用）
  run('ffmpeg', ['-y', '-v', 'error', '-i', out, '-vf', 'fps=1,scale=180:-1,tile=4x4', '-frames:v', '1', path.join(dir, 'contact-sheet.jpg')]);
  evidence.machine_verified = ['video_spec', 'audio_spec', 'duration', 'decode', 'audio_present', 'overlay_burned', 'face_single_clear(vision)', 'speech_matches_script(whisper)', 'caption_ai_disclosure', 'link_hoshilu', 'duplicate', 'competing_slot'];
  evidence.not_biometrically_verified = ['identity_consistent: same approved reference image conditions every generation; no face matching performed', 'hands: props excluded by prompt; hand shape not machine-verified'];
  return { ok: problems.length === 0, problems, evidence };
}

// ---------- 7. 承認 / 不合格 ----------
function approve(jobId, postId, out, evidence) {
  const sha = sha256File(out);
  const size = statSync(out).size;
  const key = `runway/${jobId}/postprocessed-${sha}.mp4`;
  run('npx', [...WRANGLER, 'r2', 'object', 'put', `${BUCKET}/${key}`, '--file', out, '--content-type', 'video/mp4', '--remote']);
  const back = path.join(path.dirname(out), 'roundtrip.mp4');
  run('npx', [...WRANGLER, 'r2', 'object', 'get', `${BUCKET}/${key}`, '--file', back, '--remote']);
  if (sha256File(back) !== sha) throw new Error('AUTO_REEL_R2_ROUNDTRIP_MISMATCH');
  const sqlFile = path.join(path.dirname(out), 'approve.sql');
  writeFileSync(sqlFile, buildApprovalSql({ jobId, postId, storageKey: key, sizeBytes: size, sha256: sha, publishAt: slot.publish_at, evidence, now: new Date() }));
  d1File(sqlFile);
  const state = d1(`SELECT j.status,j.qa_status,j.storage_key,q.status AS queue_status,q.scheduled_at,(SELECT status FROM social_post_queue WHERE post_id='${postId}-x') AS x_status FROM runway_generation_jobs j LEFT JOIN social_post_queue q ON q.post_id='${postId}' WHERE j.job_id='${jobId}';`)[0] || {};
  if (state.status !== 'APPROVED_FOR_POST' || state.qa_status !== 'PASSED' || state.storage_key !== key || state.queue_status !== 'APPROVED') throw new Error(`AUTO_REEL_APPROVE_STATE:${JSON.stringify(state)}`);
  // 配信ルートが承認済みバイトをそのまま返すこと
  const url = `https://hoshilu.app/api/social/media/runway/${jobId}.mp4?auto-reel-check=${Date.now()}`;
  const served = path.join(path.dirname(out), 'served.mp4');
  run('curl', ['--fail-with-body', '--silent', '--show-error', '--output', served, url]);
  if (sha256File(served) !== sha) throw new Error('AUTO_REEL_ROUTE_MISMATCH');
  log('approved and queued', { key, sha256: sha, size, queue_status: state.queue_status, scheduled_at: state.scheduled_at, x_status: state.x_status });
  return { key, sha256: sha, size, scheduled_at: state.scheduled_at, x_status: state.x_status };
}

function reject(jobId, postId, reason) {
  const sqlFile = path.join(WORK, `${jobId}-reject.sql`);
  writeFileSync(sqlFile, buildRejectSql({ jobId, postId, reason, now: new Date() }));
  d1File(sqlFile);
  log('rejected', { job_id: jobId, reason });
}

// ---------- main ----------
let outcome = { ok: false };
try {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const dir = path.join(WORK, `attempt-${attempt}`);
    mkdirSync(dir, { recursive: true });
    const generated = await ensureGenerated(attempt);
    if (generated.failed) {
      log('generation failed', { job_id: generated.jobId, detail: generated.failed });
      outcome = { ok: false, job_id: generated.jobId, reason: `generation:${generated.failed}` };
      continue;
    }
    if (generated.row.status !== 'GENERATED_REVIEW_REQUIRED') {
      outcome = { ok: true, job_id: generated.jobId, note: `already ${generated.row.status}` };
      break;
    }
    const raw = fetchRaw(generated.jobId, generated.row, dir);
    const rawProbe = ffprobeJson(raw);
    const durationA = Math.min(Number(themes.duration_seconds || 8), Number(rawProbe.format.duration));
    const ui = await captureUi(dir);
    const out = compose(raw, ui.file, dir, durationA);
    const qa = await autoQa(raw, out, dir, durationA, generated.jobId, generated.postId, ui.live);
    report[`attempt_${attempt}`] = { job_id: generated.jobId, qa };
    writeFileSync(path.join(dir, 'qa.json'), JSON.stringify(qa, null, 2));
    if (!qa.ok) {
      reject(generated.jobId, generated.postId, qa.problems.join(','));
      outcome = { ok: false, job_id: generated.jobId, reason: `auto_qa:${qa.problems.join(',')}`, evidence: qa.evidence };
      const retryable = qa.problems.every((p) => /^(face_check|speech_|audio_silent)/.test(p));
      if (!retryable) break;
      continue;
    }
    const approved = approve(generated.jobId, generated.postId, out, qa.evidence);
    outcome = { ok: true, job_id: generated.jobId, post_id: generated.postId, attempt, ...approved, publish_at: slot.publish_at.toISOString(), evidence: qa.evidence };
    break;
  }
} catch (error) {
  outcome = { ok: false, reason: `exception:${String(error.stack || error).slice(0, 1500)}` };
}
report.outcome = outcome;
report.finished_at = new Date().toISOString();
writeFileSync(path.join(WORK, 'report.json'), JSON.stringify(report, null, 2));
console.log(`[auto-reel] OUTCOME ${JSON.stringify({ ...outcome, evidence: undefined })}`);
if (!outcome.ok) process.exitCode = 1;
