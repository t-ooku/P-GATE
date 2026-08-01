const PRODUCT_TYPES = [
  ['キーボードケース', /(?:キーボード\s*ケース|keyboard\s*case|键盘\s*保护套|鍵盤\s*保護套|키보드\s*케이스)/iu],
  ['キーボード', /(?:キーボード|keyboard|键盘|鍵盤|키보드)/iu],
  ['モバイルバッテリー', /(?:モバイルバッテリー|携帯バッテリー|power\s*bank|portable\s+(?:battery|charger)|充电宝|充電寶|移动电源|行動電源|보조\s*배터리)/iu],
  ['ケーブル', /(?:充電ケーブル|充電コード|ライトニングケーブル|lightning\s*(?:cable|cord)|usb[- ]?c\s*(?:cable|cord)|charging\s*(?:cable|cord)|数据线|數據線|充电线|充電線|충전\s*케이블|라이트ニング\s*케이블)/iu],
  ['イヤホン', /(?:イヤホン|ヘッドホン|earphones?|earbuds?|headphones?|耳机|耳機|이어폰|헤드폰)/iu],
  ['充電器', /(?:充電器|充電台|チャージャー|充電アダプター|acアダプター|charger|charging\s*station|power\s*adapter|充电器|充電器|充电座|充電座|충전기|충전\s*어댑터)/iu],
  ['保護フィルム', /(?:保護フィルム|画面フィルム|ガラスフィルム|screen\s*protector|protective\s*film|tempered\s*glass|保护膜|保護膜|钢化膜|鋼化膜|보호\s*필름|강화\s*유리)/iu],
  ['スタンド', /(?:スマホスタンド|携帯スタンド|phone\s*stand|mobile\s*stand|phone\s*holder|支架|手机架|手機架|거치대|스탠드)/iu],
  ['ケース', /(?:casetify|ケース|カバー|case|cover|手机壳|手機殼|保护壳|保護殼|케이스|커버)/iu],
];

function deviceName(query) {
  const ipad = query.match(/\bipad(?:\s*(?:air|pro|mini))?(?:\s*(?:m[1-9]|\d+(?:st|nd|rd|th)?\s*(?:generation|gen)))?/iu);
  if (ipad) return ipad[0].replace(/^ipad/iu, 'iPad').replace(/\s+/gu, ' ').trim();
  const localizedIpad = query.match(/(?:アイパッド|苹果平板|蘋果平板|아이패드)(?:\s*(air|pro|mini|エア|プロ|에어|프로))?/iu);
  if (localizedIpad) {
    const model = String(localizedIpad[1] || '').toLowerCase();
    const canonicalModel = /(?:air|エア|에어)/u.test(model) ? 'Air'
      : /(?:pro|プロ|프로)/u.test(model) ? 'Pro'
      : model === 'mini' ? 'mini' : '';
    return `iPad${canonicalModel ? ` ${canonicalModel}` : ''}`;
  }
  const iphone = query.match(/\biphone(?:\s*(\d{1,2})(?!\d)(?:\s*(?:pro|max|plus|mini)){0,2})?/iu);
  if (iphone) return iphone[0].replace(/^iphone/iu, 'iPhone').trim();
  const localizedIphone = query.match(/(?:アイフォーン|アイフォン|苹果手机|蘋果手機|아이폰)(?:\s*(\d{1,2}(?!\d)(?:\s*(?:pro|max|plus|mini))*))?/iu);
  if (localizedIphone) return localizedIphone[1] ? `iPhone ${localizedIphone[1].trim()}` : 'iPhone';
  const galaxy = query.match(/\bgalaxy(?:\s*[a-z]\d{1,3}(?:\s*(?:ultra|plus|\+|fe))?)?/iu);
  if (galaxy) return galaxy[0].replace(/^galaxy/iu, 'Galaxy').trim();
  const localizedGalaxy = query.match(/(?:ギャラクシー|三星(?:手机|手機)?|갤럭시)\s*([a-z]\d{1,3}(?:\s*(?:ultra|plus|\+|fe))?)/iu);
  if (localizedGalaxy) return `Galaxy ${localizedGalaxy[1].trim()}`;
  const pixel = query.match(/\bpixel(?:\s*\d{1,2}(?!\d)(?:\s*(?:pro|fold|a))?)?/iu);
  if (pixel) return pixel[0].replace(/^pixel/iu, 'Pixel').trim();
  const localizedPixel = query.match(/픽셀(?:\s*\d{1,2}(?!\d)(?:\s*(?:pro|fold|a))?)?/iu);
  if (localizedPixel) return localizedPixel[0].replace(/^픽셀/iu, 'Pixel').trim();
  const xperia = query.match(/\bxperia\s*((?:1|5|10)\s*(?:vi|v|iv|iii|ii)?)/iu);
  if (xperia) return `Xperia ${xperia[1].trim()}`;
  const localizedXperia = query.match(/(?:エクスペリア|엑스페리아)\s*((?:1|5|10)\s*(?:vi|v|iv|iii|ii)?)/iu);
  if (localizedXperia) return `Xperia ${localizedXperia[1].trim()}`;
  const aquos = query.match(/\baquos\s*((?:sense|wish|r)\s*\d{1,2})/iu);
  if (aquos) return `AQUOS ${aquos[1].replace(/\s+/gu, '')}`;
  const localizedAquos = query.match(/(?:アクオス|아쿠오스)\s*((?:sense|wish|r)\s*\d{1,2})/iu);
  if (localizedAquos) return `AQUOS ${localizedAquos[1].replace(/\s+/gu, '')}`;
  if (/(?:\bandroid\b|安卓|안드로이드)/iu.test(query)) return 'Android';
  return '';
}

