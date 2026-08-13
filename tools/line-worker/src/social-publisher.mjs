import {
  getInstagramPublishCredentials, instagramOAuthReadiness
} from './instagram-oauth.mjs';

const PLATFORMS = new Set(['X', 'INSTAGRAM', 'TIKTOK']);
const DISCLOSURE = '※リンク先にはアフィリエイト広告を含む場合があります。';
const INVALID_HOSHILU_OWNER_CLAIM = /(?:ITG(?:グループ株式会社)?[^。\n]{0,50}(?:(?:所有|運営)[^。\n]{0,20}(?:HOSHILU|ホシル)|(?:HOSHILU|ホシル)[^。\n]{0,20}(?:所有|運営))|(?:HOSHILU|ホシル)[^。\n]{0,50}(?:(?:所有|運営)[^。\n]{0,20}ITG(?:グループ株式会社)?|ITG(?:グループ株式会社)?[^。\n]{0,20}(?:所有|運営)))/i;

const clean = (value, max = 2000) => String(value || '')
  .normalize('NFKC')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

export function normalizeSocialPost(input = {}) {
  const platform = clean(input.platform, 20).toUpperCase();
  if (!PLATFORMS.has(platform)) throw new Error('SOCIAL_PLATFORM_INVALID');
  let caption = clean(input.caption, platform === 'X' ? 240 : 1800);
  if (caption.length < 5) throw new Error('SOCIAL_CAPTION_INVALID');
  if (INVALID_HOSHILU_OWNER_CLAIM.test(caption)) throw new Error('SOCIAL_ENTITY_CLAIM_INVALID');
  if (platform === 'INSTAGRAM') {
    if (!/コメント/.test(caption)) caption += ' 気になった商品をコメントで教えてね。';
    const requiredTags = ['#ホシル', '#あいまい検索', '#13モール横断', '#ほしっとく'];
    const missingTags = requiredTags.filter(tag => !caption.includes(tag));
    if (missingTags.length) caption += ` ${missingTags.join(' ')}`;
  }
  let link = clean(input.link, 1000);
  if (link) {
    const url = new URL(link);
    if (url.protocol !== 'https:' || !['hoshilu.app', 'www.hoshilu.app'].includes(url.hostname)) {
      throw new Error('SOCIAL_LINK_INVALID');
    }
    // Social platforms split raw spaces and non-ASCII query text when detecting URLs.
    // Serialize through URL so the complete search phrase remains inside `q`.
    link = url.toString();
  }
  const affiliate = input.affiliate === true;
  const disclosedCaption = affiliate && !caption.includes('アフィリエイト')
    ? `${caption}\n${DISCLOSURE}`
    : caption;
  return {
    post_id: clean(input.post_id, 100),
    content_id: clean(input.content_id, 100),
    campaign_id: clean(input.campaign_id, 100),
    platform,
    caption: disclosedCaption,
    link,
    media_url: clean(input.media_url, 1000),
    platform_job_id: clean(input.platform_job_id, 120),
    scheduled_at: clean(input.scheduled_at, 40),
    status: clean(input.status || 'REVIEW_REQUIRED', 30).toUpperCase(),
    affiliate
  };
}

export function socialPublisherReadiness(env = {}) {
  const xOAuth1 = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET']
    .every((name) => Boolean(String(env[name] || '').trim()));
  return {
    X: xOAuth1 || Boolean(String(env.X_USER_ACCESS_TOKEN || '').trim()),
    INSTAGRAM: Boolean(String(env.INSTAGRAM_ACCESS_TOKEN || '').trim() && String(env.INSTAGRAM_ACCOUNT_ID || '').trim()),
    TIKTOK: Boolean(String(env.TIKTOK_ACCESS_TOKEN || '').trim() && env.TIKTOK_APP_AUDITED === 'true')
  };
}

