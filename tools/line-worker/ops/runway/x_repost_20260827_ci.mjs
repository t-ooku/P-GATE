import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const worker = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const mode = String(process.argv[2] || '').toLowerCase();
if (!['stage', 'release'].includes(mode)) throw new Error('MODE_MUST_BE_STAGE_OR_RELEASE');
if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  throw new Error('CLOUDFLARE_CREDENTIALS_REQUIRED');
}

const posts = [
  {
    job: 'runway-hoshilu-name-forgotten-20260819-v1',
    oldPost: 'hoshilu-runway-name-forgotten-20260819-v1-x',
    oldExternal: '2092837231291502616',
    post: 'hoshilu-runway-name-forgotten-20260819-v1-x-repost-20260827',
    caption: 'Qoo10やSHEINで見たのに、商品名を忘れた。覚えている色・形・使い方を話すだけ。AIが特徴を理解し、HOSHILUが商品を探します。※この動画はAI生成・AI加工映像です。 #Qoo10購入品 #SHEIN購入品',
    utm: 'runway_name_forgotten_20260819_v1_x_repost'
  },
  {
    job: 'runway-hoshilu-overseas-find-20260819-v2',
    oldPost: 'hoshilu-runway-overseas-find-20260819-v2-x',
    oldExternal: '2092874950390718829',
    post: 'hoshilu-runway-overseas-find-20260819-v2-x-repost-20260827',
    caption: '海外やQoo10・SHEINで見かけた「あれ」、日本でも探せる。覚えている特徴を話すだけ。AIが理解し、HOSHILUが探します。※この動画はAI生成・AI加工映像です。 #Qoo10 #SHEIN #海外通販',
    utm: 'runway_overseas_find_20260819_v2_x_repost'
  }
];

function evidence(name, value) {
  fs.writeFileSync(path.join(worker, `x-repost-${name}.json`),
    typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
}

function command(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: worker,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || '');
    process.stdout.write(result.stdout || '');
    throw new Error(`${executable} failed with status ${result.status}`);
  }
  if (result.stderr) process.stderr.write(result.stderr);
  return result.stdout;
}

function wrangler(args, evidenceName) {
  const output = command('npx', ['--yes', 'wrangler@4.121.0', ...args]);
  if (evidenceName) evidence(evidenceName, output);
  return output;
}

function resultRows(output) {
  const data = JSON.parse(output);
  return (Array.isArray(data) ? data : [data]).flatMap((item) => item.results || item.result?.results || []);
}

function query(name, sql) {
  return resultRows(wrangler([
    'd1', 'execute', 'PRODUCT_DB', '--remote', '--json', '--command', sql
  ], name));
}

function exactReviewRow(row, expected) {
  if (!row || row.post_id !== expected.post || row.platform !== 'X'
      || row.campaign_id !== 'hoshilu-runway-video' || row.content_id !== expected.job
      || row.caption !== expected.caption || /@hoshilu\.app/iu.test(row.caption)
      || row.media_url !== `https://hoshilu.app/api/social/media/runway/${expected.job}.mp4`
      || row.status !== 'REVIEW_REQUIRED' || Number(row.affiliate) !== 0
      || row.external_post_id || row.platform_job_id || row.published_at) return false;
  const link = new URL(row.link);
  return link.hostname === 'hoshilu.app' && link.searchParams.get('utm_source') === 'x'
    && link.searchParams.get('utm_content') === expected.utm;
}

command('node', ['--test', 'test/runway-x-repost-20260827.test.mjs']);

const healthResponse = await fetch(`https://hoshilu.app/health?x-repost-${mode}=1`, {
  headers: { 'cache-control': 'no-cache' }
});
const healthText = await healthResponse.text();
evidence('health', healthText);
if (!healthResponse.ok) throw new Error(`HEALTH_HTTP_${healthResponse.status}`);
const health = JSON.parse(healthText);
if (health?.ok !== true || health?.checks?.social_publishers?.X !== true
    || health?.checks?.x_oauth?.connected !== true) throw new Error('X_PUBLISHER_OR_OAUTH_NOT_READY');

const jobIds = posts.map((item) => `'${item.job}'`).join(',');
const allPostIds = posts.flatMap((item) => [item.oldPost, item.post]).map((id) => `'${id}'`).join(',');
const mediaUrls = posts.map((item) => `'https://hoshilu.app/api/social/media/runway/${item.job}.mp4'`).join(',');
const jobs = query('jobs', `SELECT job_id,status,qa_status,storage_key,storage_size_bytes,
  storage_content_type,rights_confirmed,ai_disclosure_confirmed FROM runway_generation_jobs
  WHERE job_id IN (${jobIds}) ORDER BY job_id;`);
