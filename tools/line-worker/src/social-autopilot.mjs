import {
  normalizeSocialPost,
  runDueSocialPosts,
  socialPublisherReadinessWithStoredCredentials,
  syncInstagramPublishedPermalinks,
  syncThreadsInsights,
  xPublishingSafetyReadiness
} from './social-publisher.mjs';

const CAMPAIGN_ID = 'hoshilu-official-13mall-v2';
const FEATURE_LAUNCH_DATE = '2026-08-09';
// Amazonアソシエイトはアカウント作成から180日以内に適格販売3件が必要
// (期限2027-02-09)。現状のペースでは届かない試算のため、Threadsの投稿は
// 汎用の13モール訴求ではなく、Amazonが強いカテゴリ(本・家電・日用品)の
// 検索例でAmazonクリックを底上げすることを優先する。価格はSNS本文に直書き
// せず(Amazonアソシエイト規約)、affiliate:trueで開示文を必ず付ける。
const THREADS_AMAZON_CAMPAIGN_ID = 'hoshilu-threads-amazon-boost-v1';
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

const X_NON_VIDEO_POSTS = Object.freeze([
  {
    id: 'howto-description-search',
    caption: '商品名が分からなくても大丈夫。色・形・用途・見た場所を文章で入力すると、HOSHILUが探せる検索語に整理します。',
    query: '名前は分からないけど、通勤バッグの中で自立する本革トートバッグ'
  },
  {
    id: 'howto-price-compare',
    caption: '候補を見つけたら「AI最安比較」へ。確認済み価格とAIによる参考価格を区別しながら、購入先を見比べられます。',
    query: 'スモーキークォーツのおしゃれなリング'
  },
  {
    id: 'howto-price-alert',
    caption: '今すぐ買わない商品は「値下がり通知☑」へ。希望価格を保存し、APIで確認できた価格が条件を満たした時に知らせます。',
    query: '軽くて持ち運べる小型写真プリンター'
  },
  {
    id: 'search-example-memory',
    caption: '検索例：「動画で見た、バッグにつける小さいぬいぐるみ」。正式名を知らなくても、覚えている特徴から探せます。',
    query: '動画で見た、バッグにつける小さいぬいぐるみ'
  },
  // 2026-08-19 大隆さん指示: 若者向けにHOSHILU BUZZ(/buzz)もSNS投稿へ
  // 織り交ぜる。数値・人気の断定はせず、順位根拠(モール公式ランキング)を
  // 本文に明記する。link_pathは/buzzへ直接送る(検索qは付けない)。
  {
    id: 'buzz-shelves-intro',
    caption: '「今、これ来てる」を小ジャンル別にまとめたHOSHILU BUZZができました。順位はモール公式ランキングだけが根拠。欲しい商品が決まっていなくても、開けば何か見つかるかも。',
    link_path: '/buzz'
  },
  {
    id: 'buzz-budget-shelves',
    caption: '3,000円以下・5,000円以下で、いま売れている商品だけを集めた棚をHOSHILU BUZZに用意しました。価格を確認できた商品だけを載せています。予算から探したい日はこちら。',
    link_path: '/buzz'
  }
]);

const INSTAGRAM_GUIDE_POSTS = Object.freeze([
  {
    id: 'guide-search-screen',
    caption: '操作案内① 検索欄へ、商品名ではなく覚えている特徴をそのまま入力。色・形・用途・見た場所を足すほど候補を絞れます。@hoshilu.app',
    query: '名前は分からないけど、床に置いても自立する本革トートバッグ',
    media_url: 'https://hoshilu.app/social/runway/hoshilu-product-screen-v1.jpg'
  },
  {
    id: 'guide-cross-market',
    caption: '操作案内② HOSHILUで検索語を整理したら、対応モールを同じ条件で見比べます。検索結果の根拠と価格確認状況も分けて表示します。@hoshilu.app',
    query: 'スモーキークォーツのおしゃれなリング',
    media_url: 'https://hoshilu.app/social/instagram-ambiguous-four-market-v1.png'
  },
  {
    id: 'guide-save-alert',
    caption: '操作案内③ 気になる商品は保存して値下がり通知へ。買いたい価格を決めて、確認済み価格の変化を待てます。@hoshilu.app',
    query: '軽くて持ち運べる小型写真プリンター',
    media_url: 'https://hoshilu.app/social/instagram-want-poll-v1.png'
  }
]);

