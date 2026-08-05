import { searchProductsAcrossTenantsWithDecision } from './product-index-v2.mjs';
import { inferCandidateCategory, requestedColorPatterns, semanticSearchGroups } from './search-intelligence.mjs';
import { scoreApparelAttributeMatch } from './apparel-query-attributes.mjs';
import { lookupTeacherDatasetEntry } from './search-quality/teacher-dataset-lookup.mjs';

const COPY = {
  JA: {
    category: '上位候補が別カテゴリに分かれています。どちらの用途に近いですか？',
    use: 'それは何に使うものですか？',
    detail: '色・大きさ・素材のうち、もう一つ覚えている特徴はありますか？',
    wish: '今は特定できないため、ほしっとくへ保存して後日もう一度照合できます。'
  },
  EN: {
    category: 'The leading matches split into different categories. Which use is closer?',
    use: 'What would you use it for?',
    detail: 'Do you remember one more detail: color, size, or material?',
    wish: 'There is not enough information yet. Save it to MYWISH and HOSHILU can match it again later.'
  },
  ZH: {
    category: '候选结果分属不同类别。哪一种用途更接近？',
    use: '它主要用来做什么？',
    detail: '颜色、大小或材质中，还记得哪一项？',
    wish: '目前信息不足。可以保存到 MYWISH，之后再次匹配。'
  },
  KO: {
    category: '상위 후보가 서로 다른 카테고리입니다. 어느 용도에 더 가깝나요?',
    use: '어디에 사용하는 물건인가요?',
    detail: '색상, 크기, 소재 중 하나를 더 기억하시나요?',
    wish: '아직 특정하기 어렵습니다. MYWISH에 저장해 나중에 다시 매칭할 수 있습니다.'
  }
};

const CATEGORY_LABELS = {
  JA: { 'kitchen-use':'キッチン・食卓', 'beauty-use':'美容・ケア', 'electronics-use':'家電・デジタル', 'home-use':'収納・掃除', 'vehicle-tool-use':'車・工具', 'hobby-use':'遊び・趣味', 'screwdriver':'工具・ドライバー', 'building-block':'ブロック玩具', candle:'キャンドル', earphones:'イヤホン', backpack:'バッグ', watch:'腕時計', gloves:'手袋', charger:'充電器', 'phone-case':'スマホケース', 'light-up':'光る・LED', camera:'カメラ', keyboard:'キーボード', mouse:'マウス', bottle:'ボトル・水筒', lamp:'照明', shampoo:'ヘアケア', figure:'フィギュア', organizer:'収納用品', humidifier:'加湿器', umbrella:'傘', fan:'扇風機', toner:'化粧水・トナー', serum:'美容液・セラム', moisturizer:'保湿・乳液', sunscreen:'日焼け止め', 'face-mask':'フェイスパック', cleanser:'クレンジング・洗顔', 'cushion-foundation':'クッションファンデ', foundation:'ファンデーション', 'eye-shadow':'アイシャドウ', blush:'チーク', mascara:'マスカラ', eyeliner:'アイライナー', 'nail-care':'ネイル', 'hair-treatment':'ヘアケア', jelly:'お菓子・ゼリー', massager:'マッサージ用品', softener:'柔軟剤', radio:'ラジオ', socks:'靴下', shoes:'靴', laptop:'ノートパソコン', 'mouse-pad':'マウスパッド', 'rodent-supplies':'小動物用品', 'bicycle-chain':'自転車チェーン', 'umbrella-stand':'傘立て', 'lip-care':'リップケア', 'lip-color':'リップ・コスメ', 'camera-bag':'カメラバッグ', 'fan-accessory':'扇風機用品', 't-shirt':'Tシャツ', tops:'トップス', pants:'パンツ', skirt:'スカート', dress:'ワンピース・ドレス', bag:'バッグ', hat:'帽子' },
  EN: { 'kitchen-use':'kitchen or dining', 'beauty-use':'beauty or personal care', 'electronics-use':'electronics', 'home-use':'storage or cleaning', 'vehicle-tool-use':'car or tools', 'hobby-use':'toys or hobbies', 'screwdriver':'tools', 'building-block':'building toys', candle:'candles', earphones:'earphones', backpack:'bags', watch:'watches', gloves:'gloves', charger:'chargers', camera:'cameras', bottle:'bottles', lamp:'lighting', figure:'collectibles', organizer:'storage', humidifier:'humidifiers', umbrella:'umbrellas', fan:'fans', toner:'toners', serum:'serums', moisturizer:'moisturizers', sunscreen:'sunscreen', 'face-mask':'face masks', cleanser:'cleansers', 'cushion-foundation':'cushion foundation', foundation:'foundation', 'eye-shadow':'eye shadow', blush:'blush', mascara:'mascara', eyeliner:'eyeliner', 'nail-care':'nail care', 'hair-treatment':'hair care', jelly:'snacks', massager:'massagers', softener:'laundry care', radio:'radios', socks:'socks', shoes:'shoes', laptop:'laptops', 'mouse-pad':'mouse pads', 'rodent-supplies':'small-pet supplies', 'bicycle-chain':'bicycle chains', 'umbrella-stand':'umbrella stands', 'lip-care':'lip care', 'lip-color':'lip makeup', 'camera-bag':'camera bags', 'fan-accessory':'fan accessories', 't-shirt':'T-shirts', tops:'tops', pants:'pants', skirt:'skirts', dress:'dresses', bag:'bags', hat:'hats' },
  ZH: { 'kitchen-use':'厨房或餐桌', 'beauty-use':'美容或个人护理', 'electronics-use':'家电或数码', 'home-use':'收纳或清洁', 'vehicle-tool-use':'汽车或工具', 'hobby-use':'玩具或兴趣', 'screwdriver':'工具', 'building-block':'积木玩具', candle:'香薰蜡烛', earphones:'耳机', backpack:'包袋', watch:'手表', gloves:'手套', charger:'充电器', camera:'相机', bottle:'水杯', lamp:'照明', figure:'收藏玩具', organizer:'收纳用品', humidifier:'加湿器', umbrella:'雨伞', fan:'风扇', toner:'爽肤水', serum:'精华', moisturizer:'保湿乳霜', sunscreen:'防晒', 'face-mask':'面膜', cleanser:'洁面卸妆', 'cushion-foundation':'气垫粉底', foundation:'粉底', 'eye-shadow':'眼影', blush:'腮红', mascara:'睫毛膏', eyeliner:'眼线', 'nail-care':'美甲', 'hair-treatment':'护发', jelly:'零食', massager:'按摩用品', softener:'洗衣护理', radio:'收音机', socks:'袜子', shoes:'鞋', laptop:'笔记本电脑', 'mouse-pad':'鼠标垫', 'rodent-supplies':'小动物用品', 'bicycle-chain':'自行车链条', 'umbrella-stand':'雨伞架', 'lip-care':'唇部护理', 'lip-color':'唇妆', 'camera-bag':'相机包', 'fan-accessory':'风扇配件', 't-shirt':'T恤', tops:'上装', pants:'裤子', skirt:'裙子', dress:'连衣裙', bag:'包袋', hat:'帽子' },
  KO: { 'kitchen-use':'주방·식탁', 'beauty-use':'뷰티·개인 관리', 'electronics-use':'가전·디지털', 'home-use':'수납·청소', 'vehicle-tool-use':'자동차·공구', 'hobby-use':'놀이·취미', 'screwdriver':'공구', 'building-block':'블록 완구', candle:'캔들', earphones:'이어폰', backpack:'가방', watch:'시계', gloves:'장갑', charger:'충전기', camera:'카메라', bottle:'물병', lamp:'조명', figure:'수집 완구', organizer:'수납용품', humidifier:'가습기', umbrella:'우산', fan:'선풍기', toner:'토너', serum:'세럼·앰플', moisturizer:'수분크림·로션', sunscreen:'선크림', 'face-mask':'마스크팩', cleanser:'클렌징·세안', 'cushion-foundation':'쿠션 파운데이션', foundation:'파운데이션', 'eye-shadow':'아이섀도', blush:'블러셔', mascara:'마스카라', eyeliner:'아이라이너', 'nail-care':'네일', 'hair-treatment':'헤어 케어', jelly:'간식', massager:'마사지용품', softener:'세탁용품', radio:'라디오', socks:'양말', shoes:'신발', laptop:'노트북', 'mouse-pad':'마우스패드', 'rodent-supplies':'소동물 용품', 'bicycle-chain':'자전거 체인', 'umbrella-stand':'우산꽂이', 'lip-care':'립 케어', 'lip-color':'립 메이크업', 'camera-bag':'카메라 가방', 'fan-accessory':'선풍기 용품', 't-shirt':'티셔츠', tops:'상의', pants:'바지', skirt:'스커트', dress:'원피스·드레스', bag:'가방', hat:'모자' }
};

const OPTION_SETS = {
  JA: { use: ['キッチン・食卓で使う','美容・身だしなみに使う','家電・デジタル用品','収納・掃除に使う','車・工具に使う','遊び・趣味に使う','ファッション・持ち物','仕事・勉強で使う','旅行・アウトドアで使う','ペットに使う'], detail: ['手のひらサイズ','大きめ・据え置き','柔らかい・シリコン系','硬い・金属系','透明・半透明','USB・電池で動く'] },
  EN: { use: ['kitchen or dining','beauty or personal care','electronics','storage or cleaning','car or tools','toys or hobbies','fashion or accessories','work or study','travel or outdoors','for pets'], detail: ['palm-sized','large or freestanding','soft or silicone-like','hard or metallic','clear or translucent','USB or battery powered'] },
  ZH: { use: ['厨房或餐桌用品','美容或个人护理','家电或数码用品','收纳或清洁用品','汽车或工具','玩具或兴趣用品','时尚或随身用品','工作或学习用品','旅行或户外用品','宠物用品'], detail: ['手掌大小','较大或固定摆放','柔软或硅胶材质','坚硬或金属材质','透明或半透明','USB或电池供电'] },
  KO: { use: ['주방·식탁용','뷰티·개인 관리용','가전·디지털용품','수납·청소용품','자동차·공구용','놀이·취미용','패션·소지품','업무·학습용','여행·아웃도어용','반려동물용'], detail: ['손바닥 크기','크거나 고정형','부드럽거나 실리콘 재질','단단하거나 금속 재질','투명하거나 반투명','USB 또는 배터리 작동'] }
};

const CONTEXTUAL_USE_OPTIONS_JA = {
  snack: ['そのまま食べるお菓子','甘いお菓子','塩味のお菓子','素材を生かしたお菓子','個包装','大袋・シェア用','持ち歩き用','ギフト用','海外のお菓子','アレルギーに配慮'],
  photoPrinter: ['スマホ写真を印刷する','推し活カードを作る','チェキ風写真を作る','シール写真を作る','手帳・アルバムに貼る','イベントで配る','旅行写真をその場で印刷する','プレゼントを作る','名札・ラベルを作る','持ち歩いて使う'],
  camera: ['写真を撮る','動画を撮る','旅行で使う','Vlog・SNS投稿に使う','子どもが遊ぶ','推し活で使う','チェキ風に楽しむ','防犯・見守りに使う','車や自転車で撮影する','水中・アウトドアで使う'],
  figure: ['飾って楽しむ','コレクションする','子どもが遊ぶ','プレゼントにする','推し活で使う','撮影小物にする','ゲーム・アニメ関連','映画・アメコミ関連','組み立てて遊ぶ','限定品を探している'],
  electronics: ['スマホと一緒に使う','音楽を聴く','写真・動画に使う','充電する','仕事・勉強で使う','ゲームで使う','家で使う','旅行で使う','車で使う','持ち歩いて使う'],
  beauty: ['顔に使う','髪に使う','ネイルに使う','香りを楽しむ','入浴時に使う','持ち歩いて使う','プレゼントにする','肌を整える','メイクに使う','マッサージに使う'],
  vehicle: ['車内で使う','車体に取り付ける','修理・整備に使う','洗車に使う','収納に使う','充電・電源に使う','安全確認に使う','バイクで使う','自転車で使う','部品を交換する'],
  kitchen: ['料理に使う','飲み物を作る','保存・収納に使う','お菓子作りに使う','食卓で使う','洗う・掃除する','持ち運ぶ','温める・冷やす','切る・混ぜる','見た目を楽しむ'],
  fashion: ['身につける','バッグに入れて持つ','推し活で使う','プレゼントにする','雨・日差し対策','旅行で使う','仕事・学校で使う','スポーツで使う','防寒に使う','コーデのアクセントにする'],
  general: ['家で使う','仕事・勉強で使う','旅行で使う','車・自転車で使う','美容・身だしなみに使う','料理・食事に使う','遊び・趣味に使う','収納・掃除に使う','ペットに使う','プレゼントにする']
};

const CONTEXTUAL_DETAIL_OPTIONS_JA = {
  snack: ['チップス','スナック菓子','さつまいも・野菜系','オーガニック','無添加','低糖質','グルテンフリー','小袋・個包装','大袋','食べ比べセット'],
  photoPrinter: ['スマホ対応','Bluetooth対応','手のひらサイズ','充電式','シール紙対応','チェキ風サイズ','カラー印刷','モノクロ印刷','インク不要','専用アプリ対応'],
  phoneCase: ['LEDで光るケース','通知で光るケース','背面が光るケース','蓄光タイプ','透明ケース','iPhone用','Android用','充電式','電源不要','ストラップ付き'],
  earphones: ['完全ワイヤレス','耳をふさがない','カナル型','インナーイヤー型','ノイズキャンセリング','マイク付き','Bluetooth対応','有線タイプ','防水・スポーツ用','透明・クリア'],
  charger: ['MagSafe対応','置くだけ充電','USB-C対応','急速充電','複数台同時充電','モバイルバッテリー型','車載用','折りたたみ式','ケーブル一体型','海外対応'],
  lamp: ['卓上ライト','間接照明','充電式','USB式','電池式','色が変わる','人感センサー付き','クリップ式','持ち運び用','防水・屋外用'],
  backpack: ['小さめ','大容量','PC収納付き','防水','軽量','肩掛けにもなる','キャリーオン対応','ポケットが多い','透明・クリア','推し活向け'],
  socks: ['くるぶし丈','クルー丈','ハイソックス','スポーツ用','防寒・厚手','吸湿速乾','コットン素材','着圧タイプ','滑り止め付き','セット商品'],
  shoes: ['光る靴','スニーカー','厚底','防水','軽量','スリッポン','スポーツ用','子ども用','幅広','折りたたみ'],
  laptop: ['13インチ前後','14インチ前後','15インチ以上','軽量・持ち歩き','学生・レポート用','仕事用','動画編集用','ゲーム用','Windows','Chromebook'],
  'mouse-pad': ['大型デスクマット','ゲーミング用','手首クッション付き','滑りにくい','薄型','布製','ハードタイプ','防水','ワイヤレス充電付き','かわいいデザイン'],
  'rodent-supplies': ['飼育ケージ','回し車','床材','給水器','餌入れ','隠れ家','持ち運び用','掃除しやすい','脱走防止','セット商品'],
  'bicycle-chain': ['自転車用','ロードバイク用','マウンテンバイク用','変速段数対応','防錆','軽量','交換用','チェーンロック','工具付き','メンテナンス用品'],
  'umbrella-stand': ['スリム','玄関用','マグネット式','珪藻土付き','折りたたみ傘対応','大容量','屋外用','倒れにくい','水受け付き','省スペース'],
  'lip-care': ['無色','色付き','高保湿','UVカット','敏感肌向け','無香料','香り付き','ティントタイプ','夜用','セット商品'],
  'camera-bag': ['ミラーレス用','一眼レフ用','コンパクトカメラ用','ショルダー型','リュック型','防水','仕切り付き','軽量','レンズ収納付き','かわいいデザイン'],
  'fan-accessory': ['安全カバー','ほこり防止カバー','交換フィルター','収納カバー','子ども・ペット対策','洗える','卓上扇風機用','リビング扇風機用','羽根なし用','交換部品'],
  't-shirt': ['半袖','長袖','オーバーサイズ','クロップド丈','韓国ストリート','ロゴ・グラフィック','無地','速乾素材','ユニセックス','セット商品'],
  tops: ['ブラウス','シャツ','ニット','カーディガン','クロップド丈','オーバーサイズ','きれいめ','韓国ストリート','オフィス用','セット商品'],
  pants: ['デニム','ワイドパンツ','カーゴパンツ','スラックス','ショート丈','ハイウエスト','ストレッチ','韓国ストリート','低身長向け','セット商品'],
  skirt: ['ミニ丈','ロング丈','プリーツ','タイト','フレア','デニム','ハイウエスト','韓国ストリート','インナーパンツ付き','セット商品'],
  dress: ['ミニ丈','ロング丈','カジュアル','きれいめ','韓国ストリート','パーティー用','半袖','長袖','体型カバー','セット商品'],
  bag: ['ミニバッグ','トートバッグ','ショルダーバッグ','リュック','通学用','推し活用','韓国ストリート','軽量','防水','収納が多い'],
  hat: ['キャップ','バケットハット','ニット帽','日よけ','韓国ストリート','サイズ調整可能','UVカット','折りたたみ','ユニセックス','子ども用'],
  watch: ['スマートウォッチ','アナログ時計','デジタル時計','革ベルト','金属ベルト','防水','小さめ文字盤','大きめ文字盤','充電式','電池式'],
  bottle: ['保温・保冷','ストロー付き','折りたたみ','軽量','漏れにくい','洗いやすい','大容量','小さめ','透明','持ち手付き'],
  organizer: ['引き出し式','壁掛け','折りたたみ','透明','仕切り付き','回転式','マグネット式','吊り下げ式','持ち運び用','省スペース'],
  umbrella: ['折りたたみ','自動開閉','軽量','晴雨兼用','完全遮光','逆さ傘','強風対応','透明','子ども用','バッグに入る'],
  fan: ['首掛け','手持ち','卓上','クリップ式','羽根なし','静音','充電式','USB式','小型・軽量','ミスト付き'],
  humidifier: ['卓上','持ち運び','USB式','充電式','加熱式','超音波式','アロマ対応','ライト付き','掃除しやすい','大容量'],
  furniture: ['省スペース','折りたたみ','高さ調整できる','キャスター付き','収納付き','組み立て不要','木製','金属製','一人暮らし向け','子ども向け'],
  bedding: ['洗濯機で洗える','ひんやり素材','あたたかい素材','低反発','高反発','抗菌・防臭','軽量','コンパクト収納','シングルサイズ','肌触りが柔らかい'],
  stationery: ['持ち歩き用','仕事用','勉強用','手帳に使う','細字','太字','消せる','防水','セット商品','かわいいデザイン'],
  cooking: ['電子レンジ対応','食洗機対応','直火対応','IH対応','電源不要','コンパクト','一人分サイズ','大容量','洗いやすい','収納しやすい'],
  cleaning: ['コードレス','充電式','電源不要','水洗いできる','使い捨て','繰り返し使える','狭い場所用','床・カーペット用','浴室用','持ち運び用'],
  pet: ['犬用','猫用','小動物用','自動式','水洗いできる','倒れにくい','持ち運び用','留守番用','サイズ調整できる','静音'],
  baby: ['新生児向け','外出用','洗える','軽量','折りたたみ','安全ロック付き','肌にやさしい','成長に合わせて使える','収納しやすい','プレゼント向け'],
  outdoor: ['防水','軽量','折りたたみ','コンパクト収納','充電式','電源不要','耐熱','防寒','一人用','家族用'],
  camera: ['トイカメラ','キッズカメラ','ミニデジタルカメラ','インスタントカメラ','アクションカメラ','プリンター付きカメラ','画面付き','手のひらサイズ','ピンク色','ストラップ付き'],
  figure: ['アクションフィギュア','可動式','ミニフィギュア','大型フィギュア','限定版','映画キャラクター','アニメキャラクター','ゲームキャラクター','台座付き','セット商品'],
  electronics: ['USB充電','電池式','スマホ対応','Bluetooth対応','小型・軽量','画面付き','ワイヤレス','日本で使える','持ち運び用','防水'],
  toner: ['敏感肌向け','乾燥肌向け','脂性肌向け','鎮静・CICA','毛穴ケア','拭き取りタイプ','保湿重視','無香料','大容量','韓国ブランド'],
  serum: ['ビタミンC','レチノール','ナイアシンアミド','ヒアルロン酸','CICA・鎮静','毛穴ケア','美白ケア','敏感肌向け','アンプルタイプ','韓国ブランド'],
  moisturizer: ['ジェルタイプ','クリームタイプ','乳液タイプ','高保湿','べたつきにくい','敏感肌向け','CICA・鎮静','セラミド配合','朝用','夜用'],
  sunscreen: ['SPF50+','PA++++','トーンアップ','ノンケミカル','敏感肌向け','スティックタイプ','ジェルタイプ','べたつきにくい','ウォータープルーフ','化粧下地兼用'],
  'face-mask': ['保湿','CICA・鎮静','毛穴ケア','美白ケア','ニキビ肌向け','敏感肌向け','個包装','大容量ボックス','部分用パック','韓国ブランド'],
  cleanser: ['クレンジングオイル','クレンジングバーム','クレンジングウォーター','洗顔フォーム','弱酸性','敏感肌向け','毛穴ケア','ダブル洗顔不要','ポイントメイク用','韓国ブランド'],
  'cushion-foundation': ['ツヤ肌','セミマット','マット','高カバー','薄づき','崩れにくい','乾燥肌向け','脂性肌向け','明るめカラー','リフィル付き'],
  foundation: ['リキッド','パウダー','クリーム','ツヤ肌','マット','高カバー','薄づき','崩れにくい','明るめカラー','標準カラー'],
  'eye-shadow': ['パレット','単色','ラメ','マット','ピンク系','ブラウン系','コーラル系','ブルベ向け','イエベ向け','韓国ブランド'],
  blush: ['パウダー','クリーム','リキッド','ピンク系','コーラル系','ローズ系','ツヤ仕上げ','マット仕上げ','ブルベ向け','イエベ向け'],
  mascara: ['ロング','ボリューム','カールキープ','ウォータープルーフ','お湯で落ちる','ブラウン','ブラック','透明','下まつげ用','韓国ブランド'],
  eyeliner: ['リキッド','ペンシル','ジェル','ウォータープルーフ','お湯で落ちる','ブラック','ブラウン','極細','涙袋用','韓国ブランド'],
  'nail-care': ['ジェルネイル','ネイルポリッシュ','ネイルシール','チップ','速乾','剥がせる','マグネットネイル','韓国デザイン','セット商品','初心者向け'],
  'hair-treatment': ['洗い流すタイプ','洗い流さないタイプ','ヘアオイル','ヘアミルク','ダメージケア','カラーケア','くせ毛向け','頭皮ケア','香り重視','韓国ブランド'],
  beauty: ['持ち運びサイズ','敏感肌向け','香り付き','無香料','韓国ブランド','セット商品','プレゼント向け','トラベルサイズ','低刺激','口コミ人気'],
  vehicle: ['車種専用','汎用品','取り付け式','USB電源','電池式','小型','防水','工具不要','交換部品','収納用品'],
  kitchen: ['電源不要','USB電源','コンセント式','手のひらサイズ','卓上サイズ','透明','シリコン製','金属製','食洗機対応','持ち運び用'],
  fashion: ['小さめ','大きめ','ピンク色','透明','黒色','ストラップ付き','折りたたみ','防水','軽量','セット商品'],
  general: ['手のひらサイズ','バッグに入る','卓上サイズ','USB充電','電池式','電源不要','ピンク色','透明・半透明','柔らかい素材','硬い・金属素材']
};

const CONTEXTUAL_DETAIL_OPTIONS_I18N = {
  EN: {
    phoneCase: ['LED light-up case','lights for notifications','glowing back','glow-in-the-dark','clear case','for iPhone','for Android','rechargeable','no power needed','with strap'],
    earphones: ['true wireless','open-ear','in-ear canal type','earbud type','noise cancelling','with microphone','Bluetooth','wired','waterproof for sports','clear or transparent'],
    charger: ['MagSafe compatible','wireless charging pad','USB-C','fast charging','charges multiple devices','power bank','for cars','foldable','built-in cable','international voltage'],
    lamp: ['table lamp','ambient light','rechargeable','USB powered','battery powered','color changing','motion sensor','clip-on','portable','waterproof outdoor'],
    bottle: ['insulated hot and cold','with straw','foldable','lightweight','leak resistant','easy to clean','large capacity','compact','clear','with handle'],
    umbrella: ['folding','automatic open and close','lightweight','rain and sun','full UV protection','reverse folding','wind resistant','clear','for children','fits in a bag'],
    fan: ['neck fan','handheld','tabletop','clip-on','bladeless','quiet','rechargeable','USB powered','small and lightweight','with mist'],
    pet: ['for dogs','for cats','for small pets','automatic','washable','tip-resistant','portable','for home alone','adjustable size','quiet operation'],
    general: ['palm-sized','fits in a bag','tabletop size','USB rechargeable','battery powered','no power needed','pink','clear or translucent','soft material','hard or metal material']
  },
  ZH: {
    phoneCase: ['LED发光手机壳','通知时发光','背面发光','夜光款','透明手机壳','iPhone用','Android用','充电式','无需供电','带挂绳'],
    earphones: ['真无线','开放式不堵耳','入耳式','半入耳式','主动降噪','带麦克风','蓝牙连接','有线','运动防水','透明款'],
    charger: ['支持MagSafe','无线充电板','USB-C','快速充电','多设备同时充电','充电宝','车载','可折叠','自带线','支持海外电压'],
    lamp: ['桌面灯','氛围灯','充电式','USB供电','电池供电','可变色','人体感应','夹式','便携式','户外防水'],
    bottle: ['保温保冷','带吸管','可折叠','轻量','防漏','易清洗','大容量','小巧','透明','带提手'],
    umbrella: ['折叠式','自动开合','轻量','晴雨两用','完全遮光','反向伞','抗强风','透明','儿童用','可放进包里'],
    fan: ['挂脖式','手持式','桌面式','夹式','无叶','静音','充电式','USB供电','小巧轻量','带喷雾'],
    pet: ['狗用','猫用','小动物用','自动式','可水洗','不易打翻','便携式','独自在家用','尺寸可调','静音'],
    general: ['手掌大小','可放进包里','桌面大小','USB充电','电池供电','无需供电','粉色','透明或半透明','柔软材质','坚硬或金属材质']
  },
  KO: {
    phoneCase: ['LED 발광 케이스','알림 시 발광','뒷면 발광','야광 타입','투명 케이스','iPhone용','Android용','충전식','전원 불필요','스트랩 포함'],
    earphones: ['완전 무선','오픈형','커널형','이어버드형','노이즈 캔슬링','마이크 포함','Bluetooth','유선','스포츠 방수','투명 타입'],
    charger: ['MagSafe 호환','무선 충전 패드','USB-C','고속 충전','여러 기기 동시 충전','보조 배터리','차량용','접이식','케이블 일체형','해외 전압 지원'],
    lamp: ['탁상 조명','무드 조명','충전식','USB 전원','배터리식','색상 변경','동작 감지','클립형','휴대용','야외 방수'],
    bottle: ['보온·보냉','빨대 포함','접이식','경량','누수 방지','세척이 쉬움','대용량','소형','투명','손잡이 포함'],
    umbrella: ['접이식','자동 개폐','경량','우산·양산 겸용','완전 차광','거꾸로 접는 우산','강풍 대응','투명','어린이용','가방에 들어감'],
    fan: ['목걸이형','휴대용','탁상형','클립형','날개 없음','저소음','충전식','USB 전원','소형·경량','미스트 포함'],
    pet: ['강아지용','고양이용','소동물용','자동식','물세척 가능','잘 넘어지지 않음','휴대용','혼자 있을 때 사용','크기 조절','저소음'],
    general: ['손바닥 크기','가방에 들어감','탁상 크기','USB 충전','배터리식','전원 불필요','분홍색','투명 또는 반투명','부드러운 소재','단단하거나 금속 소재']
  }
};

const SEMANTIC_THEME = {
  'phone-case':'phoneCase', earphones:'earphones', charger:'charger', lamp:'lamp',
  backpack:'backpack', socks:'socks', shoes:'shoes', laptop:'laptop', 'mouse-pad':'mouse-pad',
  'rodent-supplies':'rodent-supplies', 'bicycle-chain':'bicycle-chain', 'umbrella-stand':'umbrella-stand',
  'lip-care':'lip-care', toner:'toner', serum:'serum', moisturizer:'moisturizer', sunscreen:'sunscreen',
  'face-mask':'face-mask', cleanser:'cleanser', 'cushion-foundation':'cushion-foundation', foundation:'foundation',
  'eye-shadow':'eye-shadow', blush:'blush', mascara:'mascara', eyeliner:'eyeliner', 'nail-care':'nail-care',
  'hair-treatment':'hair-treatment', 'camera-bag':'camera-bag', 'fan-accessory':'fan-accessory',
  't-shirt':'t-shirt', tops:'tops', pants:'pants', skirt:'skirt', dress:'dress', bag:'bag', hat:'hat',
  watch:'watch', bottle:'bottle', organizer:'organizer', umbrella:'umbrella', fan:'fan', humidifier:'humidifier',
  camera:'camera', 'photo-printer':'photoPrinter', figure:'figure'
};

