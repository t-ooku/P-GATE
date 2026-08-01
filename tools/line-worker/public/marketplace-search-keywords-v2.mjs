const PRODUCT_TYPES = [
  ['モバイルバッテリー', /(?:モバイルバッテリー|携帯バッテリー|power\s*bank|portable\s+(?:battery|charger)|充电宝|充電寶|移动电源|行動電源|보조\s*배터리)/iu],
  ['ケーブル', /(?:充電ケーブル|充電コード|ライトニングケーブル|lightning\s*(?:cable|cord)|usb[- ]?c\s*(?:cable|cord)|charging\s*(?:cable|cord)|数据线|數據線|充电线|充電線|충전\s*케이블|라이트ニング\s*케이블)/iu],
  ['イヤホン', /(?:イヤホン|ヘッドホン|earphones?|earbuds?|headphones?|耳机|耳機|이어폰|헤드폰)/iu],
  ['充電器', /(?:充電器|充電台|チャージャー|充電アダプター|acアダプター|charger|charging\s*station|power\s*adapter|充电器|充電器|充电座|充電座|충전기|충전\s*어댑터)/iu],
  ['保護フィルム', /(?:保護フィルム|画面フィルム|ガラスフィルム|screen\s*protector|protective\s*film|tempered\s*glass|保护膜|保護膜|钢化膜|鋼化膜|보호\s*필름|강화\s*유리)/iu],
  ['スタンド', /(?:スマホスタンド|携帯スタンド|phone\s*stand|mobile\s*stand|phone\s*holder|支架|手机架|手機架|거치대|스탠드)/iu],
  ['ケース', /(?:casetify|ケース|カバー|case|cover|手机壳|手機殼|保护壳|保護殼|케이스|커버)/iu],
];

function deviceName(query) {
  const iphone = query.match(/\biphone(?:\s*(\d{1,2})(?!\d)(?:\s*(?:pro|max|plus|mini)){0,2})?/iu);
  if (iphone) return iphone[0].replace(/^iphone/iu, 'iPhone').trim();
  const localizedIphone = query.match(/(?:苹果手机|蘋果手機|아이폰)(?:\s*\d{1,2}(?!\d)(?:\s*(?:pro|max|plus|mini))*)?/iu);
  if (localizedIphone) return localizedIphone[0].replace(/^(?:苹果手机|蘋果手機|아이폰)/iu, 'iPhone').trim();
  const galaxy = query.match(/\bgalaxy(?:\s*[a-z]\d{1,3}(?:\s*(?:ultra|plus|\+|fe))?)?/iu);
  if (galaxy) return galaxy[0].replace(/^galaxy/iu, 'Galaxy').trim();
  const localizedGalaxy = query.match(/갤럭시(?:\s*[a-z]\d{1,3}(?:\s*(?:ultra|plus|\+|fe))?)?/iu);
  if (localizedGalaxy) return localizedGalaxy[0].replace(/^갤럭시/iu, 'Galaxy').trim();
  const pixel = query.match(/\bpixel(?:\s*\d{1,2}(?!\d)(?:\s*(?:pro|fold|a))?)?/iu);
  if (pixel) return pixel[0].replace(/^pixel/iu, 'Pixel').trim();
  const localizedPixel = query.match(/픽셀(?:\s*\d{1,2}(?!\d)(?:\s*(?:pro|fold|a))?)?/iu);
  if (localizedPixel) return localizedPixel[0].replace(/^픽셀/iu, 'Pixel').trim();
  if (/(?:\bandroid\b|安卓|안드로이드)/iu.test(query)) return 'Android';
  return '';
}

function specificationTokens(query) {
  const matches = query.match(
    /(?:usb[- ]?c|lightning|magsafe|qi2?|pd\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*(?:w|mah|gb|tb|mm|cm|m|インチ|inch))/giu
  ) || [];
  return [...new Set(matches.map((value) => value.replace(/\s+/g, '').replace(/^usb-c$/iu, 'USB-C')))].slice(0, 4);
}

