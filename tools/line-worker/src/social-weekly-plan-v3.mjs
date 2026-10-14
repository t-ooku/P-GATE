// 2026-09-17 大隆さん決定（SNS 方針 v3）:
//   - リール: 週 2 回（火・金 20:15 JST）。必ず AI 女優 v1 の声付き動画を Runway で新規生成して投稿する
//     （scripts/auto-runway-reel.mjs + ops/runway/auto/themes.json、GitHub schedule 火・金 06:00 JST）。
//   - カルーセル画像フィード: 週 3 回（月・水・土 20:00 JST）。ops/social/carousels-v3.json の 6 セットを順送り。
//   - 内容はユーザー向けとショップ・セラー向けを半々（リール: 火=ユーザー／金=セラー、カルーセル: user, seller, … の順送り）。
//   - X には Instagram と同じ内容を同日に流す（リールは動画、カルーセルは画像最大 4 枚）。
//   - 旧方針（22 歳 v2 女優の毎日リール、火木土の Instagram 静止画案内、X の毎日案内）は投入しない（policyV3Allows）。
// 架空の数字・成果保証は載せない（§33）。画像は Pillow で決定的に描く（scripts/build-social-carousels.py）。
import carouselDoc from '../ops/social/carousels-v3.json' with { type: 'json' };
import { normalizeSocialPost, socialPublisherReadinessWithStoredCredentials, xPublishingSafetyReadiness } from './social-publisher.mjs';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const SOCIAL_PLAN_V3 = Object.freeze({
  version: '2026-09-17',
  reel_weekdays: Object.freeze([2, 5]),
  carousel_weekdays: Object.freeze([1, 3, 6]),
  carousel_publish_jst: Object.freeze([20, 0]),
  reel_publish_jst: Object.freeze([20, 15]),
  campaign_id: 'hoshilu-carousel-v3',
  crosspost_prefix: 'hoshilu-carousel-',
  // 順送りの起点（最初の月曜）。ここから数えた「何回目のカルーセル枠か」でセットを選ぶ
  rotation_epoch_jst: '2026-09-21',
  // 方針 v3 の適用開始日（JST）。これより前の予定は旧方針のまま（承認済みの行を勝手に変えない）
  policy_start_jst: '2026-09-21',
  platforms: Object.freeze(['INSTAGRAM', 'X']),
  seller_share: 0.5,
  // 2026-09-18 大隆さん指示: AI リールが不合格でも SNS 運用を止めない。リール日（火・金）に 19:30 JST まで
  // 承認済みリールが無ければ、同じ 20:15 JST 枠に静止画カルーセル（同じ対象: 火=ユーザー／金=セラー）を入れる
  reel_campaign_id: 'hoshilu-runway-video',
  fallback_gate_jst: Object.freeze([19, 30]),
  fallback_start_jst: '2026-09-18',
  fallback_post_prefix: 'hoshilu-carousel-v3-fallback',
  fallback_crosspost_prefix: 'hoshilu-carousel-fallback-'
});

// 2026-10-14: ショップページ（ロゴ・商品一覧・ショップ内検索・クーポン）を案内するセットは使わない。
// 大隆さん決定（10/9）「shop専用ページはまだ先。それまでは優先出品を謳えばよい」。過去の順送り（テスト・履歴）は
// 変えず、この日以降の枠だけ同じ対象（セラー向け）の別セットに置き換える。
export const PAUSED_CAROUSEL_SETS = Object.freeze({
  'seller-shop-entrance': Object.freeze({ from_jst: '2026-10-14', replacement: 'seller-keep-mall-see-demand' })
});
function isPausedSet(id, key) {
  const paused = PAUSED_CAROUSEL_SETS[id];
  return Boolean(paused && key >= paused.from_jst);
}

