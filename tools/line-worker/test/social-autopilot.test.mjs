import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  buildSocialAutopilotPosts,
  buildThreadsAmazonBoostPosts,
  seedSocialAutopilotQueue,
  runSocialAutopilotCycle
} from '../src/social-autopilot.mjs';
import { xWeightedLength } from '../src/social-publisher.mjs';

function jpegDimensions(bytes) {
  assert.equal(bytes.readUInt16BE(0), 0xffd8, 'JPEG SOI');
  for (let offset = 2; offset + 8 < bytes.length;) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const segmentLength = bytes.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]
      .includes(marker)) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7)
      };
    }
    offset += 2 + segmentLength;
  }
  throw new Error('JPEG_DIMENSIONS_NOT_FOUND');
}

test('販促自動運用は14日先までの日次AI女優リールと補助投稿を計画する', () => {
  const posts = buildSocialAutopilotPosts(new Date('2026-08-09T03:00:00.000Z'));
  const daily = posts.filter(post => post.creative_policy === 'DAILY_AI_ACTRESS_22');
  assert.equal(posts.length, 42);
  assert.equal(posts.filter(post => post.platform === 'X').length, 22);
  assert.equal(posts.filter(post => post.platform === 'INSTAGRAM').length, 20);
  assert.equal(daily.length, 28);
  assert.equal(posts.some(post => post.platform === 'TIKTOK'), false);
  assert.equal(new Set(posts.map(post => post.post_id)).size, posts.length);
  assert.equal(new Set(daily.map(post => post.creative_asset_id)).size, 7);
  assert.equal(posts.filter(post => post.platform === 'INSTAGRAM')
    .every(post => typeof post.media_url === 'string' && post.media_url.length > 0), true);
  assert.equal(posts.filter(post => post.platform === 'X')
    .filter(post => post.media_url).every(post => post.media_url.endsWith('.mp4')), true);
  assert.equal(posts.some(post => post.platform === 'X' && !post.media_url), true);
  assert.equal(posts.some(post => post.platform === 'INSTAGRAM'
    && /guide-/.test(post.post_id) && /\.(?:jpg|png)$/.test(post.media_url)), true);
  assert.equal(posts.some(post => /hoshilu-feature-reel-13mall-v1\.mp4|instagram-reel-cross-market-audio-v2\.mp4/u
    .test(post.media_url)), false, '女優なし旧動画は日次枠から除外する');
  for (const post of posts.filter(post => post.campaign_id === 'hoshilu-official-13mall-v2')) {
    assert.match(post.caption, /13モール|検索|商品|条件|価格/);
    assert.doesNotMatch(post.caption, /(?:9|10)モール/);
    assert.equal(new URL(post.link).hostname, 'hoshilu.app');
    const utmCampaign = new URL(post.link).searchParams.get('utm_campaign');
    if (['howto-four-input-search', 'continuous-search', 'guide-search-screen', 'guide-continuous-search']
      .includes(post.content_id)) {
      assert.equal(utmCampaign, 'hoshilu-new-search-launch-20260829');
    } else {
      assert.match(utmCampaign, /13mall/);
    }
  }
});

