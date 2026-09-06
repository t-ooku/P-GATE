// 2026-09-06 大隆さん決定（指示書 2026-09-06 全面再設計版 §A・§32）:
// 月・水・土の Reel は Runway で新規生成し、後処理（実画面・字幕・URL・AI表記）→
// 自動QA → 投稿キューまで人手ゼロで通す。このファイルは純粋関数だけ（テスト対象）。
// 実行本体は scripts/auto-runway-reel.mjs。
import { createHash } from 'node:crypto';

export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const SLOT_DAYS = { mon: 1, wed: 3, sat: 6 };
export const REQUIRED_QA_CHECKS = [
  'identity_consistent', 'face_hands_ok', 'hoshilu_visible', 'japanese_subtitles',
  'url_visible', 'audio_present', 'no_unrelated_brand', 'factual', 'ai_disclosure',
  'rights_confirmed', 'duplicate_checked', 'postprocessed'
];

export function jstParts(date) {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(), hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes()
  };
}

export function jstDateKey(date) {
  const p = jstParts(date);
  return `${p.y}${String(p.m).padStart(2, '0')}${String(p.d).padStart(2, '0')}`;
}

function jstDateTime(y, m, d, hhmm) {
  const [hh, mm] = String(hhmm).split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - JST_OFFSET_MS);
}

// 次に投稿する枠（月・水・土 20:15 JST）。生成〜QAに最低 leadMinutes は必要なので、
// それより近い枠は飛ばす。slotOverride があればその曜日の直近の枠。
export function nextPublishSlot(now, themes, { leadMinutes = 90, slotOverride = '' } = {}) {
  const slots = themes.slots || {};
  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const p = jstParts(candidate);
    const slot = Object.keys(slots).find((key) => SLOT_DAYS[key] === p.weekday);
    if (!slot) continue;
    if (slotOverride && slot !== slotOverride) continue;
    const publishAt = jstDateTime(p.y, p.m, p.d, themes.publish_time_jst || '20:15');
    if (publishAt.getTime() - now.getTime() < leadMinutes * 60 * 1000) continue;
    return { slot, theme_key: slots[slot], publish_at: publishAt, date_key: jstDateKey(publishAt) };
  }
  throw new Error('AUTO_REEL_NO_SLOT');
}

export function buildJobId(themeKey, dateKey, attempt = 1) {
  const key = String(themeKey).replace(/[^a-z0-9]/gi, '-').toLowerCase();
  return `runway-auto-${key}-${dateKey}${attempt > 1 ? `-r${attempt}` : ''}`;
}

export function buildPostId(jobId) {
  return jobId.replace(/^runway-auto-/, 'hoshilu-runway-auto-');
}

