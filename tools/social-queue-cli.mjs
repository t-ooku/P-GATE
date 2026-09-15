#!/usr/bin/env node

const endpoint = String(process.env.HOSHILU_SOCIAL_ENDPOINT || 'https://hoshilu.app').replace(/\/+$/, '');
const secret = String(process.env.HOSHILU_SOCIAL_ADMIN_SECRET || '');
const [command = 'list', postId = '', scheduledAt = ''] = process.argv.slice(2);

if (secret.length < 32) {
  console.error('HOSHILU_SOCIAL_ADMIN_SECRET（32文字以上）を環境変数へ設定してください。');
  process.exit(1);
}

const headers = { authorization: `Bearer ${secret}`, 'content-type': 'application/json' };

async function list() {
  const response = await fetch(`${endpoint}/api/internal/social/queue`, { headers });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP_${response.status}`);
  console.log(JSON.stringify(payload, null, 2));
}

async function approve() {
  if (!postId || !Number.isFinite(Date.parse(scheduledAt))) {
    throw new Error('使い方: node tools/social-queue-cli.mjs approve POST_ID 2026-07-27T02:00:00Z');
  }
  const response = await fetch(`${endpoint}/api/internal/social/approve`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ post_id: postId, scheduled_at: scheduledAt })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP_${response.status}`);
  console.log(JSON.stringify(payload, null, 2));
}

async function cancel() {
  if (!postId) throw new Error('使い方: node tools/social-queue-cli.mjs cancel POST_ID');
  const response = await fetch(`${endpoint}/api/internal/social/cancel`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ post_id: postId })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP_${response.status}`);
  console.log(JSON.stringify(payload, null, 2));
}

if (command === 'list') await list();
else if (command === 'approve') await approve();
else if (command === 'cancel') await cancel();
else throw new Error('対応コマンド: list / approve / cancel');
