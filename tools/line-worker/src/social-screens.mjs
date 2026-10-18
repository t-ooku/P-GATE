// 2026-10-15 大隆さん指示「今後の投稿も、実画像を踏まえて投稿して」:
// Instagram のフィード投稿（月・水・土のカルーセル、火・金の代替カルーセル、木曜の買い物ノート）を、その日の本番画面の
// 実画像（scripts/build-social-screens.mjs が毎日 17:30 JST に撮る public/social/screens/<YYYYMMDD>/<セット>/）に差し替える。
// - 差し替えるのは「今日」の未投稿の行だけ（status=APPROVED・未公開・投稿処理前・投稿時刻が 2 分以上先）。過去の投稿は触らない。
// - その日の manifest.json に載っているセットだけ使う（撮れなかった日は従来の画像のまま投稿する）。
// - セット: セラー向けの行 → seller、木曜の買い物ノート → notes、ユーザー向けの行 → 日ごとに notes / buzz を交互。
// - 本文はセットに合わせて差し替える（画像と本文を食い違わせない）。商品の価格・割引率は本文にも書かない。
import { normalizeSocialPost } from './social-publisher.mjs';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const SCREENS_START_JST = '2026-10-16';
export const SCREEN_SET_IDS = Object.freeze(['notes', 'buzz', 'seller']);
const TARGET_CAMPAIGNS = Object.freeze(['hoshilu-carousel-v3', 'hoshilu-media-notes']);

const SELLER_TERMS = '新規Sellerは商品公開から30日間無料。（体験開始は準備中）開始前にカード登録必須。期限までに解約しなければ31日目から月額1,980円（税込）で毎月自動更新。解約は掲載管理画面から。自店の掲載見本を相談する。';

export const SCREEN_POSTS = Object.freeze({
  notes: Object.freeze({
    link_path: '/media',
    caption: [
      '「これ、最近安くなった？」を、ホシルが毎日記録しています。',
      '',
      // 投稿の直前に改行は 1 つの空白にまとめられる（normalizeSocialPost）。行頭の「・」だけの箇条書きは文の途中に入って読みにくいので、
      // 1 行ずつ「。」で終わる文にする（2026-10-16 大隆さん「変な改行やバグがないかチェック」）。
      'ホシルの「買い物ノート」では、楽天市場・Yahoo!ショッピングの価格を毎日記録して、今週値下がりした物と、売れてる物の値段の動き（グラフ）をまとめています。',
      '予想ではなく、記録した事実だけです。',
      '',
      'ホシルバズでは、ジャンル別のトレンドもチェックできます。',
      '（画像の価格はぼかしています。最新の価格は商品ページで確認してね）',
      '',
      '欲しい物は、ホシルで検索してね。名前が分からなくても、言葉やスクショで探せます。',
      '気になった商品、コメントで教えてね。',
      'プロフィールのリンクから「買い物ノート」へ。',
      '',
      '#HOSHILU #ホシル #買い物ノート #値下がり #楽天市場 #お買い物好きな人と繋がりたい #お得情報 #購入品紹介'
    ].join('\n')
  }),
  // 2026-10-17 大隆さん「価格履歴から、何%下がってる最中のリアル画像を販促に。デカデカとアピール。若い者向けや主婦向け、
  // 流行ってるアパレルや生活雑貨も。特に韓国系。ホシルで検索するよう促しも入れて」。
  // 割引率の書き方は大隆さん決定「記録の事実で書く」: セールの「◯%オフ」とは書かず、ホシルの記録で 14 日間の最高値から下がった率、と断る。
  // 本文には数字（価格・率）を書かない（画像の記録と食い違わないように。数字は撮った日の画像の中だけ）。
  drops: Object.freeze({
    link_path: '/media/price-drops',
    caption: [
      '今、値下がり中の物を集めました。',
      '',
      'ホシルは楽天市場・Yahoo!ショッピングの価格を毎日記録しています。その記録で、14日間の最高値より下がっている物だけを選んでいます。',
      'アパレル、生活雑貨、美容、韓国系などのジャンルから、日替わりで選んでいます。',
      '画像の大きな数字は、ホシルの記録の最高値と比べた下がり幅です（撮影した日の時点）。セールの割引率ではありません。',
      '価格は変わるので、買う前に商品ページで今の価格を確認してね。',
      '',
      '欲しい物は、ホシルで検索してね。名前が分からなくても、言葉やスクショで探せて、値下がりしたらお知らせもできます。',
      '気になった商品、コメントで教えてね。',
      'プロフィールのリンクから。登録なしで使えます。',
      '',
      '#HOSHILU #ホシル #値下がり #お得情報 #楽天市場 #プチプラ #主婦の味方 #購入品紹介'
    ].join('\n')
  }),
  buzz: Object.freeze({
    link_path: '/',
    caption: [
      '今日、みんなが「ホシってる」物。',
      '',
      'ホシルバズは、楽天市場・Yahoo!ショッピングの公式ランキングから、いま売れている物をジャンル別に並べたページです。',
      '毎日、自動で入れ替わります。',
      '',
      '気になったら、そのまま、ほかのモールでも探したり、「価格通知」で値下がりを待ったり、過去の価格と比べたりできます。',
      '（画像の価格はぼかしています）',
      '',
      '欲しい物は、ホシルで検索してね。値下がりしたらお知らせもできます。',
      'どのジャンルが気になる？コメントで教えてね。',
      'プロフィールのリンクから。登録なしで使えます。',
      '',
      '#HOSHILU #ホシル #ホシルバズ #トレンド #楽天ランキング #お買い物好きな人と繋がりたい #購入品紹介 #欲しいものリスト'
    ].join('\n')
  }),
  seller: Object.freeze({
    link_path: '/for-sellers',
    caption: [
      SELLER_TERMS,
      // 2026-10-16 大隆さん「せっかく改修したページだから販促増やして」: 実際の画面（検索結果・検索・ホシルバズ）を見せる版
      'ネットショップ・メーカーの方へ。HOSHILUの実際の画面をお見せします（他店の価格はぼかしています）。',
      'お客さまは、名前が分からない物も「こういう物が欲しい」という言葉で探します。',
      '検索語の条件にすべて合うときは、検索結果の一番上の「PR」枠にお店の商品を表示します（最大2件。掲載順位や表示回数は保証しません）。',
      '売れ筋の棚の「気になる」「価格通知」で、今すぐ買わないお客さまも商品を残せます。',
      'HOSHILUで探されて見つからなかった需要も、個人が分からない形で確認できます。',
      'Amazonや楽天市場の出店はそのまま。',
      '料金はHOSHILU Seller 1,980円/月（税込）だけ、商品公開から30日間無料（体験開始は準備中）、クリックによる追加料金はありません。',
      '詳しくはプロフィールのリンクから。',
      '#HOSHILU #ホシル #ECセラー #ネットショップ #EC運営 #商品企画',
      '開始前にカード登録と自動更新への明示同意が必要です。期限までに解約しなければ31日目から月額1,980円（税込）。掲載管理画面から解約できます。'
    ].join('\n')
  })
});

