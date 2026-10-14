import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  SOCIAL_PLAN_V3, buildCarouselPosts, buildReelFallbackPosts, carouselSlotIndex, loadCarouselSets, policyV3Allows, reelFallbackAudience, seedCarouselQueue, seedReelFallbackQueue
} from '../src/social-weekly-plan-v3.mjs';
import { mediaUrlList, normalizeMediaUrls, normalizeSocialPost, publishSocialPost, socialPublisherTest } from '../src/social-publisher.mjs';

// 2026-09-17 大隆さん決定（SNS 方針 v3）: リール週 2 回（火・金、AI 女優 v1 の声付き新規生成）、
// カルーセル画像フィード週 3 回（月・水・土）、内容はユーザー向けとセラー向けを半々、X にも同日同内容。
const FORBIDDEN = /必ず|売上が上が|多数のユーザー|業界No|確実に|100%|最安|\d+%OFF|保証します/u;

test('方針 v3: 曜日・時刻・半々の順送り・禁止表現なし・画像は自サイトの決定的レンダリング', () => {
  assert.deepEqual([...SOCIAL_PLAN_V3.reel_weekdays], [2, 5]);
  assert.deepEqual([...SOCIAL_PLAN_V3.carousel_weekdays], [1, 3, 6]);
  const sets = loadCarouselSets();
  // 2026-09-24: モール名を出す「どこで買うのが正解？」とセラー向けの対を足して 8 セット。
  // さらに同日、需要の話をする対（user-wish-left-behind / seller-wanted-now）を足して 10 セット。
  // 2026-09-25: 大型セールの事前通知と、いつものホシルの継続需要の対を足して 12 セット。
  // 2026-09-27: 「モールの出店はそのまま、HOSHILUで探されている需要が見える」とユーザー向け「いつものホシル」の対で 14 セット。
  // 半々の順送り（user, seller, user, seller…）は崩さないので、必ず偶数・同数で足すこと。
  assert.equal(sets.order.length, 14);
  assert.equal(sets.order.filter((set) => set.audience === 'seller').length, 7);
  assert.deepEqual(sets.order.map((set) => set.audience),
    Array.from({ length: 14 }, (_, index) => (index % 2 ? 'seller' : 'user')));
  for (const set of sets.order) {
    assert.ok(set.slides.length >= 2 && set.slides.length <= 10, set.id);
    assert.doesNotMatch(JSON.stringify(set), FORBIDDEN, set.id);
    assert.ok(set.audience !== 'seller' || set.link_path === '/for-sellers', `${set.id} link`);
  }
  // 画像の台帳（manifest）はセットと枚数が一致する。画像本体と manifest は
  // build-social-carousels.yml が生成してコミットするので、セットを足した直後の1コミットだけは
  // 台帳が追いつかない（2026-09-24 にこれで CI が落ちた）。台帳に載っている分は必ず一致すること、
  // 台帳に無いセットは「これから画像を作る」新しいセットだけであること、の2つを見る。
  const manifest = JSON.parse(readFileSync(new URL('../public/social/carousel/manifest.json', import.meta.url), 'utf8'));
  // 2026-10-14: 木曜のオウンドメディア枠（MEDIA_PLAN）のセットは順送りに入れないが画像は作る。
  const ids = new Set([...sets.order, ...mediaSets()].map((set) => set.id));
  for (const id of Object.keys(manifest.sets)) {
    assert.ok(ids.has(id), `${id} は台帳にあるがセットに無い`);
  }
  const missing = sets.order.filter((set) => !manifest.sets[set.id]);
  assert.ok(missing.length <= 2, `画像の無いセットが多すぎる: ${missing.map((set) => set.id).join(',')}`);
  for (const set of sets.order) {
    if (!manifest.sets[set.id]) continue;
    assert.equal(manifest.sets[set.id].slides, set.slides.length, set.id);
    assert.equal(manifest.sets[set.id].audience, set.audience);
  }
  assert.match(readFileSync(new URL('../scripts/build-social-carousels.py', import.meta.url), 'utf8'), /FORBIDDEN_CLAIM/u);
  assert.ok(existsSync(new URL('../../../.github/workflows/build-social-carousels.yml', import.meta.url)));
});

