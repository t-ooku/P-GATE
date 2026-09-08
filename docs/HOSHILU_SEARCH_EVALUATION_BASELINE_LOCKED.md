# HOSHILU ITG曖昧検索評価 — baseline

生成日時: 2026-07-23T17:14:12.470Z

| 区分 | 件数 | Top-1 | Top-3 | カテゴリ一致 | MRR | nDCG@3 | 無回答率 | 誤答率 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 全体 | 90 | 20.0% | 23.3% | 26.7% | 0.216 | 0.218 | 65.6% | 11.1% |
| 情報量:rich | 30 | 60.0% | 70.0% | 76.7% | 0.647 | 0.654 | 10.0% | 20.0% |
| 情報量:ambiguous | 30 | 0.0% | 0.0% | 0.0% | 0.000 | 0.000 | 90.0% | 10.0% |
| 情報量:ultra_ambiguous | 30 | 0.0% | 0.0% | 3.3% | 0.000 | 0.000 | 96.7% | 3.3% |
| タイプ:category_branch | 21 | 14.3% | 14.3% | 23.8% | 0.155 | 0.143 | 66.7% | 19.0% |
| タイプ:color_package | 24 | 25.0% | 29.2% | 29.2% | 0.264 | 0.271 | 66.7% | 4.2% |
| タイプ:compatibility | 21 | 19.0% | 19.0% | 28.6% | 0.202 | 0.190 | 61.9% | 19.0% |
| タイプ:memory | 3 | 33.3% | 33.3% | 33.3% | 0.333 | 0.333 | 66.7% | 0.0% |
| タイプ:place_context | 3 | 33.3% | 33.3% | 33.3% | 0.333 | 0.333 | 66.7% | 0.0% |
| タイプ:sensory | 6 | 16.7% | 33.3% | 33.3% | 0.222 | 0.250 | 66.7% | 0.0% |
| タイプ:shape_function | 51 | 19.6% | 23.5% | 25.5% | 0.212 | 0.218 | 68.6% | 7.8% |
| タイプ:social_context | 18 | 22.2% | 22.2% | 22.2% | 0.222 | 0.222 | 61.1% | 16.7% |
| タイプ:usage_scene | 33 | 18.2% | 24.2% | 27.3% | 0.207 | 0.216 | 63.6% | 12.1% |

## ケース別結果

### T01-1 ❌

- クエリ: Klein Toolsの全長12インチ、軸長12インチのキーストーン型マイナスドライバー
- 正解ASIN: B000G1VER6
- 順位: 圏外/無回答
- 上位候補: B07PSK2HXV Theo Klein - キャタピラートラックエンジンプレミアムトイ 対象年齢3歳以上 / B0002RI50S KLEIN TOOLS社 KLEIN 掴線器 2268kg 1604-20 / B0002RI52G Klein Tools 162520 Klein Havens Grip for Wire Rope by Klein Tools

### T01-2 —

- クエリ: 黄色と黒の持ち手で長い軸のマイナスドライバー
- 正解ASIN: B000G1VER6
- 順位: 圏外/無回答
- 上位候補: なし

### T01-3 —

- クエリ: 工具みたいな細長いやつ
- 正解ASIN: B000G1VER6
- 順位: 圏外/無回答
- 上位候補: なし

### T02-1 ❌

- クエリ: LEGOの40周年限定40370、188ピースの蒸気機関車セット
- 正解ASIN: B085CMYZ6B
- 順位: 圏外/無回答
- 上位候補: B01D9NK48M オートケア製品 Large Vehicle 10 Wide 95410 / B07Q5BL47D 3M 2080 SB12 Shadow Black 5ft x 21ft W/Application Card Vinyl Vehicle Car Wrap Film Sheet Roll / B07Q59KW7M 3M 2080 SB12 Shadow Black 5ft x 9ft W/Application Card Vinyl Vehicle Car Wrap Film Sheet Roll

### T02-2 ❌

- クエリ: 黒い蒸気機関車を組み立てる限定レゴ
- 正解ASIN: B085CMYZ6B
- 順位: 圏外/無回答
- 上位候補: B01D9NK48M オートケア製品 Large Vehicle 10 Wide 95410 / B07Q5BL47D 3M 2080 SB12 Shadow Black 5ft x 21ft W/Application Card Vinyl Vehicle Car Wrap Film Sheet Roll / B07Q59KW7M 3M 2080 SB12 Shadow Black 5ft x 9ft W/Application Card Vinyl Vehicle Car Wrap Film Sheet Roll