// 2026-10-17 大隆さん「ユーザー向け販促は今日からこの感じに変えていこう」: ユーザー向けの Instagram に、
// 毎日 21:00 JST の「値下がり中」投稿を 1 本足す（その日 17:30 JST の撮影でできた drops セット）。
// 決まった post_id で 1 日 1 本だけ（何度呼ばれても増えない）。その日の定時の撮影より前の撮り直し（手動）は使わない。
// 2026-10-18: GitHub の定時実行は数時間遅れることがあるため、撮影を 15:07／18:07 JST の 2 回にした（main の daily-social-screens.yml）。
// それに合わせて「その日の撮影」とみなす時刻を 06:00 UTC（15:00 JST）にした。予約後に撮り直して枚数が変わったら、
// 投稿前（APPROVED のまま）なら画像の URL をその日の撮影に合わせ直す（10/18: 予約後に撮り直した）。
export const DROPS_DAILY = Object.freeze({
  campaign_id: 'hoshilu-price-drops-daily', content_id: 'screens-drops', publish_utc: '12:00', daily_capture_utc: '06:00'
});

export async function seedDailyDropsPost(env, now = new Date()) {
  if (!env?.PRODUCT_DB || env.SOCIAL_REAL_SCREENS_ENABLED === 'false' || env.SOCIAL_DROPS_DAILY_ENABLED === 'false') return { enabled: false, inserted: 0 };
  const dateKey = jstDateKey(now);
  const scheduledAt = new Date(`${dateKey}T${DROPS_DAILY.publish_utc}:00.000Z`);
  // 予約の 10 分前を過ぎたら、その日は足さない（遅れて急に出さない）
  if (now.getTime() > scheduledAt.getTime() - 10 * 60 * 1000) return { enabled: true, inserted: 0, reason: 'too_late' };
  const manifest = await loadScreensManifest(env, dateKey);
  const count = availableSet(manifest, 'drops');
  if (!count) return { enabled: true, inserted: 0, reason: 'no_drops_today' };
  if (!(Date.parse(manifest.captured_at || '') >= Date.parse(`${dateKey}T${DROPS_DAILY.daily_capture_utc}:00.000Z`))) {
    return { enabled: true, inserted: 0, reason: 'before_daily_capture' };
  }
  const postId = `hoshilu-price-drops-instagram-${dateKey}`;
  // 同じ日のユーザー向けカルーセル（20:00）が、すでに今日の drops に差し替わっていれば足さない（同じ画像を 2 回出さない）
  const day = dateKey.replaceAll('-', '');
  const already = await env.PRODUCT_DB.prepare(`SELECT post_id FROM social_post_queue WHERE jst_publish_date=?1 AND platform='INSTAGRAM'
      AND post_id<>?2 AND status IN ('APPROVED','PUBLISHING','PUBLISHED') AND media_urls LIKE ?3 LIMIT 1`)
    .bind(dateKey, postId, `%/social/screens/${day}/drops/%`).first();
  if (already) return { enabled: true, inserted: 0, reason: 'drops_already_today', post_id: already.post_id };
  const post = normalizeSocialPost({
    post_id: postId, platform: 'INSTAGRAM', campaign_id: DROPS_DAILY.campaign_id, content_id: DROPS_DAILY.content_id,
    caption: SCREEN_POSTS.drops.caption, link: screenLink('INSTAGRAM', 'drops', dateKey), media_url: '',
    media_urls: screenMediaUrls(dateKey, 'drops', count), scheduled_at: scheduledAt.toISOString(), status: 'APPROVED', content_format: 'IMAGE'
  });
  const at = now.toISOString();
  const result = await env.PRODUCT_DB.prepare(`INSERT OR IGNORE INTO social_post_queue
      (post_id,platform,campaign_id,content_id,caption,link,media_url,scheduled_at,status,affiliate,external_post_id,last_error,approved_at,published_at,
       created_at,updated_at,platform_job_id,creative_asset_id,content_format,creative_policy,jst_publish_date,ai_generated,crosspost_group_id,media_urls)
      VALUES (?1,'INSTAGRAM',?2,?3,?4,?5,'',?6,'APPROVED',0,'','',?7,'',?7,?7,'','','IMAGE','',?8,0,'',?9)`)
    .bind(postId, DROPS_DAILY.campaign_id, post.content_id, post.caption, post.link, scheduledAt.toISOString(), at, dateKey, post.media_urls).run();
  const inserted = Number(result?.meta?.changes || 0);
  let synced = 0;
  if (!inserted) {
    const sync = await env.PRODUCT_DB.prepare(`UPDATE social_post_queue SET media_urls=?2,updated_at=?3
        WHERE post_id=?1 AND status='APPROVED' AND published_at='' AND external_post_id='' AND platform_job_id='' AND media_urls<>?2`)
      .bind(postId, post.media_urls, at).run();
    synced = Number(sync?.meta?.changes || 0);
  }
  return { enabled: true, inserted, synced, post_id: postId, slides: count };
}

