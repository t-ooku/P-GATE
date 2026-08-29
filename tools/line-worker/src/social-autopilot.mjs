import {
  normalizeSocialPost,
  runDueSocialPosts,
  socialPublisherReadinessWithStoredCredentials,
  syncInstagramPublishedPermalinks,
  syncThreadsInsights,
  xPublishingSafetyReadiness
} from './social-publisher.mjs';
import { buzzThemeFor } from './buzz-shelf.mjs';

const CAMPAIGN_ID = 'hoshilu-official-13mall-v2';
const NEW_SEARCH_LAUNCH_UTM_CAMPAIGN = 'hoshilu-new-search-launch-20260829';
const NEW_SEARCH_PROMO_CONTENT_IDS = new Set([
  'howto-four-input-search',
  'continuous-search',
  'guide-search-screen',
  'guide-continuous-search'
]);
const DAILY_AI_ACTRESS_CAMPAIGN_ID = 'hoshilu-ai-actress-daily-v1';
const DAILY_AI_ACTRESS_POLICY = 'DAILY_AI_ACTRESS_22';
const DAILY_AI_ACTRESS_PERSONA_ID = 'hoshilu-approved-model-reference-v2';
const DAILY_AI_DISCLOSURE = '※この動画はAI生成・AI加工映像です。 #AI生成';
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
const SOCIAL_ROTATION_EPOCH_MONDAY_UTC = Date.UTC(2026, 7, 24);
const DAILY_CONTENT_TOPICS = Object.freeze({
  PHOTO: 'PHOTO_SEARCH',
  SCREENSHOT: 'SCREENSHOT_SEARCH',
  SOCIAL_POST_URL: 'SOCIAL_POST_URL_SEARCH',
  BUZZ: 'HOSHILU_BUZZ',
  AMBIGUOUS_SEARCH: 'AMBIGUOUS_SEARCH'
});

// The seven reels are deliberately scoped as a weekly owned series. The
// creative-assets ledger validates persona v2, age 22, actress presence, audio,
// rights and QA before a queue row using this policy can be published. Caption
// topics are explicit plan metadata: the approved video keeps its primary
// visual theme, while the post copy combines at least two truthful product
// features each day. Every seven-day cycle covers all five caption topics, and
// the five BUZZ-led videos keep their matching /buzz destination.
const DAILY_AI_ACTRESS_REELS = Object.freeze([
  Object.freeze({
    weekday: 'sun',
    creative_asset_id: 'hoshilu_ai_actress_daily_sun_v1',
    media_url: 'https://hoshilu.app/social/hoshilu-ai-actress-daily-sun-v1.mp4',
    caption: '日曜日は、撮った写真から名前の分からない商品を探すか、HOSHILU BUZZの韓国トレンドをチェック。',
    topics: Object.freeze([
      DAILY_CONTENT_TOPICS.PHOTO,
      DAILY_CONTENT_TOPICS.BUZZ,
      DAILY_CONTENT_TOPICS.AMBIGUOUS_SEARCH
    ]),
    link_path: '/buzz'
  }),
  Object.freeze({
    weekday: 'mon',
    creative_asset_id: 'hoshilu_ai_actress_daily_mon_v1',
    media_url: 'https://hoshilu.app/social/hoshilu-ai-actress-daily-mon-v1.mp4',
    caption: '月曜日は「撮ってホシル」。カメラで撮る、保存画像・スクショ、HOSHILU対応の公開SNS投稿URL（投稿単体）、一言。名前が分からない欲しい物を手がかりから探そう。',
    topics: Object.freeze([
      DAILY_CONTENT_TOPICS.PHOTO,
      DAILY_CONTENT_TOPICS.SCREENSHOT,
      DAILY_CONTENT_TOPICS.SOCIAL_POST_URL,
      DAILY_CONTENT_TOPICS.AMBIGUOUS_SEARCH
    ])
  }),
  Object.freeze({
    weekday: 'tue',
    creative_asset_id: 'hoshilu_ai_actress_daily_tue_v1',
    media_url: 'https://hoshilu.app/social/hoshilu-ai-actress-daily-tue-v1.mp4',
    caption: '火曜日は韓国トレンド枠。名前が分からない商品を撮った写真から探すか、HOSHILU BUZZからQoo10・SHEINを含む検索先へ。',
    topics: Object.freeze([
      DAILY_CONTENT_TOPICS.PHOTO,
      DAILY_CONTENT_TOPICS.BUZZ,
      DAILY_CONTENT_TOPICS.AMBIGUOUS_SEARCH
    ]),
    link_path: '/buzz'
  }),
  Object.freeze({
    weekday: 'wed',
    creative_asset_id: 'hoshilu_ai_actress_daily_wed_v1',
    media_url: 'https://hoshilu.app/social/hoshilu-ai-actress-daily-wed-v1.mp4',
    caption: '水曜日はHOSHILU BUZZをチェック。ランキングで気になった商品は、スクショからも探せます。',
    topics: Object.freeze([
      DAILY_CONTENT_TOPICS.SCREENSHOT,
      DAILY_CONTENT_TOPICS.BUZZ
    ]),
    link_path: '/buzz'
  }),
  Object.freeze({
    weekday: 'thu',
    creative_asset_id: 'hoshilu_ai_actress_daily_thu_v1',
    media_url: 'https://hoshilu.app/social/hoshilu-ai-actress-daily-thu-v1.mp4',
    caption: '木曜日は、Instagram・TikTok・XなどHOSHILU対応の公開SNS投稿URL（投稿単体）か、うろ覚えの一言から検索。見つけた商品を最大13モールへ。',
    topics: Object.freeze([
      DAILY_CONTENT_TOPICS.SOCIAL_POST_URL,
      DAILY_CONTENT_TOPICS.AMBIGUOUS_SEARCH
    ])
  }),
  Object.freeze({
    weekday: 'fri',
    creative_asset_id: 'hoshilu_ai_actress_daily_fri_v1',
    media_url: 'https://hoshilu.app/social/hoshilu-ai-actress-daily-fri-v1.mp4',
    caption: '金曜日はHOSHILU BUZZをチェック。ランキングで気になった商品は、撮った写真やスクショからも探せます。',
    topics: Object.freeze([
      DAILY_CONTENT_TOPICS.PHOTO,
      DAILY_CONTENT_TOPICS.SCREENSHOT,
      DAILY_CONTENT_TOPICS.BUZZ
    ]),
    link_path: '/buzz'
  }),
  Object.freeze({
    weekday: 'sat',
    creative_asset_id: 'hoshilu_ai_actress_daily_sat_v1',
    media_url: 'https://hoshilu.app/social/hoshilu-ai-actress-daily-sat-v1.mp4',
    caption: '土曜日は、HOSHILU対応の公開SNS投稿URL（投稿単体）とうろ覚えの一言から、名前の分からない商品を検索。迷ったらHOSHILU BUZZもチェック。',
    topics: Object.freeze([
      DAILY_CONTENT_TOPICS.SOCIAL_POST_URL,
      DAILY_CONTENT_TOPICS.BUZZ,
      DAILY_CONTENT_TOPICS.AMBIGUOUS_SEARCH
    ]),
    link_path: '/buzz'
  })
]);
const DAILY_AI_ACTRESS_ASSETS = new Map(
  DAILY_AI_ACTRESS_REELS.map((reel) => [reel.creative_asset_id, reel])
);

