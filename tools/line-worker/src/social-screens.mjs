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
  // 2026-10-17 大隆さん「値下がり中のリアル画像で販促」: 値下がりの記事枠と、ユーザー向けの 3 日のうち 2 日は「値下がり中」を主役にする。
  // 撮れていない日は次の候補（買い物ノート・ホシルバズ）。
  if (row.campaign_id === 'hoshilu-media-notes') return /price-drops/u.test(identity) ? ['drops', 'notes', 'buzz'] : ['notes', 'buzz'];
  const dayNumber = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / DAY_MS);
  const cycle = ((dayNumber % 3) + 3) % 3;
  return cycle === 0 ? ['buzz', 'drops', 'notes'] : cycle === 1 ? ['drops', 'notes', 'buzz'] : ['drops', 'buzz', 'notes'];
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
  for (const row of rows) {
    const setId = screenSetsForRow(row, dateKey).find((id) => availableSet(manifest, id));
    if (!setId) continue;
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
  return { enabled: true, updated };
}