export function buildDeviceAccessorySearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const device = deviceName(normalized);
  if (!device) return '';
  const product = PRODUCT_TYPES.find(([, pattern]) => pattern.test(normalized));
  if (!product) return '';
  const label = product[0];
  const base = label === 'ケース' && device.startsWith('iPhone')
    ? `${device}ケース`
    : `${device} ${label}`;
  const specifications = specificationTokens(normalized)
    .filter((token) => !base.toLowerCase().includes(token.toLowerCase()));
  return [base, ...specifications].join(' ');
}

const GENERIC_PRODUCTS = [
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
  ['ノートパソコン', /(?:ノートパソコン|ノートPC|ラップトップ|laptop|notebook\s*computer|笔记本电脑|筆記型電腦|노트북)/iu],
  ['キャンドル', /(?:キャンドル|ろうそく|candle|蜡烛|蠟燭|캔들)/iu],
  ['タオルウォーマー', /(?:タオルウォーマー|towel\s*warmer|毛巾加热器|毛巾加熱器|타월\s*워머)/iu],
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
  ['バッグ', /(?:バッグ|かばん|bag|pouch|包包|가방)/iu],
  ['スニーカー', /(?:スニーカー|運動靴|sneakers?|运动鞋|運動鞋|운동화)/iu],
  ['ワンピース', /(?:ワンピース|dress|连衣裙|連衣裙|원피스)/iu],
  ['トップス', /(?:トップス|シャツ|ブラウス|tops?|shirts?|blouse|上衣|셔츠|블라우스)/iu],
  ['リップ', /(?:リップ|口紅|lipstick|lip\s*tint|唇膏|립스틱|립틴트)/iu],
  ['水筒', /(?:水筒|タンブラー|ボトル|water\s*bottle|tumbler|水杯|保温杯|保溫杯|텀블러)/iu],
  ['携帯扇風機', /(?:携帯扇風機|ハンディファン|portable\s*fan|handheld\s*fan|手持风扇|手持風扇|휴대용\s*선풍기)/iu],
  ['ライト', /(?:ライト|照明|ランプ|light|lamp|灯|燈|조명|램프)/iu],
];