// The owner explicitly approved both 2026-08-28 cross-post rows for release
// after they were held as completed-video replays. Keep the exception scoped to
// those exact queue identities; later replays still require a newly varied and
// reviewed creative under HOSHILU_REELS_AUDIO_DIRECTION_v1.0.
const USER_APPROVED_REPLAY_POST_IDS = new Set([
  'hoshilu-official-13mall-v2-x-2026-08-28',
  'hoshilu-official-13mall-v2-instagram-2026-08-28'
]);

// BUZZ、検索操作、価格通知を一つの補助枠で循環させる。新機能ローンチの
// 2投稿は初週に出る位置へ置き、その後も非セラー枠だけで均等に回す。
const X_NON_VIDEO_POSTS = Object.freeze([
  {
    id: 'buzz-shelves-intro',
    caption: '「今、これ来てる」を小ジャンル別にまとめたHOSHILU BUZZができました。順位はモール公式ランキングだけが根拠。欲しい商品が決まっていなくても、開けば何か見つかるかも。',
    link_path: '/buzz'
  },
  {
    id: 'howto-price-compare',
    caption: '候補を見つけたら「AI最安比較」へ。確認済み価格とAIによる参考価格を区別しながら、購入先を見比べられます。',
    query: 'スモーキークォーツのおしゃれなリング'
  },
  {
    id: 'howto-four-input-search',
    caption: '検索の手がかりは4通り。カメラで撮る、保存画像・スクショ、Instagram・TikTok・XなどHOSHILU対応の公開SNS投稿URL（投稿単体）、うろ覚えの一言。どれか1つから候補と検索語を整理します。非対応・非公開投稿は画像か一言を追加。'
  },
  {
    id: 'continuous-search',
    caption: '1回で見つからなくても、そこで終わりじゃない。「見つかるまで探す」を無料会員で有効にするとHOSHILUが定期的に検索し、新しく一致する実在商品が見つかった時だけお知らせします。値下げ通知とは別機能です。'
  },
  {
    id: 'howto-price-alert',
    caption: '今すぐ買わない商品は「購入希望価格ウォッチ☑」へ。希望価格を保存し、APIで確認できた価格がその金額以下になった時に知らせます。',
    query: '軽くて持ち運べる小型写真プリンター'
  },
  {
    id: 'buzz-budget-shelves',
    caption: '3,000円以下・5,000円以下で、いま売れている商品だけを集めた棚をHOSHILU BUZZに用意しました。価格を確認できた商品だけを載せています。予算から探したい日はこちら。',
    link_path: '/buzz'
  },
  // 2026-08-19 大隆さん指示: 韓流に繋がるBUZZ棚の常設に合わせて紹介投稿も追加。
  {
    id: 'buzz-korean-beauty',
    caption: '韓国コスメの高評価トレンドをまとめた棚がHOSHILU BUZZにあります。順位はYahoo!ショッピング公式ランキングだけが根拠。気になった商品はQoo10など他モールへの横断検索にもつながります。',
    link_path: '/buzz'
  },
  {
    id: 'buzz-open-first',
    caption: '欲しい商品が決まってない夜ほど、ランキングから。HOSHILU BUZZはモール公式ランキングをもとに、小ジャンルごとに1位から見られます。次に欲しくなるもの、先に見つけよう。',
    link_path: '/buzz'
  },
  {
    id: 'search-no-name-needed',
    caption: '名前が分からない。それ、検索できない理由じゃない。見た目・使い方・見かけた場所をそのままHOSHILUへ。',
    query: '韓国っぽい、透明で小さいワイヤレスイヤホン'
  }
]);
const X_BUZZ_POSTS = Object.freeze(
  X_NON_VIDEO_POSTS.filter(post => post.link_path === '/buzz')
);
const X_SEARCH_GUIDE_POSTS = Object.freeze(
  X_NON_VIDEO_POSTS.filter(post => post.link_path !== '/buzz')
);
const X_NON_VIDEO_POST_BY_ID = new Map(X_NON_VIDEO_POSTS.map(post => [post.id, post]));
const X_INITIAL_DATE_OVERRIDES = new Map([
  // The 1.22.0 deploy completed during the evening of 2026-08-29 JST. Keep
  // that pre-launch slot on the established BUZZ series so the dedicated
  // four-input launch copy does not publish on two consecutive evenings.
  ['2026-08-29', X_NON_VIDEO_POST_BY_ID.get('buzz-shelves-intro')],
  ['2026-08-30', X_NON_VIDEO_POST_BY_ID.get('howto-four-input-search')],
  ['2026-09-01', X_NON_VIDEO_POST_BY_ID.get('continuous-search')],
  // Avoid repeating continuous-search on X four days after its launch; the
  // same evening already carries the dedicated Instagram guide.
  ['2026-09-05', X_NON_VIDEO_POST_BY_ID.get('buzz-shelves-intro')]
]);