### T02-3 —

- クエリ: SNSで見た黒い乗り物のおもちゃ
- 正解ASIN: B085CMYZ6B
- 順位: 圏外/無回答
- 上位候補: なし

### T03-1 ✅

- クエリ: Mrs. Meyers Clean Dayのラベンダー香、7.2オンスのソイキャンドル2個セット
- 正解ASIN: B01J4PDR1A
- 順位: 3
- 上位候補: B000EJ5E9E Mrs. Meyers Clean Day Dryer Sheets Lavender 80-Count Boxes by Mrs. Meyers Clean Day / B00O87GHQW Mrs Meyers dish soap liq Rosemary 16 Oz by Mrs. Meyers Clean Day / B01J4PDR1A Mrs。Meyers Clean Day mrm-64558p2 MrsマイヤーズClean Day Soy Candle & # 44 ;ラベンダー& # 44 ; 7.2 Oz & # 44 ; 2パック

### T03-2 —

- クエリ: ラベンダーの香りがする大豆ワックスのキャンドル
- 正解ASIN: B01J4PDR1A
- 順位: 圏外/無回答
- 上位候補: なし

### T03-3 —

- クエリ: いい匂いの容器に入った火をつけるやつ
- 正解ASIN: B01J4PDR1A
- 順位: 圏外/無回答
- 上位候補: なし

### T04-1 —

- クエリ: HamiltonBuhlの耳に入れるタイプのイヤーバッドヘッドホン
- 正解ASIN: B001CLUL32
- 順位: 圏外/無回答
- 上位候補: なし

### T04-2 —

- クエリ: 小さくて耳に入れる有線ヘッドホン
- 正解ASIN: B001CLUL32
- 順位: 圏外/無回答
- 上位候補: なし

### T04-3 —

- クエリ: 音を聞く小さいやつ
- 正解ASIN: B001CLUL32
- 順位: 圏外/無回答
- 上位候補: なし

### T05-1 ✅

- クエリ: Evoc FR TRAIL BLACKLINE、20Lで背中のプロテクター付きサイクリング用バックパック
- 正解ASIN: B00NNEL72K
- 順位: 1
- 上位候補: B00NNEL72K (XL-20 L Black) - Evoc FR TRAIL BLACKLINE 20l - Backpack for cycling with back protector 20 Litres / B0BJPS1HFZ EVOC マルチフレームパック 不浸透性 / B0BJPX3HB1 EVOC マルチフレームパック WP

### T05-2 ❌

- クエリ: 自転車用で背中を守る黒い20Lリュック
- 正解ASIN: B00NNEL72K
- 順位: 圏外/無回答
- 上位候補: B01D9NK48M オートケア製品 Large Vehicle 10 Wide 95410 / B07Q5BL47D 3M 2080 SB12 Shadow Black 5ft x 21ft W/Application Card Vinyl Vehicle Car Wrap Film Sheet Roll / B07Q59KW7M 3M 2080 SB12 Shadow Black 5ft x 9ft W/Application Card Vinyl Vehicle Car Wrap Film Sheet Roll

### T05-3 —

- クエリ: 外で背負う黒いやつ
- 正解ASIN: B00NNEL72K
- 順位: 圏外/無回答
- 上位候補: なし

### T06-1 ❌

- クエリ: FossilのメンズFS4813 Grant、ステンレスケースと茶色レザーバンドの腕時計
- 正解ASIN: B00AFTTQ8I
- 順位: 圏外/無回答
- 上位候補: B000VU4UM8 Grant Products 846クラシックノスタルジアホイール / B000CMJ1KQ Grant Products 1075トップマーカーコンペティションホイール / B000CMH3HY Grant Products 213クラシックウッドホイール

### T06-2 —

- クエリ: 茶色い革ベルトと金属ケースの男性用時計
- 正解ASIN: B00AFTTQ8I
- 順位: 圏外/無回答
- 上位候補: なし

### T06-3 —

- クエリ: インスタで見た茶色と銀色のアクセサリー
- 正解ASIN: B00AFTTQ8I
- 順位: 圏外/無回答
- 上位候補: なし

### T07-1 ✅