function queryTheme(query) {
  const value = String(query || '').normalize('NFKC').toLowerCase();
  if (/(?:チップス|スナック菓子|ポテトチップ|さつまいも.{0,6}(?:菓子|チップ)|お菓子|駄菓子|snacks?|chips|薯片|零食|감자칩|과자)/u.test(value)) return 'snack';
  const semanticTheme = semanticSearchGroups(value)
    .map((group) => SEMANTIC_THEME[group.category])
    .find(Boolean);
  if (semanticTheme) return semanticTheme;
  if (/(?:手机壳|手機殼|휴대폰 케이스|스마트폰 케이스)/u.test(value)) return 'phoneCase';
  if (/(?:耳机|耳機|이어폰|헤드폰)/u.test(value)) return 'earphones';
  if (/(?:charger|power bank|充电器|充電器|充电宝|充電寶|충전기|보조 배터리)/u.test(value)) return 'charger';
  if (/(?:灯|燈|照明|조명|램프)/u.test(value)) return 'lamp';
  if (/(?:bottle|tumbler|水杯|水瓶|保温杯|保溫杯|물병|텀블러)/u.test(value)) return 'bottle';
  if (/(?:umbrella|parasol|雨伞|雨傘|折叠伞|折疊傘|우산|양산)/u.test(value)) return 'umbrella';
  if (/(?:fan|风扇|風扇|선풍기|휴대용 팬)/u.test(value)) return 'fan';
  if (/(?:狗|猫|貓|宠物|寵物|강아지|고양이|반려동물)/u.test(value)) return 'pet';
  return /スマホケース|携帯ケース|phone case|smartphone case|iphone case/.test(value) ? 'phoneCase'
    : /写真プリンター|フォトプリンター|スマホプリンター|photo printer|portable printer/.test(value) ? 'photoPrinter'
    : /カメラ|camera|撮影|写真|動画/.test(value) ? 'camera'
    : /フィギュア|figure|人形|キャラクター|アニメ/.test(value) ? 'figure'
    : /イヤホン|スマホ|充電|電池|usb|電気|デジタル|ガジェット/.test(value) ? 'electronics'
    : /コスメ|美容|メイク|化粧|ネイル|肌|髪/.test(value) ? 'beauty'
    : /車|自動車|バイク|自転車|パーツ|部品/.test(value) ? 'vehicle'
    : /料理|キッチン|食卓|飲み物|調理/.test(value) ? 'kitchen'
    : /机|デスク|椅子|チェア|棚|ラック|テーブル|ソファ|家具/.test(value) ? 'furniture'
    : /枕|まくら|布団|毛布|マットレス|寝具|ベッド/.test(value) ? 'bedding'
    : /ペン|ノート|手帳|付箋|文房具|筆箱|消しゴム/.test(value) ? 'stationery'
    : /鍋|フライパン|包丁|まな板|調理器具|弁当箱/.test(value) ? 'cooking'
    : /掃除|ほこり|モップ|ブラシ|クリーナー|洗濯/.test(value) ? 'cleaning'
    : /犬|猫|ペット|散歩|首輪|リード/.test(value) ? 'pet'
    : /赤ちゃん|ベビー|乳児|離乳食|おむつ|ベビーカー/.test(value) ? 'baby'
    : /キャンプ|登山|アウトドア|テント|釣り|旅行/.test(value) ? 'outdoor'
    : /服|バッグ|靴|アクセサリー|ファッション/.test(value) ? 'fashion'
    : 'general';
}

function contextualUseOptions(query, language) {
  if (language !== 'JA') return null;
  const theme = queryTheme(query);
  return CONTEXTUAL_USE_OPTIONS_JA[theme];
}

function contextualDetailOptions(query, language) {
  const theme = queryTheme(query);
  const value = String(query || '').normalize('NFKC').toLowerCase();
  const localized = language === 'JA'
    ? CONTEXTUAL_DETAIL_OPTIONS_JA
    : CONTEXTUAL_DETAIL_OPTIONS_I18N[language];
  if (!localized) return null;
  const candidates = localized[theme] || localized.general;
  const unused = candidates.filter((option) => !value.includes(option.normalize('NFKC').toLowerCase()));
  return [...unused, ...candidates.filter((option) => !unused.includes(option))].slice(0, 10);
}

const DETAIL_FIRST_THEMES = new Set(['snack','phoneCase','earphones','charger','lamp','backpack','socks','shoes','laptop','mouse-pad','rodent-supplies','bicycle-chain','umbrella-stand','lip-care','toner','serum','moisturizer','sunscreen','face-mask','cleanser','cushion-foundation','foundation','eye-shadow','blush','mascara','eyeliner','nail-care','hair-treatment','camera-bag','fan-accessory','t-shirt','tops','pants','skirt','dress','bag','hat','watch','bottle','organizer','umbrella','fan','humidifier','furniture','bedding','stationery','cooking','cleaning','pet','baby','outdoor']);

function contextualQuestion(query, language, fallback) {
  if (language !== 'JA') return fallback;
  const theme = queryTheme(query);
  const rounds = String(query || '').split(' / ').length - 1;
  if (theme === 'phoneCase' && rounds === 0) return '対応機種や、近い光り方・特徴を選んでください。';
  if (rounds === 0 && DETAIL_FIRST_THEMES.has(theme)) return '近い種類・特徴を選んでください。';
  if (rounds === 0) return fallback;
  const subject = { phoneCase:'スマホケース', earphones:'イヤホン', charger:'充電器', lamp:'照明', backpack:'バッグ', socks:'靴下', shoes:'靴', laptop:'ノートパソコン', 'mouse-pad':'マウスパッド', 'rodent-supplies':'小動物用品', 'bicycle-chain':'自転車チェーン', 'umbrella-stand':'傘立て', 'lip-care':'リップケア', toner:'トナー', serum:'美容液', moisturizer:'保湿用品', sunscreen:'日焼け止め', 'face-mask':'フェイスパック', cleanser:'クレンジング', 'cushion-foundation':'クッションファンデ', foundation:'ファンデーション', 'eye-shadow':'アイシャドウ', blush:'チーク', mascara:'マスカラ', eyeliner:'アイライナー', 'nail-care':'ネイル', 'hair-treatment':'ヘアケア', 'camera-bag':'カメラバッグ', 'fan-accessory':'扇風機用品', 't-shirt':'Tシャツ', tops:'トップス', pants:'パンツ', skirt:'スカート', dress:'ワンピース', bag:'バッグ', hat:'帽子', watch:'時計', bottle:'ボトル', organizer:'収納用品', umbrella:'傘', fan:'扇風機', humidifier:'加湿器', furniture:'家具', bedding:'寝具', stationery:'文房具', cooking:'調理用品', cleaning:'掃除用品', pet:'ペット用品', baby:'ベビー用品', outdoor:'アウトドア用品', camera:'カメラ', figure:'フィギュア', electronics:'デジタル用品', beauty:'美容用品', vehicle:'車・自転車用品', kitchen:'キッチン用品', fashion:'ファッション用品', general:'商品' }[theme];
  return `次に近い${subject}の種類・特徴を選んでください。`;
}

function clarificationOptions(decision, language, query = '') {
  const labels = CATEGORY_LABELS[language] || CATEGORY_LABELS.JA;
  if (decision.reason === 'CATEGORY_DIVERGENCE') {
    return decision.candidate_categories.slice(0, 3).map((value) => ({ label: labels[value] || value, value: labels[value] || value }));
  }
  const set = OPTION_SETS[language] || OPTION_SETS.JA;
  const useOptions = contextualUseOptions(query, language) || set.use;
  const detailOptions = contextualDetailOptions(query, language) || set.detail;
  const hasAnswer = String(query || '').includes(' / ');
  const detailFirst = DETAIL_FIRST_THEMES.has(queryTheme(query));
  return (!detailFirst && !hasAnswer && (decision.reason === 'NO_CANDIDATES' || decision.candidate_categories.length === 0) ? useOptions : detailOptions)
    .map((value) => ({ label: value, value }));
}

export function suggestedKeywordOptions(query, language = 'JA') {
  const detail = contextualDetailOptions(query, language);
  const use = contextualUseOptions(query, language);
  const fallback = (OPTION_SETS[language] || OPTION_SETS.JA).detail;
  return [...new Set([...(detail || []), ...(use || []), ...fallback])]
    .filter(Boolean)
    .slice(0, 10);
}

function indexedCandidate(row, rank) {
  return {
    rank: rank + 1,
    asin: row.asin,
    // gas/MultilingualSeoEngine.gsのWorker移植(multilingual-seo.mjs)がD1索引
    // 候補へ承認済みの多言語display_name/descriptionを補うために使う内部専用
    // フィールド。GAS由来の候補には無い(既にGAS側で多言語化済みのため)。
    tenant: row.tenant,
    product_name: row.product_name,
    display_name: row.product_name,
    manufacturer: row.manufacturer,
    image: row.image_url,
    stock: row.stock,
    amazon_jp_url: row.amazon_jp_url,
    amazon_us_url: row.amazon_us_url,
    offers: Array.isArray(row.offers) ? row.offers : [],
    evidence: { matched_terms: [], information_score: 0 }
  };
}

function hasMerchantOffer(candidate) {
  return (Array.isArray(candidate?.offers) ? candidate.offers : []).some((offer) =>
    offer?.stock_status !== 'OUT_OF_STOCK' &&
    /^https:\/\//i.test(String(offer?.product_url || ''))
  );
}

const CATEGORY_MODIFIERS = new Set([
  'kitchen-use','beauty-use','electronics-use','home-use','vehicle-tool-use','hobby-use','light-up','color'
]);

function isPortableUmbrellaIntent(query) {
  return /(?:日傘|折りたたみ(?:傘)?|晴雨兼用|軽量|携帯(?:用)?(?:傘)?|compact umbrella|folding umbrella|lightweight umbrella)/iu
    .test(String(query || '').normalize('NFKC'));
}

function isPortableUmbrellaMismatch(candidate) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC')
    .toLowerCase();
  const hasUmbrellaProduct = /(?:umbrella|parasol|日傘|雨傘|折りたたみ傘|折畳傘|晴雨兼用傘)/u.test(text);
  const isLargeOrFixed = /(?:patio|market umbrella|beach umbrella|cantilever|offset umbrella|garden umbrella|outdoor table|replacement canopy|umbrella base|umbrella stand|umbrella holder|umbrella bag holder|golf umbrella|golf bag|drizzle sti(?:k|ck))/u
    .test(text);
  return !hasUmbrellaProduct || isLargeOrFixed;
}

function isTrueWirelessEarphonesIntent(query) {
  const text = String(query || '').normalize('NFKC');
  const explicitTrueWireless = /(?:完全ワイヤレス|フルワイヤレス|左右独立|左右分離|コードレス|コードなし|ケーブルなし|true\s*wireless|\btws\b|wire[- ]?free|真无线|真無線|完全无线|完全無線|완전\s*무선|코드\s*없는)/iu.test(text);
  const earphone = /(?:イヤホン|イヤーバッド|earbuds?|earphones?|耳机|耳機|이어폰)/iu;
  const wireless = /(?:ワイヤレス|wireless|bluetooth|蓝牙|藍牙|无线|無線|블루투스|무선)/iu;
  return explicitTrueWireless || (
    earphone.test(text) && wireless.test(text)
  );
}

function isTrueWirelessEarphonesMismatch(candidate) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC')
    .toLowerCase();
  const explicitlyWired = /(?:有線|コード付き|ケーブル付き|\bwired\b|3[.]5\s*mm|audio cable|lightning connector|usb-c connector|有线|有線|线控|線控|유선|케이블형)/u.test(text);
  const explicitlyWireless = /(?:完全ワイヤレス|フルワイヤレス|左右独立|左右分離|コードレス|コードなし|ケーブルなし|ワイヤレス|bluetooth|true\s*wireless|\btws\b|wire[- ]?free|真无线|真無線|无线|無線|蓝牙|藍牙|완전\s*무선|블루투스|무선)/u.test(text);
  return explicitlyWired || !explicitlyWireless;
}

function phoneCaseDeviceModel(value) {
  const text = String(value || '').normalize('NFKC')
    .replace(/(?:ギャラクシー|갤럭시)/giu, 'Galaxy')
    .replace(/(?:ピクセル|픽셀)/giu, 'Pixel')
    .replace(/(?:ウルトラ|울트라)/giu, 'Ultra')
    .replace(/(?:プロ|프로)/giu, 'Pro');
  const correctedTail = text.match(/(?:じゃなくて|じゃない|ではなく(?:て)?|いや(?:違う)?|訂正(?:すると)?|;\s*use\b|,\s*use\b|actually(?:\s+for)?|\bbut\b|(?:\bno[\s,]+)?\bi\s+mean\b|\bno(?:[\s,]+(?:sorry|wait))?\b|改成|改要|我要|换成|換成|改为|改為|不对|不對|我是说|我是說|말고|아니고|아니|정정(?:하면)?)[\s、，,:：]*([\s\S]+)$/iu)?.[1] || '';
  if (correctedTail && /\b(?:iphone|galaxy|pixel)\b/iu.test(correctedTail)) {
    return phoneCaseDeviceModel(correctedTail);
  }
  const correctedGalaxyModel = correctedTail.match(/\b([a-z][\s-]*\d{1,3}(?:\s*(?:ultra|plus|\+|fe))?)\b/iu)?.[1] || '';
  if (correctedGalaxyModel && /(?:\bgalaxy\b|ギャラクシー|三星|갤럭시)/iu.test(text)) {
    return `galaxy${correctedGalaxyModel.toLowerCase().replace(/[\s-]+/gu, '')}`;
  }
  const correctedIphoneModel = correctedTail.match(/^(\d{1,2}(?!\d)(?:\s*(?:pro|max|plus|mini)){0,2})\b/iu)?.[1] || '';
  if (correctedIphoneModel && /(?:\biphone\b|アイフォーン|アイフォン|苹果手机|蘋果手機|아이폰)/iu.test(text)) {
    return `iphone${correctedIphoneModel.toLowerCase().replace(/\s+/gu, '')}`;
  }
  const correctedPixelModel = correctedTail.match(/^(\d{1,2}(?!\d)(?:\s*(?:pro\s*(?:xl|fold)|pro|xl|fold|a))?)\b/iu)?.[1] || '';
  if (correctedPixelModel && /(?:\bpixel\b|ピクセル|픽셀)/iu.test(text)) {
    return `pixel${correctedPixelModel.toLowerCase().replace(/\s+/gu, '')}`;
  }
  const iphoneMatches = [...text.matchAll(/\biphone\s*(\d{1,2})(?!\d)(?:\s*(?:pro|max|plus|mini)){0,2}/giu)];
  let iphoneMatch = iphoneMatches[0] || null;
  for (let index = iphoneMatches.length - 1; index > 0; index -= 1) {
    const previous = iphoneMatches[index - 1];
    const current = iphoneMatches[index];
    const bridge = text.slice(previous.index + previous[0].length, current.index);
    if (/(?:やっぱり|訂正|ではなく|じゃなく|actually(?:\s+for)?|rather(?:\s+for)?|change(?:d)?\s+to|改成|换成|換成|改为|改為|아니|정정|말고)/iu.test(bridge)) {
      iphoneMatch = current;
      break;
    }
  }
  const match = iphoneMatch
    || text.match(/\bgalaxy\s*[a-z][\s-]*\d{1,3}(?:\s*(?:ultra|plus|\+|fe))?/iu)
    || text.match(/\bpixel\s*\d{1,2}(?!\d)(?:\s*(?:pro\s*(?:xl|fold)|pro|xl|fold|a))?/iu);
  return match ? match[0].toLowerCase().replace(/[\s-]+/gu, '') : '';
}

function smartWatchBandConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  const apple = /\bapple\s*watch\b/iu.test(text)
    ? [...text.matchAll(/\b(?:apple\s*watch\s*)?(ultra(?:\s*[12])?|series\s*\d{1,2}|se(?:\s*[23])?)\b/giu)]
      .filter((match) => {
        const before = text.slice(Math.max(0, match.index - 16), match.index);
        const after = text.slice(match.index + match[0].length, match.index + match[0].length + 14);
        return !/(?:not|no|不要|不是|不想要)\s*$/iu.test(before)
          && !/^\s*(?:ではなく|じゃなく|ではない|じゃない|not\s+(?:series|ultra|se)\b|but\s+(?:series|ultra|se)\b|不要|而不是|말고|아닌|아니고)/iu.test(after);
      }).at(-1) : null;
  const galaxy = /\bgalaxy\s*watch/iu.test(text)
    ? [...text.matchAll(/\b(?:galaxy\s*)?watch\s*(\d{1,2})(?:\s*(classic|pro))?/giu)]
      .filter((match) => {
        const before = text.slice(Math.max(0, match.index - 16), match.index);
        const after = text.slice(match.index + match[0].length, match.index + match[0].length + 14);
        return !/(?:not|no|不要|不是|不想要)\s*$/iu.test(before)
          && !/^\s*(?:ではなく|じゃなく|ではない|じゃない|not\s+(?:galaxy\s*)?watch\b|but\s+(?:galaxy\s*)?watch\b|不要|而不是|말고|아닌|아니고)/iu.test(after);
      }).at(-1) : null;
  const model = apple
    ? `applewatch${apple[1].toLowerCase().replace(/\s+/gu, '')}`
    : galaxy ? `galaxywatch${galaxy[1]}${galaxy[2] ? galaxy[2].toLowerCase() : ''}` : '';
  const size = [...text.matchAll(/\b(4[0-9])\s*mm\b/giu)].filter((match) => {
    const before = text.slice(Math.max(0, match.index - 12), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 10);
    return !/(?:not|no|不要|不是|不想要)\s*$/iu.test(before)
      && !/^\s*(?:ではなく|じゃなく|ではない|じゃない|but\b|而不是|말고|아닌|아니고)/iu.test(after);
  }).at(-1)?.[1] || '';
  const material = [
    ['titanium', /(?:チタン|titanium|钛(?:金属)?|鈦(?:金屬)?|티타늄)/giu],
    ['stainless', /(?:ステンレス|stainless(?:\s*steel)?|不锈钢|不鏽鋼|스테인리스)/giu],
    ['leather', /(?:レザー|本革|革|leather|皮革|真皮|가죽)/giu],
    ['silicone', /(?:シリコン|silicone|硅胶|矽膠|실리콘)/giu],
  ].flatMap(([label, pattern]) => [...text.matchAll(pattern)].map((match) => ({ label, match })))
    .sort((left, right) => left.match.index - right.match.index)
    .filter(({ match }) => {
      const before = text.slice(Math.max(0, match.index - 12), match.index);
      const after = text.slice(match.index + match[0].length, match.index + match[0].length + 10);
      return !/(?:not|no|不要|不是|不想要)\s*$/iu.test(before)
        && !/^\s*(?:ではなく|じゃなく|ではない|じゃない|but\b|而不是|말고|아닌|아니고)/iu.test(after);
    }).at(-1)?.label || '';
  const band = /(?:バンド|ベルト|交換ベルト|\b(?:band|strap)\b|表带|錶帶|腕带|腕帶|스트랩|밴드|시계줄)/iu.test(text);
  return { model, size, material, band };
}

function isSmartWatchBandMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = smartWatchBandConstraints(text);
  if (!evidence.band || !evidence.model) return true;
  if (requested.model && evidence.model !== requested.model) return true;
  if (requested.size && evidence.size !== requested.size) return true;
  if (requested.material && evidence.material !== requested.material) return true;
  return false;
}

function isNegatedPhoneAttribute(text, pattern) {
  const flags = [...new Set(`${pattern.flags}g`.split(''))].join('');
  for (const match of text.matchAll(new RegExp(pattern.source, flags))) {
    const before = text.slice(Math.max(0, match.index - 18), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 14);
    const negatedBefore = /(?:not\s+(?:a|an|the)?|no|without(?:\s+(?:a|an|the))?|不要|不是|不想要)\s*$/iu.test(before);
    const negatedAfter = /^\s*(?:以外|ではなく|じゃなく|ではない|じゃない|でない|なし|而不是|말고|아닌|아니고|제외)/iu.test(after);
    if (negatedBefore || negatedAfter) return true;
  }
  return false;
}

function phoneScreenProtectorConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  const privacyPattern = /(?:覗き見防止|のぞき見防止|privacy|anti[- ]?spy|防窥|防窺|사생활\s*보호|프라이버시)/iu;
  const glassPattern = /(?:強化ガラス|ガラスフィルム|tempered\s*glass|钢化玻璃|鋼化玻璃|강화유리)/iu;
  const glossyPattern = /(?:光沢|glossy|高光|亮面|유광)/iu;
  const antiGlarePattern = /(?:反射防止|アンチグレア|anti[- ]?glare|matte|防眩光|防眩|저반사|무광)/iu;
  const fingerprintPattern = /(?:指紋防止|耐指紋|anti[- ]?fingerprint|fingerprint[- ]?resistant|oleophobic|防指纹|防指紋|지문\s*방지)/iu;
  const privacy = privacyPattern.test(text);
  const glass = glassPattern.test(text);
  const glossy = glossyPattern.test(text);
  const antiGlare = antiGlarePattern.test(text);
  const fingerprint = fingerprintPattern.test(text);
  const rejectPrivacy = privacy && isNegatedPhoneAttribute(text, privacyPattern);
  const rejectGlass = glass && isNegatedPhoneAttribute(text, glassPattern);
  const rejectGlossy = glossy && isNegatedPhoneAttribute(text, glossyPattern);
  const rejectAntiGlare = antiGlare && isNegatedPhoneAttribute(text, antiGlarePattern);
  const rejectFingerprint = fingerprint && isNegatedPhoneAttribute(text, fingerprintPattern);
  return {
    model: phoneCaseDeviceModel(text),
    protector: /(?:保護フィルム|ガラスフィルム|保護膜|screen\s*protector|protective\s*film|钢化膜|鋼化膜|保护膜|保護膜|필름|보호필름)/iu.test(text),
    glass: glass && !rejectGlass,
    pet: /\bpet\b/iu.test(text),
    antiGlare: antiGlare && !rejectAntiGlare,
    blueLight: /(?:ブルーライト(?:カット|軽減)|blue[- ]?light\s*(?:filter(?:ing)?|blocking|reduction)|防蓝光|防藍光|블루라이트\s*(?:차단|필터))/iu.test(text),
    fingerprint: fingerprint && !rejectFingerprint,
    shatter: /(?:飛散防止|shatterproof|anti[- ]?shatter|防爆|방비산|비산\s*방지)/iu.test(text),
    glossy: glossy && !rejectGlossy,
    privacy: privacy && !rejectPrivacy,
    rejectPrivacy,
    rejectGlass,
    rejectGlossy,
    rejectAntiGlare,
    rejectFingerprint
  };
}

function isPhoneScreenProtectorMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = phoneScreenProtectorConstraints(text);
  if (!evidence.protector || !evidence.model) return true;
  if (requested.model && evidence.model !== requested.model) return true;
  if (requested.glass && !evidence.glass) return true;
  if (requested.pet && !evidence.pet) return true;
  if (requested.antiGlare && !evidence.antiGlare) return true;
  if (requested.blueLight && !evidence.blueLight) return true;
  if (requested.fingerprint && !evidence.fingerprint) return true;
  if (requested.shatter && !evidence.shatter) return true;
  if (requested.privacy && !evidence.privacy) return true;
  if (requested.rejectPrivacy && evidence.privacy) return true;
  if (requested.rejectGlass && evidence.glass) return true;
  if (requested.rejectGlossy && evidence.glossy) return true;
  if (requested.rejectAntiGlare && evidence.antiGlare) return true;
  if (requested.rejectFingerprint && evidence.fingerprint) return true;
  return false;
}

function cameraPrimeLensConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  const sony = /(?:sony|ソニー|索尼|소니)/iu.test(text);
  const canon = /(?:canon|キヤノン|キャノン|佳能|캐논)/iu.test(text);
  const mount = sony && /(?:\be\s*[- ]?mount\b|Eマウント|E卡口|E마운트)/iu.test(text) ? 'sony-e'
    : canon && /(?:\brf\s*[- ]?mount\b|RFマウント|RF卡口|RF마운트)/iu.test(text) ? 'canon-rf' : '';
  const focalLength = [...text.matchAll(/\b(\d{2,3})\s*mm\b/giu)].filter((match) => {
    const before = text.slice(Math.max(0, match.index - 12), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 10);
    return !/(?:not|no|不要|不是|不想要)\s*$/iu.test(before)
      && !/^\s*(?:ではなく|じゃなく|ではない|じゃない|but\b|而不是|말고|아닌|아니고)/iu.test(after);
  }).at(-1)?.[1] || '';
  const aperture = [...text.matchAll(/\bf\s*\/?\s*(\d(?:\.\d)?)\b/giu)].filter((match) => {
    const before = text.slice(Math.max(0, match.index - 12), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 10);
    return !/(?:not|no|不要|不是|不想要)\s*$/iu.test(before)
      && !/^\s*(?:ではなく|じゃなく|ではない|じゃない|but\b|而不是|말고|아닌|아니고)/iu.test(after);
  }).at(-1)?.[1] || '';
  const primeLens = /(?:単焦点(?:レンズ)?|prime\s+lens|定焦(?:镜头|鏡頭)|단렌즈|단초점\s*렌즈)/iu.test(text);
  const lens = primeLens || /(?:camera\s+lens|交換レンズ|镜头|鏡頭|렌즈)/iu.test(text);
  const accessory = /(?:adapter|アダプター|转接环|轉接環|어댑터|cap|キャップ|镜头盖|鏡頭蓋|렌즈캡|filter|フィルター|滤镜|濾鏡|필터)/iu.test(text);
  const zoom = /\b\d{2,3}\s*[-–〜~]\s*\d{2,3}\s*mm\b/iu.test(text) || /(?:zoom|ズーム|变焦|變焦|줌)/iu.test(text);
  return { mount, focalLength, aperture, primeLens, lens, accessory, zoom };
}

function isCameraPrimeLensMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = cameraPrimeLensConstraints(text);
  if (!evidence.lens || evidence.accessory || evidence.zoom) return true;
  if (requested.mount && evidence.mount !== requested.mount) return true;
  if (requested.focalLength && evidence.focalLength !== requested.focalLength) return true;
  if (requested.aperture && evidence.aperture !== requested.aperture) return true;
  return false;
}

function chargingCableConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  const usbCCount = [...text.matchAll(/usb\s*[- ]?c/giu)].length;
  const lightning = /lightning|ライトニング|闪电|閃電|라이트닝/iu.test(text);
  const connector = lightning && usbCCount ? 'usb-c-lightning'
    : usbCCount >= 2 ? 'usb-c-usb-c' : '';
  const length = text.match(/\b(\d(?:\.\d)?)\s*(?:m\b|メートル|米)/iu)?.[1] || '';
  const watts = text.match(/\b(\d{2,3})\s*w\b/iu)?.[1] || '';
  const braided = /(?:編み込み|編組|braided|编织|編織|패브릭|브레이드)/iu.test(text);
  const cable = /(?:充電ケーブル|充電コード|charging\s*(?:cable|cord)|充电线|充電線|충전\s*케이블)/iu.test(text);
  const otherProduct = /(?:adapter|アダプター|转接器|轉接器|어댑터|hub|ハブ|charger|充電器|充电器|충전기|power\s*bank|モバイルバッテリー|充电宝|보조\s*배터리)/iu.test(text);
  return { connector, length, watts, braided, cable, otherProduct };
}

function isChargingCableMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = chargingCableConstraints(text);
  if (!evidence.cable || evidence.otherProduct) return true;
  if (requested.connector && evidence.connector !== requested.connector) return true;
  if (requested.length && evidence.length !== requested.length) return true;
  if (requested.watts && evidence.watts !== requested.watts) return true;
  if (requested.braided && !evidence.braided) return true;
  return false;
}

function wallChargerConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  const watts = text.match(/\b(\d{2,3})\s*w\b/iu)?.[1] || '';
  const ports = text.match(/(?:\b([2-9])\s*[- ]?\s*(?:ポート|ports?|口|포트)|(?:dual|デュアル|双|雙|듀얼)\s*[- ]?\s*(?:ポート|ports?|口|포트))/iu);
  const portCount = ports?.[1] || (ports ? '2' : '');
  const charger = /(?:充電器|ACアダプター|wall\s*charger|power\s*adapter|充电器|充電器|충전기)/iu.test(text);
  const usbC = /usb\s*[- ]?c/iu.test(text);
  const gan = /\bgan\b|窒化ガリウム|氮化镓|氮化鎵|질화갈륨/iu.test(text);
  const pd = /(?:\bpd\b|power\s*delivery)/iu.test(text);
  const pps = /\bpps\b/iu.test(text);
  const wrongProduct = /(?:charging\s*cable|充電ケーブル|充电线|충전\s*케이블|power\s*bank|モバイルバッテリー|充电宝|보조\s*배터리)/iu.test(text);
  return { watts, portCount, charger, usbC, gan, pd, pps, wrongProduct };
}

function isWallChargerMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = wallChargerConstraints(text);
  if (!evidence.charger || evidence.wrongProduct) return true;
  if (requested.watts && evidence.watts !== requested.watts) return true;
  if (requested.portCount && evidence.portCount !== requested.portCount) return true;
  for (const feature of ['usbC', 'gan', 'pd', 'pps']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function wirelessChargingStationConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  return {
    wireless: /(?:wireless\s*charg(?:er|ing)|ワイヤレス充電|无线充电|無線充電|무선\s*충전)/iu.test(text),
    station: /(?:station|stand|スタンド|充電台|充电站|充電站|충전독|충전\s*스탠드)/iu.test(text),
    qi2: /\bqi\s*2\b/iu.test(text),
    watts: text.match(/\b(\d{1,2})\s*w\b/iu)?.[1] || '',
    threeInOne: /(?:3\s*[- ]?in\s*[- ]?1|3台同時|3台用|三合一|3合1|3合一|3개\s*동시)/iu.test(text),
    iphone: /\biphone\b|アイフォン|苹果手机|蘋果手機|아이폰/iu.test(text),
    watch: /apple\s*watch|アップルウォッチ|苹果手表|蘋果手錶|애플워치/iu.test(text),
    airpods: /airpods|エアポッズ|苹果耳机|蘋果耳機|에어팟/iu.test(text),
    wrongProduct: /(?:power\s*bank|モバイルバッテリー|充电宝|보조\s*배터리|charging\s*cable|充電ケーブル|充电线|충전\s*케이블)/iu.test(text)
  };
}

function isWirelessChargingStationMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = wirelessChargingStationConstraints(text);
  if (!evidence.wireless || !evidence.station || evidence.wrongProduct) return true;
  if (requested.qi2 && !evidence.qi2) return true;
  if (requested.watts && evidence.watts !== requested.watts) return true;
  for (const feature of ['threeInOne', 'iphone', 'watch', 'airpods']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function hdmiCableConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  return {
    cable: /(?:hdmi).{0,100}(?:ケーブル|cable|连接线|連接線|线缆|線纜|케이블)|(?:ケーブル|cable|连接线|連接線|线缆|線纜|케이블).{0,100}(?:hdmi)|(?:hdmi).{0,100}(?:认证|認證)\s*(?:线|線)(?:$|\s)/iu.test(text),
    version: text.match(/\bhdmi\s*(2\.1|2\.0|1\.4)\b/iu)?.[1] || '',
    length: text.match(/\b(\d(?:\.\d)?)\s*(?:m\b|メートル|米)/iu)?.[1] || '',
    eightK60: /\b8\s*k\s*60\s*hz\b/iu.test(text),
    fourK120: /\b4\s*k\s*120\s*hz\b/iu.test(text),
    ultraHighSpeed: /ultra\s*high\s*speed|ウルトラハイスピード|超高速|초고속/iu.test(text),
    certified: /(?:認証|certified|认证|認證|인증)/iu.test(text),
    wrongProduct: /(?:adapter|アダプター|转接器|轉接器|어댑터|splitter|分配器|分配器|분배기|switch|切替器|切换器|切換器|스위치)/iu.test(text)
  };
}

function isHdmiCableMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = hdmiCableConstraints(text);
  if (!evidence.cable || evidence.wrongProduct) return true;
  for (const field of ['version', 'length']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const feature of ['eightK60', 'fourK120', 'ultraHighSpeed', 'certified']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function displayPortCableConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  return {
    cable: /(?:display\s*port|\bdp\b).{0,100}(?:ケーブル|cable|连接线|連接線|线缆|線纜|케이블)|(?:ケーブル|cable|连接线|連接線|线缆|線纜|케이블).{0,100}(?:display\s*port|\bdp\b)/iu.test(text),
    version: text.match(/(?:display\s*port|\bdp\b)\s*(2\.1|2\.0|1\.4|1\.2)\b/iu)?.[1] || '',
    length: text.match(/\b(\d(?:\.\d)?)\s*(?:m\b|メートル|米)/iu)?.[1] || '',
    eightK60: /\b8\s*k\s*60\s*hz\b/iu.test(text),
    fourK144: /\b4\s*k\s*144\s*hz\b/iu.test(text),
    hbr3: /\bhbr\s*3\b/iu.test(text),
    dsc: /\bdsc\b|display\s*stream\s*compression/iu.test(text),
    wrongProduct: /(?:adapter|アダプター|转接器|轉接器|어댑터|splitter|分配器|분배기|switch|切替器|切换器|切換器|스위치|usb[- ]?c|type[- ]?c|hdmi)/iu.test(text)
  };
}

function isDisplayPortCableMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = displayPortCableConstraints(text);
  if (!evidence.cable || evidence.wrongProduct) return true;
  for (const field of ['version', 'length']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const feature of ['eightK60', 'fourK144', 'hbr3', 'dsc']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function portableSsdConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  const capacity = [...text.matchAll(/\b(\d(?:\.\d)?)\s*(tb|gb)\b/giu)].filter((match) => {
    const before = text.slice(Math.max(0, match.index - 12), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 10);
    return !/(?:not|no|不要|不是|不想要)\s*$/iu.test(before)
      && !/^\s*(?:ではなく|じゃなく|ではない|じゃない|but\b|而不是|말고|아닌|아니고)/iu.test(after);
  }).at(-1);
  return {
    ssd: /\bssd\b/iu.test(text),
    portable: /(?:ポータブル|外付け|portable|external|移动|移動|便携|便攜|외장|휴대용).{0,32}ssd|ssd.{0,32}(?:ポータブル|外付け|portable|external|移动|移動|便携|便攜|외장|휴대용)/iu.test(text),
    capacity: capacity ? `${capacity[1]}${capacity[2].toUpperCase()}` : '',
    usbGen: [...text.matchAll(/(?:usb\s*3\.2\s*)?gen\s*([12](?:x[12])?)/giu)].filter((match) => {
      const before = text.slice(Math.max(0, match.index - 12), match.index);
      const after = text.slice(match.index + match[0].length, match.index + match[0].length + 12);
      return !/(?:not|no|不要|不是|不想要)\s*$/iu.test(before)
        && !/^\s*(?:ではなく|じゃなく|ではない|じゃない|not\s+(?:(?:usb\s*3\.2\s*)?gen\b)|but\s+(?:(?:usb\s*3\.2\s*)?gen\b)|不要|而不是|말고|아닌|아니고)/iu.test(after);
    }).at(-1)?.[1]?.toLowerCase() || '',
    readSpeed: [...text.matchAll(/\b(\d{3,4})\s*(?:mb\s*\/\s*s|mbps|mb\/秒)/giu)].filter((match) => {
      const before = text.slice(Math.max(0, match.index - 12), match.index);
      const after = text.slice(match.index + match[0].length, match.index + match[0].length + 10);
      return !/(?:not|no|不要|不是|不想要)\s*$/iu.test(before)
        && !/^\s*(?:ではなく|じゃなく|ではない|じゃない|but\b|而不是|말고|아닌|아니고)/iu.test(after);
    }).at(-1)?.[1] || '',
    nvme: /\bnvme\b/iu.test(text),
    shockproof: /耐衝撃|耐冲击|耐衝擊|抗震|shock[- ]?proof|충격\s*(?:방지|보호)/iu.test(text),
    wrongProduct: /(?:enclosure|ケース(?:のみ|単体)|外付けケース|硬盘盒|硬碟盒|케이스\s*(?:단품|전용)|hdd|hard\s*drive|ハードディスク|机械硬盘|機械硬碟|하드\s*디스크|usb\s*(?:flash|memory)|flash\s*drive|memory\s*stick|usbメモリ|u盘|隨身碟|usb\s*메모리|内蔵|internal|内置|內置|내장)/iu.test(text)
  };
}

function isPortableSsdMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = portableSsdConstraints(text);
  if (!evidence.ssd || !evidence.portable || evidence.wrongProduct) return true;
  for (const field of ['capacity', 'usbGen', 'readSpeed']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const feature of ['nvme', 'shockproof']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function sdMemoryCardConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  const capacity = text.match(/\b(\d{2,4})\s*(gb|tb)\b/iu);
  const uhs = text.match(/\buhs[- ]?(ii|i|2|1)\b/iu)?.[1]?.toLowerCase() || '';
  return {
    sdCard: /(?:\bsd(?:xc|hc)?\s*(?:カード|card)|sd卡|sd\s*카드)/iu.test(text),
    capacity: capacity ? `${capacity[1]}${capacity[2].toUpperCase()}` : '',
    uhs: uhs === 'ii' || uhs === '2' ? 'II' : uhs ? 'I' : '',
    videoClass: text.match(/\bv\s*(30|60|90)\b/iu)?.[1] || '',
    readSpeed: text.match(/\b(\d{2,3})\s*(?:mb\s*\/\s*s|mbps|mb\/秒)/iu)?.[1] || '',
    fourK: /\b4\s*k\b/iu.test(text),
    eightK: /\b8\s*k\b/iu.test(text),
    wrongProduct: /(?:micro\s*sd|microsd|cfexpress|compactflash|カードリーダー|card\s*reader|读卡器|讀卡器|카드\s*리더|adapter|アダプター|转接器|轉接器|어댑터)/iu.test(text)
  };
}

function isSdMemoryCardMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = sdMemoryCardConstraints(text);
  if (!evidence.sdCard || evidence.wrongProduct) return true;
  for (const field of ['capacity', 'uhs', 'videoClass', 'readSpeed']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const feature of ['fourK', 'eightK']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function gamingMonitorConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  return {
    monitor: /(?:モニター|monitor|显示器|顯示器|모니터)/iu.test(text),
    size: text.match(/\b(\d{2}(?:\.\d)?)\s*(?:インチ|inch(?:es)?|英寸|인치)/iu)?.[1] || '',
    fourK: /\b4\s*k\b/iu.test(text),
    refreshRate: text.match(/\b(\d{2,3})\s*hz\b/iu)?.[1] || '',
    ips: /\bips\b/iu.test(text),
    hdmi: text.match(/\bhdmi\s*(2\.1|2\.0)\b/iu)?.[1] || '',
    hdr: /\bhdr\b/iu.test(text),
    wrongProduct: /(?:テレビ|\btv\b|电视|電視|텔레비전|モニター\s*アーム|monitor\s*arm|显示器支架|顯示器支架|모니터\s*암|projector|プロジェクター|投影仪|投影機|프로젝터|portable.{0,24}monitor|モバイル.{0,16}モニター|便携.{0,16}显示器|便攜.{0,16}顯示器|휴대용.{0,16}모니터)/iu.test(text)
  };
}

function isGamingMonitorMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = gamingMonitorConstraints(text);
  if (!evidence.monitor || evidence.wrongProduct) return true;
  for (const field of ['size', 'refreshRate', 'hdmi']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const feature of ['fourK', 'ips', 'hdr']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function mechanicalKeyboardConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  return {
    keyboard: /(?:キーボード|keyboard|键盘|鍵盤|키보드)/iu.test(text),
    mechanical: /(?:メカニカル|mechanical|机械|機械|기계식)/iu.test(text),
    layoutSize: text.match(/\b(60|65|75|80|100)\s*%/u)?.[1] || '',
    jis: /\bjis\b|日本語配列|日文配列|日语配列|日語配列|일본어\s*배열/iu.test(text),
    redSwitch: /赤軸|red\s*switch|红轴|紅軸|적축/iu.test(text),
    hotSwap: /hot[- ]?swapp?able|hot[- ]?swap|ホットスワップ|热插拔|熱插拔|핫스왑/iu.test(text),
    bluetooth: /bluetooth|ブルートゥース|蓝牙|藍牙|블루투스/iu.test(text),
    wireless24: /\b2\.4\s*ghz\b/iu.test(text),
    usbC: /usb[- ]?c|type[- ]?c/iu.test(text),
    wrongProduct: /(?:keycaps?|キーキャップ|键帽|鍵帽|키캡|switch(?:es)?\s*(?:set|pack)|軸\s*(?:セット|単体)|轴体|軸體|스위치\s*(?:세트|단품)|membrane|メンブレン|薄膜键盘|薄膜鍵盤|멤브레인|mouse|マウス|鼠标|滑鼠|마우스|ansi|us\s*layout|英語配列|英文配列|英文键盘|英文鍵盤|영문\s*배열)/iu.test(text)
  };
}

function isMechanicalKeyboardMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = mechanicalKeyboardConstraints(text);
  if (!evidence.keyboard || !evidence.mechanical || evidence.wrongProduct) return true;
  if (requested.layoutSize && evidence.layoutSize !== requested.layoutSize) return true;
  for (const feature of ['jis', 'redSwitch', 'hotSwap', 'bluetooth', 'wireless24', 'usbC']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function noiseCancellingHeadphonesConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  return {
    headphones: /(?:ヘッドホン|headphones?|头戴式.{0,16}耳机|頭戴式.{0,16}耳機|헤드폰)/iu.test(text),
    anc: /ノイズキャンセリング|noise[- ]?cancell?ing|\banc\b|主动降噪|主動降噪|노이즈\s*캔슬링/iu.test(text),
    overEar: /オーバーイヤー|over[- ]?ear|头戴式|頭戴式|오버이어/iu.test(text),
    bluetooth: text.match(/bluetooth\s*(5\.\d)/iu)?.[1] || '',
    multipoint: /multi[- ]?point|マルチポイント|多点连接|多點連接|멀티포인트/iu.test(text),
    batteryHours: text.match(/\b(\d{2,3})\s*(?:時間|hours?|hrs?|小时|小時|시간)/iu)?.[1] || '',
    usbC: /usb[- ]?c|type[- ]?c/iu.test(text),
    wireless: /wireless|ワイヤレス|無線|无线|無線|무선|bluetooth/iu.test(text),
    wrongProduct: /(?:earbuds?|earphones?|イヤホン|耳塞|入耳|이어폰|イヤーパッド|ear\s*(?:pads?|cushions?)|耳罩\s*(?:替换|替換)|이어패드|収納ケース|carrying\s*case|storage\s*case|收纳盒|收納盒|보관\s*케이스|transmitter|送信機|发射器|發射器|송신기)/iu.test(text)
  };
}

function isNoiseCancellingHeadphonesMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = noiseCancellingHeadphonesConstraints(text);
  if (!evidence.headphones || !evidence.anc || !evidence.wireless || evidence.wrongProduct) return true;
  for (const field of ['bluetooth', 'batteryHours']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const feature of ['overEar', 'multipoint', 'usbC']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function robotVacuumBodyConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  return {
    robotVacuum: /(?:robot\s*vacuum|ロボット掃除機|扫地机器人|掃地機器人|로봇\s*청소기)/iu.test(text),
    lidar: /\blidar\b|レーザー(?:ナビ|マッピング)|激光导航|激光導航|라이다/iu.test(text),
    suction: text.match(/\b(\d{3,5})\s*pa\b/iu)?.[1] || '',
    selfEmpty: /自動(?:ゴミ収集|集塵)|self[- ]?emptying|auto[- ]?empty|自动集尘|自動集塵|자동\s*(?:먼지\s*)?비움/iu.test(text),
    mopping: /水拭き|mopping|vacuum\s*and\s*mop|拖地|물걸레/iu.test(text),
    wrongProduct: /(?:交換|replacement|配件|更换|更換|교체|フィルター|filter|ブラシ|brush|紙パック|dust\s*bag|充電台\s*単体|dock\s*only|station\s*only|基站单独|基站單獨|도크\s*단품|stick\s*vacuum|スティック掃除機|手持吸尘器|手持吸塵器|스틱\s*청소기)/iu.test(text)
  };
}

function isRobotVacuumBodyMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = robotVacuumBodyConstraints(text);
  if (!evidence.robotVacuum || evidence.wrongProduct) return true;
  if (requested.suction && evidence.suction !== requested.suction) return true;
  for (const feature of ['lidar', 'selfEmpty', 'mopping']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function airPurifierBodyConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  return {
    purifier: /(?:空気清浄機|air\s*purifier|空气净化器|空氣淨化器|공기\s*청정기|(?:花粉|pm\s*2\.5).{0,24}(?:減ら|除去|取り除).{0,24}(?:部屋|室内).{0,12}空気.{0,12}(?:きれい|清浄)|(?:clean|remove|filter).{0,20}(?:pollen|pm\s*2\.5).{0,30}(?:room|indoor)\s*air|(?:过滤|過濾|去除).{0,24}(?:(?:花粉|pm\s*2\.5).{0,24}(?:房间|房間|室内|室內).{0,8}(?:空气|空氣)|(?:房间|房間|室内|室內).{0,16}(?:花粉|pm\s*2\.5))|(?:방\s*안|실내).{0,24}(?:꽃가루|pm\s*2\.5).{0,20}(?:걸러|제거))/iu.test(text),
    area: text.match(/\b(\d{2,3})\s*(?:m(?:2|²)|㎡|平方メートル|平方米|平方公尺|평방미터)/iu)?.[1] || '',
    hepa: text.match(/\bhepa\s*h?\s*(1[1-4])\b/iu)?.[1] || '',
    cadr: text.match(/\bcadr\s*(\d{3,4})\s*(?:m(?:3|³)\s*\/\s*h|m³\/h)/iu)?.[1] || '',
    pm25: /pm\s*2\.5.{0,12}(?:センサー|sensor|传感器|傳感器|센서)/iu.test(text),
    wifi: /wi[- ]?fi|wifi|無線LAN|无线网络|無線網路|와이파이/iu.test(text),
    wrongProduct: /(?:交換|replacement|替换|替換|교체|フィルター|filters?|滤芯|濾芯|필터|加湿器|humidifier|加湿机|加濕器|가습기|除湿機|dehumidifier|除湿机|除濕機|제습기|扇風機|\bfan\b|风扇|風扇|선풍기)/iu.test(text)
  };
}

function isAirPurifierBodyMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = airPurifierBodyConstraints(text);
  if (!evidence.purifier || evidence.wrongProduct) return true;
  for (const field of ['area', 'hepa', 'cadr']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const feature of ['pm25', 'wifi']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function cordlessStickVacuumConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  return {
    stickVacuum: /(?:コードレス.{0,16}スティック掃除機|cordless\s*stick\s*vacuum|无线杆式吸尘器|無線桿式吸塵器|무선\s*스틱\s*청소기|コード.{0,8}(?:気にせず|なし).{0,16}床.{0,16}(?:髪|ほこり).{0,16}(?:吸|掃除)|(?:clean|vacuum).{0,20}(?:hair|dust).{0,16}(?:from\s+the\s+)?floor.{0,20}without\s+(?:a\s+)?cord|不用(?:电线|電線).{0,20}(?:吸走|清理).{0,16}(?:地板).{0,16}(?:毛发|毛髮|灰尘|灰塵)|전선\s*없이.{0,20}바닥.{0,16}(?:머리카락|먼지).{0,20}(?:청소|흡입))/iu.test(text),
    suction: text.match(/\b(\d{2,3})\s*aw\b/iu)?.[1] || '',
    runtime: text.match(/\b(\d{2,3})\s*(?:分|minutes?|mins?|分钟|分鐘|분)/iu)?.[1] || '',
    hepa: /\bhepa\b|ヘパ|헤파/iu.test(text),
    laser: /レーザー|laser|激光|레이저/iu.test(text),
    wrongProduct: /(?:robot\s*vacuum|ロボット掃除機|扫地机器人|掃地機器人|로봇\s*청소기|handheld\s*vacuum|ハンディ掃除機|手持吸尘器|手持吸塵器|핸디\s*청소기|(?:replacement|交換|替换|替換|교체).{0,20}(?:battery|filter|バッテリー|フィルター|电池|電池|滤芯|濾芯|배터리|필터)|充電器\s*単体|charger\s*only|充电器单独|充電器單獨|충전기\s*단품)/iu.test(text)
  };
}

function isCordlessStickVacuumMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = cordlessStickVacuumConstraints(text);
  if (!evidence.stickVacuum || evidence.wrongProduct) return true;
  for (const field of ['suction', 'runtime']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const feature of ['hepa', 'laser']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function airFryerBodyConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  return {
    airFryer: /(?:エアフライヤー|air\s*fryer|空气炸锅|空氣炸鍋|에어프라이어|油.{0,12}(?:使わず|少な|減ら).{0,16}(?:揚げ物|フライ).{0,12}(?:2種類|二種類).{0,8}同時|(?:two|2).{0,20}fried\s+foods?.{0,20}(?:at\s+once|simultaneously).{0,20}(?:little|less|without)\s+oil|少油.{0,12}(?:同时|同時).{0,12}(?:做|制作|製作).{0,8}(?:两种|兩種).{0,8}(?:炸物|油炸)|기름.{0,12}(?:적게|없이).{0,20}튀김.{0,12}(?:두\s*가지|2가지).{0,12}동시에)/iu.test(text),
    capacity: text.match(/\b(\d(?:\.\d)?)\s*l\b/iu)?.[1] || '',
    temperature: text.match(/\b(\d{3})\s*(?:℃|°\s*c|celsius|度)/iu)?.[1] || '',
    dualBasket: /dual[- ]?basket|デュアルバスケット|双篮|雙籃|듀얼\s*바스켓/iu.test(text),
    dishwasher: /食洗機対応|dishwasher[- ]?safe|可放洗碗机|可放洗碗機|식기세척기\s*(?:사용|세척)\s*가능/iu.test(text),
    wrongProduct: /(?:ライナー|liners?|纸垫|紙墊|라이너|交換バスケット|replacement\s*basket|替换炸篮|替換炸籃|교체용\s*바스켓|air\s*fryer\s*oven|エアフライヤーオーブン|空气炸烤箱|空氣炸烤箱|에어프라이어\s*오븐|toaster|トースター|烤面包机|烤麵包機|토스터)/iu.test(text)
  };
}

function isAirFryerBodyMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = airFryerBodyConstraints(text);
  if (!evidence.airFryer || evidence.wrongProduct) return true;
  for (const field of ['capacity', 'temperature']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const feature of ['dualBasket', 'dishwasher']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function automaticEspressoMachineConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  const beanToCupIntent = /(?:豆.{0,12}入れるだけ.{0,20}カプチーノ.{0,16}(?:一台|作り)|(?:make|brew).{0,12}cappuccino.{0,20}(?:whole\s+)?beans.{0,20}(?:touch|button)|放入咖啡豆.{0,12}(?:一键|一鍵).{0,12}(?:做|制作|製作).{0,8}(?:卡布奇诺|卡布奇諾)|원두.{0,12}넣고.{0,20}버튼.{0,12}(?:한\s*번|한번).{0,20}카푸치노)/iu.test(text);
  return {
    machine: /(?:エスプレッソマシン|espresso\s*machine|意式咖啡机|義式咖啡機|에스프레소\s*머신)/iu.test(text) || beanToCupIntent,
    fullyAutomatic: /(?:全自動|fully[- ]?automatic|全自动|전자동)/iu.test(text) || beanToCupIntent,
    pressure: text.match(/\b(\d{1,2})\s*bar\b/iu)?.[1] || '',
    capacity: text.match(/\b(\d(?:\.\d)?)\s*l\b/iu)?.[1] || '',
    grinder: /(?:内蔵|built[- ]?in|内置|내장).{0,12}(?:グラインダー|grinder|磨豆机|磨豆機|그라인더)/iu.test(text),
    frother: /(?:ミルクフォーマー|milk\s*frother|奶泡器|우유\s*거품기)/iu.test(text),
    wrongProduct: /(?:カプセル|capsules?|pods?|胶囊|膠囊|캡슐|ドリップ|drip|滴漏|드립|grinder\s*(?:only|replacement)|グラインダー単体|磨豆机单独|磨豆機單獨|그라인더\s*단품|cleaning\s*(?:tablets?|solution)|descaler|洗浄剤|除石灰剤|清洁片|清潔片|除垢剂|除垢劑|세정제|석회\s*제거제|replacement\s*(?:parts?|accessories)|交換部品|替换零件|替換零件|교체\s*부품)/iu.test(text)
  };
}

function isAutomaticEspressoMachineMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = automaticEspressoMachineConstraints(text);
  if (!evidence.machine || !evidence.fullyAutomatic || evidence.wrongProduct) return true;
  for (const field of ['pressure', 'capacity']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const feature of ['grinder', 'frother']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function steamMicrowaveOvenConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  const oneApplianceIntent = /(?:温め.{0,12}蒸し料理.{0,12}一台|reheat.{0,12}(?:and|plus).{0,8}steam.{0,16}(?:one|single)\s+appliance|一台(?:机器|機器).{0,16}(?:完成|搞定).{0,12}加热.{0,8}(?:和|与|與).{0,8}蒸|한\s*대로.{0,16}데우기.{0,8}(?:와|과).{0,8}찜)/iu.test(text);
  return {
    oven: /(?:オーブンレンジ|(?:convection\s*)?microwave\s*oven|烤箱微波炉|烤箱微波爐|微波烤箱|오븐.{0,12}전자레인지)/iu.test(text) || oneApplianceIntent,
    steam: /(?:スチーム|steam|蒸汽|스팀)/iu.test(text) || oneApplianceIntent,
    capacity: text.match(/\b(\d{2})\s*l\b/iu)?.[1] || '',
    power: text.match(/\b(\d{3,4})\s*w\b/iu)?.[1] || '',
    flat: /(?:フラット庫内|flat[- ]?bed|flat\s*interior|平板内腔|平板內腔|플랫\s*내부)/iu.test(text),
    sensor: /(?:赤外線センサー|infrared\s*sensor|红外传感器|紅外感測器|적외선\s*센서)/iu.test(text),
    wrongProduct: /(?:トースター|toaster|烤面包机|烤麵包機|토스터|業務用|commercial|商用|업소용|microwave\s*(?:cookware|container|cover)|電子レンジ.{0,12}(?:容器|カバー)|微波炉.{0,12}(?:容器|盖)|微波爐.{0,12}(?:容器|蓋)|전자레인지.{0,12}(?:용기|커버)|replacement\s*(?:parts?|tray|plate)|交換部品|交換皿|替换零件|替換零件|교체\s*부품)/iu.test(text)
  };
}

function isSteamMicrowaveOvenMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = steamMicrowaveOvenConstraints(text);
  if (!evidence.oven || !evidence.steam || evidence.wrongProduct) return true;
  for (const field of ['capacity', 'power']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const feature of ['flat', 'sensor']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function frontLoadWasherDryerConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  return {
    machine: /(?:ドラム式.{0,12}洗濯乾燥機|front[- ]?load.{0,12}washer[- ]?dryer|washer[- ]?dryer\s*combo|滚筒洗烘一体机|滾筒洗烘一體機|드럼.{0,12}세탁건조기)/iu.test(text),
    wash: text.match(/(\d{1,2})\s*kg\s*wash(?:ing)?/iu)?.[1]
      || text.match(/(?:洗濯|洗涤|洗滌|세탁)\s*(\d{1,2})\s*kg/iu)?.[1] || '',
    dry: text.match(/(\d{1,2})\s*kg\s*dry(?:ing)?/iu)?.[1]
      || text.match(/(?:乾燥|烘干|烘乾|건조)\s*(\d{1,2})\s*kg/iu)?.[1] || '',
    heatPump: /(?:ヒートポンプ|heat[- ]?pump|热泵|熱泵|히트펌프)/iu.test(text),
    autoDose: /(?:洗剤自動投入|automatic\s*detergent\s*dispens(?:er|ing)|自动投放洗衣液|自動投放洗衣液|세제\s*자동\s*투입)/iu.test(text),
    wrongProduct: /(?:縦型洗濯機|top[- ]?load\s*washer|波轮洗衣机|波輪洗衣機|통돌이\s*세탁기|tumble\s*dryer|衣類乾燥機|烘干机|烘乾機|건조기\s*단품|洗濯洗剤|laundry\s*detergent|세탁\s*세제|糸くずフィルター|lint\s*filter|线屑过滤器|線屑過濾器|보풀\s*필터|installation\s*(?:kit|hose)|設置部品|給水ホース|安装套件|安裝套件|설치\s*키트)/iu.test(text)
  };
}

function isFrontLoadWasherDryerMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = frontLoadWasherDryerConstraints(text);
  if (!evidence.machine || evidence.wrongProduct) return true;
  for (const field of ['wash', 'dry']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const feature of ['heatPump', 'autoDose']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function frenchDoorRefrigeratorConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  return {
    refrigerator: /(?:冷蔵庫|refrigerator|fridge|冰箱|냉장고|まとめ買い.{0,20}保存.{0,16}氷.{0,12}自動|store.{0,20}week.{0,20}groceries.{0,20}(?:make\s+ice|ice).{0,12}automatically|存.{0,16}一周.{0,16}(?:采购|採購).{0,16}(?:自动|自動)制冰|일주일.{0,16}장본.{0,20}보관.{0,16}얼음.{0,12}자동)/iu.test(text),
    capacity: text.match(/\b(\d{3})\s*l\b/iu)?.[1] || '',
    frenchDoor: /(?:観音開き|フレンチドア|french[- ]?door|对开门|對開門|프렌치도어)/iu.test(text),
    inverter: /(?:インバーター|inverter|变频|變頻|인버터)/iu.test(text),
    iceMaker: /(?:自動製氷|automatic\s*ice\s*maker|自动制冰|自動製冰|자동\s*제빙)/iu.test(text),
    wrongProduct: /(?:ミニ冷蔵庫|mini\s*(?:fridge|refrigerator)|小型冰箱|미니\s*냉장고|ワインセラー|wine\s*(?:cooler|fridge)|酒柜|酒櫃|와인\s*냉장고|冷凍庫単体|standalone\s*freezer|冰柜|冰櫃|냉동고\s*단품|給水フィルター|water\s*filter|净水滤芯|淨水濾芯|정수\s*필터|製氷皿|ice\s*tray|制冰盒|製冰盒|얼음\s*트레이|replacement\s*(?:parts?|shelf|door)|交換部品|交換棚|替换零件|替換零件|교체\s*부품)/iu.test(text)
  };
}

function isFrenchDoorRefrigeratorMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = frenchDoorRefrigeratorConstraints(text);
  if (!evidence.refrigerator || evidence.wrongProduct) return true;
  if (requested.capacity && evidence.capacity !== requested.capacity) return true;
  for (const feature of ['frenchDoor', 'inverter', 'iceMaker']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function builtInDishwasherConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  const handsFreeDishwashing = /(?:食後.{0,20}\d{1,2}人分.{0,20}手洗いせず.{0,20}乾か.{0,16}扉.{0,12}自動.{0,8}開|wash.{0,8}(?:and\s+)?dry.{0,16}\d{1,2}\s*place\s*settings?.{0,30}without\s+hand\s+washing.{0,30}open.{0,12}door.{0,12}automatically|(?:饭后|飯後).{0,16}不用手洗.{0,12}\d{1,2}套(?:餐具)?.{0,16}烘干.{0,12}(?:自动|自動)开门|식후.{0,12}\d{1,2}인용.{0,16}손설거지\s*없이.{0,20}(?:씻고|세척).{0,12}말린.{0,16}문.{0,12}자동)/iu.test(text);
  return {
    machine: /(?:ビルトイン.{0,12}(?:食器洗い乾燥機|食洗機)|built[- ]?in\s*dishwasher|嵌入式洗碗机|嵌入式洗碗機|빌트인\s*식기세척기)/iu.test(text) || handsFreeDishwashing,
    settings: text.match(/(\d{1,2})\s*(?:人分|place\s*settings?|套(?:餐具)?|인용)/iu)?.[1] || '',
    width: text.match(/(?:幅\s*)?(\d{2})\s*cm/iu)?.[1] || '',
    inverter: /(?:インバーター|inverter|变频|變頻|인버터)/iu.test(text),
    autoOpen: /(?:自動ドアオープン|auto(?:matic)?[- ]?open\s*door|自动开门|自動開門|자동\s*문열림)/iu.test(text) || handsFreeDishwashing,
    wrongProduct: /(?:卓上(?:型)?食洗機|countertop\s*dishwasher|台式洗碗机|台式洗碗機|탁상형\s*식기세척기|食洗機用洗剤|dishwasher\s*detergent|洗碗机洗涤剂|洗碗機洗滌劑|식기세척기\s*세제|replacement\s*(?:rack|basket|parts?)|交換(?:ラック|かご|部品)|替换(?:碗篮|零件)|替換(?:碗籃|零件)|교체용\s*(?:랙|바스켓|부품)|inlet\s*hose|drain\s*hose|給水ホース|排水ホース|进水管|進水管|排水管|급수\s*호스|배수\s*호스)/iu.test(text)
  };
}

function isBuiltInDishwasherMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = builtInDishwasherConstraints(text);
  if (!evidence.machine || evidence.wrongProduct) return true;
  for (const field of ['settings', 'width']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const feature of ['inverter', 'autoOpen']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function oledTelevisionConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  return {
    television: /(?:有機EL.{0,8}(?:テレビ|TV)|OLED.{0,8}(?:TV|television|电视|電視|텔레비전)|映画館.{0,16}深い黒.{0,16}ゲーム.{0,12}滑らか|cinematic.{0,12}deep\s+blacks?.{0,12}smooth\s+gaming|影院.{0,12}深邃黑色.{0,8}(?:和|与|與).{0,8}流畅游戏|영화관.{0,12}깊은\s*블랙.{0,8}(?:과|와).{0,8}부드러운\s*게임)/iu.test(text),
    size: text.match(/\b(\d{2,3})\s*(?:型|インチ|inch(?:es)?|英寸|인치)/iu)?.[1] || '',
    resolution: /\b4\s*k\b/iu.test(text),
    refresh: text.match(/\b(\d{2,3})\s*hz\b/iu)?.[1] || '',
    hdmi: text.match(/hdmi\s*(2\.1)/iu)?.[1] || '',
    dolbyVision: /dolby\s*vision/iu.test(text),
    wrongProduct: /(?:PC\s*モニター|gaming\s*monitor|computer\s*monitor|电脑显示器|電腦顯示器|게이밍\s*모니터|projector|プロジェクター|投影仪|投影機|프로젝터|テレビ台|TV\s*stand|电视柜|電視櫃|TV\s*스탠드|壁掛け金具|wall\s*mount|壁挂架|壁掛架|벽걸이\s*브라켓|remote\s*control|リモコン|遥控器|遙控器|리모컨|replacement\s*(?:panel|screen)|交換パネル|交換画面|替换屏幕|替換螢幕|교체용\s*패널)/iu.test(text)
  };
}

function isOledTelevisionMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = oledTelevisionConstraints(text);
  if (!evidence.television || evidence.wrongProduct) return true;
  for (const field of ['size', 'refresh', 'hdmi']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const feature of ['resolution', 'dolbyVision']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function laserProjectorConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  return {
    projector: /(?:プロジェクター|projector|投影仪|投影機|프로젝터|壁いっぱい.{0,12}大画面.{0,12}映画|movies?.{0,16}filling.{0,16}whole\s*wall.{0,16}huge\s*screen|电影画面.{0,12}铺满.{0,12}整面墙|영화\s*화면.{0,12}벽\s*가득.{0,12}크게)/iu.test(text),
    resolution: /\b4\s*k\b/iu.test(text),
    brightness: text.match(/\b(\d{3,4})\s*(?:ansi\s*)?(?:ルーメン|lumens?|流明|루멘)/iu)?.[1] || '',
    ratio: text.match(/(?:投写比|throw\s*ratio|投射比|투사비)\s*(\d(?:\.\d+)?:1)/iu)?.[1] || '',
    laser: /(?:レーザー|laser|激光|레이저)/iu.test(text),
    androidTv: /android\s*tv/iu.test(text),
    wrongProduct: /(?:ミニプロジェクター|mini\s*projector|迷你投影仪|迷你投影機|미니\s*프로젝터|テレビ|projector\s*tv\b|电视|電視|텔레비전|monitor|モニター|显示器|顯示器|모니터|projector\s*screen|プロジェクタースクリーン|投影幕|프로젝터\s*스크린|replacement\s*lamp|交換ランプ|替换灯泡|替換燈泡|교체용\s*램프|ceiling\s*mount|天吊り金具|吊装支架|吊裝支架|천장\s*브라켓|remote\s*control|リモコン|遥控器|遙控器|리모컨)/iu.test(text)
  };
}

function isLaserProjectorMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = laserProjectorConstraints(text);
  if (!evidence.projector || evidence.wrongProduct) return true;
  for (const field of ['brightness', 'ratio']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const feature of ['resolution', 'laser', 'androidTv']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function dolbyAtmosSoundbarConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  const implicitSoundbar = /(?:テレビ.{0,12}音.{0,12}頭上.{0,12}包.{0,20}低音.{0,12}迫力|tv\s*audio.{0,20}surround.{0,12}overhead.{0,20}powerful\s*bass|电视声音.{0,12}头顶.{0,12}环绕.{0,16}(?:震撼|强劲)低音|tv\s*소리.{0,12}머리\s*위.{0,12}감싸.{0,16}저음.{0,12}(?:웅장|강력))/iu.test(text);
  return {
    soundbar: /(?:サウンドバー|soundbar|回音壁|사운드바)/iu.test(text) || implicitSoundbar,
    implicitSoundbar,
    channels: text.match(/\b(\d\.\d\.\d)\s*(?:ch|チャンネル|声道|聲道|채널)/iu)?.[1] || '',
    atmos: /dolby\s*atmos/iu.test(text),
    earc: /hdmi\s*e-?arc|\bearc\b/iu.test(text),
    subwoofer: /(?:ワイヤレスサブウーファー|wireless\s*subwoofer|无线低音炮|無線低音炮|무선\s*서브우퍼)/iu.test(text),
    wrongProduct: /(?:単体スピーカー|standalone\s*speaker|单独音箱|單獨音箱|스피커\s*단품|AVアンプ|av\s*receiver|功放|앰프|headphones?|ヘッドホン|耳机|耳機|헤드폰|テレビ|\btv\b|电视|電視|텔레비전|wall\s*mount|壁掛け金具|壁挂支架|壁掛支架|벽걸이\s*브라켓|replacement\s*remote|交換リモコン|替换遥控器|替換遙控器|교체용\s*리모컨|hdmi\s*cable|HDMIケーブル|HDMI线|HDMI線|HDMI\s*케이블)/iu.test(text)
  };
}

function isDolbyAtmosSoundbarMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = dolbyAtmosSoundbarConstraints(text);
  if (!evidence.soundbar || evidence.wrongProduct) return true;
  if (requested.channels && evidence.channels !== requested.channels) return true;
  for (const feature of ['atmos', 'earc', 'subwoofer']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function fullFrameMirrorlessCameraConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  const megapixels = text.match(/(?:(\d{2})\s*mp|((?:2[0-9]|3[0-9])00)\s*(?:万画素|万像素|萬像素|만\s*화소))/iu);
  return {
    camera: /(?:フルサイズ.{0,12}ミラーレス(?:カメラ)?|full[- ]?frame.{0,12}mirrorless\s*camera|全画幅.{0,12}无反相机|全片幅.{0,12}無反相機|풀프레임.{0,12}미러리스\s*카메라|暗い場所.{0,16}手ぶれ.{0,16}高画質.{0,12}動画.{0,12}撮|steady.{0,8}high[- ]quality\s*video.{0,16}low\s*light|暗光环境.{0,12}稳定.{0,12}高画质视频|어두운\s*곳.{0,12}흔들림\s*없이.{0,12}고화질\s*영상.{0,12}찍)/iu.test(text),
    pixels: megapixels?.[1] ? `${megapixels[1]}00` : megapixels?.[2] || '',
    video: /4\s*k\s*60\s*p/iu.test(text),
    ibis: /(?:ボディ内手ぶれ補正|in[- ]?body\s*image\s*stabili[sz]ation|\bibis\b|机身防抖|機身防震|바디\s*손떨림\s*보정)/iu.test(text),
    dualSlot: /(?:デュアルカードスロット|dual\s*card\s*slots?|双卡槽|雙卡槽|듀얼\s*카드\s*슬롯)/iu.test(text),
    wrongProduct: /(?:交換レンズ|camera\s*lens|镜头|鏡頭|교환\s*렌즈|コンパクトデジタルカメラ|compact\s*camera|卡片机|卡片機|콤팩트\s*카메라|ビデオカメラ|camcorder|摄像机|攝影機|캠코더|replacement\s*battery|交換バッテリー|替换电池|替換電池|교체용\s*배터리|battery\s*charger|充電器|充电器|充電器|충전기|camera\s*cage|カメラケージ|相机兔笼|相機兔籠|카메라\s*케이지|camera\s*bag|カメラバッグ|相机包|相機包|카메라\s*가방)/iu.test(text)
  };
}

function isFullFrameMirrorlessCameraMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = fullFrameMirrorlessCameraConstraints(text);
  if (!evidence.camera || evidence.wrongProduct) return true;
  if (requested.pixels && evidence.pixels !== requested.pixels) return true;
  for (const feature of ['video', 'ibis', 'dualSlot']) {
    if (requested[feature] && !evidence[feature]) return true;
  }
  return false;
}

function gamingLaptopConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  return {
    laptop: /(?:ゲーミングノート(?:PC)?|gaming\s*laptop|游戏本|遊戲筆電|게이밍\s*노트북|外出先.{0,12}最新ゲーム.{0,12}高\s*fps.{0,12}滑らか|latest\s*games?.{0,16}smoothly.{0,16}high\s*fps.{0,16}on\s*the\s*go|外出时.{0,12}高帧.{0,12}流畅.{0,12}最新游戏|밖에서도.{0,12}최신\s*게임.{0,12}높은\s*fps.{0,12}부드럽게)/iu.test(text),
    size: text.match(/\b(\d{2}(?:\.\d)?)\s*(?:型|インチ|inch(?:es)?|英寸|인치)/iu)?.[1] || '',
    gpu: text.match(/\brtx\s*(\d{4})\b/iu)?.[1] || '',
    ram: text.match(/\b(\d{2,3})\s*gb\s*(?:ram|メモリ|内存|記憶體|램)/iu)?.[1] || '',
    ssd: text.match(/\b(\d(?:\.\d)?)\s*tb\s*ssd\b/iu)?.[1] || '',
    refresh: text.match(/\b(\d{2,3})\s*hz\b/iu)?.[1] || '',
    wrongProduct: /(?:gaming\s*desktop|ゲーミングデスクトップ|游戏台式机|遊戲桌機|게이밍\s*데스크톱|graphics\s*card|GPU単体|显卡|顯示卡|그래픽카드\s*단품|laptop\s*bag|ノートPCバッグ|笔记本电脑包|筆電包|노트북\s*가방|cooling\s*pad|冷却台|散热垫|散熱墊|쿨링\s*패드|laptop\s*charger|ノートPC充電器|笔记本充电器|筆電充電器|노트북\s*충전기|replacement\s*(?:keyboard|screen|battery)|交換(?:キーボード|画面|バッテリー)|替换(?:键盘|屏幕|电池)|替換(?:鍵盤|螢幕|電池)|교체용\s*(?:키보드|화면|배터리))/iu.test(text)
  };
}

function isGamingLaptopMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = gamingLaptopConstraints(text);
  if (!evidence.laptop || evidence.wrongProduct) return true;
  for (const field of ['size', 'gpu', 'ram', 'ssd', 'refresh']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  return false;
}

function nasConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  return {
    nas: /(?:\bNAS\b|network\s*attached\s*storage|网络附加存储|網路附加儲存|네트워크\s*결합\s*스토리지|家族.{0,8}写真.{0,8}動画.{0,20}安全に保存.{0,20}複数端末.{0,16}高速|safe\s*place.{0,12}family\s*photos.{0,8}videos.{0,24}fast\s*access.{0,24}multiple\s*devices|全家照片视频.{0,16}集中安全保存.{0,20}多台设备.{0,16}高速访问|가족\s*사진.{0,8}영상.{0,20}안전하게\s*저장.{0,20}여러\s*기기.{0,16}빠르게)/iu.test(text),
    bays: text.match(/\b(\d{1,2})[\s-]*(?:ベイ|bay(?:s)?|盘位|盤位|베이)/iu)?.[1] || '',
    network: text.match(/\b(\d(?:\.\d)?)\s*GbE\b/iu)?.[1] || '',
    ram: text.match(/\b(\d{1,3})\s*GB\s*(?:RAM|メモリ|内存|記憶體|램)/iu)?.[1] || '',
    nvmeCache: /(?:NVMe\s*(?:キャッシュ|cache|缓存|快取|캐시)|(?:キャッシュ|cache|缓存|快取|캐시)\s*NVMe)/iu.test(text),
    diskless: /(?:ディスクレス|diskless|无盘|無碟|디스크리스)/iu.test(text),
    wrongProduct: /(?:NAS\s*(?:HDD|hard\s*drive)|NAS用HDD|NAS硬盘|NAS硬碟|NAS용\s*HDD|NAS\s*(?:enclosure|case)|NAS用ケース|NAS外壳|NAS外殼|NAS\s*인클로저|Wi-?Fi\s*router|無線LANルーター|无线路由器|無線路由器|와이파이\s*공유기|USB\s*(?:external\s*)?(?:drive|storage|DAS)|USB外付けストレージ|USB外置存储|USB外接儲存|USB\s*외장\s*스토리지|RAM\s*(?:module|upgrade)|増設メモリ|内存条|記憶體模組|메모리\s*모듈)/iu.test(text)
  };
}

function isNasMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = nasConstraints(text);
  if (!evidence.nas || evidence.wrongProduct) return true;
  for (const field of ['bays', 'network', 'ram']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const field of ['nvmeCache', 'diskless']) {
    if (requested[field] && !evidence[field]) return true;
  }
  return false;
}

function wifi7MeshRouterConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  return {
    meshRouter: /(?:メッシュ(?:Wi-?Fi)?ルーター|mesh\s*(?:Wi-?Fi\s*)?router|Mesh路由器|메시\s*(?:와이파이\s*)?공유기|家の端.{0,12}別の階.{0,16}電波.{0,12}途切れ.{0,16}高速通信|fast\s*wifi.{0,16}without\s*dropouts.{0,20}far\s*end.{0,24}every\s*floor|家里角落.{0,12}每层楼.{0,12}不断线.{0,12}高速上网|집\s*끝.{0,12}다른\s*층.{0,16}끊김\s*없이.{0,12}빠른\s*와이파이)/iu.test(text),
    wifi7: /Wi-?Fi\s*7/iu.test(text),
    speed: text.match(/\b(BE\d{4,5})\b/iu)?.[1]?.toUpperCase() || '',
    triBand: /(?:トライバンド|tri[\s-]*band|三频|三頻|트라이밴드)/iu.test(text),
    pack: text.match(/\b(\d)[\s-]*(?:台セット|台組|pack|只装|只裝|개\s*세트)/iu)?.[1] || '',
    ethernet: text.match(/\b(\d(?:\.\d)?)\s*GbE\b/iu)?.[1] || '',
    wrongProduct: /(?:Wi-?Fi\s*(?:extender|repeater)|Wi-?Fi中継機|无线扩展器|無線延伸器|와이파이\s*확장기|USB\s*Wi-?Fi\s*(?:adapter|dongle)|USB無線LAN子機|USB无线网卡|USB無線網卡|USB\s*와이파이\s*어댑터|cable\s*modem|ケーブルモデム|有线调制解调器|纜線數據機|케이블\s*모뎀|network\s*switch|ネットワークスイッチ|网络交换机|網路交換器|네트워크\s*스위치|standalone\s*access\s*point|単体アクセスポイント|独立无线接入点|獨立無線基地台|단독\s*액세스\s*포인트)/iu.test(text)
  };
}

function isWifi7MeshRouterMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = wifi7MeshRouterConstraints(text);
  if (!evidence.meshRouter || evidence.wrongProduct) return true;
  for (const field of ['speed', 'pack', 'ethernet']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const field of ['wifi7', 'triBand']) {
    if (requested[field] && !evidence[field]) return true;
  }
  return false;
}

function fdm3dPrinterConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  const volume = text.match(/\b(\d{2,3})\s*[x×]\s*(\d{2,3})\s*[x×]\s*(\d{2,3})\s*mm\b/iu);
  return {
    printer: /(?:3Dプリンター|3D\s*printer|3D打印机|3D打印機|3D\s*프린터|設計した部品.{0,12}高速.{0,12}反り.{0,12}抑え.{0,12}造形|print\s*designed\s*parts.{0,12}fast.{0,12}less\s*warping|高速打印设计零件.{0,12}减少翘曲|설계한\s*부품.{0,12}빠르고.{0,12}뒤틀림\s*적게.{0,12}출력)/iu.test(text),
    corexy: /CoreXY/iu.test(text),
    volume: volume ? `${volume[1]}x${volume[2]}x${volume[3]}` : '',
    speed: text.match(/\b(\d{2,4})\s*mm\s*\/\s*s\b/iu)?.[1] || '',
    autoLeveling: /(?:自動レベリング|auto(?:matic)?\s*(?:bed\s*)?leveling|自动调平|自動調平|자동\s*레벨링)/iu.test(text),
    enclosed: /(?:密閉(?:型|筐体)?|enclosed|封闭式|封閉式|밀폐형)/iu.test(text),
    wrongProduct: /(?:3D\s*printer\s*filament|3Dプリンター用フィラメント|3D打印耗材|3D列印線材|3D\s*프린터\s*필라멘트|replacement\s*nozzle|交換ノズル|替换喷嘴|替換噴嘴|교체용\s*노즐|filament\s*dryer|フィラメント乾燥機|耗材烘干机|線材乾燥機|필라멘트\s*건조기|UV\s*resin|光造形レジン|光敏树脂|光敏樹脂|광경화\s*레진|3D\s*printed\s*(?:model|figure)|3Dプリント完成品|3D打印成品|3D列印成品|3D\s*프린팅\s*완성품)/iu.test(text)
  };
}

function isFdm3dPrinterMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = fdm3dPrinterConstraints(text);
  if (!evidence.printer || evidence.wrongProduct) return true;
  for (const field of ['volume', 'speed']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const field of ['corexy', 'autoLeveling', 'enclosed']) {
    if (requested[field] && !evidence[field]) return true;
  }
  return false;
}

function robotLawnMowerConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  return {
    mower: /(?:ロボット芝刈り機|robot(?:ic)?\s*lawn\s*mower|割草机器人|割草機器人|로봇\s*잔디깎이|境界線.{0,12}埋めず.{0,12}広い庭.{0,12}自動で刈り.{0,12}障害物.{0,12}避け|large\s*yard.{0,12}cut\s*automatically.{0,20}without\s*burying\s*boundary\s*wire.{0,20}avoiding\s*obstacles|不埋边界线.{0,12}自动修剪大草坪.{0,12}避开障碍物|경계선.{0,12}묻지\s*않고.{0,12}넓은\s*잔디.{0,12}자동으로\s*깎고.{0,12}장애물.{0,12}피)/iu.test(text),
    rtk: /\bRTK\b/iu.test(text),
    area: text.match(/\b(\d{3,5})\s*(?:㎡|m(?:2|²)|sq\.?\s*m|平方米|平方公尺|제곱미터)/iu)?.[1] || '',
    obstacle: /(?:障害物検知|obstacle\s*(?:detection|avoidance)|障碍物检测|障礙物偵測|장애물\s*(?:감지|회피))/iu.test(text),
    wireFree: /(?:境界ワイヤー不要|boundary\s*wire\s*free|wire[\s-]*free|无需边界线|無需邊界線|경계선\s*불필요)/iu.test(text),
    wrongProduct: /(?:replacement\s*(?:blade|knife)|替刃|更换刀片|更換刀片|교체용\s*칼날|charging\s*station|充電ステーション|充电站|充電座|충전\s*스테이션|mower\s*garage|芝刈り機ガレージ|割草机车库|割草機車庫|잔디깎이\s*차고|boundary\s*(?:wire\s*(?:kit|spool|stakes)|stakes)|境界ワイヤー(?:キット|杭|ロール)|边界线套件|邊界線套件|경계선\s*(?:와이어\s*키트|말뚝)|replacement\s*battery|交換バッテリー|替换电池|替換電池|교체용\s*배터리)/iu.test(text)
  };
}

function isRobotLawnMowerMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = robotLawnMowerConstraints(text);
  if (!evidence.mower || evidence.wrongProduct) return true;
  if (requested.area && evidence.area !== requested.area) return true;
  for (const field of ['rtk', 'obstacle', 'wireFree']) {
    if (requested[field] && !evidence[field]) return true;
  }
  return false;
}

function foldingElectricBikeConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  return {
    bike: /(?:折りたたみ電動アシスト自転車|folding\s*(?:electric\s*bike|e-bike)|折叠电动自行车|折疊電動自行車|접이식\s*전기\s*자전거|車に積め.{0,12}坂道.{0,12}楽に走り.{0,12}長距離移動|fits\s*in\s*the\s*car.{0,16}climbs\s*hills\s*easily.{0,16}travels\s*far|放进汽车后备箱.{0,12}轻松爬坡.{0,12}长距离骑行|차에\s*싣고.{0,12}언덕.{0,12}쉽게\s*오르며.{0,12}장거리\s*이동)/iu.test(text),
    wheel: text.match(/\b(\d{2})\s*(?:インチ|inch(?:es)?|英寸|인치)/iu)?.[1] || '',
    motor: text.match(/\b(\d{3,4})\s*W\b/iu)?.[1] || '',
    voltage: text.match(/\b(\d{2,3})\s*V\b/iu)?.[1] || '',
    capacity: text.match(/\b(\d{1,2}(?:\.\d)?)\s*Ah\b/iu)?.[1] || '',
    range: text.match(/\b(?:航続)?(\d{2,3})\s*km\b/iu)?.[1] || '',
    wrongProduct: /(?:replacement\s*battery|交換バッテリー|替换电池|替換電池|교체용\s*배터리|e-bike\s*charger|電動自転車用充電器|电动自行车充电器|電動自行車充電器|전기\s*자전거\s*충전기|replacement\s*(?:tire|tyre)|交換タイヤ|更换轮胎|更換輪胎|교체용\s*타이어|bike\s*cover|自転車カバー|自行车罩|自行車罩|자전거\s*커버|bike\s*helmet|自転車ヘルメット|自行车头盔|自行車安全帽|자전거\s*헬멧)/iu.test(text)
  };
}

function isFoldingElectricBikeMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = foldingElectricBikeConstraints(text);
  if (!evidence.bike || evidence.wrongProduct) return true;
  for (const field of ['wheel', 'motor', 'voltage', 'capacity', 'range']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  return false;
}

function portablePowerStationConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  return {
    station: /(?:ポータブル電源|portable\s*power\s*station|便携式储能电源|便攜式儲能電源|휴대용\s*파워뱅크|停電時.{0,12}冷蔵庫.{0,12}動かし.{0,16}ソーラー.{0,12}充電|refrigerator\s*running.{0,16}outages.{0,20}recharge\s*by\s*solar|停电时.{0,12}带动冰箱.{0,16}太阳能充电|정전\s*때.{0,12}냉장고.{0,12}돌리고.{0,16}태양광.{0,12}충전)/iu.test(text),
    lifepo4: /(?:LiFePO4|リン酸鉄|磷酸铁|磷酸鐵|리튬인산철)/iu.test(text),
    capacity: text.match(/\b(\d{3,5})\s*Wh\b/iu)?.[1] || '',
    output: text.match(/(?:定格出力|rated\s*output|额定功率|額定功率|정격\s*출력)\s*(\d{3,5})\s*W\b/iu)?.[1] || '',
    ups: /\bUPS\b/iu.test(text),
    solar: text.match(/(?:ソーラー入力|solar\s*input|太阳能输入|太陽能輸入|태양광\s*입력)\s*(\d{2,4})\s*W\b/iu)?.[1] || '',
    wrongProduct: /(?:solar\s*panel|ソーラーパネル|太阳能板|太陽能板|태양광\s*패널|expansion\s*battery|拡張バッテリー|扩展电池|擴充電池|확장\s*배터리|charging\s*cable|充電ケーブル|充电线|充電線|충전\s*케이블|carrying\s*case|収納ケース|收纳包|收納包|보관\s*케이스|car\s*inverter|車載インバーター|车载逆变器|車用逆變器|차량용\s*인버터)/iu.test(text)
  };
}

function isPortablePowerStationMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = portablePowerStationConstraints(text);
  if (!evidence.station || evidence.wrongProduct) return true;
  for (const field of ['capacity', 'output', 'solar']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const field of ['lifepo4', 'ups']) {
    if (requested[field] && !evidence[field]) return true;
  }
  return false;
}

function compressorDehumidifierConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  const dailyMatches = [...text.matchAll(/\b(\d{1,2}(?:\.\d)?)\s*L\s*(?:\/\s*(?:日|day)|per\s*day|每天|每日|\/\s*일)/giu)];
  const daily = dailyMatches.filter((match) => {
    const before = text.slice(Math.max(0, match.index - 12), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 12);
    return !/(?:not|不要)\s*$/iu.test(before)
      && !/^\s*(?:ではなく|じゃなく|말고|아니고|아닌|而不是)/iu.test(after);
  }).at(-1)?.[1] || '';
  return {
    dehumidifier: /(?:除湿機|dehumidifier|除湿机|除濕機|제습기|部屋干し.{0,12}(?:早く|速く).{0,8}乾|dry\s*laundry\s*indoors?.{0,12}faster|室内晾衣.{0,8}(?:更快干|快速干)|실내\s*빨래.{0,12}빨리\s*말리)/iu.test(text),
    compressor: /(?:コンプレッサー式|compressor|压缩机式|壓縮機式|컴프레서식)/iu.test(text),
    daily,
    tank: text.match(/(?:タンク|tank|水箱|물통)\s*(\d(?:\.\d)?)\s*L\b/iu)?.[1] || '',
    laundry: /(?:衣類乾燥|部屋干し.{0,16}乾|laundry\s*drying|dry\s*laundry\s*indoors?|衣物干燥|衣物乾燥|室内晾衣.{0,12}干|의류\s*건조|실내\s*빨래.{0,16}말리)/iu.test(text),
    drainage: /(?:連続排水|continuous\s*drain(?:age)?|连续排水|連續排水|연속\s*배수)/iu.test(text),
    wrongProduct: /(?:\bhumidifier\b|加湿器|加湿机|加濕器|가습기|air\s*purifier|空気清浄機|空气净化器|空氣清淨機|공기청정기|replacement\s*filter|交換フィルター|更换滤网|更換濾網|교체용\s*필터|drain\s*hose|排水ホース|排水管|배수\s*호스|moisture\s*absorber|除湿剤|除湿盒|除濕盒|제습제)/iu.test(text)
  };
}

function isCompressorDehumidifierMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = compressorDehumidifierConstraints(text);
  if (!evidence.dehumidifier || evidence.wrongProduct) return true;
  for (const field of ['daily', 'tank']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const field of ['compressor', 'laundry', 'drainage']) {
    if (requested[field] && !evidence[field]) return true;
  }
  return false;
}

function electricStandingDeskConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  const sizeMatches = [...text.matchAll(/\b(\d{2,3})\s*[x×]\s*(\d{2,3})\s*cm\b/giu)];
  const size = sizeMatches.filter((match) => {
    const before = text.slice(Math.max(0, match.index - 12), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 12);
    return !/(?:not|不要)\s*$/iu.test(before)
      && !/^\s*(?:ではなく|じゃなく|말고|아니고|아닌|而不是)/iu.test(after);
  }).at(-1);
  return {
    desk: /(?:電動昇降デスク|electric\s*(?:height\s*adjustable\s*|standing\s*)desk|电动升降桌|電動升降桌|전동\s*스탠딩\s*데스크|座りっぱなし.{0,16}(?:減ら|避け).{0,16}立って.{0,12}仕事|alternate.{0,12}sitting.{0,12}standing.{0,20}(?:work|working)|工作时.{0,12}坐站交替|工作時.{0,12}坐站交替|일할\s*때.{0,12}앉았다.{0,8}서서.{0,12}일)/iu.test(text),
    size: size ? `${size[1]}x${size[2]}` : '',
    dualMotor: /(?:デュアルモーター|dual[\s-]*motor|双电机|雙馬達|듀얼\s*모터)/iu.test(text),
    memory: text.match(/\b(\d)\s*(?:メモリ|memory\s*preset(?:s)?|档记忆|檔記憶|메모리)/iu)?.[1] || '',
    antiCollision: /(?:衝突防止|anti[\s-]*collision|防碰撞|충돌\s*방지)/iu.test(text),
    wrongProduct: /(?:desk\s*frame\s*only|脚フレーム単体|升降桌架|升降桌腳架|책상\s*프레임\s*단품|tabletop\s*only|天板単体|桌面板|桌板單品|상판\s*단품|desk\s*mat|デスクマット|桌垫|桌墊|데스크\s*매트|cable\s*tray|配線トレー|理线架|理線架|케이블\s*트레이|replacement\s*controller|交換コントローラー|替换控制器|替換控制器|교체용\s*컨트롤러)/iu.test(text)
  };
}

function isElectricStandingDeskMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = electricStandingDeskConstraints(text);
  if (!evidence.desk || evidence.wrongProduct) return true;
  for (const field of ['size', 'memory']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const field of ['dualMotor', 'antiCollision']) {
    if (requested[field] && !evidence[field]) return true;
  }
  return false;
}

function ergonomicOfficeChairConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  const loadMatches = [...text.matchAll(/(?:(?:耐荷重|weight\s*capacity|承重|하중)\s*(?:(?:not|不要)\s*)?|(?:ではなく|じゃなく|but|要|말고)\s*)(\d{2,3})\s*kg\b/giu)];
  return {
    chair: /(?:エルゴノミクスオフィスチェア|ergonomic\s*office\s*chair|人体工学办公椅|人體工學辦公椅|인체공학\s*사무용\s*의자|長時間座って.{0,12}腰.{0,8}首.{0,12}つらくならず.{0,16}肘位置.{0,12}細かく|back.{0,8}neck\s*comfortable.{0,16}long\s*sitting.{0,20}precisely\s*adjustable\s*arms|长时间坐着.{0,12}腰.{0,8}脖子.{0,12}舒服.{0,16}精细调节扶手|오래\s*앉아도.{0,12}허리.{0,8}목.{0,12}편하고.{0,16}팔걸이\s*위치.{0,12}세밀하게)/iu.test(text),
    headrest: /(?:ヘッドレスト|headrest|头枕|頭枕|헤드레스트)/iu.test(text),
    lumbar: /(?:腰サポート|lumbar\s*support|腰部支撑|腰部支撐|요추\s*지지)/iu.test(text),
    armrests: text.match(/\b(\d)D\s*(?:肘掛け|armrests?|扶手|팔걸이)/iu)?.[1] || '',
    mesh: /(?:メッシュ|mesh|网布|網布|메쉬)/iu.test(text),
    load: loadMatches.at(-1)?.[1] || '',
    wrongProduct: /(?:chair\s*cover|椅子カバー|椅套|의자\s*커버|replacement\s*casters?|交換キャスター|替换脚轮|替換腳輪|교체용\s*캐스터|gas\s*cylinder|ガスシリンダー|气压杆|氣壓桿|가스\s*실린더|seat\s*cushion|座布団|坐垫|坐墊|방석|replacement\s*armrests?|交換肘掛け|替换扶手|替換扶手|교체용\s*팔걸이)/iu.test(text)
  };
}

function isErgonomicOfficeChairMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = ergonomicOfficeChairConstraints(text);
  if (!evidence.chair || evidence.wrongProduct) return true;
  for (const field of ['armrests', 'load']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const field of ['headrest', 'lumbar', 'mesh']) {
    if (requested[field] && !evidence[field]) return true;
  }
  return false;
}

function retrofitSmartLockConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  return {
    lock: /(?:後付けスマートロック|retrofit\s*smart\s*lock|后装智能门锁|後裝智能門鎖|설치형\s*스마트\s*도어락|鍵を交換せず.{0,20}(?:玄関|ドア).{0,20}(?:指紋|暗証番号)|unlock.{0,16}door.{0,20}fingerprint.{0,16}keypad.{0,32}without\s*replacing.{0,8}lock|不换门锁.{0,20}指纹.{0,12}密码.{0,12}开门|자물쇠\s*교체\s*없이.{0,20}지문.{0,12}비밀번호.{0,16}문\s*열)/iu.test(text),
    fingerprint: /(?:指紋|fingerprint|指纹|지문)/iu.test(text),
    keypad: /(?:暗証番号|keypad|密码|密碼|비밀번호)/iu.test(text),
    matter: /\bMatter\b/iu.test(text),
    autoLock: /(?:オートロック|auto[\s-]*lock|自动上锁|自動上鎖|자동\s*잠금)/iu.test(text),
    emergencyKey: /(?:非常用キー|emergency\s*key|应急钥匙|緊急鑰匙|비상\s*키)/iu.test(text),
    wrongProduct: /(?:video\s*doorbell|ビデオドアベル|可视门铃|視訊門鈴|비디오\s*도어벨|keypad\s*only|キーパッド単体|密码键盘单品|密碼鍵盤單品|키패드\s*단품|smart\s*lock\s*(?:bridge|hub)|通信ブリッジ|智能锁网关|智慧鎖網關|스마트락\s*브리지|replacement\s*batter(?:y|ies)|交換電池|替换电池|替換電池|교체용\s*배터리|lock\s*cylinder|錠前シリンダー|锁芯|鎖芯|도어락\s*실린더)/iu.test(text)
  };
}

function isRetrofitSmartLockMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = retrofitSmartLockConstraints(text);
  if (!evidence.lock || evidence.wrongProduct) return true;
  for (const field of ['fingerprint', 'keypad', 'matter', 'autoLock', 'emergencyKey']) {
    if (requested[field] && !evidence[field]) return true;
  }
  return false;
}

function pressureIhRiceCookerConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  const capacityMatches = [...text.matchAll(/\b(\d(?:\.\d)?)\s*(?:合|go\b)/giu)];
  const capacity = capacityMatches.filter((match) => {
    const before = text.slice(Math.max(0, match.index - 12), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 12);
    return !/(?:not|不要)\s*$/iu.test(before)
      && !/^\s*(?:ではなく|じゃなく|말고|아니고|아닌|而不是)/iu.test(after);
  }).at(-1)?.[1] || '';
  return {
    cooker: /(?:圧力\s*IH\s*炊飯器|pressure\s*(?:IH|induction)\s*rice\s*cooker|压力\s*IH\s*电饭煲|壓力\s*IH\s*電子鍋|압력\s*IH\s*밥솥|圧力.{0,8}IH.{0,20}\d(?:\.\d)?\s*合.{0,12}炊|cooks?.{0,16}\d(?:\.\d)?\s*go\s*rice.{0,24}pressure\s*induction|压力\s*IH.{0,16}\d(?:\.\d)?\s*合.{0,8}(?:米饭|米飯)|압력\s*IH.{0,16}\d(?:\.\d)?\s*合.{0,8}밥\s*짓)/iu.test(text),
    capacity,
    steamCut: /(?:蒸気(?:カット|セーブ|低減|.{0,4}抑)|steam[\s-]*(?:cut|reduction|save)|蒸汽(?:减少|减量)|蒸氣(?:減少|減量)|증기\s*(?:절감|감소))/iu.test(text),
    keepWarm: text.match(/(?:保温|keep[\s-]*warm|保溫|보온)\s*(\d{1,2})\s*(?:時間|hours?|小时|小時|시간)/iu)?.[1] || '',
    wrongProduct: /(?:内釜|inner\s*pot|内胆|內鍋|내솥|交換(?:用)?ふた|replacement\s*lid|替换盖|替換蓋|교체\s*뚜껑|パッキン|gasket|密封圈|패킹|保温専用|rice\s*warmer|保温锅|保溫鍋|보온\s*전용)/iu.test(text)
  };
}

function isPressureIhRiceCookerMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = pressureIhRiceCookerConstraints(text);
  if (!evidence.cooker || evidence.wrongProduct) return true;
  for (const field of ['capacity', 'keepWarm']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  if (requested.steamCut && !evidence.steamCut) return true;
  return false;
}

function dualDashCamConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  const resolutionMatches = [...text.matchAll(/\b([248])\s*K\b/giu)];
  const resolution = resolutionMatches.filter((match) => {
    const before = text.slice(Math.max(0, match.index - 12), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 12);
    return !/(?:not|不要)\s*$/iu.test(before)
      && !/^\s*(?:ではなく|じゃなく|말고|아니고|아닌|而不是)/iu.test(after);
  }).at(-1)?.[1] || '';
  return {
    dashCam: /(?:ドライブレコーダー|dash[\s-]*cam(?:era)?|行车记录仪|行車記錄器|블랙박스|(?:あおり|煽り)運転.{0,24}前.{0,12}後ろ.{0,16}録画|records?.{0,16}(?:both\s*)?front.{0,12}(?:and|&).{0,12}rear.{0,24}(?:road|driving|incident|accident)|(?:防碰瓷|事故取证).{0,20}前后.{0,12}(?:录像|錄像)|(?:사고|보복운전).{0,16}대비.{0,20}전후방.{0,16}녹화)/iu.test(text),
    dual: /(?:前後\s*2\s*カメラ|前.{0,8}後ろ.{0,12}録画|front\s*(?:and|&)\s*rear|records?.{0,16}(?:both\s*)?front.{0,12}(?:and|&).{0,12}rear|dual[\s-]*camera|前后双摄|前后.{0,8}(?:录像|錄像)|前後雙鏡|전후방\s*2?\s*채널|전후방.{0,12}녹화)/iu.test(text),
    resolution,
    parking: /(?:駐車(?:中も?)?監視|parking\s*(?:monitoring|mode)|停车监控|停車監控|주차\s*감시)/iu.test(text),
    gps: /\bGPS\b/iu.test(text),
    wifi: /\bWi[\s-]*Fi\b/iu.test(text),
    wrongProduct: /(?:micro\s*SD|SDカード|存储卡|記憶卡|메모리\s*카드|hardwire\s*kit|電源(?:直結)?ケーブル|降压线|降壓線|상시\s*전원\s*케이블|rear\s*camera\s*only|後方カメラ単体|后摄像头单独|後鏡頭單獨|후방\s*카메라\s*단품|mount(?:ing)?\s*(?:bracket)?|取付マウント|安装支架|安裝支架|장착\s*브래킷)/iu.test(text)
  };
}

function isDualDashCamMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = dualDashCamConstraints(text);
  if (!evidence.dashCam || evidence.wrongProduct) return true;
  if (requested.resolution && evidence.resolution !== requested.resolution) return true;
  for (const field of ['dual', 'parking', 'gps', 'wifi']) {
    if (requested[field] && !evidence[field]) return true;
  }
  return false;
}

function cameraPetFeederConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  const capacityMatches = [...text.matchAll(/\b(\d(?:\.\d)?)\s*L\b/giu)];
  const capacity = capacityMatches.filter((match) => {
    const before = text.slice(Math.max(0, match.index - 12), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 12);
    return !/(?:not|不要)\s*$/iu.test(before)
      && !/^\s*(?:ではなく|じゃなく|말고|아니고|아닌|而不是)/iu.test(after);
  }).at(-1)?.[1] || '';
  const cameraPresent = /(?:カメラ|camera|摄像头|鏡頭|카메라)/iu.test(text);
  const cameraMatches = [...text.matchAll(/\b(1080p|2K)\b/giu)];
  const cameraMatch = cameraMatches.filter((match) => {
    const before = text.slice(Math.max(0, match.index - 12), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 20);
    return !/(?:not|不要)\s*$/iu.test(before)
      && !/^\s*(?:(?:カメラ|camera|摄像头|鏡頭|카메라)\s*)?(?:ではなく|じゃなく|말고|아니고|아닌|而不是)/iu.test(after);
  }).at(-1);
  const camera = cameraPresent && cameraMatch
    ? (cameraMatch[1].toLowerCase() === '1080p' ? '1080p' : '2K') : '';
  return {
    feeder: /(?:ペット(?:用)?自動給餌器|自動給餌器|automatic\s*(?:pet\s*)?feeder|自动喂食器|自動餵食器|자동\s*급식기|留守中.{0,20}(?:猫|犬|ペット).{0,20}(?:自動.{0,8}(?:ご飯|餌)|(?:ご飯|餌).{0,8}自動)|留守中.{0,12}(?:猫|犬|ペット).{0,24}(?:決まった時間|時間を決め).{0,16}(?:ごはん|ご飯|餌).{0,24}(?:映像|見ながら).{0,16}話しかけ|feeds?.{0,12}(?:cat|dog|pet).{0,20}automatically.{0,24}(?:away|not\s*home)|schedule\s*meals?.{0,24}(?:see|watch).{0,12}(?:and\s*)?talk.{0,16}(?:cat|dog|pet).{0,20}away|出门时.{0,20}自动.{0,8}(?:给)?(?:猫|狗|宠物)喂食|出门时.{0,16}定时.{0,8}(?:给)?(?:猫|狗|宠物)喂食.{0,24}看着.{0,16}说话|外出時.{0,20}自動.{0,8}(?:給)?(?:貓|狗|寵物)餵食|집을\s*비울\s*때.{0,20}(?:고양이|강아지|반려동물).{0,20}자동으로.{0,8}밥|외출\s*중.{0,12}(?:고양이|강아지|반려동물).{0,20}정해진\s*시간.{0,16}밥.{0,20}보며.{0,12}말하고)/iu.test(text),
    capacity,
    camera,
    wifi: /\bWi[\s-]*Fi\b/iu.test(text),
    twoWayAudio: /(?:双方向音声|two[\s-]*way\s*audio|双向语音|雙向語音|양방향\s*음성)/iu.test(text),
    wrongProduct: /(?:給餌(?:用)?皿|pet\s*(?:food\s*)?bowl|宠物食盆|寵物食碗|반려동물\s*식기|乾燥剤|desiccant|干燥剂|乾燥劑|건조제|replacement\s*(?:power\s*)?(?:cable|adapter)|交換用電源(?:ケーブル|アダプター)|替换电源|替換電源|교체용\s*전원|pet\s*camera\s*only|見守りカメラ単体|宠物摄像头单独|寵物攝影機單獨|펫캠\s*단품|water\s*fountain|自動給水器|宠物饮水机|寵物飲水機|자동\s*급수기)/iu.test(text)
  };
}

function isCameraPetFeederMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = cameraPetFeederConstraints(text);
  if (!evidence.feeder || evidence.wrongProduct) return true;
  if (requested.capacity && evidence.capacity !== requested.capacity) return true;
  if (requested.camera && evidence.camera !== requested.camera) return true;
  for (const field of ['wifi', 'twoWayAudio']) {
    if (requested[field] && !evidence[field]) return true;
  }
  return false;
}

function iplHairRemovalConstraints(value) {
  const text = String(value || '').normalize('NFKC');
  const flashMatches = [...text.matchAll(/(\d{1,3})\s*(?:万\s*(?:回|発|发|次)?|만\s*회)|\b(\d{5,7})\s*flashes?\b/giu)];
  const flashMatch = flashMatches.filter((match) => {
    const before = text.slice(Math.max(0, match.index - 12), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 12);
    return !/(?:not|不要)\s*$/iu.test(before)
      && !/^\s*(?:ではなく|じゃなく|말고|아니고|아닌|而不是)/iu.test(after);
  }).at(-1);
  const levelMatches = [...text.matchAll(/(\d{1,2})\s*(?:段階|levels?|档|檔|단계)/giu)];
  const levels = levelMatches.filter((match) => {
    const before = text.slice(Math.max(0, match.index - 12), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 12);
    return !/(?:not|不要)\s*$/iu.test(before)
      && !/^\s*(?:ではなく|じゃなく|말고|아니고|아닌|而不是)/iu.test(after);
  }).at(-1)?.[1] || '';
  return {
    device: /(?:IPL\s*光美容器|IPL\s*(?:hair\s*removal\s*)?device|IPL\s*脱毛仪|IPL\s*脫毛儀|IPL\s*제모기|(?:家|自宅).{0,16}(?:ムダ毛|脱毛).{0,12}(?:ケア|処理)|サロン.{0,12}(?:ムダ毛|脱毛).{0,20}(?:家|自宅).{0,12}(?:ケア|処理)|(?:remove|reduce).{0,12}(?:body\s*)?hair.{0,16}(?:at\s*home|home)|at\s*home.{0,40}(?:remov|reduc).{0,12}(?:body\s*)?hair|在家.{0,12}(?:脱毛|除毛)|美容院.{0,20}(?:脱毛|除毛).{0,16}在家|집에서.{0,12}(?:제모|털\s*제거)|살롱.{0,20}(?:제모|털\s*제거).{0,16}집에서)/iu.test(text),
    flashes: flashMatch?.[1] ? String(Number(flashMatch[1]) * 10000) : flashMatch?.[2] || '',
    cooling: /(?:冷却(?:機能)?|冷やし|cool(?:ing|\s*my\s*skin)|冰感冷却|冷感|냉각)/iu.test(text),
    levels,
    skinSensor: /(?:肌色センサー|skin[\s-]*tone\s*sensor|肤色传感器|膚色感測器|피부톤\s*센서)/iu.test(text),
    wrongProduct: /(?:保護メガネ|protective\s*(?:glasses|goggles)|防护眼镜|防護眼鏡|보호\s*안경|交換(?:用)?(?:カートリッジ|ヘッド)|replacement\s*(?:cartridge|head)|替换(?:灯头|头)|替換(?:燈頭|頭)|교체용\s*(?:카트리지|헤드)|電気シェーバー|electric\s*shaver|电动剃须刀|電動刮鬍刀|전기\s*면도기|脱毛ワックス|hair\s*removal\s*wax|脱毛蜡|脫毛蠟|제모\s*왁스)/iu.test(text)
  };
}

function isIplHairRemovalMismatch(candidate, requested) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC');
  const evidence = iplHairRemovalConstraints(text);
  if (!evidence.device || evidence.wrongProduct) return true;
  for (const field of ['flashes', 'levels']) {
    if (requested[field] && evidence[field] !== requested[field]) return true;
  }
  for (const field of ['cooling', 'skinSensor']) {
    if (requested[field] && !evidence[field]) return true;
  }
  return false;
}

function rejectsLightUpPhoneCase(query) {
  return /(?:(?:光る|発光|ピカピカ|ライトアップ).{0,32}(?:ケース|カバー).{0,10}(?:じゃなく|ではなく)|not\s+(?:a\s+|an\s+|the\s+)?(?:glow(?:ing)?|light[- ]?up|luminous).{0,32}(?:case|cover)|(?:不要|不是|不想要)(?:(?![,，]\s*(?:要|改)).){0,24}(?:发光|發光|会亮|會亮).{0,24}(?:手机壳|手機殼)|(?:빛나는|발광|불빛\s*나는).{0,32}(?:케이스|커버).{0,10}(?:말고|아닌|아니고))/iu
    .test(String(query || '').normalize('NFKC'));
}

function isDeviceSpecificPhoneCaseMismatch(candidate, query) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC')
    .toLowerCase();
  const category = inferCandidateCategory(candidate);
  const hasDeviceCaseEvidence = phoneCaseDeviceModel(text)
    && /(?:ケース|カバー|case|cover|手机壳|手機殼|保护壳|保護殼|케이스|커버)/iu.test(text);
  if (category !== 'phone-case' && !hasDeviceCaseEvidence) return true;
  const requestedDevice = phoneCaseDeviceModel(query);
  if (requestedDevice && phoneCaseDeviceModel(text) !== requestedDevice) return true;
  const normalizedQuery = String(query || '').normalize('NFKC');
  const magneticMatches = [...normalizedQuery.matchAll(/(?:magsafe|マグセーフ|磁気吸着|磁吸|맥세이프|자석)/giu)];
  const wantsMagSafe = magneticMatches.some((match) =>
    !isNegatedPowerBankRequirement(normalizedQuery, match.index, match.index + match[0].length));
  if (wantsMagSafe && !/(?:magsafe|マグセーフ|磁気吸着|磁吸|맥세이프|자석)/iu.test(text)) return true;
  if (/(?:透明|\bclear\b|transparent|투명)/iu.test(normalizedQuery)
    && !/(?:透明|\bclear\b|transparent|투명)/iu.test(text)) return true;
  if (rejectsLightUpPhoneCase(normalizedQuery)
    && /(?:光る|発光|ライトアップ|\bled\b|light[- ]?up|glow(?:ing)?|luminous|发光|發光|빛나는|발광|불빛)/iu.test(text)) return true;
  return false;
}

function isLightUpPhoneCaseMismatch(candidate, query) {
  if (isDeviceSpecificPhoneCaseMismatch(candidate, query)) return true;
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC')
    .toLowerCase();
  const hasLightUpEvidence = /(?:光る|発光|ライトアップ|\bled\b|light[- ]?up|glow(?:ing)?|luminous|发光|發光|灯光|燈光|亮灯|亮燈|빛나는|발광|불빛)/iu.test(text);
  if (!hasLightUpEvidence) return true;
  const normalizedQuery = String(query || '').normalize('NFKC');
  const correctedRechargeable = /(?:(?:nfc|電池不要|電源不要).{0,32}(?:ではなく|じゃなく).{0,20}(?:usb[- ]?)?充電式|not\s+.{0,40}(?:battery[- ]?free|\bnfc\b).{0,40}(?:but|instead).{0,24}(?:usb[- ]?)?rechargeable|不要.{0,24}(?:nfc|免电池|免電池|无需电池|無需電池).{0,28}(?:要|改要).{0,20}(?:usb[- ]?)?充[电電]式|(?:nfc|배터리\s*없는|전원\s*불필요).{0,32}(?:말고|아닌|아니고).{0,20}(?:usb[- ]?)?충전식)/iu.test(normalizedQuery);
  const wantsNfc = !correctedRechargeable && /\bnfc\b/iu.test(normalizedQuery);
  const wantsBatteryFree = !correctedRechargeable
    && /(?:電池(?:不要|いらない)|電源不要|battery[- ]?free|no\s+batter(?:y|ies)(?:\s+required)?|无需电池|無需電池|不用(?:装|裝)?电池|不用(?:装|裝)?電池|배터리\s*(?:없는|불필요|필요\s*없는)|전원\s*불필요)/iu.test(normalizedQuery);
  if (correctedRechargeable
    && !/(?:usb[- ]?.{0,8}充電式|usb[- ]?.{0,8}rechargeable|usb[- ]?.{0,8}充[电電]式|usb[- ]?.{0,8}충전식|充電式|rechargeable|充[电電]式|충전식)/iu.test(text)) return true;
  if (wantsNfc && !/\bnfc\b/iu.test(text)) return true;
  if (wantsBatteryFree
    && !/(?:電池(?:不要|いらない)|電源不要|battery[- ]?free|no\s+batter(?:y|ies)(?:\s+required)?|无需电池|無需電池|不用(?:装|裝)?电池|不用(?:装|裝)?電池|배터리\s*(?:없는|불필요|필요\s*없는)|전원\s*불필요)/iu.test(text)) return true;
  if (/(?:リングライト|ring\s*light|补光灯|補光燈|링\s*라이트|スマホスタンド|phone\s*stand|手机支架|手機支架|스마트폰\s*거치대|ケース用.{0,12}(?:発光|LED|ライト)(?:パーツ|部品|モジュール)|(?:phone|mobile)\s*case.{0,12}(?:light\s*insert|LED\s*module)|手机壳用.{0,12}(?:发光配件|LED模块)|手機殼用.{0,12}(?:發光配件|LED模組)|케이스용.{0,12}(?:발광\s*부품|LED\s*모듈))/iu.test(text)) return true;
  return false;
}

function isNegatedPowerBankRequirement(text, start, end) {
  const before = String(text || '').slice(Math.max(0, start - 24), start);
  const after = String(text || '').slice(end, end + 18);
  return /(?:not\s+(?:a\s+|an\s+|the\s+)?|no\s+|without\s+(?:(?:a|an|the)\s+)?|anything\s+but\s+|不要\s*|不是\s*|不想要\s*)$/iu.test(before)
    || /^\s*(?:以外|ではなく|じゃなく|ではない|じゃない|でない|なし|を除く|を避ける|而不是|除外|말고|아닌|아니고|제외)/iu.test(after);
}

function isPowerBankMismatch(candidate, query) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC').toLowerCase();
  if (!/(?:モバイルバッテリー|携帯バッテリー|power\s*bank|portable\s+battery|battery\s*pack|充电宝|充電寶|移动电源|行動電源|보조\s*배터리)/iu.test(text)) return true;
  const normalizedQuery = String(query || '').normalize('NFKC');
  const capacityMatches = [...normalizedQuery.matchAll(/(\d{4,6})\s*m\s*ah/giu)];
  const positiveCapacityMatches = capacityMatches
    .filter((match) => !isNegatedPowerBankRequirement(normalizedQuery, match.index, match.index + match[0].length));
  const capacity = positiveCapacityMatches[0]?.[1];
  const secondCapacity = positiveCapacityMatches[1]?.[1];
  const spokenCapacityRange = normalizedQuery.match(/(?:between\s+)?(\d{4,6})\s*(?:m\s*ah\s*)?(?:から|〜|~|-|to|and|到|至|에서)\s*(\d{4,6})\s*m\s*ah/iu);
  const minimumCapacityMatch = normalizedQuery.match(/(?:(?:at\s+least|minimum(?:\s+of)?|至少|不少于)\s*(\d{4,6})\s*m\s*ah|(\d{4,6})\s*m\s*ah\s*(?:以上|or\s+more|and\s+up|이상))/iu);
  const maximumCapacityMatch = normalizedQuery.match(/(?:(?:at\s+most|maximum(?:\s+of)?|up\s+to|不超过|最多)\s*(\d{4,6})\s*m\s*ah|(\d{4,6})\s*m\s*ah\s*(?:以下|or\s+less|or\s+under|이하))/iu);
  const minimumCapacityValue = minimumCapacityMatch?.[1] || minimumCapacityMatch?.[2] || '';
  const maximumCapacityValue = maximumCapacityMatch?.[1] || maximumCapacityMatch?.[2] || '';
  const boundedCapacityRange = Boolean(minimumCapacityValue && maximumCapacityValue);
  const rangeStart = spokenCapacityRange?.[1] || (boundedCapacityRange ? minimumCapacityValue : capacity);
  const rangeEnd = spokenCapacityRange?.[2] || (boundedCapacityRange ? maximumCapacityValue : secondCapacity);
  const capacityRange = Boolean(spokenCapacityRange || boundedCapacityRange || (capacity && secondCapacity
    && new RegExp(`${capacity}\\s*m\\s*ah\\s*(?:から|〜|~|-|to|and|到|至|에서)\\s*${secondCapacity}\\s*m\\s*ah`, 'iu').test(normalizedQuery)));
  const minimumCapacity = Boolean(minimumCapacityValue);
  const maximumCapacity = Boolean(maximumCapacityValue);
  const candidateCapacity = text.match(/(?:^|\D)(\d{4,6})\s*m\s*ah(?:\D|$)/iu)?.[1];
  const rangeMinimum = capacityRange
    ? boundedCapacityRange ? Number(minimumCapacityValue) : Math.min(Number(rangeStart), Number(rangeEnd)) : 0;
  const rangeMaximum = capacityRange
    ? boundedCapacityRange ? Number(maximumCapacityValue) : Math.max(Number(rangeStart), Number(rangeEnd)) : 0;
  if (capacityRange && (!candidateCapacity
    || Number(candidateCapacity) < rangeMinimum || Number(candidateCapacity) > rangeMaximum)) return true;
  if (!capacityRange && minimumCapacity && (!candidateCapacity || Number(candidateCapacity) < Number(minimumCapacityValue))) return true;
  if (!capacityRange && maximumCapacity && (!candidateCapacity || Number(candidateCapacity) > Number(maximumCapacityValue))) return true;
  if (capacity && !capacityRange && !minimumCapacity && !maximumCapacity
    && !new RegExp(`(?:^|\\D)${capacity}\\s*m\\s*ah(?:\\D|$)`, 'iu').test(text)) return true;
  const rejectedCapacities = capacityMatches
    .filter((match) => isNegatedPowerBankRequirement(normalizedQuery, match.index, match.index + match[0].length))
    .map((match) => match[1]);
  if (rejectedCapacities.some((value) =>
    new RegExp(`(?:^|\\D)${value}\\s*m\\s*ah(?:\\D|$)`, 'iu').test(text))) return true;
  const builtInMatches = [...normalizedQuery.matchAll(/(?:ケーブル(?:内蔵|一体型|付き)|built[- ]?in\s+(?:usb[- ]?c|lightning)?\s*cable|integrated\s+cable|自带(?:(?:USB[- ]?C|Lightning)?线)|自帶(?:(?:USB[- ]?C|Lightning)?線)|케이블\s*(?:내장|일체형))/giu)];
  const builtIn = builtInMatches.some((match) =>
    !isNegatedPowerBankRequirement(normalizedQuery, match.index, match.index + match[0].length));
  const rejectsBuiltIn = builtInMatches.some((match) =>
    isNegatedPowerBankRequirement(normalizedQuery, match.index, match.index + match[0].length));
  const candidateHasBuiltIn = /(?:ケーブル(?:内蔵|一体型|付き)|built[- ]?in\s+(?:usb[- ]?c|lightning)?\s*cable|integrated\s+cable|自带(?:(?:USB[- ]?C|Lightning)?线)|自帶(?:(?:USB[- ]?C|Lightning)?線)|케이블\s*(?:내장|일체형))/iu.test(text);
  if (builtIn && !candidateHasBuiltIn) return true;
  if (!builtIn && rejectsBuiltIn && candidateHasBuiltIn) return true;
  const connector = [...normalizedQuery.matchAll(/(?:usb[- ]?c|type[- ]?c|lightning|ライトニング|闪电|閃電|라이트닝)/giu)]
    .find((match) => !isNegatedPowerBankRequirement(normalizedQuery, match.index, match.index + match[0].length))?.[0] || '';
  if (builtIn && /(?:usb[- ]?c|type[- ]?c)/iu.test(connector) && !/(?:usb[- ]?c|type[- ]?c)/iu.test(text)) return true;
  if (builtIn && /(?:lightning|ライトニング|闪电|閃電|라이트닝)/iu.test(connector)
    && !/(?:lightning|ライトニング|闪电|閃電|라이트닝)/iu.test(text)) return true;
  const magneticMatches = [...normalizedQuery.matchAll(/(?:magsafe|マグセーフ|磁気吸着|磁吸|맥세이프|자석)/giu)];
  const wantsMagnetic = magneticMatches.some((match) =>
    !isNegatedPowerBankRequirement(normalizedQuery, match.index, match.index + match[0].length));
  const rejectsMagnetic = magneticMatches.some((match) =>
    isNegatedPowerBankRequirement(normalizedQuery, match.index, match.index + match[0].length));
  const candidateIsMagnetic = /(?:magsafe|マグセーフ|磁気吸着|磁吸|맥세이프|자석)/iu.test(text);
  if (wantsMagnetic && !candidateIsMagnetic) return true;
  if (!wantsMagnetic && rejectsMagnetic && candidateIsMagnetic) return true;
  const pdMatches = [...normalizedQuery.matchAll(/(?:\bpd\s*(\d{1,3})\s*w\b|\b(\d{1,3})\s*w(?:\s*(?:usb[- ]?c|type[- ]?c))?\s*pd\b)/giu)];
  const pdWatts = pdMatches
    .find((match) => !isNegatedPowerBankRequirement(normalizedQuery, match.index, match.index + match[0].length));
  const pdOutputRangeMatch = normalizedQuery.match(/(?:between\s+)?(?:pd\s*)?(\d{1,3})\s*w\s*(?:から|〜|~|-|to|and|到|至|에서)\s*(?:pd\s*)?(\d{1,3})\s*w(?:\s*pd)?/iu);
  const spokenPdOutputRange = Boolean(pdOutputRangeMatch && /pd/iu.test(pdOutputRangeMatch[0]));
  const minimumPdOutputMatch = normalizedQuery.match(/(?:(?:at\s+least|minimum(?:\s+of)?|至少|不少于)\s*(?:pd\s*)?(\d{1,3})\s*w(?:\s*pd)?|(?:pd\s*)?(\d{1,3})\s*w(?:\s*pd)?\s*(?:以上|or\s+more|and\s+up|이상))/iu);
  const maximumPdOutputMatch = normalizedQuery.match(/(?:(?:at\s+most|maximum(?:\s+of)?|up\s+to|不超过|最多)\s*(?:pd\s*)?(\d{1,3})\s*w(?:\s*pd)?|(?:pd\s*)?(\d{1,3})\s*w(?:\s*pd)?\s*(?:以下|or\s+less|or\s+under|이하))/iu);
  const minimumPdOutputValue = minimumPdOutputMatch?.[1] || minimumPdOutputMatch?.[2] || '';
  const maximumPdOutputValue = maximumPdOutputMatch?.[1] || maximumPdOutputMatch?.[2] || '';
  const boundedPdOutputRange = Boolean(minimumPdOutputValue && maximumPdOutputValue);
  const pdOutputRange = Boolean(spokenPdOutputRange || boundedPdOutputRange);
  const pdRangeMinimum = spokenPdOutputRange
    ? Math.min(Number(pdOutputRangeMatch[1]), Number(pdOutputRangeMatch[2]))
    : boundedPdOutputRange ? Number(minimumPdOutputValue) : 0;
  const pdRangeMaximum = spokenPdOutputRange
    ? Math.max(Number(pdOutputRangeMatch[1]), Number(pdOutputRangeMatch[2]))
    : boundedPdOutputRange ? Number(maximumPdOutputValue) : 0;
  const requestedWatts = pdWatts?.[1] || pdWatts?.[2] || '';
  const minimumPdOutput = Boolean(minimumPdOutputValue);
  const maximumPdOutput = Boolean(maximumPdOutputValue);
  const candidatePdWatts = powerDeliveryWatts(text);
  if (pdOutputRange && (!candidatePdWatts
    || candidatePdWatts < pdRangeMinimum || candidatePdWatts > pdRangeMaximum)) return true;
  if (!pdOutputRange && minimumPdOutput && candidatePdWatts < Number(minimumPdOutputValue)) return true;
  if (!pdOutputRange && maximumPdOutput && (!candidatePdWatts || candidatePdWatts > Number(maximumPdOutputValue))) return true;
  if (requestedWatts && !pdOutputRange && !minimumPdOutput && !maximumPdOutput
    && !new RegExp(`(?:^|\\D)(?:pd\\s*)?${requestedWatts}\\s*w(?:\\s*pd)?(?:\\D|$)`, 'iu').test(text)) return true;
  const rejectedWatts = pdMatches
    .filter((match) => isNegatedPowerBankRequirement(normalizedQuery, match.index, match.index + match[0].length))
    .map((match) => match[1] || match[2]);
  if (rejectedWatts.some((watts) =>
    new RegExp(`(?:^|\\D)(?:pd\\s*)?${watts}\\s*w(?:\\s*pd)?(?:\\D|$)`, 'iu').test(text))) return true;
  return false;
}

