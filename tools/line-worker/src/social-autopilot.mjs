import {
  normalizeSocialPost,
  runDueSocialPosts,
  socialPublisherReadinessWithStoredCredentials,
  syncInstagramPublishedPermalinks,
  xPublishingSafetyReadiness
} from './social-publisher.mjs';

const CAMPAIGN_ID = 'hoshilu-official-13mall-v2';
const FEATURE_LAUNCH_DATE = '2026-08-09';
const APPROVED_MODEL_REEL = Object.freeze({
  post_id: 'hoshilu-approved-model-reel-20260812',
  content_id: 'approved-ai-model-reel-20260812',
  platform: 'INSTAGRAM',
  campaign_id: 'hoshilu-ai-model-reel-20260812',
  caption: '「名前は分からないけど、こんな商品が欲しい」をHOSHILUで。覚えている特徴から探して、最大13モールを見比べられます。HOSHILUはこちら → https://hoshilu.app/?utm_source=instagram&utm_medium=organic_social&utm_campaign=hoshilu_ai_model_reel_20260812&utm_content=approved_video 気になった商品をコメントで教えてね。@hoshilu.app ※この動画はAI生成映像を使用しています。 #AI生成',
  link: 'https://hoshilu.app/?utm_source=instagram&utm_medium=organic_social&utm_campaign=hoshilu_ai_model_reel_20260812&utm_content=approved_video',
  media_url: 'https://hoshilu.app/social/hoshilu-approved-model-reel-20260812.mp4',
  scheduled_at: '2026-08-12T14:00:00.000Z',
  status: 'APPROVED'
});
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const X_POSTS = [
  '「名前は分からないけど、こんな商品が欲しい」をそのまま検索。覚えている色・大きさ・使う場所から、探せる言葉に整理します。',
  '楽天市場・Yahoo!ショッピングをまとめて比較。Amazonを含む最大13モールへ同じ検索語を引き継ぎ、見比べられます。',
  '送料込み価格を確認できた商品と、まだ価格・在庫を確認できていない候補を分けて表示。比較の根拠が分かる商品検索です。',
  '気になる商品は「値下がり通知☑」へ。購入したい価格を保存して、確認済み価格の値下がりを待てます。'
];

const INSTAGRAM_POSTS = [
  {
    caption: '名前が分からない商品も、覚えている特徴を話すだけ。HOSHILUが検索語に整理して、最大13モールの入口をまとめます。気になった商品をコメントで教えてね。@hoshilu.app',
    media_url: 'https://hoshilu.app/social/hoshilu-feature-reel-13mall-v1.mp4'
  },
  {
    caption: '色・大きさ・電源・使う場所。覚えている条件を少し足すと、欲しい商品に近づきます。HOSHILUで最大13モールを見比べてみて。気になった商品をコメントで教えてね。@hoshilu.app',
    media_url: 'https://hoshilu.app/social/instagram-reel-cross-market-audio-v2.mp4'
  }
];

const FEATURE_LAUNCH = Object.freeze({
  X: 'HOSHILU正式版を公開。説明から検索語を整理し、楽天市場・Yahoo!ショッピングをまとめて比較。Amazonを含む最大13モールへ同じ検索語でつなぎます。ランキング、AI最安比較、値下がり通知にも対応。 #ホシル #商品検索',
  INSTAGRAM: 'HOSHILU正式版の機能を12秒で紹介します。\n① 説明から検索語を整理\n② 最大13モールを同じ検索語で横断\n③ ランキングとAI最安比較\n④ 値下がり通知☑で購入したい価格を保存\n\n名前が分からない「欲しいもの」をコメントで教えてください。次の検索動画で試します。@hoshilu.app\n#商品検索 #価格比較 #ネットショッピング #買い物好きな人と繋がりたい',
  media_url: 'https://hoshilu.app/social/hoshilu-feature-reel-13mall-v1.mp4'
});

const pad = value => String(value).padStart(2, '0');

function jstDateParts(date) {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay()
  };
}

function dateKey(parts) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function scheduledAt(parts, hour, minute) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour - 9, minute)).toISOString();
}

function campaignLink(platform, date) {
  const query = new URLSearchParams({
    utm_source: platform === 'X' ? 'x' : 'instagram',
    utm_medium: 'social',
    utm_campaign: CAMPAIGN_ID,
    utm_content: date
  });
  return `https://hoshilu.app/?${query}`;
}

