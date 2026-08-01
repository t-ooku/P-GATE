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

function smartWatchBandModel(query) {
  const apple = String(query || '').match(/\bapple\s*watch\s*(ultra(?:\s*[12])?|series\s*\d{1,2}|se(?:\s*[23])?)/iu);
  if (apple) return apple[0].replace(/apple\s*watch/iu, 'Apple Watch').replace(/\s+/gu, ' ').trim();
  const galaxy = String(query || '').match(/\bgalaxy\s*watch\s*(\d{1,2})(?:\s*(classic|pro))?/iu);
  if (galaxy) return `Galaxy Watch${galaxy[1]}${galaxy[2] ? ` ${galaxy[2][0].toUpperCase()}${galaxy[2].slice(1).toLowerCase()}` : ''}`;
  return '';
}

function buildSmartWatchBandSearchKeywords(query) {
  const bandPattern = /(?:バンド|ベルト|交換ベルト|\b(?:band|strap)\b|表带|錶帶|腕带|腕帶|스트랩|밴드|시계줄)/iu;
  if (!bandPattern.test(query)) return '';
  const model = smartWatchBandModel(query);
  if (!model) return '';
  const size = String(query || '').match(/\b(4[0-9])\s*mm\b/iu)?.[1];
  const material = /(?:チタン|titanium|钛(?:金属)?|鈦(?:金屬)?|티타늄)/iu.test(query) ? 'チタン'
    : /(?:ステンレス|stainless(?:\s*steel)?|不锈钢|不鏽鋼|스테인리스)/iu.test(query) ? 'ステンレス'
      : /(?:レザー|本革|革|leather|皮革|真皮|가죽)/iu.test(query) ? 'レザー'
        : /(?:シリコン|silicone|硅胶|矽膠|실리콘)/iu.test(query) ? 'シリコン' : '';
  return [model, size ? `${size}mm` : '', 'バンド', material].filter(Boolean).join(' ');
}

function buildCameraPrimeLensSearchKeywords(query) {
  const lensPattern = /(?:単焦点(?:レンズ)?|prime\s+lens|定焦(?:镜头|鏡頭)|단렌즈|단초점\s*렌즈)/iu;
  if (!lensPattern.test(query)) return '';
  const sony = /(?:sony|ソニー|索尼|소니)/iu.test(query);
  const canon = /(?:canon|キヤノン|キャノン|佳能|캐논)/iu.test(query);
  const mount = sony && /(?:\be\s*[- ]?mount\b|Eマウント|E卡口|E마운트)/iu.test(query) ? 'Sony Eマウント'
    : canon && /(?:\brf\s*[- ]?mount\b|RFマウント|RF卡口|RF마운트)/iu.test(query) ? 'Canon RFマウント' : '';
  if (!mount) return '';
  const focalLength = String(query || '').match(/\b(\d{2,3})\s*mm\b/iu)?.[1];
  const aperture = String(query || '').match(/\bf\s*\/?\s*(\d(?:\.\d)?)\b/iu)?.[1];
  return [mount, focalLength ? `${focalLength}mm` : '', aperture ? `F${aperture}` : '', '単焦点レンズ']
    .filter(Boolean).join(' ');
}

function buildChargingCableSearchKeywords(query) {
  if (!/(?:充電ケーブル|充電コード|charging\s*(?:cable|cord)|充电线|充電線|충전\s*케이블)/iu.test(query)) return '';
  const usbCCount = [...String(query || '').matchAll(/usb\s*[- ]?c/giu)].length;
  const lightning = /lightning|ライトニング|闪电|閃電|라이트닝/iu.test(query);
  const connector = lightning && usbCCount ? 'USB-C to Lightning'
    : usbCCount >= 2 ? 'USB-C to USB-C' : '';
  if (!connector) return '';
  const length = String(query || '').match(/\b(\d(?:\.\d)?)\s*(?:m\b|メートル|米)/iu)?.[1];
  const watts = String(query || '').match(/\b(\d{2,3})\s*w\b/iu)?.[1];
  const braided = /(?:編み込み|編組|braided|编织|編織|패브릭|브레이드)/iu.test(query) ? '編み込み' : '';
  return [connector, length ? `${length}m` : '', watts ? `${watts}W` : '', braided, '充電ケーブル']
    .filter(Boolean).join(' ');
}

function buildWallChargerSearchKeywords(query) {
  if (!/(?:充電器|ACアダプター|wall\s*charger|power\s*adapter|充电器|充電器|충전기)/iu.test(query)) return '';
  const watts = String(query || '').match(/\b(\d{2,3})\s*w\b/iu)?.[1];
  const ports = String(query || '').match(/(?:\b([2-9])\s*[- ]?\s*(?:ポート|ports?|口|포트)|(?:dual|デュアル|双|雙|듀얼)\s*[- ]?\s*(?:ポート|ports?|口|포트))/iu);
  const portCount = ports?.[1] || (ports ? '2' : '');
  const usbC = /usb\s*[- ]?c/iu.test(query) ? 'USB-C' : '';
  const gan = /\bgan\b|窒化ガリウム|氮化镓|氮化鎵|질화갈륨/iu.test(query) ? 'GaN' : '';
  const pd = /(?:\bpd\b|power\s*delivery)/iu.test(query) ? 'PD' : '';
  const pps = /\bpps\b/iu.test(query) ? 'PPS' : '';
  if (!watts || !usbC) return '';
  return [watts ? `${watts}W` : '', portCount ? `${portCount}ポート` : '', gan, pd, pps, usbC, '充電器']
    .filter(Boolean).join(' ');
}

function buildWirelessChargingStationSearchKeywords(query) {
  if (!/(?:wireless\s*charg(?:er|ing)|ワイヤレス充電|无线充电|無線充電|무선\s*충전)/iu.test(query)) return '';
  const qi2 = /\bqi\s*2\b/iu.test(query) ? 'Qi2' : '';
  const watts = String(query || '').match(/\b(\d{1,2})\s*w\b/iu)?.[1];
  const threeInOne = /(?:3\s*[- ]?in\s*[- ]?1|3台同時|3台用|三合一|3合1|3合一|3개\s*동시|3-in-1)/iu.test(query);
  const iphone = /\biphone\b|アイフォン|苹果手机|蘋果手機|아이폰/iu.test(query);
  const watch = /apple\s*watch|アップルウォッチ|苹果手表|蘋果手錶|애플워치/iu.test(query);
  const airpods = /airpods|エアポッズ|苹果耳机|蘋果耳機|에어팟/iu.test(query);
  if (!qi2 || !threeInOne || !(iphone && watch && airpods)) return '';
  return [qi2, watts ? `${watts}W` : '', '3-in-1', 'iPhone', 'Apple Watch', 'AirPods', 'ワイヤレス充電スタンド']
    .filter(Boolean).join(' ');
}

function buildHdmiCableSearchKeywords(query) {
  if (!/(?:hdmi).{0,100}(?:ケーブル|cable|连接线|連接線|线缆|線纜|케이블)|(?:ケーブル|cable|连接线|連接線|线缆|線纜|케이블).{0,100}(?:hdmi)|(?:hdmi).{0,100}(?:认证|認證)\s*(?:线|線)(?:$|\s)/iu.test(query)) return '';
  const version = String(query || '').match(/\bhdmi\s*(2\.1|2\.0|1\.4)\b/iu)?.[1];
  const length = String(query || '').match(/\b(\d(?:\.\d)?)\s*(?:m\b|メートル|米)/iu)?.[1];
  const eightK = /\b8\s*k\s*60\s*hz\b/iu.test(query) ? '8K60Hz' : '';
  const fourK = /\b4\s*k\s*120\s*hz\b/iu.test(query) ? '4K120Hz' : '';
  const ultraHighSpeed = /ultra\s*high\s*speed|ウルトラハイスピード|超高速|초고속/iu.test(query)
    ? 'Ultra High Speed' : '';
  const certified = /(?:認証|certified|认证|認證|인증)/iu.test(query) ? '認証' : '';
  if (!version) return '';
  return [`HDMI ${version}`, length ? `${length}m` : '', eightK, fourK, ultraHighSpeed, certified, 'ケーブル']
    .filter(Boolean).join(' ');
}

function buildDisplayPortCableSearchKeywords(query) {
  if (!/(?:display\s*port|\bdp\b).{0,100}(?:ケーブル|cable|连接线|連接線|线缆|線纜|케이블)|(?:ケーブル|cable|连接线|連接線|线缆|線纜|케이블).{0,100}(?:display\s*port|\bdp\b)/iu.test(query)) return '';
  const version = String(query || '').match(/(?:display\s*port|\bdp\b)\s*(2\.1|2\.0|1\.4|1\.2)\b/iu)?.[1];
  const length = String(query || '').match(/\b(\d(?:\.\d)?)\s*(?:m\b|メートル|米)/iu)?.[1];
  const eightK = /\b8\s*k\s*60\s*hz\b/iu.test(query) ? '8K60Hz' : '';
  const fourK = /\b4\s*k\s*144\s*hz\b/iu.test(query) ? '4K144Hz' : '';
  const hbr3 = /\bhbr\s*3\b/iu.test(query) ? 'HBR3' : '';
  const dsc = /\bdsc\b|display\s*stream\s*compression/iu.test(query) ? 'DSC' : '';
  if (!version) return '';
  return [`DisplayPort ${version}`, length ? `${length}m` : '', eightK, fourK, hbr3, dsc, 'ケーブル']
    .filter(Boolean).join(' ');
}

function buildPortableSsdSearchKeywords(query) {
  const portable = /(?:ポータブル|外付け|portable|external|移动|移動|便携|便攜|외장|휴대용).{0,32}ssd|ssd.{0,32}(?:ポータブル|外付け|portable|external|移动|移動|便携|便攜|외장|휴대용)/iu.test(query);
  if (!portable) return '';
  const capacity = String(query || '').match(/\b(\d(?:\.\d)?)\s*(tb|gb)\b/iu);
  const usbGen = String(query || '').match(/usb\s*3\.2\s*gen\s*([12](?:x[12])?)/iu)?.[1];
  const speed = String(query || '').match(/\b(\d{3,4})\s*(?:mb\s*\/\s*s|mbps|mb\/秒)/iu)?.[1];
  const nvme = /\bnvme\b/iu.test(query) ? 'NVMe' : '';
  const shockproof = /耐衝撃|耐冲击|耐衝擊|抗震|shock[- ]?proof|충격\s*(?:방지|보호)/iu.test(query) ? '耐衝撃' : '';
  if (!capacity) return '';
  return ['ポータブルSSD', `${capacity[1]}${capacity[2].toUpperCase()}`,
    usbGen ? `USB 3.2 Gen ${usbGen}` : '', speed ? `読込 ${speed}MB/s` : '', nvme, shockproof]
    .filter(Boolean).join(' ');
}

function buildSdMemoryCardSearchKeywords(query) {
  if (!/(?:\bsd(?:xc|hc)?\s*(?:カード|card)|sd卡|sd\s*카드)/iu.test(query)
    || /(?:micro\s*sd|microsd|カードリーダー|card\s*reader|读卡器|讀卡器|카드\s*리더)/iu.test(query)) return '';
  const capacity = String(query || '').match(/\b(\d{2,4})\s*(gb|tb)\b/iu);
  const uhs = String(query || '').match(/\buhs[- ]?(ii|i|2|1)\b/iu)?.[1]?.toLowerCase();
  const videoClass = String(query || '').match(/\bv\s*(30|60|90)\b/iu)?.[1];
  const speed = String(query || '').match(/\b(\d{2,3})\s*(?:mb\s*\/\s*s|mbps|mb\/秒)/iu)?.[1];
  const fourK = /\b4\s*k\b/iu.test(query) ? '4K動画' : '';
  const eightK = /\b8\s*k\b/iu.test(query) ? '8K動画' : '';
  if (!capacity || !uhs || !videoClass) return '';
  const uhsLabel = uhs === 'ii' || uhs === '2' ? 'UHS-II' : 'UHS-I';
  return ['SDカード', `${capacity[1]}${capacity[2].toUpperCase()}`, uhsLabel, `V${videoClass}`,
    speed ? `読込 ${speed}MB/s` : '', fourK, eightK].filter(Boolean).join(' ');
}

function buildGamingMonitorSearchKeywords(query) {
  if (!/(?:ゲーミング\s*モニター|gaming\s*monitor|游戏\s*显示器|遊戲\s*顯示器|게이밍\s*모니터)/iu.test(query)) return '';
  const size = String(query || '').match(/\b(\d{2}(?:\.\d)?)\s*(?:インチ|inch(?:es)?|英寸|인치)/iu)?.[1];
  const resolution = /\b4\s*k\b/iu.test(query) ? '4K' : '';
  const refreshRate = String(query || '').match(/\b(\d{2,3})\s*hz\b/iu)?.[1];
  const panel = /\bips\b/iu.test(query) ? 'IPS' : '';
  const hdmi = String(query || '').match(/\bhdmi\s*(2\.1|2\.0)\b/iu)?.[1];
  const hdr = /\bhdr\b/iu.test(query) ? 'HDR' : '';
  if (!size || !resolution || !refreshRate) return '';
  return ['ゲーミングモニター', `${size}インチ`, resolution, `${refreshRate}Hz`, panel,
    hdmi ? `HDMI ${hdmi}` : '', hdr].filter(Boolean).join(' ');
}

