const RULES = [
  ['japan-voltage',/(日本で使える|日本対応|100V|110V|115V|120V|works? in Japan)/iu,['100v','110v','115v','120v']],
  ['kitchen-use',/(キッチン|台所|食卓|調理|kitchen|dining|cooking|厨房|餐桌|주방|식탁)/iu,['kitchen','cooking']],
  ['beauty-use',/(美容|身だしなみ|コスメ|beauty|personal care|cosmetic|美容或个人护理|뷰티|개인 관리)/iu,['beauty','cosmetic']],
  ['electronics-use',/(家電|電化製品|電気製品|小型電化|小型家電|デジタル|electronics?|appliances?|digital|数码|가전|디지털)/iu,['appliance','electric','electronic']],
  ['home-use',/(収納|掃除|storage\s+(?:box|container|organizer|shelf|rack|bin)|cleaning|收纳|清洁|수납|청소)/iu,['storage','cleaning']],
  ['vehicle-tool-use',/(車・工具|自動車|car or tools|汽车或工具|자동차·공구)/iu,['car','tool']],
  ['hobby-use',/(遊び・趣味|玩具|toys or hobbies|玩具或兴趣|놀이·취미)/iu,['toy','hobby']],
  ['screwdriver',/(ドライバー|ねじ回し|螺子回し|screwdriver|細長い.*工具)/iu,['screwdriver','driver']],
  ['building-block',/(レゴ|lego|ブロック.*おもちゃ|building block)/iu,['lego','brick','building']],
  ['steam-engine-model',/(蒸気機関車|steam\s+(?:engine|locomotive)|蒸汽机车|蒸汽機車|증기\s*기관차)/iu,['steam engine','locomotive']],
  ['candle',/(キャンドル|ろうそく|蝋燭|candle|soy candle|(?:火をつける.*匂い|匂い.{0,16}火をつける)|蜡烛|蠟燭|大豆蜡烛|大豆蠟燭|(?:香味.{0,12}点火|香味.{0,12}點火)|캔들|향초|소이 캔들|향기.{0,12}불을\s*붙)/iu,['candle','soy']],
  ['earphones',/(イヤホン|イヤーバッド|ヘッドホン|ear\s*buds?|earphones?|headphones?|耳に入れる.*音|耳机|耳機|이어폰|헤드폰)/iu,['earbud','ear','bud','headphone']],
  ['backpack',/(リュック|バックパック|backpack|rucksack|背負う|背包|双肩包|雙肩包|백팩|배낭)/iu,['backpack','rucksack']],
  ['watch',/(腕時計|wristwatch|watch|革ベルト.*時計)/iu,['watch','wristwatch']],
  ['gloves',/(手袋|グローブ|ニトリル|nitrile glove|gloves)/iu,['glove','nitrile']],
  ['power-bank',/(?:モバイルバッテリー|携帯バッテリー|power\s*bank|portable\s+battery|battery\s*pack|充电宝|充電寶|移动电源|行動電源|보조\s*배터리)/iu,['power bank','portable battery','battery pack']],
  ['charger',/(充電器|充電台|チャージャー|charg(?:er|ing\s+dock)|充电座|充電座|충전\s*(?:거치대|도크))/iu,['charger','charging']],
  ['dual-charger',/(?:2|二|両|两|兩)[台個]?(?:を|の)?(?:置ける|同時)?.{0,12}(?:充電台|充電器)|(?:two\s+devices?.{0,16}charg|charg(?:er|ing\s+dock).{0,28}two\s+devices?|dual\s+charg)|双充电|雙充電|双设备充电|雙設備充電|(?:2대|듀얼).{0,12}충전/iu,['dual charger','dual charging']],
  ['phone-case',/(スマホケース|携帯(?:ケース|カバー)|スマートフォン.*(?:ケース|カバー)|アイフォ(?:ン|ーン).*ケース|ギャラクシー.{0,16}ケース|エクスペリア.{0,16}ケース|アクオス.{0,16}ケース|(?:iphone|galaxy|xperia|aquos|smartphone|mobile|phone).{0,16}(?:case|cover|ケース)|(?:case|cover|ケース).{0,16}(?:iphone|galaxy|xperia|aquos|smartphone|mobile|phone)|手机壳|手机保护壳|(?:iPhone|Xperia|AQUOS|手机|手機|三星).{0,16}(?:壳|殼|保护壳|保護殼)|(?:壳|殼|保护壳|保護殼).{0,16}(?:iPhone|Xperia|AQUOS|手机|手機|三星)|휴대폰\s*(?:케이스|커버)|스마트폰\s*(?:케이스|커버)|(?:iPhone|Xperia|AQUOS|아이폰|휴대폰|스마트폰|갤럭시|엑스페리아|아쿠오스).{0,16}(?:케이스|커버)|(?:케이스|커버).{0,16}(?:iPhone|Xperia|AQUOS|아이폰|휴대폰|스마트폰|갤럭시|엑스페리아|아쿠오스)|スマホ.{0,20}(?:着信|通知|メッセージ).{0,20}(?:背面|裏).{0,12}(?:光|ピカ)|(?:着信|通知|メッセージ).{0,20}スマホ.{0,12}(?:背面|裏).{0,12}(?:光|ピカ)|phone.{0,20}(?:back|rear).{0,24}(?:glow|lights?\s*up).{0,32}(?:notifications?|messages?)|(?:notifications?|messages?).{0,32}(?:back|rear).{0,16}of\s*(?:the\s*)?phone.{0,16}(?:glow|lights?\s*up)|手机.{0,20}(?:通知|来电|消息).{0,20}背面.{0,12}(?:会亮|发光)|(?:通知|来电|消息).{0,20}手机.{0,12}背面.{0,12}(?:会亮|发光)|(?:스마트폰|휴대폰).{0,20}(?:알림|전화|메시지).{0,20}뒷면.{0,12}(?:불이\s*들어오|빛나)|(?:알림|전화|메시지).{0,20}(?:스마트폰|휴대폰).{0,12}뒷면.{0,12}(?:불이\s*들어오|빛나))/iu,['phone','case','cover','iphone','smartphone']],
  ['phone-case',/(?:back|rear).{0,16}of\s*(?:(?:my|the)\s*)?phone.{0,24}(?:glow|lights?\s*up).{0,32}(?:notifications?|messages?)/iu,['phone','case','cover','iphone','smartphone']],
  ['phone-case',/(?:알림|전화|메시지).{0,20}(?:스마트폰|휴대폰).{0,12}뒷면.{0,12}불\s*들어오/iu,['phone','case','cover','iphone','smartphone']],
  ['light-up',/불\s*들어오/iu,['led','light','glow','luminous']],
  ['light-up',/(光る|発光|ピカピカ|\bLED\b|ライトアップ|lights?\s*up|light[- ]?up|glow(?:ing)?|luminous|发光|会亮|灯光|亮闪闪|빛나는|발광|불빛\s*나는|불이\s*들어오)/iu,['led','light','glow','luminous']],
  ['waterproof',/(防水|waterproof|防水型|방수)/iu,['waterproof']],
  ['camera-bag',/(カメラ(?:用)?(?:バッグ|ケース|ポーチ)|camera bag|camera case)/iu,['camera bag','camera case']],
  ['photo-printer',/(写真プリンター|フォトプリンター|スマホプリンター|photo printer|portable photo printer)/iu,['photo printer','portable printer']],
  ['camera',/(カメラ(?!用?(?:バッグ|ケース|ポーチ))|camera(?! bag| case))/iu,['camera']],
  ['ptz-network-camera',/(?:首振り|PTZ|パンチルト).{0,12}(?:ネットワーク|監視)?カメラ|(?:ネットワーク|監視)カメラ.{0,12}(?:首振り|PTZ|ドーム)|(?:ptz|pan\s+and\s+tilt).{0,20}(?:network|security)?\s*camera|(?:network|security)\s*camera.{0,24}(?:ptz|dome|pan\s+and\s+tilt)|云台.{0,12}(?:网络|網絡|监控|監控)摄像|(?:网络|網絡|监控|監控)摄像.{0,12}(?:云台|雲台|球形)|(?:PTZ|회전).{0,20}(?:네트워크|보안)\s*카메라|(?:네트워크|보안)\s*카메라.{0,20}(?:PTZ|회전|돔)/iu,['network camera','ptz','security camera']],
  ['keyboard',/(キーボード|keyboard|入力する板)/iu,['keyboard']],
  ['mouse-pad',/(マウスパッド|マウスマット|mouse pad|mouse mat)/iu,['mouse pad','mouse mat']],
  ['rodent-supplies',/(?:ペット|飼育|小動物).{0,8}マウス|マウス.{0,8}(?:ケージ|飼育|小動物)/iu,['pet mouse','rodent','cage']],
  ['mouse',/(マウス(?!パッド|マット|.{0,8}(?:ケージ|飼育))|trackball|computer mouse|mouse(?! cage| habitat| for pet)|パソコンで動かす|(?:电脑|電腦).{0,8}(?:鼠标|滑鼠)|(?:游戏|遊戲)(?:鼠标|滑鼠)|컴퓨터.{0,8}마우스|게이밍 마우스)/iu,['mouse','trackball']],
  ['bottle',/(水筒|ボトル|bottle|飲み物.*容器)/iu,['bottle']],
  ['lamp',/(テーブルランプ|卓上.*ライト|table lamp|布.*傘.*ライト)/iu,['lamp','light']],
  ['table-lamp-details',/(?:ガラス|glass|玻璃|유리).{0,16}(?:布.{0,4}(?:傘|シェード)|fabric\s+shade|布艺灯罩|布藝燈罩|패브릭\s*갓)|(?:布.{0,4}(?:傘|シェード)|fabric\s+shade|布艺灯罩|布藝燈罩|패브릭\s*갓).{0,16}(?:ガラス|glass|玻璃|유리)/iu,['table lamp','glass','fabric shade']],
  ['towel-warmer',/(タオルウォーマー|温める.*タオル|(?:浴室|お風呂).{0,16}(?:タオル.{0,8}温め|温め.{0,8}タオル)|(?:浴室|お風呂).{0,12}(?:壁|棒|ラック).{0,8}温か|heated towel|towel warmer|(?:warm|heated).{0,12}(?:metal\s+)?bars?.{0,20}bathroom|bathroom.{0,20}(?:warm|heated).{0,12}bars?|浴室.{0,16}(?:加热毛巾架|加熱毛巾架|发热.{0,6}金属杆|發熱.{0,6}金屬桿)|욕실.{0,16}(?:온열\s*수건걸이|따뜻.{0,8}(?:금속\s*)?막대))/iu,['towel','warmer','heated']],
  ['shampoo',/(シャンプー|髪.*洗|shampoo|샴푸|洗发(?:水)?|洗髮(?:精)?)/iu,['shampoo','hair wash']],
  ['hair-treatment',/(トリートメント|ヘアマスク|ヘアオイル|洗い流さない|hair treatment|hair mask|hair oil|트리트먼트|헤어팩|헤어 오일|护发|護髮)/iu,['hair treatment','hair mask','hair oil']],
  ['body-powder',/(香り.*粉|いい匂い.{0,8}粉|ボディパウダー|ダスティングパウダー|dusting powder|perfumed powder|(?:nice[- ]smelling|scented|fragrant).{0,8}powder|香味.{0,8}(?:粉|爽身粉)|향기.{0,8}(?:파우더|분말))/iu,['powder','perfumed']],
  ['figure',/(フィギュア|胸像|上半身.*置物|figure|bust|collectible)/iu,['figure','bust','collectible']],
  ['indiana-jones',/(インディ[・ー\s]*ジョーンズ|indiana\s+jones)/iu,['インディ','ジョーンズ','indiana','jones']],
  ['one-sixth-scale',/(?:1\s*[:/]\s*6|6分の1|one[- ]sixth).{0,12}(?:スケール|scale|胸像|bust|模型|모형|模型)/iu,['1:6','1/6','1 6 scale']],
  ['puzzle',/(パズル|puzzle|ピース.*遊)/iu,['puzzle']],
  ['wallet',/(財布|\bwallet\b|ポケット.*薄|钱包|錢包|지갑)/iu,['wallet']],
  ['bicycle-chain',/(?:自転車|バイク).{0,6}チェーン|チェーン.{0,6}(?:自転車|バイク)|bicycle chain|bike chain/iu,['bicycle chain','bike chain']],
  ['necklace',/(ネックレス|首.{0,8}(?:金色|チェーン)|フィガロ.{0,8}チェーン|figaro.{0,8}chain|费加罗链|費加羅鍊|피가로.{0,8}체인|necklace|项链|項鍊|목걸이)/iu,['necklace','jewelry chain']],
  ['fitness-ring',/(運動用.*リング|エクササイズリング|stamina ring|輪っか.*運動)/iu,['ring','stamina']],
  ['camera-filter',/(カメラ.*フィルター|レンズフィルター|写真.*色.*丸|\d{2,3}\s*mm.{0,24}(?:カラー|色付き|グラデーション).*フィルター|color filters?|camera.{0,24}filters?|lens.{0,24}filters?|filters?.{0,24}(?:camera|lens)|相机.{0,20}滤镜|相機.{0,20}濾鏡|镜头.{0,20}滤镜|鏡頭.{0,20}濾鏡|카메라.{0,24}필터|렌즈.{0,24}필터)/iu,['filter','color']],
  ['robot-vacuum-parts-kit',/(?:(?:roomba|ルンバ|robot\s*vacuum|ロボット掃除機|扫地机器人|掃地機器人|로봇\s*청소기|룸바).{0,40}(?:交換\s*(?:パーツ|部品)\s*セット|replacement\s*parts?\s*(?:kit|set)|accessor(?:y|ies)\s*(?:kit|set)|配件套装|配件套組|교체\s*부품\s*세트|액세서리\s*세트)|(?:交換\s*(?:パーツ|部品)\s*セット|replacement\s*parts?\s*(?:kit|set)|accessor(?:y|ies)\s*(?:kit|set)|配件套装|配件套組|교체\s*부품\s*세트|액세서리\s*세트).{0,40}(?:roomba|ルンバ|robot\s*vacuum|ロボット掃除機|扫地机器人|掃地機器人|로봇\s*청소기|룸바))/iu,['robot vacuum replacement parts kit','filter side brush roller']],
  ['robot-vacuum-filter',/(?:(?:roomba|ルンバ|robot\s*vacuum|ロボット掃除機|扫地机器人|掃地機器人|로봇\s*청소기|룸바).{0,30}(?:フィルター|filters?|滤网|濾網|필터)|(?:フィルター|filters?|滤网|濾網|필터).{0,30}(?:roomba|ルンバ|robot\s*vacuum|ロボット掃除機|扫地机器人|掃地機器人|로봇\s*청소기|룸바))/iu,['robot vacuum replacement filter','roomba filter']],
  ['robot-vacuum-brush',/(?:(?:roomba|ルンバ|robot\s*vacuum|ロボット掃除機|扫地机器人|掃地機器人|로봇\s*청소기|룸바).{0,30}(?:ブラシ|brush(?:es)?|刷子|브러시)|(?:ブラシ|brush(?:es)?|刷子|브러시).{0,30}(?:roomba|ルンバ|robot\s*vacuum|ロボット掃除機|扫地机器人|掃地機器人|로봇\s*청소기|룸바))/iu,['robot vacuum side brush','roomba replacement brush']],
  ['robot-vacuum-bag',/(?:(?:roomba|ルンバ|robot\s*vacuum|ロボット掃除機|扫地机器人|掃地機器人|로봇\s*청소기|룸바).{0,30}(?:紙パック|ダストバッグ|dust\s*bags?|replacement\s*bags?|集尘袋|集塵袋|尘袋|塵袋|먼지\s*봉투|더스트\s*백)|(?:紙パック|ダストバッグ|dust\s*bags?|replacement\s*bags?|集尘袋|集塵袋|尘袋|塵袋|먼지\s*봉투|더스트\s*백).{0,30}(?:roomba|ルンバ|robot\s*vacuum|ロボット掃除機|扫地机器人|掃地機器人|로봇\s*청소기|룸바))/iu,['robot vacuum dust bag','roomba replacement bag']],
  ['robot-vacuum',/(?:roomba|ルンバ|robot\s*vacuum|ロボット掃除機|扫地机器人|掃地機器人|로봇\s*청소기|룸바)/iu,['robot vacuum','roomba']],
  ['cordless-vacuum-filter',/(?:(?:dyson|ダイソン|戴森|다이슨).{0,30}(?:フィルター|filters?|滤网|濾網|필터)|(?:フィルター|filters?|滤网|濾網|필터).{0,30}(?:dyson|ダイソン|戴森|다이슨))/iu,['dyson replacement hepa filter','cordless vacuum filter']],
  ['cordless-vacuum-battery',/(?:(?:dyson|ダイソン|戴森|다이슨).{0,30}(?:バッテリー|battery|电池|電池|배터리)|(?:バッテリー|battery|电池|電池|배터리).{0,30}(?:dyson|ダイソン|戴森|다이슨))/iu,['dyson replacement battery','cordless vacuum battery']],
  ['cordless-vacuum-charger',/(?:(?:dyson|ダイソン|戴森|다이슨).{0,30}(?:充電器|充電アダプター|charger|charging\s*adapter|充电器|充電器|충전기)|(?:充電器|充電アダプター|charger|charging\s*adapter|充电器|充電器|충전기).{0,30}(?:dyson|ダイソン|戴森|다이슨))/iu,['dyson vacuum charger','charging adapter']],
  ['cordless-vacuum',/(?:dyson|ダイソン|戴森|다이슨).{0,20}(?:コードレス(?:掃除機)?|vacuum|吸尘器|吸塵器|무선\s*청소기)/iu,['dyson cordless vacuum','vacuum cleaner']],
  ['air-purifier-filter',/(?:(?:空気清浄機|air\s*purifier|空气净化器|空氣淨化器|공기\s*청정기|sharp|シャープ|levoit|xiaomi|小米|samsung|三星|삼성).{0,40}(?:フィルター|filters?|滤芯|濾芯|滤网|濾網|필터)|(?:フィルター|filters?|滤芯|濾芯|滤网|濾網|필터).{0,40}(?:空気清浄機|air\s*purifier|空气净化器|空氣淨化器|공기\s*청정기|sharp|シャープ|levoit|xiaomi|小米|samsung|三星|삼성))/iu,['air purifier replacement filter','hepa filter']],
  ['air-purifier',/(?:空気清浄機|air\s*purifier|空气净化器|空氣淨化器|공기\s*청정기)/iu,['air purifier','air cleaner']],
  ['dishwasher-detergent-tablet',/(?:(?:finish|フィニッシュ|亮碟|피니시|cascade|カスケード|캐스케이드|joy|ジョイ).{0,45}(?:食洗機|食器洗い機|dishwasher|洗碗机|洗碗機|식기세척기).{0,25}(?:タブレット|tabs?|tablets?|pods?|凝珠|세제|타블렛|캡슐)|(?:食洗機|食器洗い機|dishwasher|洗碗机|洗碗機|식기세척기).{0,25}(?:洗剤|detergent|タブレット|tabs?|tablets?|pods?|凝珠|세제|타블렛|캡슐))/iu,['dishwasher detergent tablets','dishwasher pods']],
  ['laundry-detergent-pod',/(?:(?:ariel|アリエール|碧浪|아리엘|tide|汰渍|汰漬|타이드|bold|ボールド|볼드).{0,45}(?:洗濯|laundry|洗衣|세탁).{0,25}(?:ジェルボール|pods?|capsules?|凝珠|세제|젤볼|캡슐)|(?:ariel|アリエール|碧浪|아리엘|tide|汰渍|汰漬|타이드|bold|ボールド|볼드).{0,45}(?:ジェルボール|pods?|capsules?|凝珠|젤볼|캡슐).{0,45}(?:洗濯|laundry|洗衣|세탁)|(?:洗濯|laundry|洗衣|세탁).{0,25}(?:ジェルボール|pods?|capsules?|凝珠|세제|젤볼|캡슐))/iu,['laundry detergent pods','laundry capsules']],
  ['refrigerator-water-filter',/(?:(?:samsung|三星|삼성|\bLG\b|엘지|\bGE\b|通用电气|通用電氣|whirlpool|ワールプール|惠而浦|월풀|HAF[- ]?QIN|LT1000P|RPWFE|EDR1RXD1).{0,50}(?:冷蔵庫(?:用)?(?:給水|浄水)?フィルター|refrigerator\s*water\s*filter|冰箱(?:净水|淨水)?(?:滤芯|濾芯)|냉장고\s*(?:정수\s*)?필터)|(?:冷蔵庫(?:用)?(?:給水|浄水)?フィルター|refrigerator\s*water\s*filter|冰箱(?:净水|淨水)?(?:滤芯|濾芯)|냉장고\s*(?:정수\s*)?필터).{0,50}(?:samsung|三星|삼성|\bLG\b|엘지|\bGE\b|通用电气|通用電氣|whirlpool|ワールプール|惠而浦|월풀|HAF[- ]?QIN|LT1000P|RPWFE|EDR1RXD1))/iu,['refrigerator water filter','fridge filter']],
  ['water-filter-cartridge',/(?:(?:brita|ブリタ|toray|東レ|东丽|東麗|cleansui|クリンスイ|可菱水|panasonic|パナソニック|松下|파나소닉|浄水器|water\s*(?:filter|purifier)|净水器|淨水器|정수기).{0,40}(?:カートリッジ|cartridges?|滤芯|濾芯|필터\s*카트리지|카트리지)|(?:カートリッジ|cartridges?|滤芯|濾芯|필터\s*카트리지|카트리지).{0,40}(?:brita|ブリタ|toray|東レ|东丽|東麗|cleansui|クリンスイ|可菱水|panasonic|パナソニック|松下|파나소닉|浄水器|water\s*(?:filter|purifier)|净水器|淨水器|정수기))/iu,['water filter replacement cartridge','purifier cartridge']],
  ['water-purifier',/(?:浄水器|water\s*purifier|净水器|淨水器|정수기)/iu,['water purifier','water filter system']],
  ['printer-ink',/(?:(?:canon|キヤノン|キャノン|epson|エプソン|brother|ブラザー|hp|プリンター|printer|打印机|打印機|프린터).{0,45}(?:インク|ink\s*cartridges?|墨盒|墨水|잉크)|(?:インク|ink\s*cartridges?|墨盒|墨水|잉크).{0,45}(?:canon|キヤノン|キャノン|epson|エプソン|brother|ブラザー|hp|プリンター|printer|打印机|打印機|프린터))/iu,['printer ink cartridge','replacement ink']],
  ['printer',/(?:プリンター|printer|打印机|打印機|프린터)/iu,['printer','inkjet printer']],
  ['electric-toothbrush-head',/(?:(?:oral[- ]?b|オーラルB|ブラウン|欧乐B|歐樂B|오랄비|sonicare|ソニッケアー?|philips|飞利浦|飛利浦|소닉케어|doltz|ドルツ|panasonic|松下|파나소닉|電動歯ブラシ|electric\s*toothbrush|电动牙刷|電動牙刷|전동\s*칫솔).{0,45}(?:替えブラシ|交換ブラシ|brush\s*heads?|替换刷头|替換刷頭|교체\s*칫솔모|칫솔모)|(?:替えブラシ|交換ブラシ|brush\s*heads?|替换刷头|替換刷頭|교체\s*칫솔모|칫솔모).{0,45}(?:oral[- ]?b|オーラルB|ブラウン|欧乐B|歐樂B|오랄비|sonicare|ソニッケアー?|philips|飞利浦|飛利浦|소닉케어|doltz|ドルツ|panasonic|松下|파나소닉|電動歯ブラシ|electric\s*toothbrush|电动牙刷|電動牙刷|전동\s*칫솔))/iu,['electric toothbrush replacement heads','brush heads']],
  ['electric-toothbrush',/(?:電動歯ブラシ|electric\s*toothbrush|电动牙刷|電動牙刷|전동\s*칫솔)/iu,['electric toothbrush']],
  ['shaver-cleaning-cartridge',/(?:(?:braun|ブラウン|博朗|브라운|clean\s*&\s*renew).{0,40}(?:洗浄液|洗浄カートリッジ|cleaning\s*(?:solution|cartridges?)|清洁液|清潔液|清洗液|세정액|세척액)|(?:洗浄液|洗浄カートリッジ|cleaning\s*(?:solution|cartridges?)|清洁液|清潔液|清洗液|세정액|세척액).{0,40}(?:braun|ブラウン|博朗|브라운|clean\s*&\s*renew))/iu,['shaver cleaning cartridges','clean and renew']],
  ['shaver-replacement-blade',/(?:(?:braun|ブラウン|博朗|브라운|philips|フィリップス|飞利浦|飛利浦|필립스|panasonic|松下|파나소닉|lamdash|ラムダッシュ|シェーバー|shaver|剃须刀|電鬚刨|면도기).{0,45}(?:替刃|交換刃|shaving\s*heads?|replacement\s*(?:heads?|blades?)|替换刀头|替換刀頭|교체\s*면도날|면도날)|(?:替刃|交換刃|shaving\s*heads?|replacement\s*(?:heads?|blades?)|替换刀头|替換刀頭|교체\s*면도날|면도날).{0,45}(?:braun|ブラウン|博朗|브라운|philips|フィリップス|飞利浦|飛利浦|필립스|panasonic|松下|파나소닉|lamdash|ラムダッシュ|シェーバー|shaver|剃须刀|電鬚刨|면도기))/iu,['electric shaver replacement head','replacement foil blade']],
  ['electric-shaver',/(?:電気シェーバー|シェーバー|electric\s*shaver|剃须刀|電鬚刨|전기\s*면도기)/iu,['electric shaver']],
  ['coffee-capsule',/(?:(?:nespresso|ネスプレッソ|奈斯派索|네스프레소|dolce\s*gusto|ドルチェ\s*グスト|多趣酷思|돌체\s*구스토).{0,45}(?:コーヒー?カプセル|coffee\s*(?:capsules?|pods?)|咖啡胶囊|咖啡膠囊|커피\s*캡슐)|(?:コーヒー?カプセル|coffee\s*(?:capsules?|pods?)|咖啡胶囊|咖啡膠囊|커피\s*캡슐).{0,45}(?:nespresso|ネスプレッソ|奈斯派索|네스프레소|dolce\s*gusto|ドルチェ\s*グスト|多趣酷思|돌체\s*구스토))/iu,['coffee capsules','coffee pods']],
  ['capsule-coffee-maker',/(?:カプセル式?コーヒーメーカー|capsule\s*coffee\s*(?:maker|machine)|胶囊咖啡机|膠囊咖啡機|캡슐\s*커피\s*머신)/iu,['capsule coffee machine']],
  ['camera-battery-charger',/(?:(?:カメラ|camera|相机|相機|카메라).{0,30}(?:バッテリー充電器|battery\s*charger|电池充电器|電池充電器|배터리\s*충전기)|(?:バッテリー充電器|battery\s*charger|电池充电器|電池充電器|배터리\s*충전기).{0,30}(?:カメラ|camera|相机|相機|카메라))/iu,['camera battery charger']],
  ['camera-battery',/(?:(?:sony|ソニー|索尼|소니|canon|キヤノン|佳能|캐논|nikon|ニコン|尼康|니콘|カメラ|camera|相机|相機|카메라).{0,45}(?:バッテリー|camera\s*(?:replacement\s*)?battery|相机电池|相機電池|배터리)|(?:バッテリー|camera\s*(?:replacement\s*)?battery|相机电池|相機電池|배터리).{0,45}(?:sony|ソニー|索尼|소니|canon|キヤノン|佳能|캐논|nikon|ニコン|尼康|니콘|カメラ|camera|相机|相機|카메라))/iu,['camera battery','replacement battery']],
  ['tool-battery-charger',/(?:(?:makita|マキタ|牧田|마끼다|dewalt|デウォルト|得伟|得偉|디월트|bosch|ボッシュ|博世|보쉬|milwaukee|ミルウォーキー|米沃奇|밀워키|電動工具|power\s*tool|电动工具|電動工具|전동\s*공구).{0,40}(?:バッテリー充電器|battery\s*charger|电池充电器|電池充電器|배터리\s*충전기)|(?:バッテリー充電器|battery\s*charger|电池充电器|電池充電器|배터리\s*충전기).{0,40}(?:makita|マキタ|牧田|마끼다|dewalt|デウォルト|得伟|得偉|디월트|bosch|ボッシュ|博世|보쉬|milwaukee|ミルウォーキー|米沃奇|밀워키|電動工具|power\s*tool|电动工具|電動工具|전동\s*공구))/iu,['power tool battery charger']],
  ['tool-battery',/(?:(?:makita|マキタ|牧田|마끼다|dewalt|デウォルト|得伟|得偉|디월트|bosch|ボッシュ|博世|보쉬|milwaukee|ミルウォーキー|米沃奇|밀워키|電動工具|power\s*tool|电动工具|電動工具|전동\s*공구).{0,45}(?:工具用?(?:交換)?バッテリー|電動工具用?バッテリー|power\s*tool\s*(?:replacement\s*)?battery|电动工具电池|電動工具電池|공구\s*배터리)|(?:工具用?(?:交換)?バッテリー|電動工具用?バッテリー|power\s*tool\s*(?:replacement\s*)?battery|电动工具电池|電動工具電池|공구\s*배터리).{0,45}(?:makita|マキタ|牧田|마끼다|dewalt|デウォルト|得伟|得偉|디월트|bosch|ボッシュ|博世|보쉬|milwaukee|ミルウォーキー|米沃奇|밀워키|電動工具|power\s*tool|电动工具|電動工具|전동\s*공구))/iu,['power tool battery','replacement tool battery']],
  ['label-tape',/(?:(?:brother|ブラザー|兄弟|브라더|p[- ]?touch|dymo|ダイモ|casio|カシオ|卡西欧|卡西歐|카시오|tepra|テプラ|锦宫|錦宮|킹짐).{0,45}(?:ラベル(?:ライター用)?テープ|label\s*tape|labeling\s*tape|标签带|標籤帶|라벨\s*테이프)|(?:ラベル(?:ライター用)?テープ|label\s*tape|labeling\s*tape|标签带|標籤帶|라벨\s*테이프).{0,45}(?:brother|ブラザー|兄弟|브라더|p[- ]?touch|dymo|ダイモ|casio|カシオ|卡西欧|卡西歐|카시오|tepra|テプラ|锦宫|錦宮|킹짐))/iu,['label tape cartridge','label maker tape']],
  ['label-maker',/(?:ラベルライター(?:本体)?|label\s*(?:maker|printer)|标签打印机|標籤打印機|라벨\s*프린터)/iu,['label maker','label printer']],
  ['air-fryer-liner',/(?:(?:air\s*fryer|エアフライヤー|空气炸锅|空氣炸鍋|에어프라이어).{0,35}(?:ライナー|liners?|纸垫|紙墊|라이너)|(?:ライナー|liners?|纸垫|紙墊|라이너).{0,35}(?:air\s*fryer|エアフライヤー|空气炸锅|空氣炸鍋|에어프라이어))/iu,['air fryer liner','air fryer basket liner']],
  ['air-fryer',/(?:エアフライヤー(?:本体)?|air\s*fryer(?:\s*(?:unit|appliance))?|空气炸锅|空氣炸鍋|에어프라이어(?:\s*본체)?)/iu,['air fryer']],
  ['vacuum-dust-bag',/(?:(?:miele|ミーレ|美诺|美諾|밀레|philips|フィリップス|飞利浦|飛利浦|필립스|bosch|ボッシュ|博世|보쉬|vacuum|掃除機|吸尘器|吸塵器|진공청소기).{0,45}(?:紙パック|ダストバッグ|dust\s*bags?|集尘袋|集塵袋|먼지\s*봉투)|(?:紙パック|ダストバッグ|dust\s*bags?|集尘袋|集塵袋|먼지\s*봉투).{0,45}(?:miele|ミーレ|美诺|美諾|밀레|philips|フィリップス|飞利浦|飛利浦|필립스|bosch|ボッシュ|博世|보쉬|vacuum|掃除機|吸尘器|吸塵器|진공청소기))/iu,['vacuum cleaner dust bags','vacuum bags']],
  ['vacuum-cleaner',/(?:掃除機(?:本体)?|vacuum\s*cleaner(?:\s*(?:unit|body))?|吸尘器|吸塵器|진공청소기(?:\s*본체)?)/iu,['vacuum cleaner']],
  ['laptop-case',/(?:(?:ノート(?:パソコン|PC)|ラップトップ|laptop|notebook(?:\s*computer)?|笔记本电脑|筆記型電腦|노트북).{0,12}(?:ケース|スリーブ|バッグ|ポーチ|case|sleeve|bag|pouch|包|套|파우치|케이스|가방))/iu,['laptop case','laptop sleeve']],
  ['laptop-stand',/(?:(?:ノート(?:パソコン|PC)|ラップトップ|laptop|notebook(?:\s*computer)?|笔记本电脑|筆記型電腦|노트북).{0,12}(?:スタンド|台|stand|holder|支架|거치대|스탠드))/iu,['laptop stand','notebook stand']],
  ['laptop-charger',/(?:(?:ノート(?:パソコン|PC)|ラップトップ|laptop|notebook(?:\s*computer)?|笔记本电脑|筆記型電腦|노트북).{0,12}(?:充電器|ACアダプター|charger|power\s*adapter|充电器|充電器|电源适配器|電源適配器|충전기|전원\s*어댑터))/iu,['laptop charger','power adapter']],
  ['usb4-dock',/(?:(?:usb\s*4).{0,24}(?:ドック|ドッキングステーション|dock(?:ing\s*station)?|扩展坞|擴充塢|도킹\s*스테이션)|(?:ドック|ドッキングステーション|dock(?:ing\s*station)?|扩展坞|擴充塢|도킹\s*스테이션).{0,24}(?:usb\s*4))/iu,['usb4 dock','usb 4 docking station']],
  ['thunderbolt-dock',/(?:(?:thunderbolt|サンダーボルト|雷电|雷電|썬더볼트)\s*[34]?.{0,24}(?:ドック|ドッキングステーション|dock(?:ing\s*station)?|扩展坞|擴充塢|도킹\s*스테이션)|(?:ドック|ドッキングステーション|dock(?:ing\s*station)?|扩展坞|擴充塢|도킹\s*스테이션).{0,24}(?:thunderbolt|サンダーボルト|雷电|雷電|썬더볼트)\s*[34]?)/iu,['thunderbolt dock','thunderbolt 4','thunderbolt 3']],
  ['usb-a-hub',/(?:(?:usb[- ]?a).{0,20}(?:ハブ|hub|集线器|集線器|허브)|(?:ハブ|hub|集线器|集線器|허브).{0,20}(?:usb[- ]?a))/iu,['usb-a hub','usb hub']],
  ['laptop-hub',/(?:(?:usb[- ]?c|type[- ]?c).{0,24}(?:ハブ|ドッキングステーション|hub|dock(?:ing\s*station)?|multi[- ]?(?:port\s*)?adapter|扩展坞|擴充塢|集线器|集線器|허브|도킹\s*스테이션)|(?:ハブ|ドッキングステーション|hub|dock(?:ing\s*station)?|multi[- ]?(?:port\s*)?adapter|扩展坞|擴充塢|集线器|集線器|허브|도킹\s*스테이션).{0,24}(?:usb[- ]?c|type[- ]?c))/iu,['usb-c hub','usb type-c','docking station','multiport adapter','multi adapter']],
  ['laptop',/(ノート(?:パソコン|PC)|ラップトップ|laptop|notebook computer|笔记本电脑|筆記型電腦|노트북)/iu,['laptop','notebook computer']],
  ['tablet-case',/(?:(?:タブレット|iPad|アイパッド|苹果平板|蘋果平板|아이패드|tablet|平板电脑|平板電腦|태블릿).{0,24}(?:ケース|カバー|スリーブ|case|cover|sleeve|保护套|保護套|케이스|커버))/iu,['tablet case','tablet cover']],
  ['tablet-stand',/(?:(?:タブレット|tablet|平板电脑|平板電腦|태블릿).{0,12}(?:スタンド|台|stand|holder|支架|거치대|스탠드))/iu,['tablet stand']],
  ['tablet-stylus-tip',/(?:(?:Apple\s*Pencil|アップルペンシル|苹果笔|蘋果筆|애플\s*펜슬).{0,20}(?:交換\s*ペン先|替え芯|replacement\s*(?:tips?|nibs?)|替换笔尖|替換筆尖|교체\s*펜촉|펜촉)|(?:交換\s*ペン先|替え芯|replacement\s*(?:tips?|nibs?)|替换笔尖|替換筆尖|교체\s*펜촉|펜촉).{0,20}(?:Apple\s*Pencil|アップルペンシル|苹果笔|蘋果筆|애플\s*펜슬))/iu,['apple pencil tips','replacement nibs']],
  ['tablet-stylus-charger',/(?:(?:Apple\s*Pencil|アップルペンシル|苹果笔|蘋果筆|애플\s*펜슬).{0,24}(?:充電器|充電アダプター|charger|charging\s*adapter|充电器|充電器|充电转接器|充電轉接器|충전기|충전\s*어댑터)|(?:充電器|充電アダプター|charger|charging\s*adapter|充电器|充電器|充电转接器|充電轉接器|충전기|충전\s*어댑터).{0,24}(?:Apple\s*Pencil|アップルペンシル|苹果笔|蘋果筆|애플\s*펜슬))/iu,['apple pencil charger','charging adapter']],
  ['tablet-stylus',/(?:(?:タブレット|iPad|アイパッド|苹果平板|蘋果平板|아이패드|tablet|平板电脑|平板電腦|태블릿).{0,30}(?:Apple\s*Pencil|アップルペンシル|苹果笔|蘋果筆|애플\s*펜슬|スタイラス|ペン|stylus|触控笔|觸控筆|스타일러스\s*펜)|(?:Apple\s*Pencil|アップルペンシル|苹果笔|蘋果筆|애플\s*펜슬|スタイラス|stylus|触控笔|觸控筆|스타일러스\s*펜).{0,30}(?:タブレット|iPad|アイパッド|苹果平板|蘋果平板|아이패드|tablet|平板电脑|平板電腦|태블릿)|(?:Apple\s*Pencil|アップルペンシル|苹果笔|蘋果筆|애플\s*펜슬))/iu,['tablet stylus','apple pencil','stylus pen']],
  ['tablet-keyboard',/(?:(?:タブレット|iPad|アイパッド|苹果平板|蘋果平板|아이패드|tablet|平板电脑|平板電腦|태블릿).{0,30}(?:キーボード|keyboard|键盘|鍵盤|키보드)|(?:キーボード|keyboard|键盘|鍵盤|키보드).{0,30}(?:タブレット|iPad|アイパッド|苹果平板|蘋果平板|아이패드|tablet|平板电脑|平板電腦|태블릿))/iu,['tablet keyboard','bluetooth keyboard','wireless keyboard']],
  ['tablet-screen-protector',/(?:(?:タブレット|iPad|アイパッド|苹果平板|蘋果平板|아이패드|tablet|平板电脑|平板電腦|태블릿).{0,30}(?:保護フィルム|画面フィルム|ガラスフィルム|screen\s*protector|protective\s*film|tempered\s*glass|保护膜|保護膜|钢化膜|鋼化膜|액정\s*보호\s*필름|보호\s*필름|강화\s*유리))/iu,['tablet screen protector','tempered glass']],
  ['tablet-charger',/(?:(?:タブレット|iPad|アイパッド|苹果平板|蘋果平板|아이패드|tablet|平板电脑|平板電腦|태블릿).{0,30}(?:充電器|充電アダプター|charger|power\s*adapter|充电器|充電器|电源适配器|電源適配器|충전기|충전\s*어댑터)|(?:充電器|充電アダプター|charger|power\s*adapter|充电器|充電器|电源适配器|電源適配器|충전기|충전\s*어댑터).{0,30}(?:タブレット|iPad|アイパッド|苹果平板|蘋果平板|아이패드|tablet|平板电脑|平板電腦|태블릿))/iu,['tablet charger','power adapter','usb-c']],
  ['tablet',/(?:タブレット|\bipad\b|アイパッド|苹果平板|蘋果平板|아이패드|\btablet\b|平板电脑|平板電腦|태블릿)/iu,['tablet']],
  ['notebook',/(ノート(?!パソコン|PC)|手帳|罫線|notebook(?! computer)|文房具.*四角)/iu,['notebook','ruled']],
  ['harmonica',/(ハーモニカ|口.*音.*楽器|harmonica|(?=.*instrument)(?=.*(?:blow|mouth)).*|用嘴.{0,10}(?:吹|发声|發聲).{0,16}(?:乐器|樂器)|입으로.{0,10}(?:불|소리).{0,20}악기)/iu,['harmonica']],
  ['harmonica-c-minor',/(?:C|シー)[\s-]*(?:マイナー|minor)/iu,['c minor']],
  ['cable',/(ケーブル|USB.*線|つなぐ.*線|cable)/iu,['cable','usb']],
  ['pillow',/(クッション|枕|腰枕|pillow|ソファ.*ふわふわ)/iu,['pillow','cushion']],
  ['seasonal-pillow',/(?=.*(?:ソファ|sofa|沙发|沙發|소파))(?=.*(?:冬|クリスマス|wint(?:er|ry)|christmas|冬季|圣诞|聖誕|겨울|크리스마스)).*/iu,['christmas','winter','decorative pillow']],
  ['knife',/(ナイフ|刃物|knife|折りたた.*刃|折叠.{0,8}刀|折疊.{0,8}刀|접이식.{0,8}나이프|락백.{0,8}나이프)/iu,['knife','folding']],
  ['organizer',/(収納ケース|整理ボックス|収納.*箱|\borganizer\b|storage container|收纳盒|收納盒|수납함)/iu,['organizer','storage','container']],
  ['adapter',/(アダプター|変換.*端子|端子.*増やす|(?:ノート(?:PC|パソコン)).{0,16}(?:端子|ポート).{0,8}(?:たくさん|複数)|adapter|USB-C)/iu,['adapter','usb']],
  ['bath-light',/(浴室.*照明|洗面所.*鏡.*光|バスライト|bath light)/iu,['bath','light']],
  ['bath-six-light',/(?:6|六)(?:個|灯|燈)?.{0,8}(?:浴室|洗面).{0,8}(?:ライト|照明)|(?:浴室|洗面).{0,12}(?:6|六)(?:個|灯|燈)|(?:6|six)[- ]?light.{0,20}(?:bath|vanity)|(?:bath|vanity).{0,20}(?:6|six)[- ]?light|六灯.{0,12}(?:浴室|盥洗)|(?:浴室|盥洗).{0,12}六灯|6등.{0,20}(?:욕실|세면)|(?:욕실|세면).{0,24}6등/iu,['6-light','six light','vanity light']],
  ['humidifier',/(加湿器|humidifier)/iu,['humidifier']],
  ['umbrella-stand',/(傘立て|傘スタンド|umbrella stand|umbrella holder)/iu,['umbrella stand','umbrella holder']],
  ['umbrella',/(折りたたみ傘|傘(?!立て|スタンド|掛け|カバー|ケース)|umbrella(?! stand| holder| cover| case))/iu,['umbrella','folding']],
  ['fan-accessory',/(扇風機.{0,6}(?:カバー|フィルター|部品)|fan (?:cover|filter|part))/iu,['fan cover','fan filter','fan part']],
  ['fan',/(扇風機(?!.*(?:カバー|フィルター|部品))|USB.*ファン|羽根がない|bladeless fan)/iu,['fan','usb']],
  ['toner',/(化粧水|トナー|toner|skin lotion|토너|스킨|爽肤水|爽膚水)/iu,['toner','skin lotion']],
  ['serum',/(美容液|セラム|アンプル|essence|serum|ampoule|세럼|앰플|에센스|精华液|精華液)/iu,['serum','ampoule','essence']],
  ['moisturizer',/(保湿クリーム|フェイスクリーム|乳液|moisturi[sz]er|face cream|emulsion|수분크림|보습크림|로션|面霜|乳液)/iu,['moisturizer','face cream','emulsion']],
  ['sunscreen',/(日焼け止め|UVクリーム|サンクリーム|sunscreen|sun cream|선크림|자외선 차단|防晒|防曬)/iu,['sunscreen','sun cream','spf']],
  ['face-mask',/(フェイスパック|シートマスク|マスクパック|face mask|sheet mask|마스크팩|시트 마스크|面膜)/iu,['sheet mask','face mask','mask pack']],
  ['cleanser',/(クレンジング|洗顔|メイク落とし|cleansing|cleanser|클렌징|세안|洁面|潔面|卸妆|卸妝)/iu,['cleanser','cleansing','makeup remover']],
  ['cushion-foundation',/(クッションファンデ|クッションファンデーション|cushion foundation|쿠션 파운데이션|쿠션 팩트|气垫|氣墊)/iu,['cushion foundation','cushion compact']],
  ['foundation',/(ファンデーション|foundation|파운데이션|粉底)/iu,['foundation','base makeup']],
  ['eye-shadow',/(アイシャドウ|eye ?shadow|아이섀도|眼影)/iu,['eye shadow','eye palette']],
  ['blush',/(チーク|blush|블러셔|腮红|腮紅)/iu,['blush','cheek color']],
  ['mascara',/(マスカラ|mascara|마스카라|睫毛膏)/iu,['mascara']],
  ['eyeliner',/(アイライナー|eyeliner|아이라이너|眼线|眼線)/iu,['eyeliner']],
  ['nail-care',/(ネイル|マニキュア|ジェルネイル|nail polish|gel nail|네일|매니큐어|美甲|指甲油)/iu,['nail','nail polish','gel nail']],
  ['straw-holder',/(ストロー.*入れ|straw holder)/iu,['straw','holder']],
  ['jelly',/(ゼリー|グミ|jelly|gummy)/iu,['jelly','gummy']],
  ['massager',/(マッサージ機|肩.*乗せる|massager)/iu,['massager','neck','shoulder']],
  ['pet-fountain',/(犬.*水|ペット.*給水|water fountain)/iu,['pet','dog','fountain']],
  ['softener',/(柔軟剤|fabric softener)/iu,['fabric','softener']],
  ['radio',/(ラジオ|radio)/iu,['radio']],
  ['socks',/(靴下|ソックス|socks?|양말|袜子|襪子)/iu,['sock','socks','hosiery']],
  ['shoe-accessory',/(靴(?:箱|べら|紐|ひも|磨き|クリーム|ラック)|shoe (?:box|horn|lace|cream|rack))/iu,['shoe accessory','shoe care']],
  ['shoes',/(光る靴|靴(?!下|箱|べら|紐|ひも|磨き|クリーム|ラック)|シューズ|スニーカー|shoes?(?!\s*(?:box|horn|lace|cream|rack|care))|sneakers?|trainers?|运动鞋|運動鞋|鞋(?!盒|带|帶|油|架)|운동화|신발(?!장|끈))/iu,['shoe','sneaker']],
  ['lip-care',/(リップ(?:クリーム|バーム|ケア)|lip balm|lip care)/iu,['lip balm','lip care']],
  ['lip-color',/(リップ(?!クリーム|バーム|ケア)|口紅|ティント|lip tint|lipstick|립 틴트|립스틱|틴트|唇釉|口红|口紅)/iu,['lip','tint','lipstick']],
  ['t-shirt',/(Tシャツ|ティーシャツ|tee ?shirt|t-shirt|T恤|티셔츠)/iu,['t-shirt','tee']],
  ['life-jacket',/(ライフジャケット|救命胴衣|life\s*jackets?|personal\s+flotation\s+devices?|救生衣|구명조끼)/iu,['life jacket','personal flotation device']],
  ['jacket',/(ジャケット|(?<!life\s)jackets?|夹克|夾克|재킷)/iu,['jacket']],
  ['coat',/(トレンチコート|コート|\b(?:trench\s+)?coats?\b|风衣|風衣|外套|트렌치\s*코트|트렌치코트|코트)/iu,['coat','trench coat']],
  ['hoodie',/(パーカー|hoodies?|hooded\s+sweatshirts?|连帽衫|連帽衫|후드티|후디)/iu,['hoodie','hooded sweatshirt']],
  ['tops',/(トップス|ブラウス|シャツ|カットソー|\bblouse\b|\btops?\b)/iu,['top','blouse','shirt']],
  ['pants',/(パンツ|ズボン|デニム|ジーンズ|trousers?|pants|jeans|牛仔裤|牛仔褲|裤子|褲子|청바지|바지)/iu,['pants','trousers','jeans']],
  ['skirt',/(スカート|skirts?|半身裙|裙子|치마)/iu,['skirt']],
  ['dress',/(ワンピース|ドレス|dress|连衣裙|連衣裙|원피스)/iu,['dress']],
  ['bag',/(バッグ|かばん|鞄|トート|ショルダーバッグ|handbag|tote bag|shoulder bag)/iu,['bag','handbag','tote']],
  ['hat',/(帽子|キャップ|ハット|\bcap\b|\bhat\b)/iu,['hat','cap']]
];