test('カルーセル投稿は月・水・土 20:00 JST に Instagram と X の同じ内容を、セットを順送りで作る', () => {
  const posts = buildCarouselPosts(new Date('2026-09-18T00:00:00.000Z'), 14);
  assert.equal(posts.length, 10);
  const days = [...new Set(posts.map((post) => post.jst_publish_date))];
  assert.deepEqual(days, ['2026-09-21', '2026-09-23', '2026-09-26', '2026-09-28', '2026-09-30']);
  const sixth = buildCarouselPosts(new Date('2026-09-18T00:00:00.000Z'), 16).filter((post) => post.jst_publish_date === '2026-10-03');
  assert.deepEqual(sixth.map((post) => post.content_id), ['carousel-seller-real-numbers', 'carousel-seller-real-numbers']);
  assert.ok(posts.every((post) => post.scheduled_at.endsWith('T11:00:00.000Z')));
  assert.ok(posts.every((post) => post.status === 'APPROVED' && post.content_format === 'IMAGE' && post.campaign_id === 'hoshilu-carousel-v3'));
  const ig = posts.filter((post) => post.platform === 'INSTAGRAM');
  const x = posts.filter((post) => post.platform === 'X');
  assert.equal(ig.length, 5);
  assert.deepEqual(ig.map((post) => post.content_id), [
    'carousel-user-hoshittoku-basics', 'carousel-seller-demand-visible', 'carousel-user-price-watch',
    'carousel-seller-shop-entrance', 'carousel-user-shop-search'
  ]);
  for (const [index, post] of ig.entries()) {
    assert.equal(x[index].content_id, post.content_id);
    assert.equal(x[index].crosspost_group_id, post.crosspost_group_id);
    assert.equal(mediaUrlList(post).length, 4);
    assert.ok(mediaUrlList(post).every((url) => url.startsWith('https://hoshilu.app/social/carousel/')));
    assert.match(post.link, /^https:\/\/hoshilu\.app\/(?:for-sellers)?\?utm_source=instagram&utm_medium=organic_social&utm_campaign=hoshilu_carousel_v3&utm_content=/u);
    assert.match(x[index].link, /utm_source=x/u);
    assert.equal(post.media_url, '');
  }
  assert.equal(carouselSlotIndex({ year: 2026, month: 9, day: 22, weekday: 2 }), -1);
  assert.equal(carouselSlotIndex({ year: 2026, month: 10, day: 3, weekday: 6 }), 5);
  // 既に過ぎた枠は作らない
  assert.equal(buildCarouselPosts(new Date('2026-09-21T11:30:00.000Z'), 1).length, 0);
});

test('policyV3Allows: 9/21 以降は毎日 v2 女優・Instagram 静止画案内・リール日/カルーセル日の X 案内を投入しない', () => {
  const daily = { campaign_id: 'hoshilu-ai-actress-daily-v1', creative_policy: 'DAILY_AI_ACTRESS_22', platform: 'INSTAGRAM', scheduled_at: '2026-09-22T11:15:00.000Z', post_id: 'hoshilu-ai-actress-daily-v1-instagram-2026-09-22' };
  assert.equal(policyV3Allows(daily), false);
  assert.equal(policyV3Allows({ ...daily, scheduled_at: '2026-09-19T11:15:00.000Z' }), true, '適用開始前は旧方針のまま');
  const igGuide = { campaign_id: 'hoshilu-official-13mall-v2', platform: 'INSTAGRAM', scheduled_at: '2026-09-24T11:00:00.000Z', post_id: 'hoshilu-official-13mall-v2-instagram-guide-2026-09-24' };
  assert.equal(policyV3Allows(igGuide), false);
  const xTue = { campaign_id: 'hoshilu-official-13mall-v2', platform: 'X', scheduled_at: '2026-09-22T11:00:00.000Z', post_id: 'hoshilu-official-13mall-v2-x-guide-2026-09-22' };
  assert.equal(policyV3Allows(xTue), false);
  const xThu = { ...xTue, scheduled_at: '2026-09-24T11:00:00.000Z', post_id: 'hoshilu-official-13mall-v2-x-guide-2026-09-24' };
  assert.equal(policyV3Allows(xThu), true);
  assert.equal(policyV3Allows({ campaign_id: 'hoshilu-carousel-v3', platform: 'X', scheduled_at: '2026-09-21T11:00:00.000Z' }), true);
  assert.equal(policyV3Allows({ campaign_id: 'hoshilu-runway-video', platform: 'INSTAGRAM', scheduled_at: '2026-09-22T11:15:00.000Z' }), true);
  assert.equal(policyV3Allows({ campaign_id: 'hoshilu-threads-amazon-boost-v1', platform: 'THREADS', scheduled_at: '2026-09-22T00:30:00.000Z' }), true);
});

