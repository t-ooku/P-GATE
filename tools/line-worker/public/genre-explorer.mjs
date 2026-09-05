// 2026-09-04 総合実行指示書 §13–14 / §52: ジャンル → 小ジャンル探索と「人気ジャンル」。
// 大きなジャンルから小ジャンルへ掘り下げ、最後の一押しで横断検索をそのまま走らせる
// （ファッション → バッグ → トートバッグ → 本革 → 自立する）。商品ファーストのまま、
// 「何を探せばいいか分からない」人の入口にする。検索文は日本語（モール検索に強い語）。
// 検索は app.js の #knowledgeForm をそのまま使う（別の検索経路を増やさない）。

const TREE = [
  { label: 'ファッション', en: 'Fashion', children: [
    { label: 'バッグ', q: 'バッグ', children: [
      { label: 'トートバッグ', q: 'トートバッグ', children: [
        { label: '本革', q: '本革 トートバッグ', children: [
          { label: '自立する', q: '自立する 本革 トートバッグ' }, { label: 'A4が入る', q: 'A4 本革 トートバッグ' }, { label: '軽い', q: '軽量 本革 トートバッグ' }
        ] },
        { label: 'キャンバス', q: 'キャンバス トートバッグ' }, { label: 'ナイロン', q: 'ナイロン トートバッグ' }, { label: 'ミニトート', q: 'ミニトートバッグ' }
      ] },
      { label: 'ショルダー', q: 'ショルダーバッグ', children: [{ label: '小さめ', q: 'ミニショルダーバッグ' }, { label: '本革', q: '本革 ショルダーバッグ' }, { label: '斜めがけ', q: '斜めがけ ショルダーバッグ' }] },
      { label: 'リュック', q: 'リュック', children: [{ label: '通勤・PC', q: 'PC リュック 通勤' }, { label: '軽量', q: '軽量 リュック' }, { label: 'レディース', q: 'レディース リュック' }] },
      { label: '財布', q: '財布', children: [{ label: 'ミニ財布', q: 'ミニ財布' }, { label: '長財布', q: '長財布 本革' }] }
    ] },
    { label: '靴', q: '靴', children: [
      { label: 'スニーカー', q: 'スニーカー', children: [{ label: '白', q: '白 スニーカー' }, { label: '厚底', q: '厚底 スニーカー' }, { label: '歩きやすい', q: '歩きやすい スニーカー' }] },
      { label: 'サンダル', q: 'サンダル' }, { label: 'ブーツ', q: 'ブーツ' }, { label: 'パンプス', q: 'パンプス 痛くない' }, { label: 'ローファー', q: 'ローファー' }
    ] },
    { label: 'トップス', q: 'トップス', children: [{ label: 'Tシャツ', q: 'Tシャツ' }, { label: 'ブラウス', q: 'ブラウス' }, { label: 'ニット', q: 'ニット' }, { label: 'パーカー', q: 'パーカー' }] },
    { label: 'ワンピース', q: 'ワンピース', children: [{ label: 'ロング', q: 'ロングワンピース' }, { label: 'きれいめ', q: 'きれいめ ワンピース' }, { label: 'カジュアル', q: 'カジュアル ワンピース' }] },
    { label: 'アウター', q: 'アウター', children: [{ label: 'トレンチ', q: 'トレンチコート' }, { label: 'ダウン', q: 'ダウンジャケット' }, { label: 'カーディガン', q: 'カーディガン' }] },
    { label: 'ボトムス', q: 'ボトムス', children: [{ label: 'デニム', q: 'デニム パンツ' }, { label: 'ワイドパンツ', q: 'ワイドパンツ' }, { label: 'スカート', q: 'スカート' }, { label: '楽ちんパンツ', q: '楽ちん パンツ レディース' }] },
    { label: 'アクセサリー', q: 'アクセサリー', children: [{ label: 'ピアス', q: 'ピアス' }, { label: 'ネックレス', q: 'ネックレス' }, { label: 'リング', q: 'リング' }, { label: '金属アレルギー対応', q: '金属アレルギー対応 ピアス' }] },
    { label: '帽子', q: '帽子', children: [{ label: 'キャップ', q: 'キャップ' }, { label: 'UVハット', q: 'UVカット ハット' }, { label: 'ニット帽', q: 'ニット帽' }] },
    { label: '腕時計', q: '腕時計', children: [{ label: 'レディース', q: 'レディース 腕時計' }, { label: 'メンズ', q: 'メンズ 腕時計' }, { label: 'ソーラー', q: 'ソーラー 腕時計' }] },
    { label: 'インナー・靴下', q: 'インナー', children: [{ label: 'ノンワイヤーブラ', q: 'ノンワイヤーブラ' }, { label: '靴下', q: '靴下' }, { label: 'あったかインナー', q: 'あったかインナー' }, { label: '接触冷感', q: '接触冷感 インナー' }] },
    { label: 'ルームウェア', q: 'ルームウェア', children: [{ label: 'パジャマ', q: 'パジャマ' }, { label: 'マタニティ', q: 'マタニティ パジャマ' }] },
    { label: 'メンズ', q: 'メンズ ファッション', children: [{ label: 'Tシャツ', q: 'メンズ Tシャツ' }, { label: 'パンツ', q: 'メンズ パンツ' }, { label: 'ジャケット', q: 'メンズ ジャケット' }] },
    { label: '雨具', q: 'レインウェア', children: [{ label: '折りたたみ傘', q: '折りたたみ傘' }, { label: 'レインコート', q: 'レインコート' }, { label: 'レインブーツ', q: 'レインブーツ' }] }
  ] },
  { label: 'コスメ・美容', en: 'Beauty', children: [
    { label: 'リップ', q: 'リップ', children: [{ label: 'ティント', q: 'リップティント' }, { label: '保湿', q: '保湿 リップ' }, { label: 'マット', q: 'マットリップ' }] },
    { label: 'スキンケア', q: 'スキンケア', children: [{ label: '化粧水', q: '化粧水' }, { label: '美容液', q: '美容液' }, { label: '日焼け止め', q: '日焼け止め' }, { label: 'クレンジング', q: 'クレンジング' }] },
    { label: 'ベースメイク', q: 'ファンデーション', children: [{ label: 'クッションファンデ', q: 'クッションファンデ' }, { label: '下地', q: '化粧下地' }] },
    { label: 'ヘアケア', q: 'ヘアケア', children: [{ label: 'シャンプー', q: 'シャンプー' }, { label: 'ヘアオイル', q: 'ヘアオイル' }, { label: 'ドライヤー', q: 'ドライヤー' }] },
    { label: '韓国コスメ', q: '韓国コスメ', children: [{ label: 'ティント', q: '韓国 ティント' }, { label: 'パック', q: '韓国 シートマスク' }, { label: 'クッションファンデ', q: '韓国 クッションファンデ' }] },
    { label: 'アイメイク', q: 'アイメイク', children: [{ label: 'マスカラ', q: 'マスカラ' }, { label: 'アイシャドウ', q: 'アイシャドウ' }, { label: 'アイライナー', q: 'アイライナー' }, { label: 'アイブロウ', q: 'アイブロウ' }] },
    { label: 'チーク・ハイライト', q: 'チーク', children: [{ label: 'チーク', q: 'チーク' }, { label: 'ハイライト', q: 'ハイライト' }] },
    { label: 'ネイル', q: 'ネイル', children: [{ label: 'ジェルネイル', q: 'ジェルネイル' }, { label: 'ネイルシール', q: 'ネイルシール' }, { label: 'ネイルオイル', q: 'ネイルオイル' }] },
    { label: 'ボディケア', q: 'ボディケア', children: [{ label: 'ボディクリーム', q: 'ボディクリーム' }, { label: 'ハンドクリーム', q: 'ハンドクリーム' }, { label: '入浴剤', q: '入浴剤' }, { label: 'ボディソープ', q: 'ボディソープ' }] },
    { label: '香水', q: '香水', children: [{ label: 'レディース', q: 'レディース 香水' }, { label: '石鹸の香り', q: '石鹸の香り 香水' }, { label: 'ミニ', q: 'ミニ 香水' }] },
    { label: 'メイク道具', q: 'メイク道具', children: [{ label: 'メイクブラシ', q: 'メイクブラシ' }, { label: 'ビューラー', q: 'ビューラー' }, { label: 'パフ・スポンジ', q: 'メイクスポンジ' }] },
    { label: 'ヘアアレンジ', q: 'ヘアアクセサリー', children: [{ label: 'ヘアクリップ', q: 'ヘアクリップ' }, { label: 'シュシュ', q: 'シュシュ' }, { label: 'ヘアアイロン', q: 'ヘアアイロン' }] },
    { label: 'メンズコスメ', q: 'メンズコスメ', children: [{ label: '洗顔', q: 'メンズ 洗顔' }, { label: '日焼け止め', q: 'メンズ 日焼け止め' }] }
  ] },
  { label: '家電・ガジェット', en: 'Electronics', children: [
    { label: 'イヤホン', q: 'ワイヤレスイヤホン', children: [{ label: 'ノイキャン', q: 'ノイズキャンセリング イヤホン' }, { label: '安い', q: 'ワイヤレスイヤホン 安い' }, { label: '運動用', q: 'スポーツ イヤホン' }] },
    { label: 'モバイルバッテリー', q: 'モバイルバッテリー', children: [{ label: '軽量', q: '軽量 モバイルバッテリー' }, { label: '大容量', q: '大容量 モバイルバッテリー' }] },
    { label: 'スマホ周り', q: 'スマホ アクセサリー', children: [{ label: 'ケース', q: 'スマホケース' }, { label: '充電器', q: '急速充電器' }, { label: 'スタンド', q: 'スマホスタンド' }] },
    { label: '季節家電', q: '季節家電', children: [{ label: 'ハンディファン', q: 'ハンディファン' }, { label: '加湿器', q: '加湿器' }, { label: '電気毛布', q: '電気毛布' }] },
    { label: '美容家電', q: '美容家電', children: [{ label: 'ヘアアイロン', q: 'ヘアアイロン' }, { label: '美顔器', q: '美顔器' }] },
    { label: 'キッチン家電', q: 'キッチン家電', children: [{ label: '炊飯器', q: '炊飯器' }, { label: '電気ケトル', q: '電気ケトル' }, { label: 'トースター', q: 'トースター' }, { label: 'コーヒーメーカー', q: 'コーヒーメーカー' }, { label: 'ホットプレート', q: 'ホットプレート' }] },
    { label: '掃除機', q: '掃除機', children: [{ label: 'コードレス', q: 'コードレス掃除機' }, { label: 'ロボット', q: 'ロボット掃除機' }, { label: '布団クリーナー', q: '布団クリーナー' }] },
    { label: '空調', q: '空調家電', children: [{ label: '扇風機', q: '扇風機' }, { label: 'サーキュレーター', q: 'サーキュレーター' }, { label: '除湿機', q: '除湿機' }, { label: '空気清浄機', q: '空気清浄機' }] },
    { label: 'テレビ・音響', q: 'テレビ', children: [{ label: '4Kテレビ', q: '4K テレビ' }, { label: 'スピーカー', q: 'Bluetooth スピーカー' }, { label: 'ヘッドホン', q: 'ヘッドホン' }] },
    { label: 'PC周り', q: 'PC周辺機器', children: [{ label: 'マウス', q: 'ワイヤレスマウス' }, { label: 'キーボード', q: 'キーボード' }, { label: 'モニター', q: 'モニター' }, { label: 'Webカメラ', q: 'Webカメラ' }] },
    { label: 'スマートウォッチ', q: 'スマートウォッチ', children: [{ label: 'レディース', q: 'レディース スマートウォッチ' }, { label: 'バンド', q: 'スマートウォッチ バンド' }] },
    { label: 'カメラ', q: 'カメラ', children: [{ label: 'ミラーレス', q: 'ミラーレス カメラ' }, { label: 'アクションカメラ', q: 'アクションカメラ' }, { label: 'チェキ', q: 'チェキ' }] },
    { label: '照明', q: '照明', children: [{ label: 'シーリングライト', q: 'シーリングライト' }, { label: 'デスクライト', q: 'デスクライト' }, { label: '間接照明', q: '間接照明' }] },
    { label: 'ゲーム', q: 'ゲーム', children: [{ label: 'Switch', q: 'Switch' }, { label: 'コントローラー', q: 'ゲーム コントローラー' }] }
  ] },
  { label: 'インテリア・生活', en: 'Home', children: [
    { label: '収納', q: '収納', children: [{ label: '収納ボックス', q: '収納ボックス' }, { label: 'ハンガーラック', q: 'ハンガーラック' }] },
    { label: 'キッチン', q: 'キッチン用品', children: [{ label: '水筒', q: '水筒' }, { label: '弁当箱', q: '弁当箱' }, { label: 'フライパン', q: 'フライパン' }] },
    { label: '寝具', q: '寝具', children: [{ label: '枕', q: '枕' }, { label: 'マットレス', q: 'マットレス' }] },
    { label: '掃除', q: '掃除用品', children: [{ label: 'コードレス掃除機', q: 'コードレス掃除機' }, { label: 'ロボット掃除機', q: 'ロボット掃除機' }] },
    { label: 'テーブル・椅子', q: '家具', children: [{ label: 'ダイニングテーブル', q: 'ダイニングテーブル' }, { label: 'ローテーブル', q: 'ローテーブル' }, { label: 'ワークチェア', q: 'ワークチェア' }, { label: 'スツール', q: 'スツール' }] },
    { label: 'ソファ', q: 'ソファ', children: [{ label: '2人掛け', q: '2人掛け ソファ' }, { label: 'ビーズクッション', q: 'ビーズクッション' }, { label: 'ソファカバー', q: 'ソファカバー' }] },
    { label: 'カーテン・ラグ', q: 'カーテン', children: [{ label: '遮光カーテン', q: '遮光カーテン' }, { label: 'ラグ', q: 'ラグ' }, { label: 'キッチンマット', q: 'キッチンマット' }] },
    { label: 'バス・トイレ', q: 'バス用品', children: [{ label: 'バスタオル', q: 'バスタオル' }, { label: 'シャワーヘッド', q: 'シャワーヘッド' }, { label: 'トイレマット', q: 'トイレマット' }, { label: '珪藻土マット', q: '珪藻土 バスマット' }] },
    { label: '洗濯', q: '洗濯用品', children: [{ label: '洗濯ハンガー', q: '洗濯ハンガー' }, { label: '室内物干し', q: '室内物干し' }, { label: 'ランドリーバスケット', q: 'ランドリーバスケット' }] },
    { label: '食器', q: '食器', children: [{ label: 'マグカップ', q: 'マグカップ' }, { label: 'お皿', q: 'お皿 セット' }, { label: '箸', q: '箸' }, { label: '子供用食器', q: '子供用 食器' }] },
    { label: '調理器具', q: '調理器具', children: [{ label: 'フライパン', q: 'フライパン' }, { label: '包丁', q: '包丁' }, { label: 'まな板', q: 'まな板' }, { label: '保存容器', q: '保存容器' }] },
    { label: 'ゴミ箱', q: 'ゴミ箱', children: [{ label: '臭わない', q: '臭わない ゴミ箱' }, { label: 'キッチン', q: 'キッチン ゴミ箱' }] },
    { label: '観葉植物・雑貨', q: 'インテリア雑貨', children: [{ label: '観葉植物', q: '観葉植物' }, { label: 'アロマ', q: 'アロマディフューザー' }, { label: '時計', q: '壁掛け時計' }] },
    { label: '防災', q: '防災グッズ', children: [{ label: '防災セット', q: '防災セット' }, { label: 'ポータブル電源', q: 'ポータブル電源' }, { label: '保存水', q: '保存水' }] }
  ] },
  { label: 'キッズ・ベビー', en: 'Kids', children: [
    { label: 'ベビー用品', q: 'ベビー用品', children: [{ label: '抱っこ紐', q: '抱っこ紐' }, { label: 'ベビーカー', q: 'ベビーカー' }] },
    { label: '子ども服', q: '子供服', children: [{ label: '女の子', q: '女の子 子供服' }, { label: '男の子', q: '男の子 子供服' }] },
    { label: 'おもちゃ', q: 'おもちゃ', children: [{ label: '知育', q: '知育玩具' }] },
    { label: 'ベビーカー', q: 'ベビーカー', children: [{ label: '軽量', q: '軽量 ベビーカー' }, { label: 'A型', q: 'A型 ベビーカー' }, { label: 'B型', q: 'B型 ベビーカー' }] },
    { label: 'おむつ・ケア', q: 'おむつ', children: [{ label: 'テープ', q: 'おむつ テープ' }, { label: 'パンツ', q: 'おむつ パンツ' }, { label: 'おしりふき', q: 'おしりふき' }, { label: 'おむつ用ゴミ箱', q: 'おむつ ゴミ箱' }] },
    { label: '授乳・ミルク', q: '授乳', children: [{ label: '哺乳瓶', q: '哺乳瓶' }, { label: '粉ミルク', q: '粉ミルク' }, { label: '授乳クッション', q: '授乳クッション' }, { label: '搾乳器', q: '搾乳器' }] },
    { label: '離乳食', q: '離乳食', children: [{ label: 'ベビーフード', q: 'ベビーフード' }, { label: '食器', q: '離乳食 食器' }, { label: 'エプロン', q: 'お食事エプロン' }] },
    { label: 'ねんね', q: 'ベビー寝具', children: [{ label: 'ベビーベッド', q: 'ベビーベッド' }, { label: 'スリーパー', q: 'スリーパー' }, { label: 'おくるみ', q: 'おくるみ' }] },
    { label: 'お風呂', q: 'ベビーバス', children: [{ label: 'ベビーバス', q: 'ベビーバス' }, { label: 'ベビーソープ', q: 'ベビーソープ' }, { label: 'バスチェア', q: 'ベビー バスチェア' }] },
    { label: 'チャイルドシート', q: 'チャイルドシート', children: [{ label: '新生児', q: '新生児 チャイルドシート' }, { label: 'ジュニアシート', q: 'ジュニアシート' }] },
    { label: '絵本・知育', q: '絵本', children: [{ label: '0歳', q: '絵本 0歳' }, { label: '2歳', q: '絵本 2歳' }, { label: '知育玩具', q: '知育玩具' }, { label: 'ドリル', q: '幼児 ドリル' }] },
    { label: '入園・通学', q: '入園グッズ', children: [{ label: '通園バッグ', q: '通園バッグ' }, { label: 'お名前シール', q: 'お名前シール' }, { label: 'ランドセル', q: 'ランドセル' }, { label: '水筒', q: '子供 水筒' }] },
    { label: 'キッズ靴', q: '子供靴', children: [{ label: 'スニーカー', q: 'キッズ スニーカー' }, { label: 'サンダル', q: 'キッズ サンダル' }, { label: '上履き', q: '上履き' }] },
    { label: 'マタニティ', q: 'マタニティ', children: [{ label: 'マタニティウェア', q: 'マタニティウェア' }, { label: '葉酸', q: '葉酸 サプリ' }, { label: '抱き枕', q: 'マタニティ 抱き枕' }] }
  ] },
  { label: 'スポーツ・アウトドア', en: 'Sports', children: [
    { label: 'ランニング', q: 'ランニング', children: [{ label: 'シューズ', q: 'ランニングシューズ' }, { label: 'ウェア', q: 'ランニングウェア' }] },
    { label: 'キャンプ', q: 'キャンプ用品', children: [{ label: 'テント', q: 'テント' }, { label: 'チェア', q: 'アウトドアチェア' }] },
    { label: 'ヨガ', q: 'ヨガ', children: [{ label: 'ヨガマット', q: 'ヨガマット' }, { label: 'ウェア', q: 'ヨガウェア' }] },
    { label: 'ゴルフ', q: 'ゴルフ用品', children: [{ label: 'ゴルフボール', q: 'ゴルフボール' }, { label: 'グローブ', q: 'ゴルフグローブ' }, { label: 'ウェア', q: 'ゴルフウェア' }] },
    { label: 'トレーニング', q: 'トレーニング', children: [{ label: 'ダンベル', q: 'ダンベル' }, { label: 'トレーニングマット', q: 'トレーニングマット' }, { label: '腹筋ローラー', q: '腹筋ローラー' }, { label: 'プロテイン', q: 'プロテイン' }] },
    { label: 'ウォーキング', q: 'ウォーキング', children: [{ label: 'シューズ', q: 'ウォーキングシューズ' }, { label: '歩数計', q: '歩数計' }] },
    { label: 'スイム', q: '水着', children: [{ label: 'レディース水着', q: 'レディース 水着' }, { label: 'キッズ水着', q: 'キッズ 水着' }, { label: 'ゴーグル', q: 'スイミングゴーグル' }] },
    { label: 'サイクル', q: '自転車', children: [{ label: '自転車', q: '自転車' }, { label: 'ヘルメット', q: '自転車 ヘルメット' }, { label: 'ライト', q: '自転車 ライト' }] },
    { label: 'ピクニック・BBQ', q: 'BBQ', children: [{ label: 'クーラーボックス', q: 'クーラーボックス' }, { label: 'レジャーシート', q: 'レジャーシート' }, { label: 'BBQコンロ', q: 'BBQコンロ' }] },
    { label: '登山', q: '登山', children: [{ label: 'トレッキングシューズ', q: 'トレッキングシューズ' }, { label: 'ザック', q: '登山 ザック' }, { label: 'レインウェア', q: '登山 レインウェア' }] },
    { label: 'テニス・バドミントン', q: 'テニス', children: [{ label: 'ラケット', q: 'テニス ラケット' }, { label: 'バドミントン', q: 'バドミントン ラケット' }] },
    { label: 'サッカー・野球', q: 'サッカー', children: [{ label: 'サッカーボール', q: 'サッカーボール' }, { label: 'グローブ', q: '野球 グローブ' }, { label: 'スパイク', q: 'サッカー スパイク' }] }
  ] },
  // 2026-09-05 大隆さん指示: ジャンルの選択肢を増やす（主婦層25〜40代の日常買いを中心に）。
  { label: '食品・飲料', en: 'Food', children: [
    { label: 'コーヒー・お茶', q: 'コーヒー', children: [{ label: 'ドリップコーヒー', q: 'ドリップコーヒー' }, { label: 'コーヒー豆', q: 'コーヒー豆' }, { label: '緑茶', q: '緑茶 ティーバッグ' }, { label: '紅茶', q: '紅茶 ティーバッグ' }] },
    { label: 'お菓子', q: 'お菓子', children: [{ label: 'チョコレート', q: 'チョコレート' }, { label: 'グミ', q: 'グミ' }, { label: 'せんべい', q: 'せんべい' }, { label: 'お菓子詰め合わせ', q: 'お菓子 詰め合わせ' }] },
    { label: '水・炭酸水', q: 'ミネラルウォーター', children: [{ label: '炭酸水', q: '炭酸水 500ml' }, { label: '2L 水', q: 'ミネラルウォーター 2L' }] },
    { label: 'ご飯・レトルト', q: 'レトルト食品', children: [{ label: 'パックご飯', q: 'パックご飯' }, { label: 'カレー', q: 'レトルトカレー' }, { label: '冷凍食品', q: '冷凍食品' }] },
    { label: '調味料', q: '調味料', children: [{ label: 'オリーブオイル', q: 'オリーブオイル' }, { label: 'だし', q: 'だしパック' }, { label: 'ドレッシング', q: 'ドレッシング' }] },
    { label: 'プロテイン', q: 'プロテイン', children: [{ label: 'ホエイ', q: 'ホエイプロテイン' }, { label: 'ソイ', q: 'ソイプロテイン' }] }
  ] },
  { label: '日用品・消耗品', en: 'Daily', children: [
    { label: '洗剤', q: '洗剤', children: [{ label: '洗濯洗剤', q: '洗濯洗剤' }, { label: '食器用洗剤', q: '食器用洗剤' }, { label: '柔軟剤', q: '柔軟剤' }] },
    { label: 'トイレ・紙', q: 'トイレットペーパー', children: [{ label: 'トイレットペーパー', q: 'トイレットペーパー' }, { label: 'ティッシュ', q: 'ティッシュペーパー' }, { label: 'キッチンペーパー', q: 'キッチンペーパー' }] },
    { label: '掃除', q: '掃除用品', children: [{ label: 'フロアワイパー', q: 'フロアワイパー' }, { label: 'カビ取り', q: 'カビ取り剤' }, { label: '排水口', q: '排水口 ネット' }] },
    { label: 'オーラルケア', q: '歯ブラシ', children: [{ label: '電動歯ブラシ', q: '電動歯ブラシ' }, { label: '歯磨き粉', q: '歯磨き粉' }, { label: 'フロス', q: 'デンタルフロス' }] },
    { label: 'マスク', q: 'マスク', children: [{ label: '不織布', q: '不織布マスク' }, { label: '子ども用', q: '子供用 マスク' }] }
  ] },
  { label: '健康・サプリ', en: 'Health', children: [
    { label: 'サプリ', q: 'サプリメント', children: [{ label: 'ビタミン', q: 'ビタミン サプリ' }, { label: '鉄分', q: '鉄分 サプリ' }, { label: '乳酸菌', q: '乳酸菌 サプリ' }] },
    { label: '睡眠', q: '睡眠', children: [{ label: '枕', q: '枕' }, { label: 'アイマスク', q: 'アイマスク' }, { label: '入浴剤', q: '入浴剤' }] },
    { label: '計測', q: '体重計', children: [{ label: '体重計', q: '体重計' }, { label: '体温計', q: '体温計' }, { label: '血圧計', q: '血圧計' }] },
    { label: 'マッサージ', q: 'マッサージ機', children: [{ label: 'マッサージガン', q: 'マッサージガン' }, { label: 'フットマッサージャー', q: 'フットマッサージャー' }] }
  ] },
  { label: 'ペット', en: 'Pets', children: [
    { label: '犬', q: '犬用品', children: [{ label: 'ドッグフード', q: 'ドッグフード' }, { label: 'おやつ', q: '犬 おやつ' }, { label: 'ハーネス', q: '犬 ハーネス' }, { label: 'トイレシート', q: 'ペットシーツ' }] },
    { label: '猫', q: '猫用品', children: [{ label: 'キャットフード', q: 'キャットフード' }, { label: '猫砂', q: '猫砂' }, { label: 'おもちゃ', q: '猫 おもちゃ' }, { label: 'キャットタワー', q: 'キャットタワー' }] },
    { label: 'ケア', q: 'ペット ケア', children: [{ label: 'ブラシ', q: 'ペット ブラシ' }, { label: '自動給水器', q: 'ペット 自動給水器' }] }
  ] },
  { label: '本・文具・ホビー', en: 'Hobby', children: [
    { label: '文具', q: '文房具', children: [{ label: 'ボールペン', q: 'ボールペン' }, { label: 'ノート', q: 'ノート' }, { label: '手帳', q: '手帳' }] },
    { label: 'ゲーム', q: 'ゲーム', children: [{ label: 'Switch ソフト', q: 'Switch ソフト' }, { label: 'コントローラー', q: 'ゲーム コントローラー' }, { label: 'ボードゲーム', q: 'ボードゲーム' }] },
    { label: 'ハンドメイド', q: 'ハンドメイド', children: [{ label: '毛糸', q: '毛糸' }, { label: 'ビーズ', q: 'ビーズ' }, { label: 'レジン', q: 'レジン' }] },
    { label: 'フィギュア・プラモ', q: 'フィギュア', children: [{ label: 'プラモデル', q: 'プラモデル' }, { label: 'ぬいぐるみ', q: 'ぬいぐるみ' }] }
  ] },
  { label: 'カー・自転車', en: 'Car & Bike', children: [
    { label: 'カー用品', q: 'カー用品', children: [{ label: 'ドライブレコーダー', q: 'ドライブレコーダー' }, { label: 'スマホホルダー', q: '車 スマホホルダー' }, { label: '芳香剤', q: '車 芳香剤' }, { label: 'チャイルドシート', q: 'チャイルドシート' }] },
    { label: '自転車', q: '自転車', children: [{ label: '電動アシスト', q: '電動アシスト自転車' }, { label: 'ヘルメット', q: '自転車 ヘルメット' }, { label: 'チャイルドシート', q: '自転車 チャイルドシート' }] }
  ] },
  { label: '旅行・季節', en: 'Travel', children: [
    { label: '旅行', q: '旅行用品', children: [{ label: 'スーツケース', q: 'スーツケース' }, { label: 'パッキング', q: 'トラベルポーチ' }, { label: 'ネックピロー', q: 'ネックピロー' }] },
    { label: '夏', q: '暑さ対策', children: [{ label: '日傘', q: '日傘' }, { label: '冷感', q: '冷感 タオル' }, { label: '虫よけ', q: '虫よけ' }] },
    { label: '冬', q: '防寒', children: [{ label: 'カイロ', q: 'カイロ' }, { label: '手袋', q: '手袋' }, { label: '加湿器', q: '加湿器' }] },
    { label: 'ギフト', q: 'ギフト', children: [{ label: '誕生日', q: '誕生日 プレゼント' }, { label: '出産祝い', q: '出産祝い' }, { label: '内祝い', q: '内祝い' }] }
  ] }
];