export function jstDateKey(now = new Date()) {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

export function screenMediaUrls(dateKey, setId, count = 5) {
  const day = String(dateKey).replaceAll('-', '');
  return Array.from({ length: count }, (_, index) => `https://hoshilu.app/social/screens/${day}/${setId}/${index + 1}.jpg`);
}

export function screenLink(platform, setId, dateKey) {
  const url = new URL(SCREEN_POSTS[setId].link_path, 'https://hoshilu.app/');
  url.searchParams.set('utm_source', platform === 'THREADS' ? 'threads' : 'instagram');
  url.searchParams.set('utm_medium', 'organic_social');
  url.searchParams.set('utm_campaign', 'hoshilu_real_screens');
  url.searchParams.set('utm_content', `screens-${setId}_${String(dateKey).replaceAll('-', '')}`);
  return url.toString();
}

// 行 → 使いたいセット（優先順）。セラー向けは seller だけ（ユーザー向けの画面でセラー募集はしない）。
export function screenSetsForRow(row = {}, dateKey = '') {
  const identity = `${row.content_id || ''} ${row.link || ''}`;
  if (/seller|for-sellers/iu.test(identity)) return ['seller'];
  // 2026-10-17 大隆さん「ユーザー向け販促は今日からこの感じ（値下がり中の実画像）に変えていこう」:
  // ユーザー向けは毎日「値下がり中」を主役にする。撮れていない日だけ次の候補（ホシルバズ・買い物ノート）。
  void dateKey;
  return ['drops', 'buzz', 'notes'];
}

export async function loadScreensManifest(env, dateKey) {
  if (!env?.ASSETS?.fetch) return null;
  const day = String(dateKey).replaceAll('-', '');
  try {
    const response = await env.ASSETS.fetch(new Request(`https://hoshilu.app/social/screens/${day}/manifest.json`));
    if (!response.ok) return null;
    const manifest = await response.json();
    return manifest && typeof manifest.sets === 'object' && manifest.sets ? manifest : null;
  } catch {
    return null;
  }
}

function availableSet(manifest, setId) {
  const files = manifest?.sets?.[setId]?.files;
  return Array.isArray(files) && files.length >= 2 && files.length <= 10 ? files.length : 0;
}

// 今日の未投稿のフィード投稿を実画像に差し替える。戻り値は差し替えた件数。
export const SELLER_SCREENS_REPEAT_DAYS = 14;

export async function applyRealScreens(env, now = new Date()) {
  if (!env?.PRODUCT_DB || env.SOCIAL_REAL_SCREENS_ENABLED === 'false') return { enabled: false, updated: 0 };
  const dateKey = jstDateKey(now);
  if (dateKey < SCREENS_START_JST) return { enabled: true, updated: 0, reason: 'before_start' };
  const notBefore = new Date(now.getTime() + 2 * 60 * 1000).toISOString();
  const rows = (await env.PRODUCT_DB.prepare(`SELECT post_id,platform,campaign_id,content_id,link,media_url,media_urls
    FROM social_post_queue WHERE jst_publish_date=?1 AND status='APPROVED' AND published_at='' AND external_post_id=''
      AND platform_job_id='' AND scheduled_at>?2 AND platform IN ('INSTAGRAM','THREADS')
      AND campaign_id IN ('${TARGET_CAMPAIGNS.join("','")}')
      AND media_urls NOT LIKE '%/social/screens/%' AND media_url NOT LIKE '%/social/screens/%'`)
    .bind(dateKey, notBefore).all()).results || [];
  if (!rows.length) return { enabled: true, updated: 0 };
  const manifest = await loadScreensManifest(env, dateKey);
  if (!manifest) return { enabled: true, updated: 0, reason: 'no_screens_today' };
  let updated = 0;
  let cancelled = 0;
  // 2026-10-17 大隆さん「昨日と同じ投稿してたから削除した」: セラー向けの実画像（seller セット）は毎日ほぼ同じ画面になる。
  // Instagram に直近 14 日で出していれば、その日のセラー向けの行は出さない（同じ画像の投稿を続けない）。
  const sellerSince = new Date(now.getTime() - SELLER_SCREENS_REPEAT_DAYS * DAY_MS).toISOString();
  const sellerRecent = await env.PRODUCT_DB.prepare(`SELECT post_id FROM social_post_queue WHERE platform='INSTAGRAM' AND status='PUBLISHED'
      AND media_urls LIKE '%/social/screens/%/seller/%' AND published_at>=?1 LIMIT 1`).bind(sellerSince).first();
  for (const row of rows) {
    const setId = screenSetsForRow(row, dateKey).find((id) => availableSet(manifest, id));
    if (!setId) continue;
    if (setId === 'seller' && row.platform === 'INSTAGRAM' && sellerRecent) {
      const result = await env.PRODUCT_DB.prepare(`UPDATE social_post_queue SET status='CANCELLED',last_error='SELLER_SCREENS_SHOWN_RECENTLY',updated_at=?2
          WHERE post_id=?1 AND status='APPROVED' AND published_at='' AND external_post_id='' AND platform_job_id=''`)
        .bind(row.post_id, now.toISOString()).run();
      cancelled += Number(result?.meta?.changes || 0);
      continue;
    }
    const count = availableSet(manifest, setId);
    const urls = screenMediaUrls(dateKey, setId, count);
    if (row.platform === 'THREADS') {
      // Threads（買い物ノートの木曜枠）は表紙 1 枚だけ差し替え、本文はそのまま。
      const result = await env.PRODUCT_DB.prepare(`UPDATE social_post_queue SET media_url=?2,updated_at=?3
          WHERE post_id=?1 AND status='APPROVED' AND published_at='' AND external_post_id='' AND platform_job_id=''`)
        .bind(row.post_id, urls[0], now.toISOString()).run();
      updated += Number(result?.meta?.changes || 0);
      continue;
    }
    // Instagram は全枚と本文を差し替える。content_id は seller-… / screens-…（normalizeSocialPost がセラー投稿を見分ける）。
    const post = normalizeSocialPost({
      post_id: row.post_id,
      platform: row.platform,
      campaign_id: row.campaign_id,
      content_id: setId === 'seller' ? 'seller-screens' : `screens-${setId}`,
      caption: SCREEN_POSTS[setId].caption,
      link: screenLink(row.platform, setId, dateKey),
      media_url: '',
      media_urls: urls,
      scheduled_at: new Date(now.getTime() + DAY_MS).toISOString(),
      status: 'APPROVED',
      content_format: 'IMAGE'
    });
    const result = await env.PRODUCT_DB.prepare(`UPDATE social_post_queue SET content_id=?2,caption=?3,link=?4,media_urls=?5,updated_at=?6
        WHERE post_id=?1 AND status='APPROVED' AND published_at='' AND external_post_id='' AND platform_job_id=''`)
      .bind(row.post_id, post.content_id, post.caption, post.link, post.media_urls, now.toISOString()).run();
    updated += Number(result?.meta?.changes || 0);
  }
  return { enabled: true, updated, cancelled };
}