let cachedSets = null;
export function loadCarouselSets() {
  if (cachedSets) return cachedSets;
  const doc = carouselDoc;
  const byId = new Map(doc.sets.map((set) => [set.id, set]));
  cachedSets = Object.freeze({ version: doc.version, order: doc.order.map((id) => byId.get(id)).filter(Boolean) });
  return cachedSets;
}

function jstParts(date) {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(), weekday: shifted.getUTCDay() };
}
function dateKey(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}
function scheduledAt(parts, [hour, minute]) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour - 9, minute)).toISOString();
}

// 起点からの「カルーセル枠の通し番号」（月・水・土だけ数える）。負の日付は -1。
export function carouselSlotIndex(parts, plan = SOCIAL_PLAN_V3) {
  const [ey, em, ed] = plan.rotation_epoch_jst.split('-').map(Number);
  const epoch = Date.UTC(ey, em - 1, ed);
  const day = Date.UTC(parts.year, parts.month - 1, parts.day);
  if (day < epoch) return -1;
  let index = 0;
  for (let t = epoch; t < day; t += DAY_MS) {
    if (plan.carousel_weekdays.includes(new Date(t).getUTCDay())) index += 1;
  }
  return plan.carousel_weekdays.includes(parts.weekday) ? index : -1;
}

function utmLink(platform, set, key) {
  const url = new URL(String(set.link_path || '/'), 'https://hoshilu.app/');
  url.searchParams.set('utm_source', platform === 'X' ? 'x' : 'instagram');
  url.searchParams.set('utm_medium', 'organic_social');
  url.searchParams.set('utm_campaign', 'hoshilu_carousel_v3');
  url.searchParams.set('utm_content', `${set.id}_${key.replace(/-/g, '')}`);
  return url.toString();
}

// 2026-09-27: X は本文が全角換算 280 に切られる。Seller 募集は料金条件（30日無料・カード登録・31日目から自動課金・毎月更新）が
// 1 行目にあり、そのあとの本文は途中で切れて「HOSHILUのショップ」のように尻切れになっていた。X だけ「見出し＋条件の1行」にする。
export function carouselCaption(set, platform) {
  if (platform === 'X' && set.audience === 'seller') return `${set.title}\n${String(set.caption || '').split('\n')[0]}`;
  return set.caption;
}

export function carouselMediaUrls(set) {
  return set.slides.map((_, index) => `https://hoshilu.app/social/carousel/${set.asset_version ? `${set.asset_version}/` : ''}${set.id}/${index + 1}.jpg`);
}

// 月・水・土 20:00 JST の Instagram＋X カルーセル投稿（今日から days 日分、投稿時刻が未来のものだけ）
export function buildCarouselPosts(now = new Date(), days = 14, { plan = SOCIAL_PLAN_V3, sets = loadCarouselSets() } = {}) {
  const posts = [];
  const start = new Date(now.getTime() + JST_OFFSET_MS);
  start.setUTCHours(0, 0, 0, 0);
  for (let offset = 0; offset < days; offset += 1) {
    const parts = jstParts(new Date(start.getTime() + offset * DAY_MS - JST_OFFSET_MS));
    const slot = carouselSlotIndex(parts, plan);
    if (slot < 0 || !sets.order.length) continue;
    const key = dateKey(parts);
    const set = regularSetFor(parts, key, plan, sets);
    const when = scheduledAt(parts, plan.carousel_publish_jst);
    if (Date.parse(when) <= now.getTime()) continue;
    for (const platform of plan.platforms) {
      posts.push(normalizeSocialPost({
        post_id: `${plan.campaign_id}-${platform.toLowerCase()}-${key}`,
        content_id: `carousel-${set.id}`,
        campaign_id: plan.campaign_id,
        platform,
        caption: carouselCaption(set, platform),
        link: utmLink(platform, set, key),
        media_url: '',
        media_urls: carouselMediaUrls(set),
        scheduled_at: when,
        status: 'APPROVED',
        content_format: 'IMAGE',
        jst_publish_date: key,
        crosspost_group_id: `${plan.crosspost_prefix}${key}`
      }));
    }
  }
  return posts;
}

