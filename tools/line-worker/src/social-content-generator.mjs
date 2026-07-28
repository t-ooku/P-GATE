const THEMES = Object.freeze([
  ['uv_umbrella', '日傘っぽいけど雨の日も使える、バッグに入る軽いやつ', 'バッグに入る軽い晴雨兼用の折りたたみ傘'],
  ['open_ear', '耳をふさがない、メガネみたいなイヤホン', '耳をふさがないオープンイヤー型イヤホン'],
  ['sunset_lamp', '壁が夕焼けみたいになる丸いライト', '夕焼けみたいな色が壁に映る丸いライト'],
  ['bag_charm', 'バッグにつける、小さいぬいぐるみみたいなもの', 'バッグにつける小さいぬいぐるみチャーム'],
  ['mini_printer', 'スマホの写真がその場で小さく出てくるもの', 'スマホ対応の持ち運べる小型写真プリンター'],
  ['portable_fan', '首にかける、羽が見えない涼しいやつ', '首掛け式の羽根なし携帯扇風機'],
  ['clear_earphones', 'ケースまで透明な、韓国っぽいイヤホン', '透明ケース付きのワイヤレスイヤホン'],
  ['pet_fountain', '猫がひとりでも水を飲める、流れている器', '留守番中の猫が使える自動給水器'],
  ['folding_bottle', '飲み終わったら小さくたためる水筒', '折りたためて漏れにくい軽量ボトル'],
  ['desk_storage', '机の上でくるくる回る、ペンやコスメを入れるもの', '回転式の卓上ペン・コスメ収納'],
  ['magnetic_charger', 'スマホの後ろにくっつく薄い充電器', 'スマホ背面に磁石で付く薄型モバイルバッテリー'],
  ['glow_shoes', '歩くと底が光るスニーカーみたいな靴', '歩くとソールがLEDで光るスニーカー']
]);

export function buildYouthSearchPost(index, platform = 'X') {
  const [contentId, memory, refined] = THEMES[Math.abs(Number(index) || 0) % THEMES.length];
  const normalizedPlatform = String(platform || 'X').toUpperCase();
  const hook = normalizedPlatform === 'X'
    ? `これ、何て検索する？「${memory}」`
    : `名前は分からない。でも欲しい。\n「${memory}」`;
  const query = encodeURIComponent(refined);
  const source = normalizedPlatform.toLowerCase();
  return {
    content_id: contentId,
    platform: normalizedPlatform,
    caption: `${hook}\nホシルが探せる言葉に変えます。 #これ何て検索する #ホシル`,
    link: `https://hoshilu.app/?q=${query}&utm_source=${source}&utm_medium=organic_social&utm_campaign=young_ambiguous_search&utm_content=${contentId}`,
    prefill_query: refined,
    status: 'REVIEW_REQUIRED',
    affiliate: true
  };
}

export const youthSearchThemes = THEMES;
