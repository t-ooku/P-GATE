import {
  getInstagramPublishCredentials, instagramOAuthReadiness
} from './instagram-oauth.mjs';
import { getXPublishCredentials, xOAuthReadiness } from './x-oauth.mjs';
import { authorizeAdminRequest } from './admin-auth.mjs';

const PLATFORMS = new Set(['X', 'INSTAGRAM', 'TIKTOK', 'THREADS']);
const DISCLOSURE = '※リンク先にはアフィリエイト広告を含む場合があります。';
const LEGACY_DISCOVERY_HASHTAGS = new Set([
  '#ホシル', '#あいまい検索', '#13モール横断', '#ほしっとく'
]);
const HASHTAG_PATTERN = /#[\p{L}\p{N}_ー]+/gu;
const INVALID_HOSHILU_OWNER_CLAIM = /(?:ITG(?:グループ株式会社)?[^。\n]{0,50}(?:(?:所有|運営)[^。\n]{0,20}(?:HOSHILU|ホシル)|(?:HOSHILU|ホシル)[^。\n]{0,20}(?:所有|運営))|(?:HOSHILU|ホシル)[^。\n]{0,50}(?:(?:所有|運営)[^。\n]{0,20}ITG(?:グループ株式会社)?|ITG(?:グループ株式会社)?[^。\n]{0,20}(?:所有|運営)))/i;
const INSTAGRAM_STATUS_CHECKS_PER_INVOCATION = 12;
const SOCIAL_PUBLISH_RETRY_DELAY_MS = 5 * 60 * 1000;
const DAILY_AI_ACTRESS_POLICY = 'DAILY_AI_ACTRESS_22';
const DAILY_AI_ACTRESS_CAMPAIGN = 'hoshilu-ai-actress-daily-v1';
const DAILY_AI_ACTRESS_PERSONA = 'hoshilu-approved-model-reference-v2';
const DAILY_AI_ACTRESS_DISCLOSURE = '※この動画はAI生成・AI加工映像です。';
const DAILY_AI_ACTRESS_POLICY_ERROR = 'SOCIAL_AI_ACTRESS_POLICY_REQUIRED';
const NEW_SEARCH_LAUNCH_CONTENT_IDS = new Set([
  'howto-four-input-search', 'continuous-search',
  'guide-search-screen', 'guide-continuous-search'
]);

const clean = (value, max = 2000) => String(value || '')
  .normalize('NFKC')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

// Xの280は「文字数」ではなく重み付き文字数で、日本語(CJK・かな・全角記号)は
// 1文字が2としてカウントされる。URLは実際の長さに関係なく常に23。
// https://developer.x.com/en/docs/counting-characters
function xCharWeight(code) {
  const light = code <= 4351 || (code >= 8192 && code <= 8205)
    || (code >= 8208 && code <= 8223) || (code >= 8242 && code <= 8247);
  return light ? 1 : 2;
}

export function xWeightedLength(value) {
  let total = 0;
  for (const char of String(value || '')) total += xCharWeight(char.codePointAt(0));
  return total;
}

function truncateToXWeight(value, budget) {
  if (xWeightedLength(value) <= budget) return value;
  let total = 0;
  let out = '';
  for (const char of String(value || '')) {
    const next = total + xCharWeight(char.codePointAt(0));
    if (next > budget) break;
    total = next;
    out += char;
  }
  return out;
}