export function xPublishingSafetyReadiness(env = {}) {
  const expectedUsername = String(env.X_EXPECTED_USERNAME || '').trim();
  const expectedUsernameValid = /^[A-Za-z0-9_]{1,15}$/.test(expectedUsername);
  return {
    enabled: env.X_PUBLISHING_ENABLED === 'true',
    expectedUsernameConfigured: Boolean(expectedUsername),
    expectedUsernameValid,
    ready: env.X_PUBLISHING_ENABLED === 'true'
      && expectedUsernameValid
      && socialPublisherReadiness(env).X
  };
}

export async function socialPublisherReadinessWithStoredCredentials(env = {}) {
  const readiness = socialPublisherReadiness(env);
  if (!readiness.INSTAGRAM) {
    readiness.INSTAGRAM = (await instagramOAuthReadiness(env)).connected;
  }
  return readiness;
}

const oauthEncode = (value) => encodeURIComponent(String(value))
  .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

async function oauth1Authorization(method, url, env) {
  const params = {
    oauth_consumer_key: env.X_API_KEY,
    oauth_nonce: crypto.randomUUID().replaceAll('-', ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: env.X_ACCESS_TOKEN,
    oauth_version: '1.0'
  };
  const parameterString = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${oauthEncode(key)}=${oauthEncode(value)}`)
    .join('&');
  const signatureBase = [
    method.toUpperCase(),
    oauthEncode(url),
    oauthEncode(parameterString)
  ].join('&');
  const signingKey = `${oauthEncode(env.X_API_SECRET)}&${oauthEncode(env.X_ACCESS_TOKEN_SECRET)}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signatureBase))
  )));
  return `OAuth ${Object.entries({ ...params, oauth_signature: signature })
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${oauthEncode(key)}="${oauthEncode(value)}"`)
    .join(', ')}`;
}

function assertXPublishingConfiguration(env) {
  if (env.X_PUBLISHING_ENABLED !== 'true') throw new Error('X_PUBLISHING_DISABLED');
  const expectedUsername = String(env.X_EXPECTED_USERNAME || '').trim();
  if (!expectedUsername) throw new Error('X_EXPECTED_USERNAME_REQUIRED');
  if (!/^[A-Za-z0-9_]{1,15}$/.test(expectedUsername)) {
    throw new Error('X_EXPECTED_USERNAME_INVALID');
  }
  if (!socialPublisherReadiness(env).X) throw new Error('SOCIAL_X_NOT_CONFIGURED');
  return expectedUsername;
}

async function xAuthorization(method, endpoint, env) {
  const oauth1Ready = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET']
    .every((name) => Boolean(String(env[name] || '').trim()));
  const bearerToken = String(env.X_USER_ACCESS_TOKEN || '').trim();
  // Prefer the long-lived OAuth 1.0a user context when both credential sets
  // exist. A stale OAuth 2 bearer token must not mask valid OAuth 1.0a keys.
  return oauth1Ready
    ? oauth1Authorization(method, endpoint, env)
    : bearerToken
      ? `Bearer ${bearerToken}`
      : '';
}

async function verifyXPublishingAccount(expectedUsername, env, fetchImpl) {
  const endpoint = 'https://api.x.com/2/users/me';
  const authorization = await xAuthorization('GET', endpoint, env);
  const response = await fetchImpl(endpoint, {
    method: 'GET',
    headers: { authorization }
  });
  if (!response.ok) throw new Error(`X_ACCOUNT_VERIFY_${response.status}`);
  let username = '';
  try {
    username = String((await response.json())?.data?.username || '');
  } catch {
    throw new Error('X_ACCOUNT_VERIFY_RESPONSE_INVALID');
  }
  if (username !== expectedUsername) throw new Error('X_ACCOUNT_MISMATCH');
}

async function publishX(post, env, fetchImpl) {
  const expectedUsername = assertXPublishingConfiguration(env);
  await verifyXPublishingAccount(expectedUsername, env, fetchImpl);
  const endpoint = 'https://api.x.com/2/tweets';
  const authorization = await xAuthorization('POST', endpoint, env);
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ text: [post.caption, post.link].filter(Boolean).join('\n') })
  });
  if (!response.ok) {
    const detail = clean(await response.text(), 240).replace(/[^\w\s:.,{}[\]"-]/g, '');
    throw new Error(`X_PUBLISH_${response.status}${detail ? `_${detail}` : ''}`);
  }
  return (await response.json())?.data?.id || '';
}

async function publishInstagram(post, env, fetchImpl, hooks = {}) {
  if (!post.media_url) throw new Error('INSTAGRAM_MEDIA_REQUIRED');
  const account = encodeURIComponent(env.INSTAGRAM_ACCOUNT_ID);
  const headers = { authorization: `Bearer ${env.INSTAGRAM_ACCESS_TOKEN}`, 'content-type': 'application/json' };
  let mediaPath = '';
  try {
    mediaPath = new URL(post.media_url).pathname.toLowerCase();
  } catch {
    throw new Error('INSTAGRAM_MEDIA_URL_INVALID');
  }
  const isReel = /\.(?:mp4|mov|m4v)$/.test(mediaPath);
  const isStory = /(?:^|[-_])story(?:$|[-_])/i.test(post.content_id);
  const profileCta = '続きは @hoshilu.app のプロフィールリンクから。';
  const instagramCaption = post.caption.includes('@hoshilu.app')
    ? post.caption
    : `${post.caption}\n${profileCta}`;
  const mediaPayload = isStory
    ? {
        media_type: 'STORIES',
        ...(isReel ? { video_url: post.media_url } : { image_url: post.media_url })
      }
    : isReel
    ? {
        media_type: 'REELS',
        video_url: post.media_url,
        caption: instagramCaption,
        ...(post.campaign_id === 'hoshilu-runway-video' ? { is_ai_generated: true } : {}),
        share_to_feed: true,
        hide_like_and_view_counts: true
      }
    : {
        image_url: post.media_url,
        caption: instagramCaption,
        hide_like_and_view_counts: true
      };
  let creationId = clean(post.platform_job_id, 120);
  if (!creationId) {
    const create = await fetchImpl(`https://graph.instagram.com/v24.0/${account}/media`, {
      method: 'POST',
      headers,
      body: JSON.stringify(mediaPayload)
    });
    if (!create.ok) {
      const detail = clean(await create.text(), 240).replace(/[^\w\s:.,{}[\]"-]/g, '');
      throw new Error(`INSTAGRAM_CREATE_${create.status}${detail ? `_${detail}` : ''}`);
    }
    creationId = clean((await create.json())?.id, 120);
    if (!creationId) throw new Error('INSTAGRAM_CREATION_ID_MISSING');
    await hooks.onJobCreated?.(creationId);
  }
  let statusCode = '';
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const status = await fetchImpl(`https://graph.instagram.com/v24.0/${encodeURIComponent(creationId)}?fields=status_code`, { headers });
    if (!status.ok) {
      const detail = clean(await status.text(), 240).replace(/[^\w\s:.,{}[\]"-]/g, '');
      throw new Error(`INSTAGRAM_STATUS_${status.status}${detail ? `_${detail}` : ''}`);
    }
    statusCode = String((await status.json())?.status_code || '').toUpperCase();
    if (statusCode === 'FINISHED') break;
    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') throw new Error(`INSTAGRAM_CONTAINER_${statusCode}`);
    const delay = Math.max(0, Number(env.INSTAGRAM_POLL_DELAY_MS ?? 2000));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  }
  if (statusCode !== 'FINISHED') throw new Error(`INSTAGRAM_CONTAINER_${statusCode || 'TIMEOUT'}`);
  let publishPayload;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const publish = await fetchImpl(`https://graph.instagram.com/v24.0/${account}/media_publish`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ creation_id: creationId })
    });
    if (publish.ok) {
      publishPayload = await publish.json();
      break;
    }
    const rawDetail = await publish.text();
    const mediaNotReady = publish.status === 400 && /2207027|media is not ready|media id is not available/i.test(rawDetail);
    if (mediaNotReady && attempt < 5) {
      const delay = Math.max(0, Number(env.INSTAGRAM_PUBLISH_RETRY_DELAY_MS ?? 2000));
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    const detail = clean(rawDetail, 240).replace(/[^\w\s:.,{}[\]"-]/g, '');
    throw new Error(`INSTAGRAM_PUBLISH_${publish.status}${detail ? `_${detail}` : ''}`);
  }
  if (!publishPayload?.id) throw new Error('INSTAGRAM_PUBLISH_ID_MISSING');
  return publishPayload.id;
}

async function publishTikTok(post, env, fetchImpl) {
  if (env.TIKTOK_APP_AUDITED !== 'true') throw new Error('TIKTOK_APP_AUDIT_REQUIRED');
  if (!post.media_url) throw new Error('TIKTOK_MEDIA_REQUIRED');
  const headers = { authorization: `Bearer ${env.TIKTOK_ACCESS_TOKEN}`, 'content-type': 'application/json; charset=UTF-8' };
  const creator = await fetchImpl('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', { method: 'POST', headers });
  if (!creator.ok) throw new Error(`TIKTOK_CREATOR_${creator.status}`);
  const levels = (await creator.json())?.data?.privacy_level_options || [];
  if (!levels.includes('PUBLIC_TO_EVERYONE')) throw new Error('TIKTOK_PUBLIC_NOT_ALLOWED');
  const publish = await fetchImpl('https://open.tiktokapis.com/v2/post/publish/content/init/', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      post_info: { title: post.caption.slice(0, 90), description: [post.caption, post.link].filter(Boolean).join('\n'), privacy_level: 'PUBLIC_TO_EVERYONE', disable_comment: false },
      source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: [post.media_url] },
      post_mode: 'DIRECT_POST',
      media_type: 'PHOTO'
    })
  });
  if (!publish.ok) throw new Error(`TIKTOK_PUBLISH_${publish.status}`);
  const payload = await publish.json();
  if (payload?.error?.code && payload.error.code !== 'ok') throw new Error(`TIKTOK_${payload.error.code}`);
  return payload?.data?.publish_id || '';
}