test('22歳v2 AI女優はJST14日連続で毎日X・Instagramの同一Reelペアを作る', () => {
  const daily = buildSocialAutopilotPosts(new Date('2026-08-29T03:00:00.000Z'), 14)
    .filter(post => post.creative_policy === 'DAILY_AI_ACTRESS_22');
  assert.equal(daily.length, 28);
  assert.equal(new Set(daily.map(post => post.jst_publish_date)).size, 14);
  assert.equal(new Set(daily.map(post => post.creative_asset_id)).size, 7);
  for (const date of new Set(daily.map(post => post.jst_publish_date))) {
    const pair = daily.filter(post => post.jst_publish_date === date);
    assert.deepEqual(new Set(pair.map(post => post.platform)), new Set(['X', 'INSTAGRAM']));
    assert.equal(new Set(pair.map(post => post.media_url)).size, 1);
    assert.equal(new Set(pair.map(post => post.creative_asset_id)).size, 1);
    assert.equal(new Set(pair.map(post => post.scheduled_at)).size, 1);
    assert.equal(new Set(pair.map(post => post.crosspost_group_id)).size, 1);
    assert.equal(pair[0].content_id, `hoshilu-ai-actress-daily-${date}`);
    assert.equal(pair[0].crosspost_group_id, pair[0].content_id);
  }
  for (const post of daily) {
    assert.equal(post.campaign_id, 'hoshilu-ai-actress-daily-v1');
    assert.equal(post.content_format, 'REEL');
    assert.equal(post.ai_generated, 1);
    assert.equal(post.persona_id, 'hoshilu-approved-model-reference-v2');
    assert.equal(post.persona_age, 22);
    assert.equal(post.ai_actress_present, 1);
    assert.match(post.caption, /※この動画はAI生成・AI加工映像です。/u);
    assert.match(post.caption, /#AI生成/u);
    assert.match(post.scheduled_at, /T11:15:00\.000Z$/u);
  }
  const sundays = daily.filter(post => post.creative_asset_id === 'hoshilu_ai_actress_daily_sun_v1');
  assert.equal(sundays.length, 4);
  assert.ok(sundays.every(post => /daily-sun-v1\.mp4$/u.test(post.media_url)));
  const korean = daily.filter(post => post.creative_asset_id === 'hoshilu_ai_actress_daily_tue_v1');
  assert.equal(korean.length, 4);
  assert.ok(korean.every(post => /韓国/u.test(post.caption) && /Qoo10/u.test(post.caption)
    && /SHEIN/u.test(post.caption) && new URL(post.link).pathname === '/buzz'));
});

test('日次AI女優の投稿文は写真・スクショ・投稿URL・BUZZ・曖昧検索を毎日組み合わせる', () => {
  const daily = buildSocialAutopilotPosts(new Date('2026-08-30T00:00:00.000Z'), 7)
    .filter(post => post.creative_policy === 'DAILY_AI_ACTRESS_22');
  const expectedTopics = new Set([
    'PHOTO_SEARCH',
    'SCREENSHOT_SEARCH',
    'SOCIAL_POST_URL_SEARCH',
    'HOSHILU_BUZZ',
    'AMBIGUOUS_SEARCH'
  ]);
  const topicPatterns = new Map([
    ['PHOTO_SEARCH', /撮った写真|カメラで撮/u],
    ['SCREENSHOT_SEARCH', /スクショ/u],
    ['SOCIAL_POST_URL_SEARCH', /公開(?:SNS)?投稿URL/u],
    ['HOSHILU_BUZZ', /HOSHILU BUZZ/u],
    ['AMBIGUOUS_SEARCH', /名前が分からない|名前の分からない|うろ覚え/u]
  ]);
  const topicDates = new Map([...expectedTopics].map(topic => [topic, new Set()]));
  const dates = new Set(daily.map(post => post.jst_publish_date));

  assert.equal(daily.length, 14);
  assert.equal(dates.size, 7);
  for (const date of dates) {
    const pair = daily.filter(post => post.jst_publish_date === date);
    assert.equal(pair.length, 2);
    assert.deepEqual(pair[0].caption_topics, pair[1].caption_topics);
    assert.ok(pair[0].caption_topics.length >= 2, `${date}: two or more topics`);
    for (const post of pair) {
      for (const topic of post.caption_topics) {
        assert.ok(expectedTopics.has(topic), `${date}: unknown topic ${topic}`);
        assert.match(post.caption, topicPatterns.get(topic), `${date}/${post.platform}: ${topic}`);
      }
    }
    for (const topic of pair[0].caption_topics) topicDates.get(topic).add(date);
  }
  assert.deepEqual(new Set(daily.flatMap(post => post.caption_topics)), expectedTopics);
  assert.equal(topicDates.get('PHOTO_SEARCH').size, 4);
  assert.equal(topicDates.get('SCREENSHOT_SEARCH').size, 3);
  assert.equal(topicDates.get('SOCIAL_POST_URL_SEARCH').size, 3);
  assert.equal(topicDates.get('HOSHILU_BUZZ').size, 5);
  assert.equal(topicDates.get('AMBIGUOUS_SEARCH').size, 5);
  assert.equal(daily.filter(post => new URL(post.link).pathname === '/buzz').length, 10,
    'BUZZ直行は映像内容と一致する7日中5日のX/Instagramペア');

  const yearBoundary = buildSocialAutopilotPosts(new Date('2026-12-29T00:00:00.000Z'), 7)
    .filter(post => post.creative_policy === 'DAILY_AI_ACTRESS_22');
  assert.equal(new Set(yearBoundary.map(post => post.jst_publish_date)).size, 7);
  assert.deepEqual(new Set(yearBoundary.flatMap(post => post.caption_topics)), expectedTopics,
    '年をまたぐ7日間も全5テーマを維持する');
  assert.equal(yearBoundary.filter(post => new URL(post.link).pathname === '/buzz').length, 10);
});

test('非BUZZ販促はカメラ・画像・公開投稿URL・一言・継続検索を過剰表現なしで訴求する', () => {
  const posts = buildSocialAutopilotPosts(new Date('2026-08-24T00:00:00.000Z'), 28);
  for (const platform of ['X', 'INSTAGRAM']) {
    const campaign = posts.filter((post) => post.platform === platform && new URL(post.link).pathname === '/');
    assert.ok(campaign.some((post) => /撮った写真|写真・スクショ|カメラで撮/u.test(post.caption)), `${platform}: camera copy`);
    assert.ok(campaign.some((post) => /スクショ/u.test(post.caption)), `${platform}: screenshot copy`);
    assert.ok(campaign.some((post) => /公開(?:SNS)?投稿.*URL|公開SNS投稿のURL/u.test(post.caption)), `${platform}: URL copy`);
    assert.ok(campaign.some((post) => /一言/u.test(post.caption)), `${platform}: remembered phrase copy`);
    assert.ok(campaign.some((post) => /見つかるまで探す/u.test(post.caption)), `${platform}: continuous search copy`);
    assert.ok(campaign.every((post) => !/必ず(?:特定|見つかる)|全SNS対応/u.test(post.caption)));
  }
  // 2026-09-03 方向転換で Threads の主訴求は「まとめて探す」になり、4入力の説明は
  // 副次テーマになった。1周(35日)のどこかで必ず出ることを担保する。
  const threads = buildThreadsAmazonBoostPosts(new Date('2026-08-17T03:00:00.000Z'), 35);
  assert.ok(threads.some((post) => /カメラで撮る.*スクショ.*公開SNS投稿URL.*一言/u.test(post.caption)));
  const searchGuide = posts.find((post) => post.content_id === 'guide-search-screen');
  assert.ok(searchGuide, '4入力のInstagram操作案内が計画されていない');
  assert.doesNotMatch(searchGuide.media_url, /hoshilu-product-screen-v1\.jpg/u);
  assert.match(searchGuide.media_url, /hoshilu-visual-search-launch-v1\.png/u);
  assert.match(searchGuide.caption, /EXIF・位置情報/u);
  assert.match(searchGuide.caption, /Google Cloud Vision.*Google Gemini API.*場合/u);
  assert.equal(new URL(searchGuide.link).searchParams.get('q'), null, '写真検索の送客先に他人の検索語を入れない');
  const visualX = posts.find((post) => post.content_id === 'howto-four-input-search');
  assert.ok(visualX, '4入力のX投稿が計画されていない');
  assert.equal(new URL(visualX.link).searchParams.get('q'), null, '写真検索の送客先に他人の検索語を入れない');
  assert.match(visualX.caption, /非対応・非公開投稿は画像か一言を追加。.*#HOSHILU/u,
    'Xの文字数調整で最後の注意書きを途中切れにしない');
  assert.ok(xWeightedLength(visualX.caption) + 1 + 23 <= 280,
    'Xの本文・改行・固定長URLを合わせて重み付き280以内');
  const continuousGuide = posts.find((post) => post.content_id === 'guide-continuous-search');
  assert.ok(continuousGuide, '見つかるまで探すのInstagram操作案内が計画されていない');
  assert.match(continuousGuide.media_url, /hoshilu-continuous-search-v1\.png/u);
  for (const post of posts.filter((item) => [
    'howto-four-input-search', 'continuous-search', 'guide-search-screen', 'guide-continuous-search'
  ].includes(item.content_id))) {
    assert.equal(new URL(post.link).searchParams.get('utm_campaign'), 'hoshilu-new-search-launch-20260829');
    assert.equal(new URL(post.link).searchParams.get('q'), null,
      '機能紹介から無関係な例示検索語へ着地させない');
  }
});

test('新検索ローンチ投稿は初回14日キューへ正しい日付・UTM・画像で入る', () => {
  const posts = buildSocialAutopilotPosts(new Date('2026-08-29T17:00:00.000Z'), 14);
  const launch = posts.filter((post) => [
    'howto-four-input-search', 'continuous-search', 'guide-search-screen', 'guide-continuous-search'
  ].includes(post.content_id));
  assert.deepEqual(launch.map((post) => [post.scheduled_at, post.platform, post.content_id]), [
    ['2026-08-30T11:00:00.000Z', 'X', 'howto-four-input-search'],
    ['2026-09-01T11:00:00.000Z', 'X', 'continuous-search'],
    ['2026-09-01T11:00:00.000Z', 'INSTAGRAM', 'guide-search-screen'],
    ['2026-09-05T11:00:00.000Z', 'INSTAGRAM', 'guide-continuous-search'],
    ['2026-09-10T11:00:00.000Z', 'INSTAGRAM', 'guide-search-screen']
  ]);
  assert.ok(launch.every((post) => new URL(post.link).searchParams.get('utm_campaign')
    === 'hoshilu-new-search-launch-20260829'));
  assert.ok(launch.every((post) => post.campaign_id === 'hoshilu-new-search-launch-20260829'));
});

test('8月29日夕方の本番反映でも同じXローンチ文を2夜連続で予約しない', () => {
  const posts = buildSocialAutopilotPosts(new Date('2026-08-29T08:42:00.000Z'), 14);
  const xLaunch = posts.filter((post) => post.platform === 'X'
    && post.campaign_id === 'hoshilu-new-search-launch-20260829');
  assert.deepEqual(xLaunch.map((post) => [post.scheduled_at, post.content_id]), [
    ['2026-08-30T11:00:00.000Z', 'howto-four-input-search'],
    ['2026-09-01T11:00:00.000Z', 'continuous-search']
  ]);
  const tonight = posts.find((post) => post.post_id
    === 'hoshilu-official-13mall-v2-x-guide-2026-08-29');
  assert.equal(tonight?.content_id, 'buzz-shelves-intro');
  assert.equal(tonight?.campaign_id, 'hoshilu-official-13mall-v2');
});

test('新検索のInstagram画像は実在する1080x1350 PNGである', () => {
  const assets = [
    {
      filename: 'hoshilu-visual-search-launch-v1.png',
      svg: 'hoshilu_visual_search_launch_1080x1350.svg',
      pngSha256: '412e277b9cc46b0b04a0a320e3025d7c98848da24d714d3526b0bb8aa5d1b6be',
      svgSha256: 'de202de23787c29670ab921c7aa09cc4eccfeceb7869ba7c6b60e733809cf536',
      required: ['カメラで撮る', '画像を選ぶ', '投稿URLを追加', '一言を入力', 'AIが特徴理解を補助', '購入先候補へ']
    },
    {
      filename: 'hoshilu-continuous-search-v1.png',
      svg: 'hoshilu_continuous_search_1080x1350.svg',
      pngSha256: 'b5458ab8d0c2f992aaa74775bc2b1d4779d7b3fe8e9708636055786cc14ed398',
      svgSha256: 'd45a988c93516e9d5325b9df70205fbc69752ac26213470b8bd95f5147ceb369',
      required: ['無料会員で有効にすると', '新しく一致', '無料会員で探し続ける']
    }
  ];
  for (const asset of assets) {
    const { filename } = asset;
    const png = readFileSync(new URL(`../public/social/${filename}`, import.meta.url));
    const svg = readFileSync(new URL(`../../../marketing/social/creatives/${asset.svg}`, import.meta.url));
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), 1080, `${filename}: width`);
    assert.equal(png.readUInt32BE(20), 1350, `${filename}: height`);
    assert.ok(png.length > 100_000, `${filename}: unexpectedly small`);
    assert.equal(createHash('sha256').update(png).digest('hex'), asset.pngSha256, `${filename}: stale PNG`);
    assert.equal(createHash('sha256').update(svg).digest('hex'), asset.svgSha256, `${asset.svg}: unexpected source change`);
    for (const copy of asset.required) assert.match(svg.toString('utf8'), new RegExp(copy, 'u'));
  }
});