const COLOR_RULES = [
  [/(黒|ブラック|black|黑色|검정|검은색|블랙)/iu,['black']],
  [/(白|ホワイト|white|白色|흰색|하얀색|화이트)/iu,['white']],
  [/(緑|グリーン|green|绿色|綠色|초록색|녹색|그린)/iu,['green']],
  [/(青|水色|ブルー(?!トゥース)|アクア|\bblue\b|\baqua\b|蓝色|藍色|파란색|블루(?!투스))/iu,['blue','aqua']],
  [/(ピンク|pink|粉色|粉红色|粉紅色|핑크)/iu,['pink']],
  [/(銀|シルバー|silver|银色|銀色|은색|실버)/iu,['silver']],
  [/(金色|ゴールド|gold|包金|금색|골드)/iu,['gold']],
  [/(茶色|ブラウン|brown|棕色|褐色|갈색|브라운)/iu,['brown']],
  [/(黄色|イエロー|yellow|黃色|노란색|옐로)/iu,['yellow']],
  [/(赤(?:色)?|レッド|\bred\b|红色|紅色|빨간색|레드)/iu,['red']],
  [/(紫(?:色)?|パープル|\bpurple\b|보라색|퍼플)/iu,['purple']],
  [/(オレンジ|\borange\b|橙色|주황색)/iu,['orange']],
  [/(ベージュ|\bbeige\b|米色|베이지)/iu,['beige']],
  [/(グレー|灰色|gray|grey|회색|그레이)/iu,['gray']],
  [/(透明|クリア|clear|transparent|透明色|투명)/iu,['clear','transparent']]
];