export async function publishSocialPost(post, env, fetchImpl = fetch, hooks = {}) {
  const normalized = normalizeSocialPost(post);
  if (normalized.status !== 'APPROVED') throw new Error('SOCIAL_POST_NOT_APPROVED');
  if (normalized.platform === 'INSTAGRAM') {
    const credential = await getInstagramPublishCredentials(env, fetchImpl);
    return publishInstagram(normalized, {
      ...env,
      INSTAGRAM_ACCOUNT_ID: credential.accountId,
      INSTAGRAM_ACCESS_TOKEN: credential.accessToken
    }, fetchImpl, hooks);
  }
  if (normalized.platform === 'X') return publishX(normalized, env, fetchImpl);
  if (!socialPublisherReadiness(env)[normalized.platform]) throw new Error(`SOCIAL_${normalized.platform}_NOT_CONFIGURED`);
  return publishTikTok(normalized, env, fetchImpl);
}

export async function runDueSocialPosts(env, now = new Date(), fetchImpl = fetch) {
  if (!env.PRODUCT_DB) return { checked: 0, published: 0 };
  const staleBefore = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  await env.PRODUCT_DB.prepare(`UPDATE social_post_queue SET status='FAILED',
    last_error='STALE_PUBLISHING_RECOVERED',updated_at=?2
    WHERE status='PUBLISHING' AND updated_at<?1`).bind(staleBefore, now.toISOString()).run();
  const xReady = xPublishingSafetyReadiness(env).ready ? 1 : 0;
  const due = await env.PRODUCT_DB.prepare(`SELECT * FROM social_post_queue
    WHERE status='APPROVED' AND scheduled_at<=?1
    AND (platform<>'X' OR ?2=1) ORDER BY scheduled_at ASC LIMIT 5`)
    .bind(now.toISOString(), xReady).all();
  const dueRows = (due.results || []).filter(row => row.platform !== 'X' || xReady === 1);
  let published = 0;
  for (const row of dueRows) {
    try {
      const claim = await env.PRODUCT_DB.prepare(`UPDATE social_post_queue SET status='PUBLISHING',updated_at=?2
        WHERE post_id=?1 AND status='APPROVED'`).bind(row.post_id, now.toISOString()).run();
      if (Number(claim?.meta?.changes || 0) !== 1) continue;
      const externalId = await publishSocialPost(row, env, fetchImpl, {
        onJobCreated: async (jobId) => {
          await env.PRODUCT_DB.prepare(`UPDATE social_post_queue SET platform_job_id=?2,updated_at=?3
            WHERE post_id=?1 AND status='PUBLISHING'`).bind(row.post_id, jobId, now.toISOString()).run();
        }
      });
      await env.PRODUCT_DB.prepare(`UPDATE social_post_queue SET status='PUBLISHED',external_post_id=?2,
        published_at=?3,updated_at=?3,last_error='',platform_job_id='' WHERE post_id=?1`)
        .bind(row.post_id, externalId, now.toISOString()).run();
      published += 1;
    } catch (error) {
      await env.PRODUCT_DB.prepare(`UPDATE social_post_queue SET status='FAILED',last_error=?2,
        updated_at=?3 WHERE post_id=?1`).bind(row.post_id, clean(error?.message || error, 300), now.toISOString()).run();
    }
  }
  return { checked: dueRows.length, published };
}