function captionAndHashtags(value) {
  const hashtags = [...String(value || '').matchAll(HASHTAG_PATTERN)]
    .map(match => match[0])
    .filter(tag => !LEGACY_DISCOVERY_HASHTAGS.has(tag));
  const caption = String(value || '')
    .replace(HASHTAG_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { caption, hashtags };
}

function uniqueHashtags(...groups) {
  const seen = new Set();
  return groups.flat().filter((tag) => {
    const normalized = String(tag || '').toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function youthSearchHashtags(value, platform, contentId = '') {
  const source = String(value || '');
  if (NEW_SEARCH_LAUNCH_CONTENT_IDS.has(String(contentId || ''))) {
    const continuous = /continuous/u.test(String(contentId || ''));
    return continuous
      ? ['#HOSHILU', '#商品検索', '#見つかるまで探す']
      : ['#HOSHILU', '#画像検索', '#商品検索'];
  }
  const qoo10Focused = /Qoo\s*10で|Qoo\s*10の商品|#Qoo10購入品/iu.test(source);
  const sheinFocused = /SHEINで|SHIENで|SHEINの商品|SHIENの商品|#SHEIN購入品/iu.test(source);
  const qoo10Mentioned = /Qoo\s*10|キューテン/iu.test(source);
  const sheinMentioned = /SHEIN|SHIEN|シーイン/iu.test(source);
  const beauty = /韓国コスメ|コスメ|リップ|ティント|スキンケア|メイク|美容/iu.test(source);
  const fashion = /韓国ファッション|ファッション|コーデ|バッグ|アクセ|ネックレス|トップス|スカート|Y2K/iu.test(source);
  const qoo10PurchaseTag = /#Qoo10購入品/iu.test(source);
  const sheinPurchaseTag = /#SHEIN購入品/iu.test(source);
  const purchasePair = qoo10PurchaseTag && sheinPurchaseTag;

  if (purchasePair) {
    return platform === 'X'
      ? ['#Qoo10購入品', '#SHEIN購入品']
      : ['#HOSHILU', '#Qoo10購入品', '#SHEIN購入品', '#購入品紹介'];
  }
  if (qoo10PurchaseTag && !sheinPurchaseTag) {
    return platform === 'X'
      ? ['#Qoo10購入品', beauty ? '#韓国コスメ' : '#購入品紹介']
      : ['#HOSHILU', '#Qoo10', '#Qoo10購入品', beauty ? '#韓国コスメ' : '#購入品紹介'];
  }
  if (sheinPurchaseTag && !qoo10PurchaseTag) {
    return platform === 'X'
      ? ['#SHEIN購入品', fashion ? '#韓国ファッション' : '#購入品紹介']
      : ['#HOSHILU', '#SHEIN', '#SHEIN購入品', fashion ? '#韓国ファッション' : '#購入品紹介'];
  }
  if (qoo10Mentioned && sheinMentioned) {
    return platform === 'X'
      ? ['#Qoo10', '#SHEIN']
      : ['#HOSHILU', '#Qoo10', '#SHEIN', '#購入品紹介'];
  }
  if (qoo10Focused && !sheinFocused) {
    return platform === 'X'
      ? ['#Qoo10購入品', beauty ? '#韓国コスメ' : '#購入品紹介']
      : ['#HOSHILU', '#Qoo10', '#Qoo10購入品', beauty ? '#韓国コスメ' : '#購入品紹介'];
  }
  if (sheinFocused && !qoo10Focused) {
    return platform === 'X'
      ? ['#SHEIN購入品', fashion ? '#韓国ファッション' : '#購入品紹介']
      : ['#HOSHILU', '#SHEIN', '#SHEIN購入品', fashion ? '#韓国ファッション' : '#購入品紹介'];
  }
  if (qoo10Mentioned && !sheinMentioned) {
    return platform === 'X'
      ? ['#Qoo10購入品', beauty ? '#韓国コスメ' : '#購入品紹介']
      : ['#HOSHILU', '#Qoo10', '#Qoo10購入品', beauty ? '#韓国コスメ' : '#購入品紹介'];
  }
  if (sheinMentioned && !qoo10Mentioned) {
    return platform === 'X'
      ? ['#SHEIN購入品', fashion ? '#韓国ファッション' : '#購入品紹介']
      : ['#HOSHILU', '#SHEIN', '#SHEIN購入品', fashion ? '#韓国ファッション' : '#購入品紹介'];
  }
  return platform === 'X'
    ? ['#Qoo10', '#SHEIN']
    : ['#HOSHILU', '#Qoo10', '#SHEIN', '#購入品紹介'];
}

function sanitizeXCaption(value, hasLink) {
  const linkCta = hasLink ? '詳しくは投稿内のリンクから。' : '詳しくはHOSHILUで検索。';
  return String(value || '')
    .replace(/続きは\s*@hoshilu\.app\s*のプロフィール(?:リンク)?から[。.!！]?/giu, linkCta)
    .replace(/@hoshilu\.app/giu, 'HOSHILU');
}

function fitXHashtags(hashtags, budget) {
  const fitted = [];
  // 本文を最低5文字残し、ハッシュタグは途中で切らず、入るものだけを採用する。
  const tagBudget = Math.max(0, budget - 10);
  for (const tag of hashtags) {
    const candidate = [...fitted, tag].join(' ');
    if (xWeightedLength(candidate) <= tagBudget) fitted.push(tag);
  }
  return fitted;
}

export function normalizeSocialPost(input = {}) {
  const platform = clean(input.platform, 20).toUpperCase();
  if (!PLATFORMS.has(platform)) throw new Error('SOCIAL_PLATFORM_INVALID');
  let caption = clean(input.caption, platform === 'THREADS' ? 400 : 1800);
  if (platform === 'X') {
    caption = sanitizeXCaption(caption, Boolean(clean(input.link, 1000)));
    const parts = captionAndHashtags(caption);
    const recommendedTags = youthSearchHashtags(caption, platform, input.content_id);
    const hashtags = fitXHashtags(
      uniqueHashtags(recommendedTags, parts.hashtags).slice(0, 4),
      280 - (input.affiliate === true ? 1 + xWeightedLength(DISCLOSURE) : 0)
        - (clean(input.link, 1000) ? 1 + 23 : 0)
    );
    // 2026-08-17: 従来は「240文字」で切っていたが、Xが数えるのは重み付き
    // 文字数なので、日本語240文字は480相当で上限280の倍近くあった。さらに
    // publish時にPR表記(重み54)とリンク(常に23)が後から連結されるため、
    // その分を引いておかないとX側で弾かれる(実際に失敗3件が出ていた)。
    const reserve = (input.affiliate === true ? 1 + xWeightedLength(DISCLOSURE) : 0)
      + (clean(input.link, 1000) ? 1 + 23 : 0);
    const hashtagBlock = hashtags.join(' ');
    const separatorWeight = parts.caption && hashtagBlock ? 1 : 0;
    const bodyBudget = 280 - reserve - separatorWeight - xWeightedLength(hashtagBlock);
    const body = truncateToXWeight(parts.caption, Math.max(0, bodyBudget)).trim();
    caption = [body, hashtagBlock].filter(Boolean).join(' ');
  }
  if (platform === 'INSTAGRAM') {
    const parts = captionAndHashtags(caption);
    if (!/コメント/.test(parts.caption)) parts.caption += ' 気になった商品をコメントで教えてね。';
    const hashtags = uniqueHashtags(youthSearchHashtags(caption, platform, input.content_id), parts.hashtags);
    caption = [parts.caption, hashtags.join(' ')].filter(Boolean).join(' ');
  }
  if (caption.length < 5) throw new Error('SOCIAL_CAPTION_INVALID');
  if (INVALID_HOSHILU_OWNER_CLAIM.test(caption)) throw new Error('SOCIAL_ENTITY_CLAIM_INVALID');
  let link = clean(input.link, 1000);
  if (link) {
    const url = new URL(link);
    if (url.protocol !== 'https:' || !['hoshilu.app', 'www.hoshilu.app'].includes(url.hostname)) {
      throw new Error('SOCIAL_LINK_INVALID');
    }
    // Runway動画はInstagramの承認済み行をXへ複製するため、保存済みリンクの
    // utm_sourceがinstagramでも、実際の公開媒体に合わせて計測値を補正する。
    if (platform === 'X') url.searchParams.set('utm_source', 'x');
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
    affiliate,
    creative_asset_id: clean(input.creative_asset_id, 120),
    content_format: clean(input.content_format, 20).toUpperCase(),
    creative_policy: clean(input.creative_policy, 80).toUpperCase(),
    jst_publish_date: clean(input.jst_publish_date, 10),
    ai_generated: input.ai_generated === true || Number(input.ai_generated) === 1,
    crosspost_group_id: clean(input.crosspost_group_id, 140)
  };
}

function expectedDailyAiActressAssetId(jstPublishDate) {
  const value = String(jstPublishDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return '';
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '';
  const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getUTCDay()];
  return `hoshilu_ai_actress_daily_${weekday}_v1`;
}

function failDailyAiActressPolicy() {
  throw new Error(DAILY_AI_ACTRESS_POLICY_ERROR);
}

async function assertDailyAiActressPolicy(post, env) {
  const applies = post.creative_policy === DAILY_AI_ACTRESS_POLICY
    || post.campaign_id === DAILY_AI_ACTRESS_CAMPAIGN;
  if (!applies) return post;
  const expectedAssetId = expectedDailyAiActressAssetId(post.jst_publish_date);
  const expectedCrosspostGroup = `hoshilu-ai-actress-daily-${post.jst_publish_date}`;
  if (!env.PRODUCT_DB
    || post.creative_policy !== DAILY_AI_ACTRESS_POLICY
    || post.campaign_id !== DAILY_AI_ACTRESS_CAMPAIGN
    || !['X', 'INSTAGRAM'].includes(post.platform)
    || post.content_format !== 'REEL'
    || !post.ai_generated
    || !expectedAssetId
    || post.creative_asset_id !== expectedAssetId
    || post.crosspost_group_id !== expectedCrosspostGroup
    || post.content_id !== expectedCrosspostGroup
    || !post.media_url
    || !Number.isFinite(Date.parse(post.scheduled_at))
    || !post.caption.includes(DAILY_AI_ACTRESS_DISCLOSURE)
    || !post.caption.includes('#AI生成')) {
    failDailyAiActressPolicy();
  }

  let evidence;
  try {
    evidence = await env.PRODUCT_DB.prepare(`SELECT
      a.asset_id,a.media_url,a.media_sha256,a.content_format,a.creative_policy,
      a.persona_id,a.persona_age,a.ai_actress_present,a.audio_confirmed,
      a.rights_confirmed,a.rights_ledger_id,a.qa_status,a.ai_generated,
      a.ai_disclosure_confirmed,a.approved_at,
      (SELECT COUNT(*) FROM social_post_queue q
        WHERE q.crosspost_group_id=?2 AND q.content_id=?2
          AND q.jst_publish_date=?3 AND q.campaign_id='hoshilu-ai-actress-daily-v1'
          AND q.creative_policy='DAILY_AI_ACTRESS_22' AND q.content_format='REEL'
          AND q.creative_asset_id=?1 AND q.media_url=?4 AND q.ai_generated=1
          AND q.platform='X' AND q.status<>'CANCELLED') AS x_crosspost_count,
      (SELECT COUNT(*) FROM social_post_queue q
        WHERE q.crosspost_group_id=?2 AND q.content_id=?2
          AND q.jst_publish_date=?3 AND q.campaign_id='hoshilu-ai-actress-daily-v1'
          AND q.creative_policy='DAILY_AI_ACTRESS_22' AND q.content_format='REEL'
          AND q.creative_asset_id=?1 AND q.media_url=?4 AND q.ai_generated=1
          AND q.platform='INSTAGRAM' AND q.status<>'CANCELLED') AS instagram_crosspost_count
      FROM social_creative_assets a WHERE a.asset_id=?1 LIMIT 1`)
      .bind(post.creative_asset_id, post.crosspost_group_id,
        post.jst_publish_date, post.media_url).first();
  } catch {
    failDailyAiActressPolicy();
  }

  if (!evidence
    || evidence.asset_id !== post.creative_asset_id
    || evidence.media_url !== post.media_url
    || !/^[0-9a-f]{64}$/u.test(String(evidence.media_sha256 || ''))
    || evidence.content_format !== 'REEL'
    || evidence.creative_policy !== DAILY_AI_ACTRESS_POLICY
    || evidence.persona_id !== DAILY_AI_ACTRESS_PERSONA
    || Number(evidence.persona_age) !== 22
    || Number(evidence.ai_actress_present) !== 1
    || Number(evidence.audio_confirmed) !== 1
    || Number(evidence.rights_confirmed) !== 1
    || !String(evidence.rights_ledger_id || '').trim()
    || evidence.qa_status !== 'PASSED'
    || Number(evidence.ai_generated) !== 1
    || Number(evidence.ai_disclosure_confirmed) !== 1
    || !Number.isFinite(Date.parse(String(evidence.approved_at || '')))
    || Number(evidence.x_crosspost_count) < 1
    || Number(evidence.instagram_crosspost_count) < 1) {
    failDailyAiActressPolicy();
  }
  return post;
}

export function socialPublisherReadiness(env = {}) {
  const xOAuth1 = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET']
    .every((name) => Boolean(String(env[name] || '').trim()));
  return {
    X: xOAuth1 || Boolean(String(env.X_USER_ACCESS_TOKEN || '').trim()),
    INSTAGRAM: Boolean(String(env.INSTAGRAM_ACCESS_TOKEN || '').trim() && String(env.INSTAGRAM_ACCOUNT_ID || '').trim()),
    TIKTOK: Boolean(String(env.TIKTOK_ACCESS_TOKEN || '').trim() && env.TIKTOK_APP_AUDITED === 'true'),
    THREADS: Boolean(String(env.THREADS_ACCESS_TOKEN || '').trim() && String(env.THREADS_USER_ID || '').trim())
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
  };
}

export async function socialPublisherReadinessWithStoredCredentials(env = {}) {
  const readiness = socialPublisherReadiness(env);
  if (!readiness.X) {
    readiness.X = (await xOAuthReadiness(env)).connected;
  }
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
    redirect: 'manual',
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

function safeXMediaUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || !['hoshilu.app', 'www.hoshilu.app'].includes(url.hostname)) {
    throw new Error('X_MEDIA_URL_INVALID');
  }
  return url.toString();
}

async function xMediaRequest(url, accessToken, options, fetchImpl, errorCode) {
  const response = await fetchImpl(url, {
    ...options,
    redirect: 'manual',
    headers: { authorization: `Bearer ${accessToken}`, ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`${errorCode}_${response.status}`);
  return response;
}

async function uploadXVideo(mediaUrl, accessToken, env, fetchImpl) {
  const safeUrl = new URL(safeXMediaUrl(mediaUrl));
  const runwayMatch = /^\/api\/social\/media\/runway\/([A-Za-z0-9][A-Za-z0-9_-]{0,119})\.mp4$/.exec(safeUrl.pathname);
  const staticAsset = /^\/social\/[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.mp4$/.test(safeUrl.pathname);
  let bytes;
  const contentType = 'video/mp4';
  const maxBytes = Math.min(512 * 1024 * 1024,
    Math.max(1, Number(env.X_MAX_VIDEO_BYTES || 100 * 1024 * 1024)));
  if (runwayMatch) {
    if (!env.PRODUCT_DB || !env.SOCIAL_MEDIA_BUCKET) throw new Error('X_MEDIA_R2_NOT_CONFIGURED');
    const job = await env.PRODUCT_DB.prepare(`SELECT storage_key FROM runway_generation_jobs
      WHERE job_id=?1 AND status IN ('APPROVED_FOR_POST','PUBLISHED') LIMIT 1`).bind(runwayMatch[1]).first();
    const object = job?.storage_key ? await env.SOCIAL_MEDIA_BUCKET.get(job.storage_key) : null;
    if (!object) throw new Error('X_MEDIA_R2_NOT_FOUND');
    if (Number.isFinite(Number(object.size)) && Number(object.size) > maxBytes) {
      throw new Error('X_MEDIA_SIZE_INVALID');
    }
    const objectContentType = String(object.httpMetadata?.contentType || '').split(';')[0].toLowerCase();
    if (objectContentType !== contentType) throw new Error('X_MEDIA_TYPE_INVALID');
    bytes = new Uint8Array(await object.arrayBuffer());
  } else if (staticAsset) {
    // HOSHILU's own static media must not loop through the public Worker route.
    // The asset binding reads the deployed file directly and avoids transient
    // 52x responses caused by a Worker fetching its own custom domain.
    if (!env.ASSETS?.fetch) throw new Error('X_MEDIA_ASSETS_NOT_CONFIGURED');
    let mediaResponse;
    try {
      mediaResponse = await env.ASSETS.fetch(new Request(safeUrl.toString(), {
        method: 'GET', redirect: 'manual'
      }));
    } catch {
      throw new Error('X_MEDIA_ASSET_FETCH_FAILED');
    }
    if (!mediaResponse.ok) throw new Error(`X_MEDIA_FETCH_${mediaResponse.status}`);
    const declaredBytes = Number(mediaResponse.headers.get('content-length'));
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      throw new Error('X_MEDIA_SIZE_INVALID');
    }
    const responseContentType = String(mediaResponse.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (responseContentType !== contentType) throw new Error('X_MEDIA_TYPE_INVALID');
    bytes = new Uint8Array(await mediaResponse.arrayBuffer());
  } else {
    throw new Error('X_MEDIA_SOURCE_UNSUPPORTED');
  }
  if (!bytes.byteLength || bytes.byteLength > maxBytes) throw new Error('X_MEDIA_SIZE_INVALID');

  const initialized = await xMediaRequest(
    'https://api.x.com/2/media/upload/initialize', accessToken,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ media_type: contentType, total_bytes: bytes.byteLength, media_category: 'tweet_video' })
    }, fetchImpl, 'X_MEDIA_INIT'
  );
  const mediaId = clean((await initialized.json())?.data?.id, 120);
  if (!mediaId) throw new Error('X_MEDIA_ID_MISSING');

  const chunkSize = 5 * 1024 * 1024;
  for (let offset = 0, segment = 0; offset < bytes.byteLength; offset += chunkSize, segment += 1) {
    const form = new FormData();
    form.set('segment_index', String(segment));
    form.set('media', new Blob([bytes.slice(offset, offset + chunkSize)], { type: contentType }), `segment-${segment}.mp4`);
    await xMediaRequest(
      `https://api.x.com/2/media/upload/${encodeURIComponent(mediaId)}/append`, accessToken,
      { method: 'POST', body: form }, fetchImpl, 'X_MEDIA_APPEND'
    );
  }

  const finalized = await xMediaRequest(
    `https://api.x.com/2/media/upload/${encodeURIComponent(mediaId)}/finalize`, accessToken,
    { method: 'POST' }, fetchImpl, 'X_MEDIA_FINALIZE'
  );
  let processing = (await finalized.json())?.data?.processing_info;
  for (let attempt = 0; processing && processing.state !== 'succeeded' && attempt < 30; attempt += 1) {
    if (processing.state === 'failed') throw new Error('X_MEDIA_PROCESSING_FAILED');
    const suggestedDelay = Number(processing.check_after_secs);
    const delay = Math.max(0, Math.min(10_000, Number(
      env.X_MEDIA_POLL_DELAY_MS ?? (Number.isFinite(suggestedDelay) ? suggestedDelay * 1000 : 1000)
    )));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    const status = await xMediaRequest(
      `https://api.x.com/2/media/upload?command=STATUS&media_id=${encodeURIComponent(mediaId)}`,
      accessToken, { method: 'GET' }, fetchImpl, 'X_MEDIA_STATUS'
    );
    processing = (await status.json())?.data?.processing_info;
  }
  if (processing && processing.state !== 'succeeded') throw new Error('X_MEDIA_PROCESSING_TIMEOUT');
  return mediaId;
}

async function publishX(post, env, fetchImpl) {
  const expectedUsername = assertXPublishingConfiguration(env);
  const oauth2Configured = Boolean(env.X_CLIENT_ID && env.X_CLIENT_SECRET
    && env.SOCIAL_OAUTH_ENCRYPTION_KEY && env.PRODUCT_DB);
  let accessToken = '';
  if (oauth2Configured) {
    const credential = await getXPublishCredentials(env, fetchImpl);
    if (credential.username !== expectedUsername) throw new Error('X_ACCOUNT_MISMATCH');
    accessToken = credential.accessToken;
  } else {
    if (!socialPublisherReadiness(env).X) throw new Error('SOCIAL_X_NOT_CONFIGURED');
    await verifyXPublishingAccount(expectedUsername, env, fetchImpl);
  }
  const endpoint = 'https://api.x.com/2/tweets';
  if (post.media_url && !accessToken) throw new Error('X_MEDIA_REQUIRES_OAUTH2');
  const mediaId = post.media_url
    ? await uploadXVideo(post.media_url, accessToken, env, fetchImpl)
    : '';
  const authorization = accessToken
    ? `Bearer ${accessToken}`
    : await xAuthorization('POST', endpoint, env);
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    redirect: 'manual',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({
      text: [post.caption, post.link].filter(Boolean).join('\n'),
      ...(mediaId ? { media: { media_ids: [mediaId] } } : {})
    })
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
  const instagramCaption = /@hoshilu\.app\s*のプロフィール(?:の)?リンクから/iu.test(post.caption)
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
        ...((post.ai_generated || post.campaign_id === 'hoshilu-runway-video')
          ? { is_ai_generated: true } : {}),
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
      redirect: 'manual',
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
  // Keep each invocation comfortably below the Worker subrequest ceiling. A
  // slow container is resumed by the next isolated social cron using the
  // persisted platform_job_id, so this never creates a duplicate container.
  const requestedChecks = Number(env.INSTAGRAM_STATUS_CHECKS_PER_INVOCATION
    ?? INSTAGRAM_STATUS_CHECKS_PER_INVOCATION);
  const statusChecks = Number.isFinite(requestedChecks)
    ? Math.max(1, Math.min(INSTAGRAM_STATUS_CHECKS_PER_INVOCATION, Math.trunc(requestedChecks)))
    : INSTAGRAM_STATUS_CHECKS_PER_INVOCATION;
  for (let attempt = 0; attempt < statusChecks; attempt += 1) {
    const status = await fetchImpl(`https://graph.instagram.com/v24.0/${encodeURIComponent(creationId)}?fields=status_code`, {
      redirect: 'manual', headers
    });
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
  if (statusCode !== 'FINISHED') throw new Error('INSTAGRAM_CONTAINER_IN_PROGRESS');
  let publishPayload;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const publish = await fetchImpl(`https://graph.instagram.com/v24.0/${account}/media_publish`, {
      method: 'POST',
      redirect: 'manual',
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
  const creator = await fetchImpl('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
    method: 'POST', redirect: 'manual', headers
  });
  if (!creator.ok) throw new Error(`TIKTOK_CREATOR_${creator.status}`);
  const levels = (await creator.json())?.data?.privacy_level_options || [];
  if (!levels.includes('PUBLIC_TO_EVERYONE')) throw new Error('TIKTOK_PUBLIC_NOT_ALLOWED');
  const publish = await fetchImpl('https://open.tiktokapis.com/v2/post/publish/content/init/', {
    method: 'POST',
    redirect: 'manual',
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

// Threads (Meta) publishing. Unlike Instagram, Threads renders a URL in the
// post body as a real clickable link, so the UTM-tagged post.link goes
// straight into the text (same pattern as X) rather than needing a bio-link
// workaround. Two-step container flow per Meta's docs: create a container,
// wait for it to finish processing (recommended ~30s, then poll
// GET /{id}?fields=status until FINISHED/ERRORED/EXPIRED), then publish.
// https://developers.facebook.com/docs/threads/posts
async function publishThreads(post, env, fetchImpl, hooks = {}) {
  const userId = encodeURIComponent(env.THREADS_USER_ID);
  const headers = { authorization: `Bearer ${env.THREADS_ACCESS_TOKEN}`, 'content-type': 'application/json' };
  const text = [post.caption, post.link].filter(Boolean).join('\n');
  let isVideo = false;
  if (post.media_url) {
    try {
      isVideo = /\.(?:mp4|mov|m4v)$/i.test(new URL(post.media_url).pathname);
    } catch {
      throw new Error('THREADS_MEDIA_URL_INVALID');
    }
  }
  const mediaPayload = post.media_url
    ? { media_type: isVideo ? 'VIDEO' : 'IMAGE', text, ...(isVideo ? { video_url: post.media_url } : { image_url: post.media_url }) }
    : { media_type: 'TEXT', text };
  let creationId = clean(post.platform_job_id, 120);
  if (!creationId) {
    const create = await fetchImpl(`https://graph.threads.net/v1.0/${userId}/threads`, {
      method: 'POST',
      redirect: 'manual',
      headers,
      body: JSON.stringify(mediaPayload)
    });
    if (!create.ok) {
      const detail = clean(await create.text(), 240).replace(/[^\w\s:.,{}[\]"-]/g, '');
      throw new Error(`THREADS_CREATE_${create.status}${detail ? `_${detail}` : ''}`);
    }
    creationId = clean((await create.json())?.id, 120);
    if (!creationId) throw new Error('THREADS_CREATION_ID_MISSING');
    await hooks.onJobCreated?.(creationId);
  }
  const initialDelay = Math.max(0, Number(env.THREADS_INITIAL_DELAY_MS ?? 30000));
  if (initialDelay) await new Promise(resolve => setTimeout(resolve, initialDelay));
  let statusCode = '';
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const status = await fetchImpl(`https://graph.threads.net/v1.0/${encodeURIComponent(creationId)}?fields=status`, {
      redirect: 'manual', headers
    });
    if (!status.ok) {
      const detail = clean(await status.text(), 240).replace(/[^\w\s:.,{}[\]"-]/g, '');
      throw new Error(`THREADS_STATUS_${status.status}${detail ? `_${detail}` : ''}`);
    }
    statusCode = String((await status.json())?.status || '').toUpperCase();
    if (statusCode === 'FINISHED') break;
    if (statusCode === 'ERRORED' || statusCode === 'EXPIRED') throw new Error(`THREADS_CONTAINER_${statusCode}`);
    const delay = Math.max(0, Number(env.THREADS_POLL_DELAY_MS ?? 5000));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  }
  if (statusCode !== 'FINISHED') throw new Error(`THREADS_CONTAINER_${statusCode || 'TIMEOUT'}`);
  const publish = await fetchImpl(`https://graph.threads.net/v1.0/${userId}/threads_publish`, {
    method: 'POST',
    redirect: 'manual',
    headers,
    body: JSON.stringify({ creation_id: creationId })
  });
  if (!publish.ok) {
    const detail = clean(await publish.text(), 240).replace(/[^\w\s:.,{}[\]"-]/g, '');
    throw new Error(`THREADS_PUBLISH_${publish.status}${detail ? `_${detail}` : ''}`);
  }
  const publishPayload = await publish.json();
  if (!publishPayload?.id) throw new Error('THREADS_PUBLISH_ID_MISSING');
  return publishPayload.id;
}

export async function publishSocialPost(post, env, fetchImpl = fetch, hooks = {}) {
  const normalized = normalizeSocialPost(post);
  if (normalized.status !== 'APPROVED') throw new Error('SOCIAL_POST_NOT_APPROVED');
  await assertDailyAiActressPolicy(normalized, env);
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
  if (normalized.platform === 'THREADS') return publishThreads(normalized, env, fetchImpl, hooks);
  return publishTikTok(normalized, env, fetchImpl);
}

function isTransientSocialPublishError(value) {
  const message = clean(value, 300);
  if ([
    'INSTAGRAM_CONTAINER_IN_PROGRESS',
    'INSTAGRAM_CONTAINER_TIMEOUT',
    'INSTAGRAM_CONTAINER_EXPIRED',
    'X_MEDIA_ASSET_FETCH_FAILED',
    'X_MEDIA_PROCESSING_TIMEOUT',
    'THREADS_CONTAINER_IN_PROGRESS',
    'THREADS_CONTAINER_TIMEOUT',
    'THREADS_CONTAINER_EXPIRED'
  ].includes(message)) return true;
  if (/Too many subrequests by single Worker invocation/i.test(message)) return true;
  if (/^(?:X_PUBLISH|INSTAGRAM_PUBLISH|THREADS_PUBLISH)_429(?:_|$)/.test(message)) return true;
  return /^(?:X_MEDIA_FETCH|X_MEDIA_INIT|X_MEDIA_APPEND|X_MEDIA_FINALIZE|X_MEDIA_STATUS|INSTAGRAM_CREATE|INSTAGRAM_STATUS|THREADS_CREATE|THREADS_STATUS)_(?:408|425|429|5\d\d)(?:_|$)/.test(message);
}

function socialPublishRetryAt(now, env) {
  const requested = Number(env.SOCIAL_PUBLISH_RETRY_DELAY_MS ?? SOCIAL_PUBLISH_RETRY_DELAY_MS);
  const delay = Number.isFinite(requested)
    ? Math.max(60_000, Math.min(15 * 60 * 1000, Math.trunc(requested)))
    : SOCIAL_PUBLISH_RETRY_DELAY_MS;
  return new Date(now.getTime() + delay).toISOString();
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
    AND (platform<>'X' OR ?2=1) ORDER BY scheduled_at ASC,post_id ASC LIMIT 1`)
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
      const message = clean(error?.message || error, 300);
      if (message.includes(DAILY_AI_ACTRESS_POLICY_ERROR)) {
        await env.PRODUCT_DB.prepare(`UPDATE social_post_queue SET status='REVIEW_REQUIRED',last_error=?2,
          updated_at=?3 WHERE post_id=?1 AND status IN ('APPROVED','PUBLISHING')`)
          .bind(row.post_id, DAILY_AI_ACTRESS_POLICY_ERROR, now.toISOString()).run();
      } else if (isTransientSocialPublishError(message)) {
        const resetPlatformJob = ['INSTAGRAM_CONTAINER_EXPIRED', 'THREADS_CONTAINER_EXPIRED']
          .includes(message) ? 1 : 0;
        await env.PRODUCT_DB.prepare(`UPDATE social_post_queue SET status='APPROVED',last_error=?2,
          scheduled_at=?3,updated_at=?4,
          platform_job_id=CASE WHEN ?5=1 THEN '' ELSE platform_job_id END
          WHERE post_id=?1 AND status='PUBLISHING'`)
          .bind(row.post_id, message, socialPublishRetryAt(now, env), now.toISOString(), resetPlatformJob).run();
      } else {
        await env.PRODUCT_DB.prepare(`UPDATE social_post_queue SET status='FAILED',last_error=?2,
          updated_at=?3 WHERE post_id=?1`).bind(row.post_id, message, now.toISOString()).run();
      }
    }
  }
  return { checked: dueRows.length, published };
}

export const socialPublisherTest = Object.freeze({
  uploadXVideo,
  isTransientSocialPublishError,
  assertDailyAiActressPolicy
});

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
    due = await env.PRODUCT_DB.prepare(`SELECT q.post_id,q.campaign_id,q.external_post_id,q.published_at,q.link,q.ai_generated
      FROM social_post_queue q
      WHERE (?1='' OR q.post_id=?1)
      AND q.platform='INSTAGRAM' AND q.status='PUBLISHED'
      AND q.external_post_id<>''
      AND NOT EXISTS (SELECT 1 FROM social_post_performance p
        WHERE p.post_id=q.post_id AND p.public_url IS NOT NULL AND p.public_url<>'')
      ORDER BY q.published_at DESC LIMIT 3`).bind(requestedPostId).all();
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
      const response = await fetchImpl(`https://graph.instagram.com/v24.0/${encodeURIComponent(row.external_post_id)}?fields=id,permalink,is_ai_generated`, {
        redirect: 'manual', headers
      });
      if (!response.ok) throw new Error(`INSTAGRAM_PERMALINK_${response.status}`);
      const payload = await response.json();
      const permalink = instagramPermalink(payload?.permalink);
      if (!permalink) throw new Error('INSTAGRAM_PERMALINK_INVALID');
      const expectsAiLabel = Number(row.ai_generated) === 1
        || row.campaign_id === 'hoshilu-runway-video';
      if (expectsAiLabel && payload?.is_ai_generated !== true) {
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
      if (expectsAiLabel) {
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

function threadsPermalink(value) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:'
      || (host !== 'threads.net' && !host.endsWith('.threads.net')
        && host !== 'threads.com' && !host.endsWith('.threads.com'))) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function jstDateKey(date) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Threads publishes a numeric value per named metric rather than the flat
// object shape Instagram/TikTok use, e.g.
// { data: [{ name: 'views', values: [{ value: 42 }] }, ...] }. Missing or
// non-finite metrics are recorded as null (matches the rest of this table's
// "unknown stays NULL, never 0" convention) rather than defaulting to 0.
function threadsMetricValue(payload, name) {
  const entry = (payload?.data || []).find(item => item?.name === name);
  const raw = entry?.values?.[0]?.value ?? entry?.total_value?.value;
  return Number.isFinite(raw) && raw >= 0 ? Math.trunc(raw) : null;
}

// Threads insights (依頼3): daily snapshot per published post. Unlike the
// Instagram permalink sync above (which only backfills a permalink once and
// never revisits a post), this is meant to be called repeatedly for the
// life of a post so performance can be tracked over time - the snapshot_id
// is keyed to the JST calendar day, so re-running within the same day
// updates that day's row in place instead of accumulating duplicates.
// https://developers.facebook.com/docs/threads/insights
export async function syncThreadsInsights(env, now = new Date(), fetchImpl = fetch, onlyPostId = '') {
  if (!env.PRODUCT_DB) return { checked: 0, saved: 0, failed: 0 };
  if (!socialPublisherReadiness(env).THREADS) return { checked: 0, saved: 0, failed: 0 };
  const requestedPostId = clean(onlyPostId, 100);
  let due;
  try {
    due = await env.PRODUCT_DB.prepare(`SELECT post_id,campaign_id,external_post_id,published_at,link
      FROM social_post_queue
      WHERE (?1='' OR post_id=?1)
      AND platform='THREADS' AND status='PUBLISHED'
      AND external_post_id<>''
      ORDER BY published_at DESC LIMIT 3`).bind(requestedPostId).all();
  } catch (error) {
    console.error('THREADS_INSIGHTS_SYNC_QUERY_FAILED', clean(error?.message || error, 200));
    return { checked: 0, saved: 0, failed: 1 };
  }
  const rows = due.results || [];
  if (!rows.length) return { checked: 0, saved: 0, failed: 0 };
  const headers = { authorization: `Bearer ${env.THREADS_ACCESS_TOKEN}` };
  const timestamp = now.toISOString();
  const snapshotDay = jstDateKey(now);
  let saved = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const mediaId = encodeURIComponent(row.external_post_id);
      const metaResponse = await fetchImpl(`https://graph.threads.net/v1.0/${mediaId}?fields=permalink`, {
        redirect: 'manual', headers
      });
      if (!metaResponse.ok) throw new Error(`THREADS_PERMALINK_${metaResponse.status}`);
      const permalink = threadsPermalink((await metaResponse.json())?.permalink);
      const insightsResponse = await fetchImpl(`https://graph.threads.net/v1.0/${mediaId}/insights?metric=views,likes,replies,reposts,quotes,shares`, {
        redirect: 'manual', headers
      });
      if (!insightsResponse.ok) throw new Error(`THREADS_INSIGHTS_${insightsResponse.status}`);
      const insightsPayload = await insightsResponse.json();
      const views = threadsMetricValue(insightsPayload, 'views');
      const replies = threadsMetricValue(insightsPayload, 'replies');
      const reposts = threadsMetricValue(insightsPayload, 'reposts');
      const quotes = threadsMetricValue(insightsPayload, 'quotes');
      const sharesMetric = threadsMetricValue(insightsPayload, 'shares');
      const shareComponents = [reposts, quotes, sharesMetric].filter(value => value !== null);
      const shares = shareComponents.length ? shareComponents.reduce((sum, value) => sum + value, 0) : null;
      const utm = trackingFields(row.link);
      const publishedAt = clean(row.published_at, 40) || timestamp;
      await env.PRODUCT_DB.prepare(`INSERT INTO social_post_performance
        (snapshot_id,post_id,platform,snapshot_at,published_at,public_url,
         utm_source,utm_medium,utm_campaign,utm_content,reach,impressions,comments,shares,traffic_class,created_at,updated_at)
        VALUES (?1,?2,'THREADS',?3,?4,?5,?6,?7,?8,?9,?10,?10,?11,?12,'ATTRIBUTED',?13,?13)
        ON CONFLICT(snapshot_id) DO UPDATE SET snapshot_at=excluded.snapshot_at,
          public_url=excluded.public_url,reach=excluded.reach,impressions=excluded.impressions,
          comments=excluded.comments,shares=excluded.shares,updated_at=excluded.updated_at`)
        .bind(`threads:${row.post_id}:${snapshotDay}`, row.post_id, timestamp, publishedAt,
          permalink, utm.source, utm.medium, utm.campaign, utm.content, views, replies, shares, timestamp).run();
      saved += 1;
    } catch (error) {
      failed += 1;
      console.error('THREADS_INSIGHTS_SYNC_FAILED', row.post_id, clean(error?.message || error, 200));
    }
  }
  return { checked: rows.length, saved, failed };
}

async function authorized(request, env) {
  const expected = String(env.SOCIAL_ADMIN_SECRET || '');
  const received = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (expected.length >= 32 && received === expected) return true;
  return Boolean(await authorizeAdminRequest(request, env));
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
    if (!published) {
      // The public audit endpoint must make a scheduled post's safe lifecycle
      // state observable without exposing captions, links, provider responses,
      // tokens, or arbitrary last_error text. This lets an operator distinguish
      // a missing queue row from a rights review or publisher failure without
      // granting access to the protected admin queue.
      const audit = await env.PRODUCT_DB.prepare(`SELECT post_id,platform,status,
        CASE WHEN last_error IN ('MEDIA_REUSE_REVIEW_REQUIRED',
          'SOCIAL_AI_ACTRESS_POLICY_REQUIRED',
          'SOCIAL_QUEUE_QUARANTINED_DUPLICATE_CAMPAIGN_20260813')
          THEN last_error ELSE '' END AS safe_error_code
        FROM social_post_queue WHERE post_id=?1 LIMIT 1`).bind(postId).first();
      if (!audit) return Response.json({ ok: false, error: 'SOCIAL_POST_NOT_FOUND' }, { status: 404 });
      const status = clean(audit.status, 30).toUpperCase();
      const diagnostic = {
        ok: false,
        post_id: clean(audit.post_id, 100),
        platform: clean(audit.platform, 20).toUpperCase(),
        status,
        error: status === 'REVIEW_REQUIRED'
          ? 'SOCIAL_POST_REVIEW_REQUIRED'
          : status === 'FAILED'
            ? 'SOCIAL_POST_FAILED'
            : status === 'CANCELLED'
              ? 'SOCIAL_POST_CANCELLED'
              : 'SOCIAL_POST_PENDING'
      };
      if (audit.safe_error_code) diagnostic.safe_error_code = audit.safe_error_code;
      const responseStatus = status === 'REVIEW_REQUIRED' || status === 'FAILED'
        ? 409
        : status === 'CANCELLED' ? 410 : 202;
      return Response.json(diagnostic, {
        status: responseStatus,
        headers: { 'cache-control': 'no-store' }
      });
    }
    if (published.platform === 'INSTAGRAM' && !published.public_url) {
      await syncInstagramPublishedPermalinks(env, new Date(), fetch, postId);
      published = await selectPublished();
    }
    if (published.platform === 'THREADS' && !published.public_url) {
      await syncThreadsInsights(env, new Date(), fetch, postId);
      published = await selectPublished();
    }
    // X does not provide a permalink lookup equivalent to Instagram/Threads.
    // A numeric tweet ID is sufficient for X's stable /i/web/status route, so
    // expose that public URL instead of leaving an otherwise successful post
    // unverifiable to the audit contract.
    const publicUrl = published.public_url || (
      published.platform === 'X' && /^\d+$/u.test(String(published.external_post_id || ''))
        ? `https://x.com/i/web/status/${published.external_post_id}`
        : null
    );
    return Response.json({
      ok: true,
      post_id: published.post_id,
      platform: published.platform,
      status: published.status,
      external_post_id: published.external_post_id,
      published_at: published.published_at,
      public_url: publicUrl
    }, {
      status: publicUrl ? 200 : 202,
      headers: { 'cache-control': 'no-store' }
    });
  }
  if (!url.pathname.startsWith('/api/internal/social/')) return null;
  if (!await authorized(request, env)) return Response.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  if (!env.PRODUCT_DB) return Response.json({ ok: false, error: 'PRODUCT_DB_NOT_CONFIGURED' }, { status: 503 });
  if (request.method === 'GET' && url.pathname === '/api/internal/social/queue') {
    const result = await env.PRODUCT_DB.prepare(`SELECT post_id,platform,caption,link,media_url,
      scheduled_at,status,affiliate,external_post_id,last_error,updated_at,
      creative_asset_id,content_format,creative_policy,jst_publish_date,ai_generated,crosspost_group_id
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
      if (post.platform !== 'X' && post.platform !== 'THREADS' && !post.media_url) throw new Error(`${post.platform}_MEDIA_REQUIRED`);
      await assertDailyAiActressPolicy(post, env);
      if (post.platform === 'INSTAGRAM') await getInstagramPublishCredentials(env);
      else if (post.platform === 'X') {
        assertXPublishingConfiguration(env);
        await getXPublishCredentials(env);
      }
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