// リール日の代替カルーセル。火=ユーザー向けセット、金=セラー向けセットを、日付順で順送りにする。
function regularSetFor(parts, key, plan, sets) {
  const slot = carouselSlotIndex(parts, plan);
  if (slot < 0 || !sets.order.length) return null;
  const set = sets.order[slot % sets.order.length];
  if (!isPausedSet(set.id, key)) return set;
  return sets.order.find((candidate) => candidate.id === PAUSED_CAROUSEL_SETS[set.id].replacement) || set;
}
function partsFromDayNumber(dayNumber) {
  const date = new Date(dayNumber * DAY_MS);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday: date.getUTCDay() };
}

export function reelFallbackAudience(weekday, plan = SOCIAL_PLAN_V3) {
  return weekday === plan.reel_weekdays[0] ? 'user' : 'seller';
}
export function buildReelFallbackPosts(now = new Date(), { plan = SOCIAL_PLAN_V3, sets = loadCarouselSets() } = {}) {
  const parts = jstParts(now);
  if (!plan.reel_weekdays.includes(parts.weekday)) return [];
  const key = dateKey(parts);
  if (key < plan.fallback_start_jst) return [];
  const gate = Date.parse(scheduledAt(parts, plan.fallback_gate_jst));
  const when = scheduledAt(parts, plan.reel_publish_jst);
  if (now.getTime() < gate || Date.parse(when) <= now.getTime()) return [];
  const audience = reelFallbackAudience(parts.weekday, plan);
  const pool = sets.order.filter((set, index, all) => set.audience === audience
    && !isPausedSet(set.id, key) && all.findIndex((other) => other.id === set.id) === index);
  if (!pool.length) return [];
  const dayNumber = Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS);
  // 2026-10-14: 旧式は dayNumber % 7（各対象 7 セット）で、同じ曜日は毎週同じセットになっていた
  // （金=ショップ入口・火=大型セール通知が固定、10/13 火と 10/14 水で同じセットが連日）。
  // 週ごとに順送りし、前後 6 日の通常カルーセルと同じセットは避ける。
  const nearby = new Set();
  for (let offset = -6; offset <= 6; offset += 1) {
    const near = partsFromDayNumber(dayNumber + offset);
    const regular = regularSetFor(near, dateKey(near), plan, sets);
    if (regular) nearby.add(regular.id);
  }
  const week = Math.floor(dayNumber / 7);
  const rotated = pool.map((_, index) => pool[(week + index) % pool.length]);
  const set = rotated.find((candidate) => !nearby.has(candidate.id)) || rotated[0];
  return plan.platforms.map((platform) => normalizeSocialPost({
    post_id: `${plan.fallback_post_prefix}-${platform.toLowerCase()}-${key}`,
    content_id: `carousel-${set.id}`,
    campaign_id: plan.campaign_id,
    platform,
    caption: carouselCaption(set, platform),
    link: utmLink(platform, set, key),
    media_url: '',
    media_urls: carouselMediaUrls(set),
    scheduled_at: when,
    status: 'APPROVED',
    content_format: 'IMAGE',
    jst_publish_date: key,
    crosspost_group_id: `${plan.fallback_crosspost_prefix}${key}`
  }));
}

// 今日のリール（Runway 新規生成）が承認済み・投稿中・投稿済みなら true。
// 2026-09-18 本番確認: auto-runway-reel の承認 SQL は jst_publish_date を '' のまま入れる（承認済みの 9/18 行で確認）。
// そのため日付は scheduled_at（UTC）で JST の当日範囲を見る。
export async function reelReadyToday(env, now = new Date(), plan = SOCIAL_PLAN_V3) {
  const parts = jstParts(now);
  const dayStart = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - JST_OFFSET_MS).toISOString();
  const dayEnd = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - JST_OFFSET_MS + DAY_MS).toISOString();
  const row = await env.PRODUCT_DB.prepare(`SELECT COUNT(*) AS n FROM social_post_queue
    WHERE platform='INSTAGRAM' AND campaign_id=?1 AND scheduled_at>=?2 AND scheduled_at<?3 AND status IN ('APPROVED','PUBLISHING','PUBLISHED')`)
    .bind(plan.reel_campaign_id, dayStart, dayEnd).first();
  return Number(row?.n || 0) > 0;
}