// 2026-08-22 大隆さん承認済み。ユーザー向け投稿を主役のまま保つため、
// セラー向けはX非動画枠の6回に1回だけ差し込む。自然掲載を先に伝え、
// 架空の成果・需要件数・売上は書かない。
const X_SELLER_POSTS = Object.freeze([
  {
    id: 'seller-natural-listing',
    caption: '商品を探している人に、ちゃんと見つけてもらう。HOSHILUは自然掲載を無料から始められます。広告だけで検索結果を埋めず、探している条件との一致を優先します。',
    link_path: '/for-sellers'
  },
  {
    id: 'seller-demand-insight',
    caption: '購入希望価格を設定した人と、探したけれど見つけられなかった商品。その匿名需要を、仕入れ・商品開発・価格判断に使える形で確認できます。検索文や個人情報は共有しません。',
    link_path: '/for-sellers'
  },
  {
    id: 'seller-business-simple',
    caption: 'HOSHILU Businessは月額9,800円。商品・流入・未充足需要の分析、優先掲載の管理、Search APIをひとつのプランにまとめています。自然掲載だけなら無料から始められます。',
    link_path: '/for-sellers'
  }
]);

const INSTAGRAM_GUIDE_POSTS = Object.freeze([
  {
    id: 'guide-search-screen',
    caption: '操作案内① カメラ、保存画像・スクショ、HOSHILU対応形式の公開SNS投稿単体URL、または一言を入力。どれか1つから商品候補と検索語を整理できます。写真・画像・投稿URLはHOSHILUに保存しません。画像はブラウザ内でJPEGへ再変換するため、元画像のEXIF・位置情報を引き継ぎません。商品特定の補助にGoogle Cloud VisionのWeb画像照合とGoogle Gemini APIを使う場合があります。顔・住所・伝票などは写さないでください。@hoshilu.app',
    media_url: 'https://hoshilu.app/social/hoshilu-visual-search-launch-v1.png'
  },
  {
    id: 'guide-continuous-search',
    caption: '操作案内② 1回で見つからなくても、そこで終わりじゃない。「見つかるまで探す」を無料会員で有効にするとHOSHILUが定期的に検索し、新しく一致する実在商品が見つかった時だけお知らせします。値下げ通知ではなく、新しい商品の発見通知です。@hoshilu.app',
    media_url: 'https://hoshilu.app/social/hoshilu-continuous-search-v1.png'
  },
  {
    id: 'guide-save-alert',
    // This approved creative asks viewers to describe the item they want. Keep
    // the caption aligned with the visible card; it is not a price-alert screen.
    caption: '操作案内③ 商品名が分からなくても大丈夫。見た場所・色・形・使い方を、そのままHOSHILUへ入力してみて。@hoshilu.app',
    query: '動画で見た、軽くて持ち運べる小型写真プリンター',
    media_url: 'https://hoshilu.app/social/instagram-want-poll-v1.png'
  },
  {
    id: 'buzz-ranking-portrait',
    caption: '今、これ来てる。HOSHILU BUZZなら、小ジャンルごとのランキングを1位からチェック。欲しいものが決まってない日も、開けば何か見つかる。@hoshilu.app #HOSHILUBUZZ #ホシル',
    link_path: '/buzz',
    media_url: 'https://hoshilu.app/social/hoshilu-buzz-ranking-v1.jpg'
  },
  {
    id: 'buzz-discovery-portrait',
    caption: '検索するものが決まってなくてもいい。ランキングから見つけるか、覚えている特徴から探すか。買い物の入口を、もっと今っぽく。@hoshilu.app #HOSHILUBUZZ #商品検索',
    link_path: '/buzz',
    media_url: 'https://hoshilu.app/social/hoshilu-buzz-ranking-v1.jpg'
  }
]);