- クエリ: TITANflex Thor Grip、黒、8mil、ダイヤモンド凹凸付きの使い捨てニトリル手袋100枚
- 正解ASIN: B0BSSVR7HZ
- 順位: 2
- 上位候補: B0BDYR35F4 TITANflex Thor Grip Heavy Duty Industrial Orange Nitrile Gloves 8-mil Gloves Disposable Latex Free with Raised Diamond Texture Grip Powder Free Rubber Gloves Mechanic Gloves1000-ct Case (XL) / B0BSSVR7HZ [Yirui] LXL a94TitanFlex Thor Grip Heavy Duty Black Industrial Nitrile Gloves with Raised Diamond Texture 8-mil Latex Free 100-ct Box / B00MGSGRF6 [Gloveworks] 厚手ニトリルグローブ - オレンジ、ダイヤモンド加工ファルコン強力グリップ、耐油作業手袋、100枚入りボックスまたは1000枚入りケース、8mil/0.2mm、メカニックグローブ、自動車バイクメンテナンス用 (M)

### T07-2 —

- クエリ: 黒くて表面に滑り止めの凹凸がある厚手作業手袋
- 正解ASIN: B0BSSVR7HZ
- 順位: 圏外/無回答
- 上位候補: なし

### T07-3 —

- クエリ: 手につける黒い消耗品
- 正解ASIN: B0BSSVR7HZ
- 順位: 圏外/無回答
- 上位候補: なし

### T08-1 ✅

- クエリ: Spectralink 8400用デュアル充電器キット
- 正解ASIN: B00B4R8HW6
- 順位: 1
- 上位候補: B00B4R8HW6 Spectralink SPL 8400 DUAL CHARGER KIT

### T08-2 —

- クエリ: 機器を2台置ける黒い充電台
- 正解ASIN: B00B4R8HW6
- 順位: 圏外/無回答
- 上位候補: なし

### T08-3 —

- クエリ: 職場で機械を置いていた黒いやつ
- 正解ASIN: B00B4R8HW6
- 順位: 圏外/無回答
- 上位候補: なし

### T09-1 ✅

- クエリ: AXIS P5655-E、型番01682-001のPTZネットワークカメラ
- 正解ASIN: B07WW7QP26
- 順位: 1
- 上位候補: B07WW7QP26 AXIS P5655-E PTZ Network Camera 01682-001 / B00LR5FRA0 Axis T8125 / B0BWNPJLCJ AXIS C1610-VEプロジェクターは屋外に最適。

### T09-2 —

- クエリ: 首振りできる白いドーム型ネットワークカメラ
- 正解ASIN: B07WW7QP26
- 順位: 圏外/無回答
- 上位候補: なし

### T09-3 —

- クエリ: 天井についていた白い丸いやつ
- 正解ASIN: B07WW7QP26
- 順位: 圏外/無回答
- 上位候補: なし

### T10-1 ✅

- クエリ: Logitech G105 Call of Duty MW3 Editionのゲーミングキーボード
- 正解ASIN: B00BBUCCKO
- 順位: 1
- 上位候補: B00BBUCCKO Logitech Gaming Keyboard G105 Call of Duty: MW3 Edition【並行輸入品】 / B00E8A06DO Call of Duty: Ghosts / B00GTS6YES Ps4 call of duty : ghosts (eu)

### T10-2 —

- クエリ: ゲーム用の黒いLogitechキーボード
- 正解ASIN: B00BBUCCKO
- 順位: 圏外/無回答
- 上位候補: なし

### T10-3 —

- クエリ: 配信で見た光る入力する板
- 正解ASIN: B00BBUCCKO
- 順位: 圏外/無回答
- 上位候補: なし

### T11-1 ✅

- クエリ: Logitech G PRO X Superlight、黒のワイヤレスゲーミングマウス
- 正解ASIN: B08RMZKYTL
- 順位: 1
- 上位候補: B08RMZKYTL Logitech G PRO X Superlight Wireless Gaming Mouse - Black / B01K8TV0JW Logitech - Pro ウェブカメラ - ブラック / B01M1BNTZN Logitech G Pro フライトスイッチパネル。

### T11-2 —

- クエリ: すごく軽い黒い無線ゲーミングマウス
- 正解ASIN: B08RMZKYTL
- 順位: 圏外/無回答
- 上位候補: なし

### T11-3 —