function buildMechanicalKeyboardSearchKeywords(query) {
  if (!/(?:メカニカル\s*キーボード|mechanical\s*keyboard|机械\s*键盘|機械\s*鍵盤|기계식\s*키보드)/iu.test(query)) return '';
  const layoutSize = String(query || '').match(/\b(60|65|75|80|100)\s*%/u)?.[1];
  const jis = /\bjis\b|日本語配列|日文配列|日语配列|日語配列|일본어\s*배열/iu.test(query) ? 'JIS 日本語配列' : '';
  const redSwitch = /赤軸|red\s*switch|红轴|紅軸|적축/iu.test(query) ? '赤軸' : '';
  const hotSwap = /hot[- ]?swapp?able|hot[- ]?swap|ホットスワップ|热插拔|熱插拔|핫스왑/iu.test(query) ? 'ホットスワップ' : '';
  const bluetooth = /bluetooth|ブルートゥース|蓝牙|藍牙|블루투스/iu.test(query) ? 'Bluetooth' : '';
  const wireless24 = /\b2\.4\s*ghz\b/iu.test(query) ? '2.4GHz' : '';
  const usbC = /usb[- ]?c|type[- ]?c/iu.test(query) ? 'USB-C' : '';
  if (!layoutSize || !jis || !redSwitch) return '';
  return ['メカニカルキーボード', `${layoutSize}%`, jis, redSwitch, hotSwap, bluetooth, wireless24, usbC]
    .filter(Boolean).join(' ');
}

function buildNoiseCancellingHeadphonesSearchKeywords(query) {
  const headphones = /(?:ヘッドホン|headphones?|头戴式.{0,16}耳机|頭戴式.{0,16}耳機|헤드폰)/iu.test(query);
  const anc = /ノイズキャンセリング|noise[- ]?cancell?ing|\banc\b|主动降噪|主動降噪|노이즈\s*캔슬링/iu.test(query);
  if (!headphones || !anc) return '';
  const overEar = /オーバーイヤー|over[- ]?ear|头戴式|頭戴式|오버이어/iu.test(query) ? 'オーバーイヤー' : '';
  const bluetooth = String(query || '').match(/bluetooth\s*(5\.\d)/iu)?.[1];
  const multipoint = /multi[- ]?point|マルチポイント|多点连接|多點連接|멀티포인트/iu.test(query) ? 'マルチポイント' : '';
  const battery = String(query || '').match(/\b(\d{2,3})\s*(?:時間|hours?|hrs?|小时|小時|시간)/iu)?.[1];
  const usbC = /usb[- ]?c|type[- ]?c/iu.test(query) ? 'USB-C' : '';
  if (!overEar || !bluetooth || !battery) return '';
  return ['ノイズキャンセリングヘッドホン', overEar, `Bluetooth ${bluetooth}`, multipoint,
    `${battery}時間再生`, usbC].filter(Boolean).join(' ');
}

function buildRobotVacuumBodySearchKeywords(query) {
  if (!/(?:robot\s*vacuum|ロボット掃除機|扫地机器人|掃地機器人|로봇\s*청소기)/iu.test(query)) return '';
  if (/(?:交換|replacement|配件|更换|更換|교체|フィルター|filter|ブラシ|brush|紙パック|dust\s*bag)/iu.test(query)) return '';
  const lidar = /\blidar\b|レーザー(?:ナビ|マッピング)|激光导航|激光導航|라이다/iu.test(query) ? 'LiDAR' : '';
  const suction = String(query || '').match(/\b(\d{3,5})\s*pa\b/iu)?.[1];
  const selfEmpty = /自動(?:ゴミ収集|集塵)|self[- ]?emptying|auto[- ]?empty|自动集尘|自動集塵|자동\s*(?:먼지\s*)?비움/iu.test(query)
    ? '自動ゴミ収集' : '';
  const mopping = /水拭き|mopping|vacuum\s*and\s*mop|拖地|물걸레/iu.test(query) ? '水拭き' : '';
  if (!lidar || !suction || !selfEmpty) return '';
  return ['ロボット掃除機', lidar, `${suction}Pa`, selfEmpty, mopping].filter(Boolean).join(' ');
}

function buildAirPurifierBodySearchKeywords(query) {
  const airPurifierIntent = /(?:空気清浄機|air\s*purifier|空气净化器|空氣淨化器|공기\s*청정기|(?:花粉|pm\s*2\.5).{0,24}(?:減ら|除去|取り除).{0,24}(?:部屋|室内).{0,12}空気.{0,12}(?:きれい|清浄)|(?:clean|remove|filter).{0,20}(?:pollen|pm\s*2\.5).{0,30}(?:room|indoor)\s*air|(?:过滤|過濾|去除).{0,24}(?:(?:花粉|pm\s*2\.5).{0,24}(?:房间|房間|室内|室內).{0,8}(?:空气|空氣)|(?:房间|房間|室内|室內).{0,16}(?:花粉|pm\s*2\.5))|(?:방\s*안|실내).{0,24}(?:꽃가루|pm\s*2\.5).{0,20}(?:걸러|제거))/iu;
  if (!airPurifierIntent.test(query)) return '';
  if (/(?:交換|replacement|替换|替換|교체).{0,16}(?:フィルター|filter|滤芯|濾芯|필터)/iu.test(query)) return '';
  const area = String(query || '').match(/\b(\d{2,3})\s*(?:m(?:2|²)|㎡|平方メートル|平方米|平方公尺|평방미터)/iu)?.[1];
  const hepa = String(query || '').match(/\bhepa\s*h?\s*(1[1-4])\b/iu)?.[1];
  const cadr = String(query || '').match(/\bcadr\s*(\d{3,4})\s*(?:m(?:3|³)\s*\/\s*h|m³\/h)/iu)?.[1];
  const pm25 = /pm\s*2\.5.{0,12}(?:センサー|sensor|传感器|傳感器|센서)/iu.test(query) ? 'PM2.5センサー' : '';
  const wifi = /wi[- ]?fi|wifi|無線LAN|无线网络|無線網路|와이파이/iu.test(query) ? 'Wi-Fi' : '';
  if (!area || !hepa || !cadr) return '';
  return ['空気清浄機', `${area}m²`, `HEPA H${hepa}`, `CADR ${cadr}m³/h`, pm25, wifi]
    .filter(Boolean).join(' ');
}

function buildCordlessStickVacuumSearchKeywords(query) {
  const cordlessFloorCleaningIntent = /(?:コードレス.{0,16}スティック掃除機|cordless\s*stick\s*vacuum|无线杆式吸尘器|無線桿式吸塵器|무선\s*스틱\s*청소기|コード.{0,8}(?:気にせず|なし).{0,16}床.{0,16}(?:髪|ほこり).{0,16}(?:吸|掃除)|(?:clean|vacuum).{0,20}(?:hair|dust).{0,16}(?:from\s+the\s+)?floor.{0,20}without\s+(?:a\s+)?cord|不用(?:电线|電線).{0,20}(?:吸走|清理).{0,16}(?:地板).{0,16}(?:毛发|毛髮|灰尘|灰塵)|전선\s*없이.{0,20}바닥.{0,16}(?:머리카락|먼지).{0,20}(?:청소|흡입))/iu;
  if (!cordlessFloorCleaningIntent.test(query)) return '';
  const suction = String(query || '').match(/\b(\d{2,3})\s*aw\b/iu)?.[1];
  const runtime = String(query || '').match(/\b(\d{2,3})\s*(?:分|minutes?|mins?|分钟|分鐘|분)/iu)?.[1];
  const hepa = /\bhepa\b|ヘパ|헤파/iu.test(query) ? 'HEPA' : '';
  const laser = /レーザー|laser|激光|레이저/iu.test(query) ? 'レーザー照明' : '';
  if (!suction || !runtime || !hepa) return '';
  return ['コードレススティック掃除機', `${suction}AW`, `${runtime}分`, hepa, laser]
    .filter(Boolean).join(' ');
}

function buildAirFryerBodySearchKeywords(query) {
  const lowOilFryingIntent = /(?:エアフライヤー|air\s*fryer|空气炸锅|空氣炸鍋|에어프라이어|油.{0,12}(?:使わず|少な|減ら).{0,16}(?:揚げ物|フライ).{0,12}(?:2種類|二種類).{0,8}同時|(?:two|2).{0,20}fried\s+foods?.{0,20}(?:at\s+once|simultaneously).{0,20}(?:little|less|without)\s+oil|少油.{0,12}(?:同时|同時).{0,12}(?:做|制作|製作).{0,8}(?:两种|兩種).{0,8}(?:炸物|油炸)|기름.{0,12}(?:적게|없이).{0,20}튀김.{0,12}(?:두\s*가지|2가지).{0,12}동시에)/iu;
  if (!lowOilFryingIntent.test(query)) return '';
  if (/(?:ライナー|liners?|纸垫|紙墊|라이너|交換バスケット|replacement\s*basket)/iu.test(query)) return '';
  const capacity = String(query || '').match(/\b(\d(?:\.\d)?)\s*l\b/iu)?.[1];
  const temperature = String(query || '').match(/\b(\d{3})\s*(?:℃|°\s*c|celsius|度)/iu)?.[1];
  const dualBasket = /dual[- ]?basket|デュアルバスケット|双篮|雙籃|듀얼\s*바스켓/iu.test(query)
    ? 'デュアルバスケット' : '';
  const dishwasher = /食洗機対応|dishwasher[- ]?safe|可放洗碗机|可放洗碗機|식기세척기\s*(?:사용|세척)\s*가능/iu.test(query)
    ? '食洗機対応' : '';
  if (!capacity || !temperature || !dualBasket) return '';
  return ['エアフライヤー', `${capacity}L`, `${temperature}℃`, dualBasket, dishwasher]
    .filter(Boolean).join(' ');
}

function buildAutomaticEspressoMachineSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const machine = /(?:全自動.{0,16}エスプレッソマシン|fully[- ]?automatic.{0,16}espresso\s*machine|全自动.{0,16}意式咖啡机|全自動.{0,16}義式咖啡機|전자동.{0,16}에스프레소\s*머신|豆.{0,12}入れるだけ.{0,20}カプチーノ.{0,16}(?:一台|作り)|(?:make|brew).{0,12}cappuccino.{0,20}(?:whole\s+)?beans.{0,20}(?:touch|button)|放入咖啡豆.{0,12}(?:一键|一鍵).{0,12}(?:做|制作|製作).{0,8}(?:卡布奇诺|卡布奇諾)|원두.{0,12}넣고.{0,20}버튼.{0,12}(?:한\s*번|한번).{0,20}카푸치노)/iu.test(normalized);
  if (!machine) return '';
  if (/(?:カプセル|capsules?|pods?|胶囊|膠囊|캡슐|ドリップ|drip|滴漏|드립)/iu.test(normalized)) return '';
  const pressure = normalized.match(/\b(\d{1,2})\s*bar\b/iu)?.[1];
  const capacity = normalized.match(/\b(\d(?:\.\d)?)\s*l\b/iu)?.[1];
  const grinder = /(?:内蔵|built[- ]?in|内置|내장).{0,12}(?:グラインダー|grinder|磨豆机|磨豆機|그라인더)/iu.test(normalized)
    ? '内蔵グラインダー' : '';
  const frother = /(?:ミルクフォーマー|milk\s*frother|奶泡器|우유\s*거품기)/iu.test(normalized)
    ? 'ミルクフォーマー' : '';
  if (!pressure || !capacity || !grinder || !frother) return '';
  return ['全自動エスプレッソマシン', `${pressure}bar`, `${capacity}L`, grinder, frother].join(' ');
}

function buildSteamMicrowaveOvenSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const oven = /(?:スチーム.{0,12}オーブンレンジ|steam.{0,12}(?:convection\s*)?microwave\s*oven|蒸汽.{0,12}(?:烤箱微波炉|烤箱微波爐|微波烤箱)|스팀.{0,12}오븐.{0,12}전자레인지)/iu.test(normalized);
  if (!oven) return '';
  if (/(?:トースター|toaster|烤面包机|烤麵包機|토스터|業務用|commercial|商用|업소용)/iu.test(normalized)) return '';
  const capacity = normalized.match(/\b(\d{2})\s*l\b/iu)?.[1];
  const power = normalized.match(/\b(\d{3,4})\s*w\b/iu)?.[1];
  const flat = /(?:フラット庫内|flat[- ]?bed|flat\s*interior|平板内腔|平板內腔|플랫\s*내부)/iu.test(normalized)
    ? 'フラット庫内' : '';
  const sensor = /(?:赤外線センサー|infrared\s*sensor|红外传感器|紅外感測器|적외선\s*센서)/iu.test(normalized)
    ? '赤外線センサー' : '';
  if (!capacity || !power || !flat || !sensor) return '';
  return ['スチームオーブンレンジ', `${capacity}L`, `${power}W`, flat, sensor].join(' ');
}

function buildFrontLoadWasherDryerSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const machine = /(?:ドラム式.{0,12}洗濯乾燥機|front[- ]?load.{0,12}washer[- ]?dryer|washer[- ]?dryer\s*combo|滚筒洗烘一体机|滾筒洗烘一體機|드럼.{0,12}세탁건조기)/iu.test(normalized);
  if (!machine) return '';
  if (/(?:交換|replacement|替换|替換|교체)/iu.test(normalized)) return '';
  const wash = normalized.match(/(\d{1,2})\s*kg\s*wash(?:ing)?/iu)?.[1]
    || normalized.match(/(?:洗濯|洗涤|洗滌|세탁)\s*(\d{1,2})\s*kg/iu)?.[1];
  const dry = normalized.match(/(\d{1,2})\s*kg\s*dry(?:ing)?/iu)?.[1]
    || normalized.match(/(?:乾燥|烘干|烘乾|건조)\s*(\d{1,2})\s*kg/iu)?.[1];
  const heatPump = /(?:ヒートポンプ|heat[- ]?pump|热泵|熱泵|히트펌프)/iu.test(normalized) ? 'ヒートポンプ' : '';
  const autoDose = /(?:洗剤自動投入|automatic\s*detergent\s*dispens(?:er|ing)|自动投放洗衣液|自動投放洗衣液|세제\s*자동\s*투입)/iu.test(normalized)
    ? '洗剤自動投入' : '';
  if (!wash || !dry || !heatPump || !autoDose) return '';
  return ['ドラム式洗濯乾燥機', `洗濯${wash}kg`, `乾燥${dry}kg`, heatPump, autoDose].join(' ');
}

function buildFrenchDoorRefrigeratorSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  if (!/(?:冷蔵庫|refrigerator|fridge|冰箱|냉장고)/iu.test(normalized)) return '';
  if (/(?:フィルター|filter|滤芯|濾芯|필터|交換|replacement|替换|替換|교체)/iu.test(normalized)) return '';
  const capacity = normalized.match(/\b(\d{3})\s*l\b/iu)?.[1];
  const frenchDoor = /(?:観音開き|フレンチドア|french[- ]?door|对开门|對開門|프렌치도어)/iu.test(normalized)
    ? '観音開き' : '';
  const inverter = /(?:インバーター|inverter|变频|變頻|인버터)/iu.test(normalized) ? 'インバーター' : '';
  const iceMaker = /(?:自動製氷|automatic\s*ice\s*maker|自动制冰|自動製冰|자동\s*제빙)/iu.test(normalized)
    ? '自動製氷' : '';
  if (!capacity || !frenchDoor || !inverter || !iceMaker) return '';
  return ['冷蔵庫', `${capacity}L`, frenchDoor, inverter, iceMaker].join(' ');
}

function buildBuiltInDishwasherSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const machine = /(?:ビルトイン.{0,12}(?:食器洗い乾燥機|食洗機)|built[- ]?in\s*dishwasher|嵌入式洗碗机|嵌入式洗碗機|빌트인\s*식기세척기)/iu.test(normalized);
  if (!machine) return '';
  if (/(?:洗剤|detergent|세제|交換|replacement|替换|替換|교체)/iu.test(normalized)) return '';
  const settings = normalized.match(/(\d{1,2})\s*(?:人分|place\s*settings?|套(?:餐具)?|인용)/iu)?.[1];
  const width = normalized.match(/(?:幅\s*)?(\d{2})\s*cm/iu)?.[1];
  const inverter = /(?:インバーター|inverter|变频|變頻|인버터)/iu.test(normalized) ? 'インバーター' : '';
  const autoOpen = /(?:自動ドアオープン|auto(?:matic)?[- ]?open\s*door|自动开门|自動開門|자동\s*문열림)/iu.test(normalized)
    ? '自動ドアオープン' : '';
  if (!settings || !width || !inverter || !autoOpen) return '';
  return ['ビルトイン食器洗い乾燥機', `${settings}人分`, `幅${width}cm`, inverter, autoOpen].join(' ');
}

function buildOledTelevisionSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  if (!/(?:有機EL.{0,8}(?:テレビ|TV)|OLED.{0,8}(?:TV|television|电视|電視|텔레비전))/iu.test(normalized)) return '';
  const size = normalized.match(/\b(\d{2,3})\s*(?:型|インチ|inch(?:es)?|英寸|인치)/iu)?.[1];
  const resolution = /\b4\s*k\b/iu.test(normalized) ? '4K' : '';
  const refresh = normalized.match(/\b(\d{2,3})\s*hz\b/iu)?.[1];
  const hdmi = normalized.match(/hdmi\s*(2\.1)/iu)?.[1];
  const dolbyVision = /dolby\s*vision/iu.test(normalized) ? 'Dolby Vision' : '';
  if (!size || !resolution || !refresh || !hdmi || !dolbyVision) return '';
  return ['有機ELテレビ', `${size}型`, resolution, `${refresh}Hz`, `HDMI ${hdmi}`, dolbyVision].join(' ');
}

function buildLaserProjectorSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  if (!/(?:プロジェクター|projector|投影仪|投影機|프로젝터)/iu.test(normalized)) return '';
  const resolution = /\b4\s*k\b/iu.test(normalized) ? '4K' : '';
  const brightness = normalized.match(/\b(\d{3,4})\s*(?:ansi\s*)?(?:ルーメン|lumens?|流明|루멘)/iu)?.[1];
  const ratio = normalized.match(/(?:投写比|throw\s*ratio|投射比|투사비)\s*(\d(?:\.\d+)?:1)/iu)?.[1];
  const laser = /(?:レーザー|laser|激光|레이저)/iu.test(normalized) ? 'レーザー' : '';
  const androidTv = /android\s*tv/iu.test(normalized) ? 'Android TV' : '';
  if (!resolution || !brightness || !ratio || !laser || !androidTv) return '';
  return ['レーザープロジェクター', resolution, `${brightness} ANSIルーメン`, `投写比${ratio}`, androidTv].join(' ');
}

function buildDolbyAtmosSoundbarSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  if (!/(?:サウンドバー|soundbar|回音壁|사운드바)/iu.test(normalized)) return '';
  const channels = normalized.match(/\b(\d\.\d\.\d)\s*(?:ch|チャンネル|声道|聲道|채널)/iu)?.[1];
  const atmos = /dolby\s*atmos/iu.test(normalized) ? 'Dolby Atmos' : '';
  const earc = /hdmi\s*e-?arc|\bearc\b/iu.test(normalized) ? 'HDMI eARC' : '';
  const subwoofer = /(?:ワイヤレスサブウーファー|wireless\s*subwoofer|无线低音炮|無線低音炮|무선\s*서브우퍼)/iu.test(normalized)
    ? 'ワイヤレスサブウーファー' : '';
  if (!channels || !atmos || !earc || !subwoofer) return '';
  return ['サウンドバー', `${channels}ch`, atmos, earc, subwoofer].join(' ');
}

function buildFullFrameMirrorlessCameraSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const camera = /(?:フルサイズ.{0,12}ミラーレス(?:カメラ)?|full[- ]?frame.{0,12}mirrorless\s*camera|全画幅.{0,12}无反相机|全片幅.{0,12}無反相機|풀프레임.{0,12}미러리스\s*카메라)/iu.test(normalized);
  if (!camera) return '';
  const megapixels = normalized.match(/(?:(\d{2})\s*mp|((?:2[0-9]|3[0-9])00)\s*(?:万画素|万像素|萬像素|만\s*화소))/iu);
  const pixels = megapixels?.[1] ? `${megapixels[1]}00` : megapixels?.[2];
  const video = /4\s*k\s*60\s*p/iu.test(normalized) ? '4K60p' : '';
  const ibis = /(?:ボディ内手ぶれ補正|in[- ]?body\s*image\s*stabili[sz]ation|\bibis\b|机身防抖|機身防震|바디\s*손떨림\s*보정)/iu.test(normalized)
    ? 'ボディ内手ぶれ補正' : '';
  const dualSlot = /(?:デュアルカードスロット|dual\s*card\s*slots?|双卡槽|雙卡槽|듀얼\s*카드\s*슬롯)/iu.test(normalized)
    ? 'デュアルカードスロット' : '';
  if (!pixels || !video || !ibis || !dualSlot) return '';
  return ['フルサイズミラーレスカメラ', `${pixels}万画素`, video, ibis, dualSlot].join(' ');
}

function buildGamingLaptopSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  if (!/(?:ゲーミングノート(?:PC)?|gaming\s*laptop|游戏本|遊戲筆電|게이밍\s*노트북)/iu.test(normalized)) return '';
  const size = normalized.match(/\b(\d{2}(?:\.\d)?)\s*(?:型|インチ|inch(?:es)?|英寸|인치)/iu)?.[1];
  const gpu = normalized.match(/\brtx\s*(\d{4})\b/iu)?.[1];
  const ram = normalized.match(/\b(\d{2,3})\s*gb\s*(?:ram|メモリ|内存|記憶體|램)/iu)?.[1];
  const ssd = normalized.match(/\b(\d(?:\.\d)?)\s*tb\s*ssd\b/iu)?.[1];
  const refresh = normalized.match(/\b(\d{2,3})\s*hz\b/iu)?.[1];
  if (!size || !gpu || !ram || !ssd || !refresh) return '';
  return ['ゲーミングノートPC', `${size}型`, `RTX ${gpu}`, `${ram}GB RAM`, `${ssd}TB SSD`, `${refresh}Hz`].join(' ');
}

function buildNasSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  if (!/(?:\bNAS\b|network\s*attached\s*storage|网络附加存储|網路附加儲存|네트워크\s*결합\s*스토리지)/iu.test(normalized)) return '';
  const bays = normalized.match(/\b(\d{1,2})[\s-]*(?:ベイ|bay(?:s)?|盘位|盤位|베이)/iu)?.[1];
  const network = normalized.match(/\b(\d(?:\.\d)?)\s*GbE\b/iu)?.[1];
  const ram = normalized.match(/\b(\d{1,3})\s*GB\s*(?:RAM|メモリ|内存|記憶體|램)/iu)?.[1];
  const nvmeCache = /(?:NVMe\s*(?:キャッシュ|cache|缓存|快取|캐시)|(?:キャッシュ|cache|缓存|快取|캐시)\s*NVMe)/iu.test(normalized);
  const diskless = /(?:ディスクレス|diskless|无盘|無碟|디스크리스)/iu.test(normalized);
  if (!bays || !network || !ram || !nvmeCache || !diskless) return '';
  return ['NAS本体', `${bays}ベイ`, `${network}GbE`, `${ram}GB RAM`, 'NVMeキャッシュ', 'ディスクレス'].join(' ');
}

function buildWifi7MeshRouterSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const meshRouter = /(?:メッシュ(?:Wi-?Fi)?ルーター|mesh\s*(?:Wi-?Fi\s*)?router|Mesh路由器|메시\s*(?:와이파이\s*)?공유기)/iu.test(normalized);
  const wifi7 = /Wi-?Fi\s*7/iu.test(normalized);
  const speed = normalized.match(/\b(BE\d{4,5})\b/iu)?.[1]?.toUpperCase();
  const triBand = /(?:トライバンド|tri[\s-]*band|三频|三頻|트라이밴드)/iu.test(normalized);
  const pack = normalized.match(/\b(\d)[\s-]*(?:台セット|台組|pack|只装|只裝|개\s*세트)/iu)?.[1];
  const ethernet = normalized.match(/\b(\d(?:\.\d)?)\s*GbE\b/iu)?.[1];
  if (!meshRouter || !wifi7 || !speed || !triBand || !pack || !ethernet) return '';
  return ['Wi-Fi 7 メッシュルーター', speed, 'トライバンド', `${pack}台セット`, `${ethernet}GbE`].join(' ');
}

function buildFdm3dPrinterSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const printer = /(?:3Dプリンター|3D\s*printer|3D打印机|3D打印機|3D\s*프린터)/iu.test(normalized);
  const corexy = /CoreXY/iu.test(normalized);
  const volume = normalized.match(/\b(\d{2,3})\s*[x×]\s*(\d{2,3})\s*[x×]\s*(\d{2,3})\s*mm\b/iu);
  const speed = normalized.match(/\b(\d{2,4})\s*mm\s*\/\s*s\b/iu)?.[1];
  const autoLeveling = /(?:自動レベリング|auto(?:matic)?\s*(?:bed\s*)?leveling|自动调平|自動調平|자동\s*레벨링)/iu.test(normalized);
  const enclosed = /(?:密閉(?:型|筐体)?|enclosed|封闭式|封閉式|밀폐형)/iu.test(normalized);
  if (!printer || !corexy || !volume || !speed || !autoLeveling || !enclosed) return '';
  return ['FDM 3Dプリンター', 'CoreXY', `${volume[1]}×${volume[2]}×${volume[3]}mm`, `${speed}mm/s`, '自動レベリング', '密閉型'].join(' ');
}

function buildRobotLawnMowerSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const mower = /(?:ロボット芝刈り機|robot(?:ic)?\s*lawn\s*mower|割草机器人|割草機器人|로봇\s*잔디깎이)/iu.test(normalized);
  const rtk = /\bRTK\b/iu.test(normalized);
  const area = normalized.match(/\b(\d{3,5})\s*(?:㎡|m(?:2|²)|sq\.?\s*m|平方米|平方公尺|제곱미터)/iu)?.[1];
  const obstacle = /(?:障害物検知|obstacle\s*(?:detection|avoidance)|障碍物检测|障礙物偵測|장애물\s*(?:감지|회피))/iu.test(normalized);
  const wireFree = /(?:境界ワイヤー不要|boundary\s*wire\s*free|wire[\s-]*free|无需边界线|無需邊界線|경계선\s*불필요)/iu.test(normalized);
  if (!mower || !rtk || !area || !obstacle || !wireFree) return '';
  return ['ロボット芝刈り機', 'RTK', `${area}㎡`, '障害物検知', '境界ワイヤー不要'].join(' ');
}

function buildFoldingElectricBikeSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const bike = /(?:折りたたみ電動アシスト自転車|folding\s*(?:electric\s*bike|e-bike)|折叠电动自行车|折疊電動自行車|접이식\s*전기\s*자전거)/iu.test(normalized);
  const wheel = normalized.match(/\b(\d{2})\s*(?:インチ|inch(?:es)?|英寸|인치)/iu)?.[1];
  const motor = normalized.match(/\b(\d{3,4})\s*W\b/iu)?.[1];
  const voltage = normalized.match(/\b(\d{2,3})\s*V\b/iu)?.[1];
  const capacity = normalized.match(/\b(\d{1,2}(?:\.\d)?)\s*Ah\b/iu)?.[1];
  const range = normalized.match(/\b(\d{2,3})\s*km\b/iu)?.[1];
  if (!bike || !wheel || !motor || !voltage || !capacity || !range) return '';
  return ['折りたたみ電動アシスト自転車', `${wheel}インチ`, `${motor}W`, `${voltage}V`, `${capacity}Ah`, `航続${range}km`].join(' ');
}

function buildPortablePowerStationSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const station = /(?:ポータブル電源|portable\s*power\s*station|便携式储能电源|便攜式儲能電源|휴대용\s*파워뱅크)/iu.test(normalized);
  const lifepo4 = /(?:LiFePO4|リン酸鉄|磷酸铁|磷酸鐵|리튬인산철)/iu.test(normalized);
  const capacity = normalized.match(/\b(\d{3,5})\s*Wh\b/iu)?.[1];
  const output = normalized.match(/(?:定格出力|rated\s*output|额定功率|額定功率|정격\s*출력)\s*(\d{3,5})\s*W\b/iu)?.[1];
  const ups = /\bUPS\b/iu.test(normalized);
  const solar = normalized.match(/(?:ソーラー入力|solar\s*input|太阳能输入|太陽能輸入|태양광\s*입력)\s*(\d{2,4})\s*W\b/iu)?.[1];
  if (!station || !lifepo4 || !capacity || !output || !ups || !solar) return '';
  return ['ポータブル電源', 'LiFePO4', `${capacity}Wh`, `定格出力${output}W`, 'UPS', `ソーラー入力${solar}W`].join(' ');
}

function buildCompressorDehumidifierSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const dehumidifier = /(?:除湿機|dehumidifier|除湿机|除濕機|제습기|部屋干し.{0,12}(?:早く|速く).{0,8}乾|dry\s*laundry\s*indoors?.{0,12}faster|室内晾衣.{0,8}(?:更快干|快速干)|실내\s*빨래.{0,12}빨리\s*말리)/iu.test(normalized);
  const compressor = /(?:コンプレッサー式|compressor|压缩机式|壓縮機式|컴프레서식)/iu.test(normalized);
  const daily = normalized.match(/\b(\d{1,2}(?:\.\d)?)\s*L\s*(?:\/\s*(?:日|day)|per\s*day|每天|每日|\/\s*일)/iu)?.[1];
  const tank = normalized.match(/(?:タンク|tank|水箱|물통)\s*(\d(?:\.\d)?)\s*L\b/iu)?.[1];
  const laundry = /(?:衣類乾燥|部屋干し.{0,16}乾|laundry\s*drying|dry\s*laundry\s*indoors?|衣物干燥|衣物乾燥|室内晾衣.{0,12}干|의류\s*건조|실내\s*빨래.{0,16}말리)/iu.test(normalized);
  const drainage = /(?:連続排水|continuous\s*drain(?:age)?|连续排水|連續排水|연속\s*배수)/iu.test(normalized);
  if (!dehumidifier || !compressor || !daily || !tank || !laundry || !drainage) return '';
  return ['コンプレッサー式除湿機', `${daily}L/日`, `タンク${tank}L`, '衣類乾燥', '連続排水'].join(' ');
}

function buildElectricStandingDeskSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const desk = /(?:電動昇降デスク|electric\s*(?:height\s*adjustable\s*|standing\s*)desk|电动升降桌|電動升降桌|전동\s*스탠딩\s*데스크|座りっぱなし.{0,16}(?:減ら|避け).{0,16}立って.{0,12}仕事|alternate.{0,12}sitting.{0,12}standing.{0,20}(?:work|working)|工作时.{0,12}坐站交替|工作時.{0,12}坐站交替|일할\s*때.{0,12}앉았다.{0,8}서서.{0,12}일)/iu.test(normalized);
  const size = normalized.match(/\b(\d{2,3})\s*[x×]\s*(\d{2,3})\s*cm\b/iu);
  const dualMotor = /(?:デュアルモーター|dual[\s-]*motor|双电机|雙馬達|듀얼\s*모터)/iu.test(normalized);
  const memory = normalized.match(/\b(\d)\s*(?:メモリ|memory\s*preset(?:s)?|档记忆|檔記憶|메모리)/iu)?.[1];
  const antiCollision = /(?:衝突防止|anti[\s-]*collision|防碰撞|충돌\s*방지)/iu.test(normalized);
  if (!desk || !size || !dualMotor || !memory || !antiCollision) return '';
  return ['電動昇降デスク', `${size[1]}×${size[2]}cm`, 'デュアルモーター', `${memory}メモリ`, '衝突防止'].join(' ');
}

function buildErgonomicOfficeChairSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const chair = /(?:エルゴノミクスオフィスチェア|ergonomic\s*office\s*chair|人体工学办公椅|人體工學辦公椅|인체공학\s*사무용\s*의자)/iu.test(normalized);
  const headrest = /(?:ヘッドレスト|headrest|头枕|頭枕|헤드레스트)/iu.test(normalized);
  const lumbar = /(?:腰サポート|lumbar\s*support|腰部支撑|腰部支撐|요추\s*지지)/iu.test(normalized);
  const armrests = normalized.match(/\b(\d)D\s*(?:肘掛け|armrests?|扶手|팔걸이)/iu)?.[1];
  const mesh = /(?:メッシュ|mesh|网布|網布|메쉬)/iu.test(normalized);
  const load = normalized.match(/(?:耐荷重|weight\s*capacity|承重|하중)\s*(\d{2,3})\s*kg\b/iu)?.[1];
  if (!chair || !headrest || !lumbar || !armrests || !mesh || !load) return '';
  return ['エルゴノミクスオフィスチェア', 'ヘッドレスト', '腰サポート', `${armrests}D肘掛け`, 'メッシュ', `耐荷重${load}kg`].join(' ');
}

function buildRetrofitSmartLockSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const lock = /(?:後付けスマートロック|retrofit\s*smart\s*lock|后装智能门锁|後裝智能門鎖|설치형\s*스마트\s*도어락|鍵を交換せず.{0,20}(?:玄関|ドア).{0,20}(?:指紋|暗証番号)|unlock.{0,16}door.{0,20}fingerprint.{0,16}keypad.{0,32}without\s*replacing.{0,8}lock|不换门锁.{0,20}指纹.{0,12}密码.{0,12}开门|자물쇠\s*교체\s*없이.{0,20}지문.{0,12}비밀번호.{0,16}문\s*열)/iu.test(normalized);
  const fingerprint = /(?:指紋|fingerprint|指纹|지문)/iu.test(normalized);
  const keypad = /(?:暗証番号|keypad|密码|密碼|비밀번호)/iu.test(normalized);
  const matter = /\bMatter\b/iu.test(normalized);
  const autoLock = /(?:オートロック|auto[\s-]*lock|自动上锁|自動上鎖|자동\s*잠금)/iu.test(normalized);
  const emergencyKey = /(?:非常用キー|emergency\s*key|应急钥匙|緊急鑰匙|비상\s*키)/iu.test(normalized);
  if (!lock || !fingerprint || !keypad || !matter || !autoLock || !emergencyKey) return '';
  return ['後付けスマートロック', '指紋', '暗証番号', 'Matter', 'オートロック', '非常用キー'].join(' ');
}

function buildPressureIhRiceCookerSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const cooker = /(?:圧力\s*IH\s*炊飯器|pressure\s*(?:IH|induction)\s*rice\s*cooker|压力\s*IH\s*电饭煲|壓力\s*IH\s*電子鍋|압력\s*IH\s*밥솥|圧力.{0,8}IH.{0,20}\d(?:\.\d)?\s*合.{0,12}炊|cooks?.{0,16}\d(?:\.\d)?\s*go\s*rice.{0,24}pressure\s*induction|压力\s*IH.{0,16}\d(?:\.\d)?\s*合.{0,8}(?:米饭|米飯)|압력\s*IH.{0,16}\d(?:\.\d)?\s*合.{0,8}밥\s*짓)/iu.test(normalized);
  const capacity = normalized.match(/\b(\d(?:\.\d)?)\s*(?:合|go\b)/iu)?.[1];
  const steamCut = /(?:蒸気(?:カット|セーブ|低減|.{0,4}抑)|steam[\s-]*(?:cut|reduction|save)|蒸汽(?:减少|减量)|蒸氣(?:減少|減量)|증기\s*(?:절감|감소))/iu.test(normalized);
  const keepWarm = normalized.match(/(?:保温|keep[\s-]*warm|保溫|보온)\s*(\d{1,2})\s*(?:時間|hours?|小时|小時|시간)/iu)?.[1];
  if (!cooker || !capacity || !steamCut || !keepWarm) return '';
  return ['圧力IH炊飯器', `${capacity}合`, '蒸気カット', `保温${keepWarm}時間`].join(' ');
}

function buildDualDashCamSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const dashCam = /(?:ドライブレコーダー|dash[\s-]*cam(?:era)?|行车记录仪|行車記錄器|블랙박스|(?:あおり|煽り)運転.{0,24}前.{0,12}後ろ.{0,16}録画|records?.{0,16}(?:both\s*)?front.{0,12}(?:and|&).{0,12}rear.{0,24}(?:road|driving|incident|accident)|(?:防碰瓷|事故取证).{0,20}前后.{0,12}(?:录像|錄像)|(?:사고|보복운전).{0,16}대비.{0,20}전후방.{0,16}녹화)/iu.test(normalized);
  const dual = /(?:前後\s*2\s*カメラ|前.{0,8}後ろ.{0,12}録画|front\s*(?:and|&)\s*rear|records?.{0,16}(?:both\s*)?front.{0,12}(?:and|&).{0,12}rear|dual[\s-]*camera|前后双摄|前后.{0,8}(?:录像|錄像)|前後雙鏡|전후방\s*2?\s*채널|전후방.{0,12}녹화)/iu.test(normalized);
  const resolution = normalized.match(/\b([248])\s*K\b/iu)?.[1];
  const parking = /(?:駐車(?:中も?)?監視|parking\s*(?:monitoring|mode)|停车监控|停車監控|주차\s*감시)/iu.test(normalized);
  const gps = /\bGPS\b/iu.test(normalized);
  const wifi = /\bWi[\s-]*Fi\b/iu.test(normalized);
  if (!dashCam || !dual || !resolution || !parking || !gps || !wifi) return '';
  return ['ドライブレコーダー', '前後2カメラ', `${resolution}K`, '駐車監視', 'GPS', 'Wi-Fi'].join(' ');
}

function buildCameraPetFeederSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const feeder = /(?:ペット(?:用)?自動給餌器|自動給餌器|automatic\s*(?:pet\s*)?feeder|自动喂食器|自動餵食器|자동\s*급식기|留守中.{0,20}(?:猫|犬|ペット).{0,20}(?:自動.{0,8}(?:ご飯|餌)|(?:ご飯|餌).{0,8}自動)|feeds?.{0,12}(?:cat|dog|pet).{0,20}automatically.{0,24}(?:away|not\s*home)|出门时.{0,20}自动.{0,8}(?:给)?(?:猫|狗|宠物)喂食|外出時.{0,20}自動.{0,8}(?:給)?(?:貓|狗|寵物)餵食|집을\s*비울\s*때.{0,20}(?:고양이|강아지|반려동물).{0,20}자동으로.{0,8}밥)/iu.test(normalized);
  const capacity = normalized.match(/\b(\d(?:\.\d)?)\s*L\b/iu)?.[1];
  const camera = /(?:1080p.{0,16}(?:カメラ|camera|摄像头|鏡頭|카메라)|(?:カメラ|camera|摄像头|鏡頭|카메라).{0,16}1080p)/iu.test(normalized);
  const wifi = /\bWi[\s-]*Fi\b/iu.test(normalized);
  const twoWayAudio = /(?:双方向音声|two[\s-]*way\s*audio|双向语音|雙向語音|양방향\s*음성)/iu.test(normalized);
  if (!feeder || !capacity || !camera || !wifi || !twoWayAudio) return '';
  return ['ペット自動給餌器', `${capacity}L`, '1080pカメラ', 'Wi-Fi', '双方向音声'].join(' ');
}

function buildIplHairRemovalSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const device = /(?:IPL\s*光美容器|IPL\s*(?:hair\s*removal\s*)?device|IPL\s*脱毛仪|IPL\s*脫毛儀|IPL\s*제모기|(?:家|自宅).{0,16}(?:ムダ毛|脱毛).{0,12}(?:ケア|処理)|(?:remove|reduce).{0,12}(?:body\s*)?hair.{0,16}(?:at\s*home|home)|在家.{0,12}(?:脱毛|除毛)|집에서.{0,12}(?:제모|털\s*제거))/iu.test(normalized);
  const tenThousands = normalized.match(/(\d{1,3})\s*(?:万\s*(?:回|発|发|次)?|만\s*회)/iu)?.[1];
  const rawFlashes = normalized.match(/\b(\d{5,7})\s*flashes?\b/iu)?.[1];
  const flashes = tenThousands ? String(Number(tenThousands) * 10000) : rawFlashes || '';
  const cooling = /(?:冷却(?:機能)?|cooling|冰感冷却|冷感|냉각)/iu.test(normalized);
  const levels = normalized.match(/(\d{1,2})\s*(?:段階|levels?|档|檔|단계)/iu)?.[1];
  const skinSensor = /(?:肌色センサー|skin[\s-]*tone\s*sensor|肤色传感器|膚色感測器|피부톤\s*센서)/iu.test(normalized);
  if (!device || !flashes || !cooling || !levels || !skinSensor) return '';
  return ['IPL光美容器', `${Number(flashes) / 10000}万回`, '冷却機能', `${levels}段階`, '肌色センサー'].join(' ');
}