test('Instagramは日曜を含む毎日20時15分にAI女優リールを計画する', () => {
  const posts = buildSocialAutopilotPosts(new Date('2026-08-10T00:00:00.000Z'), 7)
    .filter(post => post.platform === 'INSTAGRAM' && post.content_format === 'REEL');
  assert.deepEqual(posts.map(post => post.scheduled_at), [
    '2026-08-10T11:15:00.000Z',
    '2026-08-11T11:15:00.000Z',
    '2026-08-12T11:15:00.000Z',
    '2026-08-13T11:15:00.000Z',
    '2026-08-14T11:15:00.000Z',
    '2026-08-15T11:15:00.000Z',
    '2026-08-16T11:15:00.000Z'
  ]);
  assert.equal(posts.every(post => post.media_url.endsWith('.mp4')), true);
});

test('土曜の操作案内は承認済み質問カードと同じ検索説明をする', () => {
  const post = buildSocialAutopilotPosts(new Date('2026-08-22T10:59:00.000Z'), 1)
    .find(item => item.platform === 'INSTAGRAM' && /instagram-guide/u.test(item.post_id));
  assert.ok(post);
  assert.equal(post.media_url, 'https://hoshilu.app/social/instagram-want-poll-v1.png');
  assert.match(post.caption, /商品名が分からなくても|見た場所・色・形・使い方/u);
  assert.doesNotMatch(post.caption, /値下がり通知|購入希望価格|買いたい価格/u);
});

test('価格通知の販促は希望価格閾値とAPI確認価格だけを説明する', () => {
  const posts = buildSocialAutopilotPosts(new Date('2026-08-24T00:00:00.000Z'), 28);
  const targetPricePosts = posts.filter((post) => /購入希望価格/u.test(post.caption));
  assert.ok(targetPricePosts.length > 0);
  assert.ok(targetPricePosts.some((post) => /APIで確認できた価格.*(?:以下|条件)/u.test(post.caption)));
  assert.ok(posts.every((post) => !/値下がり通知|24時間監視|クーポン.*再入荷/u.test(post.caption)));
});

test('Instagram定常投稿はBUZZ専用ビジュアルと/buzz送客を含む', () => {
  const posts = buildSocialAutopilotPosts(new Date('2026-08-20T00:00:00.000Z'), 30)
    .filter(post => post.platform === 'INSTAGRAM' && /^buzz-image-/.test(post.content_id));
  assert.ok(posts.length >= 2);
  for (const post of posts) {
    assert.equal(new URL(post.link).pathname, '/buzz');
    assert.match(post.media_url, /hoshilu-buzz-ranking-v1\.jpg$/u);
    assert.match(post.caption, /1位|ランキング/u);
    assert.doesNotMatch(post.caption, /最安|No\.?1|Z世代/u);
  }
});

test('Instagram BUZZ画像はMeta公開APIの4:5〜1.91:1範囲内に収まる', () => {
  const bytes = readFileSync(new URL('../public/social/hoshilu-buzz-ranking-v1.jpg', import.meta.url));
  const { width, height } = jpegDimensions(bytes);
  const aspectRatio = width / height;
  assert.equal(width, 1255);
  assert.equal(height, 1568);
  assert.ok(aspectRatio >= 4 / 5 && aspectRatio <= 1.91, `aspect ratio: ${aspectRatio}`);
});

test('日次AI動画は7曜日の内容と送客先を素材に合わせ、補助画像はBUZZを織り交ぜる', () => {
  const posts = buildSocialAutopilotPosts(new Date('2026-08-24T00:00:00.000Z'), 28);
  const videos = posts.filter((post) => post.creative_policy === 'DAILY_AI_ACTRESS_22');
  assert.equal(videos.length, 56);
  assert.equal(new Set(videos.map(post => post.creative_asset_id)).size, 7);
  assert.equal(videos.some(post => /hoshilu-feature-reel|instagram-reel-cross-market/u.test(post.media_url)), false);
  const images = posts.filter((post) => post.platform === 'INSTAGRAM' && /\.(?:jpg|png)$/u.test(post.media_url));
  const buzzImages = images.filter((post) => new URL(post.link).pathname === '/buzz');
  assert.equal(buzzImages.length * 2, images.length, 'Instagram image BUZZ ratio');
  assert.ok(buzzImages.every((post) => /hoshilu-buzz-ranking-v1\.jpg$/u.test(post.media_url)));
  for (const platform of ['X', 'INSTAGRAM']) {
    const platformPosts = posts.filter(post => post.platform === platform);
    const buzzPosts = platformPosts.filter(post => new URL(post.link).pathname === '/buzz');
    assert.ok(buzzPosts.length / platformPosts.length >= 0.5, `${platform}: BUZZ is at least half`);
  }
});

test('X全投稿は任意の連続7日でもBUZZ送客を半分以上に保つ', () => {
  const start = Date.parse('2026-08-30T00:00:00.000Z');
  for (let offset = 0; offset < 90; offset += 1) {
    const now = new Date(start + offset * 24 * 60 * 60 * 1000);
    const posts = buildSocialAutopilotPosts(now, 7).filter(post => post.platform === 'X');
    const buzz = posts.filter(post => new URL(post.link).pathname === '/buzz');
    assert.ok(buzz.length * 2 >= posts.length,
      `${now.toISOString().slice(0, 10)}: BUZZ ${buzz.length}/${posts.length}`);
  }
});

test('承認済みセラー投稿はX非動画枠へ少量だけ入り/for-sellersへ送客する', () => {
  const posts = buildSocialAutopilotPosts(new Date('2026-08-22T00:00:00.000Z'), 180)
    .filter(post => post.platform === 'X' && /-x-guide-/u.test(post.post_id));
  const sellerPosts = posts.filter(post => /^seller-/u.test(post.content_id));
  assert.ok(sellerPosts.length > 0);
  assert.ok(sellerPosts.length / posts.length >= 0.1);
  assert.ok(sellerPosts.length / posts.length <= 0.2);
  assert.deepEqual(new Set(sellerPosts.map(post => post.content_id)), new Set([
    'seller-natural-listing', 'seller-demand-insight', 'seller-business-simple'
  ]));
  for (const post of sellerPosts) {
    const url = new URL(post.link);
    assert.equal(url.pathname, '/for-sellers');
    assert.equal(url.searchParams.get('utm_source'), 'x');
    assert.match(url.searchParams.get('utm_campaign'), /13mall/u);
    assert.doesNotMatch(post.caption, /No\.?1|最安|必ず売れる|売上アップ/u);
  }
});

test('X補助枠はBUZZ比率とセラー差し込みを守りながら各テーマを公平に循環する', () => {
  const groups = [
    ['buzz-shelves-intro', 'buzz-budget-shelves', 'buzz-korean-beauty', 'buzz-open-first'],
    ['howto-price-compare', 'howto-four-input-search', 'continuous-search', 'howto-price-alert', 'search-no-name-needed'],
    ['seller-natural-listing', 'seller-demand-insight', 'seller-business-simple']
  ];
  const posts = buildSocialAutopilotPosts(new Date('2026-09-14T00:00:00.000Z'), 630)
    .filter((post) => post.platform === 'X' && /-x-guide-/u.test(post.post_id));
  for (const ids of groups) {
    const counts = ids.map((id) => posts.filter((post) => post.content_id === id).length);
    assert.ok(counts.every((count) => count > 0), JSON.stringify(counts));
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, JSON.stringify(counts));
  }
});

