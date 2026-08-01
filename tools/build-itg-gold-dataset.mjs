import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const candidates = JSON.parse(readFileSync(resolve(root, 'benchmarks', 'itg-gold-candidates-broad.json'), 'utf8'));
const products = new Map(candidates.candidates.flatMap((group) => group.rows).map((row) => [row.asin, row]));

const definitions = [
  ['T01','B000G1VER6',['hand-tool','screwdriver'],['ドライバー','ねじ回し','screwdriver','keystone screwdriver'],
    ['Klein Toolsの全長12インチ、軸長12インチのキーストーン型マイナスドライバー','黄色と黒の持ち手で長い軸のマイナスドライバー','工具みたいな細長いやつ'],['shape_function','usage_scene']],
  ['T02','B085CMYZ6B',['toy','building-block'],['レゴ','LEGO','蒸気機関車','steam engine','building blocks'],
    ['LEGOの40周年限定40370、188ピースの蒸気機関車セット','黒い蒸気機関車を組み立てる限定レゴ','SNSで見た黒い乗り物のおもちゃ'],['category_branch','social_context']],
  ['T03','B01J4PDR1A',['home-fragrance','candle'],['キャンドル','ろうそく','soy candle','lavender candle'],
    ['Mrs. Meyers Clean Dayのラベンダー香、7.2オンスのソイキャンドル2個セット','ラベンダーの香りがする大豆ワックスのキャンドル','いい匂いの容器に入った火をつけるやつ'],['sensory','color_package']],
  ['T04','B001CLUL32',['audio','earphones'],['イヤホン','イヤーバッド','earbud','headphones'],
    ['HamiltonBuhlの耳に入れるタイプのイヤーバッドヘッドホン','小さくて耳に入れる有線ヘッドホン','音を聞く小さいやつ'],['shape_function','category_branch']],
  ['T05','B00NNEL72K',['bag','cycling-backpack'],['リュック','バックパック','cycling backpack','back protector'],
    ['Evoc FR TRAIL BLACKLINE、20Lで背中のプロテクター付きサイクリング用バックパック','自転車用で背中を守る黒い20Lリュック','外で背負う黒いやつ'],['usage_scene','shape_function']],
  ['T06','B00AFTTQ8I',['fashion','wristwatch'],['腕時計','watch','Fossil Grant','leather band'],
    ['FossilのメンズFS4813 Grant、ステンレスケースと茶色レザーバンドの腕時計','茶色い革ベルトと金属ケースの男性用時計','インスタで見た茶色と銀色のアクセサリー'],['color_package','social_context']],
  ['T07','B0BSSVR7HZ',['protective-equipment','nitrile-gloves'],['ニトリル手袋','作業用手袋','nitrile gloves','diamond texture'],
    ['TITANflex Thor Grip、黒、8mil、ダイヤモンド凹凸付きの使い捨てニトリル手袋100枚','黒くて表面に滑り止めの凹凸がある厚手作業手袋','手につける黒い消耗品'],['shape_function','usage_scene']],
  ['T08','B00B4R8HW6',['electronics','battery-charger'],['充電器','charger','dual charger','Spectralink 8400'],
    ['Spectralink 8400用デュアル充電器キット','機器を2台置ける黒い充電台','職場で機械を置いていた黒いやつ'],['compatibility','usage_scene']],
  ['T09','B07WW7QP26',['camera','network-camera'],['ネットワークカメラ','監視カメラ','PTZ camera','AXIS P5655-E'],
    ['AXIS P5655-E、型番01682-001のPTZネットワークカメラ','首振りできる白いドーム型ネットワークカメラ','天井についていた白い丸いやつ'],['compatibility','shape_function']],
  ['T10','B00BBUCCKO',['computer-accessory','keyboard'],['キーボード','gaming keyboard','Logitech G105','MW3'],
    ['Logitech G105 Call of Duty MW3 Editionのゲーミングキーボード','ゲーム用の黒いLogitechキーボード','配信で見た光る入力する板'],['compatibility','social_context']],
  ['T11','B08RMZKYTL',['computer-accessory','mouse'],['マウス','wireless mouse','gaming mouse','Logitech G PRO X Superlight'],
    ['Logitech G PRO X Superlight、黒のワイヤレスゲーミングマウス','すごく軽い黒い無線ゲーミングマウス','パソコンで動かす黒い小さいやつ'],['shape_function','usage_scene']],
  ['T12','B076DLN9BM',['drinkware','sports-bottle'],['水筒','スポーツボトル','sports bottle','glow in the dark'],
    ['Dicky Chug Big、20オンスで暗闇で光るスポーツボトル','暗い場所で光る大きめの水筒','TikTokで見た光るボトル'],['shape_function','social_context']],
  ['T13','B000V6IO9M',['lighting','table-lamp'],['テーブルランプ','卓上照明','table lamp','aqua glass'],
    ['Lite Source Pepita LS-20073AQUA、アクア色ガラスと布シェードのテーブルランプ','水色のガラス土台と布の傘がある卓上ライト','部屋に置く青っぽく光るやつ'],['color_package','shape_function']],
  ['T14','B0778VN76T',['bathroom','towel-warmer'],['タオルウォーマー','乾燥ラック','heated towel rack','towel warmer'],
    ['HEATGENE、角型バー8本の浴室用加熱タオルウォーマー乾燥ラック','浴室でタオルを掛けて温める銀色のラック','お風呂場の壁にある温かくなる棒'],['shape_function','usage_scene']],
  ['T15','B005LFO2DA',['personal-care','shampoo'],['シャンプー','3-in-1','shampoo conditioner body wash','Suave Men'],
    ['Suave Men 3-in-1、シャンプー・コンディショナー・ボディウォッシュ28ozの2本組','男性用で髪と体を一本で洗える大きなボトル2本','お風呂で使う男性用の液体'],['category_branch','usage_scene']],
  ['T16','B00K5F816K',['fragrance','body-powder'],['香水パウダー','ボディパウダー','perfumed dusting powder','Wind Song'],
    ['Prince Matchabelli Wind Song、4オンスの香り付きダスティングパウダー','香水みたいな香りのする粉状ボディパウダー','母が使っていたいい匂いの粉'],['sensory','memory']],
  ['T17','B0C1ZZ9L2W',['collectible','character-bust'],['胸像','フィギュア','Indiana Jones bust','1:6 scale bust'],
    ['Diamond Select Toysのインディ・ジョーンズ、1:6スケール胸像','映画の男性キャラクターの上半身だけの置物','SNSで見た茶色い帽子の人形'],['category_branch','social_context']],
  ['T18','B00OUXQW2I',['toy','jigsaw-puzzle'],['ジグソーパズル','1000ピース','HEYE puzzle','Funky Zoo Nile'],
    ['HEYE 29693 Marino Degano Funky Zoo Nile Habitat、1000ピースパズル','動物園とナイルが描かれた1000ピースのパズル','動物がたくさん描いてある箱の遊ぶもの'],['color_package','category_branch']],
  ['T19','B001CZFXHM',['fashion-accessory','wallet'],['財布','薄型財布','slim wallet','jet black'],
    ['Super Slim Wallet、Jet Blackの超薄型財布','とても薄い真っ黒な財布','ポケットに入れる黒い薄いやつ'],['shape_function','color_package']],
  ['T20','B0768NT3RW',['jewelry','necklace'],['ネックレス','フィガロチェーン','Figaro chain necklace','14K gold filled'],
    ['24インチ、幅4mmの14Kイエローゴールドフィルド・フィガロチェーンネックレス','金色で太め、フィガロ型の長いチェーン','首につける金色の長いやつ'],['shape_function','category_branch']],
  ['T21','B00IXEW7CE',['fitness','exercise-rings'],['エクササイズリング','stamina rings','fitness rings','3 colors'],
    ['NS NoveltiesのStamina Rings、3色アソートセット','色違いが3個入った運動用リング','動画で見た輪っか3つの運動道具'],['color_package','social_context']],
  ['T22','B00DH4EFW0',['camera-accessory','lens-filter'],['カメラフィルター','レンズフィルター','52mm color filter','Vivitar'],
    ['Vivitar 52mm、赤・黄・青・オレンジ・グレー・紫の回転グラデーションカラーフィルター6点セット','カメラにつける52mmの色付き丸いフィルター6枚','写真の色を変える丸い板'],['compatibility','shape_function']],
  ['T23','B07J3KHV76',['stationery','notebook'],['ノート','ハードカバー手帳','Moleskine notebook','myrtle green'],
    ['Moleskine Extra Large、罫線入り、Myrtle Greenのハードカバーノート7.5×9.75インチ','深い緑色で大きめの硬い表紙の罫線ノート','文房具屋で見た緑の四角いやつ'],['color_package','place_context']],
  ['T24','B0B6216WKJ',['musical-instrument','harmonica'],['ハーモニカ','PentaHarp','C minor harmonica','zip case'],
    ['Hohner PentaHarp Cマイナー、ジップケース・説明書・クロス付きハーモニカセット','ケースとクロスが付いたCマイナーのハーモニカ','口で音を出す銀色の小さい楽器'],['compatibility','category_branch']],
  ['T25','B07STMN9KM',['electronics-accessory','usb-cable'],['USBケーブル','Sony VMCUAM2','replacement USB adapter cable','Sony cable'],
    ['Master Cables製、Sony VMCUAM2交換用USBアダプターケーブル','ソニー機器用の交換USB変換ケーブル','機械とパソコンをつなぐ黒い線'],['compatibility','usage_scene']],
  ['T26','B07HYWQVLX',['home-textile','decorative-pillow'],['クッション','腰枕','decorative lumbar pillow','Christmas forest'],
    ['Pillow Perfect、クリスマスの森柄、グレー、12×18インチの装飾腰枕','冬の森が描かれた灰色の横長クッション','ソファに置く冬っぽいふわふわ'],['color_package','shape_function']],
  ['T27','B000HSCOJA',['outdoor-tool','folding-knife'],['折りたたみナイフ','ロックバックナイフ','folding lock back knife','pocket knife'],
    ['ロックバック機構付きの折りたたみナイフ','刃を折りたためて背中側でロックするナイフ','キャンプで使う折りたためる刃物'],['shape_function','usage_scene']],
  ['T28','B00CS8DT00',['storage','kitchen-organizer'],['収納ケース','整理ボックス','clear organizer bin','pantry organizer'],
    ['InterDesign、10×5×6インチ、透明のパントリー・冷蔵庫・冷凍庫用収納オーガナイザービン','冷蔵庫にも使える透明で細長い収納ケース','台所で物を分ける透明な箱'],['shape_function','usage_scene']],
  ['T29','B01FI7PEH8',['computer-accessory','usb-c-adapter'],['USB-Cアダプター','multi adapter','j5create JCA374','USB Type-C hub'],
    ['j5create JCA374 USB Type-Cマルチアダプター','USB-Cに複数の端子を増やす小型アダプター','ノートPCにつなぐ端子がたくさんあるやつ'],['compatibility','shape_function']],
  ['T30','B00LEVNMS6',['lighting','bathroom-light'],['浴室照明','壁付け照明','6-light bath light','brushed nickel'],
    ['Livex Lighting 50685-91 Midtown、ブラッシュドニッケルの6灯バスライト','銀色の横長バーにライトが6個付いた浴室用照明','洗面所の鏡の上にある銀色で光るやつ'],['shape_function','usage_scene']]
];

