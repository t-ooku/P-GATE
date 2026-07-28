const MARKETPLACE_MESSAGE = 'Amazon・楽天市場・Qoo10・SHEINをまとめて横断検索。';

const THEMES = Object.freeze([
  { id: 'cross_market_phone_case', pillar: 'CROSS_MARKET', format: 'CAROUSEL', memory: 'TikTokで見た、光るスマホケース', refined: 'TikTokで見た光るiPhoneケース', hook: 'その「どこで売ってる？」、4モールを一気に探そう。' },
  { id: 'trend_camera_reel', pillar: 'AMBIGUOUS_TREND', format: 'REEL', memory: 'ピンクで小さい、レトロなカメラみたいなもの', refined: 'SNSで見たピンクの小さいレトロカメラ', hook: '名前は知らない。でも見た目は覚えてる。' },
  { id: 'popular_wish_charm', pillar: 'POPULAR_WISH', format: 'STATIC', memory: 'バッグにつける小さなぬいぐるみみたいなもの', refined: 'バッグにつける小さいぬいぐるみチャーム', hook: '「ほしっトク」で人気の欲しい、あなたも気になる？' },
  { id: 'cross_market_earphones', pillar: 'CROSS_MARKET', format: 'CAROUSEL', memory: '耳をふさがない、アクセみたいなイヤホン', refined: '耳をふさがないオープンイヤー型イヤホン', hook: 'Amazonだけで見つからないなら、横断して探せばいい。' },
  { id: 'market_demo_reel', pillar: 'CROSS_MARKET', format: 'REEL', memory: '韓国っぽい透明ケースのイヤホン', refined: '韓国風 透明ケース ワイヤレスイヤホン', hook: '同じ言葉で4モール、結果はどう変わる？' },
  { id: 'trend_sunset_lamp', pillar: 'AMBIGUOUS_TREND', format: 'STATIC', memory: '部屋が夕焼けみたいになる丸いライト', refined: '夕焼け色が壁に映る丸いライト', hook: 'SNSで流行ってる「あのライト」、名前なしで探せる。' },
  { id: 'popular_wish_fan', pillar: 'POPULAR_WISH', format: 'CAROUSEL', memory: '首にかける羽根が見えない涼しいやつ', refined: '首掛け式 羽根なし 携帯扇風機', hook: 'みんなが「ほしっとく」した暑さ対策をチェック。' },
  { id: 'ambiguous_search_reel', pillar: 'AMBIGUOUS_TREND', format: 'REEL', memory: '歩くと靴底が光るスニーカーみたいな靴', refined: '歩くとソールがLEDで光るスニーカー', hook: '検索語0点でも、記憶の断片なら100点。' },
  { id: 'cross_market_mini_printer', pillar: 'CROSS_MARKET', format: 'STATIC', memory: 'スマホの写真がその場で小さく出てくるもの', refined: 'スマホ対応 持ち運べる小型写真プリンター', hook: '欲しい商品を、Amazon・楽天・Qoo10・SHEINで比較。' },
  { id: 'trend_pet_fountain', pillar: 'AMBIGUOUS_TREND', format: 'CAROUSEL', memory: '猫がひとりでも水を飲める流れている器', refined: '留守番中の猫が使える自動給水器', hook: '用途しか分からなくても、商品候補までたどり着ける。' },
  { id: 'popular_wish_reel', pillar: 'POPULAR_WISH', format: 'REEL', memory: '今週みんなが保存した名前の分からない欲しいもの', refined: '今週SNSで人気の保存商品', hook: '今週の「ほしっトク」人気、3秒で見せます。' },
  { id: 'cross_market_charger', pillar: 'CROSS_MARKET', format: 'STATIC', memory: 'スマホの後ろにくっつく薄い充電器', refined: 'スマホ背面に磁石で付く薄型モバイルバッテリー', hook: '曖昧に探して、買える場所まで横断しよう。' }
]);

const PILLAR_COPY = Object.freeze({
  CROSS_MARKET: MARKETPLACE_MESSAGE,
  AMBIGUOUS_TREND: 'SNSで流行っている商品も、見た目・用途・見た場所からあいまい検索。',
  POPULAR_WISH: '「ほしっトク（ほしっとく）」で人気の商品を見つけて、買える場所まで探せます。'
});

function reelScript(theme) {
  if (theme.format !== 'REEL') return null;
  return {
    duration_seconds: 12,
    aspect_ratio: '9:16',
    scenes: [
      `0-2秒：${theme.hook}`,
      `2-5秒：検索欄へ「${theme.memory}」と入力`,
      '5-9秒：候補とAmazon・楽天市場・Qoo10・SHEINの横断ボタンをテンポよく表示',
      '9-12秒：「名前が分からなくても、ホシル。」＋保存CTA'
    ],
    asset_policy: '商品素材は権利確認済みのみ。未確認の場合はHOSHILU画面録画と文字モーションだけを使用する。'
  };
}

export function buildYouthSearchPost(index, platform = 'X') {
  const theme = THEMES[Math.abs(Number(index) || 0) % THEMES.length];
  const normalizedPlatform = String(platform || 'X').toUpperCase();
  const platformHook = normalizedPlatform === 'X'
    ? `これ、何て検索する？ ${theme.memory}`
    : `${theme.hook}\n「${theme.memory}」`;
  const query = encodeURIComponent(theme.refined);
  const source = normalizedPlatform.toLowerCase();
  const pillarCopy = PILLAR_COPY[theme.pillar];
  return {
    content_id: theme.id,
    platform: normalizedPlatform,
    campaign_pillar: theme.pillar,
    content_format: theme.format,
    caption: `${platformHook}\n${pillarCopy}\n${MARKETPLACE_MESSAGE}\n#ホシル #あいまい検索 #4モール横断 #ほしっトク`,
    link: `https://hoshilu.app/?q=${query}&utm_source=${source}&utm_medium=organic_social&utm_campaign=youth_marketplace_discovery&utm_content=${theme.id}`,
    prefill_query: theme.refined,
    reel_script: reelScript(theme),
    status: 'REVIEW_REQUIRED',
    affiliate: true
  };
}

export const youthSearchThemes = THEMES;