test('seedCarouselQueue は接続済み媒体の分だけ INSERT OR IGNORE し、既存行を書き換えない', async () => {
  const rows = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true', INSTAGRAM_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    INSTAGRAM_ACCESS_TOKEN: 'ig-token', INSTAGRAM_ACCOUNT_ID: 'ig-account',
    PRODUCT_DB: { prepare(sql) { assert.match(sql, /INSERT OR IGNORE INTO social_post_queue/u); assert.match(sql, /media_urls/u); return { bind(...values) { return { async run() { rows.push(values); return { meta: { changes: 1 } }; } }; } }; } }
  };
  const result = await seedCarouselQueue(env, new Date('2026-09-18T00:00:00.000Z'));
  assert.deepEqual(result, { enabled: true, planned: 5, inserted: 5 });
  assert.ok(rows.every((row) => row[1] === 'INSTAGRAM'));
  assert.deepEqual(JSON.parse(rows[0][6]).length, 4);
  assert.deepEqual(await seedCarouselQueue({ SOCIAL_AUTOPILOT_ENABLED: 'false' }), { enabled: false, planned: 0, inserted: 0 });
});

test('normalizeSocialPost は media_urls を自サイトの https だけに正規化する', () => {
  assert.equal(normalizeMediaUrls(''), '');
  assert.equal(normalizeMediaUrls('not json'), '');
  assert.equal(normalizeMediaUrls(['https://hoshilu.app/social/carousel/a/1.jpg', 'https://evil.example/2.jpg', 'http://hoshilu.app/x.jpg']), JSON.stringify(['https://hoshilu.app/social/carousel/a/1.jpg']));
  const post = normalizeSocialPost({ platform: 'X', caption: 'テスト', media_urls: ['https://hoshilu.app/social/carousel/a/1.jpg', 'https://hoshilu.app/social/carousel/a/2.jpg'], scheduled_at: '2026-09-21T11:00:00.000Z' });
  assert.deepEqual(mediaUrlList(post), ['https://hoshilu.app/social/carousel/a/1.jpg', 'https://hoshilu.app/social/carousel/a/2.jpg']);
});

test('Instagram は子コンテナ → CAROUSEL 親 → 公開の順で投稿し、親の creation_id を保存する', async () => {
  const calls = [];
  const created = [];
  const urls = [1, 2, 3, 4].map((n) => `https://hoshilu.app/social/carousel/user-hoshittoku-basics/${n}.jpg`);
  const id = await publishSocialPost({
    platform: 'INSTAGRAM', caption: '探さなくていい。ホシっといて。', link: 'https://hoshilu.app/',
    media_url: '', media_urls: urls, status: 'APPROVED'
  }, { INSTAGRAM_ACCESS_TOKEN: 'token', INSTAGRAM_ACCOUNT_ID: '123', INSTAGRAM_POLL_DELAY_MS: 0 }, async (url, options = {}) => {
    if (url.endsWith('/123/media')) {
      const payload = JSON.parse(options.body);
      calls.push(payload);
      if (payload.is_carousel_item) return Response.json({ id: `child-${calls.length}` });
      return Response.json({ id: 'parent-1' });
    }
    if (url.includes('/parent-1?fields=status_code')) return Response.json({ status_code: 'FINISHED' });
    if (url.endsWith('/123/media_publish')) return Response.json({ id: 'ig-carousel-1' });
    return Response.json({}, { status: 404 });
  }, { onJobCreated: (value) => created.push(value) });
  assert.equal(id, 'ig-carousel-1');
  assert.equal(calls.length, 5);
  assert.deepEqual(calls.slice(0, 4).map((c) => c.image_url), urls);
  assert.ok(calls.slice(0, 4).every((c) => c.is_carousel_item === true));
  assert.equal(calls[4].media_type, 'CAROUSEL');
  assert.deepEqual(calls[4].children, ['child-1', 'child-2', 'child-3', 'child-4']);
  assert.match(calls[4].caption, /@hoshilu\.app のプロフィールリンクから/u);
  assert.deepEqual(created, ['parent-1']);
  // 保存済みの親があれば子を作り直さない
  const again = [];
  const resumed = await publishSocialPost({
    platform: 'INSTAGRAM', caption: 'x', media_url: '', media_urls: urls, status: 'APPROVED', platform_job_id: 'parent-1'
  }, { INSTAGRAM_ACCESS_TOKEN: 'token', INSTAGRAM_ACCOUNT_ID: '123', INSTAGRAM_POLL_DELAY_MS: 0 }, async (url) => {
    again.push(url);
    if (url.includes('/parent-1?fields=status_code')) return Response.json({ status_code: 'FINISHED' });
    if (url.endsWith('/123/media_publish')) return Response.json({ id: 'ig-carousel-1' });
    return Response.json({}, { status: 404 });
  });
  assert.equal(resumed, 'ig-carousel-1');
  assert.equal(again.filter((url) => url.endsWith('/123/media')).length, 0);
});