const FEATURE_LAUNCH = Object.freeze({
  X: 'HOSHILU正式版を公開。説明から検索語を整理し、楽天市場・Yahoo!ショッピングをまとめて比較。Amazonを含む最大13モールへ同じ検索語でつなぎます。ランキング、AI最安比較、値下がり通知にも対応。 #ホシル #商品検索',
  INSTAGRAM: 'HOSHILU正式版の機能を12秒で紹介します。\n① 説明から検索語を整理\n② 最大13モールを同じ検索語で横断\n③ ランキングとAI最安比較\n④ 値下がり通知☑で購入したい価格を保存\n\n名前が分からない「欲しいもの」をコメントで教えてください。次の検索動画で試します。@hoshilu.app\n#商品検索 #価格比較 #ネットショッピング #買い物好きな人と繋がりたい',
  media_url: 'https://hoshilu.app/social/hoshilu-feature-reel-13mall-v1.mp4'
});

// Amazonが強い(在庫・レビューが厚い)カテゴリの検索例に絞った、Threads専用の
// 常設ローテーション。1日2枠(昼・夜)で先頭から順番に消費する。
//
// 2026-08-17: 4本→20本へ拡張した。4本しかなかった頃は同じ文面が4日ごとに
// 再投稿され、月7回同じ文章が出る状態だった。楽天アフィリエイトガイドライン
// の重複投稿禁止に触れうるうえ、Meta側のスパム判定リスクもある。
//
// うち5本(index 3・7・11・15・19)は affiliate:false のリンク無し投稿。
// claude/hoshilu_affiliate_ops_spec_v1.0.md 第2部が「アカウントが宣伝botでは
// ないことを示す」ために全体の25%を非アフィリエイト投稿にする設計としており、
// 4本時代はこの枠が丸ごと抜けていた(全件アフィリエイトリンク付き)。
// Amazonアソシエイトの承認メールは「3件の適格販売が発生した段階で、紐づいて
// いるWebサイトまたはSNSを審査する」と明記しているので、リンクだけの
// アカウントに見えることは実害になりうる。
//
// 非アフィリエイト枠は query を持たない=リンクを付けない。affiliate:false の
// ときは social-publisher.mjs の normalizeSocialPost がPR表記を付けないので、
// 「広告ではないのにPR表記がある」という逆向きの不正確さも起きない。
const THREADS_AMAZON_POSTS = Object.freeze([
  {
    id: 'amazon-boost-books',
    caption: '読みたかったのに、正式なタイトルを忘れてしまった本。覚えている表紙の色やあらすじの断片からHOSHILUで検索すると、Amazonを含む複数モールを一度に見比べられます。',
    query: '表紙が青くてタイトルを忘れた海外小説'
  },
  {
    id: 'amazon-boost-appliances',
    caption: '地味に助かる小型家電ほど、正式名称が分からないもの。使う場所や機能の特徴で検索すれば、Amazonの在庫・レビューも他モールと一緒に比較できます。',
    query: '布団を素早く乾かす小型の家電'
  },
  {
    id: 'amazon-boost-daily-goods',
    caption: '切れてから気づく日用品のストック。置き場所や見た目の特徴でHOSHILUに入力すると、Amazonを含めた対応モールをまとめて確認できます。',
    query: 'キッチンの排水溝に使う小さいゴミ受けネット'
  },
  {
    id: 'trust-how-to-describe',
    caption: '商品名が分からないときは、名前をひねり出そうとしなくて大丈夫です。「どこで使うか」「何に困っているか」をそのまま入れたほうが、たいてい早く見つかります。'
  },
  {
    id: 'amazon-boost-reviews',
    caption: '「これAmazonにあるかな」も、HOSHILUで検索すれば他モールの選択肢と一緒に確認できます。レビュー件数や評価も比較の参考にどうぞ。',
    query: '軽くて持ち運べる小型写真プリンター'
  },
  {
    id: 'amazon-boost-kitchen',
    caption: '作り置きを始めると急に足りなくなる保存容器。冷凍したいのか、そのまま温めたいのかで選ぶものが変わります。用途で検索すると、Amazonを含む各モールの候補を並べて見られます。',
    query: '冷凍してそのままレンジで温められる保存容器'
  },
  {
    id: 'amazon-boost-storage',
    caption: 'クローゼットの上の段を、あと少しだけ使いこなしたい。奥行きや高さの条件から探すと、Amazonを含む複数モールの収納用品をまとめて比較できます。',
    query: 'クローゼット上段の奥行きが深い場所に置く収納ケース'
  },
  {
    id: 'trust-why-multiple-malls',
    caption: '同じ商品でも、扱っているモールによって在庫も配送も違います。1つのモールだけ見て「無い」と判断してしまうのがいちばんもったいないので、HOSHILUは横断して確認できるようにしています。'
  },
  {
    id: 'amazon-boost-stationery',
    caption: '書き心地が気に入っていたペン、軸の色しか覚えていない。特徴を言葉にして検索すると、Amazonを含む取扱モールの候補から絞り込めます。',
    query: 'インクが早く乾く細字のボールペン'
  },
  {
    id: 'amazon-boost-hobby',
    caption: '久しぶりに趣味を再開すると、消耗品の名前を忘れているもの。何をするための道具かで検索すれば、Amazonを含む各モールの在庫を確認できます。',
    query: '刺繍で使う輪っかの形をした固定する道具'
  },
  {
    id: 'amazon-boost-pet',
    caption: 'うちの子にちょうどいいサイズが分からない。体格や使う場所の条件で探すと、Amazonを含む複数モールのペット用品を見比べられます。',
    query: '小型犬用の折りたためる移動用キャリー'
  },
  {
    id: 'trust-no-price-in-post',
    caption: 'HOSHILUの投稿では価格を書きません。モールも時期も違えば値段は変わるので、こちらで数字を書くと必ず古くなります。実際の価格は、その場でご確認ください。'
  },
  {
    id: 'amazon-boost-baby',
    caption: '育児用品は「いつ使うものか」で名前がまるで違います。月齢や場面から検索すると、Amazonを含む各モールの候補を一度に確認できます。',
    query: '寝返りを始めた赤ちゃんの転落を防ぐベッド用の柵'
  },
  {
    id: 'amazon-boost-car',
    caption: '車内のちょっとした不便は、たいてい既に解決する道具があります。困っている場面をそのまま入れると、Amazonを含む取扱モールから候補が出てきます。',
    query: '運転席のドリンクホルダーを増やす後付けの台'
  },
  {
    id: 'amazon-boost-tools',
    caption: '一度きりの作業のために工具を買うのは気が引ける。何をしたいかで検索すると、Amazonを含む複数モールで手頃な選択肢を比較できます。',
    query: '家具の組み立てに使う小さい電動ドライバー'
  },
  {
    id: 'trust-child-and-senior',
    caption: 'HOSHILUは、正式な商品名を知らない人が使えることを大事にしています。お子さんやご高齢の方が、思いついた言葉のまま入力しても探せることを目指しています。'
  },
  {
    id: 'amazon-boost-health',
    caption: '肩や腰のつらさを和らげる道具は種類が多くて選びにくいもの。どこがどうつらいかで検索すると、Amazonを含む各モールの候補を並べて確認できます。',
    query: '座ったまま腰を支えるクッション'
  },
  {
    id: 'amazon-boost-cable',
    caption: 'ケーブル類は規格の名前が覚えづらい。つなぎたい機器の組み合わせで検索すれば、Amazonを含む取扱モールから合うものを絞り込めます。',
    query: 'ノートパソコンとテレビをつなぐ映像用のケーブル'
  },
  {
    id: 'amazon-boost-seasonal',
    caption: '季節家電は、必要になってから探すと選ぶ時間がありません。置き場所や使い方の条件で先に見ておくと、Amazonを含む各モールの在庫を落ち着いて比較できます。',
    query: '狭い部屋でも使える静かな衣類乾燥用の除湿機'
  },
  {
    id: 'trust-not-found-is-ok',
    caption: '探しても見つからなかった検索は、HOSHILUにとって一番の手がかりです。どんな言葉で探されたかを匿名で集計して、次に同じ言葉で探した人が見つけられるように改善しています。'
  }
]);