function applePencilGeneration(query) {
  const match = String(query || '').match(/(?:第\s*([123])\s*世代|([123])(?:st|nd|rd|th)?\s*(?:generation|gen)|第\s*([123])\s*代|([123])\s*세대)/iu);
  const generation = match?.[1] || match?.[2] || match?.[3] || match?.[4];
  return generation ? `第${generation}世代` : '';
}

function buildApplePencilSearchKeywords(query) {
  if (!/(?:Apple\s*Pencil|アップルペンシル|苹果笔|蘋果筆|애플\s*펜슬)/iu.test(query)) return '';
  const device = deviceName(query);
  const generation = applePencilGeneration(query);
  const product = /(?:交換\s*ペン先|替え芯|replacement\s*(?:tips?|nibs?)|替换笔尖|替換筆尖|교체\s*펜촉|펜촉)/iu.test(query)
    ? 'Apple Pencil 交換ペン先'
    : /(?:充電器|充電アダプター|charger|charging\s*adapter|充电器|充電器|充电转接器|充電轉接器|충전기|충전\s*어댑터)/iu.test(query)
      ? 'Apple Pencil 充電アダプター'
      : 'Apple Pencil';
  const usbC = /usb[- ]?c/iu.test(query) ? 'USB-C' : '';
  return [device, product, generation, usbC].filter(Boolean).join(' ');
}

function portHubFeatures(query) {
  const features = [];
  const power = query.match(/(?:pd\s*)?(\d{2,3})\s*w(?:\s*pd)?/iu);
  if (power) features.push(`${power[1]}W`);
  const hdmi = query.match(/hdmi(?:\s*|[- ]?)(\d(?:\.\d)?)/iu);
  if (hdmi) features.push(`HDMI ${hdmi[1]}`);
  else if (/\bhdmi\b/iu.test(query)) features.push('HDMI');
  if (/(?:有線LAN|ethernet|rj[- ]?45|以太网|乙太網|유선\s*랜|이더넷)/iu.test(query)) features.push('有線LAN');
  if (/(?:SD\s*カード|SD\s*card|读卡器|讀卡器|SD卡|SD\s*카드|카드\s*리더)/iu.test(query)) features.push('SDカード');
  const ports = query.match(/(?:([2-9])\s*(?:ポート|ports?|口|포트)|(?:four|四|네)\s*(?:ports?|ポート|口|포트))/iu);
  if (ports) features.push(`${ports[1] || '4'}ポート`);
  return [...new Set(features)];
}

function buildPortHubSearchKeywords(query, marketplace) {
  const thunderbolt = query.match(/(?:thunderbolt|サンダーボルト|雷电|雷電|썬더볼트)\s*([34])?/iu);
  const dock = /(?:ドック|ドッキングステーション|dock(?:ing\s*station)?|扩展坞|擴充塢|도킹\s*스테이션)/iu.test(query);
  let product = '';
  if (thunderbolt && dock) product = `Thunderbolt${thunderbolt[1] ? ` ${thunderbolt[1]}` : ''} ドック`;
  else if (/usb[- ]?a/iu.test(query) && /(?:ハブ|hub|集线器|集線器|허브)/iu.test(query)) product = 'USB-Aハブ';
  if (!product) return '';
  const limit = marketplace === 'QOO10_JP' ? 2 : 5;
  return [product, ...portHubFeatures(query).slice(0, limit)].join(' ');
}