export function sha256Hex(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function sqlText(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

export function buildUserConcept(themes, theme, attempt = 1) {
  const scenes = theme.scenes || [];
  const scene = scenes[Math.min(attempt - 1, scenes.length - 1)] || scenes[0] || '';
  return `${scene} ${themes.concept_rules} 日本語で、次のセリフだけを一字一句そのまま話す:「${theme.spoken_line}」`.trim();
}

export function buildLink(theme, dateKey) {
  const url = new URL('https://hoshilu.app/');
  url.searchParams.set('utm_source', 'instagram');
  url.searchParams.set('utm_medium', 'organic_social');
  url.searchParams.set('utm_campaign', 'hoshilu_runway_reel');
  url.searchParams.set('utm_content', `${theme.utm_content}_${dateKey}`);
  return url.toString();
}

export function calculateProductUgcCredits(duration, ratio) {
  if (!Number.isInteger(duration) || duration < 4 || duration > 15) throw new Error('RUNWAY_DURATION_INVALID');
  if (ratio === '720:1280') return 192 + ((duration - 4) * 36);
  if (ratio === '1080:1920') return 208 + ((duration - 4) * 40);
  throw new Error('RUNWAY_RATIO_INVALID');
}

// 既存の ops/runway/reel_job_*.sql と同じ列構成。INSERT OR IGNORE なので再実行しても
// 二重投入されない（request_fingerprint は job_id + user_concept の SHA-256）。
export function buildJobSql({ themes, theme, jobId, dateKey, attempt = 1, now, publishAt }) {
  const userConcept = buildUserConcept(themes, theme, attempt);
  const duration = Number(themes.duration_seconds || 8);
  const credits = calculateProductUgcCredits(duration, themes.ratio);
  const postId = buildPostId(jobId);
  const link = buildLink(theme, dateKey);
  const caption = String(theme.caption || '');
  if (!caption.includes('AI生成')) throw new Error('AUTO_REEL_CAPTION_DISCLOSURE_MISSING');
  const ts = now.toISOString();
  const detail = JSON.stringify({
    expected_credits: credits, rights_confirmed: true, ai_disclosure_confirmed: true,
    external_publish: false, approved_by: 'AUTO_REEL_PIPELINE_2026-09-06',
    persona: themes.persona, theme: theme.utm_content, attempt, planned_publish_at: publishAt.toISOString(),
    structure: 'cut_a_runway_no_props + cut_b_real_ui_screenshot', spoken_line: theme.spoken_line
  });
  return [
    `INSERT OR IGNORE INTO runway_generation_jobs (job_id,post_id,request_fingerprint,status,recipe,recipe_version,character_image_url,product_image_url,duration_seconds,ratio,audio,product_info,user_concept,caption,link,expected_credits,rights_confirmed,ai_disclosure_confirmed,max_attempts,qa_status,scheduled_at,created_at,updated_at) VALUES (${[
      sqlText(jobId), sqlText(postId), sqlText(sha256Hex(jobId + userConcept)), "'APPROVED'", "'product_ugc'", "'2026-06'",
      sqlText(themes.character_image_url), sqlText(themes.product_image_url), String(duration), sqlText(themes.ratio), '1',
      sqlText(themes.product_info), sqlText(userConcept), sqlText(caption), sqlText(link), String(credits), '1', '1', '1', "'PENDING'",
      sqlText(ts), sqlText(ts), sqlText(ts)
    ].join(',')});`,
    `INSERT OR IGNORE INTO runway_approval_grants (grant_id,job_id,granted_by,scope,granted_at) VALUES (${[
      sqlText(`${jobId}-grant`), sqlText(jobId), "'USER_EXPLICIT_2026-09-06_AUTO_REEL'",
      "'MONTHLY_6000_CREDITS_AUTO_QA_PIPELINE'", sqlText(ts)
    ].join(',')});`,
    `INSERT OR IGNORE INTO runway_audit_log (audit_id,job_id,event,detail,created_at) VALUES (${[
      sqlText(`${jobId}-job-approved`), sqlText(jobId), "'JOB_APPROVED'", sqlText(detail), sqlText(ts)
    ].join(',')});`
  ].join('\n');
}

// themes.json では改行を「|」で書く（JSON にバックスラッシュを持ち込まない）
export function assText(text) {
  return String(text || '').split('|').join(ASS_NL);
}

function assTime(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = (total % 60).toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${s}`;
}

const ASS_NL = String.fromCharCode(92) + 'N'; // ass の改行。パッチ搬送でバックスラッシュ2連を避ける
const ASS_HEADER = `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Brand,Noto Sans CJK JP,31,&H00FFFFFF,&H00FFFFFF,&H00000000,&H604C1D95,-1,0,0,0,100,100,0,0,3,17,0,8,28,28,42,1
Style: Disclosure,Noto Sans CJK JP,19,&H00FFFFFF,&H00FFFFFF,&H00000000,&H70351A5F,0,0,0,0,100,100,0,0,3,11,0,8,28,28,101,1
Style: Subtitle,Noto Sans CJK JP,46,&H00FFFFFF,&H00FFFFFF,&H00000000,&H780F0920,-1,0,0,0,100,100,0,0,3,18,0,2,42,42,174,1
Style: Cta,Noto Sans CJK JP,36,&H00FFFFFF,&H00FFFFFF,&H00000000,&H88B5367F,-1,0,0,0,100,100,0,0,3,18,0,2,42,42,230,1
Style: Url,Noto Sans CJK JP,40,&H00FFFFFF,&H00FFFFFF,&H00000000,&H90FF5773,-1,0,0,0,100,100,0,0,3,14,0,2,42,42,118,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

// カットA（Runway 生成 8秒）: ブランド帯・AI表記・固定セリフの字幕。
export function buildAssCutA(theme, duration) {
  const lines = [
    `Dialogue: 0,${assTime(0)},${assTime(duration)},Brand,,0,0,0,,HOSHILU  |  hoshilu.app`,
    `Dialogue: 0,${assTime(0)},${assTime(duration)},Disclosure,,0,0,0,,AI生成・AI加工映像`
  ];
  for (const sub of theme.subtitles || []) {
    lines.push(`Dialogue: 0,${assTime(sub.start)},${assTime(Math.min(sub.end, duration))},Subtitle,,0,0,0,,${assText(sub.text)}`);
  }
  return `${ASS_HEADER}${lines.join('\n')}\n`;
}

// カットB（実画面 6秒）: 実際の hoshilu.app のスクリーンショットに CTA と URL。
export function buildAssCutB(themes, duration) {
  const lines = [
    `Dialogue: 0,${assTime(0)},${assTime(duration)},Brand,,0,0,0,,HOSHILU  |  hoshilu.app`,
    `Dialogue: 0,${assTime(0)},${assTime(duration)},Disclosure,,0,0,0,,実際の画面（AI生成ではありません）`,
    `Dialogue: 0,${assTime(0.2)},${assTime(duration)},Cta,,0,0,0,,${assText(themes.ui_caption)}${ASS_NL}${themes.cta}`,
    `Dialogue: 0,${assTime(0.2)},${assTime(duration)},Url,,0,0,0,,hoshilu.app`
  ];
  return `${ASS_HEADER}${lines.join('\n')}\n`;
}

// 音声の自動QA: Whisper の書き起こしと固定セリフの一致率（記号・空白・長音差を無視）。
export function normalizeJa(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[\s、。，．,.!?！？「」『』（）()…・〜~ー－\-]/g, '')
    .toLowerCase();
}

export function similarity(a, b) {
  const x = normalizeJa(a);
  const y = normalizeJa(b);
  if (!x.length || !y.length) return 0;
  // 2-gram Dice 係数（漢字/かな表記ゆれに強い）
  const grams = (s) => { const out = new Map(); for (let i = 0; i < s.length - 1; i += 1) { const g = s.slice(i, i + 2); out.set(g, (out.get(g) || 0) + 1); } return out; };
  const gx = grams(x); const gy = grams(y);
  let shared = 0;
  for (const [g, n] of gx) shared += Math.min(n, gy.get(g) || 0);
  const total = (x.length - 1) + (y.length - 1);
  return total > 0 ? (2 * shared) / total : 0;
}

export function evaluateTranscript(transcript, theme, themes, { minSimilarity = 0.45 } = {}) {
  const score = similarity(transcript, theme.spoken_line);
  const normalized = normalizeJa(transcript);
  const forbidden = (themes.forbidden_spoken || []).filter((word) => normalized.includes(normalizeJa(word)));
  return { ok: score >= minSimilarity && forbidden.length === 0, score: Number(score.toFixed(3)), forbidden, min_similarity: minSimilarity };
}

// Google Cloud Vision FACE_DETECTION の結果（フレームごと）を判定する。
// 各フレームで顔がちょうど1つ、検出信頼度が高く、ぼけていないこと。
export function evaluateFaces(frames, { minConfidence = 0.7, minPassRatio = 0.8 } = {}) {
  const bad = new Set(['LIKELY', 'VERY_LIKELY']);
  const details = frames.map((frame, index) => {
    const faces = Array.isArray(frame?.faceAnnotations) ? frame.faceAnnotations : [];
    const safe = frame?.safeSearchAnnotation || {};
    const problems = [];
    if (faces.length !== 1) problems.push(`faces=${faces.length}`);
    const face = faces[0];
    if (face && Number(face.detectionConfidence || 0) < minConfidence) problems.push(`confidence=${face.detectionConfidence}`);
    if (face && bad.has(face.blurredLikelihood)) problems.push('blurred');
    if (bad.has(safe.adult) || bad.has(safe.racy) || bad.has(safe.violence)) problems.push('safe_search');
    return { frame: index, ok: problems.length === 0, problems };
  });
  const passed = details.filter((d) => d.ok).length;
  const safeSearchFail = details.some((d) => d.problems.includes('safe_search'));
  return { ok: !safeSearchFail && frames.length > 0 && passed / frames.length >= minPassRatio, passed, total: frames.length, details };
}

export function parseVolume(stderrText) {
  const match = /mean_volume:\s*(-?[\d.]+) dB/.exec(String(stderrText || ''));
  return match ? Number(match[1]) : Number.NEGATIVE_INFINITY;
}

export function d1Rows(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  return (Array.isArray(data) ? data : [data]).flatMap((x) => x?.results || x?.result?.results || []);
}

export function buildApprovalSql({ jobId, postId, storageKey, sizeBytes, sha256, publishAt, evidence, now }) {
  const ts = now.toISOString();
  const detail = JSON.stringify({
    checks: REQUIRED_QA_CHECKS, candidate_sha256: sha256, scheduled_at: publishAt.toISOString(),
    reviewed_by_owner_in_chat: false, automated: true, evidence
  });
  return [
    `UPDATE runway_generation_jobs SET storage_key=${sqlText(storageKey)},storage_etag=NULL,storage_size_bytes=${Number(sizeBytes)},storage_content_type='video/mp4',status='APPROVED_FOR_POST',qa_status='PASSED',updated_at=${sqlText(ts)} WHERE job_id=${sqlText(jobId)} AND status IN ('GENERATED_REVIEW_REQUIRED','APPROVED_FOR_POST') AND rights_confirmed=1 AND ai_disclosure_confirmed=1;`,
    `INSERT OR IGNORE INTO runway_audit_log (audit_id,job_id,attempt_id,event,detail,created_at) VALUES (${sqlText(`qa-approved-${jobId}-${sha256}`)},${sqlText(jobId)},'','QA_APPROVED_FOR_POST',${sqlText(detail)},${sqlText(ts)});`,
    `UPDATE social_post_queue SET status='APPROVED',scheduled_at=${sqlText(publishAt.toISOString())},approved_at=${sqlText(ts)},last_error='',updated_at=${sqlText(ts)} WHERE post_id=${sqlText(postId)} AND platform='INSTAGRAM' AND status='REVIEW_REQUIRED' AND external_post_id='' AND platform_job_id='' AND published_at='' AND EXISTS (SELECT 1 FROM runway_generation_jobs WHERE job_id=${sqlText(jobId)} AND post_id=${sqlText(postId)} AND status='APPROVED_FOR_POST' AND qa_status='PASSED' AND storage_key=${sqlText(storageKey)});`,
    `INSERT INTO social_post_queue (post_id,platform,campaign_id,content_id,caption,link,media_url,scheduled_at,status,affiliate,created_at,updated_at,approved_at) SELECT ${sqlText(`${postId}-x`)},'X',campaign_id,content_id,caption,link,media_url,${sqlText(publishAt.toISOString())},'APPROVED',affiliate,${sqlText(ts)},${sqlText(ts)},${sqlText(ts)} FROM social_post_queue WHERE post_id=${sqlText(postId)} AND status='APPROVED' AND NOT EXISTS (SELECT 1 FROM social_post_queue x WHERE x.post_id=${sqlText(`${postId}-x`)} OR (x.platform='X' AND x.content_id=${sqlText(jobId)} AND (x.status IN ('APPROVED','PUBLISHING','PUBLISHED') OR x.external_post_id<>'')));`
  ].join('\n');
}

export function buildRejectSql({ jobId, postId, reason, now }) {
  const ts = now.toISOString();
  const detail = JSON.stringify({ automated: true, reason: String(reason).slice(0, 1500) });
  return [
    `UPDATE runway_generation_jobs SET status='FAILED_FINAL',qa_status='FAILED',last_error_code='AUTO_QA_FAILED',last_error_stage='auto_qa',last_error_detail=${sqlText(String(reason).slice(0, 1000))},updated_at=${sqlText(ts)} WHERE job_id=${sqlText(jobId)} AND status='GENERATED_REVIEW_REQUIRED';`,
    `UPDATE social_post_queue SET status='CANCELLED',last_error='AUTO_QA_FAILED',updated_at=${sqlText(ts)} WHERE post_id=${sqlText(postId)} AND status='REVIEW_REQUIRED';`,
    `INSERT OR IGNORE INTO runway_audit_log (audit_id,job_id,attempt_id,event,detail,created_at) VALUES (${sqlText(`qa-rejected-${jobId}`)},${sqlText(jobId)},'','QA_REJECTED_AUTO',${sqlText(detail)},${sqlText(ts)});`
  ].join('\n');
}