function isLaptopHubMismatch(candidate) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC')
    .toLowerCase();
  const hasHub = /(?:usb[- ]?c\s*(?:hub|dock)|type[- ]?c\s*(?:hub|dock)|ハブ|ドッキングステーション|扩展坞|擴充塢|集线器|集線器|허브|도킹\s*스테이션|multi[- ]?(?:port\s*)?adapter)/iu.test(text);
  const hasUsbC = /(?:usb[- ]?c|type[- ]?c)/iu.test(text);
  return !(hasHub && hasUsbC);
}

function thunderboltVersion(text) {
  return String(text || '').normalize('NFKC')
    .match(/(?:thunderbolt|サンダーボルト|雷电|雷電|썬더볼트)\s*([34])/iu)?.[1] || '';
}

function isThunderboltDockMismatch(candidate, requestedVersion = '') {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC')
    .toLowerCase();
  const hasThunderbolt = /(?:thunderbolt|サンダーボルト|雷电|雷電|썬더볼트)/iu.test(text);
  const hasDock = /(?:dock(?:ing\s*station)?|ドック|ドッキングステーション|扩展坞|擴充塢|도킹\s*스테이션)/iu.test(text);
  if (!(hasThunderbolt && hasDock)) return true;
  const candidateVersion = thunderboltVersion(text);
  return Boolean(requestedVersion && candidateVersion !== requestedVersion);
}

function isUsbAHubMismatch(candidate) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC')
    .toLowerCase();
  const hasUsbA = /usb[- ]?a/iu.test(text);
  const hasHub = /(?:hub|ハブ|集线器|集線器|허브)/iu.test(text);
  return !(hasUsbA && hasHub);
}

function displayPortVersion(text) {
  return String(text || '').normalize('NFKC')
    .match(/display\s*port\s*(\d(?:\.\d)?)/iu)?.[1] || '';
}

function requestedComputerPlatform(text) {
  const value = String(text || '').normalize('NFKC');
  if (/(?:macbook|macos|mac\s*用|맥북|苹果电脑|蘋果電腦)/iu.test(value)) return 'mac';
  if (/(?:windows|win\s*11|윈도우)/iu.test(value)) return 'windows';
  return '';
}

function displayResolution(text) {
  return Number(String(text || '').normalize('NFKC').match(/\b([48])\s*k\b/iu)?.[1] || 0);
}

function refreshRate(text) {
  return Number(String(text || '').normalize('NFKC').match(/\b(\d{2,3})\s*hz\b/iu)?.[1] || 0);
}

function powerDeliveryWatts(text) {
  return Number(String(text || '').normalize('NFKC').match(/(?:pd\s*)?(\d{2,3})\s*w(?:\s*pd)?/iu)?.[1] || 0);
}

function appleSiliconGeneration(text) {
  return String(text || '').normalize('NFKC').match(/\b(m[1-4])\b/iu)?.[1]?.toUpperCase() || '';
}

function hasDualMonitorEvidence(text) {
  return /(?:dual.{0,16}(?:display|monitor)|2.{0,12}(?:display|monitor)|デュアル.{0,12}モニター|2画面|双.{0,12}显示器|雙.{0,12}顯示器|듀얼(?:.{0,12}모니터)?|모니터\s*2대)/iu.test(String(text || ''));
}

function isUsb4DockMismatch(candidate, constraints = {}) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC')
    .toLowerCase();
  if (!/usb\s*4/iu.test(text) || !/(?:dock(?:ing\s*station)?|ドック|ドッキングステーション|扩展坞|擴充塢|도킹\s*스테이션)/iu.test(text)) return true;
  if (constraints.displayPort && displayPortVersion(text) !== constraints.displayPort) return true;
  if (constraints.dualMonitor && !hasDualMonitorEvidence(text)) return true;
  if (constraints.resolution && displayResolution(text) < constraints.resolution) return true;
  if (constraints.refreshRate && refreshRate(text) < constraints.refreshRate) return true;
  if (constraints.powerDelivery && powerDeliveryWatts(text) < constraints.powerDelivery) return true;
  if (constraints.displayLink && !/display\s*link/iu.test(text)) return true;
  if (constraints.hdr && !/\bhdr\b/iu.test(text)) return true;
  if (constraints.mst && !/\bmst\b/iu.test(text)) return true;
  if (constraints.appleSilicon && appleSiliconGeneration(text) !== constraints.appleSilicon) return true;
  const candidatePlatform = requestedComputerPlatform(text);
  if (constraints.platform && candidatePlatform && candidatePlatform !== constraints.platform) return true;
  return false;
}

function robotVacuumModel(text) {
  return String(text || '').normalize('NFKC').toLowerCase()
    .match(/\b(?:roomba\s*)?([jis]\d{1,2}(?:\+)?)(?![a-z0-9])/iu)?.[1] || '';
}

function dysonVacuumModel(text) {
  return String(text || '').normalize('NFKC').toLowerCase()
    .match(/\bv\s*(8|10|11|12|15)\b/iu)?.[1] || '';
}

function batteryCapacityMah(text) {
  return Number(String(text || '').normalize('NFKC').match(/(\d{3,5})\s*mah/iu)?.[1] || 0);
}

function isDysonVacuumAccessoryMismatch(candidate, requested, query) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC').toLowerCase();
  if (!/(?:dyson|ダイソン|戴森|다이슨)/iu.test(text)) return true;
  const requestedModel = dysonVacuumModel(query);
  if (requestedModel && dysonVacuumModel(text) !== requestedModel) return true;
  const filter = /(?:hepa\s*)?(?:フィルター|filters?|滤网|濾網|필터)/iu.test(text);
  const battery = /(?:バッテリー|battery|电池|電池|배터리)/iu.test(text);
  const charger = /(?:充電器|充電アダプター|charger|charging\s*adapter|充电器|充電器|충전기)/iu.test(text);
  if (requested.has('cordless-vacuum-filter')) return !filter || battery || charger;
  if (requested.has('cordless-vacuum-battery')) {
    const minimumCapacity = batteryCapacityMah(query);
    return !battery || charger || (minimumCapacity > 0 && batteryCapacityMah(text) < minimumCapacity);
  }
  if (requested.has('cordless-vacuum-charger')) return !charger || battery;
  return false;
}

function airPurifierIdentity(text) {
  const value = String(text || '').normalize('NFKC').toLowerCase();
  const sharp = value.match(/\bkc[- ]?([a-z]\d{2,3})\b/u);
  if (sharp) return `sharp-kc-${sharp[1]}`;
  const levoit = value.match(/\bcore\s*(\d{3}[a-z]?)\b/u);
  if (levoit) return `levoit-core-${levoit[1]}`;
  const samsung = value.match(/\b(ax\d{2}[a-z0-9]{4,})\b/u);
  if (samsung) return `samsung-${samsung[1]}`;
  const xiaomi = value.match(/(?:xiaomi|小米).{0,20}(?:air\s*purifier|空气净化器|空氣淨化器)?\s*(4\s*(?:lite|pro)?)/u);
  return xiaomi ? `xiaomi-air-purifier-${xiaomi[1].replace(/\s+/gu, '-')}` : '';
}

function airPurifierPartNumber(text) {
  return String(text || '').normalize('NFKC').toLowerCase().match(/\b(fz-[a-z0-9]{4,})\b/u)?.[1] || '';
}

function isAirPurifierFilterMismatch(candidate, query) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC').toLowerCase();
  const requestedIdentity = airPurifierIdentity(query);
  if (requestedIdentity && airPurifierIdentity(text) !== requestedIdentity) return true;
  const requestedPart = airPurifierPartNumber(query);
  if (requestedPart && airPurifierPartNumber(text) !== requestedPart) return true;
  if (/(?:本体|air\s*purifier\s*(?:unit|machine)|整机|整機|본체)/iu.test(text)) return true;
  if (!/(?:フィルター|filters?|滤芯|濾芯|滤网|濾網|필터)/iu.test(text)) return true;
  if (/(?:集じん|集塵|dust\s*collection)/iu.test(query) && !/(?:集じん|集塵|dust\s*collection)/iu.test(text)) return true;
  if (/(?:脱臭|deodori[sz]ing|活性炭|탈취)/iu.test(query) && !/(?:脱臭|deodori[sz]ing|活性炭|탈취)/iu.test(text)) return true;
  if (/(?:hepa|ヘパ|헤파)/iu.test(query) && !/(?:hepa|ヘパ|헤파)/iu.test(text)) return true;
  return false;
}

function waterFilterIdentity(text) {
  const value = String(text || '').normalize('NFKC').toLowerCase();
  if (/(?:brita|ブリタ)/u.test(value) && /maxtra\s*pro/u.test(value)) return 'brita-maxtra-pro';
  const toray = value.match(/\b(mkc[.]?mx2j)\b/u);
  if (toray) return 'toray-mkc.mx2j';
  if (/\bhgc9s\b/u.test(value)) return 'cleansui-hgc9s';
  if (/\btk[- ]?cj24(?!c)/u.test(value)) return 'panasonic-tk-cj24';
  return '';
}

function refrigeratorWaterFilterIdentity(text) {
  const value = String(text || '').normalize('NFKC').toLowerCase();
  if (/(?:samsung|三星|삼성)/u.test(value) && /haf[- ]?qin/u.test(value)) return 'samsung-haf-qin';
  if (/(?:\blg\b|엘지)/u.test(value) && /lt1000p/u.test(value)) return 'lg-lt1000p';
  if (/(?:\bge\b|通用电气|通用電氣)/u.test(value) && /rpwfe/u.test(value)) return 'ge-rpwfe';
  if (/(?:whirlpool|ワールプール|惠而浦|월풀)/u.test(value) && /everydrop\s*(?:filter\s*)?1/u.test(value)) return 'whirlpool-everydrop-1';
  return '';
}

function detergentPodIdentity(text) {
  const value = String(text || '').normalize('NFKC').toLowerCase();
  if (/(?:finish|フィニッシュ|亮碟|피니시)/u.test(value)) return 'finish';
  if (/(?:cascade|カスケード|캐스케이드)/u.test(value)) return /platinum\s*plus/u.test(value) ? 'cascade-platinum-plus' : 'cascade';
  if (/(?:joy|ジョイ)/u.test(value)) return 'joy';
  if (/(?:ariel|アリエール|碧浪|아리엘)/u.test(value)) return 'ariel';
  if (/(?:tide|汰渍|汰漬|타이드)/u.test(value)) return 'tide';
  if (/(?:bold|ボールド|볼드)/u.test(value)) return 'bold';
  return '';
}

function isDetergentPodMismatch(candidate, query, requestedCategory) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC').toLowerCase();
  const requestedIdentity = detergentPodIdentity(query);
  if (requestedIdentity && detergentPodIdentity(text) !== requestedIdentity) return true;
  const requestedCount = requestedPackageCount(query);
  if (requestedCount && requestedPackageCount(text) !== requestedCount) return true;
  const dishwasher = /(?:食洗機|食器洗い機|dishwasher|洗碗机|洗碗機|식기세척기)/iu.test(text);
  const laundry = /(?:洗濯|laundry|洗衣|세탁)/iu.test(text);
  const pod = /(?:タブレット|ジェルボール|tabs?|tablets?|pods?|capsules?|凝珠|젤볼|타블렛|캡슐)/iu.test(text);
  if (!pod || /(?:粉末|powder|粉剂|粉劑|분말|液体|liquid|洗衣液|액체)/iu.test(text)) return true;
  const requestedScent = /(?:無香料|無香|unscented|fragrance[- ]?free|无香|무향)/iu.test(query) ? 'unscented'
    : /(?:レモン|lemon|柠檬|檸檬|레몬)/iu.test(query) ? 'lemon'
    : /(?:ラベンダー|lavender|薰衣草|라벤더)/iu.test(query) ? 'lavender' : '';
  const scentPatterns = {
    unscented: /(?:無香料|無香|unscented|fragrance[- ]?free|无香|무향)/iu,
    lemon: /(?:レモン|lemon|柠檬|檸檬|레몬)/iu,
    lavender: /(?:ラベンダー|lavender|薰衣草|라벤더)/iu
  };
  if (requestedScent && !scentPatterns[requestedScent].test(text)) return true;
  if (/(?:詰め替え|つめかえ|refill|补充装|補充裝|리필)/iu.test(query)
    && !/(?:詰め替え|つめかえ|refill|补充装|補充裝|리필)/iu.test(text)) return true;
  if (/(?:敏感肌(?:向け)?|低刺激|for\s+sensitive\s+skin|hypoallergenic|温和|溫和|민감성\s*피부|저자극)/iu.test(query)
    && !/(?:敏感肌(?:向け)?|低刺激|for\s+sensitive\s+skin|hypoallergenic|温和|溫和|민감성\s*피부|저자극)/iu.test(text)) return true;
  if (/(?:抗菌|除菌|antibacterial|antimicrobial|杀菌|殺菌|항균)/iu.test(query)
    && !/(?:抗菌|除菌|antibacterial|antimicrobial|杀菌|殺菌|항균)/iu.test(text)) return true;
  if (/(?:すすぎ\s*1\s*回|one[- ]?rinse|single[- ]?rinse|漂洗\s*(?:1\s*次|一次)|헹굼\s*1\s*회)/iu.test(query)
    && !/(?:すすぎ\s*1\s*回|one[- ]?rinse|single[- ]?rinse|漂洗\s*(?:1\s*次|一次)|헹굼\s*1\s*회)/iu.test(text)) return true;
  if (/(?:赤ちゃん|ベビー)(?:用|の)?衣類|baby\s*clothes|婴儿衣物|嬰兒衣物|아기\s*옷/iu.test(query)
    && !/(?:赤ちゃん|ベビー)(?:用|の)?衣類|baby\s*clothes|婴儿衣物|嬰兒衣物|아기\s*옷/iu.test(text)) return true;
  if (/(?:部屋干し|室内干し|indoor\s*drying|室内晾晒|室內晾曬|실내\s*건조)/iu.test(query)
    && !/(?:部屋干し|室内干し|indoor\s*drying|室内晾晒|室內晾曬|실내\s*건조)/iu.test(text)) return true;
  if (/(?:防臭|消臭|odor\s*control|deodori[sz]ing|除臭|냄새\s*제거|탈취)/iu.test(query)
    && !/(?:防臭|消臭|odor\s*control|deodori[sz]ing|除臭|냄새\s*제거|탈취)/iu.test(text)) return true;
  if (/(?:蛍光(?:増白)?剤不使用|no\s*optical\s*brighteners?|optical\s*brightener[- ]?free|无荧光增白剂|無螢光增白劑|형광증백제\s*무첨가)/iu.test(query)
    && !/(?:蛍光(?:増白)?剤不使用|no\s*optical\s*brighteners?|optical\s*brightener[- ]?free|无荧光增白剂|無螢光增白劑|형광증백제\s*무첨가)/iu.test(text)) return true;
  const requestedWasher = /(?:ドラム式(?:対応|用)?|front[- ]?load(?:er)?|滚筒洗衣机|滾筒洗衣機|드럼\s*세탁기)/iu.test(query) ? 'front'
    : /(?:縦型(?:対応|用)?|top[- ]?load(?:er)?|波轮洗衣机|波輪洗衣機|통돌이\s*세탁기)/iu.test(query) ? 'top' : '';
  const washerPatterns = {
    front: /(?:ドラム式(?:対応|用)?|front[- ]?load(?:er)?|滚筒洗衣机|滾筒洗衣機|드럼\s*세탁기)/iu,
    top: /(?:縦型(?:対応|用)?|top[- ]?load(?:er)?|波轮洗衣机|波輪洗衣機|통돌이\s*세탁기)/iu
  };
  if (requestedWasher && !washerPatterns[requestedWasher].test(text)) return true;
  if (/(?:ウール|wool|羊毛|울\s*(?:의류)?)/iu.test(query)
    && !/(?:ウール|wool|羊毛|울\s*(?:의류)?)/iu.test(text)) return true;
  const requestedSoftener = /(?:柔軟剤不使用|without\s+fabric\s+softener|no\s+fabric\s+softener|不含柔顺剂|不含柔順劑|유연제\s*무첨가)/iu.test(query) ? 'free'
    : /(?:柔軟剤入り|with\s+fabric\s+softener|含柔顺剂|含柔順劑|유연제\s*함유)/iu.test(query) ? 'included' : '';
  const softenerPatterns = {
    free: /(?:柔軟剤不使用|without\s+fabric\s+softener|no\s+fabric\s+softener|不含柔顺剂|不含柔順劑|유연제\s*무첨가)/iu,
    included: /(?:柔軟剤入り|with\s+fabric\s+softener|含柔顺剂|含柔順劑|유연제\s*함유)/iu
  };
  if (requestedSoftener && !softenerPatterns[requestedSoftener].test(text)) return true;
  if (requestedCategory === 'dishwasher-detergent-tablet') return !dishwasher || laundry;
  return !laundry || dishwasher;
}

function refrigeratorWaterFilterPart(text) {
  return String(text || '').normalize('NFKC').toLowerCase()
    .match(/\b(da97[- ]?17376b|adq74793501|edr1rxd1)\b/u)?.[1]?.replace('da97 ', 'da97-') || '';
}

function isRefrigeratorWaterFilterMismatch(candidate, query) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC').toLowerCase();
  const requestedIdentity = refrigeratorWaterFilterIdentity(query);
  if (requestedIdentity && refrigeratorWaterFilterIdentity(text) !== requestedIdentity) return true;
  const requestedPart = refrigeratorWaterFilterPart(query);
  if (requestedPart && refrigeratorWaterFilterPart(text) !== requestedPart) return true;
  const requestedCount = requestedPackageCount(query);
  if (requestedCount && requestedPackageCount(text) !== requestedCount) return true;
  if (/(?:純正|正規品|genuine|original|原装|原裝|정품)/iu.test(query)
    && /(?:互換|互換品|compatible|replacement\s+for|兼容|호환)/iu.test(text)) return true;
  if (/(?:冷蔵庫本体|refrigerator\s*(?:unit|appliance)|冰箱(?:主机|主機)|냉장고\s*본체)/iu.test(text)) return true;
  return !/(?:冷蔵庫(?:用)?(?:給水|浄水)?フィルター|refrigerator\s*water\s*filter|冰箱(?:净水|淨水)?(?:滤芯|濾芯)|냉장고\s*(?:정수\s*)?필터)/iu.test(text);
}

function waterFilterPartNumber(text) {
  return String(text || '').normalize('NFKC').toLowerCase().match(/\b(tk[- ]?cj24c1)\b/u)?.[1]?.replace('tk cj', 'tk-cj') || '';
}

function requestedPackageCount(text) {
  const normalized = String(text || '').normalize('NFKC');
  const matches = [...normalized.matchAll(/(\d+)\s*(?:個|本|枚|錠|粒|個入り|pack|packs|count|pcs|pieces|tabs?|tablets?|pods?|capsules?|件套|个装|個裝|块|塊|盒|卷|巻|张|張|颗|顆|개|개입|장|정|캡슐|세트)/giu)];
  const selected = matches.filter((match) => {
    const before = normalized.slice(Math.max(0, match.index - 12), match.index);
    const after = normalized.slice(match.index + match[0].length, match.index + match[0].length + 10);
    return !/(?:not|no|不要|不是|不想要)\s*$/iu.test(before)
      && !/^\s*(?:ではなく|じゃなく|ではない|じゃない|而不是|말고|아닌|아니고)/iu.test(after);
  }).at(-1);
  return Number(selected?.[1] || 0);
}

function isWaterFilterCartridgeMismatch(candidate, query) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC').toLowerCase();
  const requestedIdentity = waterFilterIdentity(query);
  if (requestedIdentity && waterFilterIdentity(text) !== requestedIdentity) return true;
  const requestedPart = waterFilterPartNumber(query);
  if (requestedPart && waterFilterPartNumber(text) !== requestedPart) return true;
  const requestedCount = requestedPackageCount(query);
  if (requestedCount && requestedPackageCount(text) !== requestedCount) return true;
  if (/(?:本体|本体セット|water\s*purifier\s*(?:unit|system)|整机|整機|본체)/iu.test(text)) return true;
  return !/(?:カートリッジ|cartridges?|滤芯|濾芯|필터\s*카트리지|카트리지)/iu.test(text);
}

function printerIdentity(text) {
  const value = String(text || '').normalize('NFKC').toLowerCase();
  const canon = value.match(/\b(ts\d{4})\b/u);
  if (canon) return `canon-${canon[1]}`;
  const epson = value.match(/\b(ep[- ]?\d{3}[a-z])\b/u);
  if (epson) return `epson-${epson[1].replace('ep ', 'ep-')}`;
  const brother = value.match(/\b(dcp[- ]?j\d{3}[a-z])\b/u);
  if (brother) return `brother-${brother[1].replace('dcp j', 'dcp-j')}`;
  if (/(?:hp|deskjet)/u.test(value) && /\b2720\b/u.test(value)) return 'hp-deskjet-2720';
  return '';
}

function printerInkPartNumber(text) {
  return String(text || '').normalize('NFKC').toLowerCase()
    .match(/\b(bci[- ]?331\+330|kam[- ]?6cl[- ]?l|lc411[- ]?4pk|67xl)\b/u)?.[1]
    ?.replace('bci ', 'bci-').replace('kam ', 'kam-').replace('6cl l', '6cl-l').replace('lc411 ', 'lc411-') || '';
}

function printerInkColorCount(text) {
  return Number(String(text || '').normalize('NFKC').match(/(\d+)\s*(?:色|colors?|色套装|色套裝|색)/iu)?.[1] || 0);
}

function isPrinterInkMismatch(candidate, query) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC').toLowerCase();
  if (printerIdentity(query) && printerIdentity(text) !== printerIdentity(query)) return true;
  if (printerInkPartNumber(query) && printerInkPartNumber(text) !== printerInkPartNumber(query)) return true;
  const requestedColors = printerInkColorCount(query);
  if (requestedColors && printerInkColorCount(text) !== requestedColors) return true;
  const genuine = /(?:純正|genuine|original|原装|原裝|정품)/iu;
  const compatible = /(?:互換|compatible|兼容|호환)/iu;
  if (genuine.test(query) && !genuine.test(text)) return true;
  if (compatible.test(query) && !compatible.test(text)) return true;
  if (/(?:本体|printer\s*(?:unit|machine)|打印机整机|打印機整機|프린터\s*본체)/iu.test(text)) return true;
  return !/(?:インク|ink\s*cartridges?|墨盒|墨水|잉크)/iu.test(text);
}

function toothbrushFamily(text) {
  const value = String(text || '').normalize('NFKC').toLowerCase();
  if (/(?:oral[- ]?b|オーラルb|ブラウン|欧乐b|歐樂b|오랄비).{0,20}\bio\b/u.test(value)) return 'oral-b-io';
  if (/(?:oral[- ]?b|オーラルb|ブラウン|欧乐b|歐樂b|오랄비).{0,20}\bpro\b/u.test(value)) return 'oral-b-pro';
  const sonicare = value.match(/\bhx(\d{4})\b/u);
  if (sonicare) return `sonicare-hx${sonicare[1]}`;
  const doltz = value.match(/\bew[- ]?dp(\d{2})\b/u);
  if (doltz) return `doltz-ew-dp${doltz[1]}`;
  return '';
}

function toothbrushHeadStyle(text) {
  const value = String(text || '').normalize('NFKC').toLowerCase();
  if (/(?:ultimate\s*clean|アルティメイトクリーン)/u.test(value)) return 'ultimate-clean';
  if (/c3\s*premium\s*plaque\s*control/u.test(value)) return 'c3-premium-plaque-control';
  if (/(?:cross\s*action|クロスアクション|크로스액션)/u.test(value)) return 'crossaction';
  return value.match(/\bwew(\d{4})\b/u)?.[0] || '';
}

function toothbrushHeadCount(text) {
  return Number(String(text || '').normalize('NFKC').match(/(\d+)\s*(?:本|個|pack|packs|count|pcs|pieces|支|个|個|개|개입)/iu)?.[1] || 0);
}

function isToothbrushHeadMismatch(candidate, query) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC').toLowerCase();
  if (toothbrushFamily(query) && toothbrushFamily(text) !== toothbrushFamily(query)) return true;
  if (toothbrushHeadStyle(query) && toothbrushHeadStyle(text) !== toothbrushHeadStyle(query)) return true;
  const count = toothbrushHeadCount(query);
  if (count && toothbrushHeadCount(text) !== count) return true;
  if (/(?:やわらか|soft|软毛|軟毛|부드러운|소프트)/iu.test(query) && !/(?:やわらか|soft|软毛|軟毛|부드러운|소프트)/iu.test(text)) return true;
  if (/(?:本体|ハンドル|充電器|charger|toothbrush\s*handle|牙刷手柄|칫솔\s*본체)/iu.test(text)) return true;
  return !/(?:替えブラシ|交換ブラシ|brush\s*heads?|替换刷头|替換刷頭|교체\s*칫솔모|칫솔모)/iu.test(text);
}

function shaverFamily(text) {
  const value = String(text || '').normalize('NFKC').toLowerCase();
  if (/(?:braun|ブラウン|博朗|브라운).{0,20}(?:clean\s*&\s*renew|クリーン\s*&\s*リニュー)/u.test(value)) return 'braun-clean-renew';
  const braun = value.match(/(?:braun|ブラウン|博朗|브라운).{0,20}(?:series|シリーズ)\s*(\d+)/u);
  if (braun) return `braun-series-${braun[1]}`;
  const philips = value.match(/(?:philips|フィリップス|飞利浦|飛利浦|필립스).{0,20}\b(s\d{4})\b/u);
  if (philips) return `philips-${philips[1]}`;
  const panasonic = value.match(/\bes[- ]?lv(\d[a-z])\b/u);
  if (panasonic) return `panasonic-es-lv${panasonic[1]}`;
  return '';
}

function shaverPartNumber(text) {
  return String(text || '').normalize('NFKC').toLowerCase()
    .match(/(?:\b(94m|wes9600|ccr6)\b|\b(sh91\/51)(?!\d))/u)?.slice(1).find(Boolean) || '';
}

function shaverBladeCount(text) {
  return Number(String(text || '').normalize('NFKC').match(/(\d+)\s*(?:枚刃|blades?|刀头|刀頭|중날|날)/iu)?.[1] || 0);
}

function isShaverReplacementMismatch(candidate, requested, query) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC').toLowerCase();
  if (shaverFamily(query) && shaverFamily(text) !== shaverFamily(query)) return true;
  if (shaverPartNumber(query) && shaverPartNumber(text) !== shaverPartNumber(query)) return true;
  if (shaverBladeCount(query) && shaverBladeCount(text) !== shaverBladeCount(query)) return true;
  const cleaning = /(?:洗浄液|洗浄カートリッジ|cleaning\s*(?:solution|cartridges?)|清洁液|清潔液|清洗液|세정액|세척액)/iu;
  const blade = /(?:替刃|交換刃|shaving\s*heads?|replacement\s*(?:heads?|blades?)|替换刀头|替換刀頭|교체\s*면도날|면도날)/iu;
  if (requested.has('shaver-cleaning-cartridge')) {
    const count = requestedPackageCount(query);
    return !cleaning.test(text) || (count && requestedPackageCount(text) !== count);
  }
  if (/(?:本体|シェーバー本体|shaver\s*(?:unit|handle)|剃须刀整机|면도기\s*본체|充電器|charger)/iu.test(text)) return true;
  return !blade.test(text) || cleaning.test(text);
}

function coffeeCapsuleSystem(text) {
  const value = String(text || '').normalize('NFKC').toLowerCase();
  if (/(?:dolce\s*gusto|ドルチェ\s*グスト|多趣酷思|돌체\s*구스토)/u.test(value)) return 'dolce-gusto';
  if (/(?:nespresso|ネスプレッソ|奈斯派索|네스프레소).{0,24}(?:vertuo|ヴァーチュオ|馥旋|버츄오)/u.test(value)) return 'nespresso-vertuo';
  if (/(?:nespresso|ネスプレッソ|奈斯派索|네스프레소).{0,24}(?:original(?:\s*line)?|オリジナル|经典|經典|오리지널)/u.test(value)) return 'nespresso-original';
  return '';
}

function coffeeCapsuleCount(text) {
  return Number(String(text || '').normalize('NFKC').match(/(\d+)\s*(?:個|杯分|capsules?|pods?|粒|颗|顆|개|개입)/iu)?.[1] || 0);
}

function isCoffeeCapsuleMismatch(candidate, query) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC').toLowerCase();
  const requestedSystem = coffeeCapsuleSystem(query);
  if (requestedSystem && coffeeCapsuleSystem(text) !== requestedSystem) return true;
  const requestedCount = coffeeCapsuleCount(query);
  if (requestedCount && coffeeCapsuleCount(text) !== requestedCount) return true;
  if (/(?:本体|コーヒーメーカー|coffee\s*(?:maker|machine)|咖啡机|咖啡機|커피\s*머신|再利用|詰め替え|reusable|refillable|可重复使用|可重複使用|재사용)/iu.test(text)) return true;
  return !/(?:コーヒー?カプセル|coffee\s*(?:capsules?|pods?)|咖啡胶囊|咖啡膠囊|커피\s*캡슐)/iu.test(text);
}

function cameraBatteryPart(text) {
  return String(text || '').normalize('NFKC').toLowerCase()
    .match(/\b(np[- ]?fz100|np[- ]?fw50|lp[- ]?e6nh|en[- ]?el15c)\b/u)?.[1]
    ?.replace(/^(np|lp|en) /u, '$1-') || '';
}

function isCameraBatteryMismatch(candidate, query) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC').toLowerCase();
  const requestedPart = cameraBatteryPart(query);
  if (requestedPart && cameraBatteryPart(text) !== requestedPart) return true;
  const requestedCount = requestedPackageCount(query);
  if (requestedCount && requestedPackageCount(text) !== requestedCount) return true;
  const genuine = /(?:純正|正規品|genuine|original|原装|原裝|정품)/iu;
  if (genuine.test(query) && !genuine.test(text)) return true;
  if (/(?:本体|camera\s*body|相机机身|相機機身|카메라\s*본체|充電器|charger|充电器|充電器|충전기)/iu.test(text)) return true;
  return !/(?:カメラ用?(?:交換)?バッテリー|camera\s*(?:replacement\s*)?battery|相机电池|相機電池|카메라\s*배터리|battery\s*pack|電池|배터리)/iu.test(text);
}

function toolBatteryModel(text) {
  const value = String(text || '').normalize('NFKC').toLowerCase();
  const compact = value.match(/\b(bl1860b|dcb184)\b/u)?.[1];
  if (compact) return compact;
  if (/\bgba\s*18v\s*5(?:\.0)?\s*ah\b/u.test(value)) return 'gba-18v-5ah';
  if (/\bm18\s*b5\b/u.test(value)) return 'm18-b5';
  return '';
}