const MATERIAL_RULES = [
  ['material-leather', /(?:革|レザー|\bleather\b|皮革|真皮|가죽)/iu, ['leather']],
  ['material-nylon', /(?:ナイロン|\bnylon\b|尼龙|尼龍|나일론)/iu, ['nylon']],
  ['material-glass', /(?:ガラス|\bglass\b|玻璃|유리)/iu, ['glass']],
  ['material-fabric', /(?:布(?=製|地|の)|生地|ファブリック|\bfabric\b|\bcloth\b|布艺|布藝|패브릭|천)/iu, ['fabric','cloth']],
  ['material-metal', /(?:金属|メタル|スチール|\bmetal\b|\bsteel\b|金屬|금속|메탈)/iu, ['metal','steel']],
  ['material-wood', /(?:木製|木目|\bwood(?:en)?\b|木质|木質|원목|나무)/iu, ['wood','wooden']],
  ['material-silicone', /(?:シリコン|\bsilicone\b|硅胶|矽膠|실리콘)/iu, ['silicone']],
];

const MATERIAL_CATEGORY_ALLOWLIST = new Map([
  ['material-leather', new Set(['wallet', 'watch', 'backpack', 'bag'])],
  ['material-nylon', new Set(['backpack', 'bag'])],
  ['material-glass', new Set(['camera-filter'])],
  ['material-fabric', new Set()],
  ['material-metal', new Set()],
  ['material-wood', new Set(['organizer', 'home-use'])],
  ['material-silicone', new Set(['phone-case'])],
]);