// 2026-09-03: SNS流入はThreadsだけが実数を出している(30日でThreads 30セッション
// に対しX 6・Instagram 5)ため、枠を1日2本から4本へ増やした。
test('Amazon優先Threadsローテーションは1日4本、別々の時刻に別内容を計画する', () => {
  const posts = buildThreadsAmazonBoostPosts(new Date('2026-08-17T03:00:00.000Z'));
  // 14日 × 4枠 - 当日の9:30 JST(03:00 UTC時点で経過済み)1本。
  assert.equal(posts.length, 55);
  assert.equal(posts.every(post => post.platform === 'THREADS'), true);
  assert.equal(new Set(posts.map(post => post.post_id)).size, posts.length);
  assert.equal(posts.every(post => post.campaign_id === 'hoshilu-threads-amazon-boost-v1'), true);
  assert.equal(posts.every(post => !/[¥$]\s?\d|\d+\s?円/.test(post.caption)), true, '本文に価格を直書きしない');

  // 昼枠のpost_idは接尾辞なし(1日1本だった頃のキュー行をそのまま更新できる)。
  // 同じ日に同じ枠が重複して積まれないことを固定する。
  const slots = [
    ['T00:30:00.000Z', '-am', 13],
    ['T03:30:00.000Z', '', 14],
    ['T11:30:00.000Z', '-pm', 14],
    ['T13:30:00.000Z', '-night', 14]
  ];
  for (const [suffixUtc, idSuffix, expected] of slots) {
    const slotPosts = posts.filter(post => post.scheduled_at.endsWith(suffixUtc));
    assert.equal(slotPosts.length, expected, suffixUtc);
    for (const post of slotPosts) {
      assert.equal(post.post_id.endsWith(idSuffix), true, post.post_id);
    }
  }

  // 同じ日の各枠は別内容。翌日も次のローテーションへ進む。
  assert.notEqual(posts[0].content_id, posts[1].content_id);
  assert.notEqual(posts[0].content_id, posts[2].content_id);
});

test('Amazon優先Threads文面は検索先を開くだけと全投稿で明示する', () => {
  const posts = buildThreadsAmazonBoostPosts(new Date('2026-08-17T03:00:00.000Z'), 10);
  const affiliate = posts.filter((post) => post.affiliate);
  assert.ok(affiliate.length > 0);
  for (const post of affiliate) {
    assert.match(post.caption, /HOSHILUからAmazonを含む検索先を開けます/u, post.content_id);
    assert.match(post.caption, /Amazonの商品候補・価格・在庫・レビューはリンク先で確認してください/u, post.content_id);
    assert.doesNotMatch(post.caption, /Amazonを含む(?:複数|各|取扱|対応)[^。]*(?:見比べ|まとめて|比較|確認|候補|在庫)/u, post.content_id);
    assert.doesNotMatch(post.caption, /これAmazon[^。]*他モール[^。]*一緒に確認/u, post.content_id);
  }
});

test('Amazon優先Threadsローテーションはリンク付きのみをアフィリエイトとして扱う', () => {
  const posts = buildThreadsAmazonBoostPosts(new Date('2026-08-17T03:00:00.000Z'));
  const affiliate = posts.filter(post => post.affiliate);
  const organic = posts.filter(post => !post.affiliate);

  // 運用設計書v1.0第2部: 宣伝botに見えないよう非アフィリエイト投稿を混ぜる。
  // 20本中5本(25%)がリンク無しなので、どの14日を切り出しても必ず両方入る。
  assert.ok(organic.length > 0, '非アフィリエイト投稿が1本も計画されていない');
  assert.ok(affiliate.length > organic.length, 'アフィリエイト投稿が主体であること');

  for (const post of affiliate) {
    const url = new URL(post.link);
    assert.equal(url.hostname, 'hoshilu.app');
    assert.equal(url.searchParams.get('utm_source'), 'threads');
    assert.equal(url.searchParams.get('utm_campaign'), 'hoshilu-threads-amazon-boost-v1');
    assert.ok(url.searchParams.get('q'), '検索語(q)が必ず含まれる');
    assert.match(post.caption, /アフィリエイト広告/, 'アフィリエイト投稿にはPR表記が要る');
  }
  for (const post of organic) {
    assert.equal(post.link, '', '非アフィリエイト投稿にリンクを付けない');
    // 広告ではないのにPR表記が付く、という逆向きの不正確さも防ぐ。
    assert.doesNotMatch(post.caption, /アフィリエイト/, '非アフィリエイト投稿にPR表記を付けない');
  }
});

test('Threads日次ローテーションは10日間(20本)で同じ文面を繰り返さない', () => {
  const posts = buildThreadsAmazonBoostPosts(new Date('2026-08-17T03:00:00.000Z'), 10);
  // 1日4本 × 10日 = 40本(当日9:30 JSTは経過済みなので39本)。文面プールは60本
  // あるので、枠を増やしても10日以内に同じ文面が再投稿されないことは維持する。
  assert.equal(posts.length, 39);
  assert.equal(new Set(posts.map(post => post.content_id)).size, 39, '10日以内に同じ文面が再投稿されている');
});

// 2026-09-03 成長戦略・方向転換指示書 §6〜§8: SNSの主訴求を「Amazonも楽天も
// Qoo10も見るの、面倒じゃない？」→「HOSHILUならまとめて探せる。」へ。
// 比率の目安は まとめて検索60% / BUZZ20% / 写真・スクショ・曖昧検索20%。
test('Threads日次枠の6割前後が「まとめて探す」主訴求になっている', () => {
  const posts = buildThreadsAmazonBoostPosts(new Date('2026-09-04T00:00:00.000Z'), 28);
  const cross = posts.filter((post) => /^cross-market-/u.test(post.content_id));
  const share = cross.length / posts.length;
  assert.ok(share >= 0.5 && share <= 0.7, `主訴求の比率が目安から外れている: ${Math.round(share * 100)}%`);
  for (const post of cross) {
    assert.equal(post.platform, 'THREADS');
    // 価格・在庫・順位・最安は本文に書かない(規約・§47)。
    assert.doesNotMatch(post.caption, /最安|円|セール|在庫あり|第1位/u);
    // Amazon導線の開示は他のThreads枠と同じものを必ず付ける。
    assert.match(post.caption, /HOSHILUからAmazonを含む検索先を開けます/u);
    assert.ok(new URL(post.link).searchParams.get('q'));
  }
  // 差別化(名前クイズ)も残す。
  assert.ok(posts.some((post) => /^name-quiz-/u.test(post.content_id)));
});

test('Amazon優先Threadsローテーションは同じ計画対象期間なら毎回同じ投稿を計画する(冪等)', () => {
  // どちらも当日12:30 JST(03:30 UTC)の投稿枠より前なので、計画対象の
  // post_id集合は完全に一致するはず(過去分は自動的に取り除かれる)。
  const first = buildThreadsAmazonBoostPosts(new Date('2026-08-17T02:00:00.000Z'));
  const second = buildThreadsAmazonBoostPosts(new Date('2026-08-17T03:00:00.000Z'));
  assert.deepEqual(first.map(post => post.post_id), second.map(post => post.post_id));
});

test('販促自動運用は無効時にキューを書き換えない', async () => {
  let prepared = 0;
  const result = await seedSocialAutopilotQueue({
    PRODUCT_DB: { prepare() { prepared += 1; } }
  }, new Date('2026-08-09T03:00:00.000Z'));
  assert.deepEqual(result, { enabled: false, planned: 0, inserted: 0 });
  assert.equal(prepared, 0);
});