// 2026-10-14 大隆さん指示「SNSでオウンドメディアを宣伝して。今後も定期的に自動運用」:
// 毎週木曜 20:00 JST（v3 でリールもカルーセルも無い曜日）に、ホシルの買い物ノート（/media）の紹介を
// Instagram と X に出す。2 セット（値下がり・ランキング×価格）を週ごとに交互。画像はカルーセルと同じ仕組み
// （build-social-carousels.py が文字と図形だけで描く。商品写真・他社ロゴは使わない）。
export const MEDIA_PLAN = Object.freeze({
  campaign_id: 'hoshilu-media-notes',
  weekday: 4,
  publish_jst: Object.freeze([20, 0]),
  start_jst: '2026-10-15',
  set_ids: Object.freeze(['user-media-price-drops', 'user-media-ranking-price']),
  post_prefix: 'hoshilu-media-notes',
  crosspost_prefix: 'hoshilu-media-',
  utm_campaign: 'hoshilu_media_notes',
  // 2026-10-14 大隆さん「スレッズでもオウンドメディアを販促しよう」: Threads は 1 投稿に画像 1 枚（表紙）、リンクは本文の中で押せる
  platforms: Object.freeze(['INSTAGRAM', 'X', 'THREADS'])
});

export function mediaSets(plan = MEDIA_PLAN, doc = carouselDoc) {
  const byId = new Map(doc.sets.map((set) => [set.id, set]));
  return plan.set_ids.map((id) => byId.get(id)).filter(Boolean);
}

function mediaLink(platform, set, key, plan = MEDIA_PLAN) {
  const url = new URL(String(set.link_path || '/media'), 'https://hoshilu.app/');
  url.searchParams.set('utm_source', platform === 'X' ? 'x' : platform === 'THREADS' ? 'threads' : 'instagram');
  url.searchParams.set('utm_medium', 'organic_social');
  url.searchParams.set('utm_campaign', plan.utm_campaign);
  url.searchParams.set('utm_content', `${set.id}_${key.replace(/-/g, '')}`);
  return url.toString();
}

// 木曜 20:00 JST の買い物ノート紹介（今日から days 日分、投稿時刻が未来のものだけ）
export function buildMediaPosts(now = new Date(), days = 14, { plan = MEDIA_PLAN, sets = mediaSets(plan) } = {}) {
  const posts = [];
  if (!sets.length) return posts;
  const start = new Date(now.getTime() + JST_OFFSET_MS);
  start.setUTCHours(0, 0, 0, 0);
  const [sy, sm, sd] = plan.start_jst.split('-').map(Number);
  const epochWeek = Math.floor(Date.UTC(sy, sm - 1, sd) / DAY_MS / 7);
  for (let offset = 0; offset < days; offset += 1) {
    const parts = jstParts(new Date(start.getTime() + offset * DAY_MS - JST_OFFSET_MS));
    if (parts.weekday !== plan.weekday) continue;
    const key = dateKey(parts);
    if (key < plan.start_jst) continue;
    const when = scheduledAt(parts, plan.publish_jst);
    if (Date.parse(when) <= now.getTime()) continue;
    const week = Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS / 7) - epochWeek;
    const set = sets[((week % sets.length) + sets.length) % sets.length];
    for (const platform of plan.platforms) {
      const threads = platform === 'THREADS';
      posts.push(normalizeSocialPost({
        post_id: `${plan.post_prefix}-${platform.toLowerCase()}-${key}`,
        content_id: `media-${set.id}`,
        campaign_id: plan.campaign_id,
        platform,
        caption: threads ? String(set.threads_caption || set.title) : carouselCaption(set, platform),
        link: mediaLink(platform, set, key, plan),
        media_url: threads ? carouselMediaUrls(set)[0] : '',
        media_urls: threads ? '' : carouselMediaUrls(set),
        scheduled_at: when,
        status: 'APPROVED',
        content_format: 'IMAGE',
        jst_publish_date: key,
        crosspost_group_id: `${plan.crosspost_prefix}${key}`
      }));
    }
  }
  return posts;
}