function portHubFeatures(query) {
  const features = [];
  const power = query.match(/(?:pd\s*)?(\d{2,3})\s*w(?:\s*pd)?/iu);
  if (power) features.push(`${power[1]}W`);
  const resolution = query.match(/\b([48])\s*k\b/iu);
  if (resolution) features.push(`${resolution[1]}K`);
  const refreshRate = query.match(/\b(\d{2,3})\s*hz\b/iu);
  if (refreshRate) features.push(`${refreshRate[1]}Hz`);
  if (/display\s*link/iu.test(query)) features.push('DisplayLink');
  const appleSilicon = query.match(/\b(m[1-4])\b/iu);
  if (appleSilicon) features.push(`${appleSilicon[1].toUpperCase()}対応`);
  if (/\bhdr\b/iu.test(query)) features.push('HDR');
  if (/\bmst\b/iu.test(query)) features.push('MST');
  const displayPort = query.match(/display\s*port\s*(\d(?:\.\d)?)/iu);
  if (displayPort) features.push(`DisplayPort ${displayPort[1]}`);
  else if (/display\s*port/iu.test(query)) features.push('DisplayPort');
  if (/(?:dual.{0,16}(?:display|monitor)|2.{0,12}(?:display|monitor)|デュアル.{0,12}モニター|2画面|双.{0,12}显示器|雙.{0,12}顯示器|듀얼(?:.{0,12}모니터)?|모니터\s*2대)/iu.test(query)) features.push('デュアルモニター');
  if (/(?:macbook|macos|mac\s*用|맥북|苹果电脑|蘋果電腦)/iu.test(query)) features.push('Mac対応');
  else if (/(?:windows|win\s*11|윈도우)/iu.test(query)) features.push('Windows対応');
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
  if (/usb\s*4/iu.test(query) && dock) product = 'USB4 ドック';
  else if (thunderbolt && dock) product = `Thunderbolt${thunderbolt[1] ? ` ${thunderbolt[1]}` : ''} ドック`;
  else if (/usb[- ]?a/iu.test(query) && /(?:ハブ|hub|集线器|集線器|허브)/iu.test(query)) product = 'USB-Aハブ';
  if (!product) return '';
  const limit = 8;
  return [product, ...portHubFeatures(query).slice(0, limit)].join(' ');
}

function robotVacuumModel(query) {
  const match = String(query || '').normalize('NFKC')
    .match(/\b(?:roomba\s*)?([jis]\d{1,2}(?:\+)?)(?![a-z0-9])/iu);
  return match ? `Roomba ${match[1].toLowerCase()}` : '';
}

function dysonVacuumModel(query) {
  const match = String(query || '').normalize('NFKC').match(/\bv\s*(8|10|11|12|15)\b/iu);
  return match ? `Dyson V${match[1]}` : '';
}

function buildDysonVacuumAccessorySearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  if (!/(?:dyson|ダイソン|戴森|다이슨)/iu.test(normalized)) return '';
  let product = '';
  if (/(?:交換|替え|replacement|替换|替換|교체)?\s*(?:hepa\s*)?(?:フィルター|filters?|滤网|濾網|필터)/iu.test(normalized)) {
    product = '交換HEPAフィルター';
  } else if (/(?:交換|替え|replacement|替换|替換|교체)?\s*(?:バッテリー|battery|电池|電池|배터리)/iu.test(normalized)) {
    product = '交換バッテリー';
  } else if (/(?:充電器|充電アダプター|charger|charging\s*adapter|充电器|充電器|충전기)/iu.test(normalized)) {
    product = '充電器';
  }
  if (!product) return '';
  const model = dysonVacuumModel(normalized);
  const capacity = normalized.match(/(\d{3,5})\s*mah/iu)?.[1];
  const count = normalized.match(/(\d+)\s*(?:個|枚|本|セット|個セット|pack|packs|pcs|pieces|件套|个装|個裝|개|매|세트)/iu)?.[1];
  return [model || 'Dyson コードレス掃除機', product, capacity ? `${capacity}mAh` : '', count ? `${count}個セット` : '']
    .filter(Boolean).join(' ');
}

function airPurifierIdentity(query) {
  const value = String(query || '').normalize('NFKC');
  const sharp = value.match(/\bKC[- ]?([A-Z]\d{2,3})\b/iu);
  if (sharp) return `Sharp KC-${sharp[1].toUpperCase()}`;
  const levoit = value.match(/\bcore\s*(\d{3}[a-z]?)\b/iu);
  if (levoit) return `Levoit Core ${levoit[1].toUpperCase()}`;
  const samsung = value.match(/\b(AX\d{2}[A-Z0-9]{4,})\b/iu);
  if (samsung) return `Samsung ${samsung[1].toUpperCase()}`;
  const xiaomi = value.match(/(?:xiaomi|小米).{0,20}(?:air\s*purifier|空气净化器|空氣淨化器)?\s*(4\s*(?:lite|pro)?)/iu);
  if (xiaomi) return `Xiaomi Air Purifier ${xiaomi[1].replace(/\s+/gu, ' ').replace(/lite/iu, 'Lite').replace(/pro/iu, 'Pro').trim()}`;
  return '';
}

function buildAirPurifierFilterSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const purifier = /(?:空気清浄機|air\s*purifier|空气净化器|空氣淨化器|공기\s*청정기|sharp|シャープ|levoit|xiaomi|小米|samsung|三星|삼성)/iu.test(normalized);
  const filter = /(?:フィルター|filter|滤芯|濾芯|滤网|濾網|필터)/iu.test(normalized);
  if (!(purifier && filter)) return '';
  const identity = airPurifierIdentity(normalized);
  if (!identity) return '';
  const type = /(?:集じん|集塵|dust\s*collection)/iu.test(normalized) ? '交換集じんフィルター'
    : /(?:脱臭|deodori[sz]ing|活性炭|탈취)/iu.test(normalized) ? '交換脱臭フィルター'
    : /(?:hepa|ヘパ|헤파)/iu.test(normalized) ? '交換HEPAフィルター'
    : '交換フィルター';
  const partNumber = normalized.match(/\b(FZ-[A-Z0-9]{4,})\b/iu)?.[1]?.toUpperCase() || '';
  return [identity, type, partNumber].filter(Boolean).join(' ');
}

function waterFilterIdentity(query) {
  const value = String(query || '').normalize('NFKC');
  if (/(?:brita|ブリタ)/iu.test(value) && /maxtra\s*pro/iu.test(value)) return 'BRITA MAXTRA PRO';
  const toray = value.match(/\b(MKC[.]?MX2J)\b/iu);
  if (toray) return `Toray ${toray[1].toUpperCase().replace('MKCMX', 'MKC.MX')}`;
  const cleansui = value.match(/\b(HGC9S)\b/iu);
  if (cleansui) return `Cleansui ${cleansui[1].toUpperCase()}`;
  const panasonic = value.match(/\b(TK[- ]?CJ24)(?!C)/iu);
  if (panasonic) return 'Panasonic TK-CJ24';
  return '';
}

function refrigeratorWaterFilterIdentity(query) {
  const value = String(query || '').normalize('NFKC');
  if (/(?:samsung|三星|삼성)/iu.test(value) && /HAF[- ]?QIN/iu.test(value)) return 'Samsung HAF-QIN';
  if (/(?:\bLG\b|엘지)/iu.test(value) && /LT1000P/iu.test(value)) return 'LG LT1000P';
  if (/(?:\bGE\b|通用电气|通用電氣)/iu.test(value) && /RPWFE/iu.test(value)) return 'GE RPWFE';
  if (/(?:whirlpool|ワールプール|惠而浦|월풀)/iu.test(value) && /everydrop\s*(?:filter\s*)?1/iu.test(value)) {
    return 'Whirlpool EveryDrop Filter 1';
  }
  return '';
}

function detergentPodIdentity(query) {
  const value = String(query || '').normalize('NFKC');
  if (/(?:finish|フィニッシュ|亮碟|피니시)/iu.test(value)) return 'Finish';
  if (/(?:cascade|カスケード|캐스케이드)/iu.test(value)) return /platinum\s*plus/iu.test(value) ? 'Cascade Platinum Plus' : 'Cascade';
  if (/(?:joy|ジョイ)/iu.test(value)) return 'Joy';
  if (/(?:ariel|アリエール|碧浪|아리엘)/iu.test(value)) return 'Ariel';
  if (/(?:tide|汰渍|汰漬|타이드)/iu.test(value)) return 'Tide PODS';
  if (/(?:bold|ボールド|볼드)/iu.test(value)) return 'Bold';
  return '';
}

function buildDetergentPodSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const dishwasher = /(?:食洗機|食器洗い機|dishwasher|洗碗机|洗碗機|식기세척기)/iu.test(normalized)
    && /(?:洗剤|detergent|タブレット|tabs?|tablets?|pods?|凝珠|세제|타블렛|캡슐)/iu.test(normalized);
  const laundry = /(?:洗濯|laundry|洗衣|세탁)/iu.test(normalized)
    && /(?:洗剤|detergent|ジェルボール|pods?|capsules?|凝珠|세제|젤볼|캡슐)/iu.test(normalized);
  if (!dishwasher && !laundry) return '';
  const identity = detergentPodIdentity(normalized);
  if (!identity) return '';
  const count = normalized.match(/(\d+)\s*(?:個|錠|粒|tabs?|tablets?|pods?|capsules?|count|pcs|pieces|颗|顆|개|정|캡슐)/iu)?.[1];
  const scent = /(?:無香料|無香|unscented|fragrance[- ]?free|无香|무향)/iu.test(normalized) ? '無香料'
    : /(?:レモン|lemon|柠檬|檸檬|레몬)/iu.test(normalized) ? 'レモン'
    : /(?:ラベンダー|lavender|薰衣草|라벤더)/iu.test(normalized) ? 'ラベンダー' : '';
  const refill = /(?:詰め替え|つめかえ|refill|补充装|補充裝|리필)/iu.test(normalized) ? '詰め替え' : '';
  const sensitive = /(?:敏感肌(?:向け)?|低刺激|for\s+sensitive\s+skin|hypoallergenic|温和|溫和|민감성\s*피부|저자극)/iu.test(normalized) ? '敏感肌向け' : '';
  const antibacterial = /(?:抗菌|除菌|antibacterial|antimicrobial|杀菌|殺菌|항균)/iu.test(normalized) ? '抗菌' : '';
  const oneRinse = /(?:すすぎ\s*1\s*回|one[- ]?rinse|single[- ]?rinse|漂洗\s*(?:1\s*次|一次)|헹굼\s*1\s*회)/iu.test(normalized) ? 'すすぎ1回' : '';
  const babyClothes = /(?:赤ちゃん|ベビー)(?:用|の)?衣類|baby\s*clothes|婴儿衣物|嬰兒衣物|아기\s*옷/iu.test(normalized) ? '赤ちゃん衣類対応' : '';
  const indoorDrying = /(?:部屋干し|室内干し|indoor\s*drying|室内晾晒|室內晾曬|실내\s*건조)/iu.test(normalized) ? '部屋干し' : '';
  const deodorizing = /(?:防臭|消臭|odor\s*control|deodori[sz]ing|除臭|냄새\s*제거|탈취)/iu.test(normalized) ? '防臭' : '';
  const noBrightener = /(?:蛍光(?:増白)?剤不使用|no\s*optical\s*brighteners?|optical\s*brightener[- ]?free|无荧光增白剂|無螢光增白劑|형광증백제\s*무첨가)/iu.test(normalized) ? '蛍光増白剤不使用' : '';
  const washerType = /(?:ドラム式(?:対応|用)?|front[- ]?load(?:er)?|滚筒洗衣机|滾筒洗衣機|드럼\s*세탁기)/iu.test(normalized) ? 'ドラム式対応'
    : /(?:縦型(?:対応|用)?|top[- ]?load(?:er)?|波轮洗衣机|波輪洗衣機|통돌이\s*세탁기)/iu.test(normalized) ? '縦型対応' : '';
  const wool = /(?:ウール|wool|羊毛|울\s*(?:의류)?)/iu.test(normalized) ? 'ウール対応' : '';
  const softener = /(?:柔軟剤不使用|without\s+fabric\s+softener|no\s+fabric\s+softener|不含柔顺剂|不含柔順劑|유연제\s*무첨가)/iu.test(normalized) ? '柔軟剤不使用'
    : /(?:柔軟剤入り|with\s+fabric\s+softener|含柔顺剂|含柔順劑|유연제\s*함유)/iu.test(normalized) ? '柔軟剤入り' : '';
  return [identity, dishwasher ? '食洗機用洗剤タブレット' : '洗濯用洗剤ジェルボール', scent, refill, sensitive, antibacterial, oneRinse, babyClothes, indoorDrying, deodorizing, noBrightener, washerType, wool, softener, count ? `${count}個入り` : ''].filter(Boolean).join(' ');
}

function buildRefrigeratorWaterFilterSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const filter = /(?:冷蔵庫(?:用)?(?:給水|浄水)?フィルター|refrigerator\s*water\s*filter|冰箱(?:净水|淨水)?(?:滤芯|濾芯)|냉장고\s*(?:정수\s*)?필터)/iu.test(normalized);
  if (!filter) return '';
  const identity = refrigeratorWaterFilterIdentity(normalized);
  if (!identity) return '';
  const part = normalized.match(/\b(DA97[- ]?17376B|ADQ74793501|EDR1RXD1)\b/iu)?.[1]
    ?.toUpperCase().replace('DA97 ', 'DA97-') || '';
  const genuine = /(?:純正|正規品|genuine|original|原装|原裝|정품)/iu.test(normalized) ? '純正' : '';
  const count = normalized.match(/(\d+)\s*(?:個|本|pack|packs|count|pcs|pieces|件套|个装|個裝|个|個|개|개입|세트)/iu)?.[1];
  return [identity, part, '冷蔵庫給水フィルター', genuine, count ? `${count}個セット` : ''].filter(Boolean).join(' ');
}

function buildWaterFilterCartridgeSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const cartridge = /(?:交換|替え|replacement|替换|替換|교체)?\s*(?:カートリッジ|cartridges?|滤芯|濾芯|필터\s*카트리지|카트리지)/iu.test(normalized);
  if (!cartridge) return '';
  const identity = waterFilterIdentity(normalized);
  if (!identity) return '';
  const partNumber = normalized.match(/\b(TK[- ]?CJ24C1)\b/iu)?.[1]?.toUpperCase().replace('TK CJ', 'TK-CJ') || '';
  const count = normalized.match(/(\d+)\s*(?:個|本|個入り|pack|packs|count|pcs|pieces|件套|个装|個裝|개|개입|세트)/iu)?.[1];
  return [identity, '交換カートリッジ', partNumber, count ? `${count}個セット` : ''].filter(Boolean).join(' ');
}

function printerIdentity(query) {
  const value = String(query || '').normalize('NFKC');
  const canon = value.match(/\b(TS\d{4})\b/iu);
  if (canon) return `Canon PIXUS ${canon[1].toUpperCase()}`;
  const epson = value.match(/\b(EP[- ]?\d{3}[A-Z])\b/iu);
  if (epson) return `Epson ${epson[1].toUpperCase().replace('EP ', 'EP-')}`;
  const brother = value.match(/\b(DCP[- ]?J\d{3}[A-Z])\b/iu);
  if (brother) return `Brother ${brother[1].toUpperCase().replace('DCP J', 'DCP-J')}`;
  const hp = value.match(/(?:deskjet\s*)?(2720)\b/iu);
  if (hp && /(?:hp|deskjet)/iu.test(value)) return `HP DeskJet ${hp[1]}`;
  return '';
}

function printerInkPartNumber(query) {
  const value = String(query || '').normalize('NFKC');
  return value.match(/\b(BCI[- ]?331\+330|KAM[- ]?6CL[- ]?L|LC411[- ]?4PK|67XL)\b/iu)?.[1]
    ?.toUpperCase().replace('BCI ', 'BCI-').replace('KAM ', 'KAM-').replace('6CL L', '6CL-L').replace('LC411 ', 'LC411-') || '';
}

function buildPrinterInkSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  if (!/(?:インク|ink\s*cartridges?|墨盒|墨水|잉크)/iu.test(normalized)) return '';
  const identity = printerIdentity(normalized);
  const partNumber = printerInkPartNumber(normalized);
  if (!(identity && partNumber)) return '';
  const kind = /(?:互換|compatible|兼容|호환)/iu.test(normalized) ? '互換インクカートリッジ'
    : /(?:純正|genuine|original|原装|原裝|정품)/iu.test(normalized) ? '純正インクカートリッジ'
    : 'インクカートリッジ';
  const colors = normalized.match(/(\d+)\s*(?:色|colors?|色套装|色套裝|색)/iu)?.[1];
  const black = /(?:ブラック|黒|black|黑色|黑|검정|블랙)/iu.test(normalized) ? '黒' : '';
  const color = !colors && /(?:カラー|color(?!s)|彩色|컬러)/iu.test(normalized) ? 'カラー' : '';
  return [identity, kind, partNumber, colors ? `${colors}色` : '', black, color].filter(Boolean).join(' ');
}

function toothbrushIdentity(query) {
  const value = String(query || '').normalize('NFKC');
  const io = value.match(/(?:oral[- ]?b|オーラルB|ブラウン|欧乐B|歐樂B|오랄비).{0,20}\bio\s*(?:series\s*)?(\d+)?/iu);
  if (io) return `Oral-B iO${io[1] ? ` Series ${io[1]}` : ''}`;
  const pro = value.match(/(?:oral[- ]?b|オーラルB|ブラウン|欧乐B|歐樂B|오랄비).{0,20}\bpro\s*(\d+)?/iu);
  if (pro) return `Oral-B Pro${pro[1] ? ` ${pro[1]}` : ''}`;
  const sonicare = value.match(/\b(HX\d{4})\b/iu);
  if (sonicare && /(?:sonicare|ソニッケアー?|飞利浦|飛利浦|소닉케어|philips)/iu.test(value)) return `Philips Sonicare ${sonicare[1].toUpperCase()}`;
  const doltz = value.match(/\b(EW[- ]?DP\d{2})\b/iu);
  if (doltz) return `Panasonic Doltz ${doltz[1].toUpperCase().replace('EW DP', 'EW-DP')}`;
  return '';
}

function buildToothbrushHeadSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  if (!/(?:替えブラシ|交換ブラシ|brush\s*heads?|替换刷头|替換刷頭|교체\s*칫솔모|칫솔모)/iu.test(normalized)) return '';
  const identity = toothbrushIdentity(normalized);
  if (!identity) return '';
  const style = /(?:ultimate\s*clean|アルティメイトクリーン)/iu.test(normalized) ? 'Ultimate Clean'
    : /(?:c3\s*premium\s*plaque\s*control)/iu.test(normalized) ? 'C3 Premium Plaque Control'
    : /(?:cross\s*action|クロスアクション|크로스액션)/iu.test(normalized) ? 'CrossAction'
    : normalized.match(/\b(WEW\d{4})\b/iu)?.[1]?.toUpperCase() || '';
  const soft = /(?:やわらか|soft|软毛|軟毛|부드러운|소프트)/iu.test(normalized) ? 'やわらかめ' : '';
  const count = normalized.match(/(\d+)\s*(?:本|個|pack|packs|count|pcs|pieces|支|个|個|개|개입)/iu)?.[1];
  return [identity, '替えブラシ', style, soft, count ? `${count}本セット` : ''].filter(Boolean).join(' ');
}

function shaverIdentity(query) {
  const value = String(query || '').normalize('NFKC');
  if (/(?:braun|ブラウン|博朗|브라운).{0,20}(?:clean\s*&\s*renew|クリーン\s*&\s*リニュー)/iu.test(value)) return 'Braun Clean & Renew';
  const braun = value.match(/(?:braun|ブラウン|博朗|브라운).{0,20}(?:series|シリーズ)\s*(\d+)(?:\s*pro)?/iu);
  if (braun) return `Braun Series ${braun[1]}${/\bpro\b/iu.test(braun[0]) ? ' Pro' : ''}`;
  const philips = value.match(/(?:philips|フィリップス|飞利浦|飛利浦|필립스).{0,20}\b(S\d{4})\b/iu);
  if (philips) return `Philips ${philips[1].toUpperCase()}`;
  const panasonic = value.match(/\b(ES[- ]?LV\d[A-Z])\b/iu);
  if (panasonic) return `Panasonic Lamdash ${panasonic[1].toUpperCase().replace('ES LV', 'ES-LV')}`;
  return '';
}

function shaverPartNumber(query) {
  return String(query || '').normalize('NFKC').match(/(?:\b(94M|WES9600|CCR6)\b|\b(SH91\/51)(?!\d))/iu)?.slice(1).find(Boolean)?.toUpperCase() || '';
}

function buildShaverReplacementSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const cleaning = /(?:洗浄液|洗浄カートリッジ|cleaning\s*(?:solution|cartridges?)|清洁液|清潔液|清洗液|세정액|세척액)/iu.test(normalized);
  const blade = /(?:替刃|交換刃|shaving\s*heads?|replacement\s*(?:heads?|blades?)|替换刀头|替換刀頭|교체\s*면도날|면도날)/iu.test(normalized);
  if (!(cleaning || blade)) return '';
  const identity = shaverIdentity(normalized);
  const partNumber = shaverPartNumber(normalized);
  if (!(identity && partNumber)) return '';
  const bladeCount = normalized.match(/(\d+)\s*(?:枚刃|blades?|刀头|刀頭|중날|날)/iu)?.[1];
  const packageCount = normalized.match(/(\d+)\s*(?:個|本|pack|packs|count|pcs|pieces|个|個|개|개입)/iu)?.[1];
  return [identity, cleaning ? '洗浄液カートリッジ' : '替刃', partNumber,
    bladeCount ? `${bladeCount}枚刃` : '', packageCount ? `${packageCount}個セット` : ''].filter(Boolean).join(' ');
}

function coffeeCapsuleSystem(query) {
  const value = String(query || '').normalize('NFKC');
  if (/(?:dolce\s*gusto|ドルチェ\s*グスト|多趣酷思|돌체\s*구스토)/iu.test(value)) return 'Nescafe Dolce Gusto';
  if (/(?:nespresso|ネスプレッソ|奈斯派索|네스프레소).{0,24}(?:vertuo|ヴァーチュオ|馥旋|버츄오)/iu.test(value)) return 'Nespresso Vertuo';
  if (/(?:nespresso|ネスプレッソ|奈斯派索|네스프레소).{0,24}(?:original(?:\s*line)?|オリジナル|经典|經典|오리지널)/iu.test(value)) return 'Nespresso Original';
  return '';
}

function buildCoffeeCapsuleSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  if (!/(?:コーヒー?カプセル|coffee\s*(?:capsules?|pods?)|咖啡胶囊|咖啡膠囊|커피\s*캡슐)/iu.test(normalized)) return '';
  const system = coffeeCapsuleSystem(normalized);
  if (!system) return '';
  const count = normalized.match(/(\d+)\s*(?:個|杯分|capsules?|pods?|粒|颗|顆|개|개입)/iu)?.[1];
  return [system, 'コーヒーカプセル', count ? `${count}個セット` : ''].filter(Boolean).join(' ');
}

function cameraBatteryPart(query) {
  return String(query || '').normalize('NFKC')
    .match(/\b(NP[- ]?FZ100|NP[- ]?FW50|LP[- ]?E6NH|EN[- ]?EL15C)\b/iu)?.[1]
    ?.toUpperCase().replace(/^(NP|LP|EN) /u, '$1-') || '';
}

function buildCameraBatterySearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  if (!/(?:カメラ用?(?:交換)?バッテリー|camera\s*(?:replacement\s*)?battery|相机电池|相機電池|카메라\s*배터리)/iu.test(normalized)) return '';
  const part = cameraBatteryPart(normalized);
  if (!part) return '';
  const brand = part.startsWith('NP-') ? 'Sony' : part.startsWith('LP-') ? 'Canon' : 'Nikon';
  const genuine = /(?:純正|正規品|genuine|original|原装|原裝|정품)/iu.test(normalized) ? '純正' : '';
  const count = normalized.match(/(\d+)\s*(?:個|本|pack|packs|count|pcs|pieces|块|塊|개|개입)/iu)?.[1];
  return [brand, part, 'カメラバッテリー', genuine, count ? `${count}個セット` : ''].filter(Boolean).join(' ');
}

function toolBatteryModel(query) {
  const value = String(query || '').normalize('NFKC');
  const compact = value.match(/\b(BL1860B|DCB184)\b/iu)?.[1];
  if (compact) return compact.toUpperCase();
  if (/\bGBA\s*18V\s*5(?:\.0)?\s*AH\b/iu.test(value)) return 'GBA 18V 5Ah';
  if (/\bM18\s*B5\b/iu.test(value)) return 'M18 B5';
  return '';
}

function buildToolBatterySearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  if (!/(?:工具用?(?:交換)?バッテリー|電動工具用?バッテリー|power\s*tool\s*(?:replacement\s*)?battery|电动工具电池|電動工具電池|공구\s*배터리|전동\s*공구\s*배터리)/iu.test(normalized)) return '';
  const model = toolBatteryModel(normalized);
  if (!model) return '';
  const brand = model === 'BL1860B' ? 'Makita' : model === 'DCB184' ? 'DeWalt' : model.startsWith('GBA') ? 'Bosch' : 'Milwaukee';
  const voltage = normalized.match(/(\d+(?:\.\d+)?)\s*V\b/iu)?.[1];
  const capacity = normalized.match(/(\d+(?:\.\d+)?)\s*Ah\b/iu)?.[1];
  const genuine = /(?:純正|正規品|genuine|original|原装|原裝|정품)/iu.test(normalized) ? '純正' : '';
  const count = normalized.match(/(\d+)\s*(?:個|本|pack|packs|count|pcs|pieces|块|塊|개|개입)/iu)?.[1];
  const normalizedCapacity = capacity ? Number(capacity).toString() : '';
  const displayModel = model.startsWith('GBA ') ? 'GBA' : model;
  return [brand, displayModel, '電動工具バッテリー', voltage ? `${voltage}V` : '', normalizedCapacity ? `${normalizedCapacity}Ah` : '', genuine,
    count ? `${count}個セット` : ''].filter(Boolean).join(' ');
}

function labelTapePart(query) {
  const value = String(query || '').normalize('NFKC');
  const part = value.match(/\b(TZE[- ]?231|45013|XR[- ]?12WE|SS12K)\b/iu)?.[1];
  if (!part) return '';
  return part.toUpperCase().replace(/^TZE /u, 'TZE-').replace(/^XR /u, 'XR-');
}

function buildLabelTapeSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  if (!/(?:ラベル(?:ライター用)?テープ|label\s*tape|labeling\s*tape|标签带|標籤帶|라벨\s*테이프)/iu.test(normalized)) return '';
  const part = labelTapePart(normalized);
  if (!part) return '';
  const brand = part === 'TZE-231' ? 'Brother P-touch' : part === '45013' ? 'DYMO D1' : part === 'XR-12WE' ? 'CASIO' : 'King Jim Tepra';
  const width = normalized.match(/(\d+(?:\.\d+)?)\s*(?:mm|毫米|밀리미터)/iu)?.[1];
  const blackOnWhite = /(?:黒文字.{0,8}白|black\s*(?:print|text)?\s*on\s*white|黑字白底|黑色字.{0,6}白色底|검정\s*(?:글씨|문자).{0,8}흰색)/iu.test(normalized) ? '黒文字 白' : '';
  const genuine = /(?:純正|正規品|genuine|original|原装|原裝|정품)/iu.test(normalized) ? '純正' : '';
  const count = normalized.match(/(\d+)\s*(?:個|本|pack|packs|count|pcs|pieces|盒|卷|巻|개|개입)/iu)?.[1];
  return [brand, part, 'ラベルテープ', width ? `${width}mm` : '', blackOnWhite, genuine,
    count ? `${count}個セット` : ''].filter(Boolean).join(' ');
}

function airFryerLinerIdentity(query) {
  const value = String(query || '').normalize('NFKC');
  if (/(?:philips|フィリップス|飞利浦|飛利浦|필립스).{0,20}\bNA230\b/iu.test(value)) return 'Philips NA230';
  if (/(?:ninja|ニンジャ|忍者|닌자).{0,20}\bAF400\b/iu.test(value)) return 'Ninja AF400';
  if (/(?:cosori|コソリ|科西|코소리).{0,20}\bCP158\b/iu.test(value)) return 'Cosori CP158';
  if (/(?:instant\s*vortex|インスタント\s*ボルテックス|即时涡流|即時渦流|인스턴트\s*볼텍스)/iu.test(value)) return 'Instant Vortex';
  return '';
}

function buildAirFryerLinerSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  if (!/(?:エアフライヤー用?(?:紙|シリコン)?ライナー|air\s*fryer\s*(?:paper|silicone)?\s*liners?|空气炸锅(?:纸|硅胶)?垫|空氣炸鍋(?:紙|矽膠)?墊|에어프라이어\s*(?:종이|실리콘)?\s*라이너)/iu.test(normalized)) return '';
  const identity = airFryerLinerIdentity(normalized);
  if (!identity) return '';
  const capacity = normalized.match(/(\d+(?:\.\d+)?)\s*L\b/iu)?.[1];
  const material = /(?:シリコン|silicone|硅胶|矽膠|실리콘)/iu.test(normalized) ? 'シリコン'
    : /(?:紙|paper|纸|紙|종이)/iu.test(normalized) ? '紙' : '';
  const shape = /(?:デュアルバスケット|dual\s*basket|双篮|雙籃|듀얼\s*바스켓)/iu.test(normalized) ? 'デュアルバスケット'
    : /(?:角型|square|方形|사각)/iu.test(normalized) ? '角型'
      : /(?:丸型|round|圆形|圓形|원형)/iu.test(normalized) ? '丸型' : '';
  const count = normalized.match(/(\d+)\s*(?:枚|個|pack|packs|count|pcs|pieces|张|張|개|장)/iu)?.[1];
  return [identity, 'エアフライヤーライナー', capacity ? `${capacity}L` : '', material, shape,
    count ? `${count}枚セット` : ''].filter(Boolean).join(' ');
}

function vacuumBagIdentity(query) {
  const value = String(query || '').normalize('NFKC');
  const miele = value.match(/(?:miele|ミーレ|美诺|美諾|밀레).{0,25}(?:hyclean\s*pure\s*)?(GN|FJM)\b/iu);
  if (miele) return `Miele HyClean Pure ${miele[1].toUpperCase()}`;
  if (/(?:philips|フィリップス|飞利浦|飛利浦|필립스).{0,25}s[- ]?bag/iu.test(value)) return 'Philips s-bag';
  if (/(?:bosch|ボッシュ|博世|보쉬).{0,25}(?:type\s*g\s*all|タイプ\s*G)/iu.test(value)) return 'Bosch Type G ALL';
  return '';
}

function vacuumBagPart(query) {
  return String(query || '').normalize('NFKC').match(/\b(FC8021\/03|BBZ41FGALL)\b/iu)?.[1]?.toUpperCase() || '';
}

function buildVacuumBagSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  if (!/(?:掃除機用?(?:紙パック|ダストバッグ)|vacuum\s*(?:cleaner\s*)?(?:dust\s*)?bags?|吸尘器集尘袋|吸塵器集塵袋|진공청소기\s*먼지\s*봉투)/iu.test(normalized)) return '';
  const identity = vacuumBagIdentity(normalized);
  if (!identity) return '';
  const part = vacuumBagPart(normalized);
  const genuine = /(?:純正|正規品|genuine|original|原装|原裝|정품)/iu.test(normalized) ? '純正' : '';
  const count = normalized.match(/(\d+)\s*(?:枚|個|pack|packs|count|pcs|pieces|个|個|개|개입|장)/iu)?.[1];
  return [identity, part, '掃除機紙パック', genuine, count ? `${count}枚セット` : ''].filter(Boolean).join(' ');
}

function buildRobotVacuumConsumableSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC');
  const robotVacuum = /(?:roomba|ルンバ|robot\s*vacuum|ロボット掃除機|扫地机器人|掃地機器人|로봇\s*청소기|룸바)/iu.test(normalized);
  if (!robotVacuum) return '';
  const filter = /(?:hepa\s*)?(?:フィルター|filters?|滤网|濾網|필터)/iu.test(normalized);
  const sideBrush = /(?:サイド\s*ブラシ|side\s*brush(?:es)?|边刷|邊刷|사이드\s*브러시)/iu.test(normalized);
  const mainBrush = /(?:メイン\s*ブラシ|ローラー\s*ブラシ|main\s*brush|roller\s*brush|滚刷|滾刷|메인\s*브러시|롤러\s*브러시)/iu.test(normalized);
  const kit = /(?:交換\s*パーツ\s*セット|交換\s*部品\s*セット|replacement\s*parts?\s*(?:kit|set)|accessor(?:y|ies)\s*(?:kit|set)|配件套装|配件套組|교체\s*부품\s*세트|액세서리\s*세트)/iu.test(normalized)
    || [filter, sideBrush, mainBrush].filter(Boolean).length >= 2;
  if (kit) {
    const model = robotVacuumModel(normalized);
    const parts = [filter ? 'フィルター' : '', sideBrush ? 'サイドブラシ' : '', mainBrush ? 'メインブラシ' : ''].filter(Boolean);
    return [model || 'ロボット掃除機', '交換パーツセット', ...parts].join(' ');
  }
  let product = '';
  if (filter) {
    product = '交換フィルター';
  } else if (sideBrush || /(?:交換|替え|replacement|替换|替換|교체)?\s*(?:ブラシ|brush(?:es)?|刷子|브러시)/iu.test(normalized)) {
    product = '交換サイドブラシ';
  } else if (/(?:紙パック|ダストバッグ|dust\s*bags?|replacement\s*bags?|集尘袋|集塵袋|尘袋|塵袋|먼지\s*봉투|더스트\s*백)/iu.test(normalized)) {
    product = '交換紙パック';
  }
  if (!product) return '';
  const model = robotVacuumModel(normalized);
  const count = normalized.match(/(\d+)\s*(?:個|枚|本|セット|個セット|pack|packs|pcs|pieces|件套|个装|個裝|개|매|세트)/iu)?.[1];
  return [model || 'ロボット掃除機', product, count ? `${count}個セット` : ''].filter(Boolean).join(' ');
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