const NEGATED_CATEGORY_TERMS = new Map([
  ['charger', /(?:充電器|チャージャー|charger|充电器|充電器|충전기)/iu],
  ['phone-case', /(?:スマホケース|携帯(?:ケース|カバー)|アイフォ(?:ン|ーン).{0,12}ケース|ギャラクシー.{0,12}ケース|エクスペリア.{0,12}ケース|アクオス.{0,12}ケース|(?:phone|mobile)\s*(?:case|cover)|iphone.{0,12}case|galaxy.{0,12}case|xperia.{0,12}case|aquos.{0,12}case|手机壳|手機殼|三星.{0,12}(?:壳|殼)|아이폰.{0,12}케이스|휴대폰\s*(?:케이스|커버)|스마트폰\s*(?:케이스|커버)|갤럭시.{0,12}케이스|엑스페리아.{0,12}케이스|아쿠오스.{0,12}케이스)/iu],
  ['laptop', /(?:ノートPC|ノートパソコン|laptop|笔记本电脑|筆記型電腦|노트북)/iu],
  ['umbrella', /(?:傘|umbrella|雨伞|雨傘|우산)/iu],
  ['camera', /(?:カメラ|camera|相机|相機|카메라)/iu],
  ['wallet', /(?:財布|wallet|钱包|錢包|지갑)/iu],
  ['pants', /(?:パンツ|ズボン|デニム|ジーンズ|trousers?|pants|jeans|牛仔裤|牛仔褲|裤子|褲子|청바지|바지)/iu],
  ['skirt', /(?:スカート|skirts?|半身裙|裙子|치마)/iu],
  ['t-shirt', /(?:Tシャツ|ティーシャツ|tee ?shirt|t-shirt|T恤|티셔츠)/iu],
  ['jacket', /(?:ジャケット|(?<!life\s)jackets?|夹克|夾克|재킷)/iu],
  ['coat', /(?:トレンチコート|コート|\b(?:trench\s+)?coats?\b|风衣|風衣|外套|트렌치\s*코트|트렌치코트|코트)/iu],
  ['hoodie', /(?:パーカー|hoodies?|hooded\s+sweatshirts?|连帽衫|連帽衫|후드티|후디)/iu],
]);