test('販促自動運用は設定済み媒体だけをAPPROVEDで冪等登録する', async () => {
  const rows = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    INSTAGRAM_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    X_USER_ACCESS_TOKEN: 'x-token',
    X_PUBLISHING_ENABLED: 'true',
    X_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    X_EXPECTED_USERNAME: 'hoshilu_app',
    INSTAGRAM_ACCESS_TOKEN: 'ig-token',
    INSTAGRAM_ACCOUNT_ID: 'ig-account',
    PRODUCT_DB: {
      prepare(sql) {
        assert.match(sql, /ON CONFLICT\(post_id\) DO UPDATE/);
        return {
          bind(...values) {
            return {
              async run() {
                rows.push(values);
                return { meta: { changes: 1 } };
              }
            };
          }
        };
      }
    }
  };
  const result = await seedSocialAutopilotQueue(env, new Date('2026-08-09T03:00:00.000Z'));
  assert.deepEqual(result, { enabled: true, planned: 42, inserted: 42 });
  assert.equal(rows.some(row => row[1] === 'TIKTOK'), false);
  assert.deepEqual(new Set(rows.map(row => row[2])), new Set([
    'hoshilu-official-13mall-v2', 'hoshilu-ai-actress-daily-v1',
    'hoshilu-new-search-launch-20260829'
  ]));
  assert.equal(rows.filter(row => /\.mp4$/u.test(row[6])).every(row => row[10] === 1), true);
  assert.equal(rows.filter(row => !/\.mp4$/u.test(row[6])).every(row => row[10] === 0), true);
  assert.equal(rows.every(row => row[11] === 'APPROVED'), true);
  const daily = rows.filter(row => row[2] === 'hoshilu-ai-actress-daily-v1');
  assert.equal(daily.length, 28);
  assert.equal(daily.every(row => row[12] === 1), true);
  assert.equal(daily.every(row => /^hoshilu_ai_actress_daily_(?:sun|mon|tue|wed|thu|fri|sat)_v1$/u
    .test(row[13])), true);
  assert.equal(daily.every(row => row[14] === 'REEL'
    && row[15] === 'DAILY_AI_ACTRESS_22' && row[17] === 1), true);
  assert.equal(daily.every(row => row[3] === row[18]), true);
});

test('14日分が50件を超えてもキュー補充は1回のD1 batchにまとめる', async () => {
  let batchCalls = 0;
  let batchedStatements = 0;
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    X_USER_ACCESS_TOKEN: 'x-token',
    X_PUBLISHING_ENABLED: 'true',
    X_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    X_EXPECTED_USERNAME: 'hoshilu_app',
    INSTAGRAM_ACCESS_TOKEN: 'ig-token',
    INSTAGRAM_ACCOUNT_ID: 'ig-account',
    INSTAGRAM_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    THREADS_ACCESS_TOKEN: 'threads-token',
    THREADS_USER_ID: '123',
    THREADS_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    PRODUCT_DB: {
      prepare(sql) {
        return { bind(...values) { return { sql, values }; } };
      },
      async batch(statements) {
        batchCalls += 1;
        batchedStatements = statements.length;
        return statements.map(() => ({ meta: { changes: 1 } }));
      }
    }
  };
  const result = await seedSocialAutopilotQueue(env, new Date('2026-08-29T03:00:00.000Z'));
  assert.ok(result.planned > 50);
  assert.equal(result.inserted, result.planned);
  assert.equal(batchCalls, 1);
  assert.equal(batchedStatements, result.planned);
});

test('14日分が50件を超えてもキュー補充は1回のD1 batchにまとめる', async () => {
  let batchCalls = 0;
  let batchedStatements = 0;
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    X_USER_ACCESS_TOKEN: 'x-token',
    X_PUBLISHING_ENABLED: 'true',
    X_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    X_EXPECTED_USERNAME: 'hoshilu_app',
    INSTAGRAM_ACCESS_TOKEN: 'ig-token',
    INSTAGRAM_ACCOUNT_ID: 'ig-account',
    INSTAGRAM_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    THREADS_ACCESS_TOKEN: 'threads-token',
    THREADS_USER_ID: '123',
    THREADS_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    PRODUCT_DB: {
      prepare(sql) {
        return { bind(...values) { return { sql, values }; } };
      },
      async batch(statements) {
        batchCalls += 1;
        batchedStatements = statements.length;
        return statements.map(() => ({ meta: { changes: 1 } }));
      }
    }
  };
  const result = await seedSocialAutopilotQueue(env, new Date('2026-08-29T03:00:00.000Z'));
  assert.ok(result.planned > 50);
  assert.equal(result.inserted, result.planned);
  assert.equal(batchCalls, 1);
  assert.equal(batchedStatements, result.planned);
});

test('公開履歴がある完成動画の後日再利用はREVIEW_REQUIREDへ隔離するSQLを使う', async () => {
  const statements = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    X_USER_ACCESS_TOKEN: 'x-token',
    X_PUBLISHING_ENABLED: 'true',
    X_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    X_EXPECTED_USERNAME: 'hoshilu_app',
    PRODUCT_DB: {
      prepare(sql) {
        statements.push(sql);
        return {
          bind() {
            return { async run() { return { meta: { changes: 1 } }; } };
          }
        };
      }
    }
  };
  await seedSocialAutopilotQueue(env, new Date('2026-08-10T00:00:00.000Z'));
  const insert = statements.find(sql => /INSERT INTO social_post_queue/.test(sql));
  assert.ok(insert);
  assert.match(insert, /previous\.media_url=\?7/u);
  assert.match(insert, /previous\.scheduled_at<\?8/u);
  assert.match(insert, /THEN 'REVIEW_REQUIRED' ELSE \?12/u);
  assert.match(insert, /MEDIA_REUSE_REVIEW_REQUIRED/u);
  assert.match(insert, /social_post_queue\.status IN \('APPROVED','REVIEW_REQUIRED'\)/u);
  assert.match(insert, /SOCIAL_QUEUE_QUARANTINED_DUPLICATE_CAMPAIGN_20260813/u);
  assert.match(insert, /social_post_queue\.external_post_id=''/u);
  assert.match(insert, /social_post_queue\.published_at=''/u);
  assert.match(insert, /creative_asset_id,content_format,creative_policy,jst_publish_date/u);
  assert.match(insert, /ai_generated,crosspost_group_id/u);
});