// 昼と夜の2枠。投稿量を増やすために夜枠を足した。
const THREADS_AMAZON_SLOTS = Object.freeze([
  // 既存キューとの互換のため、昼枠のpost_idには接尾辞を付けない。1日1本だった
  // 頃に積まれた `{campaign}-{JST日付}` の行をそのまま更新でき、同じ日に
  // 2本重複して積まれることがない。
  { suffix: '', hour: 12, minute: 30 },
  { suffix: '-pm', hour: 20, minute: 30 }
]);

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

function campaignLink(platform, date, content = date, searchQuery = '', path = '/') {
  const params = new URLSearchParams({
    utm_source: platform === 'X' ? 'x' : 'instagram',
    utm_medium: 'social',
    utm_campaign: CAMPAIGN_ID,
    utm_content: content
  });
  if (searchQuery) params.set('q', searchQuery);
  return `https://hoshilu.app${path}?${params}`;
}

// query を持たない=非アフィリエイト枠。リンクを付けない。
function threadsAmazonLink(content) {
  if (!content.query) return '';
  const params = new URLSearchParams({
    utm_source: 'threads',
    utm_medium: 'social',
    utm_campaign: THREADS_AMAZON_CAMPAIGN_ID,
    utm_content: content.id,
    q: content.query
  });
  return `https://hoshilu.app/?${params}`;
}