const levels = ['rich','ambiguous','ultra_ambiguous'];
const multilingualQueries = {
  T03: {
    en: 'a lavender scented soy candle in a glass jar',
    zh: '玻璃罐装的薰衣草香味大豆蜡烛',
    ko: '유리병에 담긴 라벤더 향 소이 캔들'
  },
  T04: {
    en: 'small wired earbuds that fit inside the ear',
    zh: '小巧的有线入耳式耳机',
    ko: '귀에 넣는 작은 유선 이어폰'
  },
  T19: {
    en: 'a very slim jet black wallet that fits in a pocket',
    zh: '能放进口袋的超薄黑色钱包',
    ko: '주머니에 들어가는 아주 얇은 검정 지갑'
  },
  T28: {
    en: 'a clear narrow organizer bin for the refrigerator',
    zh: '冰箱里用的透明细长收纳盒',
    ko: '냉장고에 쓰는 투명하고 긴 수납함'
  },
  T29: {
    en: 'a compact USB-C hub with multiple ports for a laptop',
    zh: '笔记本电脑用的小型多接口USB-C转接器',
    ko: '노트북에 연결하는 포트가 여러 개인 소형 USB-C 어댑터'
  }
};
const targets = definitions.map(([targetId, asin, allowedCategories, synonyms, queries, queryTypes]) => {
  const product = products.get(asin);
  if (!product) throw new Error(`ASIN_NOT_IN_ITG_CANDIDATES:${asin}`);
  return {
    target_id: targetId,
    tenant: 'itg',
    correct_asins: [asin],
    correct_product_ids: [`itg:${asin}`],
    product_name: product.product_name,
    manufacturer: product.manufacturer,
    allowed_categories: allowedCategories,
    synonyms,
    variants: [
      ...levels.map((informationLevel, index) => ({
      case_id: `${targetId}-${index + 1}`,
      locale: 'ja',
      information_level: informationLevel,
      query: queries[index],
      query_types: queryTypes
      })),
      ...Object.entries(multilingualQueries[targetId] || {}).map(([locale, query]) => ({
        case_id: `${targetId}-${locale}-1`,
        locale,
        information_level: 'ambiguous',
        query,
        query_types: queryTypes
      }))
    ]
  };
});

const output = {
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  source: {
    tenant: 'itg',
    database: 'hoshilu-products',
    rule: 'Only ASINs confirmed in the ITG D1 candidate snapshot are valid labels.'
  },
  privacy: 'No customer names, account identifiers, or order data.',
  targets
};
writeFileSync(resolve(root, 'benchmarks', 'itg-ambiguous-search-gold-v1.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ targets: targets.length, cases: targets.reduce((sum, item) => sum + item.variants.length, 0) }));