test('X はカルーセル画像を最大 4 枚 tweet_image としてアップロードし 1 投稿にまとめる', async () => {
  const inits = [];
  const mediaId = await socialPublisherTest.uploadXVideo(
    'https://hoshilu.app/social/carousel/user-hoshittoku-basics/1.jpg', 'x-token',
    { ASSETS: { async fetch() { return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }); } } },
    async (url, options = {}) => {
      if (String(url).endsWith('/initialize')) { inits.push(JSON.parse(options.body)); return Response.json({ data: { id: 'img-1' } }); }
      if (String(url).endsWith('/append')) return new Response(null, { status: 204 });
      if (String(url).endsWith('/finalize')) return Response.json({ data: {} });
      return Response.json({}, { status: 404 });
    }, 'image');
  assert.equal(mediaId, 'img-1');
  assert.equal(inits[0].media_category, 'tweet_image');
  assert.equal(inits[0].media_type, 'image/jpeg');
  // 料金版フォルダ（1段深い）のカルーセルも読める（2026-09-28 X だけ X_MEDIA_SOURCE_UNSUPPORTED になった）
  assert.equal(await socialPublisherTest.uploadXVideo(
    'https://hoshilu.app/social/carousel/seller1980-30d-autorenew-20260927/seller-shop-entrance/1.jpg', 'x-token',
    { ASSETS: { async fetch() { return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }); } } },
    async (url) => String(url).endsWith('/initialize') ? Response.json({ data: { id: 'img-2' } })
      : String(url).endsWith('/append') ? new Response(null, { status: 204 }) : Response.json({ data: {} }), 'image'), 'img-2');
  await assert.rejects(() => socialPublisherTest.uploadXVideo('https://hoshilu.app/social/carousel/a/b/c/1.jpg', 'x', { ASSETS: { fetch: async () => new Response('') } }, async () => Response.json({}), 'image'), /X_MEDIA_SOURCE_UNSUPPORTED/u);
  // 動画以外の拡張子は静的画像として扱い、外部ホストは拒否する
  await assert.rejects(() => socialPublisherTest.uploadXVideo('https://evil.example/1.jpg', 'x', {}, async () => Response.json({}), 'image'), /X_MEDIA_URL_INVALID/u);
  const publisher = readFileSync(new URL('../src/social-publisher.mjs', import.meta.url), 'utf8');
  assert.match(publisher, /const imageUrls = mediaUrlList\(post\)\.slice\(0, 4\);/u);
  assert.match(publisher, /media: \{ media_ids: mediaId \}/u);
});