const INSTAGRAM_NON_BUZZ_GUIDE_POSTS = Object.freeze(
  INSTAGRAM_GUIDE_POSTS.filter((post) => !post.link_path || post.link_path !== '/buzz')
);
const BUZZ_MEDIA_URL = 'https://hoshilu.app/social/hoshilu-buzz-ranking-v1.jpg';

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
const AMAZON_SEARCH_ONLY_NOTICE = 'HOSHILUからAmazonを含む検索先を開けます。Amazonの商品候補・価格・在庫・レビューはリンク先で確認してください。';
const THREADS_AMAZON_POSTS = Object.freeze([
  {
    id: 'amazon-boost-books',
    caption: `読みたかったのに、正式なタイトルを忘れてしまった本。覚えている表紙の色やあらすじの断片をHOSHILUへ。${AMAZON_SEARCH_ONLY_NOTICE}`,
    query: '表紙が青くてタイトルを忘れた海外小説'
  },
  {
    id: 'amazon-boost-appliances',
    caption: `地味に助かる小型家電ほど、正式名称が分からないもの。使う場所や機能の特徴をHOSHILUへ。${AMAZON_SEARCH_ONLY_NOTICE}`,
    query: '布団を素早く乾かす小型の家電'
  },
  {
    id: 'amazon-boost-daily-goods',
    caption: `切れてから気づく日用品のストック。置き場所や見た目の特徴をHOSHILUへ。${AMAZON_SEARCH_ONLY_NOTICE}`,
    query: 'キッチンの排水溝に使う小さいゴミ受けネット'
  },
  {
    id: 'trust-how-to-describe',
    caption: '商品名が分からないときは、カメラで撮る、保存画像・スクショ、HOSHILU対応の公開SNS投稿URL（投稿単体）、一言のどれかを手がかりに探せます。非対応・非公開投稿は画像か一言を追加してください。'
  },
  {
    id: 'amazon-boost-reviews',
    caption: `「これAmazonにあるかな」と思ったら、覚えている特徴をHOSHILUへ。${AMAZON_SEARCH_ONLY_NOTICE}`,
    query: '軽くて持ち運べる小型写真プリンター'
  },
  {
    id: 'amazon-boost-kitchen',
    caption: `作り置きを始めると急に足りなくなる保存容器。冷凍したいのか、そのまま温めたいのか、用途をHOSHILUへ。${AMAZON_SEARCH_ONLY_NOTICE}`,
    query: '冷凍してそのままレンジで温められる保存容器'
  },
  {
    id: 'amazon-boost-storage',
    caption: `クローゼットの上の段を、あと少しだけ使いこなしたい。奥行きや高さの条件をHOSHILUへ。${AMAZON_SEARCH_ONLY_NOTICE}`,
    query: 'クローゼット上段の奥行きが深い場所に置く収納ケース'
  },
  {
    id: 'trust-why-multiple-malls',
    caption: '同じ商品でも、扱っているモールによって在庫も配送も違います。1つのモールだけ見て「無い」と判断してしまうのがいちばんもったいないので、HOSHILUは横断して確認できるようにしています。'
  },
  {
    id: 'amazon-boost-stationery',
    caption: `書き心地が気に入っていたペン、軸の色しか覚えていない。覚えている特徴をHOSHILUへ。${AMAZON_SEARCH_ONLY_NOTICE}`,
    query: 'インクが早く乾く細字のボールペン'
  },
  {
    id: 'amazon-boost-hobby',
    caption: `久しぶりに趣味を再開すると、消耗品の名前を忘れているもの。何をするための道具かをHOSHILUへ。${AMAZON_SEARCH_ONLY_NOTICE}`,
    query: '刺繍で使う輪っかの形をした固定する道具'
  },
  {
    id: 'amazon-boost-pet',
    caption: `うちの子にちょうどいいサイズが分からない。体格や使う場所の条件をHOSHILUへ。${AMAZON_SEARCH_ONLY_NOTICE}`,
    query: '小型犬用の折りたためる移動用キャリー'
  },
  {
    id: 'trust-no-price-in-post',
    caption: 'HOSHILUの投稿では価格を書きません。モールも時期も違えば値段は変わるので、こちらで数字を書くと必ず古くなります。実際の価格は、その場でご確認ください。'
  },
  {
    id: 'amazon-boost-baby',
    caption: `育児用品は「いつ使うものか」で名前がまるで違います。月齢や使う場面をHOSHILUへ。${AMAZON_SEARCH_ONLY_NOTICE}`,
    query: '寝返りを始めた赤ちゃんの転落を防ぐベッド用の柵'
  },
  {
    id: 'amazon-boost-car',
    caption: `車内のちょっとした不便。困っている場面をそのままHOSHILUへ。${AMAZON_SEARCH_ONLY_NOTICE}`,
    query: '運転席のドリンクホルダーを増やす後付けの台'
  },
  {
    id: 'amazon-boost-tools',
    caption: `一度きりの作業で使う工具の名前が分からない。何をしたいかをHOSHILUへ。${AMAZON_SEARCH_ONLY_NOTICE}`,
    query: '家具の組み立てに使う小さい電動ドライバー'
  },
  {
    id: 'trust-child-and-senior',
    caption: 'HOSHILUは、正式な商品名を知らない人が使えることを大事にしています。お子さんやご高齢の方が、思いついた言葉のまま入力しても探せることを目指しています。'
  },
  {
    id: 'amazon-boost-health',
    caption: `肩や腰を支える道具は種類が多くて選びにくいもの。使う場所や形の希望をHOSHILUへ。${AMAZON_SEARCH_ONLY_NOTICE}`,
    query: '座ったまま腰を支えるクッション'
  },
  {
    id: 'amazon-boost-cable',
    caption: `ケーブル類は規格の名前が覚えづらい。つなぎたい機器の組み合わせをHOSHILUへ。${AMAZON_SEARCH_ONLY_NOTICE}`,
    query: 'ノートパソコンとテレビをつなぐ映像用のケーブル'
  },
  {
    id: 'amazon-boost-seasonal',
    caption: `季節家電を早めに探すなら、置き場所や使い方の条件をHOSHILUへ。${AMAZON_SEARCH_ONLY_NOTICE}`,
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

function positiveModulo(value, size) {
  return ((value % size) + size) % size;
}

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

function mediaSlotNumber(parts, weekdays) {
  const localMidnight = Date.UTC(parts.year, parts.month - 1, parts.day);
  const weekday = new Date(localMidnight).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = localMidnight + mondayOffset * DAY_MS;
  const weekIndex = Math.floor((monday - SOCIAL_ROTATION_EPOCH_MONDAY_UTC) / (7 * DAY_MS));
  return weekIndex * weekdays.length + weekdays.indexOf(parts.weekday);
}

function isBuzzMediaSlot(parts, weekdays) {
  return mediaSlotNumber(parts, weekdays) % 2 === 0;
}

function buzzCaption(platform, themeLabel) {
  if (platform === 'X') {
    return `今週のHOSHILU BUZZは「${themeLabel}」。モール公式ランキングを小ジャンル別にチェック。無料会員なら火・金のテーマ更新も通知。韓国コスメやQoo10・SHEINで探したい商品の入口に。 #韓国コスメ #Qoo10 #SHEIN`;
  }
  return `今週のHOSHILU BUZZは「${themeLabel}」。モール公式ランキングを根拠に、小ジャンル別の今をチェックできます。無料会員なら、火曜・金曜にテーマが変わった時も通知。韓国コスメやQoo10・SHEINで探したい商品の入口に。@hoshilu.app #韓国コスメ #Qoo10購入品 #SHEIN購入品 #HOSHILUBUZZ`;
}

function campaignIdForContent(content) {
  return NEW_SEARCH_PROMO_CONTENT_IDS.has(content)
    ? NEW_SEARCH_LAUNCH_UTM_CAMPAIGN
    : CAMPAIGN_ID;
}

function campaignLink(platform, date, content = date, searchQuery = '', path = '/') {
  const params = new URLSearchParams({
    utm_source: platform === 'X' ? 'x' : 'instagram',
    utm_medium: 'social',
    utm_campaign: campaignIdForContent(content),
    utm_content: content
  });
  if (searchQuery) params.set('q', searchQuery);
  return `https://hoshilu.app${path}?${params}`;
}

function dailyAiActressLink(platform, date, path = '/') {
  const params = new URLSearchParams({
    utm_source: platform === 'X' ? 'x' : 'instagram',
    utm_medium: 'social',
    utm_campaign: DAILY_AI_ACTRESS_CAMPAIGN_ID,
    utm_content: `hoshilu-ai-actress-daily-${date}`
  });
  return `https://hoshilu.app${path}?${params}`;
}

function dailyAiActressCrossposts(parts) {
  const reel = DAILY_AI_ACTRESS_REELS[parts.weekday];
  const publishDate = dateKey(parts);
  const crosspostGroupId = `hoshilu-ai-actress-daily-${publishDate}`;
  return ['X', 'INSTAGRAM'].map((platform) => ({
    ...normalizeSocialPost({
      post_id: `${DAILY_AI_ACTRESS_CAMPAIGN_ID}-${platform.toLowerCase()}-${publishDate}`,
      content_id: crosspostGroupId,
      platform,
      campaign_id: DAILY_AI_ACTRESS_CAMPAIGN_ID,
      caption: `${reel.caption} ${DAILY_AI_DISCLOSURE}`,
      link: dailyAiActressLink(platform, publishDate, reel.link_path || '/'),
      media_url: reel.media_url,
      scheduled_at: scheduledAt(parts, 20, 15),
      status: 'APPROVED'
    }),
    creative_asset_id: reel.creative_asset_id,
    content_format: 'REEL',
    creative_policy: DAILY_AI_ACTRESS_POLICY,
    jst_publish_date: publishDate,
    ai_generated: 1,
    crosspost_group_id: crosspostGroupId,
    // These mirror the immutable asset-ledger contract and make the generated
    // plan self-describing in tests and audit output. Publication still checks
    // the authoritative social_creative_assets row.
    persona_id: DAILY_AI_ACTRESS_PERSONA_ID,
    persona_age: 22,
    ai_actress_present: 1,
    ai_disclosure_confirmed: 1,
    caption_topics: reel.topics
  }));
}

function isCertifiedDailyAiActressPost(post) {
  const asset = DAILY_AI_ACTRESS_ASSETS.get(String(post.creative_asset_id || ''));
  const expectedGroup = `hoshilu-ai-actress-daily-${post.jst_publish_date}`;
  return Boolean(asset)
    && post.campaign_id === DAILY_AI_ACTRESS_CAMPAIGN_ID
    && post.content_id === expectedGroup
    && post.crosspost_group_id === expectedGroup
    && post.media_url === asset.media_url
    && post.content_format === 'REEL'
    && post.creative_policy === DAILY_AI_ACTRESS_POLICY
    && post.ai_generated === 1
    && post.persona_id === DAILY_AI_ACTRESS_PERSONA_ID
    && post.persona_age === 22
    && post.ai_actress_present === 1
    && post.ai_disclosure_confirmed === 1
    && post.caption.includes('※この動画はAI生成・AI加工映像です。')
    && post.caption.includes('#AI生成');
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

  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(start.getTime() + offset * DAY_MS - JST_OFFSET_MS);
    const parts = jstDateParts(day);
    const key = dateKey(parts);
    // One owned 22-year-old v2 actress reel is cross-posted to both platforms
    // every JST day. The same group and asset make cross-post identity explicit;
    // the old actress-less M/W/F videos are no longer part of the daily slot.
    posts.push(...dailyAiActressCrossposts(parts));

    // Preserve the useful non-video X rotation as a supplementary 20:00 post on
    // the days where it already ran. It never substitutes for the daily actress.
    if (![1, 3, 5].includes(parts.weekday)) {
      const slot = mediaSlotNumber(parts, [0, 2, 4, 6]);
      // Even supplementary slots remain BUZZ so any seven JST days keep the
      // approved BUZZ share. Odd slots are search guides, except every third
      // odd slot reserved for sellers. Search and seller ordinals advance
      // independently so the insertion never starves a consumer theme.
      const buzzSlot = positiveModulo(slot, 2) === 0;
      const oddOrdinal = Math.floor(slot / 2);
      const sellerSlot = !buzzSlot && positiveModulo(oddOrdinal, 3) === 2;
      const sellerOrdinal = Math.floor(oddOrdinal / 3);
      const searchOrdinal = oddOrdinal - Math.floor(oddOrdinal / 3);
      const content = X_INITIAL_DATE_OVERRIDES.get(key) || (buzzSlot
        ? X_BUZZ_POSTS[positiveModulo(Math.floor(slot / 2), X_BUZZ_POSTS.length)]
        : sellerSlot
          ? X_SELLER_POSTS[positiveModulo(sellerOrdinal, X_SELLER_POSTS.length)]
          : X_SEARCH_GUIDE_POSTS[positiveModulo(searchOrdinal, X_SEARCH_GUIDE_POSTS.length)]);
      posts.push(normalizeSocialPost({
        post_id: `${CAMPAIGN_ID}-x-guide-${key}`,
        content_id: content.id,
        platform: 'X',
        campaign_id: campaignIdForContent(content.id),
        caption: content.caption,
        link: campaignLink('X', key, content.id, content.query, content.link_path || '/'),
        scheduled_at: scheduledAt(parts, 20, 0),
        status: 'APPROVED'
      }));
    }

    // Static Instagram guides remain supplementary; put them at 20:00 so the
    // daily 20:15 Reel has its own deterministic publishing slot.
    if ([2, 4, 6].includes(parts.weekday)) {
      const rotationDay = Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS);
      const buzz = isBuzzMediaSlot(parts, [2, 4, 6]);
      const theme = buzzThemeFor(day);
      const content = buzz ? {
        id: `buzz-image-${theme.id}`,
        caption: buzzCaption('INSTAGRAM', theme.label),
        link_path: '/buzz',
        media_url: BUZZ_MEDIA_URL
      } : INSTAGRAM_NON_BUZZ_GUIDE_POSTS[rotationDay % INSTAGRAM_NON_BUZZ_GUIDE_POSTS.length];
      posts.push(normalizeSocialPost({
        post_id: `${CAMPAIGN_ID}-instagram-guide-${key}`,
        content_id: content.id,
        platform: 'INSTAGRAM',
        campaign_id: campaignIdForContent(content.id),
        caption: content.caption,
        link: campaignLink('INSTAGRAM', key, content.id, content.query, content.link_path || '/'),
        media_url: content.media_url,
        scheduled_at: scheduledAt(parts, 20, 0),
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
  const statements = [];
  for (const post of posts) {
    // A finished video may be shared to Instagram and X in the same slot, but it
    // must not silently become a new APPROVED post on a later date. The only
    // recurring exception is the exact seven-asset DAILY_AI_ACTRESS_22 series:
    // its asset-ledger rows explicitly approve weekday repetition and the strict
    // predicate below prevents unrelated media from inheriting that exception.
    // Keep this decision inside the INSERT so concurrent cron invocations see
    // the same D1 history and cannot both approve a later replay.
    const completedVideo = /\.mp4(?:$|[?#])/iu.test(post.media_url) ? 1 : 0;
    const approvedCompletedVideoReuse = USER_APPROVED_REPLAY_POST_IDS.has(post.post_id)
      || isCertifiedDailyAiActressPost(post) ? 1 : 0;
    statements.push(env.PRODUCT_DB.prepare(`INSERT INTO social_post_queue
      (post_id,platform,campaign_id,content_id,caption,link,media_url,scheduled_at,status,
       affiliate,creative_asset_id,content_format,creative_policy,jst_publish_date,
       ai_generated,crosspost_group_id,approved_at,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,
        CASE WHEN ?11=1 AND ?13=0 AND EXISTS (
          SELECT 1 FROM social_post_queue previous
          WHERE previous.post_id<>?1
            AND previous.media_url=?7
            AND previous.scheduled_at<?8
            AND (previous.status IN ('APPROVED','PUBLISHING','PUBLISHED')
              OR previous.external_post_id<>'' OR previous.published_at<>'')
        ) THEN 'REVIEW_REQUIRED' ELSE ?12 END,
        ?9,
        ?14,?15,?16,?17,?18,?19,
        CASE WHEN ?11=1 AND ?13=0 AND EXISTS (
          SELECT 1 FROM social_post_queue previous
          WHERE previous.post_id<>?1
            AND previous.media_url=?7
            AND previous.scheduled_at<?8
            AND (previous.status IN ('APPROVED','PUBLISHING','PUBLISHED')
              OR previous.external_post_id<>'' OR previous.published_at<>'')
        ) THEN '' ELSE ?10 END,
        ?10,?10)
      ON CONFLICT(post_id) DO UPDATE SET campaign_id=excluded.campaign_id,content_id=excluded.content_id,
        caption=excluded.caption,link=excluded.link,media_url=excluded.media_url,
        scheduled_at=CASE
          WHEN social_post_queue.status='APPROVED'
            AND social_post_queue.campaign_id='hoshilu-ai-actress-daily-v1'
            AND social_post_queue.creative_policy='DAILY_AI_ACTRESS_22'
            AND strftime('%s',social_post_queue.scheduled_at) IS NOT NULL
            AND (
              social_post_queue.scheduled_at='2000-01-01T00:00:00.000Z'
              OR social_post_queue.last_error IN (
                'INSTAGRAM_CONTAINER_IN_PROGRESS','INSTAGRAM_CONTAINER_TIMEOUT',
                'INSTAGRAM_CONTAINER_EXPIRED','X_MEDIA_ASSET_FETCH_FAILED',
                'X_MEDIA_PROCESSING_TIMEOUT')
              OR social_post_queue.last_error LIKE 'Too many subrequests by single Worker invocation.%'
              OR social_post_queue.last_error='X_PUBLISH_429'
              OR social_post_queue.last_error GLOB 'X_PUBLISH_429_*'
              OR social_post_queue.last_error='INSTAGRAM_PUBLISH_429'
              OR social_post_queue.last_error GLOB 'INSTAGRAM_PUBLISH_429_*'
              OR social_post_queue.last_error GLOB 'X_MEDIA_FETCH_40[8]'
              OR social_post_queue.last_error GLOB 'X_MEDIA_FETCH_40[8]_*'
              OR social_post_queue.last_error GLOB 'X_MEDIA_FETCH_42[59]'
              OR social_post_queue.last_error GLOB 'X_MEDIA_FETCH_42[59]_*'
              OR social_post_queue.last_error GLOB 'X_MEDIA_FETCH_5[0-9][0-9]'
              OR social_post_queue.last_error GLOB 'X_MEDIA_FETCH_5[0-9][0-9]_*'
              OR social_post_queue.last_error GLOB 'X_MEDIA_INIT_40[8]'
              OR social_post_queue.last_error GLOB 'X_MEDIA_INIT_40[8]_*'
              OR social_post_queue.last_error GLOB 'X_MEDIA_INIT_42[59]'
              OR social_post_queue.last_error GLOB 'X_MEDIA_INIT_42[59]_*'
              OR social_post_queue.last_error GLOB 'X_MEDIA_INIT_5[0-9][0-9]'
              OR social_post_queue.last_error GLOB 'X_MEDIA_INIT_5[0-9][0-9]_*'
              OR social_post_queue.last_error GLOB 'X_MEDIA_APPEND_40[8]'
              OR social_post_queue.last_error GLOB 'X_MEDIA_APPEND_40[8]_*'
              OR social_post_queue.last_error GLOB 'X_MEDIA_APPEND_42[59]'
              OR social_post_queue.last_error GLOB 'X_MEDIA_APPEND_42[59]_*'
              OR social_post_queue.last_error GLOB 'X_MEDIA_APPEND_5[0-9][0-9]'
              OR social_post_queue.last_error GLOB 'X_MEDIA_APPEND_5[0-9][0-9]_*'
              OR social_post_queue.last_error GLOB 'X_MEDIA_FINALIZE_40[8]'
              OR social_post_queue.last_error GLOB 'X_MEDIA_FINALIZE_40[8]_*'
              OR social_post_queue.last_error GLOB 'X_MEDIA_FINALIZE_42[59]'
              OR social_post_queue.last_error GLOB 'X_MEDIA_FINALIZE_42[59]_*'
              OR social_post_queue.last_error GLOB 'X_MEDIA_FINALIZE_5[0-9][0-9]'
              OR social_post_queue.last_error GLOB 'X_MEDIA_FINALIZE_5[0-9][0-9]_*'
              OR social_post_queue.last_error GLOB 'X_MEDIA_STATUS_40[8]'
              OR social_post_queue.last_error GLOB 'X_MEDIA_STATUS_40[8]_*'
              OR social_post_queue.last_error GLOB 'X_MEDIA_STATUS_42[59]'
              OR social_post_queue.last_error GLOB 'X_MEDIA_STATUS_42[59]_*'
              OR social_post_queue.last_error GLOB 'X_MEDIA_STATUS_5[0-9][0-9]'
              OR social_post_queue.last_error GLOB 'X_MEDIA_STATUS_5[0-9][0-9]_*'
              OR social_post_queue.last_error GLOB 'INSTAGRAM_CREATE_40[8]'
              OR social_post_queue.last_error GLOB 'INSTAGRAM_CREATE_40[8]_*'
              OR social_post_queue.last_error GLOB 'INSTAGRAM_CREATE_42[59]'
              OR social_post_queue.last_error GLOB 'INSTAGRAM_CREATE_42[59]_*'
              OR social_post_queue.last_error GLOB 'INSTAGRAM_CREATE_5[0-9][0-9]'
              OR social_post_queue.last_error GLOB 'INSTAGRAM_CREATE_5[0-9][0-9]_*'
              OR social_post_queue.last_error GLOB 'INSTAGRAM_STATUS_40[8]'
              OR social_post_queue.last_error GLOB 'INSTAGRAM_STATUS_40[8]_*'
              OR social_post_queue.last_error GLOB 'INSTAGRAM_STATUS_42[59]'
              OR social_post_queue.last_error GLOB 'INSTAGRAM_STATUS_42[59]_*'
              OR social_post_queue.last_error GLOB 'INSTAGRAM_STATUS_5[0-9][0-9]'
              OR social_post_queue.last_error GLOB 'INSTAGRAM_STATUS_5[0-9][0-9]_*')
            THEN social_post_queue.scheduled_at
          ELSE excluded.scheduled_at END,
        affiliate=excluded.affiliate,
        creative_asset_id=excluded.creative_asset_id,
        content_format=excluded.content_format,
        creative_policy=excluded.creative_policy,
        jst_publish_date=excluded.jst_publish_date,
        ai_generated=excluded.ai_generated,
        crosspost_group_id=excluded.crosspost_group_id,
        status=CASE
          WHEN ?13=1 AND social_post_queue.status='REVIEW_REQUIRED'
            AND social_post_queue.last_error='MEDIA_REUSE_REVIEW_REQUIRED'
            THEN 'APPROVED'
          WHEN social_post_queue.status='CANCELLED'
            AND social_post_queue.last_error='SOCIAL_QUEUE_QUARANTINED_DUPLICATE_CAMPAIGN_20260813'
            THEN excluded.status
          WHEN excluded.status='REVIEW_REQUIRED' AND social_post_queue.status='APPROVED'
            THEN 'REVIEW_REQUIRED'
          ELSE social_post_queue.status END,
        approved_at=CASE
          WHEN ?13=1 AND social_post_queue.status='REVIEW_REQUIRED'
            AND social_post_queue.last_error='MEDIA_REUSE_REVIEW_REQUIRED'
            THEN excluded.approved_at
          WHEN social_post_queue.status='CANCELLED'
            AND social_post_queue.last_error='SOCIAL_QUEUE_QUARANTINED_DUPLICATE_CAMPAIGN_20260813'
            THEN excluded.approved_at
          WHEN excluded.status='REVIEW_REQUIRED' AND social_post_queue.status='APPROVED'
            THEN ''
          ELSE social_post_queue.approved_at END,
        last_error=CASE
          WHEN ?13=1 AND social_post_queue.status='REVIEW_REQUIRED'
            AND social_post_queue.last_error='MEDIA_REUSE_REVIEW_REQUIRED'
            THEN ''
          WHEN social_post_queue.status='CANCELLED'
            AND social_post_queue.last_error='SOCIAL_QUEUE_QUARANTINED_DUPLICATE_CAMPAIGN_20260813'
            THEN CASE WHEN excluded.status='REVIEW_REQUIRED'
              THEN 'MEDIA_REUSE_REVIEW_REQUIRED' ELSE '' END
          WHEN excluded.status='REVIEW_REQUIRED' AND social_post_queue.status='APPROVED'
            THEN 'MEDIA_REUSE_REVIEW_REQUIRED'
          ELSE social_post_queue.last_error END,
        updated_at=excluded.updated_at
      WHERE social_post_queue.status IN ('APPROVED','REVIEW_REQUIRED')
        OR (social_post_queue.status='CANCELLED'
          AND social_post_queue.last_error='SOCIAL_QUEUE_QUARANTINED_DUPLICATE_CAMPAIGN_20260813'
          AND social_post_queue.external_post_id=''
          AND social_post_queue.published_at='')`)
      .bind(post.post_id, post.platform, post.campaign_id, post.content_id, post.caption,
        post.link, post.media_url, post.scheduled_at, post.affiliate ? 1 : 0, now.toISOString(),
        completedVideo, post.status, approvedCompletedVideoReuse,
        String(post.creative_asset_id || ''), String(post.content_format || ''),
        String(post.creative_policy || ''), String(post.jst_publish_date || ''),
        post.ai_generated === 1 ? 1 : 0, String(post.crosspost_group_id || '')));
  }
  if (approvedModelReel.length) {
    statements.push(env.PRODUCT_DB.prepare(`UPDATE social_post_queue
      SET status='APPROVED',last_error='',updated_at=?2
      WHERE post_id=?1 AND status='FAILED'
      AND last_error IN ('INSTAGRAM_CONTAINER_IN_PROGRESS','INSTAGRAM_CONTAINER_TIMEOUT')`)
      .bind(APPROVED_MODEL_REEL.post_id, now.toISOString()));
  }
  let results = [];
  if (statements.length && typeof env.PRODUCT_DB.batch === 'function') {
    // Keep the 14-day X/Instagram/Threads plan in one ordered D1 round trip.
    // Internal-service limits are separate from the external publishing limit,
    // but batching still avoids dozens of sequential database calls.
    results = await env.PRODUCT_DB.batch(statements);
  } else {
    // Lightweight test adapters and local repositories may not implement batch.
    // Preserve statement order because replay review checks depend on earlier rows.
    for (const statement of statements) results.push(await statement.run());
  }
  const inserted = results.reduce((total, result) => total + Number(result?.meta?.changes || 0), 0);
  return { enabled: true, planned: posts.length, inserted };
}

export async function runSocialAutopilotCycle(env, now = new Date(), fetchImpl = fetch) {
  // Publishing is first: queue maintenance and metric sync can never consume
  // the invocation budget before an already-approved due post is attempted.
  const published = await runDueSocialPosts(env, now, fetchImpl);
  const seeded = await seedSocialAutopilotQueue(env, now);
  const permalinks = await syncInstagramPublishedPermalinks(env, now, fetchImpl);
  const threadsInsights = await syncThreadsInsights(env, now, fetchImpl);
  return { seeded, published, permalinks, threadsInsights };
}