export function isNegatedSearchOccurrence(text, start, end) {
  const before = text.slice(Math.max(0, start - 24), start);
  const after = text.slice(end, end + 18);
  return /(?:not\s+(?:a|an|the)?|no|without|anything\s+but|不要|不是|不想要)\s*$/iu.test(before)
    || /^\s*(?:ではなく|じゃなく|ではない|以外|は不要|を除く|而不是|不要|말고|아니고|아닌|제외)/iu.test(after);
}

function isOnlyNegated(text, pattern) {
  const flags = [...new Set(`${pattern.flags}g`.split(''))].join('');
  const matcher = new RegExp(pattern.source, flags);
  let foundNegated = false;
  for (const match of text.matchAll(matcher)) {
    if (!isNegatedSearchOccurrence(text, match.index, match.index + match[0].length)) return false;
    foundNegated = true;
  }
  return foundNegated;
}

const CONTEXT_RE = /(TikTok|Instagram|インスタ|Twitter|SNS|動画|配信|スーパー|空港|免税店|コンビニ|文房具屋|友達|同僚|母|昔|子供の頃|どこかで見た)/iu;
const FUNCTION_RE = /(使う|洗う|温める|守る|つなぐ|増やす|入れる|収納|光る|音|充電|撮る|運動|飲む|背負う|折りたた)/u;
const SHAPE_RE = /(丸|四角|横長|細長|透明|小さ|大き|手のひら|棒|板|輪|ドーム|ふわふわ|凹凸)/u;
const EVIDENCE_STOPWORDS = new Set([
  'with', 'from', 'this', 'that', 'type', 'size', 'set', 'black', 'white',
  'silver', 'blue', 'green', 'yellow', 'minor', 'major'
]);