function buildPowerBankSearchKeywords(query) {
  const normalized = String(query || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!/(?:モバイルバッテリー|携帯バッテリー|power\s*bank|portable\s+battery|battery\s*pack|充电宝|充電寶|移动电源|行動電源|보조\s*배터리)/iu.test(normalized)) return '';
  const capacityMatches = [...normalized.matchAll(/(\d{4,6})\s*m\s*ah/giu)]
    .filter((match) => !isNegatedAttribute(normalized, new RegExp(`${match[1]}\\s*m\\s*ah`, 'iu')));
  const capacity = capacityMatches[0]?.[1];
  const secondCapacity = capacityMatches[1]?.[1];
  const spokenCapacityRange = normalized.match(/(?:between\s+)?(\d{4,6})\s*(?:m\s*ah\s*)?(?:から|〜|~|-|to|and|到|至|에서)\s*(\d{4,6})\s*m\s*ah/iu);
  const minimumCapacityMatch = normalized.match(/(?:(?:at\s+least|minimum(?:\s+of)?|至少|不少于)\s*(\d{4,6})\s*m\s*ah|(\d{4,6})\s*m\s*ah\s*(?:以上|or\s+more|and\s+up|이상))/iu);
  const maximumCapacityMatch = normalized.match(/(?:(?:at\s+most|maximum(?:\s+of)?|up\s+to|不超过|最多)\s*(\d{4,6})\s*m\s*ah|(\d{4,6})\s*m\s*ah\s*(?:以下|or\s+less|or\s+under|이하))/iu);
  const minimumCapacityValue = minimumCapacityMatch?.[1] || minimumCapacityMatch?.[2] || '';
  const maximumCapacityValue = maximumCapacityMatch?.[1] || maximumCapacityMatch?.[2] || '';
  const boundedCapacityRange = Boolean(minimumCapacityValue && maximumCapacityValue);
  const rangeStart = spokenCapacityRange?.[1] || (boundedCapacityRange ? minimumCapacityValue : capacity);
  const rangeEnd = spokenCapacityRange?.[2] || (boundedCapacityRange ? maximumCapacityValue : secondCapacity);
  const capacityRange = Boolean(spokenCapacityRange || boundedCapacityRange || (capacity && secondCapacity
    && new RegExp(`${capacity}\\s*m\\s*ah\\s*(?:から|〜|~|-|to|and|到|至|에서)\\s*${secondCapacity}\\s*m\\s*ah`, 'iu').test(normalized)));
  const minimumCapacity = Boolean(minimumCapacityValue);
  const maximumCapacity = Boolean(maximumCapacityValue);
  const builtInPattern = /(?:ケーブル(?:内蔵|一体型|付き)|built[- ]?in\s+(?:usb[- ]?c|lightning)?\s*cable|integrated\s+cable|自带(?:(?:USB[- ]?C|Lightning)?线)|自帶(?:(?:USB[- ]?C|Lightning)?線)|케이블\s*(?:내장|일체형))/iu;
  const builtIn = builtInPattern.test(normalized) && !isNegatedAttribute(normalized, builtInPattern);
  const usbCConnector = /(?:usb[- ]?c|type[- ]?c)/iu;
  const lightningConnector = /(?:lightning|ライトニング|闪电|閃電|라이트닝)/iu;
  const connector = usbCConnector.test(normalized) && !isNegatedAttribute(normalized, usbCConnector) ? 'USB-C'
    : lightningConnector.test(normalized) && !isNegatedAttribute(normalized, lightningConnector) ? 'Lightning' : '';
  const cable = builtIn ? `${connector ? `${connector}` : ''}ケーブル内蔵` : '';
  const magneticPattern = /(?:magsafe|マグセーフ|磁気吸着|磁吸|맥세이프|자석)/iu;
  const magnetic = magneticPattern.test(normalized) && !isNegatedAttribute(normalized, magneticPattern) ? 'MagSafe対応' : '';
  const pdWatts = [...normalized.matchAll(/(?:\bpd\s*(\d{1,3})\s*w\b|\b(\d{1,3})\s*w(?:\s*(?:usb[- ]?c|type[- ]?c))?\s*pd\b)/giu)]
    .find((match) => {
      const escaped = match[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return !isNegatedAttribute(normalized, new RegExp(escaped, 'iu'));
    });
  const pdOutputRangeMatch = normalized.match(/(?:between\s+)?(?:pd\s*)?(\d{1,3})\s*w\s*(?:から|〜|~|-|to|and|到|至|에서)\s*(?:pd\s*)?(\d{1,3})\s*w(?:\s*pd)?/iu);
  const spokenPdOutputRange = Boolean(pdOutputRangeMatch && /pd/iu.test(pdOutputRangeMatch[0]));
  const minimumPdOutputMatch = normalized.match(/(?:(?:at\s+least|minimum(?:\s+of)?|至少|不少于)\s*(?:pd\s*)?(\d{1,3})\s*w(?:\s*pd)?|(?:pd\s*)?(\d{1,3})\s*w(?:\s*pd)?\s*(?:以上|or\s+more|and\s+up|이상))/iu);
  const maximumPdOutputMatch = normalized.match(/(?:(?:at\s+most|maximum(?:\s+of)?|up\s+to|不超过|最多)\s*(?:pd\s*)?(\d{1,3})\s*w(?:\s*pd)?|(?:pd\s*)?(\d{1,3})\s*w(?:\s*pd)?\s*(?:以下|or\s+less|or\s+under|이하))/iu);
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
  const invalidPdOutputBounds = boundedPdOutputRange && pdRangeMinimum > pdRangeMaximum;
  const powerDelivery = invalidPdOutputBounds ? `PD${pdRangeMinimum}W以上 PD${pdRangeMaximum}W以下`
    : pdOutputRange ? `PD${pdRangeMinimum}W-PD${pdRangeMaximum}W`
      : minimumPdOutput ? `PD${minimumPdOutputValue}W以上`
        : maximumPdOutput ? `PD${maximumPdOutputValue}W以下`
          : requestedWatts ? `PD${requestedWatts}W` : '';
  const rangeMinimum = capacityRange
    ? boundedCapacityRange ? Number(minimumCapacityValue) : Math.min(Number(rangeStart), Number(rangeEnd)) : 0;
  const rangeMaximum = capacityRange
    ? boundedCapacityRange ? Number(maximumCapacityValue) : Math.max(Number(rangeStart), Number(rangeEnd)) : 0;
  const invalidCapacityBounds = boundedCapacityRange && rangeMinimum > rangeMaximum;
  const capacityToken = invalidCapacityBounds ? `${rangeMinimum}mAh以上 ${rangeMaximum}mAh以下`
    : capacityRange ? `${rangeMinimum}mAh-${rangeMaximum}mAh`
    : minimumCapacity ? `${minimumCapacityValue}mAh以上`
      : maximumCapacity ? `${maximumCapacityValue}mAh以下`
        : capacity ? `${capacity}mAh` : '';
  return [capacityToken, 'モバイルバッテリー', cable, magnetic, powerDelivery].filter(Boolean).join(' ');
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
  const caseMagSafePattern = /(?:magsafe|マグセーフ|磁気吸着|磁吸|맥세이프|자석)/iu;
  const caseMagSafe = label === 'ケース' && caseMagSafePattern.test(normalized)
    && !isNegatedAttribute(normalized, caseMagSafePattern) ? 'MagSafe対応' : '';
  const protectorGlass = label === '保護フィルム'
    && /(?:強化ガラス|ガラスフィルム|tempered\s*glass|钢化玻璃|鋼化玻璃|강화유리)/iu.test(normalized)
    ? '強化ガラス' : '';
  const protectorPrivacy = label === '保護フィルム'
    && /(?:覗き見防止|のぞき見防止|privacy|anti[- ]?spy|防窥|防窺|사생활\s*보호|프라이버시)/iu.test(normalized)
    ? '覗き見防止' : '';
  const specifications = specificationTokens(normalized)
    .filter((token) => !base.toLowerCase().includes(token.toLowerCase())
      && !(caseMagSafe && token.toLowerCase() === 'magsafe'));
  const materials = matchedMaterials(normalized)
    .filter((token) => !(label === '保護フィルム' && token === 'ガラス'));
  const attributes = matchedAttributes(normalized)
    .filter((token) => ['透明', '光る'].includes(token) && !materials.includes(token));
  const conditions = [...new Set([
    ...specifications, ...materials, ...attributes, caseMagSafe, protectorGlass, protectorPrivacy
  ].filter(Boolean))].slice(0, 3);
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
  ['スマホケース', /(?:スマホケース|携帯(?:ケース|カバー)|(?:phone|mobile)\s*(?:case|cover)|手机壳|手機殼|手机保护壳|手機保護殼|휴대폰\s*(?:케이스|커버)|스마트폰\s*(?:케이스|커버)|スマホ.{0,20}(?:着信|通知).{0,20}(?:背面|裏).{0,12}(?:光|ピカ)|phone.{0,20}(?:back|rear).{0,16}lights?\s*up.{0,16}notifications?|手机.{0,20}(?:通知|来电).{0,20}背面.{0,12}(?:会亮|发光)|스마트폰.{0,20}(?:알림|전화).{0,20}뒷면.{0,12}(?:불이\s*들어오|빛나))/iu],
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
  ['光る', /(?:光る|発光|ピカピカ|ピカッ|LED|ライトアップ|lights?\s*up|light[- ]?up|glowing|luminous|发光|發光|灯光|会亮|會亮|亮闪闪|빛나는|발광|불빛\s*나는|불이\s*들어오)/iu],
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
    const negatedBefore = /(?:not\s+(?:a|an|the)?|no|without(?:\s+(?:a|an|the))?|anything\s+but|不要|不是|不想要|除了|除外)\s*$/iu.test(before);
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
  const rawNormalized = String(query || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  const rawShaverReplacement = buildShaverReplacementSearchKeywords(rawNormalized);
  if (rawShaverReplacement) return rawShaverReplacement;
  const rawCoffeeCapsule = buildCoffeeCapsuleSearchKeywords(rawNormalized);
  if (rawCoffeeCapsule) return rawCoffeeCapsule;
  const rawAutomaticEspressoMachine = buildAutomaticEspressoMachineSearchKeywords(rawNormalized);
  if (rawAutomaticEspressoMachine) return rawAutomaticEspressoMachine;
  const rawSteamMicrowaveOven = buildSteamMicrowaveOvenSearchKeywords(rawNormalized);
  if (rawSteamMicrowaveOven) return rawSteamMicrowaveOven;
  const rawFrontLoadWasherDryer = buildFrontLoadWasherDryerSearchKeywords(rawNormalized);
  if (rawFrontLoadWasherDryer) return rawFrontLoadWasherDryer;
  const rawFrenchDoorRefrigerator = buildFrenchDoorRefrigeratorSearchKeywords(rawNormalized);
  if (rawFrenchDoorRefrigerator) return rawFrenchDoorRefrigerator;
  const rawBuiltInDishwasher = buildBuiltInDishwasherSearchKeywords(rawNormalized);
  if (rawBuiltInDishwasher) return rawBuiltInDishwasher;
  const rawOledTelevision = buildOledTelevisionSearchKeywords(rawNormalized);
  if (rawOledTelevision) return rawOledTelevision;
  const rawLaserProjector = buildLaserProjectorSearchKeywords(rawNormalized);
  if (rawLaserProjector) return rawLaserProjector;
  const rawDolbyAtmosSoundbar = buildDolbyAtmosSoundbarSearchKeywords(rawNormalized);
  if (rawDolbyAtmosSoundbar) return rawDolbyAtmosSoundbar;
  const rawFullFrameMirrorlessCamera = buildFullFrameMirrorlessCameraSearchKeywords(rawNormalized);
  if (rawFullFrameMirrorlessCamera) return rawFullFrameMirrorlessCamera;
  const rawGamingLaptop = buildGamingLaptopSearchKeywords(rawNormalized);
  if (rawGamingLaptop) return rawGamingLaptop;
  const rawNas = buildNasSearchKeywords(rawNormalized);
  if (rawNas) return rawNas;
  const rawWifi7MeshRouter = buildWifi7MeshRouterSearchKeywords(rawNormalized);
  if (rawWifi7MeshRouter) return rawWifi7MeshRouter;
  const rawFdm3dPrinter = buildFdm3dPrinterSearchKeywords(rawNormalized);
  if (rawFdm3dPrinter) return rawFdm3dPrinter;
  const rawRobotLawnMower = buildRobotLawnMowerSearchKeywords(rawNormalized);
  if (rawRobotLawnMower) return rawRobotLawnMower;
  const rawFoldingElectricBike = buildFoldingElectricBikeSearchKeywords(rawNormalized);
  if (rawFoldingElectricBike) return rawFoldingElectricBike;
  const rawPortablePowerStation = buildPortablePowerStationSearchKeywords(rawNormalized);
  if (rawPortablePowerStation) return rawPortablePowerStation;
  const rawCompressorDehumidifier = buildCompressorDehumidifierSearchKeywords(rawNormalized);
  if (rawCompressorDehumidifier) return rawCompressorDehumidifier;
  const rawElectricStandingDesk = buildElectricStandingDeskSearchKeywords(rawNormalized);
  if (rawElectricStandingDesk) return rawElectricStandingDesk;
  const rawErgonomicOfficeChair = buildErgonomicOfficeChairSearchKeywords(rawNormalized);
  if (rawErgonomicOfficeChair) return rawErgonomicOfficeChair;
  const rawRetrofitSmartLock = buildRetrofitSmartLockSearchKeywords(rawNormalized);
  if (rawRetrofitSmartLock) return rawRetrofitSmartLock;
  const rawPressureIhRiceCooker = buildPressureIhRiceCookerSearchKeywords(rawNormalized);
  if (rawPressureIhRiceCooker) return rawPressureIhRiceCooker;
  const rawDualDashCam = buildDualDashCamSearchKeywords(rawNormalized);
  if (rawDualDashCam) return rawDualDashCam;
  const rawCameraPetFeeder = buildCameraPetFeederSearchKeywords(rawNormalized);
  if (rawCameraPetFeeder) return rawCameraPetFeeder;
  const rawIplHairRemoval = buildIplHairRemovalSearchKeywords(rawNormalized);
  if (rawIplHairRemoval) return rawIplHairRemoval;
  const rawCameraBattery = buildCameraBatterySearchKeywords(rawNormalized);
  if (rawCameraBattery) return rawCameraBattery;
  const rawToolBattery = buildToolBatterySearchKeywords(rawNormalized);
  if (rawToolBattery) return rawToolBattery;
  const rawLabelTape = buildLabelTapeSearchKeywords(rawNormalized);
  if (rawLabelTape) return rawLabelTape;
  const rawAirFryerLiner = buildAirFryerLinerSearchKeywords(rawNormalized);
  if (rawAirFryerLiner) return rawAirFryerLiner;
  const rawVacuumBag = buildVacuumBagSearchKeywords(rawNormalized);
  if (rawVacuumBag) return rawVacuumBag;
  const rawPowerBank = buildPowerBankSearchKeywords(rawNormalized);
  if (rawPowerBank) return rawPowerBank;
  const normalized = stripSearchBudget(rawNormalized).replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const portHub = buildPortHubSearchKeywords(normalized, marketplace);
  if (portHub) return portHub;
  const dysonVacuumAccessory = buildDysonVacuumAccessorySearchKeywords(normalized);
  if (dysonVacuumAccessory) return dysonVacuumAccessory;
  const airPurifierFilter = buildAirPurifierFilterSearchKeywords(normalized);
  if (airPurifierFilter) return airPurifierFilter;
  const detergentPod = buildDetergentPodSearchKeywords(normalized);
  if (detergentPod) return detergentPod;
  const refrigeratorWaterFilter = buildRefrigeratorWaterFilterSearchKeywords(normalized);
  if (refrigeratorWaterFilter) return refrigeratorWaterFilter;
  const waterFilterCartridge = buildWaterFilterCartridgeSearchKeywords(normalized);
  if (waterFilterCartridge) return waterFilterCartridge;
  const printerInk = buildPrinterInkSearchKeywords(normalized);
  if (printerInk) return printerInk;
  const toothbrushHead = buildToothbrushHeadSearchKeywords(normalized);
  if (toothbrushHead) return toothbrushHead;
  const shaverReplacement = buildShaverReplacementSearchKeywords(normalized);
  if (shaverReplacement) return shaverReplacement;
  const robotVacuumConsumable = buildRobotVacuumConsumableSearchKeywords(normalized);
  if (robotVacuumConsumable) return robotVacuumConsumable;
  const applePencil = buildApplePencilSearchKeywords(normalized);
  if (applePencil) return applePencil;
  const smartWatchBand = buildSmartWatchBandSearchKeywords(normalized);
  if (smartWatchBand) return smartWatchBand;
  const cameraPrimeLens = buildCameraPrimeLensSearchKeywords(normalized);
  if (cameraPrimeLens) return cameraPrimeLens;
  const chargingCable = buildChargingCableSearchKeywords(normalized);
  if (chargingCable) return chargingCable;
  const wallCharger = buildWallChargerSearchKeywords(normalized);
  if (wallCharger) return wallCharger;
  const wirelessChargingStation = buildWirelessChargingStationSearchKeywords(normalized);
  if (wirelessChargingStation) return wirelessChargingStation;
  const hdmiCable = buildHdmiCableSearchKeywords(normalized);
  if (hdmiCable) return hdmiCable;
  const displayPortCable = buildDisplayPortCableSearchKeywords(normalized);
  if (displayPortCable) return displayPortCable;
  const portableSsd = buildPortableSsdSearchKeywords(normalized);
  if (portableSsd) return portableSsd;
  const sdMemoryCard = buildSdMemoryCardSearchKeywords(normalized);
  if (sdMemoryCard) return sdMemoryCard;
  const gamingMonitor = buildGamingMonitorSearchKeywords(normalized);
  if (gamingMonitor) return gamingMonitor;
  const mechanicalKeyboard = buildMechanicalKeyboardSearchKeywords(normalized);
  if (mechanicalKeyboard) return mechanicalKeyboard;
  const noiseCancellingHeadphones = buildNoiseCancellingHeadphonesSearchKeywords(normalized);
  if (noiseCancellingHeadphones) return noiseCancellingHeadphones;
  const robotVacuumBody = buildRobotVacuumBodySearchKeywords(normalized);
  if (robotVacuumBody) return robotVacuumBody;
  const airPurifierBody = buildAirPurifierBodySearchKeywords(normalized);
  if (airPurifierBody) return airPurifierBody;
  const cordlessStickVacuum = buildCordlessStickVacuumSearchKeywords(normalized);
  if (cordlessStickVacuum) return cordlessStickVacuum;
  const airFryerBody = buildAirFryerBodySearchKeywords(normalized);
  if (airFryerBody) return airFryerBody;
  const deviceAccessory = buildDeviceAccessorySearchKeywords(normalized);
  if (deviceAccessory) return deviceAccessory;
  let products = GENERIC_PRODUCTS
    .filter(([, pattern]) => pattern.test(normalized) && !isNegatedAttribute(normalized, pattern))
    .map(([label]) => label)
    .filter((label, index, values) => values.indexOf(label) === index);
  if (products.includes('バックパック')) products = products.filter((label) => label !== 'バッグ');
  if (products.includes('Tシャツ')) products = products.filter((label) => label !== 'トップス');
  if (products.includes('ライフジャケット')) products = products.filter((label) => label !== 'ジャケット');
  if (products.includes('スマホケース')
    && /(?:光る|発光|ピカピカ|ピカッ|LED|ライトアップ|lights?\s*up|light[- ]?up|glowing|luminous|发光|發光|会亮|會亮|빛나는|발광|불빛\s*나는|불이\s*들어오)/iu.test(normalized)) {
    products = products.filter((label) => label !== 'ライト');
  }
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