const GENERIC_ATTRIBUTES = [
  ['透明', /(?:透明|クリア|clear|transparent|투명)/iu],
  ['完全ワイヤレス', /(?:完全ワイヤレス|フルワイヤレス|左右独立|左右分離|コードレス|コードなし|ケーブルなし|true\s*wireless|\btws\b|wire[- ]?free|真无线|真無線|完全无线|完全無線|완전\s*무선|코드\s*없는)/iu],
  ['ワイヤレス', /(?:ワイヤレス|wireless|bluetooth|蓝牙|藍牙|블루투스|무선|无线|無線)/iu],
  ['ノイズキャンセリング', /(?:ノイズキャンセリング|noise\s*cancell?ing|\banc\b)/iu],
  ['スマホ対応', /(?:スマホ対応|スマートフォン対応|携帯対応|phone\s*compatible|smartphone\s*compatible|手机兼容|手機相容|스마트폰\s*호환)/iu],
  ['急速充電', /(?:急速充電|高速充電|fast\s*charg(?:e|ing)|quick\s*charg(?:e|ing)|快充|고속\s*충전)/iu],
  ['自動', /(?:自動|automatic|auto\b|自动|自動|자동)/iu],
  ['静音', /(?:静音|音が静か|quiet|silent|低噪音|저소음)/iu],
  ['小型', /(?:小さい|小さな|小型|手のひら|コンパクト|ミニ|small|mini|compact|小巧|소형|작은)/iu],
  ['軽量', /(?:軽い|軽量|lightweight|轻量|輕量|경량|가벼운)/iu],
  ['防水', /(?:防水|waterproof|防水型|방수)/iu],
  ['黒', /(?:黒|ブラック|\bblack\b|黑色|검정|블랙)/iu],
  ['白', /(?:白|ホワイト|\bwhite\b|白色|흰색|화이트)/iu],
  ['ピンク', /(?:ピンク|\bpink\b|粉色|분홍|핑크)/iu],
  ['紫', /(?:紫|パープル|\bpurple\b|紫色|보라|퍼플)/iu],
  ['青', /(?:青|水色|ブルー|\bblue\b|蓝色|藍色|파랑|블루)/iu],
  ['緑', /(?:緑|グリーン|\bgreen\b|绿色|綠色|초록|그린)/iu],
  ['黄', /(?:黄色|イエロー|\byellow\b|黄色|노랑|옐로)/iu],
  ['グレー', /(?:グレー|灰色|gr[ae]y|灰色|회색|그레이)/iu],
  ['シルバー', /(?:銀色|シルバー|\bsilver\b|银色|銀色|은색|실버)/iu],
  ['ゴールド', /(?:金色|ゴールド|\bgold\b|金色|금색|골드)/iu],
  ['赤', /(?:赤(?:色)?|レッド|\bred\b|红色|紅色|빨간색|레드)/iu],
  ['オレンジ', /(?:オレンジ|\borange\b|橙色|橘色|주황색|오렌지)/iu],
  ['ベージュ', /(?:ベージュ|\bbeige\b|米色|베이지)/iu],
  ['茶', /(?:茶色|ブラウン|\bbrown\b|棕色|褐色|갈색|브라운)/iu],
  ['折りたたみ', /(?:折りたたみ|折り畳み|折り畳める|foldable|folding|折叠|折疊|접이식)/iu],
  ['光る', /(?:光る|発光|LED|ライトアップ|light[- ]?up|glowing|发光|發光|빛나는|발광)/iu],
  ['韓国風', /(?:韓国っぽい|韓国風|韓国系|韓国の|korean\s*(?:style|look)|韩系|韓系|한국풍|한국\s*스타일)/iu],
];

function isNegatedAttribute(query, pattern) {
  const match = query.match(pattern);
  if (!match || match.index == null) return false;
  const before = query.slice(Math.max(0, match.index - 18), match.index);
  const after = query.slice(match.index + match[0].length, match.index + match[0].length + 14);
  const negatedBefore = /(?:not|no|without|anything\s+but|不要|不是|不想要|除了|除外)\s*$/iu.test(before);
  const negatedAfter = /^\s*(?:以外|ではない|じゃない|でない|なし|を除く|を避ける?|말고|아닌|아니고|제외)/iu.test(after);
  return negatedBefore || negatedAfter;
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
  const normalized = String(query || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const deviceAccessory = buildDeviceAccessorySearchKeywords(normalized);
  if (deviceAccessory) return deviceAccessory;
  const products = GENERIC_PRODUCTS
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([label]) => label)
    .filter((label, index, values) => values.indexOf(label) === index);
  if (!products.length) return compactUnknownSearchPhrase(normalized);
  const attributes = GENERIC_ATTRIBUTES
    .filter(([, pattern]) => pattern.test(normalized) && !isNegatedAttribute(normalized, pattern))
    .map(([label]) => label)
    .filter((label, index, values) =>
      (label !== 'ワイヤレス' || !values.includes('完全ワイヤレス'))
      && !products.some((product) => product.includes(label))
    );
  const limit = marketplace === 'QOO10_JP' ? 3 : 6;
  const productLimit = Math.min(products.length, 2);
  const attributeLimit = Math.max(0, limit - productLimit);
  return [...new Set([
    ...attributes.slice(0, attributeLimit),
    ...products.slice(0, productLimit),
  ])].join(' ');
}

export function buildQoo10SearchKeywords(query) {
  return buildMarketplaceSearchKeywords(query, 'QOO10_JP');
}