export function stripSearchBudget(value) {
  return String(value || '').normalize('NFKC')
    .replace(/(?:予算(?:は|が|で)?\s*)?(?:¥|￥)?\s*\d[\d,]*(?:\.\d+)?\s*円\s*(?:以下|未満|以内|まで|くらい|程度|前後)?/giu, ' ')
    .replace(/budget(?:\s+is|\s+of|\s*:)?\s*(?:under|below|less\s+than|up\s+to|within)?\s*(?:US\$|USD|\$)?\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:dollars?|USD))?/giu, ' ')
    .replace(/(?:under|below|less\s+than|up\s+to|within)\s*(?:(?:US\$|USD|\$)\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:dollars?|USD))?|\d[\d,]*(?:\.\d+)?\s*(?:dollars?|USD))/giu, ' ')
    .replace(/(?:US\$|USD|\$)\s*\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s*dollars?/giu, ' ')
    .replace(/(?:预算|預算)?\s*(?:不超过|不超過|低于|低於|少于|少於|最多)?\s*[¥￥]?\s*\d[\d,]*(?:\.\d+)?\s*(?:元|人民币|人民幣)\s*(?:以下|以内|以內)?/giu, ' ')
    .replace(/(?:예산(?:은|이|으로|:)?\s*)?(?:₩\s*)?\d[\d,]*(?:\.\d+)?\s*(?:만\s*)?원\s*(?:이하|미만|이내|까지|정도)?/giu, ' ')
    .replace(/\d{1,2}(?=\s*(?:歳|才|岁|歲|세))/giu, ' ')
    .replace(/\d{1,2}(?=\s*[- ]?\s*years?[- ]old)/giu, ' ')
    .replace(/(?:口コミ|レビュー)\s*\d[\d,]*(?:件)?(?:以上|超|超え)?|\d[\d,]*(?:件)?(?:以上|超|超え)?(?:の)?(?:口コミ|レビュー)/giu, ' レビュー ')
    .replace(/(?:over\s+|more\s+than\s+)?\d[\d,]*\s*(?:reviews?|ratings?|stars?)/giu, ' reviews ')
    .replace(/(?:评价|評價|评论|評論)\s*\d[\d,]*(?:条|條|个|個)?|\d[\d,]*(?:条|條|个|個)?(?:以上)?(?:评价|評價|评论|評論)/giu, ' 评价 ')
    .replace(/(?:리뷰|평점)\s*\d[\d,]*(?:개|건)?|\d[\d,]*(?:개|건)?(?:\s*이상)?\s*(?:리뷰|평점)/giu, ' 리뷰 ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function queryEvidenceTokens(text) {
  return [...new Set([
    ...(text.match(/[A-Za-z][A-Za-z0-9-]{3,}/g) || []),
    ...(text.match(/\b\d{3,}\b/g) || []),
    ...(text.match(/\d+(?:\.\d+)?(?:\s?[:x×]\s?\d+|\s?(?:mm|cm|inch|インチ|oz|オンス|l|個|灯|ピース))/giu) || [])
  ].map((token) => token.normalize('NFKC').toLowerCase())
    .filter((token) => !EVIDENCE_STOPWORDS.has(token)))];
}