// 依頼2(Threads publisher)と同じ180日/3件のAmazon適格販売という制約に対する
// 施策なので、13モール汎用ローテーションとは別の関数に分けている。1日1本、
// THREADS_AMAZON_POSTSを順番に繰り返す。
export function buildThreadsAmazonBoostPosts(now = new Date(), days = 14) {
  const posts = [];
  const start = new Date(now.getTime() + JST_OFFSET_MS);
  start.setUTCHours(0, 0, 0, 0);
  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(start.getTime() + offset * DAY_MS - JST_OFFSET_MS);
    const parts = jstDateParts(day);
    const key = dateKey(parts);
    const dayIndex = Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS);
    THREADS_AMAZON_SLOTS.forEach((slot, slotIndex) => {
      // 1日2枠なので、通し番号も2枠ぶん進める。20本を2本/日で消費するため
      // 一巡は10日。同じ文面が再登場するまでの間隔を最大化する。
      const rotation = (dayIndex * THREADS_AMAZON_SLOTS.length + slotIndex) % THREADS_AMAZON_POSTS.length;
      const content = THREADS_AMAZON_POSTS[rotation];
      const link = threadsAmazonLink(content);
      posts.push(normalizeSocialPost({
        post_id: `${THREADS_AMAZON_CAMPAIGN_ID}-${key}${slot.suffix}`,
        content_id: content.id,
        platform: 'THREADS',
        campaign_id: THREADS_AMAZON_CAMPAIGN_ID,
        caption: content.caption,
        link,
        affiliate: Boolean(link),
        scheduled_at: scheduledAt(parts, slot.hour, slot.minute),
        status: 'APPROVED'
      }));
    });
  }
  return posts.filter(post => Date.parse(post.scheduled_at) > now.getTime());
}