function batteryVoltage(text) {
  return Number(String(text || '').normalize('NFKC').match(/(\d+(?:\.\d+)?)\s*v\b/iu)?.[1] || 0);
}

function batteryCapacity(text) {
  return Number(String(text || '').normalize('NFKC').match(/(\d+(?:\.\d+)?)\s*ah\b/iu)?.[1] || 0);
}

function isToolBatteryMismatch(candidate, query) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC').toLowerCase();
  if (toolBatteryModel(query) && toolBatteryModel(text) !== toolBatteryModel(query)) return true;
  if (batteryVoltage(query) && batteryVoltage(text) !== batteryVoltage(query)) return true;
  if (batteryCapacity(query) && batteryCapacity(text) !== batteryCapacity(query)) return true;
  const requestedCount = requestedPackageCount(query);
  if (requestedCount && requestedPackageCount(text) !== requestedCount) return true;
  const genuine = /(?:純正|正規品|genuine|original|原装|原裝|정품)/iu;
  if (genuine.test(query) && !genuine.test(text)) return true;
  if (/(?:本体|工具本体|power\s*tool\s*(?:body|kit)|电动工具主机|電動工具主機|전동\s*공구\s*본체|充電器|charger|充电器|充電器|충전기)/iu.test(text)) return true;
  return !/(?:工具用?(?:交換)?バッテリー|電動工具用?バッテリー|power\s*tool\s*(?:replacement\s*)?battery|电动工具电池|電動工具電池|공구\s*배터리|battery\s*pack)/iu.test(text);
}

function labelTapePart(text) {
  const value = String(text || '').normalize('NFKC').toLowerCase();
  const part = value.match(/\b(tze[- ]?231|45013|xr[- ]?12we|ss12k)\b/u)?.[1];
  return part?.replace(/^tze /u, 'tze-').replace(/^xr /u, 'xr-') || '';
}

function labelTapeWidth(text) {
  return Number(String(text || '').normalize('NFKC').match(/(\d+(?:\.\d+)?)\s*(?:mm|毫米|밀리미터)/iu)?.[1] || 0);
}

function isLabelTapeMismatch(candidate, query) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC').toLowerCase();
  if (labelTapePart(query) && labelTapePart(text) !== labelTapePart(query)) return true;
  if (labelTapeWidth(query) && labelTapeWidth(text) !== labelTapeWidth(query)) return true;
  const requestedCount = requestedPackageCount(query);
  if (requestedCount && requestedPackageCount(text) !== requestedCount) return true;
  const genuine = /(?:純正|正規品|genuine|original|原装|原裝|정품)/iu;
  if (genuine.test(query) && !genuine.test(text)) return true;
  if (/(?:本体|ラベルライター|label\s*(?:maker|printer)|标签打印机|標籤打印機|라벨\s*프린터|空カートリッジ|empty\s*cartridge)/iu.test(text)) return true;
  return !/(?:ラベル(?:ライター用)?テープ|label\s*tape|labeling\s*tape|标签带|標籤帶|라벨\s*테이프|tape\s*cartridge)/iu.test(text);
}

function airFryerLinerIdentity(text) {
  const value = String(text || '').normalize('NFKC').toLowerCase();
  if (/(?:philips|フィリップス|飞利浦|飛利浦|필립스).{0,20}\bna230\b/u.test(value)) return 'philips-na230';
  if (/(?:ninja|ニンジャ|忍者|닌자).{0,20}\baf400\b/u.test(value)) return 'ninja-af400';
  if (/(?:cosori|コソリ|科西|코소리).{0,20}\bcp158\b/u.test(value)) return 'cosori-cp158';
  if (/(?:instant\s*vortex|インスタント\s*ボルテックス|即时涡流|即時渦流|인스턴트\s*볼텍스)/u.test(value)) return 'instant-vortex';
  return '';
}

function airFryerCapacity(text) {
  return Number(String(text || '').normalize('NFKC').match(/(\d+(?:\.\d+)?)\s*l\b/iu)?.[1] || 0);
}

function airFryerLinerMaterial(text) {
  const value = String(text || '').normalize('NFKC');
  if (/(?:シリコン|silicone|硅胶|矽膠|실리콘)/iu.test(value)) return 'silicone';
  if (/(?:紙|paper|纸|紙|종이)/iu.test(value)) return 'paper';
  return '';
}

function airFryerLinerShape(text) {
  const value = String(text || '').normalize('NFKC');
  if (/(?:デュアルバスケット|dual\s*basket|双篮|雙籃|듀얼\s*바스켓)/iu.test(value)) return 'dual';
  if (/(?:角型|square|方形|사각)/iu.test(value)) return 'square';
  if (/(?:丸型|round|圆形|圓形|원형)/iu.test(value)) return 'round';
  return '';
}

function isAirFryerLinerMismatch(candidate, query) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC').toLowerCase();
  if (airFryerLinerIdentity(query) && airFryerLinerIdentity(text) !== airFryerLinerIdentity(query)) return true;
  if (airFryerCapacity(query) && airFryerCapacity(text) !== airFryerCapacity(query)) return true;
  if (airFryerLinerMaterial(query) && airFryerLinerMaterial(text) !== airFryerLinerMaterial(query)) return true;
  if (airFryerLinerShape(query) && airFryerLinerShape(text) !== airFryerLinerShape(query)) return true;
  const requestedCount = requestedPackageCount(query);
  if (requestedCount && requestedPackageCount(text) !== requestedCount) return true;
  if (/(?:本体|air\s*fryer\s*(?:unit|appliance)|空气炸锅主机|空氣炸鍋主機|에어프라이어\s*본체|交換バスケット|replacement\s*basket)/iu.test(text)) return true;
  return !/(?:ライナー|liners?|纸垫|紙墊|라이너)/iu.test(text);
}

function vacuumBagIdentity(text) {
  const value = String(text || '').normalize('NFKC').toLowerCase();
  const miele = value.match(/(?:miele|ミーレ|美诺|美諾|밀레).{0,25}(?:hyclean\s*pure\s*)?(gn|fjm)\b/u);
  if (miele) return `miele-${miele[1]}`;
  if (/(?:philips|フィリップス|飞利浦|飛利浦|필립스).{0,25}s[- ]?bag/u.test(value)) return 'philips-s-bag';
  if (/(?:bosch|ボッシュ|博世|보쉬).{0,25}(?:type\s*g\s*all|タイプ\s*g)/u.test(value)) return 'bosch-type-g-all';
  return '';
}

function vacuumBagPart(text) {
  return String(text || '').normalize('NFKC').toLowerCase().match(/\b(fc8021\/03|bbz41fgall)\b/u)?.[1] || '';
}

function isVacuumBagMismatch(candidate, query) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC').toLowerCase();
  if (vacuumBagIdentity(query) && vacuumBagIdentity(text) !== vacuumBagIdentity(query)) return true;
  if (vacuumBagPart(query) && vacuumBagPart(text) !== vacuumBagPart(query)) return true;
  const requestedCount = requestedPackageCount(query);
  if (requestedCount && requestedPackageCount(text) !== requestedCount) return true;
  const genuine = /(?:純正|正規品|genuine|original|原装|原裝|정품)/iu;
  if (genuine.test(query) && !genuine.test(text)) return true;
  if (/(?:本体|vacuum\s*cleaner\s*(?:unit|body)|吸尘器主机|吸塵器主機|진공청소기\s*본체|フィルター|filters?|滤芯|濾芯|필터)/iu.test(text)) return true;
  return !/(?:紙パック|ダストバッグ|dust\s*bags?|集尘袋|集塵袋|먼지\s*봉투)/iu.test(text);
}

function isRobotVacuumConsumableMismatch(candidate, requested, query) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC').toLowerCase();
  const requestedModel = robotVacuumModel(query);
  if (requestedModel && robotVacuumModel(text) !== requestedModel) return true;
  const requestedCount = requestedPackageCount(query);
  if (requestedCount && requestedPackageCount(text) !== requestedCount) return true;
  const isFilter = /(?:hepa\s*)?(?:フィルター|filters?|滤网|濾網|필터)/iu.test(text);
  const isBrush = /(?:サイド|side|边刷|邊刷|사이드)?\s*(?:ブラシ|brush(?:es)?|刷子|브러시)/iu.test(text);
  const isBag = /(?:紙パック|ダストバッグ|dust\s*bags?|replacement\s*bags?|集尘袋|集塵袋|尘袋|塵袋|먼지\s*봉투|더스트\s*백)/iu.test(text);
  const hasMainBrush = /(?:メイン\s*ブラシ|ローラー\s*ブラシ|main\s*brush|roller\s*brush|滚刷|滾刷|메인\s*브러시|롤러\s*브러시)/iu.test(text);
  if (requested.has('robot-vacuum-parts-kit')) {
    const queryParts = {
      filter: /(?:フィルター|filters?|滤网|濾網|필터)/iu.test(query),
      sideBrush: /(?:サイド\s*ブラシ|side\s*brush(?:es)?|边刷|邊刷|사이드\s*브러시)/iu.test(query),
      mainBrush: /(?:メイン\s*ブラシ|ローラー\s*ブラシ|main\s*brush|roller\s*brush|滚刷|滾刷|메인\s*브러시|롤러\s*브러시)/iu.test(query)
    };
    if (queryParts.filter && !isFilter) return true;
    if (queryParts.sideBrush && !isBrush) return true;
    if (queryParts.mainBrush && !hasMainBrush) return true;
    return [isFilter, isBrush, hasMainBrush, isBag].filter(Boolean).length < 2;
  }
  if (requested.has('robot-vacuum-filter')) return !isFilter || isBrush || isBag;
  if (requested.has('robot-vacuum-brush')) return !isBrush || isFilter || isBag;
  if (requested.has('robot-vacuum-bag')) return !isBag || isFilter || isBrush;
  return false;
}

function isBentoDividerIntent(query) {
  const text = String(query || '').normalize('NFKC');
  return /(?:バラン|(?:弁当|おべんとう).{0,40}(?:草|葉|緑).{0,40}(?:仕切|しきり|区切)|(?:bento|lunch\s*box).{0,50}(?:green|grass|leaf).{0,40}(?:divider|separator)|(?:green|grass|leaf).{0,40}(?:divider|separator).{0,50}(?:bento|lunch\s*box)|(?:便当|便當|饭盒|飯盒).{0,40}(?:绿色|綠色|草|叶|葉).{0,40}(?:隔板|分隔)|도시락.{0,40}(?:초록|녹색|풀|잎).{0,40}(?:칸막이|구분|분리))/iu.test(text);
}

function isBentoDividerMismatch(candidate) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC').toLowerCase();
  const divider = /(?:バラン|弁当.{0,12}(?:仕切|シート)|bento.{0,12}(?:divider|separator)|food.{0,12}(?:divider|separator)|便当.{0,12}(?:隔板|分隔)|便當.{0,12}(?:隔板|分隔)|도시락.{0,12}(?:칸막이|구분))/iu.test(text);
  const wrong = /(?:人工芝|芝生|草刈|除草|種子|苗|ガーデン|garden|lawn|grass\s*seed|artificial\s*grass|조화|인조잔디|草坪|人工草)/iu.test(text);
  return !divider || wrong;
}

function tabletModel(text) {
  const value = String(text || '').normalize('NFKC').toLowerCase();
  const latin = value.match(/\bipad\s*(air|pro|mini)\b/u);
  if (latin) return latin[1];
  const localized = value.match(/(?:アイパッド|아이패드)\s*(エア|プロ|에어|프로|미니)/u);
  if (!localized) return '';
  if (/(?:エア|에어)/u.test(localized[1])) return 'air';
  if (/(?:プロ|프로)/u.test(localized[1])) return 'pro';
  return 'mini';
}

function tabletScreenSize(text) {
  return String(text || '').normalize('NFKC')
    .match(/(\d{1,2}(?:\.\d+)?)[-\s]*(?:インチ|inch(?:es)?|英寸|인치)/iu)?.[1] || '';
}

function tabletGeneration(text) {
  const match = String(text || '').normalize('NFKC')
    .match(/(?:第\s*(\d{1,2})\s*世代|(\d{1,2})(?:st|nd|rd|th)?\s*(?:generation|gen)|第\s*(\d{1,2})\s*代|(\d{1,2})\s*세대)/iu);
  return match?.[1] || match?.[2] || match?.[3] || match?.[4] || '';
}

function tabletAccessoryEvidence(candidate) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC')
    .toLowerCase();
  return {
    compatible: /(?:tablet|ipad|タブレット|アイパッド|平板(?:电脑|電腦)?|태블릿|아이패드)/u.test(text),
    case: /(?:case|cover|ケース|カバー|保护套|保護套|케이스|커버)/u.test(text),
    keyboard: /(?:keyboard|キーボード|键盘|鍵盤|키보드)/u.test(text),
    screenProtector: /(?:screen\s*protector|protective\s*film|tempered\s*glass|保護フィルム|保护膜|保護膜|钢化膜|鋼化膜|보호\s*필름|강화\s*유리)/u.test(text),
    charger: /(?:charger|power\s*adapter|charging\s*adapter|充電器|充电器|充電アダプター|充电转接器|充電轉接器|電源適配器|电源适配器|충전기|충전\s*어댑터)/u.test(text),
    stylus: /(?:apple\s*pencil|アップルペンシル|苹果笔|蘋果筆|애플\s*펜슬|stylus|スタイラス|触控笔|觸控筆|스타일러스)/u.test(text),
    stylusTip: /(?:replacement\s*(?:tips?|nibs?)|交換\s*ペン先|替え芯|替换笔尖|替換筆尖|교체\s*펜촉|펜촉)/u.test(text),
    applePencil: /(?:apple\s*pencil|アップルペンシル|苹果笔|蘋果筆|애플\s*펜슬)/u.test(text),
    pencilGeneration: applePencilGeneration(text),
    tabletModel: tabletModel(text),
    tabletScreenSize: tabletScreenSize(text),
    tabletGeneration: tabletGeneration(text)
  };
}

function applePencilGeneration(text) {
  const match = String(text || '').normalize('NFKC')
    .match(/(?:第\s*([123])\s*世代|([123])(?:st|nd|rd|th)?\s*(?:generation|gen)|第\s*([123])\s*代|([123])\s*세대)/iu);
  return match?.[1] || match?.[2] || match?.[3] || match?.[4] || '';
}

function isTabletAccessoryMismatch(
  candidate,
  requested,
  applePencilIntent = false,
  requestedGeneration = '',
  tabletConstraints = {}
) {
  const evidence = tabletAccessoryEvidence(candidate);
  if (requestedGeneration && evidence.pencilGeneration !== requestedGeneration) return true;
  if (requested.has('tablet-stylus-tip')) return !(evidence.applePencil && evidence.stylusTip);
  if (requested.has('tablet-stylus-charger')) return !(evidence.applePencil && evidence.charger);
  if (requested.has('tablet-stylus')) {
    if (evidence.stylusTip || (evidence.applePencil && evidence.charger)) return true;
    return !evidence.stylus || !(evidence.compatible || evidence.applePencil) ||
      (applePencilIntent && !evidence.applePencil);
  }
  if (!evidence.compatible) return true;
  const deviceSpecific = ['tablet-case', 'tablet-keyboard', 'tablet-screen-protector']
    .some((category) => requested.has(category));
  if (deviceSpecific) {
    if (tabletConstraints.model && evidence.tabletModel !== tabletConstraints.model) return true;
    if (tabletConstraints.screenSize && evidence.tabletScreenSize !== tabletConstraints.screenSize) return true;
    if (tabletConstraints.generation && evidence.tabletGeneration !== tabletConstraints.generation) return true;
  }
  if (requested.has('tablet-case')) return !evidence.case;
  if (requested.has('tablet-keyboard')) return !evidence.keyboard;
  if (requested.has('tablet-screen-protector')) return !evidence.screenProtector;
  if (requested.has('tablet-charger')) return !evidence.charger;
  return false;
}

// filterCategoryMismatches()'s final fallback intentionally keeps candidates
// inferCandidateCategory() cannot classify into any of search-intelligence.mjs's
// ~150 RULES categories ("other"), rather than rejecting them outright - a
// genuinely novel/niche product (e.g. a creatively-titled fashion import)
// should not be dropped just because no regex happens to match its title.
// That safety net has a hole: a candidate from a completely unrelated domain
// (marine/outdoor gear, tools, industrial parts) is *also* classified
// "other" when it matches none of the RULES categories, so it was passing
// through unfiltered and could still outrank genuinely relevant candidates
// once no relevance score exists (see rankMerchantCandidates). Confirmed
// with '楽で涼しいカットソー。袖長めで色は白系。女性向けおしゃれ' returning
// an unrelated "Marine Battlewagon Bucket" candidate as an accepted, unranked
// "other" match, and again with 旅行で荷物を小さくしたい/一人暮らし用の炊飯器.
// An "other" candidate is only kept when it shares some generic
// domain-family wording with the requested category; every requested
// category outside these three explicitly-reproduced families keeps the
// original permissive behavior (see the '靴下' test below, which relies on
// an unclassifiable-but-plausible "Unknown Korean Fashion Item" surviving).
// Scoped to the same apparel-adjacent categories apparel-marketplaces.mjs's
// APPAREL_TERMS gate uses for the five fashion marketplaces (tops/bottoms/
// dresses plus bags/shoes/hats/socks), plus rice-cooker and travel-packing.
const APPAREL_ADJACENT_DOMAIN_CATEGORIES = new Set([
  'tops', 'pants', 'skirt', 'dress', 'bag', 'shoes', 'hat', 'socks'
]);
const DOMAIN_FAMILIES = [
  {
    categories: APPAREL_ADJACENT_DOMAIN_CATEGORIES,
    marker: /(?:服|ファッション|アパレル|コーデ|着る|羽織る|着心地|レディース|メンズ|衣服|服装|服裝|时尚|時尚|패션|의류|fashion|apparel|wear|outfit|clothing)/iu,
    // Deliberately narrow: マリン/ボート/nautical/marine are common legitimate
    // fashion pattern names (マリンボーダー = Breton/marine stripe, ボートネック
    // = boat neck), so they are excluded here to avoid rejecting real apparel
    // matches. Only unambiguous furniture nouns and the exact 船用品/船舶
    // compounds (never used as a fashion pattern name) are listed.
    //
    // 2026-08-05 v3.4 report (real production screenshots, カットソー query):
    // the RULES 'tops' pattern includes a bare /\btops?\b/ (for legitimate
    // English queries like "white top"), but on real marketplace candidate
    // titles this word is extremely common OUTSIDE clothing - "TOPS" is an
    // unrelated stationery/knife brand ("TOPS CMS-1500" claim form pad,
    // "TOPS Scandi Trekker" knife), and "top" appears in furniture/guitar
    // descriptors ("Round Top" table, "Flip Top" table, "Arch Top" guitar
    // body). These matched the 'tops' category DIRECTLY (not through the
    // 'other' bypass), so the guard below is now also applied to direct
    // category matches, not just 'other'.
    //
    // 2026-08-05 v3.5 report (real production screenshots, カットソー query):
    // a "犬用カットソー" (dog cut-and-sew shirt) listing ranked as the #2
    // result. Pet apparel uses the exact same clothing vocabulary (カットソー,
    // トップス, シャツ) as human apparel, so no positive-marker check can
    // distinguish them - only an explicit pet/animal-audience off-domain
    // marker can. Scoped to unambiguous "for an animal" phrasing (犬用/猫用/
    // ペット用 etc., or "dog/cat/pet clothes") so legitimate human-apparel
    // listings that merely depict a dog print/pattern are not affected.
    offDomainMarker: /(?:家具|机|デスク|椅子|チェア|棚|ラック|テーブル|ソファ|furniture|(?:side|coffee|dining|center|flip|round|end)\s*table|\bchair\b|\bdesk\b|\bsofa\b|船用品|船舶|ナイフ|刃物|\bknife\b|\bknives\b|\bblade\b|ギター|guitar|ukulele|violin|\barch\s*top\b|健康保険フォーム|保険金請求書|cms-1500|legal\s*pad|\bnotepad\b|メモ帳|文房具|犬用|犬服|犬の服|愛犬用|猫用|猫服|猫の服|愛猫用|ペット用|ペット服|ペットウェア|ペット衣類|小動物用|dog\s*(?:clothes|clothing|apparel|costume|outfit|coat|sweater|shirt|wear)|cat\s*(?:clothes|clothing|apparel|costume|outfit|wear)|pet\s*(?:clothes|clothing|apparel|costume|outfit|wear)|for\s+(?:dogs?|cats?|pets?)\b|\bpuppy\b)/iu
  },
  {
    categories: new Set(['rice-cooker']),
    marker: /(?:炊飯|キッチン|調理|kitchen|cook(?:ing|er)?|厨房|烹饪|주방|취사)/iu
  },
  {
    categories: new Set(['travel-packing']),
    marker: /(?:旅行|収納|圧縮|パッキング|トラベル|travel|packing|luggage|storage|compression|旅行袋|收纳|收納|压缩|壓縮|여행|수납|압축)/iu
  }
];

// 2026-08-05 v3.1 report: even after the "other"-bypass fix above, a
// furniture listing titled 'Wood Side Table Modern Furniture Fashion Home
// Decor' still survived a カットソー search - its marketing copy happens to
// contain "Fashion", which satisfies the family.marker positive test even
// though the product is unambiguously off-domain. A positive keyword match
// alone is not sufficient signal on real marketplace listings, which are
// frequently cross-tagged with generic marketing words. offDomainMarker is
// checked first and, when it hits, disqualifies the candidate regardless of
// any incidental positive marker match.
function matchingDomainFamily(requested) {
  return DOMAIN_FAMILIES.find(({ categories }) =>
    [...requested].some((category) => categories.has(category)));
}

function isPlausiblyInRequestedDomain(requested, candidateText) {
  const family = matchingDomainFamily(requested);
  if (!family) return true;
  if (family.offDomainMarker?.test(candidateText)) return false;
  return family.marker.test(candidateText);
}

// Applied even to a DIRECT category match (inferCandidateCategory already
// says e.g. 'tops') - a positive RULES match is not proof enough on its own
// when the matched word is generic (see the v3.4 offDomainMarker comment
// above), so any unambiguous off-domain signal still disqualifies the
// candidate regardless of how it was classified.
function isDefinitelyOffDomain(requested, candidateText) {
  const family = matchingDomainFamily(requested);
  return Boolean(family?.offDomainMarker?.test(candidateText));
}

// 2026-08-05 v3.4 report (real production screenshots): even with
// isDefinitelyOffDomain above, candidates like "TOPS Scandi Trekker" (a
// knife brand) or "...トップスプリズムプラス...byトップス" (a stationery
// brand) still survived - their titles contain no off-domain NOUN to
// blocklist, just the brand name "TOPS"/"トップス" itself, which is exactly
// the same bare word the 'tops' RULES pattern matches on. A blocklist can
// never keep up with every brand that happens to be named "Tops". Instead:
// the RULES 'tops' pattern matches BOTH unambiguous clothing vocabulary
// (カットソー/ブラウス/シャツ/blouse) and a bare /\btops?\b|トップス/ that
// commonly collides with unrelated brand names. When a candidate's only
// evidence is that bare/ambiguous word, require additional clothing-context
// corroboration before trusting the match at all - this is a positive-
// evidence requirement, not another blocklist entry, so it generalizes to
// brand collisions a blocklist cannot enumerate in advance.
const TOPS_UNAMBIGUOUS_TERMS = /カットソー|ブラウス|シャツ|\bblouse\b/iu;
const TOPS_AMBIGUOUS_WORD = /\btops?\b|トップス/iu;
const CLOTHING_CONTEXT_MARKER = /(?:服|ファッション|アパレル|コーデ|着る|羽織る|着心地|レディース|メンズ|衣服|服装|服裝|时尚|時尚|패션|의류|fashion|apparel|wear|outfit|clothing|pajama|cami(?:sole)?|レース|lace|tank\s*top|crop\s*top|\bt-?shirt\b|\btee\b|women'?s|men'?s|cardigan|sweater|knit|袖|sleeve)/iu;

function hasUnreliableAmbiguousMatch(category, candidateText) {
  if (category !== 'tops') return false;
  if (TOPS_UNAMBIGUOUS_TERMS.test(candidateText)) return false;
  if (!TOPS_AMBIGUOUS_WORD.test(candidateText)) return false;
  return !CLOTHING_CONTEXT_MARKER.test(candidateText);
}