function normalizedEvidenceText(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replaceAll('インチ', 'inch').replaceAll('オンス', 'oz')
    .replace(/lit(?:re|er)s?/g, 'l').replace(/[個灯ピース]/gu, '')
    .replace(/[^a-z0-9]+/g, '');
}

function candidateEvidenceMismatch(text, candidates) {
  const tokens = queryEvidenceTokens(text);
  const keyMatch = text.match(/\b([A-G])(?:\s|-)?(?:minor|major)|([A-G])(?:マイナー|メジャー)/iu);
  const requiredKey = String(keyMatch?.[1] || keyMatch?.[2] || '').toLowerCase();
  if (!tokens.length && !requiredKey) return false;
  return !candidates.slice(0, 3).some((candidate) => {
    const candidateText = `${candidate?.product_name || ''} ${candidate?.manufacturer || ''}`
      .normalize('NFKC').toLowerCase();
    const normalizedCandidate = normalizedEvidenceText(candidateText);
    const tokenMatches = tokens.filter((token) =>
      normalizedCandidate.includes(normalizedEvidenceText(token))).length;
    const tokenCoverage = tokens.length ? tokenMatches / tokens.length : 1;
    const keyCovered = !requiredKey || new RegExp(`\\b${requiredKey}(?:\\s|-)?(?:minor|major)\\b`, 'i').test(candidateText);
    return tokenCoverage >= 0.7 && keyCovered;
  });
}