export function buildSocialAutopilotPosts(now = new Date(), days = 14) {
  const posts = [];
  const start = new Date(now.getTime() + JST_OFFSET_MS);
  start.setUTCHours(0, 0, 0, 0);
  // InstagramとXは月・水・金の週3回。同じ訴求動画を両方へ配信し、
  // 動画生成費を二重に発生させない。
  const weekdayContent = new Map([[1, 0], [3, 1], [5, 0]]);

  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(start.getTime() + offset * DAY_MS - JST_OFFSET_MS);
    const parts = jstDateParts(day);
    const key = dateKey(parts);
    if (weekdayContent.has(parts.weekday)) {
      const contentIndex = weekdayContent.get(parts.weekday);
      const content = INSTAGRAM_POSTS[contentIndex];
      posts.push(normalizeSocialPost({
        post_id: `${CAMPAIGN_ID}-x-${key}`,
        content_id: `evergreen-x-${contentIndex + 1}`,
        platform: 'X',
        campaign_id: CAMPAIGN_ID,
        caption: key === FEATURE_LAUNCH_DATE ? FEATURE_LAUNCH.X : X_POSTS[contentIndex],
        link: campaignLink('X', key),
        media_url: content.media_url,
        scheduled_at: scheduledAt(parts, 20, 15),
        status: 'APPROVED'
      }));
    } else {
      const content = X_NON_VIDEO_POSTS[Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS)
        % X_NON_VIDEO_POSTS.length];
      posts.push(normalizeSocialPost({
        post_id: `${CAMPAIGN_ID}-x-guide-${key}`,
        content_id: content.id,
        platform: 'X',
        campaign_id: CAMPAIGN_ID,
        caption: content.caption,
        link: campaignLink('X', key, content.id, content.query, content.link_path || '/'),
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
    if (weekdayContent.has(parts.weekday)) {
      const contentIndex = weekdayContent.get(parts.weekday);
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
    } else if ([2, 4, 6].includes(parts.weekday)) {
      const content = INSTAGRAM_GUIDE_POSTS[Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS)
        % INSTAGRAM_GUIDE_POSTS.length];
      posts.push(normalizeSocialPost({
        post_id: `${CAMPAIGN_ID}-instagram-guide-${key}`,
        content_id: content.id,
        platform: 'INSTAGRAM',
        campaign_id: CAMPAIGN_ID,
        caption: content.caption,
        link: campaignLink('INSTAGRAM', key, content.id, content.query),
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
  // Amazon適格販売3件を優先する専用ローテーション。Threadsの認証情報とは
  // 独立に、他の常設シリーズと同じ「明示的な自動運用オプトイン」を要求する。
  const threadsAmazonBoost = buildThreadsAmazonBoostPosts(now).filter(() => (
    env.THREADS_EVERGREEN_AUTOPILOT_ENABLED === 'true'
  ));
  const xPublishingSafety = xPublishingSafetyReadiness(env);
  const posts = [...approvedModelReel, ...evergreen, ...threadsAmazonBoost]
    .filter(post => readiness[post.platform]
      && (post.platform !== 'X' || (
        xPublishingSafety.ready && env.X_EVERGREEN_AUTOPILOT_ENABLED === 'true'
      )));
  let inserted = 0;
  for (const post of posts) {
    const result = await env.PRODUCT_DB.prepare(`INSERT INTO social_post_queue
      (post_id,platform,campaign_id,content_id,caption,link,media_url,scheduled_at,status,
       affiliate,approved_at,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'APPROVED',?9,?10,?10,?10)
      ON CONFLICT(post_id) DO UPDATE SET content_id=excluded.content_id,
        caption=excluded.caption,link=excluded.link,media_url=excluded.media_url,
        scheduled_at=excluded.scheduled_at,affiliate=excluded.affiliate,updated_at=excluded.updated_at
      WHERE social_post_queue.status='APPROVED'`)
      .bind(post.post_id, post.platform, post.campaign_id, post.content_id, post.caption,
        post.link, post.media_url, post.scheduled_at, post.affiliate ? 1 : 0, now.toISOString()).run();
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
  const threadsInsights = await syncThreadsInsights(env, now, fetchImpl);
  return { seeded, published, permalinks, threadsInsights };
}