test('台帳承認済み7曜日AI女優だけは週次再利用をAPPROVEDで維持する', async (t) => {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(`CREATE TABLE social_post_queue (
    post_id TEXT PRIMARY KEY, platform TEXT NOT NULL, campaign_id TEXT NOT NULL DEFAULT '',
    content_id TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL, link TEXT NOT NULL DEFAULT '',
    media_url TEXT NOT NULL DEFAULT '', scheduled_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED', affiliate INTEGER NOT NULL DEFAULT 0,
    creative_asset_id TEXT NOT NULL DEFAULT '', content_format TEXT NOT NULL DEFAULT '',
    creative_policy TEXT NOT NULL DEFAULT '', jst_publish_date TEXT NOT NULL DEFAULT '',
    ai_generated INTEGER NOT NULL DEFAULT 0, crosspost_group_id TEXT NOT NULL DEFAULT '',
    external_post_id TEXT NOT NULL DEFAULT '', last_error TEXT NOT NULL DEFAULT '',
    approved_at TEXT NOT NULL DEFAULT '', published_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, platform_job_id TEXT NOT NULL DEFAULT ''
  )`);
  class Statement {
    constructor(sql) { this.statement = sqlite.prepare(sql); this.values = []; }
    bind(...values) { this.values = values; return this; }
    async run() {
      const result = this.statement.run(...this.values);
      return { meta: { changes: result.changes } };
    }
    async first() { return this.statement.get(...this.values) || null; }
    async all() { return { results: this.statement.all(...this.values) }; }
  }
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    X_USER_ACCESS_TOKEN: 'x-token',
    X_PUBLISHING_ENABLED: 'true',
    X_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    X_EXPECTED_USERNAME: 'hoshilu_app',
    PRODUCT_DB: { prepare(sql) { return new Statement(sql); } }
  };
  const now = new Date('2026-08-10T00:00:00.000Z');
  await seedSocialAutopilotQueue(env, now);
  const videoRows = sqlite.prepare(`SELECT post_id,platform,scheduled_at,status,last_error,approved_at,
      creative_asset_id,content_format,creative_policy,jst_publish_date,ai_generated,crosspost_group_id,content_id
    FROM social_post_queue WHERE media_url LIKE '%.mp4' ORDER BY scheduled_at,platform`).all();
  assert.equal(videoRows.length, 14);
  assert.equal(videoRows.every(row => row.status === 'APPROVED'), true);
  assert.equal(new Set(videoRows.map(row => row.creative_asset_id)).size, 7);
  assert.equal(videoRows.every(row => row.content_format === 'REEL'
    && row.creative_policy === 'DAILY_AI_ACTRESS_22' && row.ai_generated === 1), true);
  assert.equal(videoRows.every(row => row.content_id === row.crosspost_group_id), true);

  const expedited = videoRows.find(row => row.platform === 'X'
    && row.jst_publish_date === '2026-08-10');
  assert.ok(expedited);
  sqlite.prepare(`UPDATE social_post_queue SET scheduled_at='2000-01-01T00:00:00.000Z'
    WHERE post_id=?1`).run(expedited.post_id);
  await seedSocialAutopilotQueue(env, now);
  assert.equal(sqlite.prepare(`SELECT scheduled_at FROM social_post_queue WHERE post_id=?1`)
    .get(expedited.post_id).scheduled_at, '2000-01-01T00:00:00.000Z');

  sqlite.prepare(`UPDATE social_post_queue SET scheduled_at='2026-08-10T00:05:00.000Z',
    last_error='X_MEDIA_PROCESSING_TIMEOUT' WHERE post_id=?1`).run(expedited.post_id);
  await seedSocialAutopilotQueue(env, now);
  const retry = sqlite.prepare(`SELECT scheduled_at,last_error FROM social_post_queue WHERE post_id=?1`)
    .get(expedited.post_id);
  assert.equal(retry.scheduled_at, '2026-08-10T00:05:00.000Z');
  assert.equal(retry.last_error, 'X_MEDIA_PROCESSING_TIMEOUT');

  sqlite.prepare(`UPDATE social_post_queue SET scheduled_at='2026-08-10T11:20:00.000Z',
    last_error='X_MEDIA_PROCESSING_TIMEOUT' WHERE post_id=?1`).run(expedited.post_id);
  await seedSocialAutopilotQueue(env, now);
  assert.equal(sqlite.prepare(`SELECT scheduled_at FROM social_post_queue WHERE post_id=?1`)
    .get(expedited.post_id).scheduled_at, '2026-08-10T11:20:00.000Z');

  sqlite.prepare(`UPDATE social_post_queue SET scheduled_at='2026-08-12T11:20:00.000Z',
    last_error='' WHERE post_id=?1`).run(expedited.post_id);
  await seedSocialAutopilotQueue(env, now);
  assert.equal(sqlite.prepare(`SELECT scheduled_at FROM social_post_queue WHERE post_id=?1`)
    .get(expedited.post_id).scheduled_at, expedited.scheduled_at);

  const replay = videoRows.at(-1);
  sqlite.prepare(`UPDATE social_post_queue SET status='REVIEW_REQUIRED',approved_at='',
    last_error='MEDIA_REUSE_REVIEW_REQUIRED' WHERE post_id=?1`).run(replay.post_id);
  await seedSocialAutopilotQueue(env, now);
  const restored = sqlite.prepare(`SELECT status,last_error,approved_at
    FROM social_post_queue WHERE post_id=?1`).get(replay.post_id);
  assert.equal(restored.status, 'APPROVED');
  assert.equal(restored.last_error, '');
  assert.equal(restored.approved_at, now.toISOString());
});

test('台帳承認済み日次女優以外の完成動画再利用はREVIEW_REQUIREDのままにする', async (t) => {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(`CREATE TABLE social_post_queue (
    post_id TEXT PRIMARY KEY, platform TEXT NOT NULL, campaign_id TEXT NOT NULL DEFAULT '',
    content_id TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL, link TEXT NOT NULL DEFAULT '',
    media_url TEXT NOT NULL DEFAULT '', scheduled_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED', affiliate INTEGER NOT NULL DEFAULT 0,
    creative_asset_id TEXT NOT NULL DEFAULT '', content_format TEXT NOT NULL DEFAULT '',
    creative_policy TEXT NOT NULL DEFAULT '', jst_publish_date TEXT NOT NULL DEFAULT '',
    ai_generated INTEGER NOT NULL DEFAULT 0, crosspost_group_id TEXT NOT NULL DEFAULT '',
    external_post_id TEXT NOT NULL DEFAULT '', last_error TEXT NOT NULL DEFAULT '',
    approved_at TEXT NOT NULL DEFAULT '', published_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, platform_job_id TEXT NOT NULL DEFAULT ''
  )`);
  class Statement {
    constructor(sql) { this.statement = sqlite.prepare(sql); this.values = []; }
    bind(...values) { this.values = values; return this; }
    async run() {
      const result = this.statement.run(...this.values);
      return { meta: { changes: result.changes } };
    }
    async first() { return this.statement.get(...this.values) || null; }
  }
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    APPROVED_MODEL_REEL_REPLAY_ENABLED: 'true',
    INSTAGRAM_ACCESS_TOKEN: 'ig-token',
    INSTAGRAM_ACCOUNT_ID: 'ig-account',
    PRODUCT_DB: { prepare(sql) { return new Statement(sql); } }
  };
  const now = new Date('2026-08-12T14:01:00.000Z');
  const mediaUrl = 'https://hoshilu.app/social/hoshilu-approved-model-reel-20260812.mp4';
  sqlite.prepare(`INSERT INTO social_post_queue
    (post_id,platform,campaign_id,content_id,caption,link,media_url,scheduled_at,status,
     external_post_id,published_at,created_at,updated_at)
    VALUES ('previous-generic-video','INSTAGRAM','manual','manual','previous caption','',?1,
      '2026-08-12T13:00:00.000Z','PUBLISHED','external-1','2026-08-12T13:01:00.000Z',?2,?2)`)
    .run(mediaUrl, now.toISOString());
  await seedSocialAutopilotQueue(env, now);
  const held = sqlite.prepare(`SELECT status,last_error,approved_at FROM social_post_queue
    WHERE post_id='hoshilu-approved-model-reel-20260812'`).get();
  assert.equal(held.status, 'REVIEW_REQUIRED');
  assert.equal(held.approved_at, '');

  sqlite.prepare(`UPDATE social_post_queue SET status='APPROVED',approved_at=?2
    WHERE post_id=?1`).run('hoshilu-approved-model-reel-20260812', now.toISOString());
  await seedSocialAutopilotQueue(env, now);
  const quarantined = sqlite.prepare(`SELECT status,last_error,approved_at FROM social_post_queue
    WHERE post_id='hoshilu-approved-model-reel-20260812'`).get();
  assert.deepEqual({ ...quarantined }, {
    status: 'REVIEW_REQUIRED',
    last_error: 'MEDIA_REUSE_REVIEW_REQUIRED',
    approved_at: ''
  });
});

test('販促自動運用は認証未設定の媒体をキューへ入れない', async () => {
  const platforms = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    X_USER_ACCESS_TOKEN: 'x-token',
    X_PUBLISHING_ENABLED: 'true',
    X_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    X_EXPECTED_USERNAME: 'hoshilu_app',
    PRODUCT_DB: {
      prepare() {
        return {
          bind(...values) {
            return { async run() { platforms.push(values[1]); return { meta: { changes: 1 } }; } };
          }
        };
      }
    }
  };
  const result = await seedSocialAutopilotQueue(env, new Date('2026-08-09T03:00:00.000Z'));
  assert.equal(result.planned, 22);
  assert.deepEqual(new Set(platforms), new Set(['X']));
});

test('SOCIAL_AUTOPILOT_ENABLEDだけではXのAPPROVED投稿を自動投入しない', async () => {
  const rows = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    X_USER_ACCESS_TOKEN: 'x-token',
    PRODUCT_DB: {
      prepare() {
        return {
          bind(...values) {
            return { async run() { rows.push(values); return { meta: { changes: 1 } }; } };
          }
        };
      }
    }
  };
  const result = await seedSocialAutopilotQueue(env, new Date('2026-08-09T03:00:00.000Z'));
  assert.deepEqual(result, { enabled: true, planned: 0, inserted: 0 });
  assert.equal(rows.length, 0);
});