export function semanticSearchGroups(value) {
  const text = String(value || '').normalize('NFKC');
  let groups = RULES.filter(([, pattern]) => pattern.test(text)).map(([category,, terms]) => ({ category, terms }));
  const robotVacuumMentioned = /(?:roomba|ルンバ|robot\s*vacuum|ロボット掃除機|扫地机器人|掃地機器人|로봇\s*청소기|룸바)/iu.test(text);
  const robotVacuumPartCount = [
    /(?:フィルター|filters?|滤网|濾網|필터)/iu,
    /(?:サイド\s*ブラシ|side\s*brush(?:es)?|边刷|邊刷|사이드\s*브러시)/iu,
    /(?:メイン\s*ブラシ|ローラー\s*ブラシ|main\s*brush|roller\s*brush|滚刷|滾刷|메인\s*브러시|롤러\s*브러시)/iu,
    /(?:紙パック|ダストバッグ|dust\s*bags?|集尘袋|集塵袋|먼지\s*봉투)/iu
  ].filter((pattern) => pattern.test(text)).length;
  if (robotVacuumMentioned && robotVacuumPartCount >= 2 && !groups.some((group) => group.category === 'robot-vacuum-parts-kit')) {
    groups.unshift({ category: 'robot-vacuum-parts-kit', terms: ['robot vacuum replacement parts kit','filter side brush roller'] });
  }
  groups = groups.filter((group) => {
    const terms = NEGATED_CATEGORY_TERMS.get(group.category);
    return !terms || !isOnlyNegated(text, terms);
  });
  const productCategories = new Set(groups.map((group) => group.category));
  groups.push(...MATERIAL_RULES
    .filter(([category, pattern]) => {
      const allowedCategories = MATERIAL_CATEGORY_ALLOWLIST.get(category);
      return pattern.test(text)
        && !isOnlyNegated(text, pattern)
        && [...allowedCategories].some((allowed) => productCategories.has(allowed));
    })
    .map(([category,, terms]) => ({ category, terms })));
  const specificCategories = new Set(groups.map((group) => group.category));
  if (specificCategories.has('camera-bag')) groups = groups.filter((group) => group.category !== 'bag');
  if (specificCategories.has('camera-filter')) groups = groups.filter((group) => group.category !== 'camera');
  if ([...specificCategories].some((category) => category.startsWith('robot-vacuum-'))) {
    groups = groups.filter((group) => group.category !== 'robot-vacuum');
  }
  if (specificCategories.has('robot-vacuum-parts-kit')) {
    groups = groups.filter((group) => !['robot-vacuum-filter','robot-vacuum-brush','robot-vacuum-bag'].includes(group.category));
  }
  if ([...specificCategories].some((category) => category.startsWith('cordless-vacuum-'))) {
    groups = groups.filter((group) => !['cordless-vacuum','charger'].includes(group.category));
  }
  if (specificCategories.has('air-purifier-filter')) groups = groups.filter((group) => group.category !== 'air-purifier');
  if (specificCategories.has('water-filter-cartridge')) groups = groups.filter((group) => group.category !== 'water-purifier');
  if (specificCategories.has('refrigerator-water-filter')) groups = groups.filter((group) => !['air-purifier-filter','air-purifier','water-filter-cartridge','water-purifier'].includes(group.category));
  if (specificCategories.has('dishwasher-detergent-tablet')) groups = groups.filter((group) => !['laundry-detergent-pod','home-use','tablet'].includes(group.category));
  if (specificCategories.has('laundry-detergent-pod')) groups = groups.filter((group) => !['dishwasher-detergent-tablet','home-use','softener'].includes(group.category));
  if (specificCategories.has('printer-ink')) groups = groups.filter((group) => !['printer','photo-printer'].includes(group.category));
  if (specificCategories.has('electric-toothbrush-head')) groups = groups.filter((group) => group.category !== 'electric-toothbrush');
  if (specificCategories.has('shaver-replacement-blade') || specificCategories.has('shaver-cleaning-cartridge')) groups = groups.filter((group) => group.category !== 'electric-shaver');
  if (specificCategories.has('camera-battery') || specificCategories.has('camera-battery-charger')) groups = groups.filter((group) => group.category !== 'camera');
  if (specificCategories.has('air-fryer-liner')) groups = groups.filter((group) => group.category !== 'air-fryer');
  if (specificCategories.has('vacuum-dust-bag')) groups = groups.filter((group) => !['vacuum-cleaner','home-use'].includes(group.category));
  if (specificCategories.has('t-shirt')) groups = groups.filter((group) => group.category !== 'tops');
  if (specificCategories.has('life-jacket')) groups = groups.filter((group) => group.category !== 'jacket');
  if (specificCategories.has('laptop-case')) groups = groups.filter((group) => group.category !== 'laptop');
  if (specificCategories.has('laptop-stand')) groups = groups.filter((group) => group.category !== 'laptop');
  if (specificCategories.has('laptop-charger')) groups = groups.filter((group) => !['laptop','charger','adapter'].includes(group.category));
  if (specificCategories.has('usb4-dock')) groups = groups.filter((group) => !['laptop','adapter'].includes(group.category));
  if (specificCategories.has('thunderbolt-dock')) groups = groups.filter((group) => !['laptop','adapter'].includes(group.category));
  if (specificCategories.has('usb-a-hub')) groups = groups.filter((group) => !['laptop','adapter'].includes(group.category));
  if (specificCategories.has('laptop-hub')) groups = groups.filter((group) => !['laptop','adapter'].includes(group.category));
  if (specificCategories.has('tablet-case')) groups = groups.filter((group) => group.category !== 'tablet');
  if (specificCategories.has('tablet-stand')) groups = groups.filter((group) => group.category !== 'tablet');
  if (specificCategories.has('tablet-stylus-tip')) groups = groups.filter((group) => !['tablet','tablet-stylus'].includes(group.category));
  if (specificCategories.has('tablet-stylus-charger')) groups = groups.filter((group) => !['tablet','tablet-stylus','charger','adapter'].includes(group.category));
  if (specificCategories.has('tablet-stylus')) groups = groups.filter((group) => group.category !== 'tablet');
  if (specificCategories.has('tablet-keyboard')) groups = groups.filter((group) => !['tablet','tablet-case','keyboard'].includes(group.category));
  if (specificCategories.has('tablet-screen-protector')) groups = groups.filter((group) => group.category !== 'tablet');
  if (specificCategories.has('tablet-charger')) groups = groups.filter((group) => !['tablet','charger','adapter'].includes(group.category));
  if (specificCategories.has('organizer')) groups = groups.filter((group) => group.category !== 'home-use');
  if (specificCategories.has('seasonal-pillow') && !specificCategories.has('pillow')) {
    groups.unshift({ category: 'pillow', terms: ['pillow','cushion'] });
  }
  if (specificCategories.has('lamp') && /布.{0,6}(?:傘|シェード)|fabric\s+shade|布艺灯罩|布藝燈罩|패브릭\s*갓/iu.test(text)) {
    groups = groups.filter((group) => group.category !== 'umbrella');
  }
  if (specificCategories.has('shampoo')) groups = groups.filter((group) => !['bottle','hair-treatment'].includes(group.category));
  if (
    groups.some((group) => group.category === 'adapter')
    && groups.some((group) => group.category === 'laptop')
    && /(?:for\s+(?:a\s+)?laptop|laptop\s+(?:adapter|hub)|ノート(?:PC|パソコン).{0,16}(?:端子|ポート)|笔记本电脑用|筆記型電腦用|노트북(?:에|용))/iu.test(text)
  ) {
    groups = groups.filter((group) => group.category !== 'laptop');
  }
  if (
    groups.some((group) => group.category === 'organizer')
    && /(?:冷蔵庫|冷凍庫|refrigerator|freezer|pantry|冰箱|冷藏|냉장고|냉동고)/iu.test(text)
  ) {
    groups.push({ category: 'organizer-location', terms: ['refrigerator','freezer','pantry'] });
  }
  if (
    groups.some((group) => group.category === 'shampoo')
    && /(?:3\s*-?\s*in\s*-?\s*1|three\s*-?\s*in\s*-?\s*one|hair.{0,12}body.{0,12}(?:one|single)\s+bottle|三合一|3合1|3\s*인\s*1|髪.{0,10}体.{0,10}(?:一本|1本).{0,6}洗|洗发.{0,10}(?:护发|護髮).{0,10}(?:沐浴|身体)|머리.{0,10}몸.{0,10}(?:하나|한\s*병))/iu.test(text)
  ) {
    groups.push({ category: 'shampoo-3-in-1', terms: ['3-in-1','conditioner','body wash'] });
  }
  // Natural descriptions often omit the formal product name. Recognize
  // combinations of an object/location and its head noun before falling back
  // to generic usage suggestions.
  if (
    /(?:ライト|照明|lamp|light)/iu.test(text)
    && /(?:机|卓上|デスク|テーブル|部屋|枕元|ベッド|色.{0,4}変|間接|desk|table|room|bedside|color)/iu.test(text)
    && !groups.some((group) => group.category === 'lamp')
  ) {
    groups.push({ category: 'lamp', terms: ['lamp', 'light'] });
  }
  const categories = new Set(groups.map((group) => group.category));
  if (categories.has('kitchen-use') && categories.has('electronics-use')) {
    groups = groups.filter((group) => !['kitchen-use','electronics-use'].includes(group.category));
    groups.unshift({ category: 'kitchen-appliance', terms: ['blender','mixer','toaster','kettle','coffee','juicer','chopper','cooktop','oven','grill','waffle','processor','cooker','fryer'] });
  }
  const specificIntent = groups.some((group) => [
    'steam-engine-model','dual-charger','ptz-network-camera','towel-warmer','camera-filter','bath-six-light',
    'shaver-cleaning-cartridge','shaver-replacement-blade','electric-shaver','coffee-capsule','capsule-coffee-maker',
    'camera-battery','camera-battery-charger','tool-battery','tool-battery-charger','label-tape','label-maker',
    'air-fryer-liner','air-fryer','vacuum-dust-bag','vacuum-cleaner','dishwasher-detergent-tablet','laundry-detergent-pod'
  ].includes(group.category)) || /(?:マイナス|flathead|slotted).{0,12}(?:ドライバー|screwdriver)|口.*音.*楽器|(?=.*instrument)(?=.*(?:blow|mouth)).*|用嘴.{0,10}(?:吹|发声|發聲).{0,16}(?:乐器|樂器)|입으로.{0,10}(?:불|소리).{0,20}악기/iu.test(text);
  const colors = specificIntent ? [] : COLOR_RULES
    .filter(([pattern]) => pattern.test(text) && !isOnlyNegated(text, pattern))
    .flatMap(([, terms]) => terms);
  if (colors.length) groups.push({ category: 'color', terms: [...new Set(colors)] });
  return groups;
}

export function inferCandidateCategory(candidate) {
  const text = `${candidate?.product_name || ''} ${candidate?.manufacturer || ''}`;
  return RULES.find(([, pattern]) => pattern.test(text))?.[0] || 'other';
}

export function analyzeSearchDecision(query, candidates = []) {
  const text = stripSearchBudget(query);
  const groups = semanticSearchGroups(text).filter((group) => group.category !== 'color');
  const hasColor = COLOR_RULES.some(([pattern]) => pattern.test(text));
  const hasContext = CONTEXT_RE.test(text);
  const hasFunction = FUNCTION_RE.test(text);
  const hasShape = SHAPE_RE.test(text);
  const hasModel = /(?:[A-Z]{2,}[- ]?\d{2,}|\d+(?:mm|cm|inch|インチ|オンス|oz|L|枚|個|灯))/iu.test(text);
  const distinctiveLatin = (text.match(/[A-Za-z][A-Za-z0-9-]{3,}/g) || []).filter((token) => !/^(with|from|this|that|type|size)$/i.test(token)).length > 0;
  const hasGuidedSelection = /\s\/\s/u.test(text);
  const inferredSeasonalPillow = groups.some((group) => group.category === 'seasonal-pillow')
    && !/(?:クッション|枕|pillow|cushion|抱枕|쿠션|베개)/iu.test(text);
  const categories = [...new Set(candidates.slice(0, 3).map(inferCandidateCategory).filter((value) => value !== 'other'))];
  const score = Math.min(10, groups.length * 2 + Number(groups.some((group) => group.category === 'kitchen-appliance')) * 2 + Number(hasFunction) + Number(hasShape) + Number(hasColor) + Number(hasModel) * 3 + Number(distinctiveLatin) * 3 + Number(hasGuidedSelection) * 2);
  const divergent = categories.length >= 2;
  const evidenceMismatch = candidates.length > 0 && candidateEvidenceMismatch(text, candidates);
  const vagueDescription = !hasModel && !distinctiveLatin && !hasGuidedSelection
    && (hasContext || /(?:やつ|もの|物)$/u.test(text.trim())
      || inferredSeasonalPillow
      || /口.*音.*楽器|用嘴.{0,10}(?:吹|发声|發聲).{0,16}(?:乐器|樂器)|입으로.{0,10}(?:불|소리).{0,20}악기/iu.test(text));
  const lowConfidence = candidates.length === 0 || score < 5 || divergent || evidenceMismatch || vagueDescription;
  const contextOnly = (hasContext || hasColor) && groups.length === 0 && !hasFunction;
  let clarificationQuestion = '';
  if (divergent) clarificationQuestion = `探しているものは「${categories[0]}」と「${categories[1]}」のどちらに近いですか？`;
  else if (groups.length === 0) clarificationQuestion = 'それは何に使うものですか？';
  else if (lowConfidence) clarificationQuestion = '色・大きさ・素材のうち、もう一つ覚えている特徴はありますか？';
  return {
    confidence: lowConfidence ? 'low' : score >= 6 ? 'high' : 'medium',
    information_score: score,
    candidate_categories: categories,
    needs_clarification: lowConfidence,
    clarification_question: lowConfidence ? clarificationQuestion : '',
    offer_mywish: candidates.length === 0 || contextOnly,
    reason: divergent ? 'CATEGORY_DIVERGENCE' : candidates.length === 0 ? 'NO_CANDIDATES' : evidenceMismatch ? 'EVIDENCE_MISMATCH' : score < 5 || vagueDescription ? 'LOW_INFORMATION' : 'SUFFICIENT_INFORMATION'
  };
}

export const searchIntelligenceRulesForTest = RULES;
