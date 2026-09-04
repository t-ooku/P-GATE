// 検索の意図カテゴリ（search-intelligence の細かい slug）と検索文から、
// 送客料のジャンル（seller-qualified-referral-pricing の11区分）を決める。
// 判定できなければ OTHER（最も安い側ではなく「その他」単価）。
// 価格表と同じ区分を使うので、セラーが /for-sellers で見た単価と請求が一致する。

const RULES = [
  ['COSMETICS', /(?:cosme|lip|tint|skincare|serum|foundation|mascara|perfume|shampoo|コスメ|化粧|リップ|ティント|美容液|ファンデ|マスカラ|アイシャドウ|香水|スキンケア|シャンプー|ヘアケア|ネイル|日焼け止め|クレンジング|洗顔)/iu],
  ['FASHION', /(?:fashion|apparel|bag|tote|shoes|sneaker|dress|blouse|shirt|pants|skirt|coat|jacket|hat|cap|wallet|watch|ring|necklace|earring|accessor|服|バッグ|トート|靴|スニーカー|ワンピース|ブラウス|シャツ|パンツ|スカート|コート|ジャケット|帽子|財布|時計|リング|指輪|ネックレス|ピアス|イヤリング|アクセサリー|サンダル|ブーツ|パーカー|ニット|カットソー)/iu],
  ['GADGET', /(?:gadget|electronics|earphone|headphone|charger|cable|speaker|camera|lamp|light|monitor|keyboard|mouse|tablet|phone|smart|vacuum|appliance|家電|イヤホン|ヘッドホン|充電|ケーブル|スピーカー|カメラ|ライト|照明|モニター|キーボード|マウス|タブレット|スマホ|掃除機|炊飯器|冷蔵庫|洗濯機|電子レンジ|エアコン|ドライヤー|プロジェクター|テレビ)/iu],
  ['FOOD', /(?:food|snack|coffee|tea|supplement|drink|食品|お菓子|コーヒー|お茶|紅茶|サプリ|飲料|調味料|米|麺|チョコ|グミ|プロテイン)/iu],
  ['BABY', /(?:baby|kids|toddler|stroller|diaper|ベビー|赤ちゃん|子供|キッズ|ベビーカー|おむつ|哺乳瓶|抱っこ紐|チャイルドシート)/iu],
  ['PET', /(?:pet|dog|cat|ペット|犬|猫|キャットフード|ドッグフード|猫砂|首輪|リード)/iu],
  ['SPORTS', /(?:sport|fitness|yoga|golf|run|bike|camp|outdoor|スポーツ|フィットネス|ヨガ|ゴルフ|ランニング|自転車|キャンプ|アウトドア|登山|釣り|ダンベル|トレーニング)/iu],
  ['AUTOMOTIVE', /(?:automotive|car|tire|dashcam|自動車|カー用品|車|タイヤ|ドライブレコーダー|バイク)/iu],
  ['HOBBY', /(?:hobby|toy|game|figure|plamo|puzzle|craft|book|manga|ホビー|おもちゃ|玩具|ゲーム|フィギュア|プラモ|パズル|手芸|本|漫画|推し活|ぬいぐるみ|カード)/iu],
  ['LIFESTYLE', /(?:lifestyle|kitchen|pillow|bedding|storage|towel|cleaning|bottle|furniture|interior|生活|キッチン|枕|寝具|布団|収納|タオル|掃除|水筒|家具|インテリア|雑貨|洗剤|マットレス|カーテン|ラグ|食器|鍋|弁当)/iu]
];

export function referralCategoryFor(categorySlug = '', queryText = '') {
  const text = `${String(categorySlug || '')} ${String(queryText || '')}`.normalize('NFKC');
  if (!text.trim()) return 'OTHER';
  for (const [code, pattern] of RULES) if (pattern.test(text)) return code;
  return 'OTHER';
}

export const REFERRAL_CATEGORY_LABELS = Object.freeze({
  FASHION: 'ファッション', COSMETICS: 'コスメ', GADGET: '家電・ガジェット', LIFESTYLE: '生活用品',
  FOOD: '食品', HOBBY: 'ホビー', BABY: 'ベビー・キッズ', PET: 'ペット', SPORTS: 'スポーツ',
  AUTOMOTIVE: '自動車用品', OTHER: 'その他'
});