- クエリ: パソコンで動かす黒い小さいやつ
- 正解ASIN: B08RMZKYTL
- 順位: 圏外/無回答
- 上位候補: なし

### T12-1 ✅

- クエリ: Dicky Chug Big、20オンスで暗闇で光るスポーツボトル
- 正解ASIN: B076DLN9BM
- 順位: 1
- 上位候補: B076DLN9BM Dicky Chug Big Sports Bottle - 20 oz Glow in the Dark / B00CQSZCBG Heddon Chugn Spook ジュニアフィッシングルアー フォクシーシャッド / B07X8R3ZND Nomad Chug Norris ポッパー: 6インチ Nomad ルアー 海水ギア

### T12-2 —

- クエリ: 暗い場所で光る大きめの水筒
- 正解ASIN: B076DLN9BM
- 順位: 圏外/無回答
- 上位候補: なし

### T12-3 —

- クエリ: TikTokで見た光るボトル
- 正解ASIN: B076DLN9BM
- 順位: 圏外/無回答
- 上位候補: なし

### T13-1 ✅

- クエリ: Lite Source Pepita LS-20073AQUA、アクア色ガラスと布シェードのテーブルランプ
- 正解ASIN: B000V6IO9M
- 順位: 1
- 上位候補: B000V6IO9M Lite Source LS-20073AQUA Pepita Table Lamp Aqua Glass with Fabric Shade by Lite Source / B00H5C2D88 Lite Source LS-82341BB Wayland フロアランプ つや消し真鍮 / B000QTR6V6 Lite Source Bess フロアランプ LS-80700D/BRZ 1

### T13-2 —

- クエリ: 水色のガラス土台と布の傘がある卓上ライト
- 正解ASIN: B000V6IO9M
- 順位: 圏外/無回答
- 上位候補: なし

### T13-3 —

- クエリ: 部屋に置く青っぽく光るやつ
- 正解ASIN: B000V6IO9M
- 順位: 圏外/無回答
- 上位候補: なし

### T14-1 ✅

- クエリ: HEATGENE、角型バー8本の浴室用加熱タオルウォーマー乾燥ラック
- 正解ASIN: B0778VN76T
- 順位: 1
- 上位候補: B0778VN76T HEATGENE Hot Towel Warmer for Bath Heated Drying Rack 8 Square Bar Brush Finish

### T14-2 —

- クエリ: 浴室でタオルを掛けて温める銀色のラック
- 正解ASIN: B0778VN76T
- 順位: 圏外/無回答
- 上位候補: なし

### T14-3 —

- クエリ: お風呂場の壁にある温かくなる棒
- 正解ASIN: B0778VN76T
- 順位: 圏外/無回答
- 上位候補: なし

### T15-1 ✅

- クエリ: Suave Men 3-in-1、シャンプー・コンディショナー・ボディウォッシュ28ozの2本組
- 正解ASIN: B005LFO2DA
- 順位: 1
- 上位候補: B005LFO2DA Suave Men 3-in-1 Shampoo Conditioner & Body Wash 28 oz 2 pk by Suave [並行輸入品] / B002DC8GTK Thinksmart Ki +8 (輸入版) / B005VKRHE6 Men In Black Alien Crisis (輸入版) - PS3

### T15-2 —

- クエリ: 男性用で髪と体を一本で洗える大きなボトル2本
- 正解ASIN: B005LFO2DA
- 順位: 圏外/無回答
- 上位候補: なし

### T15-3 ❌

- クエリ: お風呂で使う男性用の液体
- 正解ASIN: B005LFO2DA
- 順位: 圏外/無回答
- 上位候補: B002CXAPDU Liquid Force バインディングアングルロック (2008-2011) ブラック / B00KHJ6LL6 Fluidmaster 500p21フラッパー / B00LUR6QT6 Fluidmaster pro4t20ステンレススチール20インチトイレ供給ライン

### T16-1 ✅

- クエリ: Prince Matchabelli Wind Song、4オンスの香り付きダスティングパウダー
- 正解ASIN: B00K5F816K
- 順位: 1
- 上位候補: B00K5F816K WIND SONG 4 OZ PERFUMED DUSTING POWDER by Prince Matchabelli / B07C6ZLW1D Uttermost 18603 Songbirds真鍮&ホワイト大理石テーブルトップSculpture / B000LHA0O8 A Song for the Season

### T16-2 —