// 2026-09-18 大隆さん指示: AI リールが不合格でも SNS 運用を止めない。リール日（火・金）に 19:30 JST 時点で
// 承認済みリールが無ければ、同じ 20:15 JST 枠に静止画カルーセル（火=ユーザー向け、金=セラー向け）を入れる。
test('リール日の代替カルーセルは 19:30 JST 以降・リール未承認の時だけ、対象を合わせて 20:15 JST に入る', async () => {
  // 2026-09-18 は金曜（JST）。19:29 JST では何も出ない
  assert.deepEqual(buildReelFallbackPosts(new Date('2026-09-18T10:29:00.000Z')), []);
  const posts = buildReelFallbackPosts(new Date('2026-09-18T10:31:00.000Z'));
  assert.equal(posts.length, 2);
  assert.deepEqual(posts.map((post) => post.platform), ['INSTAGRAM', 'X']);
  for (const post of posts) {
    assert.equal(post.scheduled_at, '2026-09-18T11:15:00.000Z');
    assert.equal(post.campaign_id, SOCIAL_PLAN_V3.campaign_id);
    assert.equal(post.content_format, 'IMAGE');
    assert.equal(post.jst_publish_date, '2026-09-18');
    assert.equal(post.crosspost_group_id, 'hoshilu-carousel-fallback-2026-09-18');
    assert.match(post.post_id, /^hoshilu-carousel-v3-fallback-(?:instagram|x)-2026-09-18$/u);
    assert.ok(mediaUrlList(post).length >= 2);
    assert.ok(policyV3Allows(post));
    const set = loadCarouselSets().order.find((item) => `carousel-${item.id}` === post.content_id);
    assert.equal(set.audience, 'seller', '金曜はセラー向け');
  }
  // 火曜（2026-09-22）はユーザー向け
  assert.equal(reelFallbackAudience(2), 'user');
  const tuesday = buildReelFallbackPosts(new Date('2026-09-22T10:45:00.000Z'));
  assert.equal(loadCarouselSets().order.find((item) => `carousel-${item.id}` === tuesday[0].content_id).audience, 'user');
  // 20:15 を過ぎたら入れない。カルーセル日（月曜）には出ない
  assert.deepEqual(buildReelFallbackPosts(new Date('2026-09-18T11:16:00.000Z')), []);
  assert.deepEqual(buildReelFallbackPosts(new Date('2026-09-21T10:45:00.000Z')), []);

  // 投入: リールが承認済みなら入れない。未承認なら接続済み媒体分だけ INSERT OR IGNORE
  const makeEnv = (reelCount) => {
    const rows = [];
    const env = {
      SOCIAL_AUTOPILOT_ENABLED: 'true', INSTAGRAM_EVERGREEN_AUTOPILOT_ENABLED: 'true',
      INSTAGRAM_ACCESS_TOKEN: 'ig-token', INSTAGRAM_ACCOUNT_ID: 'ig-account',
      PRODUCT_DB: { prepare(sql) {
        if (/SELECT COUNT\(\*\) AS n FROM social_post_queue/u.test(sql)) {
          // 承認 SQL は jst_publish_date を '' のまま入れるので scheduled_at の JST 当日範囲で判定する
          assert.match(sql, /campaign_id=\?1 AND scheduled_at>=\?2 AND scheduled_at<\?3/u);
          return { bind(campaign, from, to) { assert.equal(campaign, 'hoshilu-runway-video'); assert.equal(from, '2026-09-17T15:00:00.000Z'); assert.equal(to, '2026-09-18T15:00:00.000Z'); return { async first() { return { n: reelCount }; } }; } };
        }
        assert.match(sql, /INSERT OR IGNORE INTO social_post_queue/u);
        return { bind(...values) { return { async run() { rows.push(values); return { meta: { changes: 1 } }; } }; } };
      } }
    };
    return { env, rows };
  };
  const ready = makeEnv(1);
  assert.deepEqual(await seedReelFallbackQueue(ready.env, new Date('2026-09-18T10:31:00.000Z')), { enabled: true, planned: 0, inserted: 0, reel_ready: true });
  assert.equal(ready.rows.length, 0);
  const missing = makeEnv(0);
  assert.deepEqual(await seedReelFallbackQueue(missing.env, new Date('2026-09-18T10:31:00.000Z')), { enabled: true, planned: 1, inserted: 1, reel_ready: false });
  assert.equal(missing.rows[0][0], 'hoshilu-carousel-v3-fallback-instagram-2026-09-18');
  assert.equal(missing.rows[0][7], '2026-09-18T11:15:00.000Z');
  assert.deepEqual(await seedReelFallbackQueue(makeEnv(0).env, new Date('2026-09-18T09:00:00.000Z')), { enabled: true, planned: 0, inserted: 0, reel_ready: false });
});