// 人気ジャンル: 楽天公式ランキングで検証済みの小ジャンル（marketplace-ranking.mjs と同じ5つ）＋定番。
const POPULAR = [
  { label: 'ワイヤレスイヤホン', q: 'ワイヤレスイヤホン' }, { label: 'モバイルバッテリー', q: 'モバイルバッテリー' },
  { label: '化粧水', q: '化粧水' }, { label: 'レディーススニーカー', q: 'レディース スニーカー' }, { label: 'ハンディファン', q: 'ハンディファン' },
  { label: 'トートバッグ', q: 'トートバッグ' }, { label: 'リップティント', q: 'リップティント' }, { label: '水筒', q: '水筒' }
];

const $ = (selector) => document.querySelector(selector);
const isEnglish = () => ($('#languageSelect')?.value || 'JA') === 'EN';

function chip(label, { active = false, leaf = false } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `chip genre-chip${active ? ' is-active' : ''}${leaf ? ' is-leaf' : ''}`;
  button.textContent = leaf ? `${label} で探す` : label;
  return button;
}

function runSearch(query) {
  const input = $('#query');
  const form = $('#knowledgeForm');
  if (!input || !form) return;
  input.value = query;
  $('#clearQuery')?.classList.remove('hidden');
  if (typeof form.requestSubmit === 'function') form.requestSubmit();
  else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  $('#hoshiluSearch')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let path = [];
function render() {
  const chips = $('#genreChips');
  const crumb = $('#genreBreadcrumb');
  if (!chips || !crumb) return;
  chips.replaceChildren();
  crumb.replaceChildren();
  const root = chip(isEnglish() ? 'All genres' : 'すべてのジャンル', { active: path.length === 0 });
  root.addEventListener('click', () => { path = []; render(); });
  crumb.append(root);
  let level = TREE;
  path.forEach((node, index) => {
    const arrow = document.createElement('span'); arrow.className = 'genre-arrow'; arrow.textContent = '›';
    const item = chip(node.label, { active: index === path.length - 1 });
    item.addEventListener('click', () => { path = path.slice(0, index + 1); render(); });
    crumb.append(arrow, item);
    level = node.children || [];
  });
  const current = path[path.length - 1];
  if (current?.q) {
    const here = chip(current.label, { leaf: true });
    here.addEventListener('click', () => runSearch(current.q));
    chips.append(here);
  }
  for (const node of level) {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const item = chip(isEnglish() && node.en ? node.en : node.label, { leaf: !hasChildren });
    item.addEventListener('click', () => {
      if (hasChildren) { path = [...path, node]; render(); }
      else runSearch(node.q || node.label);
    });
    chips.append(item);
  }
}

function renderPopular() {
  const target = $('#popularGenreChips');
  if (!target) return;
  target.replaceChildren();
  for (const item of POPULAR) {
    const button = chip(item.label);
    button.addEventListener('click', () => runSearch(item.q));
    target.append(button);
  }
  $('#popularRankingButton')?.addEventListener('click', () => $('#rankingSearchButton')?.click());
}

render();
renderPopular();
$('#languageSelect')?.addEventListener('change', render);