export function filterCategoryMismatches(query, candidates = []) {
  const groups = semanticSearchGroups(query);
  const requested = new Set(groups
    .map((group) => group.category)
    .filter((category) => !CATEGORY_MODIFIERS.has(category)));
  const normalizedQuery = String(query || '').normalize('NFKC');
  const bentoDividerIntent = isBentoDividerIntent(normalizedQuery);
  const smartWatchBand = smartWatchBandConstraints(normalizedQuery);
  const smartWatchBandIntent = smartWatchBand.band && Boolean(smartWatchBand.model);
  const phoneScreenProtector = phoneScreenProtectorConstraints(normalizedQuery);
  const phoneScreenProtectorIntent = phoneScreenProtector.protector && Boolean(phoneScreenProtector.model);
  const cameraPrimeLens = cameraPrimeLensConstraints(normalizedQuery);
  const cameraPrimeLensIntent = cameraPrimeLens.primeLens && Boolean(cameraPrimeLens.mount);
  const chargingCable = chargingCableConstraints(normalizedQuery);
  const chargingCableIntent = chargingCable.cable && Boolean(chargingCable.connector);
  const wallCharger = wallChargerConstraints(normalizedQuery);
  const wallChargerIntent = wallCharger.charger && Boolean(wallCharger.watts && wallCharger.usbC);
  const wirelessChargingStation = wirelessChargingStationConstraints(normalizedQuery);
  const wirelessChargingStationIntent = wirelessChargingStation.wireless && wirelessChargingStation.qi2
    && wirelessChargingStation.threeInOne;
  const hdmiCable = hdmiCableConstraints(normalizedQuery);
  const hdmiCableIntent = hdmiCable.cable && Boolean(hdmiCable.version);
  const displayPortCable = displayPortCableConstraints(normalizedQuery);
  const displayPortCableIntent = displayPortCable.cable && Boolean(displayPortCable.version);
  const portableSsd = portableSsdConstraints(normalizedQuery);
  const portableSsdIntent = portableSsd.ssd && portableSsd.portable && Boolean(portableSsd.capacity);
  const sdMemoryCard = sdMemoryCardConstraints(normalizedQuery);
  const sdMemoryCardIntent = sdMemoryCard.sdCard && Boolean(sdMemoryCard.capacity && sdMemoryCard.uhs);
  const gamingMonitor = gamingMonitorConstraints(normalizedQuery);
  const gamingMonitorIntent = gamingMonitor.monitor && Boolean(gamingMonitor.size && gamingMonitor.refreshRate);
  const mechanicalKeyboard = mechanicalKeyboardConstraints(normalizedQuery);
  const mechanicalKeyboardIntent = mechanicalKeyboard.keyboard && mechanicalKeyboard.mechanical
    && Boolean(mechanicalKeyboard.layoutSize);
  const noiseCancellingHeadphones = noiseCancellingHeadphonesConstraints(normalizedQuery);
  const noiseCancellingHeadphonesIntent = noiseCancellingHeadphones.headphones && noiseCancellingHeadphones.anc
    && Boolean(noiseCancellingHeadphones.bluetooth);
  const robotVacuumBody = robotVacuumBodyConstraints(normalizedQuery);
  const robotVacuumBodyIntent = robotVacuumBody.robotVacuum && Boolean(robotVacuumBody.suction)
    && !robotVacuumBody.wrongProduct;
  const airPurifierBody = airPurifierBodyConstraints(normalizedQuery);
  const airPurifierBodyIntent = airPurifierBody.purifier && Boolean(airPurifierBody.area && airPurifierBody.cadr)
    && !airPurifierBody.wrongProduct;
  const cordlessStickVacuum = cordlessStickVacuumConstraints(normalizedQuery);
  const cordlessStickVacuumIntent = cordlessStickVacuum.stickVacuum
    && Boolean(cordlessStickVacuum.suction && cordlessStickVacuum.runtime);
  const airFryerBody = airFryerBodyConstraints(normalizedQuery);
  const airFryerBodyIntent = airFryerBody.airFryer && Boolean(airFryerBody.capacity && airFryerBody.temperature)
    && !airFryerBody.wrongProduct;
  const automaticEspressoMachine = automaticEspressoMachineConstraints(normalizedQuery);
  const automaticEspressoMachineIntent = automaticEspressoMachine.machine && automaticEspressoMachine.fullyAutomatic
    && Boolean(automaticEspressoMachine.pressure && automaticEspressoMachine.capacity)
    && !automaticEspressoMachine.wrongProduct;
  const steamMicrowaveOven = steamMicrowaveOvenConstraints(normalizedQuery);
  const steamMicrowaveOvenIntent = steamMicrowaveOven.oven && steamMicrowaveOven.steam
    && Boolean(steamMicrowaveOven.capacity && steamMicrowaveOven.power) && !steamMicrowaveOven.wrongProduct;
  const frontLoadWasherDryer = frontLoadWasherDryerConstraints(normalizedQuery);
  const frontLoadWasherDryerIntent = frontLoadWasherDryer.machine
    && Boolean(frontLoadWasherDryer.wash && frontLoadWasherDryer.dry) && !frontLoadWasherDryer.wrongProduct;
  const frenchDoorRefrigerator = frenchDoorRefrigeratorConstraints(normalizedQuery);
  const frenchDoorRefrigeratorIntent = frenchDoorRefrigerator.refrigerator
    && Boolean(frenchDoorRefrigerator.capacity && frenchDoorRefrigerator.frenchDoor)
    && !frenchDoorRefrigerator.wrongProduct;
  const builtInDishwasher = builtInDishwasherConstraints(normalizedQuery);
  const builtInDishwasherIntent = builtInDishwasher.machine
    && Boolean(builtInDishwasher.settings && builtInDishwasher.width) && !builtInDishwasher.wrongProduct;
  const oledTelevision = oledTelevisionConstraints(normalizedQuery);
  const oledTelevisionIntent = oledTelevision.television
    && Boolean(oledTelevision.size && oledTelevision.refresh && oledTelevision.hdmi) && !oledTelevision.wrongProduct;
  const laserProjector = laserProjectorConstraints(normalizedQuery);
  const laserProjectorIntent = laserProjector.projector
    && Boolean(laserProjector.brightness && laserProjector.ratio && laserProjector.laser)
    && !laserProjector.wrongProduct;
  const dolbyAtmosSoundbar = dolbyAtmosSoundbarConstraints(normalizedQuery);
  const dolbyAtmosSoundbarIntent = dolbyAtmosSoundbar.soundbar && Boolean(dolbyAtmosSoundbar.channels)
    && dolbyAtmosSoundbar.atmos && (!dolbyAtmosSoundbar.wrongProduct || dolbyAtmosSoundbar.implicitSoundbar);
  const fullFrameMirrorlessCamera = fullFrameMirrorlessCameraConstraints(normalizedQuery);
  const fullFrameMirrorlessCameraIntent = fullFrameMirrorlessCamera.camera
    && Boolean(fullFrameMirrorlessCamera.pixels && fullFrameMirrorlessCamera.video)
    && !fullFrameMirrorlessCamera.wrongProduct;
  const gamingLaptop = gamingLaptopConstraints(normalizedQuery);
  const gamingLaptopIntent = gamingLaptop.laptop && Boolean(gamingLaptop.gpu && gamingLaptop.ram && gamingLaptop.ssd)
    && !gamingLaptop.wrongProduct;
  const nas = nasConstraints(normalizedQuery);
  const nasIntent = nas.nas && Boolean(nas.bays && nas.network && nas.ram && nas.nvmeCache && nas.diskless)
    && !nas.wrongProduct;
  const wifi7MeshRouter = wifi7MeshRouterConstraints(normalizedQuery);
  const wifi7MeshRouterIntent = wifi7MeshRouter.meshRouter && wifi7MeshRouter.wifi7
    && Boolean(wifi7MeshRouter.speed && wifi7MeshRouter.triBand && wifi7MeshRouter.pack && wifi7MeshRouter.ethernet)
    && !wifi7MeshRouter.wrongProduct;
  const fdm3dPrinter = fdm3dPrinterConstraints(normalizedQuery);
  const fdm3dPrinterIntent = fdm3dPrinter.printer && fdm3dPrinter.corexy
    && Boolean(fdm3dPrinter.volume && fdm3dPrinter.speed && fdm3dPrinter.autoLeveling && fdm3dPrinter.enclosed)
    && !fdm3dPrinter.wrongProduct;
  const robotLawnMower = robotLawnMowerConstraints(normalizedQuery);
  const robotLawnMowerIntent = robotLawnMower.mower && robotLawnMower.rtk
    && Boolean(robotLawnMower.area && robotLawnMower.obstacle && robotLawnMower.wireFree)
    && !robotLawnMower.wrongProduct;
  const foldingElectricBike = foldingElectricBikeConstraints(normalizedQuery);
  const foldingElectricBikeIntent = foldingElectricBike.bike
    && Boolean(foldingElectricBike.wheel && foldingElectricBike.motor && foldingElectricBike.voltage
      && foldingElectricBike.capacity && foldingElectricBike.range)
    && !foldingElectricBike.wrongProduct;
  const portablePowerStation = portablePowerStationConstraints(normalizedQuery);
  const portablePowerStationIntent = portablePowerStation.station && portablePowerStation.lifepo4
    && Boolean(portablePowerStation.capacity && portablePowerStation.output
      && portablePowerStation.ups && portablePowerStation.solar)
    && !portablePowerStation.wrongProduct;
  const compressorDehumidifier = compressorDehumidifierConstraints(normalizedQuery);
  const compressorDehumidifierIntent = compressorDehumidifier.dehumidifier && compressorDehumidifier.compressor
    && Boolean(compressorDehumidifier.daily && compressorDehumidifier.tank
      && compressorDehumidifier.laundry && compressorDehumidifier.drainage)
    && !compressorDehumidifier.wrongProduct;
  const electricStandingDesk = electricStandingDeskConstraints(normalizedQuery);
  const electricStandingDeskIntent = electricStandingDesk.desk && electricStandingDesk.dualMotor
    && Boolean(electricStandingDesk.size && electricStandingDesk.memory && electricStandingDesk.antiCollision)
    && !electricStandingDesk.wrongProduct;
  const ergonomicOfficeChair = ergonomicOfficeChairConstraints(normalizedQuery);
  const ergonomicOfficeChairIntent = ergonomicOfficeChair.chair && ergonomicOfficeChair.headrest
    && Boolean(ergonomicOfficeChair.lumbar && ergonomicOfficeChair.armrests
      && ergonomicOfficeChair.mesh && ergonomicOfficeChair.load)
    && !ergonomicOfficeChair.wrongProduct;
  const retrofitSmartLock = retrofitSmartLockConstraints(normalizedQuery);
  const retrofitSmartLockIntent = retrofitSmartLock.lock && retrofitSmartLock.fingerprint
    && Boolean(retrofitSmartLock.keypad && retrofitSmartLock.matter
      && retrofitSmartLock.autoLock && retrofitSmartLock.emergencyKey)
    && !retrofitSmartLock.wrongProduct;
  const pressureIhRiceCooker = pressureIhRiceCookerConstraints(normalizedQuery);
  const pressureIhRiceCookerIntent = pressureIhRiceCooker.cooker
    && Boolean(pressureIhRiceCooker.capacity && pressureIhRiceCooker.steamCut
      && pressureIhRiceCooker.keepWarm)
    && !pressureIhRiceCooker.wrongProduct;
  const dualDashCam = dualDashCamConstraints(normalizedQuery);
  const dualDashCamIntent = dualDashCam.dashCam && dualDashCam.dual
    && Boolean(dualDashCam.resolution && dualDashCam.parking && dualDashCam.gps && dualDashCam.wifi)
    && !dualDashCam.wrongProduct;
  const cameraPetFeeder = cameraPetFeederConstraints(normalizedQuery);
  const cameraPetFeederIntent = cameraPetFeeder.feeder
    && Boolean(cameraPetFeeder.capacity && cameraPetFeeder.camera
      && cameraPetFeeder.wifi && cameraPetFeeder.twoWayAudio)
    && !cameraPetFeeder.wrongProduct;
  const iplHairRemoval = iplHairRemovalConstraints(normalizedQuery);
  const iplHairRemovalIntent = iplHairRemoval.device
    && Boolean(iplHairRemoval.flashes && iplHairRemoval.cooling
      && iplHairRemoval.levels && iplHairRemoval.skinSensor)
    && !iplHairRemoval.wrongProduct;
  const implicitLightUpPhoneCase = /(?:スマホ.{0,20}(?:着信|通知|メッセージ).{0,20}(?:背面|裏).{0,12}(?:光|ピカ)|(?:着信|通知|メッセージ).{0,20}スマホ.{0,12}(?:背面|裏).{0,12}(?:光|ピカ)|phone.{0,20}(?:back|rear).{0,24}(?:glow|lights?\s*up).{0,32}(?:notifications?|messages?)|(?:notifications?|messages?).{0,32}(?:back|rear).{0,16}of\s*(?:the\s*)?phone.{0,16}(?:glow|lights?\s*up)|手机.{0,20}(?:通知|来电|消息).{0,20}背面.{0,12}(?:会亮|发光)|(?:通知|来电|消息).{0,20}手机.{0,12}背面.{0,12}(?:会亮|发光)|(?:스마트폰|휴대폰).{0,20}(?:알림|전화|메시지).{0,20}뒷면.{0,12}(?:불이\s*들어오|빛나)|(?:알림|전화|메시지).{0,20}(?:스마트폰|휴대폰).{0,12}뒷면.{0,12}(?:불이\s*들어오|빛나))/iu.test(normalizedQuery);
  const deviceSpecificCase = (phoneCaseDeviceModel(normalizedQuery)
    && /(?:ケース|カバー|case|cover|手机壳|手機殼|保护壳|保護殼|케이스|커버)/iu.test(normalizedQuery)
    ) || implicitLightUpPhoneCase;
  if (!requested.size && !bentoDividerIntent && !deviceSpecificCase && !smartWatchBandIntent && !phoneScreenProtectorIntent
    && !cameraPrimeLensIntent && !chargingCableIntent && !wallChargerIntent
    && !wirelessChargingStationIntent && !hdmiCableIntent && !displayPortCableIntent
    && !portableSsdIntent && !sdMemoryCardIntent && !gamingMonitorIntent
    && !mechanicalKeyboardIntent && !noiseCancellingHeadphonesIntent && !robotVacuumBodyIntent
    && !airPurifierBodyIntent && !cordlessStickVacuumIntent && !airFryerBodyIntent
    && !automaticEspressoMachineIntent && !steamMicrowaveOvenIntent && !frontLoadWasherDryerIntent
    && !frenchDoorRefrigeratorIntent && !builtInDishwasherIntent && !oledTelevisionIntent
    && !laserProjectorIntent && !dolbyAtmosSoundbarIntent && !fullFrameMirrorlessCameraIntent
    && !gamingLaptopIntent && !nasIntent && !wifi7MeshRouterIntent && !fdm3dPrinterIntent
    && !robotLawnMowerIntent && !foldingElectricBikeIntent && !portablePowerStationIntent
    && !compressorDehumidifierIntent && !electricStandingDeskIntent && !ergonomicOfficeChairIntent
    && !retrofitSmartLockIntent && !pressureIhRiceCookerIntent && !dualDashCamIntent
    && !cameraPetFeederIntent && !iplHairRemovalIntent) return candidates;
  const portableUmbrella = requested.has('umbrella') && isPortableUmbrellaIntent(query);
  const trueWirelessEarphones = requested.has('earphones') && isTrueWirelessEarphonesIntent(query);
  const lightUpPhoneCase = !rejectsLightUpPhoneCase(normalizedQuery) && ((groups.some((group) => group.category === 'light-up')
    && (requested.has('phone-case') || deviceSpecificCase)) || implicitLightUpPhoneCase);
  const powerBank = requested.has('power-bank');
  const laptopHub = requested.has('laptop-hub');
  const thunderboltDock = requested.has('thunderbolt-dock');
  const usbAHub = requested.has('usb-a-hub');
  const usb4Dock = requested.has('usb4-dock');
  const robotVacuumConsumable = ['robot-vacuum-parts-kit', 'robot-vacuum-filter', 'robot-vacuum-brush', 'robot-vacuum-bag']
    .some((category) => requested.has(category));
  const dysonVacuumAccessory = ['cordless-vacuum-filter', 'cordless-vacuum-battery', 'cordless-vacuum-charger']
    .some((category) => requested.has(category));
  const airPurifierFilter = requested.has('air-purifier-filter');
  const waterFilterCartridge = requested.has('water-filter-cartridge');
  const refrigeratorWaterFilter = requested.has('refrigerator-water-filter');
  const detergentPod = requested.has('dishwasher-detergent-tablet') ? 'dishwasher-detergent-tablet'
    : requested.has('laundry-detergent-pod') ? 'laundry-detergent-pod' : '';
  const printerInk = requested.has('printer-ink');
  const toothbrushHead = requested.has('electric-toothbrush-head');
  const shaverReplacement = requested.has('shaver-replacement-blade') || requested.has('shaver-cleaning-cartridge');
  const coffeeCapsule = requested.has('coffee-capsule');
  const cameraBattery = requested.has('camera-battery');
  const toolBattery = requested.has('tool-battery');
  const labelTape = requested.has('label-tape');
  const airFryerLiner = requested.has('air-fryer-liner');
  const vacuumBag = requested.has('vacuum-dust-bag');
  const tabletAccessory = [
    'tablet-case', 'tablet-keyboard', 'tablet-screen-protector', 'tablet-charger',
    'tablet-stylus', 'tablet-stylus-tip', 'tablet-stylus-charger'
  ]
    .some((category) => requested.has(category));
  const applePencilIntent = /(?:apple\s*pencil|アップルペンシル|苹果笔|蘋果筆|애플\s*펜슬)/iu
    .test(String(query || '').normalize('NFKC'));
  const requestedGeneration = applePencilGeneration(query);
  const tabletConstraints = {
    model: tabletModel(query),
    screenSize: tabletScreenSize(query),
    generation: tabletGeneration(query)
  };
  // Teacher Dataset connection (2026-08-05 v3.1): when the query exactly
  // matches a committed teacher-dataset entry (evaluation/teacher-dataset/
  // *.json), its GPT/human-authored excluded_conditions are enforced against
  // every candidate before any of the category-specific checks below run.
  // Only fires on an exact/normalized match, so non-matching queries are
  // unaffected.
  const teacherEntry = lookupTeacherDatasetEntry(query);
  const teacherExcludedTerms = (teacherEntry?.excluded_conditions || [])
    .map((term) => String(term || '').normalize('NFKC').toLowerCase())
    .filter(Boolean);
  return candidates.filter((candidate) => {
    if (teacherExcludedTerms.length) {
      const candidateText = `${candidate?.product_name || ''} ${candidate?.manufacturer || ''}`.normalize('NFKC').toLowerCase();
      if (teacherExcludedTerms.some((term) => candidateText.includes(term))) return false;
    }
    if (bentoDividerIntent) return !isBentoDividerMismatch(candidate);
    if (smartWatchBandIntent) return !isSmartWatchBandMismatch(candidate, smartWatchBand);
    if (phoneScreenProtectorIntent) return !isPhoneScreenProtectorMismatch(candidate, phoneScreenProtector);
    if (cameraPrimeLensIntent) return !isCameraPrimeLensMismatch(candidate, cameraPrimeLens);
    if (chargingCableIntent) return !isChargingCableMismatch(candidate, chargingCable);
    if (wallChargerIntent) return !isWallChargerMismatch(candidate, wallCharger);
    if (wirelessChargingStationIntent) return !isWirelessChargingStationMismatch(candidate, wirelessChargingStation);
    if (hdmiCableIntent) return !isHdmiCableMismatch(candidate, hdmiCable);
    if (displayPortCableIntent) return !isDisplayPortCableMismatch(candidate, displayPortCable);
    if (portableSsdIntent) return !isPortableSsdMismatch(candidate, portableSsd);
    if (sdMemoryCardIntent) return !isSdMemoryCardMismatch(candidate, sdMemoryCard);
    if (gamingMonitorIntent) return !isGamingMonitorMismatch(candidate, gamingMonitor);
    if (mechanicalKeyboardIntent) return !isMechanicalKeyboardMismatch(candidate, mechanicalKeyboard);
    if (noiseCancellingHeadphonesIntent) {
      return !isNoiseCancellingHeadphonesMismatch(candidate, noiseCancellingHeadphones);
    }
    if (robotVacuumBodyIntent) return !isRobotVacuumBodyMismatch(candidate, robotVacuumBody);
    if (airPurifierBodyIntent) return !isAirPurifierBodyMismatch(candidate, airPurifierBody);
    if (cordlessStickVacuumIntent) return !isCordlessStickVacuumMismatch(candidate, cordlessStickVacuum);
    if (airFryerBodyIntent) return !isAirFryerBodyMismatch(candidate, airFryerBody);
    if (automaticEspressoMachineIntent) {
      return !isAutomaticEspressoMachineMismatch(candidate, automaticEspressoMachine);
    }
    if (steamMicrowaveOvenIntent) return !isSteamMicrowaveOvenMismatch(candidate, steamMicrowaveOven);
    if (frontLoadWasherDryerIntent) return !isFrontLoadWasherDryerMismatch(candidate, frontLoadWasherDryer);
    if (frenchDoorRefrigeratorIntent) return !isFrenchDoorRefrigeratorMismatch(candidate, frenchDoorRefrigerator);
    if (builtInDishwasherIntent) return !isBuiltInDishwasherMismatch(candidate, builtInDishwasher);
    if (oledTelevisionIntent) return !isOledTelevisionMismatch(candidate, oledTelevision);
    if (laserProjectorIntent) return !isLaserProjectorMismatch(candidate, laserProjector);
    if (dolbyAtmosSoundbarIntent) return !isDolbyAtmosSoundbarMismatch(candidate, dolbyAtmosSoundbar);
    if (fullFrameMirrorlessCameraIntent) {
      return !isFullFrameMirrorlessCameraMismatch(candidate, fullFrameMirrorlessCamera);
    }
    if (gamingLaptopIntent) return !isGamingLaptopMismatch(candidate, gamingLaptop);
    if (nasIntent) return !isNasMismatch(candidate, nas);
    if (wifi7MeshRouterIntent) return !isWifi7MeshRouterMismatch(candidate, wifi7MeshRouter);
    if (fdm3dPrinterIntent) return !isFdm3dPrinterMismatch(candidate, fdm3dPrinter);
    if (robotLawnMowerIntent) return !isRobotLawnMowerMismatch(candidate, robotLawnMower);
    if (foldingElectricBikeIntent) return !isFoldingElectricBikeMismatch(candidate, foldingElectricBike);
    if (portablePowerStationIntent) return !isPortablePowerStationMismatch(candidate, portablePowerStation);
    if (compressorDehumidifierIntent) return !isCompressorDehumidifierMismatch(candidate, compressorDehumidifier);
    if (electricStandingDeskIntent) return !isElectricStandingDeskMismatch(candidate, electricStandingDesk);
    if (ergonomicOfficeChairIntent) return !isErgonomicOfficeChairMismatch(candidate, ergonomicOfficeChair);
    if (retrofitSmartLockIntent) return !isRetrofitSmartLockMismatch(candidate, retrofitSmartLock);
    if (pressureIhRiceCookerIntent) return !isPressureIhRiceCookerMismatch(candidate, pressureIhRiceCooker);
    if (dualDashCamIntent) return !isDualDashCamMismatch(candidate, dualDashCam);
    if (cameraPetFeederIntent) return !isCameraPetFeederMismatch(candidate, cameraPetFeeder);
    if (iplHairRemovalIntent) return !isIplHairRemovalMismatch(candidate, iplHairRemoval);
    if (portableUmbrella && isPortableUmbrellaMismatch(candidate)) return false;
    if (trueWirelessEarphones && isTrueWirelessEarphonesMismatch(candidate)) return false;
    if (lightUpPhoneCase) return !isLightUpPhoneCaseMismatch(candidate, query);
    if (deviceSpecificCase) return !isDeviceSpecificPhoneCaseMismatch(candidate, query);
    if (powerBank && isPowerBankMismatch(candidate, query)) return false;
    if (laptopHub && isLaptopHubMismatch(candidate)) return false;
    if (thunderboltDock && isThunderboltDockMismatch(candidate, thunderboltVersion(query))) return false;
    if (usbAHub && isUsbAHubMismatch(candidate)) return false;
    if (usb4Dock && isUsb4DockMismatch(candidate, {
      displayPort: displayPortVersion(query),
      dualMonitor: hasDualMonitorEvidence(query),
      resolution: displayResolution(query),
      refreshRate: refreshRate(query),
      powerDelivery: powerDeliveryWatts(query),
      displayLink: /display\s*link/iu.test(String(query || '')),
      hdr: /\bhdr\b/iu.test(String(query || '')),
      mst: /\bmst\b/iu.test(String(query || '')),
      appleSilicon: appleSiliconGeneration(query),
      platform: requestedComputerPlatform(query)
    })) return false;
    if (robotVacuumConsumable && isRobotVacuumConsumableMismatch(candidate, requested, query)) return false;
    if (dysonVacuumAccessory) return !isDysonVacuumAccessoryMismatch(candidate, requested, query);
    if (airPurifierFilter) return !isAirPurifierFilterMismatch(candidate, query);
    if (refrigeratorWaterFilter) return !isRefrigeratorWaterFilterMismatch(candidate, query);
    if (detergentPod) return !isDetergentPodMismatch(candidate, query, detergentPod);
    if (waterFilterCartridge) return !isWaterFilterCartridgeMismatch(candidate, query);
    if (printerInk) return !isPrinterInkMismatch(candidate, query);
    if (toothbrushHead) return !isToothbrushHeadMismatch(candidate, query);
    if (shaverReplacement) return !isShaverReplacementMismatch(candidate, requested, query);
    if (coffeeCapsule) return !isCoffeeCapsuleMismatch(candidate, query);
    if (cameraBattery) return !isCameraBatteryMismatch(candidate, query);
    if (toolBattery) return !isToolBatteryMismatch(candidate, query);
    if (labelTape) return !isLabelTapeMismatch(candidate, query);
    if (airFryerLiner) return !isAirFryerLinerMismatch(candidate, query);
    if (vacuumBag) return !isVacuumBagMismatch(candidate, query);
    if (tabletAccessory) {
      return !isTabletAccessoryMismatch(
        candidate,
        requested,
        applePencilIntent,
        requestedGeneration,
        tabletConstraints
      );
    }
    const category = inferCandidateCategory(candidate, requested);
    const candidateText = `${candidate?.product_name || ''} ${candidate?.manufacturer || ''}`;
    if (requested.has(category)) {
      if (hasUnreliableAmbiguousMatch(category, candidateText)) return false;
      return !isDefinitelyOffDomain(requested, candidateText);
    }
    if (category !== 'other') return false;
    return isPlausiblyInRequestedDomain(requested, candidateText);
  });
}

// v3.4 CTO instruction: "Teacher Dataset補正件数" must be observable in the
// request trace as its own number, separate from filterCategoryMismatches's
// overall accepted/rejected count. Deliberately kept as a read-only counter
// alongside filterCategoryMismatches rather than changing that function's
// return shape (an array), which ~15 call sites and its test suite depend on.
export function teacherDatasetExclusionCount(query, candidates = []) {
  const entry = lookupTeacherDatasetEntry(query);
  const excludedTerms = (entry?.excluded_conditions || [])
    .map((term) => String(term || '').normalize('NFKC').toLowerCase())
    .filter(Boolean);
  if (!excludedTerms.length) return 0;
  return candidates.filter((candidate) => {
    const text = `${candidate?.product_name || ''} ${candidate?.manufacturer || ''}`.normalize('NFKC').toLowerCase();
    return excludedTerms.some((term) => text.includes(term));
  }).length;
}

// 100-point apparel relevance score (2026-08-05 v4.0 rubric):
// category 40 / product-type 20 / audience 10 / color 10 / use-case 10 /
// feature 5 / raw-query-word 5. Only computed when the query requests an
// apparel-adjacent category (same domain filterCategoryMismatches gates on)
// - for every other category this returns an all-zero breakdown, which is
// a no-op tiebreak identical to the previous arrival-order-only behavior.
// Returns the full breakdown (not just the total) so it can be attached to
// the ranked candidate for inspection - see rankMerchantCandidates below.
function apparelRelevanceScore(query, requested, colorPatterns, candidate) {
  const zero = { total: 0, breakdown: { category: 0, product_type: 0, audience: 0, color: 0, use_case: 0, feature: 0, raw_text: 0 } };
  if (![...requested].some((category) => APPAREL_ADJACENT_DOMAIN_CATEGORIES.has(category))) return zero;
  const text = `${candidate?.product_name || ''} ${candidate?.manufacturer || ''}`;
  const category = requested.has(inferCandidateCategory(candidate, requested)) ? 40 : 0;
  const attributes = scoreApparelAttributeMatch(query, text, { colorPatterns });
  return { total: category + attributes.total, breakdown: { category, ...attributes.breakdown } };
}

// v3.4 CTO instruction: "検索意図一致 ＞ スポンサー補正" as an absolute rule.
// ①検索意図一致 is enforced upstream as a hard gate, not a rank factor - every
// candidate reaching this function has already survived filterCategoryMismatches
// (and, for apparel-adjacent queries, the category>0 filter below), so a
// non-matching candidate is never ranked, only ever excluded before this point.
// From here, ties among already-matched candidates are broken in this order:
// ②カテゴリ一致 → ③Teacher Dataset一致 → ④商品品質(購入可否) → ⑤スポンサー補正
// → ⑥価格 → ⑦レビュー → 到着順. ⑤と⑦は現状ライブなデータソースが存在しない
// ため常に0(no-op)だが、将来値を持つデータが追加された時にこの位置へそのまま
// 差し込めるよう、比較チェーンの中に明示的なスロットとして残してある。

function candidateMinPrice(candidate) {
  const prices = (candidate?.offers || [])
    .map((offer) => Number(offer?.price))
    .filter((price) => Number.isFinite(price) && price > 0);
  return prices.length ? Math.min(...prices) : Infinity;
}

// ③Teacher Dataset一致: does this candidate's text contain one of the
// teacher-authored search terms for this exact query? Distinct from
// apparelRelevanceScore's ②category component - this checks the specific
// GPT/human-authored vocabulary (evaluation/teacher-dataset/*.json), not the
// general ~150-category RULES classifier.
function teacherDatasetMatchScore(query, candidate) {
  const entry = query ? lookupTeacherDatasetEntry(query) : null;
  if (!entry) return 0;
  const text = `${candidate?.product_name || ''} ${candidate?.manufacturer || ''}`.normalize('NFKC').toLowerCase();
  const terms = [
    ...(entry.search_terms?.ja || []),
    ...(entry.search_terms?.en || []),
    ...(entry.search_terms?.ko || []),
    ...(entry.search_terms?.zh || [])
  ].map((term) => String(term || '').normalize('NFKC').toLowerCase()).filter(Boolean);
  return terms.some((term) => text.includes(term)) ? 1 : 0;
}

export function rankMerchantCandidates(baseCandidates = [], indexedCandidates = [], query = '') {
  // No stage before this one computes a relevance score - candidates are
  // only ever accepted/rejected (filterCategoryMismatches) or merged/deduped
  // here, so without this, two candidates that both "have an offer" rank
  // purely by arrival order regardless of how well they match the query.
  const groups = query ? semanticSearchGroups(query) : [];
  const requested = new Set(groups.map((group) => group.category).filter((category) => !CATEGORY_MODIFIERS.has(category)));
  const colorPatterns = query ? requestedColorPatterns(query) : [];
  const relevanceScore = (candidate) => apparelRelevanceScore(query, requested, colorPatterns, candidate);
  // 2026-08-05 v3.1 instructions: a category-score of 0 must mean 0 results,
  // not merely "ranked last" - filterCategoryMismatches is the primary gate,
  // but this is a second line of defense against any candidate whose text
  // slips past it (e.g. via a stray marketing-copy keyword collision). Only
  // applied when the query actually requests an apparel-adjacent category -
  // apparelRelevanceScore returns an all-zero breakdown for every other
  // category, which is not a mismatch signal and must not exclude anything.
  const apparelDomainRequested = [...requested].some((category) => APPAREL_ADJACENT_DOMAIN_CATEGORIES.has(category));
  const merged = new Map();
  for (const candidate of [...baseCandidates, ...indexedCandidates]) {
    const key = String(candidate?.asin || candidate?.record_key || '').trim();
    if (!key) continue;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, candidate);
      continue;
    }
    const combinedOffers = [...(existing.offers || []), ...(candidate.offers || [])];
    const offerKeys = new Set();
    const uniqueOffers = combinedOffers.filter((offer) => {
      const offerKey = [
        offer?.seller_id || offer?.merchant_id || '',
        offer?.marketplace || '',
        offer?.product_url || ''
      ].join('|');
      if (offerKeys.has(offerKey)) return false;
      offerKeys.add(offerKey);
      return true;
    });
    merged.set(key, { ...candidate, ...existing, offers: uniqueOffers });
  }
  return [...merged.values()]
    .map((candidate, position) => ({
      candidate,
      position,
      score: relevanceScore(candidate),
      teacherMatch: teacherDatasetMatchScore(query, candidate)
    }))
    .filter(({ score }) => !apparelDomainRequested || score.breakdown.category > 0)
    .sort((left, right) =>
      (right.score.breakdown.category - left.score.breakdown.category) ||          // ②カテゴリ一致
      (right.teacherMatch - left.teacherMatch) ||                                  // ③Teacher Dataset一致
      (Number(hasMerchantOffer(right.candidate)) - Number(hasMerchantOffer(left.candidate))) || // ④商品品質(購入可否)
      ((right.score.total - right.score.breakdown.category) - (left.score.total - left.score.breakdown.category)) || // ④品質(属性一致度の残り)
      0 ||                                                                         // ⑤スポンサー補正(ライブデータなし、no-op)
      (candidateMinPrice(left.candidate) - candidateMinPrice(right.candidate)) ||  // ⑥価格(安い順)
      0 ||                                                                         // ⑦レビュー(ライブデータなし、no-op)
      left.position - right.position
    )
    // relevance_score/relevance_score_breakdown make the 100-point rubric
    // inspectable per candidate (2026-08-05 v4.0 instructions: "スコア内訳
    // を確認可能にしてください") instead of only affecting sort order.
    .map(({ candidate, score }, index) => ({
      ...candidate,
      rank: index + 1,
      relevance_score: score.total,
      relevance_score_breakdown: score.breakdown
    }));
}

export async function applyIndexedSearchPolicy(baseResult, env, query, language = 'JA', options = {}) {
  if (!env.PRODUCT_DB) return {
    ...(baseResult || {}),
    candidates: filterCategoryMismatches(query, baseResult?.candidates || [])
  };
  const indexed = await searchProductsAcrossTenantsWithDecision(
    env,
    ['itg', 'itt', 'mc2'],
    query,
    20
  );
  const decision = indexed.decision;
  const baseCandidates = filterCategoryMismatches(query, Array.isArray(baseResult?.candidates)
    ? baseResult.candidates
    : []);
  const indexedCandidates = filterCategoryMismatches(
    query,
    indexed.candidates.map(indexedCandidate)
  );
  const displayCandidates = rankMerchantCandidates(
    baseCandidates,
    indexedCandidates,
    query
  ).slice(0, 10);
  const copy = COPY[language] || COPY.JA;
  const baseQuestion = decision.reason === 'CATEGORY_DIVERGENCE' ? copy.category
    : decision.reason === 'NO_CANDIDATES' || decision.candidate_categories.length === 0 ? copy.use : copy.detail;
  const question = contextualQuestion(query, language, baseQuestion);
  const isContinuation = String(query || '').includes(' / ');
  const forceProductPresentation = options.force_product_presentation === true || isContinuation;
  if (decision.needs_clarification) {
    const provisionalCandidates = displayCandidates;
    return {
      ...(baseResult || {}),
      query_id: baseResult?.query_id || crypto.randomUUID(),
      candidates: provisionalCandidates,
      message: `${question}${decision.offer_mywish ? ` ${copy.wish}` : ''}`,
      clarification: { required: !forceProductPresentation, question, reason: decision.reason, options: forceProductPresentation ? [] : clarificationOptions(decision, language, query) },
      mywish: { suggested: decision.offer_mywish, query },
      search_guidance: {
        confidence: decision.confidence,
        information_score: decision.information_score,
        provisional: provisionalCandidates.length > 0,
        continuation: isContinuation,
        product_presentation_required: forceProductPresentation,
        product_presentation_met: provisionalCandidates.length > 0
      }
    };
  }
  return {
    ...(baseResult || {}),
    query_id: baseResult?.query_id || crypto.randomUUID(),
    candidates: displayCandidates,
    search_guidance: { confidence: decision.confidence, information_score: decision.information_score, continuation: isContinuation }
  };
}