// 2026-09-21 に Demand Match Click（1クリック50円）を廃止したのに、カルーセルの
// seller-demand-visible に残ったまま Instagram に出てしまった。画像は JSON から描かれるので、
// JSON の側で廃止した課金の言い方を止める（build-social-carousels.py の PRICING_BAN と同じ規則）。
test('カルーセルの文言に、廃止したクリック課金は残っていない', () => {
  const doc = JSON.parse(readFileSync(new URL('../ops/social/carousels-v3.json', import.meta.url), 'utf8'));
  const banned = /Demand Match Click|1クリック|クリック課金|クリック単価|50円|５０円/u;
  for (const set of doc.sets) {
    assert.doesNotMatch(JSON.stringify(set), banned, `${set.id} に廃止した課金の言い方が残っている`);
  }
  const seller = doc.sets.filter((set) => set.audience === 'seller');
  assert.ok(seller.length >= 1);
  const pricing = JSON.stringify(seller);
  assert.match(pricing, /1,980円/u, 'セラー向けは月額だけを書く');
  assert.match(pricing, /30日間無料/u, '新規は商品公開から30日');
  assert.doesNotMatch(pricing, /3か月/u);
  // 描画側も同じ規則を持っている（片方だけ直しても通らないようにする）
  const builder = readFileSync(new URL('../scripts/build-social-carousels.py', import.meta.url), 'utf8');
  assert.match(builder, /PRICING_BAN = re\.compile/u);
  assert.match(builder, /ABOLISHED_PRICING/u);
});

// 2026-09-24 大隆さん指示「モール名なども出したり、より人間的なフィード投稿を」。
// 名前を書くのは HOSHILU が実際に横断している4モールだけ。画像は文字だけで描き、
// 他社のロゴ・商品写真は使わない（build-social-carousels.py は Pillow で図形と文字しか描かない）。
test('カルーセルに書くモール名は、実際に横断している4つだけ', () => {
  const doc = JSON.parse(readFileSync(new URL('../ops/social/carousels-v3.json', import.meta.url), 'utf8'));
  const malls = ['Amazon', '楽天市場', 'Yahoo!ショッピング', 'Qoo10'];
  const named = doc.sets.filter((set) => malls.every((mall) => JSON.stringify(set).includes(mall)));
  assert.ok(named.length >= 2, 'モール名を出すセットがユーザー向けとセラー向けに1つずつある');
  assert.ok(named.some((set) => set.audience === 'user'));
  assert.ok(named.some((set) => set.audience === 'seller'));
  // 横断していないモールの名前は書かない（書くと嘘になる）
  for (const set of doc.sets) {
    for (const absent of ['メルカリ', 'ZOZOTOWN', 'au PAY', 'Temu', 'SHEIN']) {
      assert.ok(!JSON.stringify(set).includes(absent), `${set.id} に ${absent} が入っている`);
    }
  }
  // 検索欄の見た目に実在の商品名・型番を入れない（条件だけ）
  const builder = readFileSync(new URL('../scripts/build-social-carousels.py', import.meta.url), 'utf8');
  assert.match(builder, /def search_bar/u);
  assert.match(builder, /def chips/u);
});

// 2026-10-14: 代替カルーセルが曜日ごとに毎週同じセット（金=ショップ入口・火=大型セール通知）に固定され、
// 10/13 火（代替）と 10/14 水（通常）で同じセットが連日出た。週ごとに順送りし、前後6日の通常枠と重ねない。
// ショップページを案内するセットは 10/14 以降使わない（大隆さん決定 10/9「shop専用ページはまだ先」）。
test('代替カルーセルは週ごとに変わり、前後6日の通常カルーセルと重ならず、ショップ入口セットを使わない', () => {
  const fallbackDays = ['2026-10-16', '2026-10-20', '2026-10-23', '2026-10-27', '2026-10-30', '2026-11-03', '2026-11-06', '2026-11-10'];
  const picks = fallbackDays.map((day) => buildReelFallbackPosts(new Date(`${day}T10:40:00.000Z`))[0].content_id);
  const fridays = picks.filter((_, index) => fallbackDays[index] && new Date(`${fallbackDays[index]}T00:00:00Z`).getUTCDay() === 5);
  const tuesdays = picks.filter((_, index) => new Date(`${fallbackDays[index]}T00:00:00Z`).getUTCDay() === 2);
  assert.equal(new Set(fridays).size, fridays.length, `金曜が毎週同じ: ${fridays}`);
  assert.equal(new Set(tuesdays).size, tuesdays.length, `火曜が毎週同じ: ${tuesdays}`);
  assert.ok(picks.every((id) => id !== 'carousel-seller-shop-entrance'));
  const regular = new Map(buildCarouselPosts(new Date('2026-10-08T00:00:00.000Z'), 45)
    .filter((post) => post.platform === 'INSTAGRAM').map((post) => [post.jst_publish_date, post.content_id]));
  for (const [index, day] of fallbackDays.entries()) {
    const base = Date.parse(`${day}T00:00:00Z`);
    for (let offset = -6; offset <= 6; offset += 1) {
      const near = new Date(base + offset * 86400000).toISOString().slice(0, 10);
      if (regular.has(near)) assert.notEqual(regular.get(near), picks[index], `${day} と ${near}`);
    }
  }
  // 通常枠: 10/31 はショップ入口の番だが、同じセラー向けの別セットに置き換わる。過去（9/28）の順送りは変えない
  const after = buildCarouselPosts(new Date('2026-10-20T00:00:00.000Z'), 14).filter((post) => post.jst_publish_date === '2026-10-31');
  assert.deepEqual([...new Set(after.map((post) => post.content_id))], ['carousel-seller-keep-mall-see-demand']);
  assert.ok(after.every((post) => !post.media_urls.includes('seller-shop-entrance')));
  const before = buildCarouselPosts(new Date('2026-09-20T00:00:00.000Z'), 10).filter((post) => post.jst_publish_date === '2026-09-28');
  assert.equal(before[0].content_id, 'carousel-seller-shop-entrance');
});