- クエリ: 香水みたいな香りのする粉状ボディパウダー
- 正解ASIN: B00K5F816K
- 順位: 圏外/無回答
- 上位候補: なし

### T16-3 —

- クエリ: 母が使っていたいい匂いの粉
- 正解ASIN: B00K5F816K
- 順位: 圏外/無回答
- 上位候補: なし

### T17-1 ✅

- クエリ: Diamond Select Toysのインディ・ジョーンズ、1:6スケール胸像
- 正解ASIN: B0C1ZZ9L2W
- 順位: 1
- 上位候補: B0C1ZZ9L2W Diamond Select Toys インディ・ジョーンズとレイダーズ・オブ・ザ・ロストアーク:インディ1:6スケール バスト / B08G1DDCSH Diamond Select Toys アバター The Last Airbender Aang Deluxe アクションフィギュア マルチカラー / B01FFEI5K2 Ghostbusters Select Slimer Action Figure

### T17-2 —

- クエリ: 映画の男性キャラクターの上半身だけの置物
- 正解ASIN: B0C1ZZ9L2W
- 順位: 圏外/無回答
- 上位候補: なし

### T17-3 —

- クエリ: SNSで見た茶色い帽子の人形
- 正解ASIN: B0C1ZZ9L2W
- 順位: 圏外/無回答
- 上位候補: なし

### T18-1 ✅

- クエリ: HEYE 29693 Marino Degano Funky Zoo Nile Habitat、1000ピースパズル
- 正解ASIN: B00OUXQW2I
- 順位: 1
- 上位候補: B00OUXQW2I HEYE Puzzle ヘイパズル 29693 Marino Degano : Funky Zoo Nile Habitat (1000 pieces) / B00H9Y6SDI HEYE Puzzle ヘイパズル 29639 Marino Degano : Funky Zoo African Habitat (1000 pieces) / B00H9Y7F6M HEYE Puzzle ヘイパズル 29638 Marino Degano : Funky Zoo Black Forest Habitat (1000 pieces)

### T18-2 —

- クエリ: 動物園とナイルが描かれた1000ピースのパズル
- 正解ASIN: B00OUXQW2I
- 順位: 圏外/無回答
- 上位候補: なし

### T18-3 —

- クエリ: 動物がたくさん描いてある箱の遊ぶもの
- 正解ASIN: B00OUXQW2I
- 順位: 圏外/無回答
- 上位候補: なし

### T19-1 ✅

- クエリ: Super Slim Wallet、Jet Blackの超薄型財布
- 正解ASIN: B001CZFXHM
- 順位: 1
- 上位候補: B001CZFXHM Super Slim Wallet Jet Black / B000VBGR32 Diabetic Wallet Insulin Cooler Travel Wallet - Double Pen Pouch - Black by Poucho / B07NYBD3WH Frye Melissa Wallet Carbon

### T19-2 —

- クエリ: とても薄い真っ黒な財布
- 正解ASIN: B001CZFXHM
- 順位: 圏外/無回答
- 上位候補: なし

### T19-3 —

- クエリ: ポケットに入れる黒い薄いやつ
- 正解ASIN: B001CZFXHM
- 順位: 圏外/無回答
- 上位候補: なし

### T20-1 —

- クエリ: 24インチ、幅4mmの14Kイエローゴールドフィルド・フィガロチェーンネックレス
- 正解ASIN: B0768NT3RW
- 順位: 圏外/無回答
- 上位候補: なし

### T20-2 —

- クエリ: 金色で太め、フィガロ型の長いチェーン
- 正解ASIN: B0768NT3RW
- 順位: 圏外/無回答
- 上位候補: なし

### T20-3 —

- クエリ: 首につける金色の長いやつ
- 正解ASIN: B0768NT3RW
- 順位: 圏外/無回答
- 上位候補: なし

### T21-1 ✅

- クエリ: NS NoveltiesのStamina Rings、3色アソートセット
- 正解ASIN: B00IXEW7CE
- 順位: 1
- 上位候補: B00IXEW7CE Stamina Rings Set 3 Assorted Colors by NS Novelties / 1590308913 The Book of Five Rings / B003GSPZ6W Vortex Hunter 30MM Medium Rings- set

### T21-2 —

- クエリ: 色違いが3個入った運動用リング
- 正解ASIN: B00IXEW7CE
- 順位: 圏外/無回答
- 上位候補: なし

### T21-3 —