function specificationTokens(query) {
  const matches = query.match(
    /(?:usb[- ]?c|lightning|magsafe|qi2?|pd\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?){1,2}[-\s]*(?:mm|cm|m|インチ|inch|英寸|인치|毫米|厘米|センチ(?:メートル)?|ミリ(?:メートル)?|센티미터|밀리미터)|\d+(?:\.\d+)?[-\s]*(?:w|mah|gb|tb|mm|cm|ml|l|oz|m|kg|kgs|g|kilograms?|kilogrammes?|grams?|インチ|inch|英寸|인치|リットル|オンス|升|毫升|毫米|厘米|センチ(?:メートル)?|ミリ(?:メートル)?|キロ(?:グラム)?|グラム|公斤|千克|리터|온스|센티미터|밀리미터|킬로그램|키로|그램)|\d+\s*(?:個(?:入り)?セット|本セット|枚セット|[- ]?(?:pack|count|pcs|pieces)|件套|个装|個裝|개입|개\s*세트))/giu
  ) || [];
  return [...new Set(matches
    .filter((value) => {
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return !isNegatedAttribute(query, new RegExp(escaped, 'iu'));
    })
    .map((value) => value.replace(/\s+/g, '')
    .replace(/[×]/gu, 'x')
    .replace(/^usb-c$/iu, 'USB-C')
    .replace(/毫米|ミリ(?:メートル)?|밀리미터$/u, 'mm')
    .replace(/厘米|センチ(?:メートル)?|센티미터$/u, 'cm')
    .replace(/英寸|인치$/u, 'インチ')
    .replace(/-?inch(?:es)?$/iu, 'インチ')
    .replace(/キロ(?:グラム)?|公斤|千克|킬로그램|키로$/u, 'kg')
    .replace(/グラム|그램$/u, 'g')
    .replace(/kilogrammes?|kilograms?|kgs?$/iu, 'kg')
    .replace(/grams?$/iu, 'g')
    .replace(/リットル|升|리터$/u, 'L')
    .replace(/オンス|온스$/u, 'oz')
    .replace(/毫升$/u, 'ml')
    .replace(/^(\d+)(?:個(?:入り)?セット|本セット|枚セット|[-]?(?:pack|count|pcs|pieces)|件套|个装|個裝|개입|개세트)$/iu, '$1個セット')))].slice(0, 4);
}

export function buildDeviceAccessorySearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const device = deviceName(normalized);
  if (!device) return '';
  const product = PRODUCT_TYPES.find(([, pattern]) =>
    pattern.test(normalized) && !isNegatedAttribute(normalized, pattern));
  if (!product) return '';
  const label = product[0];
  const base = label === 'ケース' && device.startsWith('iPhone')
    ? `${device}ケース`
    : `${device} ${label}`;
  const specifications = specificationTokens(normalized)
    .filter((token) => !base.toLowerCase().includes(token.toLowerCase()));
  const materials = matchedMaterials(normalized)
    .filter((token) => !(label === '保護フィルム' && token === 'ガラス'));
  const attributes = matchedAttributes(normalized)
    .filter((token) => token === '透明' && !materials.includes(token));
  const conditions = [...new Set([...specifications, ...materials, ...attributes])].slice(0, 3);
  return [base, ...conditions].join(' ');
}