test('X投稿接続を有効にしても定期シリーズを別承認しなければ自動投入しない', async () => {
  const rows = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    X_PUBLISHING_ENABLED: 'true',
    X_EXPECTED_USERNAME: 'hoshilu_app',
    X_USER_ACCESS_TOKEN: 'x-token',
    PRODUCT_DB: {
      prepare() {
        return {
          bind(...values) {
            return { async run() { rows.push(values); return { meta: { changes: 1 } }; } };
          }
        };
      }
    }
  };
  const result = await seedSocialAutopilotQueue(env, new Date('2026-08-09T03:00:00.000Z'));
  assert.deepEqual(result, { enabled: true, planned: 0, inserted: 0 });
  assert.equal(rows.length, 0);
});

test('D1に保存したInstagram OAuth接続も自動投稿の接続済み媒体として扱う', async () => {
  const platforms = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    INSTAGRAM_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    INSTAGRAM_APP_ID: 'app-id',
    INSTAGRAM_APP_SECRET: 'a'.repeat(32),
    SOCIAL_OAUTH_ENCRYPTION_KEY: 'b'.repeat(32),
    INSTAGRAM_OAUTH_REDIRECT_URI: 'https://hoshilu.app/api/oauth/instagram/callback',
    INSTAGRAM_EXPECTED_USERNAME: 'hoshilu.app',
    PRODUCT_DB: {
      prepare(sql) {
        if (sql.includes('FROM instagram_oauth_credentials')) {
          return {
            first: async () => ({
              status: 'ACTIVE',
              expires_at: '2099-01-01T00:00:00.000Z'
            })
          };
        }
        return {
          bind(...values) {
            return { async run() { platforms.push(values[1]); return { meta: { changes: 1 } }; } };
          }
        };
      }
    }
  };
  const result = await seedSocialAutopilotQueue(env, new Date('2026-08-09T03:00:00.000Z'));
  assert.equal(result.planned, 20);
  assert.deepEqual(new Set(platforms), new Set(['INSTAGRAM']));
});

test('Instagram OAuth接続だけでは未承認の定期リールを自動投入しない', async () => {
  const rows = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    INSTAGRAM_ACCESS_TOKEN: 'ig-token',
    INSTAGRAM_ACCOUNT_ID: 'ig-account',
    PRODUCT_DB: {
      prepare() {
        return {
          bind(...values) {
            return { async run() { rows.push(values); return { meta: { changes: 1 } }; } };
          }
        };
      }
    }
  };
  const result = await seedSocialAutopilotQueue(env, new Date('2026-08-09T03:00:00.000Z'));
  assert.equal(result.planned, 0);
  assert.equal(rows.length, 0);
});

test('承認済み20260812動画はAI生成表示とUTM付きで一度だけキュー登録できる', async () => {
  const rows = [];
  const statements = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    APPROVED_MODEL_REEL_REPLAY_ENABLED: 'true',
    INSTAGRAM_ACCESS_TOKEN: 'ig-token',
    INSTAGRAM_ACCOUNT_ID: 'ig-account',
    PRODUCT_DB: {
      prepare(sql) {
        statements.push(sql);
        return {
          bind(...values) {
            return { async run() { rows.push(values); return { meta: { changes: 1 } }; } };
          }
        };
      }
    }
  };
  await seedSocialAutopilotQueue(env, new Date('2026-08-12T14:01:00.000Z'));
  const approved = rows.find(row => row[0] === 'hoshilu-approved-model-reel-20260812');
  assert.ok(approved);
  assert.equal(approved[2], 'hoshilu-ai-model-reel-20260812');
  assert.match(approved[4], /AI生成映像/);
  assert.match(approved[5], /utm_source=instagram/);
  assert.match(approved[6], /hoshilu-approved-model-reel-20260812\.mp4$/);
  assert.equal(approved[7], '2026-08-12T14:00:00.000Z');
  assert.equal(statements.some(sql => /INSTAGRAM_CONTAINER_IN_PROGRESS/.test(sql)), true);
  assert.equal(statements.some(sql => /SET status='APPROVED',last_error=''/.test(sql)), true);
});

test('THREADS認証済みでもTHREADS_EVERGREEN_AUTOPILOT_ENABLEDが無ければAmazon優先投稿を入れない', async () => {
  const rows = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    THREADS_ACCESS_TOKEN: 'threads-token',
    THREADS_USER_ID: '123',
    PRODUCT_DB: {
      prepare() {
        return { bind(...values) { return { async run() { rows.push(values); return { meta: { changes: 1 } }; } }; } };
      }
    }
  };
  const result = await seedSocialAutopilotQueue(env, new Date('2026-08-09T03:00:00.000Z'));
  assert.equal(result.planned, 0);
  assert.equal(rows.some(row => row[1] === 'THREADS'), false);
});

test('THREADS_EVERGREEN_AUTOPILOT_ENABLEDが有効でもTHREADS未認証ならAmazon優先投稿を入れない', async () => {
  const rows = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    THREADS_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    PRODUCT_DB: {
      prepare() {
        return { bind(...values) { return { async run() { rows.push(values); return { meta: { changes: 1 } }; } }; } };
      }
    }
  };
  const result = await seedSocialAutopilotQueue(env, new Date('2026-08-09T03:00:00.000Z'));
  assert.equal(result.planned, 0);
  assert.equal(rows.some(row => row[1] === 'THREADS'), false);
});

test('THREADS認証とTHREADS_EVERGREEN_AUTOPILOT_ENABLEDが揃うとAmazon優先投稿をAPPROVEDで冪等登録する', async () => {
  const rows = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    THREADS_ACCESS_TOKEN: 'threads-token',
    THREADS_USER_ID: '123',
    THREADS_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    PRODUCT_DB: {
      prepare(sql) {
        assert.match(sql, /ON CONFLICT\(post_id\) DO UPDATE/);
        return {
          bind(...values) {
            return { async run() { rows.push(values); return { meta: { changes: 1 } }; } };
          }
        };
      }
    }
  };
  const result = await seedSocialAutopilotQueue(env, new Date('2026-08-09T03:00:00.000Z'));
  const threadsRows = rows.filter(row => row[1] === 'THREADS');
  // 14日 × 4枠 - 当日の経過済み枠。2026-09-03にThreadsの枠を2本/日から
  // 4本/日へ増やした(SNSで実数の流入があるのがThreadsだけのため)。
  assert.equal(threadsRows.length, 55);
  assert.equal(result.planned, 55);
  assert.equal(result.inserted, 55);
  assert.equal(threadsRows.every(row => row[2] === 'hoshilu-threads-amazon-boost-v1'), true);
  // affiliateがDBへ0/1として正しく保存される。リンク付きは1、
  // 非アフィリエイト枠(リンク無し)は0で、両方が実際に計画されている。
  assert.equal(threadsRows.every(row => row[8] === 0 || row[8] === 1), true);
  const affiliateRows = threadsRows.filter(row => row[8] === 1);
  const organicRows = threadsRows.filter(row => row[8] === 0);
  assert.ok(affiliateRows.length > 0 && organicRows.length > 0);
  assert.equal(affiliateRows.every(row => row[5] !== ''), true, 'affiliate=1はリンクを持つ');
  assert.equal(organicRows.every(row => row[5] === ''), true, 'affiliate=0はリンクを持たない');
});

test('自動運用の1サイクルはThreadsインサイト取り込みも実行し結果を返す', async () => {
  let threadsInsightsQueried = false;
  const env = {
    THREADS_ACCESS_TOKEN: 'threads-token',
    THREADS_USER_ID: '123',
    PRODUCT_DB: {
      prepare(sql) {
        if (sql.includes('social_post_queue') && sql.includes("platform='THREADS'")) threadsInsightsQueried = true;
        return { bind: () => ({ all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 0 } }) }) };
      }
    }
  };
  const result = await runSocialAutopilotCycle(env, new Date('2026-08-17T03:00:00.000Z'), async () => Response.json({}));
  assert.deepEqual(result.threadsInsights, { checked: 0, saved: 0, failed: 0 });
  assert.equal(threadsInsightsQueried, true);
});

