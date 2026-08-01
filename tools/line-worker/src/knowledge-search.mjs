import { searchProductsAcrossTenantsWithDecision } from './product-index-v2.mjs';
import { inferCandidateCategory, semanticSearchGroups } from './search-intelligence.mjs';

const COPY = {
  JA: {
    category: '上位候補が別カテゴリに分かれています。どちらの用途に近いですか？',
    use: 'それは何に使うものですか？',
    detail: '色・大きさ・素材のうち、もう一つ覚えている特徴はありますか？',
    wish: '今は特定できないため、ほしっトクへ保存して後日もう一度照合できます。'
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

const DETAIL_FIRST_THEMES = new Set(['phoneCase','earphones','charger','lamp','backpack','socks','shoes','laptop','mouse-pad','rodent-supplies','bicycle-chain','umbrella-stand','lip-care','toner','serum','moisturizer','sunscreen','face-mask','cleanser','cushion-foundation','foundation','eye-shadow','blush','mascara','eyeliner','nail-care','hair-treatment','camera-bag','fan-accessory','t-shirt','tops','pants','skirt','dress','bag','hat','watch','bottle','organizer','umbrella','fan','humidifier','furniture','bedding','stationery','cooking','cleaning','pet','baby','outdoor']);

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

function isLightUpPhoneCaseMismatch(candidate) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC')
    .toLowerCase();
  const category = inferCandidateCategory(candidate);
  const hasLightUpEvidence = /(?:光る|発光|ライトアップ|\bled\b|light[- ]?up|glow(?:ing)?|luminous|发光|發光|灯光|燈光|亮灯|亮燈|빛나는|발광|불빛)/iu.test(text);
  return category !== 'phone-case' || !hasLightUpEvidence;
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

function waterFilterPartNumber(text) {
  return String(text || '').normalize('NFKC').toLowerCase().match(/\b(tk[- ]?cj24c1)\b/u)?.[1]?.replace('tk cj', 'tk-cj') || '';
}

function requestedPackageCount(text) {
  return Number(String(text || '').normalize('NFKC')
    .match(/(\d+)\s*(?:個|本|個入り|pack|packs|count|pcs|pieces|件套|个装|個裝|块|塊|개|개입|세트)/iu)?.[1] || 0);
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

function isRobotVacuumConsumableMismatch(candidate, requested, query) {
  const text = `${candidate?.product_name || ''} ${candidate?.display_name || ''} ${candidate?.description || ''}`
    .normalize('NFKC').toLowerCase();
  const requestedModel = robotVacuumModel(query);
  if (requestedModel && robotVacuumModel(text) !== requestedModel) return true;
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

export function filterCategoryMismatches(query, candidates = []) {
  const groups = semanticSearchGroups(query);
  const requested = new Set(groups
    .map((group) => group.category)
    .filter((category) => !CATEGORY_MODIFIERS.has(category)));
  if (!requested.size) return candidates;
  const portableUmbrella = requested.has('umbrella') && isPortableUmbrellaIntent(query);
  const trueWirelessEarphones = requested.has('earphones') && isTrueWirelessEarphonesIntent(query);
  const lightUpPhoneCase = requested.has('phone-case') && groups.some((group) => group.category === 'light-up');
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
  const printerInk = requested.has('printer-ink');
  const toothbrushHead = requested.has('electric-toothbrush-head');
  const shaverReplacement = requested.has('shaver-replacement-blade') || requested.has('shaver-cleaning-cartridge');
  const coffeeCapsule = requested.has('coffee-capsule');
  const cameraBattery = requested.has('camera-battery');
  const toolBattery = requested.has('tool-battery');
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
  return candidates.filter((candidate) => {
    if (portableUmbrella && isPortableUmbrellaMismatch(candidate)) return false;
    if (trueWirelessEarphones && isTrueWirelessEarphonesMismatch(candidate)) return false;
    if (lightUpPhoneCase && isLightUpPhoneCaseMismatch(candidate)) return false;
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
    if (waterFilterCartridge) return !isWaterFilterCartridgeMismatch(candidate, query);
    if (printerInk) return !isPrinterInkMismatch(candidate, query);
    if (toothbrushHead) return !isToothbrushHeadMismatch(candidate, query);
    if (shaverReplacement) return !isShaverReplacementMismatch(candidate, requested, query);
    if (coffeeCapsule) return !isCoffeeCapsuleMismatch(candidate, query);
    if (cameraBattery) return !isCameraBatteryMismatch(candidate, query);
    if (toolBattery) return !isToolBatteryMismatch(candidate, query);
    if (tabletAccessory) {
      return !isTabletAccessoryMismatch(
        candidate,
        requested,
        applePencilIntent,
        requestedGeneration,
        tabletConstraints
      );
    }
    const category = inferCandidateCategory(candidate);
    return category === 'other' || requested.has(category);
  });
}

export function rankMerchantCandidates(baseCandidates = [], indexedCandidates = []) {
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
    .map((candidate, position) => ({ candidate, position }))
    .sort((left, right) =>
      Number(hasMerchantOffer(right.candidate)) -
        Number(hasMerchantOffer(left.candidate)) ||
      left.position - right.position
    )
    .map(({ candidate }, index) => ({ ...candidate, rank: index + 1 }));
}

export async function applyIndexedSearchPolicy(baseResult, env, query, language = 'JA') {
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
    indexedCandidates
  ).slice(0, 10);
  const copy = COPY[language] || COPY.JA;
  const baseQuestion = decision.reason === 'CATEGORY_DIVERGENCE' ? copy.category
    : decision.reason === 'NO_CANDIDATES' || decision.candidate_categories.length === 0 ? copy.use : copy.detail;
  const question = contextualQuestion(query, language, baseQuestion);
  const isContinuation = String(query || '').includes(' / ');
  if (decision.needs_clarification) {
    const provisionalCandidates = displayCandidates;
    return {
      ...(baseResult || {}),
      query_id: baseResult?.query_id || crypto.randomUUID(),
      candidates: provisionalCandidates,
      message: `${question}${decision.offer_mywish ? ` ${copy.wish}` : ''}`,
      clarification: { required: true, question, reason: decision.reason, options: clarificationOptions(decision, language, query) },
      mywish: { suggested: decision.offer_mywish, query },
      search_guidance: {
        confidence: decision.confidence,
        information_score: decision.information_score,
        provisional: provisionalCandidates.length > 0,
        continuation: isContinuation
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