function stripSearchBudget(value) {
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

const GENERIC_PRODUCTS = [
  ['バックパック', /(?:リュック|バックパック|backpack|rucksack|背包|双肩包|雙肩包|백팩|배낭)/iu],
  ['カメラフィルター', /(?:カメラ|レンズ|camera|lens|相机|相機|镜头|鏡頭|카메라|렌즈).{0,16}(?:フィルター|filters?|滤镜|濾鏡|필터)/iu],
  ['収納ボックス', /(?:収納(?:ボックス|ケース|箱)|整理(?:ボックス|ケース)|storage\s*(?:box|container)|organizer|收纳盒|收納盒|수납함)/iu],
  ['ペット給水器', /(?:ペット|犬|猫).{0,10}(?:給水|水飲み)|pet\s*(?:water\s*)?fountain|반려동물\s*급수기|宠物饮水机|寵物飲水機/iu],
  ['加湿器', /(?:加湿器|humidifier|加湿机|加濕器|가습기)/iu],
  ['日焼け止め', /(?:日焼け止め|UVクリーム|サンクリーム|sunscreen|sun\s*cream|防晒|防曬|선크림)/iu],
  ['美容液', /(?:美容液|セラム|アンプル|serum|ampoule|精华液|精華液|세럼|앰플)/iu],
  ['シートマスク', /(?:フェイスパック|シートマスク|face\s*mask|sheet\s*mask|面膜|마스크팩)/iu],
  ['シャンプー', /(?:シャンプー|shampoo|洗发水|洗髮精|샴푸)/iu],
  ['財布', /(?:財布|ウォレット|wallet|钱包|錢包|지갑)/iu],
  ['キーボード', /(?:キーボード|keyboard|键盘|鍵盤|키보드)/iu],
  ['マウス', /(?:パソコン|PC|computer).{0,10}マウス|computer\s*mouse|trackball|电脑鼠标|電腦滑鼠|컴퓨터\s*마우스/iu],
  ['ノートPCケース', /(?:(?:ノート(?:パソコン|PC)|ラップトップ|laptop|notebook(?:\s*computer)?|笔记本电脑|筆記型電腦|노트북).{0,12}(?:ケース|スリーブ|バッグ|ポーチ|case|sleeve|bag|pouch|包|套|파우치|케이스|가방))/iu],
  ['ノートPCスタンド', /(?:(?:ノート(?:パソコン|PC)|ラップトップ|laptop|notebook(?:\s*computer)?|笔记本电脑|筆記型電腦|노트북).{0,12}(?:スタンド|台|stand|holder|支架|거치대|스탠드))/iu],
  ['ノートPC充電器', /(?:(?:ノート(?:パソコン|PC)|ラップトップ|laptop|notebook(?:\s*computer)?|笔记本电脑|筆記型電腦|노트북).{0,12}(?:充電器|ACアダプター|charger|power\s*adapter|充电器|充電器|电源适配器|電源適配器|충전기|전원\s*어댑터))/iu],
  ['USB-Cハブ', /(?:(?:usb[- ]?c|type[- ]?c).{0,24}(?:ハブ|ドッキングステーション|hub|dock(?:ing\s*station)?|multi[- ]?(?:port\s*)?adapter|扩展坞|擴充塢|集线器|集線器|허브|도킹\s*스테이션)|(?:ハブ|ドッキングステーション|hub|dock(?:ing\s*station)?|multi[- ]?(?:port\s*)?adapter|扩展坞|擴充塢|集线器|集線器|허브|도킹\s*스테이션).{0,24}(?:usb[- ]?c|type[- ]?c))/iu],
  ['ノートパソコン', /(?:ノートパソコン|ノートPC|ラップトップ|laptop|notebook\s*computer|笔记本电脑|筆記型電腦|노트북)/iu],
  ['タブレットケース', /(?:(?:タブレット|tablet|平板电脑|平板電腦|태블릿).{0,12}(?:ケース|カバー|スリーブ|case|cover|sleeve|保护套|保護套|케이스|커버))/iu],
  ['タブレットスタンド', /(?:(?:タブレット|tablet|平板电脑|平板電腦|태블릿).{0,12}(?:スタンド|台|stand|holder|支架|거치대|스탠드))/iu],
  ['タブレット用ペン', /(?:(?:タブレット|tablet|平板电脑|平板電腦|태블릿).{0,16}(?:スタイラス|ペン|stylus|触控笔|觸控筆|스타일러스\s*펜)|(?:スタイラス|stylus|触控笔|觸控筆|스타일러스\s*펜).{0,20}(?:タブレット|tablet|平板电脑|平板電腦|태블릿))/iu],
  ['タブレット用キーボード', /(?:(?:タブレット|tablet|平板电脑|平板電腦|태블릿).{0,18}(?:キーボード|keyboard|键盘|鍵盤|키보드)|(?:キーボード|keyboard|键盘|鍵盤|키보드).{0,20}(?:タブレット|tablet|平板电脑|平板電腦|태블릿))/iu],
  ['タブレット保護フィルム', /(?:(?:タブレット|tablet|平板电脑|平板電腦|태블릿).{0,18}(?:保護フィルム|画面フィルム|ガラスフィルム|screen\s*protector|protective\s*film|tempered\s*glass|保护膜|保護膜|钢化膜|鋼化膜|액정\s*보호\s*필름|보호\s*필름|강화\s*유리))/iu],
  ['タブレット充電器', /(?:(?:タブレット|tablet|平板电脑|平板電腦|태블릿).{0,18}(?:充電器|充電アダプター|charger|power\s*adapter|充电器|充電器|电源适配器|電源適配器|충전기|충전\s*어댑터)|(?:充電器|充電アダプター|charger|power\s*adapter|充电器|充電器|电源适配器|電源適配器|충전기|충전\s*어댑터).{0,20}(?:タブレット|tablet|平板电脑|平板電腦|태블릿))/iu],
  ['タブレット', /(?:タブレット|\btablet\b|平板电脑|平板電腦|태블릿)/iu],
  ['キャンドル', /(?:キャンドル|ろうそく|candle|蜡烛|蠟燭|캔들|향초)/iu],
  ['デュアル充電器', /(?:2|二|両|两|兩)[台個]?(?:を|の)?(?:置ける|同時)?.{0,12}(?:充電台|充電器)|(?:two\s+devices?.{0,16}charg|charg(?:er|ing\s+dock).{0,28}two\s+devices?|dual\s+charg)|双充电|雙充電|双设备充电|雙設備充電|(?:2대|두\s*대|듀얼).{0,12}충전/iu],
  ['PTZ ネットワークカメラ', /(?:首振り|PTZ|パンチルト).{0,12}(?:ネットワーク|監視)?カメラ|(?:ネットワーク|監視)カメラ.{0,12}(?:首振り|PTZ|ドーム)|(?:ptz|pan\s+and\s+tilt).{0,20}(?:network|security)?\s*camera|(?:network|security)\s*camera.{0,24}(?:ptz|dome|pan\s+and\s+tilt)|云台.{0,12}(?:网络|網絡|监控|監控)摄像|(?:网络|網絡|监控|監控)摄像.{0,12}(?:云台|雲台|球形)|(?:PTZ|회전).{0,20}(?:네트워크|보안)\s*카메라|(?:네트워크|보안)\s*카메라.{0,20}(?:PTZ|회전|돔)/iu],
  ['タオルウォーマー', /(?:タオルウォーマー|towel\s*warmer|毛巾加热器|毛巾加熱器|타월\s*워머)/iu],
  ['タオルウォーマー', /(?:浴室|お風呂).{0,12}(?:壁|棒|ラック).{0,8}温か|(?:warm|heated).{0,12}(?:metal\s+)?bars?.{0,20}bathroom|bathroom.{0,20}(?:warm|heated).{0,12}bars?|浴室.{0,16}(?:发热.{0,6}金属杆|發熱.{0,6}金屬桿)|욕실.{0,16}따뜻.{0,8}(?:금속\s*)?막대/iu],
  ['香り付きボディパウダー', /(?:香り|いい匂い).{0,8}(?:粉|パウダー)|dusting\s*powder|perfumed\s*powder|(?:nice[- ]smelling|scented|fragrant).{0,8}powder|香味.{0,8}(?:粉|爽身粉)|향기.{0,8}(?:파우더|분말)/iu],
  ['ハーモニカ', /(?:ハーモニカ|口.*音.*楽器|harmonica|(?=.*instrument)(?=.*(?:blow|mouth)).*|用嘴.{0,10}(?:吹|发声|發聲).{0,16}(?:乐器|樂器)|입으로.{0,10}(?:불|소리).{0,20}악기)/iu],
  ['冬 クッション', /(?=.*(?:ソファ|sofa|沙发|沙發|소파))(?=.*(?:冬|クリスマス|wint(?:er|ry)|christmas|冬季|圣诞|聖誕|겨울|크리스마스)).*/iu],
  ['浴室 6灯 照明', /(?:6|六)(?:個|灯|燈)?.{0,8}(?:浴室|洗面).{0,8}(?:ライト|照明)|(?:浴室|洗面).{0,12}(?:6|六)(?:個|灯|燈)|(?:6|six)[- ]?light.{0,20}(?:bath|vanity)|(?:bath|vanity).{0,20}(?:6|six)[- ]?light|六灯.{0,12}(?:浴室|盥洗)|(?:浴室|盥洗).{0,12}六灯|6등.{0,20}(?:욕실|세면)|(?:욕실|세면).{0,24}6등/iu],
  ['変換アダプター', /(?:変換アダプター|変換端子|adapter|转接器|轉接器|변환\s*어댑터)/iu],
  ['靴下 socks', /(?:靴下|ソックス|socks?|袜子|襪子|양말)/iu],
  ['帽子', /(?:帽子|キャップ|ハット|\bcap\b|\bhat\b|帽子|모자)/iu],
  ['ネックレス', /(?:ネックレス|necklace|项链|項鍊|목걸이)/iu],
  ['フィギュア', /(?:フィギュア|figure|collectible|手办|手辦|피규어)/iu],
  ['調理家電', /(?:ブレンダー|ミキサー|トースター|電気ケトル|コーヒーメーカー|ホットプレート|エアフライヤー|air\s*fryer|blender|toaster|electric\s*kettle|空气炸锅|空氣炸鍋|에어프라이어)/iu],
  ['さつまいもチップス', /(?:さつまいも|サツマイモ|紫いも|紫芋|sweet\s*potato|고구마|红薯|紅薯).{0,12}(?:チップス|chips?|칩|脆片)|(?:チップス|chips?|칩|脆片).{0,12}(?:さつまいも|サツマイモ|紫いも|紫芋|sweet\s*potato|고구마|红薯|紅薯)/iu],
  ['ポテトチップス', /(?:ポテトチップス|potato\s*chips?|감자칩|薯片)/iu],
  ['グミ', /(?:グミ|gummy|gummies|젤리|软糖|軟糖)/iu],
  ['シリアル', /(?:シリアル|グラノーラ|cereal|granola|시리얼|麦片|麥片)/iu],
  ['写真プリンター', /(?:写真プリンター|フォトプリンター|photo\s*printer|照片打印机|照片打印機|포토\s*프린터)/iu],
  ['イヤホン', /(?:イヤホン|イヤーバッド|earphones?|earbuds?|耳机|耳機|이어폰)/iu],
  ['スマホケース', /(?:スマホケース|携帯ケース|phone\s*case|手机壳|手機殼|휴대폰\s*케이스)/iu],
  ['折りたたみ傘', /(?:折りたたみ(?:傘|日傘)|folding\s*(?:umbrella|parasol)|折叠伞|折疊傘|접이식\s*(?:우산|양산))/iu],
  ['カメラ', /(?:アクションカメラ|デジタルカメラ|camera|相机|相機|카메라)/iu],
  ['バッグ', /(?:バッグ|かばん|bag|pouch|包包|背包|手提包|單肩包|单肩包|가방)/iu],
  ['スニーカー', /(?:スニーカー|運動靴|シューズ|sneakers?|trainers?|shoes?(?!\s*(?:box|horn|lace|cream|rack|care))|运动鞋|運動鞋|鞋(?!盒|带|帶|油|架)|운동화|신발(?!장|끈))/iu],
  ['ワンピース', /(?:ワンピース|dress|连衣裙|連衣裙|원피스)/iu],
  ['パンツ', /(?:パンツ|ズボン|デニム|ジーンズ|trousers?|pants|jeans|牛仔裤|牛仔褲|裤子|褲子|청바지|바지)/iu],
  ['スカート', /(?:スカート|skirts?|半身裙|裙子|치마)/iu],
  ['Tシャツ', /(?:Tシャツ|ティーシャツ|t[- ]?shirts?|tee\s*shirts?|T恤|티셔츠)/iu],
  ['ライフジャケット', /(?:ライフジャケット|救命胴衣|life\s*jackets?|personal\s+flotation\s+devices?|救生衣|구명조끼)/iu],
  ['ジャケット', /(?:ジャケット|(?<!life\s)jackets?|夹克|夾克|재킷)/iu],
  ['コート', /(?:トレンチコート|コート|\b(?:trench\s+)?coats?\b|风衣|風衣|外套|트렌치\s*코트|트렌치코트|코트)/iu],
  ['パーカー', /(?:パーカー|hoodies?|hooded\s+sweatshirts?|连帽衫|連帽衫|후드티|후디)/iu],
  ['トップス', /(?:トップス|シャツ|ブラウス|\btops?\b|\bshirts?\b|\bblouse\b|上衣|셔츠|블라우스)/iu],
  ['リップ', /(?:リップ|口紅|lipstick|lip\s*tint|唇膏|립스틱|립틴트)/iu],
  ['水筒', /(?:水筒|タンブラー|ボトル|water\s*bottle|tumbler|水杯|保温杯|保溫杯|텀블러)/iu],
  ['携帯扇風機', /(?:携帯扇風機|ハンディファン|portable\s*fan|handheld\s*fan|手持风扇|手持風扇|휴대용\s*선풍기)/iu],
  ['ライト', /(?:ライト|照明|ランプ|\blights?\b|\blamps?\b|灯|燈|조명|램프)/iu],
];

const GENERIC_ATTRIBUTES = [
  ['透明', /(?:透明|クリア|clear|transparent|투명)/iu],
  ['完全ワイヤレス', /(?:完全ワイヤレス|フルワイヤレス|左右独立|左右分離|コードレス|コードなし|ケーブルなし|true\s*wireless|\btws\b|wire[- ]?free|真无线|真無線|完全无线|完全無線|완전\s*무선|코드\s*없는)/iu],
  ['ワイヤレス', /(?:ワイヤレス|wireless|bluetooth|蓝牙|藍牙|블루투스|무선|无线|無線)/iu],
  ['ノイズキャンセリング', /(?:ノイズキャンセリング|noise\s*cancell?ing|\banc\b)/iu],
  ['スマホ対応', /(?:スマホ対応|スマートフォン対応|携帯対応|phone\s*compatible|smartphone\s*compatible|手机兼容|手機相容|스마트폰\s*호환)/iu],
  ['急速充電', /(?:急速充電|高速充電|fast\s*charg(?:e|ing)|quick\s*charg(?:e|ing)|快充|고속\s*충전)/iu],
  ['HDMI', /\bhdmi\b/iu],
  ['有線LAN', /(?:有線LAN|ethernet|rj[- ]?45|以太网|乙太網|유선\s*랜|이더넷)/iu],
  ['SDカード', /(?:SD\s*カード|SD\s*card|读卡器|讀卡器|SD卡|SD\s*카드|카드\s*리더)/iu],
  ['自動', /(?:自動|automatic|auto\b|自动|自動|자동)/iu],
  ['静音', /(?:静音|音が静か|quiet|silent|低噪音|저소음)/iu],
  ['小型', /(?:小さい|小さな|小型|手のひら|コンパクト|ミニ|small|mini|compact|小巧|소형|작은)/iu],
  ['軽量', /(?:軽い|軽量|lightweight|ultralight|轻量|輕量|轻薄|輕薄|경량|가벼운)/iu],
  ['防水', /(?:防水|waterproof|防水型|방수)/iu],
  ['黒', /(?:黒|ブラック|\bblack\b|黑色|검정|검은색|블랙)/iu],
  ['白', /(?:白|ホワイト|\bwhite\b|白色|흰색|화이트)/iu],
  ['ピンク', /(?:ピンク|\bpink\b|粉色|분홍|핑크)/iu],
  ['紫', /(?:紫|パープル|\bpurple\b|紫色|보라|퍼플)/iu],
  ['青', /(?:青|水色|ブルー(?!トゥース)|\bblue\b|蓝色|藍色|파랑|블루(?!투스))/iu],
  ['緑', /(?:緑|グリーン|\bgreen\b|绿色|綠色|초록|그린)/iu],
  ['黄', /(?:黄色|イエロー|\byellow\b|黄色|노랑|노란색|옐로)/iu],
  ['グレー', /(?:グレー|灰色|gr[ae]y|灰色|회색|그레이)/iu],
  ['シルバー', /(?:銀色|シルバー|\bsilver\b|银色|銀色|(?<!검)은색|실버)/iu],
  ['ゴールド', /(?:金色|ゴールド|\bgold\b|金色|금색|골드)/iu],
  ['赤', /(?:赤(?:色)?|レッド|\bred\b|红色|紅色|빨간색|레드)/iu],
  ['オレンジ', /(?:オレンジ|\borange\b|橙色|橘色|주황색|오렌지)/iu],
  ['ベージュ', /(?:ベージュ|\bbeige\b|米色|베이지)/iu],
  ['茶', /(?:茶色|ブラウン|\bbrown\b|棕色|褐色|갈색|브라운)/iu],
  ['折りたたみ', /(?:折りたたみ|折り畳み|折り畳める|foldable|folding|折叠|折疊|접이식)/iu],
  ['光る', /(?:光る|発光|LED|ライトアップ|light[- ]?up|glowing|发光|發光|빛나는|발광)/iu],
  ['韓国風', /(?:韓国っぽい|韓国風|韓国系|韓国の|korean\s*(?:style|look)|韩系|韓系|한국풍|한국\s*스타일)/iu],
  ['メンズ', /(?:男性用|メンズ|\b(?:for\s+men|men'?s)\b|男士(?:用|款)?|남성용|남자용)/iu],
  ['レディース', /(?:女性用|レディース|\b(?:for\s+women|women'?s)\b|女士(?:用|款)?|여성용|여자용)/iu],
  ['キッズ', /(?:子供用|子ども用|キッズ|歳(?:児|の子)?(?:用|向け)?|\b(?:for\s+kids|kids?'|children'?s|years?[- ]old)\b|儿童(?:用|款)?|兒童(?:用|款)?|岁(?:儿童|兒童)|歲(?:儿童|兒童)|아동용|어린이용|아이용|세\s*(?:아이|어린이))/iu],
  ['通勤', /(?:通勤用|通勤向け|通勤に|\bfor\s+commut(?:ing|ers?)\b|通勤用|출퇴근용)/iu],
  ['アウトドア', /(?:アウトドア用|屋外用|\bfor\s+(?:outdoor|camping|hiking)\b|户外用|戶外用|야외용|캠핑용)/iu],
  ['浴室用', /(?:浴室用|お風呂用|\bfor\s+(?:the\s+)?bathroom\b|浴室用|욕실용)/iu],
  ['キッチン用', /(?:キッチン用|台所用|\bfor\s+(?:the\s+)?kitchen\b|厨房用|廚房用|주방용)/iu],
];

const GENERIC_MATERIALS = [
  ['革', /(?:革|レザー|\bleather\b|皮革|真皮|가죽)/iu],
  ['ナイロン', /(?:ナイロン|\bnylon\b|尼龙|尼龍|나일론)/iu],
  ['ガラス', /(?:ガラス|\bglass\b|玻璃|유리)/iu],
  ['布', /(?:布(?=製|地|の)|生地|ファブリック|\bfabric\b|\bcloth\b|布艺|布藝|패브릭|천)/iu],
  ['金属', /(?:金属|メタル|スチール|\bmetal\b|\bsteel\b|金属|金屬|금속|메탈)/iu],
  ['木製', /(?:木製|木目|\bwood(?:en)?\b|木质|木質|원목|나무)/iu],
  ['シリコン', /(?:シリコン|\bsilicone\b|硅胶|矽膠|실리콘)/iu],
];

const APPAREL_PRODUCTS = new Set([
  '靴下 socks', '帽子', 'バッグ', 'スニーカー', 'ワンピース', 'パンツ', 'スカート', 'Tシャツ', 'ジャケット', 'コート', 'パーカー', 'トップス',
]);

function shoeSizeTokens(query) {
  const matches = [
    ...query.matchAll(/\b(US|EU|UK)\s*(?:サイズ|size|尺码|尺碼|사이즈)?\s*(\d{1,2}(?:\.5)?)/giu),
    ...query.matchAll(/(\d{2}(?:\.5)?)\s*(码|碼)/giu),
  ];
  return [...new Set(matches
    .filter((match) => {
      const escaped = match[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return !isNegatedAttribute(query, new RegExp(escaped, 'iu'));
    })
    .map((match) => /码|碼/u.test(match[2])
      ? `EU${match[1]}`
      : `${String(match[1]).toUpperCase()}${match[2]}`))];
}

function apparelSizeTokens(query) {
  const matches = [
    ...query.matchAll(/(?:サイズ\s*|size\s+|in\s+size\s+|尺码\s*|尺碼\s*|사이즈\s*)(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL)/giu),
    ...query.matchAll(/(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL)\s*(?:サイズ|码|碼|사이즈)/giu),
    ...query.matchAll(/(フリー\s*サイズ|free\s*size|均码|均碼|프리\s*사이즈)/giu),
  ];
  const tokens = matches
    .filter((match) => {
      const escaped = match[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return !isNegatedAttribute(query, new RegExp(escaped, 'iu'));
    })
    .map((match) => /フリー|free|均码|均碼|프리/iu.test(match[0])
      ? 'FREEサイズ'
      : `サイズ${String(match[1] || '').toUpperCase()}`)
    .filter((value) => value !== 'サイズ');
  return [...new Set(tokens)];
}

function isNegatedAttribute(query, pattern) {
  const flags = [...new Set(`${pattern.flags}g`.split(''))].join('');
  const matcher = new RegExp(pattern.source, flags);
  let foundNegated = false;
  for (const match of query.matchAll(matcher)) {
    const before = query.slice(Math.max(0, match.index - 18), match.index);
    const after = query.slice(match.index + match[0].length, match.index + match[0].length + 14);
    const negatedBefore = /(?:not\s+(?:a|an|the)?|no|without|anything\s+but|不要|不是|不想要|除了|除外)\s*$/iu.test(before);
    const negatedAfter = /^\s*(?:以外|ではなく|じゃなく|ではない|じゃない|でない|なし|を除く|を避ける?|而不是|말고|아닌|아니고|제외)/iu.test(after);
    if (!negatedBefore && !negatedAfter) return false;
    foundNegated = true;
  }
  return foundNegated;
}

function matchedMaterials(query) {
  return GENERIC_MATERIALS
    .filter(([, pattern]) => pattern.test(query) && !isNegatedAttribute(query, pattern))
    .map(([label]) => label);
}

function matchedAttributes(query) {
  return GENERIC_ATTRIBUTES
    .filter(([, pattern]) => pattern.test(query) && !isNegatedAttribute(query, pattern))
    .map(([label]) => label)
    .filter((label, index, values) =>
      (label !== 'ワイヤレス' || !values.includes('完全ワイヤレス'))
      && values.indexOf(label) === index
    );
}

function compactUnknownSearchPhrase(normalized) {
  if (/(?:\/|／|\||｜)/u.test(normalized)) return normalized;
  const compacted = normalized
    .replace(/(?:TikTok|Instagram|インスタ|X|Twitter|SNS|動画|広告|投稿)(?:で|に)(?:見た|見かけた|流れてきた)/giu, ' ')
    .replace(/(?:韓国|海外|アメリカ|中国|台湾|コンビニ|スーパー|空港|免税店)(?:で|から)(?:買った|見た|見つけた)/gu, ' ')
    .replace(/(?:料理|食事|仕事|学校|旅行|推し活|通勤|通学)(?:に|で)?使(?:う|える|いたい)/gu, ' ')
    .replace(/(?:商品名|名前)(?:が|は)?(?:分からない|わからない|不明)/gu, ' ')
    .replace(/(?:を|が)?(?:探している|探したい|欲しい|ほしい|買いたい)(?:もの|やつ|商品)?/gu, ' ')
    .replace(/(?:looking\s+for|i\s+(?:want|saw|need)|saw\s+(?:it|this)\s+(?:on|at)|used\s+for)/giu, ' ')
    .replace(/[「」『』【】()[\]、。！？!?]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return compacted.length >= 2 && compacted.length < normalized.length ? compacted : normalized;
}

export function buildMarketplaceSearchKeywords(query, marketplace = 'QOO10_JP') {
  const normalized = stripSearchBudget(query).replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const portHub = buildPortHubSearchKeywords(normalized, marketplace);
  if (portHub) return portHub;
  const applePencil = buildApplePencilSearchKeywords(normalized);
  if (applePencil) return applePencil;
  const deviceAccessory = buildDeviceAccessorySearchKeywords(normalized);
  if (deviceAccessory) return deviceAccessory;
  let products = GENERIC_PRODUCTS
    .filter(([, pattern]) => pattern.test(normalized) && !isNegatedAttribute(normalized, pattern))
    .map(([label]) => label)
    .filter((label, index, values) => values.indexOf(label) === index);
  if (products.includes('バックパック')) products = products.filter((label) => label !== 'バッグ');
  if (products.includes('Tシャツ')) products = products.filter((label) => label !== 'トップス');
  if (products.includes('ライフジャケット')) products = products.filter((label) => label !== 'ジャケット');
  if (products.some((label) => label.startsWith('ノートPC'))) products = products.filter((label) => label !== 'ノートパソコン');
  if (products.includes('USB-Cハブ')) products = products.filter((label) => !['ノートパソコン','変換アダプター'].includes(label));
  if (products.some((label) => label.startsWith('タブレット') && label !== 'タブレット')) {
    products = products.filter((label) => !['タブレット','キーボード'].includes(label));
  }
  if (!products.length) return compactUnknownSearchPhrase(normalized);
  const materials = matchedMaterials(normalized);
  const attributes = matchedAttributes(normalized)
    .filter((label) => !products.some((product) => product.includes(label)));
  const specifications = specificationTokens(normalized);
  const sizes = products.some((product) => APPAREL_PRODUCTS.has(product))
    ? apparelSizeTokens(normalized)
    : [];
  const shoeSizes = products.includes('スニーカー') ? shoeSizeTokens(normalized) : [];
  const limit = marketplace === 'QOO10_JP' ? 3 : 6;
  const productLimit = Math.min(products.length, 2);
  const attributeLimit = Math.max(0, limit - productLimit);
  const conditions = [...new Set([
    ...specifications,
    ...shoeSizes,
    ...sizes,
    ...materials,
    ...attributes,
  ])].slice(0, attributeLimit);
  return [...new Set([
    ...conditions,
    ...products.slice(0, productLimit),
  ])].join(' ');
}

export function buildQoo10SearchKeywords(query) {
  return buildMarketplaceSearchKeywords(query, 'QOO10_JP');
}