- クエリ: 動画で見た輪っか3つの運動道具
- 正解ASIN: B00IXEW7CE
- 順位: 圏外/無回答
- 上位候補: なし

### T22-1 ❌

- クエリ: Vivitar 52mm、赤・黄・青・オレンジ・グレー・紫の回転グラデーションカラーフィルター6点セット
- 正解ASIN: B00DH4EFW0
- 順位: 圏外/無回答
- 上位候補: B005DBWWQ6 Vivitar VNDX52 52mm 1ピースカメラレンズフィルターセット / B004BOFDZ8 Vivitarデラックスユニバーサルフラッシュディフューザー / B003JFJ266 VivitarハードShallビデオカメラケース

### T22-2 —

- クエリ: カメラにつける52mmの色付き丸いフィルター6枚
- 正解ASIN: B00DH4EFW0
- 順位: 圏外/無回答
- 上位候補: なし

### T22-3 —

- クエリ: 写真の色を変える丸い板
- 正解ASIN: B00DH4EFW0
- 順位: 圏外/無回答
- 上位候補: なし

### T23-1 ✅

- クエリ: Moleskine Extra Large、罫線入り、Myrtle Greenのハードカバーノート7.5×9.75インチ
- 正解ASIN: B07J3KHV76
- 順位: 1
- 上位候補: B07J3KHV76 Moleskine Notebook Extra Large Ruled Myrtle Green Hard Cover (7.5 x 9.75) / 3836550377 Jean-Michel Basquiat (Extra Large) / 3836572109 Masterpieces of Fantasy Art (Extra Large)

### T23-2 —

- クエリ: 深い緑色で大きめの硬い表紙の罫線ノート
- 正解ASIN: B07J3KHV76
- 順位: 圏外/無回答
- 上位候補: なし

### T23-3 —

- クエリ: 文房具屋で見た緑の四角いやつ
- 正解ASIN: B07J3KHV76
- 順位: 圏外/無回答
- 上位候補: なし

### T24-1 ❌

- クエリ: Hohner PentaHarp Cマイナー、ジップケース・説明書・クロス付きハーモニカセット
- 正解ASIN: B0B6216WKJ
- 順位: 4
- 上位候補: B09M525KMG HOHNER Pentaharp Harmonica Key of G Minor Stainless steel (M21BX-GM) / B09M59FWML HOHNER Pentaharp Harmonica Key of D Minor Stainless steel (M21BX-DM) / B09M5BD56P HOHNER Pentaharp Harmonica Key of E Minor Stainless steel (M21BX-EM)

### T24-2 —

- クエリ: ケースとクロスが付いたCマイナーのハーモニカ
- 正解ASIN: B0B6216WKJ
- 順位: 圏外/無回答
- 上位候補: なし

### T24-3 —

- クエリ: 口で音を出す銀色の小さい楽器
- 正解ASIN: B0B6216WKJ
- 順位: 圏外/無回答
- 上位候補: なし

### T25-1 ❌

- クエリ: Master Cables製、Sony VMCUAM2交換用USBアダプターケーブル
- 正解ASIN: B07STMN9KM
- 順位: 圏外/無回答
- 上位候補: B01I01ZCG2 SONY PAPER UPP-110HD 高密度印刷用紙 10ロール / B0002V7ODI HELLBOY / B0000AJLU2 ANGER MANAGEMENT

### T25-2 —

- クエリ: ソニー機器用の交換USB変換ケーブル
- 正解ASIN: B07STMN9KM
- 順位: 圏外/無回答
- 上位候補: なし

### T25-3 —

- クエリ: 機械とパソコンをつなぐ黒い線
- 正解ASIN: B07STMN9KM
- 順位: 圏外/無回答
- 上位候補: なし

### T26-1 ✅

- クエリ: Pillow Perfect、クリスマスの森柄、グレー、12×18インチの装飾腰枕
- 正解ASIN: B07HYWQVLX
- 順位: 1
- 上位候補: B07HYWQVLX Pillow Perfect Christmas Forest Scene 装飾腰枕 12インチ x 18インチ グレー / B07ST79NV6 Pretty Perfect Studio カスタムレイクハウスサイン ファミリーレイクホーム装飾 レイクライフ リビングルーム用 12インチ x 36インチ ブラックフレーム すぐに掛けられるキャンバスウォールアート / B08LH91L6P カスタムホームムービーシアターヴィンテージマーキーサイン、シネマフレームキャンバスウォールアート 映画テーマの装飾 12インチx36インチ