function instagramPermalink(value) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || (host !== 'instagram.com' && !host.endsWith('.instagram.com'))) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function trackingFields(link) {
  try {
    const url = new URL(String(link || ''));
    return {
      source: clean(url.searchParams.get('utm_source'), 100),
      medium: clean(url.searchParams.get('utm_medium'), 100),
      campaign: clean(url.searchParams.get('utm_campaign'), 200),
      content: clean(url.searchParams.get('utm_content'), 200)
    };
  } catch {
    return { source: '', medium: '', campaign: '', content: '' };
  }
}

export async function syncInstagramPublishedPermalinks(env, now = new Date(), fetchImpl = fetch, onlyPostId = '') {
  if (!env.PRODUCT_DB) return { checked: 0, saved: 0, failed: 0 };
  const requestedPostId = clean(onlyPostId, 100);
  let due;
  try {
    due = await env.PRODUCT_DB.prepare(`SELECT q.post_id,q.campaign_id,q.external_post_id,q.published_at,q.link
      FROM social_post_queue q
      WHERE (?1='' OR q.post_id=?1)
      AND q.platform='INSTAGRAM' AND q.status='PUBLISHED'
      AND q.external_post_id<>''
      AND NOT EXISTS (SELECT 1 FROM social_post_performance p
        WHERE p.post_id=q.post_id AND p.public_url IS NOT NULL AND p.public_url<>'')
      ORDER BY q.published_at DESC LIMIT 10`).bind(requestedPostId).all();
  } catch (error) {
    console.error('INSTAGRAM_PERMALINK_SYNC_QUERY_FAILED', clean(error?.message || error, 200));
    return { checked: 0, saved: 0, failed: 1 };
  }
  const rows = due.results || [];
  if (!rows.length) return { checked: 0, saved: 0, failed: 0 };
  let credential;
  try {
    credential = await getInstagramPublishCredentials(env, fetchImpl);
  } catch (error) {
    console.error('INSTAGRAM_PERMALINK_SYNC_AUTH_FAILED', clean(error?.message || error, 200));
    return { checked: rows.length, saved: 0, failed: rows.length };
  }
  const headers = { authorization: `Bearer ${credential.accessToken}` };
  const timestamp = now.toISOString();
  let saved = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const response = await fetchImpl(`https://graph.instagram.com/v24.0/${encodeURIComponent(row.external_post_id)}?fields=id,permalink,is_ai_generated`, { headers });
      if (!response.ok) throw new Error(`INSTAGRAM_PERMALINK_${response.status}`);
      const payload = await response.json();
      const permalink = instagramPermalink(payload?.permalink);
      if (!permalink) throw new Error('INSTAGRAM_PERMALINK_INVALID');
      if (row.campaign_id === 'hoshilu-runway-video' && payload?.is_ai_generated !== true) {
        throw new Error('INSTAGRAM_AI_LABEL_NOT_CONFIRMED');
      }
      const utm = trackingFields(row.link);
      const publishedAt = clean(row.published_at, 40) || timestamp;
      await env.PRODUCT_DB.prepare(`INSERT INTO social_post_performance
        (snapshot_id,post_id,platform,snapshot_at,published_at,public_url,
         utm_source,utm_medium,utm_campaign,utm_content,traffic_class,created_at,updated_at)
        VALUES (?1,?2,'INSTAGRAM',?3,?4,?5,?6,?7,?8,?9,'ATTRIBUTED',?10,?10)
        ON CONFLICT(snapshot_id) DO UPDATE SET public_url=excluded.public_url,
          updated_at=excluded.updated_at`)
        .bind(`published:${row.post_id}`, row.post_id, publishedAt, publishedAt,
          permalink, utm.source, utm.medium, utm.campaign, utm.content, timestamp).run();
      if (row.campaign_id === 'hoshilu-runway-video') {
        console.log('INSTAGRAM_AI_LABEL_CONFIRMED', row.post_id);
      }
      saved += 1;
    } catch (error) {
      failed += 1;
      console.error('INSTAGRAM_PERMALINK_SYNC_FAILED', row.post_id, clean(error?.message || error, 200));
    }
  }
  return { checked: rows.length, saved, failed };
}