const queue = query('queue-before', `SELECT post_id,platform,campaign_id,content_id,caption,link,
  media_url,status,affiliate,external_post_id,platform_job_id,published_at FROM social_post_queue
  WHERE post_id IN (${allPostIds}) ORDER BY post_id;`);
const collision = query('collision', `SELECT COUNT(*) AS duplicate_count FROM social_post_queue
  WHERE post_id NOT IN (${allPostIds}) AND platform='X'
    AND (content_id IN (${jobIds}) OR media_url IN (${mediaUrls}))
    AND (status IN ('APPROVED','PUBLISHING','PUBLISHED') OR external_post_id<>'' OR platform_job_id<>'');`)[0];
const credential = query('credential', `SELECT account_id,username,scopes,status,
  refresh_token_ciphertext,refresh_token_iv FROM x_oauth_credentials WHERE platform='X';`)[0];

const failures = [];
if (jobs.length !== 2) failures.push(`job rows=${jobs.length}`);
for (const job of jobs) {
  if (!['APPROVED_FOR_POST', 'PUBLISHED'].includes(job.status) || job.qa_status !== 'PASSED') {
    failures.push(`${job.job_id}=${job.status}/${job.qa_status}`);
  }
  if (Number(job.rights_confirmed) !== 1 || Number(job.ai_disclosure_confirmed) !== 1
      || !job.storage_key || Number(job.storage_size_bytes) <= 0
      || job.storage_content_type !== 'video/mp4') failures.push(`${job.job_id}=media/rights invalid`);
}
for (const expected of posts) {
  const old = queue.find((row) => row.post_id === expected.oldPost);
  if (!old || old.platform !== 'X' || old.status !== 'PUBLISHED'
      || old.external_post_id !== expected.oldExternal) failures.push(`${expected.oldPost}=unexpected old state`);
  const next = queue.find((row) => row.post_id === expected.post);
  if (mode === 'release' && !exactReviewRow(next, expected)) failures.push(`${expected.post}=not exact review row`);
  if (mode === 'stage' && next && !exactReviewRow(next, expected)) failures.push(`${expected.post}=already progressed or changed`);
}
if (Number(collision?.duplicate_count) !== 0) failures.push('duplicate X publication exists');
const scopes = new Set(String(credential?.scopes || '').split(/[\s,]+/).filter(Boolean));
for (const scope of ['tweet.read','tweet.write','users.read','media.write','offline.access']) {
  if (!scopes.has(scope)) failures.push(`missing scope ${scope}`);
}
if (credential?.status !== 'ACTIVE' || String(credential?.username || '').toLowerCase() !== 'hoshilu_app'
    || !credential?.refresh_token_ciphertext || !credential?.refresh_token_iv) {
  failures.push('official @hoshilu_app credential invalid');
}
if (failures.length) throw new Error(failures.join(' / '));

wrangler(['d1', 'time-travel', 'info', 'PRODUCT_DB', '--json'], `recovery-before-${mode}`);

if (mode === 'stage') {
  wrangler(['d1', 'execute', 'PRODUCT_DB', '--remote', '--json', '--file',
    'ops/runway/stage_x_reposts_20260827.sql', '--yes'], 'stage-result');
  const staged = query('staged', `SELECT post_id,platform,campaign_id,content_id,caption,link,
    media_url,status,affiliate,external_post_id,platform_job_id,published_at FROM social_post_queue
    WHERE post_id IN (${posts.map((item) => `'${item.post}'`).join(',')}) ORDER BY post_id;`);
  if (staged.length !== 2 || posts.some((expected) =>
    !exactReviewRow(staged.find((row) => row.post_id === expected.post), expected))) {
    throw new Error('STAGE_VERIFICATION_FAILED');
  }
  console.log('::notice::STAGED 2 X posts for @hoshilu_app as REVIEW_REQUIRED; public publication is blocked');
} else {
  wrangler(['d1', 'execute', 'PRODUCT_DB', '--remote', '--json', '--file',
    'ops/runway/release_x_reposts_20260827.sql', '--yes'], 'release-result');
  const released = query('released', `SELECT post_id,status,scheduled_at,approved_at,
    external_post_id,published_at,last_error FROM social_post_queue
    WHERE post_id IN (${posts.map((item) => `'${item.post}'`).join(',')}) ORDER BY post_id;`);
  if (released.length !== 2 || released.some((row) =>
    !['APPROVED','PUBLISHING','PUBLISHED'].includes(row.status)
      || !Number.isFinite(Date.parse(row.approved_at)) || row.last_error)) {
    throw new Error(`RELEASE_VERIFICATION_FAILED ${JSON.stringify(released)}`);
  }
  console.log(`::notice::QUEUED 2 posts for @hoshilu_app (${released.map((row) => row.status).join(',')})`);
}