export function buildSocialAutopilotPosts(now = new Date(), days = 14) {
  const posts = [];
  const start = new Date(now.getTime() + JST_OFFSET_MS);
  start.setUTCHours(0, 0, 0, 0);
  const xWeekdayContent = new Map([[0, 0], [1, 1], [3, 2], [5, 3]]);
  // 月・火・土の週3回。月曜は正式版の主要機能、火曜は検索の使い方、
  // 土曜は条件追加のコツを訴求し、同じ動画・本文の連投を避ける。
  const instagramWeekdayContent = new Map([[1, 0], [2, 1], [6, 0]]);

  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(start.getTime() + offset * DAY_MS - JST_OFFSET_MS);
    const parts = jstDateParts(day);
    const key = dateKey(parts);
    if (xWeekdayContent.has(parts.weekday)) {
      const contentIndex = xWeekdayContent.get(parts.weekday);
      posts.push(normalizeSocialPost({
        post_id: `${CAMPAIGN_ID}-x-${key}`,
        content_id: `evergreen-x-${contentIndex + 1}`,
        platform: 'X',
        campaign_id: CAMPAIGN_ID,
        caption: key === FEATURE_LAUNCH_DATE ? FEATURE_LAUNCH.X : X_POSTS[contentIndex],
        link: campaignLink('X', key),
        scheduled_at: scheduledAt(parts, 20, 0),
        status: 'APPROVED'
      }));
    }
    if (key === FEATURE_LAUNCH_DATE) {
      posts.push(normalizeSocialPost({
        post_id: `${CAMPAIGN_ID}-instagram-${key}`,
        content_id: 'feature-launch-reel-20260809',
        platform: 'INSTAGRAM',
        campaign_id: CAMPAIGN_ID,
        caption: FEATURE_LAUNCH.INSTAGRAM,
        link: campaignLink('INSTAGRAM', key),
        media_url: FEATURE_LAUNCH.media_url,
        scheduled_at: scheduledAt(parts, 20, 15),
        status: 'APPROVED'
      }));
      continue;
    }
    if (instagramWeekdayContent.has(parts.weekday)) {
      const contentIndex = instagramWeekdayContent.get(parts.weekday);
      const content = INSTAGRAM_POSTS[contentIndex];
      posts.push(normalizeSocialPost({
        post_id: `${CAMPAIGN_ID}-instagram-${key}`,
        content_id: `evergreen-instagram-${contentIndex + 1}`,
        platform: 'INSTAGRAM',
        campaign_id: CAMPAIGN_ID,
        caption: content.caption,
        link: campaignLink('INSTAGRAM', key),
        media_url: content.media_url,
        scheduled_at: scheduledAt(parts, 20, 15),
        status: 'APPROVED'
      }));
    }
  }
  return posts.filter(post => Date.parse(post.scheduled_at) > now.getTime());
}

export async function seedSocialAutopilotQueue(env, now = new Date()) {
  if (env.SOCIAL_AUTOPILOT_ENABLED !== 'true' || !env.PRODUCT_DB) {
    return { enabled: false, planned: 0, inserted: 0 };
  }
  // Instagram credentials are stored encrypted in D1 after OAuth. Checking only
  // static environment variables would incorrectly suppress Instagram posts even
  // though the official account is connected.
  const readiness = await socialPublisherReadinessWithStoredCredentials(env);
  // Historical reel replay is off by default. Enabling stored Instagram OAuth must
  // never make a past/manual reel appear as a new post when its external publication
  // history is not present in this D1 queue.
  const approvedModelReel = env.APPROVED_MODEL_REEL_REPLAY_ENABLED === 'true'
    && now.getTime() >= Date.parse(APPROVED_MODEL_REEL.scheduled_at)
    ? [normalizeSocialPost(APPROVED_MODEL_REEL)]
    : [];
  // Stored OAuth proves connectivity, not approval for a new evergreen series.
  // Keep future Instagram seeding behind an independent opt-in so enabling the
  // official OAuth connection cannot silently publish unrelated reels.
  const evergreen = buildSocialAutopilotPosts(now).filter(post => (
    post.platform !== 'INSTAGRAM' || env.INSTAGRAM_EVERGREEN_AUTOPILOT_ENABLED === 'true'
  ));
  const xPublishingSafety = xPublishingSafetyReadiness(env);
  const posts = [...approvedModelReel, ...evergreen]
    .filter(post => readiness[post.platform]
      && (post.platform !== 'X' || xPublishingSafety.ready));
  let inserted = 0;
  for (const post of posts) {
    const campaignId = post.post_id === APPROVED_MODEL_REEL.post_id
      ? APPROVED_MODEL_REEL.campaign_id
      : CAMPAIGN_ID;
    const result = await env.PRODUCT_DB.prepare(`INSERT INTO social_post_queue
      (post_id,platform,campaign_id,content_id,caption,link,media_url,scheduled_at,status,
       affiliate,approved_at,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'APPROVED',0,?9,?9,?9)
      ON CONFLICT(post_id) DO UPDATE SET content_id=excluded.content_id,
        caption=excluded.caption,link=excluded.link,media_url=excluded.media_url,
        scheduled_at=excluded.scheduled_at,updated_at=excluded.updated_at
      WHERE social_post_queue.status='APPROVED'`)
      .bind(post.post_id, post.platform, campaignId, post.content_id, post.caption,
        post.link, post.media_url, post.scheduled_at, now.toISOString()).run();
    inserted += Number(result?.meta?.changes || 0);
  }
  if (approvedModelReel.length) {
    const retry = await env.PRODUCT_DB.prepare(`UPDATE social_post_queue
      SET status='APPROVED',last_error='',updated_at=?2
      WHERE post_id=?1 AND status='FAILED'
      AND last_error IN ('INSTAGRAM_CONTAINER_IN_PROGRESS','INSTAGRAM_CONTAINER_TIMEOUT')`)
      .bind(APPROVED_MODEL_REEL.post_id, now.toISOString()).run();
    inserted += Number(retry?.meta?.changes || 0);
  }
  return { enabled: true, planned: posts.length, inserted };
}

export async function runSocialAutopilotCycle(env, now = new Date(), fetchImpl = fetch) {
  const seeded = await seedSocialAutopilotQueue(env, now);
  const published = await runDueSocialPosts(env, now, fetchImpl);
  const permalinks = await syncInstagramPublishedPermalinks(env, now, fetchImpl);
  return { seeded, published, permalinks };
}
