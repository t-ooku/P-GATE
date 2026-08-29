// v4.2 項目14: SHOPLIST/MUSINSAは標準検索から外れ、ロフト・ハンズ・
// マツキヨココカラ・@cosme・ABC-MARTを追加。「主要5モール」はHOSHILUが商品
// をまとめて比較できる楽天市場・Yahoo!ショッピングを指す。Amazonは公式API
// 接続まではQoo10等と同じ個別検索導線として、最大13モールの対象に含める。
const MARKETPLACE_MESSAGE = '楽天市場・Yahoo!ショッピングの2モールをまとめて比較し、Amazon・Qoo10・SHEIN・ZOZOTOWNなど11モールを個別に検索。合計最大13モールから探せます。';

const THEMES = Object.freeze([
  { id: 'cross_market_phone_case', pillar: 'CROSS_MARKET', format: 'CAROUSEL', memory: 'TikTokで見た、光るスマホケース', refined: 'TikTokで見た光るiPhoneケース', hook: 'その「どこで売ってる？」の購入先を探そう。' },
  { id: 'trend_camera_reel', pillar: 'AMBIGUOUS_TREND', format: 'REEL', memory: 'ピンクで小さい、レトロなカメラみたいなもの', refined: 'SNSで見たピンクの小さいレトロカメラ', hook: '名前は知らない。でも見た目は覚えてる。' },
  { id: 'qoo10_kbeauty_reel', pillar: 'CROSS_MARKET', format: 'REEL', marketplace_focus: 'QOO10_JP', memory: '韓国っぽい、つやつやになるリップ', refined: '韓国コスメ ツヤ リップ ティント', hook: 'Qoo10で見かけた韓国コスメ、名前が曖昧でも探せる。' },
  { id: 'continuous_search_charm', pillar: 'CONTINUOUS_SEARCH', format: 'STATIC', memory: 'バッグにつける小さなぬいぐるみみたいなもの', refined: 'バッグにつける小さいぬいぐるみチャーム', hook: '「見つかるまで探す」に預けたい、あなたも気になる？' },
  { id: 'shein_trend_accessory', pillar: 'CROSS_MARKET', format: 'CAROUSEL', marketplace_focus: 'SHEIN_JP', memory: '海外ガールっぽい、シルバーのじゃらじゃらアクセ', refined: 'Y2K シルバー チャーム ネックレス', hook: 'SHEINで見たトレンド小物、見た目の記憶からもう一度。' },
  { id: 'cross_market_earphones', pillar: 'CROSS_MARKET', format: 'CAROUSEL', memory: '耳をふさがない、アクセみたいなイヤホン', refined: '耳をふさがないオープンイヤー型イヤホン', hook: 'Amazonだけで見つからないなら、横断して探せばいい。' },
  { id: 'trend_sunset_lamp', pillar: 'AMBIGUOUS_TREND', format: 'STATIC', memory: '部屋が夕焼けみたいになる丸いライト', refined: '夕焼け色が壁に映る丸いライト', hook: 'SNSで見た「あのライト」、名前なしで探せる。' },
  { id: 'qoo10_price_compare', pillar: 'CROSS_MARKET', format: 'CAROUSEL', marketplace_focus: 'QOO10_JP', memory: '韓国っぽい透明ケースのイヤホン', refined: '韓国風 透明ケース ワイヤレスイヤホン', hook: 'Qoo10だけで決める前に、対応するショッピングモールを見てみよう。' },
  { id: 'ambiguous_search_reel', pillar: 'AMBIGUOUS_TREND', format: 'REEL', memory: '歩くと靴底が光るスニーカーみたいな靴', refined: '歩くとソールがLEDで光るスニーカー', hook: '検索語が曖昧でも、記憶の断片から探せる。' },
  { id: 'shein_fashion_reel', pillar: 'CROSS_MARKET', format: 'REEL', marketplace_focus: 'SHEIN_JP', memory: '韓国っぽい、透ける素材の夏バッグ', refined: '韓国風 シアー メッシュ ミニバッグ', hook: 'SHEINで見た「あのバッグ」、手がかりから探してみる。' },
  { id: 'trend_pet_fountain', pillar: 'AMBIGUOUS_TREND', format: 'CAROUSEL', memory: '猫がひとりでも水を飲める流れている器', refined: '留守番中の猫が使える自動給水器', hook: '用途しか分からなくても、商品候補までたどり着ける。' },
  { id: 'continuous_search_charger', pillar: 'CONTINUOUS_SEARCH', format: 'STATIC', memory: 'スマホの後ろにくっつく薄い充電器', refined: 'スマホ背面に磁石で付く薄型モバイルバッテリー', hook: '新しい候補が見つかるまで、HOSHILUに条件を預けられます。' }
]);