export async function seedMediaQueue(env, now = new Date()) {
  if (env.SOCIAL_AUTOPILOT_ENABLED !== 'true' || !env.PRODUCT_DB) return { enabled: false, planned: 0, inserted: 0 };
  const readiness = await socialPublisherReadinessWithStoredCredentials(env);
  const xReady = xPublishingSafetyReadiness(env).ready && env.X_EVERGREEN_AUTOPILOT_ENABLED === 'true';
  const posts = buildMediaPosts(now).filter((post) => readiness[post.platform]
    && (post.platform !== 'INSTAGRAM' || env.INSTAGRAM_EVERGREEN_AUTOPILOT_ENABLED === 'true')
    && (post.platform !== 'X' || xReady)
    && (post.platform !== 'THREADS' || env.THREADS_EVERGREEN_AUTOPILOT_ENABLED === 'true'));
  let inserted = 0;
  for (const post of posts) {
    const ts = now.toISOString();
    const result = await env.PRODUCT_DB.prepare(`INSERT OR IGNORE INTO social_post_queue
      (post_id,platform,campaign_id,content_id,caption,link,media_url,media_urls,scheduled_at,status,affiliate,
       content_format,jst_publish_date,ai_generated,crosspost_group_id,approved_at,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'APPROVED',0,'IMAGE',?10,0,?11,?12,?12,?12)`)
      .bind(post.post_id, post.platform, post.campaign_id, post.content_id, post.caption, post.link, post.media_url || '', post.media_urls || '',
        post.scheduled_at, post.jst_publish_date, post.crosspost_group_id, ts).run();
    inserted += Number(result?.meta?.changes || 0);
  }
  return { enabled: true, planned: posts.length, inserted };
}

// 旧方針の投稿を v3 の下で投入してよいか。
//  - 22 歳 v2 女優の毎日リール（DAILY_AI_ACTRESS_22 / hoshilu-ai-actress-daily-v1）: 投入しない（9/16 大隆さん決定で停止済み）
//  - Instagram の静止画案内（火木土 20:00）: 投入しない（カルーセルとリールに置き換え）
//  - X の毎日案内: リール日・カルーセル日は投入しない（同じ内容を同日に流すため）。それ以外の日（木・日）は残す
export function policyV3Allows(post, plan = SOCIAL_PLAN_V3) {
  if (!post) return false;
  if (post.campaign_id === plan.campaign_id || post.campaign_id === 'hoshilu-runway-video' || post.campaign_id === MEDIA_PLAN.campaign_id) return true;
  const at = Date.parse(post.scheduled_at);
  if (!Number.isFinite(at)) return true;
  const parts = jstParts(new Date(at));
  if (dateKey(parts) < plan.policy_start_jst) return true;
  if (post.creative_policy === 'DAILY_AI_ACTRESS_22' || post.campaign_id === 'hoshilu-ai-actress-daily-v1') return false;
  const weekday = parts.weekday;
  const v3Day = plan.reel_weekdays.includes(weekday) || plan.carousel_weekdays.includes(weekday);
  if (post.platform === 'INSTAGRAM') return !/-instagram-guide-\d{4}-\d{2}-\d{2}$/u.test(post.post_id) && !v3Day;
  if (post.platform === 'X') return !v3Day;
  return true;
}