// 2026-10-14 大隆さん指示「SNSでオウンドメディアを宣伝して。今後も定期的に自動運用」:
// 毎週木曜 20:00 JST に買い物ノートの紹介（2 セットを交互）を Instagram と X へ。カルーセルの順送りには入れない。
import { MEDIA_PLAN, buildMediaPosts, mediaSets } from '../src/social-weekly-plan-v3.mjs';
test('買い物ノートの紹介は木曜 20:00 JST・2 セット交互・UTM 付き。カルーセルの順送りは変えない', () => {
  const posts = buildMediaPosts(new Date('2026-10-14T12:00:00.000Z'), 21);
  const instagram = posts.filter((post) => post.platform === 'INSTAGRAM');
  assert.deepEqual(instagram.map((post) => post.jst_publish_date), ['2026-10-15', '2026-10-22', '2026-10-29']);
  assert.ok(posts.every((post) => post.scheduled_at.endsWith('T11:00:00.000Z')), '20:00 JST');
  assert.deepEqual(instagram.map((post) => post.content_id), ['media-user-media-price-drops', 'media-user-media-ranking-price', 'media-user-media-price-drops']);
  assert.equal(posts.filter((post) => post.platform === 'X').length, 3);
  // 2026-10-14 大隆さん「スレッズでもオウンドメディアを販促しよう」: Threads は表紙 1 枚＋Threads 用の文＋リンク
  const threads = posts.filter((post) => post.platform === 'THREADS');
  assert.equal(threads.length, 3);
  assert.match(threads[0].media_url, /\/social\/carousel\/user-media-price-drops\/1\.jpg$/u);
  assert.match(threads[0].link, /utm_source=threads&utm_medium=organic_social&utm_campaign=hoshilu_media_notes/u);
  assert.doesNotMatch(threads[0].caption, /プロフィールのリンクから/u, 'Threads は本文のリンクを押せる');
  assert.ok([threads[0].caption, threads[0].link].join('\n').length <= 500, 'Threads の 500 文字に収まる');
  assert.match(instagram[0].link, /^https:\/\/hoshilu\.app\/media\/price-drops\?utm_source=instagram&utm_medium=organic_social&utm_campaign=hoshilu_media_notes&utm_content=user-media-price-drops_20261015$/u);
  assert.match(instagram[1].link, /^https:\/\/hoshilu\.app\/media\?utm_source=instagram/u);
  assert.ok(posts.every((post) => post.campaign_id === MEDIA_PLAN.campaign_id && post.status === 'APPROVED'));
  assert.ok(posts.every((post) => policyV3Allows(post)), '方針 v3 の門を通る');
  // 開始前・過去の枠は作らない
  assert.equal(buildMediaPosts(new Date('2026-10-15T11:30:00.000Z'), 1).length, 0);
  // 順送り（14 セット）には入れない
  assert.ok(!loadCarouselSets().order.some((set) => set.id.startsWith('user-media-')));
  // 文言の決まり（最安・%OFF・保証などを書かない）
  for (const set of mediaSets()) {
    assert.equal(set.audience, 'user');
    assert.doesNotMatch(JSON.stringify(set), /必ず|最安|\d+%|保証|値下げしました/u);
    assert.match(set.caption, /プロフィールのリンクから/u);
  }
});