const PILLAR_COPY = Object.freeze({
  CROSS_MARKET: MARKETPLACE_MESSAGE,
  AMBIGUOUS_TREND: 'SNSで見かけた商品も、写真・保存画像・公開投稿URL（各サービスのHOSHILU対応形式に合う投稿単体URL）・見た目や用途の一言から探せます。',
  CONTINUOUS_SEARCH: '「見つかるまで探す」を無料会員で有効にすると、新しく一致する実在商品が見つかった時だけお知らせします。'
});

const FOCUS_COPY = Object.freeze({
  QOO10_JP: {
    campaign: 'youth_qoo10_discovery',
    message: 'Qoo10の商品名が分からなくても、覚えている特徴からHOSHILUで探せます。',
    hashtags: '#Qoo10購入品 #韓国トレンド #韓国コスメ'
  },
  SHEIN_JP: {
    campaign: 'youth_shein_discovery',
    message: 'SHEINで見た商品も、写真・画像・公開投稿URL（各サービスのHOSHILU対応形式に合う投稿単体URL）や覚えている一言からHOSHILUで探せます。',
    hashtags: '#SHEIN購入品 #海外トレンド #Y2Kファッション'
  }
});

function reelScript(theme) {
  if (theme.format !== 'REEL') return null;
  const focus = FOCUS_COPY[theme.marketplace_focus];
  return {
    duration_seconds: 12,
    aspect_ratio: '9:16',
    scenes: [
      `0-2秒：${theme.hook}`,
      `2-5秒：カメラ・画像・対応形式の公開投稿単体URL・一言のどれかで手がかりを追加`,
      `5-9秒：まとめて比較する2モール＋個別に探す11モール（合計最大13モール）を表示`,
      `9-12秒：「名前がわからなくても、欲しいは伝わる。」＋検索・コメントCTA`
    ],
    cover_text: focus ? `${focus === FOCUS_COPY.QOO10_JP ? 'Qoo10' : 'SHEIN'}で見た、あれ何？` : '名前不明でも探せる',
    asset_policy: '商品素材は権利確認済みのみ。未確認の場合はHOSHILU画面録画と文字モーションだけを使用する。'
  };
}

export function buildYouthSearchPost(index, platform = 'X') {
  const theme = THEMES[Math.abs(Number(index) || 0) % THEMES.length];
  const normalizedPlatform = String(platform || 'X').toUpperCase();
  const focus = FOCUS_COPY[theme.marketplace_focus];
  const platformHook = normalizedPlatform === 'X'
    ? `これ、何て検索する？ ${theme.memory}`
    : `${theme.hook}\n「${theme.memory}」`;
  const source = normalizedPlatform.toLowerCase();
  const campaign = focus?.campaign || 'youth_marketplace_discovery';
  const commentCta = focus
    ? '見つけたい商品をコメントで教えて。次の検索動画で試します。'
    : '名前が分からない「欲しいもの」をコメントで教えて。';
  const focusMessage = focus ? `\n${focus.message}` : '';
  const hashtags = focus ? `#HOSHILU ${focus.hashtags}` : '#HOSHILU #Qoo10 #SHEIN #購入品紹介';
  return {
    content_id: theme.id,
    platform: normalizedPlatform,
    campaign_pillar: theme.pillar,
    marketplace_focus: theme.marketplace_focus || 'ALL',
    content_format: theme.format,
    caption: `${platformHook}\n${PILLAR_COPY[theme.pillar]}${focusMessage}\n${commentCta}\n${MARKETPLACE_MESSAGE}\n${hashtags}`,
    link: `https://hoshilu.app/?q=${encodeURIComponent(theme.refined)}&utm_source=${source}&utm_medium=organic_social&utm_campaign=${campaign}&utm_content=${theme.id}`,
    prefill_query: theme.refined,
    reel_script: reelScript(theme),
    status: 'REVIEW_REQUIRED',
    affiliate: true
  };
}

export const youthSearchThemes = THEMES;