// 投入。post_id が主キーなので再実行しても増えない。既存行は触らない（承認済みの行を勝手に書き換えない）。
export async function seedCarouselQueue(env, now = new Date()) {
  if (env.SOCIAL_AUTOPILOT_ENABLED !== 'true' || !env.PRODUCT_DB) return { enabled: false, planned: 0, inserted: 0 };
  const readiness = await socialPublisherReadinessWithStoredCredentials(env);
  const xReady = xPublishingSafetyReadiness(env).ready && env.X_EVERGREEN_AUTOPILOT_ENABLED === 'true';
  const posts = buildCarouselPosts(now).filter((post) => readiness[post.platform]
    && (post.platform !== 'INSTAGRAM' || env.INSTAGRAM_EVERGREEN_AUTOPILOT_ENABLED === 'true')
    && (post.platform !== 'X' || xReady));
  let inserted = 0;
  for (const post of posts) {
    const ts = now.toISOString();
    const result = await env.PRODUCT_DB.prepare(`INSERT OR IGNORE INTO social_post_queue
      (post_id,platform,campaign_id,content_id,caption,link,media_url,media_urls,scheduled_at,status,affiliate,
       content_format,jst_publish_date,ai_generated,crosspost_group_id,approved_at,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,'',?7,?8,'APPROVED',0,'IMAGE',?9,0,?10,?11,?11,?11)`)
      .bind(post.post_id, post.platform, post.campaign_id, post.content_id, post.caption, post.link, post.media_urls,
        post.scheduled_at, post.jst_publish_date, post.crosspost_group_id, ts).run();
    inserted += Number(result?.meta?.changes || 0);
  }
  return { enabled: true, planned: posts.length, inserted };
}

// リール日の代替投入。19:30 JST 以降、今日のリールが承認されていなければカルーセルを 20:15 JST に入れる。
// post_id が主キーなので再実行しても増えない。リールが後から承認されても、この行は消さない
// （同枠の重複は auto-runway-reel 側の competing_slot 判定で止まる）。
export async function seedReelFallbackQueue(env, now = new Date()) {
  if (env.SOCIAL_AUTOPILOT_ENABLED !== 'true' || !env.PRODUCT_DB) return { enabled: false, planned: 0, inserted: 0, reel_ready: false };
  const candidates = buildReelFallbackPosts(now);
  if (!candidates.length) return { enabled: true, planned: 0, inserted: 0, reel_ready: false };
  if (await reelReadyToday(env, now)) return { enabled: true, planned: 0, inserted: 0, reel_ready: true };
  const readiness = await socialPublisherReadinessWithStoredCredentials(env);
  const xReady = xPublishingSafetyReadiness(env).ready && env.X_EVERGREEN_AUTOPILOT_ENABLED === 'true';
  const posts = candidates.filter((post) => readiness[post.platform]
    && (post.platform !== 'INSTAGRAM' || env.INSTAGRAM_EVERGREEN_AUTOPILOT_ENABLED === 'true')
    && (post.platform !== 'X' || xReady));
  let inserted = 0;
  for (const post of posts) {
    const ts = now.toISOString();
    const result = await env.PRODUCT_DB.prepare(`INSERT OR IGNORE INTO social_post_queue
      (post_id,platform,campaign_id,content_id,caption,link,media_url,media_urls,scheduled_at,status,affiliate,
       content_format,jst_publish_date,ai_generated,crosspost_group_id,approved_at,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,'',?7,?8,'APPROVED',0,'IMAGE',?9,0,?10,?11,?11,?11)`)
      .bind(post.post_id, post.platform, post.campaign_id, post.content_id, post.caption, post.link, post.media_urls,
        post.scheduled_at, post.jst_publish_date, post.crosspost_group_id, ts).run();
    inserted += Number(result?.meta?.changes || 0);
  }
  return { enabled: true, planned: posts.length, inserted, reel_ready: false };
}