// 2026-08-19 大隆さん指示: HOSHILU BUZZ(/buzz)をSNS定常投稿へ織り交ぜる。
test('X定常ローテーションはHOSHILU BUZZ紹介を含み、/buzzへUTM付きで送客する', () => {
  // 30日分でX非動画枠の全ローテーション(6本)が一巡することを確認する。
  const posts = buildSocialAutopilotPosts(new Date('2026-08-20T00:00:00.000Z'), 30)
    .filter(post => post.platform === 'X' && /-x-guide-/.test(post.post_id));
  const buzzPosts = posts.filter(post => /^buzz-/.test(post.content_id));
  assert.ok(buzzPosts.length >= 2, 'BUZZ posts must appear in the rotation');
  for (const post of buzzPosts) {
    const url = new URL(post.link);
    assert.equal(url.hostname, 'hoshilu.app');
    assert.equal(url.pathname, '/buzz');
    assert.equal(url.searchParams.get('q'), null, 'BUZZ posts must not carry a search query');
    assert.match(url.searchParams.get('utm_campaign'), /13mall/);
    assert.match(post.caption, /公式ランキング|価格を確認できた商品/u);
    assert.doesNotMatch(post.caption, /No\.?1|最安|バズって|Z世代/u);
  }
  // 承認済みセラー投稿だけは公開LPへ送り、既存の検索ガイドはホーム(/)へ。
  const sellerPosts = posts.filter(post => /^seller-/.test(post.content_id));
  assert.ok(sellerPosts.length > 0);
  for (const post of sellerPosts) assert.equal(new URL(post.link).pathname, '/for-sellers');
  const guidePosts = posts.filter(post => !/^(?:buzz|seller)-/.test(post.content_id));
  assert.ok(guidePosts.length > 0);
  for (const post of guidePosts) assert.equal(new URL(post.link).pathname, '/');
});


test('明示承認済み日次AI女優行だけが週次再利用の例外メタデータを持つ', async () => {
  const rows = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    INSTAGRAM_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    X_USER_ACCESS_TOKEN: 'x-token',
    X_PUBLISHING_ENABLED: 'true',
    X_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    X_EXPECTED_USERNAME: 'hoshilu_app',
    INSTAGRAM_ACCESS_TOKEN: 'ig-token',
    INSTAGRAM_ACCOUNT_ID: 'ig-account',
    PRODUCT_DB: {
      prepare() {
        return {
          bind(...values) {
            return { async run() { rows.push(values); return { meta: { changes: 1 } }; } };
          }
        };
      }
    }
  };
  await seedSocialAutopilotQueue(env, new Date('2026-08-29T03:00:00.000Z'));
  const daily = rows.filter(row => row[2] === 'hoshilu-ai-actress-daily-v1');
  assert.equal(daily.length, 28);
  assert.equal(daily.every(row => row[12] === 1), true);
  assert.equal(rows.filter(row => !daily.includes(row)).every(row => row[12] === 0), true);
  const today = daily.filter(row => row[16] === '2026-08-29');
  assert.equal(today.length, 2);
  assert.deepEqual(new Set(today.map(row => row[1])), new Set(['X', 'INSTAGRAM']));
  assert.equal(today.every(row => row[3] === 'hoshilu-ai-actress-daily-2026-08-29'
    && row[13] === 'hoshilu_ai_actress_daily_sat_v1'
    && row[14] === 'REEL'
    && row[15] === 'DAILY_AI_ACTRESS_22'
    && row[17] === 1
    && row[18] === row[3]), true);
});

test('8月28日再公開CIは既知の技術障害2件だけを復旧しInstagramコンテナを保持する', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /\[retry-approved-reel-20260828\]/);
  const update = workflow.split('\n').find(line => line.includes('UPDATE social_post_queue')
    && line.includes('hoshilu-official-13mall-v2-x-2026-08-28')
    && line.includes('hoshilu-official-13mall-v2-instagram-2026-08-28')
    && line.includes('X_MEDIA_FETCH_522')) || '';
  assert.match(update, /status='FAILED'/);
  assert.match(update, /last_error LIKE 'Too many subrequests by single Worker invocation\.%'/);
  assert.match(update, /external_post_id=''/);
  assert.match(update, /published_at=''/);
  assert.doesNotMatch(update.slice(0, update.indexOf(' WHERE ')), /platform_job_id/);
  assert.match(workflow, /Verify both public post URLs/);
});

test('8月28日再公開CIは既知の技術障害2件だけを復旧しInstagramコンテナを保持する', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /\[retry-approved-reel-20260828\]/);
  const update = workflow.split('\n').find(line => line.includes('UPDATE social_post_queue')
    && line.includes('hoshilu-official-13mall-v2-x-2026-08-28')
    && line.includes('hoshilu-official-13mall-v2-instagram-2026-08-28')
    && line.includes('X_MEDIA_FETCH_522')) || '';
  assert.match(update, /status='FAILED'/);
  assert.match(update, /last_error LIKE 'Too many subrequests by single Worker invocation\.%'/);
  assert.match(update, /external_post_id=''/);
  assert.match(update, /published_at=''/);
  assert.doesNotMatch(update.slice(0, update.indexOf(' WHERE ')), /platform_job_id/);
  assert.match(workflow, /Verify both public post URLs/);
});

// 2026-09-03 指示書 §SNS「これ、どこの？」。直近14日の実測は自動投稿62件・
// 1件あたり表示およそ54・着地からの流入ほぼゼロ。全投稿が機能説明で読む理由が
// 無いことが原因なので、先に答え(物の本当の名前)を渡す枠を日次ローテへ入れる。
test('Threads日次枠に「名前クイズ」投稿が入り、事実と開示文と検索リンクを持つ', () => {
  // 2026-09-03 方向転換で主訴求「まとめて探す」が6割を占めるため、名前クイズは
  // 28日で数本の差別化枠として残す。
  const posts = buildThreadsAmazonBoostPosts(new Date('2026-09-04T00:00:00.000Z'), 28);
  const quiz = posts.filter((post) => /^name-quiz-/u.test(post.content_id));
  assert.ok(quiz.length >= 4, `名前クイズが少なすぎる: ${quiz.length}/${posts.length}`);
  assert.ok(quiz.length < posts.length / 2, '主訴求を置き換えきらない');
  for (const post of quiz) {
    assert.equal(post.platform, 'THREADS');
    // 答え(名前)を本文に書く。読者はリンクを踏まなくても得をする。
    assert.match(post.caption, /→「[^」]+」/u);
    // Amazon導線の開示は他のThreads枠と同じものを必ず付ける。
    assert.match(post.caption, /HOSHILUからAmazonを含む検索先を開けます/u);
    // 商品名・価格・在庫・レビューの断定は書かない(規約・§47)。
    assert.doesNotMatch(post.caption, /最安|円|セール|レビュー[0-9]|在庫あり/u);
    // その名前でそのまま検索できるリンクを持つ。
    assert.ok(new URL(post.link).searchParams.get('q'));
  }
  const ids = new Set(quiz.map((post) => post.content_id));
  assert.ok(ids.size >= 4, '同じクイズばかり出さない');
});

// 2026-09-03: X・Instagramの日次リールはトップの空欄へ着地していた。
// トップ着地の曜日は ?q= を付け、着地時点で検索が走る状態にする。
test('トップへ着地する日次リールは検索語付きリンクを持つ', () => {
  const seen = new Map();
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(Date.UTC(2026, 8, 6 + offset, 3, 0, 0));
    for (const post of buildSocialAutopilotPosts(date)) {
      if (!/hoshilu-ai-actress-daily-/.test(post.link || '')) continue;
      const url = new URL(post.link);
      seen.set(`${url.pathname}:${post.platform}:${offset}`, url);
      if (url.pathname === '/') {
        assert.ok(url.searchParams.get('q'), `${post.link} must carry a prefilled search`);
        assert.ok(url.searchParams.get('q').length <= 200);
      } else {
        assert.equal(url.searchParams.get('q'), null, 'BUZZ着地に検索語は付けない');
      }
      assert.ok(['x', 'instagram'].includes(url.searchParams.get('utm_source')));
    }
  }
  assert.ok([...seen.values()].some((url) => url.pathname === '/' && url.searchParams.get('q')));
});