function authorized(request, env) {
  const expected = String(env.SOCIAL_ADMIN_SECRET || '');
  const received = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return expected.length >= 32 && received === expected;
}

export async function handleSocialAdminRoutes(request, env) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname.startsWith('/api/social/posts/')) {
    const postId = clean(decodeURIComponent(url.pathname.slice('/api/social/posts/'.length)), 100);
    if (!postId || !/^[a-zA-Z0-9_-]+$/.test(postId)) {
      return Response.json({ ok: false, error: 'SOCIAL_POST_ID_INVALID' }, { status: 400 });
    }
    const selectPublished = () => env.PRODUCT_DB.prepare(`SELECT q.post_id,q.platform,q.status,
      q.external_post_id,q.published_at,p.public_url
      FROM social_post_queue q
      LEFT JOIN social_post_performance p ON p.post_id=q.post_id AND p.public_url IS NOT NULL
      WHERE q.post_id=?1 AND q.status='PUBLISHED'
      ORDER BY p.snapshot_at DESC LIMIT 1`).bind(postId).first();
    if (!env.PRODUCT_DB) return Response.json({ ok: false, error: 'PRODUCT_DB_NOT_CONFIGURED' }, { status: 503 });
    let published = await selectPublished();
    if (!published) return Response.json({ ok: false, error: 'SOCIAL_POST_NOT_FOUND' }, { status: 404 });
    if (published.platform === 'INSTAGRAM' && !published.public_url) {
      await syncInstagramPublishedPermalinks(env, new Date(), fetch, postId);
      published = await selectPublished();
    }
    return Response.json({
      ok: true,
      post_id: published.post_id,
      platform: published.platform,
      status: published.status,
      external_post_id: published.external_post_id,
      published_at: published.published_at,
      public_url: published.public_url || null
    }, {
      status: published.public_url ? 200 : 202,
      headers: { 'cache-control': 'no-store' }
    });
  }
  if (!url.pathname.startsWith('/api/internal/social/')) return null;
  if (!authorized(request, env)) return Response.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  if (!env.PRODUCT_DB) return Response.json({ ok: false, error: 'PRODUCT_DB_NOT_CONFIGURED' }, { status: 503 });
  if (request.method === 'GET' && url.pathname === '/api/internal/social/queue') {
    const result = await env.PRODUCT_DB.prepare(`SELECT post_id,platform,caption,link,media_url,
      scheduled_at,status,affiliate,external_post_id,last_error,updated_at
      FROM social_post_queue ORDER BY scheduled_at ASC LIMIT 100`).all();
    return Response.json({ ok: true, posts: result.results || [], readiness: await socialPublisherReadinessWithStoredCredentials(env) });
  }
  if (request.method === 'POST' && url.pathname === '/api/internal/social/approve') {
    const input = await request.json();
    const postId = clean(input.post_id, 100);
    const scheduledAt = clean(input.scheduled_at, 40);
    if (!postId || !Number.isFinite(Date.parse(scheduledAt))) return Response.json({ ok: false, error: 'SOCIAL_APPROVAL_INVALID' }, { status: 400 });
    const existing = await env.PRODUCT_DB.prepare('SELECT * FROM social_post_queue WHERE post_id=?1').bind(postId).first();
    if (!existing) return Response.json({ ok: false, error: 'SOCIAL_POST_NOT_FOUND' }, { status: 404 });
    // Runway output has a stricter identity/content/post-processing QA gate.
    // The generic social approval endpoint must not bypass it. It may only be
    // used for a retry after the dedicated Runway approval already passed.
    if (existing.campaign_id === 'hoshilu-runway-video') {
      const runwayJob = await env.PRODUCT_DB.prepare(`SELECT status,qa_status,storage_key
        FROM runway_generation_jobs WHERE job_id=?1 AND post_id=?2 LIMIT 1`)
        .bind(existing.content_id, postId).first();
      if (!runwayJob || runwayJob.status !== 'APPROVED_FOR_POST'
        || runwayJob.qa_status !== 'PASSED' || !runwayJob.storage_key) {
        return Response.json({ ok: false, error: 'RUNWAY_QA_REQUIRED' }, { status: 409 });
      }
    }
    try {
      const post = normalizeSocialPost(existing);
      if (post.platform !== 'X' && !post.media_url) throw new Error(`${post.platform}_MEDIA_REQUIRED`);
      if (post.platform === 'INSTAGRAM') await getInstagramPublishCredentials(env);
      else if (post.platform === 'X') assertXPublishingConfiguration(env);
      else if (!socialPublisherReadiness(env)[post.platform]) throw new Error(`SOCIAL_${post.platform}_NOT_CONFIGURED`);
    } catch (error) {
      return Response.json({ ok: false, error: clean(error?.message || error, 100) }, { status: 409 });
    }
    await env.PRODUCT_DB.prepare(`UPDATE social_post_queue SET status='APPROVED',scheduled_at=?2,
      approved_at=?3,updated_at=?3 WHERE post_id=?1 AND status IN ('REVIEW_REQUIRED','FAILED')`)
      .bind(postId, new Date(scheduledAt).toISOString(), new Date().toISOString()).run();
    return Response.json({ ok: true, post_id: postId });
  }
  if (request.method === 'POST' && url.pathname === '/api/internal/social/cancel') {
    const input = await request.json();
    const postId = clean(input.post_id, 100);
    if (!postId) return Response.json({ ok: false, error: 'SOCIAL_CANCEL_INVALID' }, { status: 400 });
    await env.PRODUCT_DB.prepare(`UPDATE social_post_queue SET status='CANCELLED',updated_at=?2
      WHERE post_id=?1 AND status IN ('REVIEW_REQUIRED','APPROVED','FAILED')`)
      .bind(postId, new Date().toISOString()).run();
    return Response.json({ ok: true, post_id: postId });
  }
  if (request.method === 'POST' && url.pathname === '/api/internal/social/run') {
    return Response.json({ ok: true, result: await runDueSocialPosts(env, new Date()) });
  }
  return Response.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
}