### T26-2 —

- クエリ: 冬の森が描かれた灰色の横長クッション
- 正解ASIN: B07HYWQVLX
- 順位: 圏外/無回答
- 上位候補: なし

### T26-3 —

- クエリ: ソファに置く冬っぽいふわふわ
- 正解ASIN: B07HYWQVLX
- 順位: 圏外/無回答
- 上位候補: なし

### T27-1 —

- クエリ: ロックバック機構付きの折りたたみナイフ
- 正解ASIN: B000HSCOJA
- 順位: 圏外/無回答
- 上位候補: なし

### T27-2 —

- クエリ: 刃を折りたためて背中側でロックするナイフ
- 正解ASIN: B000HSCOJA
- 順位: 圏外/無回答
- 上位候補: なし

### T27-3 —

- クエリ: キャンプで使う折りたためる刃物
- 正解ASIN: B000HSCOJA
- 順位: 圏外/無回答
- 上位候補: なし

### T28-1 ✅

- クエリ: InterDesign、10×5×6インチ、透明のパントリー・冷蔵庫・冷凍庫用収納オーガナイザービン
- 正解ASIN: B00CS8DT00
- 順位: 3
- 上位候補: B00WSO18SE InterDesign Linus 台所の引き出しの整理用容器 S ホワイト 52230M2 / B01KJ8KPY8 インターデザイン（interDesign） YorkLyraBath メタルソープポンプ│洗面用具・洗面所用品 ソープディスペンサー / B00CS8DT00 InterDesign Home Kitchen Organizer Bin for Pantry Refrigerator Freezer & Storage Cabinet 10 x 5 x 6 Clear

### T28-2 —

- クエリ: 冷蔵庫にも使える透明で細長い収納ケース
- 正解ASIN: B00CS8DT00
- 順位: 圏外/無回答
- 上位候補: なし

### T28-3 —

- クエリ: 台所で物を分ける透明な箱
- 正解ASIN: B00CS8DT00
- 順位: 圏外/無回答
- 上位候補: なし

### T29-1 ✅

- クエリ: j5create JCA374 USB Type-Cマルチアダプター
- 正解ASIN: B01FI7PEH8
- 順位: 1
- 上位候補: B01FI7PEH8 USB Type-C Multi-Adapter JCA374 by j5create / B015U1L16K USB 3.1 Type - C to Typeアダプタjucx05 / B07D42ZV9D j5 create JCD381 USB Type-C Dual HDMI ミニドック

### T29-2 ❌

- クエリ: USB-Cに複数の端子を増やす小型アダプター
- 正解ASIN: B01FI7PEH8
- 順位: 圏外/無回答
- 上位候補: B002I0XGWO KEYSCAN USBSER USBコミュニケーターアダプター / B00434DY8E AudioQuest Coffee USB A-B ケーブル ブラック 0.75m USB A USB B - USBケーブル (0.75m 0.75m USB A USB B オス/オス ブラック シルバー) / B00ZAFM3VE Digiface USB 66チャンネル 192kHz USBオーディオインターフェース

### T29-3 —

- クエリ: ノートPCにつなぐ端子がたくさんあるやつ
- 正解ASIN: B01FI7PEH8
- 順位: 圏外/無回答
- 上位候補: なし

### T30-1 ✅

- クエリ: Livex Lighting 50685-91 Midtown、ブラッシュドニッケルの6灯バスライト
- 正解ASIN: B00LEVNMS6
- 順位: 1
- 上位候補: B00LEVNMS6 Livex Lighting 50685-91 Midtown 6-Light Bath Light Brushed Nickel by Livex Lighting / B00563XVQQ Livex Lighting 1032 ? 91ミッション2ライトVanityつや消しニッケルつや消しのガラス / B008N00DR4 Livex Lighting 1333 ? 91 Astoriaバスライト

### T30-2 —

- クエリ: 銀色の横長バーにライトが6個付いた浴室用照明
- 正解ASIN: B00LEVNMS6
- 順位: 圏外/無回答
- 上位候補: なし

### T30-3 —

- クエリ: 洗面所の鏡の上にある銀色で光るやつ
- 正解ASIN: B00LEVNMS6
- 順位: 圏外/無回答
- 上位候補: なし
