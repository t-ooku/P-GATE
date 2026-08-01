import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSearchDecision, semanticSearchGroups } from '../src/search-intelligence.mjs';
import {
  intelligentFtsQuery, relaxedFtsQuery, searchProductsAcrossTenantsWithDecision,
  searchProductsV2
} from '../src/product-index-v2.mjs';
import { applyIndexedSearchPolicy, filterCategoryMismatches, rankMerchantCandidates } from '../src/knowledge-search.mjs';

const emptyDb = () => ({
  prepare() {
    return {
      bind() {
        return { all: async () => ({ results: [] }) };
      }
    };
  }
});

test('multilingual descriptive queries map to stable product-category terms', () => {
  const cases = [
    ['a black charging dock that holds two devices at once', 'dual charger'],
    ['可以同时放两台设备的黑色双充电座', 'dual charger'],
    ['기기 두 대를 동시에 올리는 검은색 듀얼 충전 거치대', 'dual charger'],
    ['a white dome network camera that can pan and tilt', 'network camera'],
    ['可以云台转动的白色球形网络摄像头', 'network camera'],
    ['회전할 수 있는 흰색 돔형 네트워크 카메라', 'network camera'],
    ['the warm metal bars mounted on a bathroom wall', 'warmer'],
    ['浴室墙上会发热的金属杆', 'warmer'],
    ['욕실 벽에 달린 따뜻해지는 금속 막대', 'warmer'],
    ['the nice-smelling powder my mother used', 'perfumed'],
    ['妈妈以前用的有香味的粉', 'perfumed'],
    ['엄마가 쓰던 향기 좋은 파우더', 'perfumed'],
    ['a small silver instrument you play by blowing with your mouth', 'harmonica'],
    ['用嘴吹奏的银色小乐器', 'harmonica'],
    ['입으로 불어서 연주하는 은색 작은 악기', 'harmonica'],
    ['something soft and wintry to put on a sofa', 'pillow'],
    ['放在沙发上的冬季柔软装饰', 'pillow'],
    ['소파에 놓는 겨울 느낌의 푹신한 것', 'pillow'],
    ['a silver horizontal six-light fixture above a bathroom mirror', '6-light'],
    ['浴室镜子上方的银色横向六灯照明', '6-light'],
    ['욕실 거울 위의 은색 가로형 6등 조명', '6-light'],
  ];
  for (const [query, required] of cases) {
    const expression = intelligentFtsQuery(query).toLowerCase();
    assert.ok(expression.includes(`\"${required}\"*`), `${query}: ${expression}`);
  }
  assert.doesNotMatch(
    intelligentFtsQuery('a small silver instrument you play by blowing with your mouth'),
    /\"silver\"\*/,
  );
});

test('日本語の語順と複合語から商品カテゴリを補い不要な色制約を外す', () => {
  const screwdriver = intelligentFtsQuery('黄色と黒の持ち手で長い軸のマイナスドライバー');
  assert.match(screwdriver, /\"screwdriver\"\*/);
  assert.doesNotMatch(screwdriver, /\"(?:black|yellow)\"\*/);

  const warmer = intelligentFtsQuery('浴室でタオルを掛けて温める銀色のラック');
  assert.match(warmer, /\"warmer\"\*/);
  assert.doesNotMatch(warmer, /\"silver\"\*/);

  assert.match(
    intelligentFtsQuery('金色で太め、フィガロ型の長いチェーン'),
    /\"necklace\"\*/,
  );
  const cameraFilter = intelligentFtsQuery(
    'Vivitar 52mm、赤・黄・青・オレンジ・グレー・紫の回転グラデーションカラーフィルター6点セット',
  );
  assert.match(cameraFilter, /\"filter\"\*/);
  assert.doesNotMatch(cameraFilter, /\"(?:blue|aqua|gray)\"\*/);

  const adapter = intelligentFtsQuery('ノートPCにつなぐ端子がたくさんあるやつ');
  assert.match(adapter, /\"adapter\"\*/);
  assert.doesNotMatch(adapter, /\"laptop\"\*/);
});

test('日英中韓の否定カテゴリと否定色をFTS必須条件へ混入させない', () => {
  for (const query of [
    '充電器ではなくiPhone 15用の透明ケース',
    'an iPhone 15 clear case, not a charger',
    '不要充电器，想要iPhone 15透明手机壳',
    '충전기 말고 iPhone 15용 투명 케이스',
  ]) {
    const expression = intelligentFtsQuery(query).toLowerCase();
    assert.match(expression, /\"phone\"\*/);
    assert.match(expression, /\"clear\"\*/);
    assert.match(expression, /\"15\"\*/);
    assert.doesNotMatch(expression, /\"charger\"\*/);
  }

  for (const query of [
    '赤ではなく黒い財布',
    'a black wallet, not red',
    '不要红色，要黑色钱包',
    '빨간색 말고 검은색 지갑',
  ]) {
    const expression = intelligentFtsQuery(query).toLowerCase();
    assert.match(expression, /\"wallet\"\*/);
    assert.match(expression, /\"black\"\*/);
    assert.doesNotMatch(expression, /\"red\"\*/);
  }

  assert.match(intelligentFtsQuery('red wallet'), /\"red\"\*/);
  const material = intelligentFtsQuery('ガラス土台と布シェードのランプ、金属製ではない');
  assert.match(material, /\"table lamp\"\*/);
  assert.match(material, /\"glass\"\*/);
  assert.match(material, /\"fabric shade\"\*/);
});

test('4言語の素材・互換機種・容量寸法を商品カテゴリと同時に保持する', () => {
  for (const query of [
    '黒い20Lのナイロン製自転車バックパック、革ではない',
    'a black 20 L nylon cycling backpack, not leather',
    '黑色20升尼龙骑行背包，不要皮革',
    '검은색 20리터 나일론 자전거 백팩, 가죽 말고',
  ]) {
    const expression = intelligentFtsQuery(query).toLowerCase();
    assert.match(expression, /\"backpack\"\*/);
    assert.match(expression, /\"nylon\"\*/);
    assert.match(expression, /\"20(?:l)?\"\*/);
    assert.doesNotMatch(expression, /\"leather\"\*/);
  }

  for (const query of [
    'iPhone 15用の透明シリコンケース、革ではない',
    'a clear silicone case for iPhone 15, not leather',
    'iPhone 15透明硅胶手机壳，不要皮革',
    '가죽 말고 iPhone 15용 투명 실리콘 케이스',
  ]) {
    const expression = intelligentFtsQuery(query).toLowerCase();
    assert.match(expression, /\"phone\"\*/);
    assert.match(expression, /\"silicone\"\*/);
    assert.match(expression, /\"clear\"\*/);
    assert.match(expression, /\"15\"\*/);
    assert.doesNotMatch(expression, /\"leather\"\*/);
  }

  const filter = intelligentFtsQuery('52mmのガラス製カメラフィルター');
  assert.match(filter, /\"filter\"\*/);
  assert.match(filter, /\"glass\"\*/);
  assert.match(filter, /\"52\"\*/);

  const organizer = intelligentFtsQuery('10×5×6インチの木製収納ボックス');
  assert.match(organizer, /\"storage\"\*/);
  assert.match(organizer, /\"wood\"\*/);
});

test('4言語の予算額を型番や寸法としてFTS必須条件へ混入させない', () => {
  const cases = [
    ['5000円以下の黒い財布', '5000'],
    ["a black wallet under $50", '50'],
    ['预算300元以内的黑色钱包', '300'],
    ['예산 5만원 이하 검은색 지갑', '5'],
  ];
  for (const [query, budget] of cases) {
    const expression = intelligentFtsQuery(query).toLowerCase();
    assert.match(expression, /"wallet"\*/);
    assert.match(expression, /"black"\*/);
    assert.doesNotMatch(expression, new RegExp(`"${budget}"\\*`));
  }
  assert.match(intelligentFtsQuery('20Lのバックパック'), /"20(?:l)?"\*/i);
  assert.match(intelligentFtsQuery('iPhone 15用ケース'), /"15"\*/);
});

test('4言語の年齢・レビュー件数を型番や仕様値としてFTS必須条件へ混入させない', () => {
  const ageCases = [
    ['12歳の子供用防水バックパック', '12'],
    ['a waterproof backpack for a 12-year-old', '12'],
    ['适合12岁儿童的防水背包', '12'],
    ['12세 아이용 방수 백팩', '12'],
  ];
  for (const [query, age] of ageCases) {
    const expression = intelligentFtsQuery(query).toLowerCase();
    assert.match(expression, /"backpack"\*/);
    assert.doesNotMatch(expression, new RegExp(`"${age}"\\*`));
  }

  for (const query of [
    '口コミ1000件以上の黒い財布',
    'a black wallet with over 1000 reviews',
    '有1000条以上评价的黑色钱包',
    '리뷰 1000개 이상인 검은색 지갑',
  ]) {
    const expression = intelligentFtsQuery(query).toLowerCase();
    assert.match(expression, /"wallet"\*/);
    assert.match(expression, /"black"\*/);
    assert.doesNotMatch(expression, /"1000"\*/);
  }
});

test('4言語のセット数量は保持し否定された数量はFTS必須条件から除外する', () => {
  for (const query of [
    '12個入りセットの香り付きキャンドル',
    'a 12-pack of scented candles',
    '12件套香薰蜡烛',
    '12개 세트 향초',
  ]) {
    const expression = intelligentFtsQuery(query).toLowerCase();
    assert.match(expression, /"candle"\*/);
    assert.match(expression, /"12"\*/);
  }

  for (const query of [
    '12個セットではなく6個セットのキャンドル',
    'not a 12-pack, but a 6-pack of candles',
    '不要12件套，要6件套蜡烛',
    '12개 세트 말고 6개 세트 캔들',
  ]) {
    const expression = intelligentFtsQuery(query).toLowerCase();
    assert.match(expression, /"candle"\*/);
    assert.match(expression, /"6"\*/);
    assert.doesNotMatch(expression, /"12"\*/);
  }
});

test('4言語の空白付き容量でも否定容量を除外し希望容量を保持する', () => {
  for (const query of [
    '64 GBではなく128 GBのiPhone 15ケース',
    'not 64 GB but 128 GB iPhone 15 case',
    '不要64 GB，要128 GB的iPhone 15手机壳',
    '64 GB 말고 128 GB iPhone 15 케이스',
  ]) {
    const expression = intelligentFtsQuery(query).toLowerCase();
    assert.match(expression, /"phone"\*/);
    assert.match(expression, /"128"\*/);
    assert.match(expression, /"15"\*/);
    assert.doesNotMatch(expression, /"64"\*/);
  }
});

test('Japanese memory fragments expand into category and color FTS groups', () => {
  const query = intelligentFtsQuery('茶色い革ベルトと金属ケースの男性用腕時計');
  assert.match(query, /"watch"\*/);
  assert.match(query, /"brown"\*/);
  assert.ok(semanticSearchGroups('冷蔵庫で使う透明な収納ケース').some((group) => group.category === 'organizer'));
});

test('複合語は広いカテゴリへ誤分類しない', () => {
  const cases = [
    ['靴下', 'socks', 'shoes'],
    ['ノートパソコン', 'laptop', 'notebook'],
    ['自転車チェーン', 'bicycle-chain', 'necklace'],
    ['ペットのマウス用ケージ', 'rodent-supplies', 'mouse'],
    ['傘立て', 'umbrella-stand', 'umbrella'],
    ['リップクリーム', 'lip-care', 'lip-color'],
    ['カメラバッグ', 'camera-bag', 'camera'],
    ['扇風機カバー', 'fan-accessory', 'fan'],
    ['韓国のTシャツ', 't-shirt', 'tops']
  ];
  for (const [query, expected, rejected] of cases) {
    const categories = semanticSearchGroups(query).map((group) => group.category);
    assert.ok(categories.includes(expected), query);
    assert.equal(categories.includes(rejected), false, query);
  }
  assert.match(intelligentFtsQuery('靴下'), /"sock"\*/);
  assert.doesNotMatch(intelligentFtsQuery('靴下'), /"shoe"\*|"sneaker"\*/);
});

test('英単語の部分一致で帽子やトップスを混入しない', () => {
  assert.equal(semanticSearchGroups('small wired earbuds that fit inside the ear').some((group) => group.category === 'hat'), false);
  assert.equal(semanticSearchGroups('a compact USB-C hub for a laptop').some((group) => group.category === 'tops'), false);
});

test('自然文の文脈語を必須ANDにせず、ノートPC用アダプターをPC本体にしない', () => {
  const earbuds = intelligentFtsQuery('small wired earbuds that fit inside the ear');
  assert.match(earbuds, /"earbud"\*.*"ear"\*.*"bud"\*.*"headphone"\*/);
  const adapter = intelligentFtsQuery('a compact USB-C hub with multiple ports for a laptop');
  assert.match(adapter, /"usb-c hub"\*.*"usb type-c"\*.*"docking station"\*.*"multiport adapter"\*.*"multi adapter"\*/);
  assert.doesNotMatch(adapter, /"laptop"\*|"compact"\*|"ports"\*/);
});

test('USB-Cハブを4言語でノートPC本体や単機能アダプターから分離する', () => {
  const queries = [
    'ノートPCの端子を増やすUSB-Cハブ HDMI付き',
    'USB-C hub with HDMI and multiple ports for a laptop',
    '带HDMI接口的笔记本电脑USB-C扩展坞',
    'HDMI 포트가 있는 노트북용 USB-C 허브',
  ];
  const candidates = [
    { asin: 'HUB', product_name: 'USB-C Hub 7-in-1 HDMI Multiport Adapter' },
    { asin: 'MULTI', product_name: 'USB Type-C Multi-Adapter JCA374' },
    { asin: 'LAPTOP', product_name: 'USB-C対応 ノートパソコン 13インチ' },
    { asin: 'CHARGER', product_name: 'USB-C Laptop Charger Power Adapter' },
    { asin: 'HDMI', product_name: 'USB-C to HDMI 単機能変換アダプター' },
    { asin: 'GENERIC', product_name: 'Laptop accessories set' },
  ];
  for (const query of queries) {
    const categories = semanticSearchGroups(query).map((group) => group.category);
    assert.ok(categories.includes('laptop-hub'), query);
    assert.equal(categories.includes('laptop'), false, query);
    assert.deepEqual(
      filterCategoryMismatches(query, candidates).map((item) => item.asin),
      ['HUB', 'MULTI'],
      query
    );
  }
  assert.equal(
    semanticSearchGroups('ノートPCのポートを複数増やすもの').some((group) => group.category === 'laptop-hub'),
    false
  );
});

test('Thunderbolt 4ドックは4言語で世代違い・USB-Cハブ・PC本体を除外する', () => {
  const queries = [
    'PD 100W対応 Thunderbolt 4 ドック HDMI 2.1 有線LAN',
    'Thunderbolt 4 dock with 100W PD HDMI 2.1 and Ethernet',
    '支持100W PD和HDMI 2.1的雷电4扩展坞',
    '100W PD HDMI 2.1 이더넷 지원 썬더볼트 4 도킹 스테이션',
  ];
  const candidates = [
    { asin: 'TB4', product_name: 'Thunderbolt 4 Dock 100W HDMI 2.1 Ethernet' },
    { asin: 'TB3', product_name: 'Thunderbolt 3 Dock 85W HDMI Ethernet' },
    { asin: 'USBC', product_name: 'USB-C Hub 7-in-1 HDMI Ethernet' },
    { asin: 'PC', product_name: 'Thunderbolt 4 Laptop Computer' },
    { asin: 'GENERIC', product_name: 'Laptop Docking Station' },
  ];
  for (const query of queries) {
    const categories = semanticSearchGroups(query).map((group) => group.category);
    assert.ok(categories.includes('thunderbolt-dock'), query);
    assert.equal(categories.includes('laptop'), false, query);
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), ['TB4'], query);
  }
});

test('USB-Aハブは4言語でUSB-C専用品とノートPC本体を除外する', () => {
  const queries = [
    'ノートPC用の4ポートUSB-Aハブ',
    'USB-A hub with four ports for a laptop',
    '笔记本电脑用四口USB-A集线器',
    '노트북용 4포트 USB-A 허브',
  ];
  const candidates = [
    { asin: 'USBA', product_name: 'USB-A Hub 4 Port for Laptop' },
    { asin: 'USBC', product_name: 'USB-C Hub 4 Port for Laptop' },
    { asin: 'PC', product_name: 'USB-A Laptop Computer' },
    { asin: 'GENERIC', product_name: '4 Port Hub' },
  ];
  for (const query of queries) {
    const categories = semanticSearchGroups(query).map((group) => group.category);
    assert.ok(categories.includes('usb-a-hub'), query);
    assert.equal(categories.includes('laptop'), false, query);
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), ['USBA'], query);
  }
});

test('USB4ドックは4言語で映像端子・2画面・OS互換性が一致する候補だけを表示する', () => {
  const cases = [
    ['MacBook用 USB4 ドック DisplayPort 1.4 デュアルモニター対応 100W', 'mac'],
    ['USB4 dock with DisplayPort 1.4 dual monitors and 100W PD for Windows laptop', 'windows'],
    ['支持双显示器和DisplayPort 1.4的Windows笔记本USB4扩展坞', 'windows'],
    ['맥북용 USB4 도킹 스테이션 DisplayPort 1.4 듀얼 모니터 100W', 'mac'],
  ];
  for (const [query, platform] of cases) {
    const candidates = [
      { asin: 'MATCH', product_name: `USB4 Dock DisplayPort 1.4 Dual Monitor 100W ${platform === 'mac' ? 'MacBook' : 'Windows'}` },
      { asin: 'WRONGDP', product_name: `USB4 Dock DisplayPort 1.2 Dual Monitor ${platform === 'mac' ? 'MacBook' : 'Windows'}` },
      { asin: 'SINGLE', product_name: `USB4 Dock DisplayPort 1.4 Single Monitor ${platform === 'mac' ? 'MacBook' : 'Windows'}` },
      { asin: 'WRONGOS', product_name: `USB4 Dock DisplayPort 1.4 Dual Monitor ${platform === 'mac' ? 'Windows' : 'MacBook'}` },
      { asin: 'THUNDERBOLT', product_name: 'Thunderbolt 4 Dock DisplayPort 1.4 Dual Monitor' },
      { asin: 'PC', product_name: 'USB4 Laptop Computer DisplayPort 1.4' },
    ];
    const categories = semanticSearchGroups(query).map((group) => group.category);
    assert.ok(categories.includes('usb4-dock'), query);
    assert.equal(categories.includes('laptop'), false, query);
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), ['MATCH'], query);
  }
});

test('USB4ドックは4言語で解像度・Hz・DisplayLink要件を満たす候補だけを表示する', () => {
  const queries = [
    'MacBook用 DisplayLink対応 USB4 ドック 4K 60Hz 2画面 100W',
    'USB4 dock with DisplayLink dual 4K 60Hz monitors and 100W PD for MacBook',
    '支持DisplayLink双4K 60Hz显示器和100W供电的MacBook USB4扩展坞',
    '맥북용 DisplayLink USB4 도킹 스테이션 듀얼 4K 60Hz 100W',
  ];
  const candidates = [
    { asin: 'MATCH', product_name: 'MacBook USB4 Dock DisplayLink Dual Monitor 4K 60Hz 100W' },
    { asin: 'BETTER', product_name: 'MacBook USB4 Dock DisplayLink Dual Monitor 8K 120Hz 140W' },
    { asin: 'LOWRES', product_name: 'MacBook USB4 Dock DisplayLink Dual Monitor 1080p 60Hz 100W' },
    { asin: 'LOWHZ', product_name: 'MacBook USB4 Dock DisplayLink Dual Monitor 4K 30Hz 100W' },
    { asin: 'NODISPLAYLINK', product_name: 'MacBook USB4 Dock Dual Monitor 4K 60Hz 100W' },
    { asin: 'SINGLE', product_name: 'MacBook USB4 Dock DisplayLink Single Monitor 4K 60Hz 100W' },
    { asin: 'LOWPOWER', product_name: 'MacBook USB4 Dock DisplayLink Dual Monitor 4K 60Hz 60W' },
  ];
  for (const query of queries) {
    assert.deepEqual(
      filterCategoryMismatches(query, candidates).map((item) => item.asin),
      ['MATCH', 'BETTER'],
      query
    );
  }
});

test('MacBook用USB4ドックは4言語でApple Silicon世代とHDR対応を照合する', () => {
  const queries = [
    'MacBook M2用 DisplayLink HDR対応 USB4 ドック 4K 60Hz 2画面',
    'USB4 DisplayLink dock with dual 4K 60Hz HDR monitors for MacBook M2',
    '支持MacBook M2双4K 60Hz HDR显示器的DisplayLink USB4扩展坞',
    '맥북 M2용 DisplayLink USB4 도킹 스테이션 듀얼 4K 60Hz HDR',
  ];
  const candidates = [
    { asin: 'MATCH', product_name: 'MacBook M2 USB4 Dock DisplayLink Dual Monitor 4K 60Hz HDR' },
    { asin: 'M1', product_name: 'MacBook M1 USB4 Dock DisplayLink Dual Monitor 4K 60Hz HDR' },
    { asin: 'NOCHIP', product_name: 'MacBook USB4 Dock DisplayLink Dual Monitor 4K 60Hz HDR' },
    { asin: 'NOHDR', product_name: 'MacBook M2 USB4 Dock DisplayLink Dual Monitor 4K 60Hz' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), ['MATCH'], query);
  }
});

test('Windows用USB4ドックは4言語でMST明示候補だけを表示する', () => {
  const queries = [
    'Windows用 MST対応 USB4 ドック 4K 60Hz 2画面',
    'USB4 dock with MST dual 4K 60Hz monitors for Windows',
    '支持Windows双4K 60Hz显示器的MST USB4扩展坞',
    '윈도우용 MST USB4 도킹 스테이션 듀얼 4K 60Hz',
  ];
  const candidates = [
    { asin: 'MATCH', product_name: 'Windows USB4 Dock MST Dual Monitor 4K 60Hz' },
    { asin: 'NOMST', product_name: 'Windows USB4 Dock Dual Monitor 4K 60Hz' },
    { asin: 'DISPLAYLINK', product_name: 'Windows USB4 Dock DisplayLink Dual Monitor 4K 60Hz' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), ['MATCH'], query);
  }
});

test('中国語・韓国語のキャンドル・財布・収納用品を共通商品語へ展開する', () => {
  for (const query of ['玻璃罐装的大豆蜡烛', '유리병에 담긴 소이 캔들']) {
    assert.equal(semanticSearchGroups(query).some((group) => group.category === 'candle'), true);
  }
  for (const query of ['超薄黑色钱包', '아주 얇은 검정 지갑']) {
    assert.equal(semanticSearchGroups(query).some((group) => group.category === 'wallet'), true);
  }
  for (const query of ['冰箱用透明收纳盒', '냉장고용 투명 수납함']) {
    const groups = semanticSearchGroups(query);
    assert.equal(groups.some((group) => group.category === 'organizer'), true);
    assert.equal(groups.some((group) => group.category === 'home-use'), false);
  }
});

test('ear bud表記揺れと冷蔵庫用透明収納の条件をFTSへ保持する', () => {
  const earbuds = intelligentFtsQuery('small wired earbuds that fit inside the ear');
  assert.match(earbuds, /"ear"\*.*"bud"\*/);
  for (const query of [
    'a clear narrow organizer bin for the refrigerator',
    '冰箱里用的透明细长收纳盒',
    '냉장고에 쓰는 투명하고 긴 수납함',
  ]) {
    const fts = intelligentFtsQuery(query);
    assert.match(fts, /"organizer"\*/);
    assert.match(fts, /"refrigerator"\*/);
    assert.match(fts, /"clear"\*/);
  }
});

test('美容・家電・装身具・互換品・刃物の英中韓表現を商品カテゴリへ統一する', () => {
  const cases = [
    ['电脑用的超轻黑色无线游戏鼠标', 'mouse'],
    ['컴퓨터용 초경량 검정 무선 게이밍 마우스', 'mouse'],
    ['24英寸宽4毫米的14K包金费加罗链项链', 'necklace'],
    ['24인치 폭 4mm 14K 골드필드 피가로 체인 목걸이', 'necklace'],
    ['相机镜头用的52毫米六片彩色圆形滤镜', 'camera-filter'],
    ['카메라 렌즈용 52mm 원형 컬러 필터 6개 세트', 'camera-filter'],
    ['露营用的折叠锁背刀', 'knife'],
    ['캠핑용 접이식 락백 나이프', 'knife'],
  ];
  for (const [query, category] of cases) {
    assert.equal(semanticSearchGroups(query).some((group) => group.category === category), true, query);
  }
});

test('filledをLEDと誤認せず、複合シャンプーとカメラフィルターを過剰ANDしない', () => {
  const necklaceGroups = semanticSearchGroups('14K gold filled Figaro chain necklace');
  assert.equal(necklaceGroups.some((group) => group.category === 'light-up'), false);
  const shampooGroups = semanticSearchGroups('3-in-1 shampoo conditioner and body wash, two large bottles');
  assert.equal(shampooGroups.some((group) => group.category === 'shampoo'), true);
  assert.equal(shampooGroups.some((group) => ['bottle','hair-treatment'].includes(group.category)), false);
  const filterGroups = semanticSearchGroups('six colored round filters for a camera lens');
  assert.equal(filterGroups.some((group) => group.category === 'camera-filter'), true);
  assert.equal(filterGroups.some((group) => group.category === 'camera'), false);
});

test('寸法は証拠値だけをANDにし、三合一シャンプーを構成用途へ展開する', () => {
  const filterQuery = intelligentFtsQuery('six 52 mm colored round filters for a camera lens');
  assert.match(filterQuery, /\("filter"\* OR "color"\*\) AND \("52"\*\)/);
  assert.doesNotMatch(filterQuery, /colored|pencil/);
  const shampooQuery = intelligentFtsQuery('男士三合一洗发水护发素沐浴露大瓶两件装');
  assert.match(shampooQuery, /"3-in-1"\*/);
  assert.match(shampooQuery, /"conditioner"\*/);
  assert.match(shampooQuery, /"body wash"\*/);
});

test('固有ブランド・型番をカテゴリと組み合わせてrich検索を絞る', () => {
  const cases = [
    ['Logitech G105 Call of Duty MW3 Editionのゲーミングキーボード', 'keyboard', ['g105', 'mw3']],
    ['Hohner PentaHarp Cマイナーのハーモニカ', 'harmonica', ['hohner', 'pentaharp']],
    ['Master Cables製 Sony VMCUAM2交換用USBアダプターケーブル', 'cable', ['vmcuam2']],
    ['Pillow Perfectの冬柄グレー装飾腰枕', 'pillow', ['pillow']],
  ];
  for (const [query, categoryToken, identifiers] of cases) {
    const expression = intelligentFtsQuery(query).toLowerCase();
    assert.match(expression, new RegExp(categoryToken));
    assert.ok(identifiers.some((token) => expression.includes(`\"${token}\"*`)), expression);
  }
  assert.doesNotMatch(
    intelligentFtsQuery('ゲーム用の黒いLogitechキーボード'),
    /"logitech"\*/i,
  );
  assert.match(
    intelligentFtsQuery('Diamond Select Toysのインディ・ジョーンズ胸像'),
    /"インディ"\* OR "ジョーンズ"\* OR "indiana"\* OR "jones"\*/i,
  );
  assert.match(
    intelligentFtsQuery('Hohner PentaHarp Cマイナーのハーモニカ'),
    /"c minor"\*/i,
  );
});

test('具体機能を4言語の商品語へ変換し商品名にない色を必須化しない', () => {
  const cases = [
    ['黒い蒸気機関車を組み立てる限定レゴ', 'steam engine'],
    ['black LEGO steam locomotive model', 'steam engine'],
    ['黑色乐高蒸汽机车模型', 'steam engine'],
    ['검은색 레고 증기 기관차 모델', 'steam engine'],
    ['機器を2台置ける黒い充電台', 'dual charger'],
    ['white PTZ network camera with a dome', 'network camera'],
    ['白色云台网络摄像头', 'network camera'],
    ['흰색 회전 네트워크 카메라', 'network camera'],
    ['銀色の横長バーにライトが6個付いた浴室用照明', '6-light'],
  ];
  for (const [query, required] of cases) {
    const expression = intelligentFtsQuery(query).toLowerCase();
    assert.ok(expression.includes(`\"${required}\"*`), expression);
    assert.doesNotMatch(expression, /\"(?:black|white|silver)\"\*/);
  }
  for (const query of [
    '男性用で髪と体を一本で洗える大きなボトル2本',
    'shampoo that washes hair and body in one bottle',
    '洗发护发沐浴三合一',
    '머리와 몸을 하나로 씻는 샴푸',
  ]) {
    const expression = intelligentFtsQuery(query).toLowerCase();
    assert.match(expression, /\"3-in-1\"\*/);
  }
});

test('説明順や比喩表現から安全に推定できる商品種別を4言語で補う', () => {
  const cases = [
    ['いい匂いの容器に入った火をつけるやつ', 'candle'],
    ['香味容器里可以点火的东西', 'candle'],
    ['향기가 나고 불을 붙이는 용기', 'candle'],
    ['小さくて耳に入れる有線ヘッドホン', 'headphone'],
    ['お風呂場の壁にある温かくなる棒', 'warmer'],
    ['母が使っていたいい匂いの粉', 'perfumed'],
    ['Diamond Select Toysのインディ・ジョーンズ、1:6スケール胸像', '1:6'],
  ];
  for (const [query, required] of cases) {
    assert.ok(intelligentFtsQuery(query).toLowerCase().includes(`\"${required}\"*`), query);
  }
  const lamp = intelligentFtsQuery('水色のガラス土台と布の傘がある卓上ライト');
  assert.match(lamp, /\"lamp\"\*/);
  assert.doesNotMatch(lamp, /\"umbrella\"\*/);
  for (const query of [
    '口で音を出す銀色の小さい楽器',
    '用嘴吹奏的银色小乐器',
    '입으로 소리 내는 은색 작은 악기',
  ]) {
    const expression = intelligentFtsQuery(query);
    assert.match(expression, /\"harmonica\"\*/);
    assert.doesNotMatch(expression, /\"silver\"\*/);
    const decision = analyzeSearchDecision(query, [
      { asin: 'B000000001', product_name: 'Generic Harmonica in C', manufacturer: 'Example' },
    ]);
    assert.equal(decision.needs_clarification, true);
  }
});

test('卓上ランプの素材構成と季節柄クッションを4言語の商品属性へ変換する', () => {
  const lampQueries = [
    '水色のガラス土台と布の傘がある卓上ライト',
    'table lamp with aqua glass base and fabric shade',
    '水蓝色玻璃底座和布艺灯罩的台灯',
    '아쿠아 유리 받침과 패브릭 갓이 있는 탁상 조명',
  ];
  for (const query of lampQueries) {
    const expression = intelligentFtsQuery(query).toLowerCase();
    assert.match(expression, /\"table lamp\"\*/);
    assert.match(expression, /\"glass\"\*/);
    assert.match(expression, /\"fabric shade\"\*/);
  }
  const pillowQueries = [
    'ソファに置く冬っぽいふわふわ',
    'winter decorative pillow for a sofa',
    '沙发上用的冬季抱枕',
    '소파에 놓는 겨울 쿠션',
  ];
  for (const query of pillowQueries) {
    const expression = intelligentFtsQuery(query).toLowerCase();
    assert.match(expression, /\"christmas\"\*/);
    assert.match(expression, /\"decorative pillow\"\*/);
  }
  assert.equal(analyzeSearchDecision(
    'ソファに置く冬っぽいふわふわ',
    [{ asin: 'B000000001', product_name: 'Christmas Decorative Pillow', manufacturer: 'Example' }],
  ).needs_clarification, true);
});

test('韓国美容語を商品カテゴリへ正規化する', () => {
  const cases = [
    ['진정 세럼', 'serum'],
    ['수분크림', 'moisturizer'],
    ['선크림', 'sunscreen'],
    ['마스크팩', 'face-mask'],
    ['클렌징 오일', 'cleanser'],
    ['쿠션 파운데이션', 'cushion-foundation'],
    ['아이섀도 팔레트', 'eye-shadow'],
    ['립 틴트', 'lip-color'],
    ['헤어 오일', 'hair-treatment']
  ];
  for (const [query, expected] of cases) {
    assert.ok(semanticSearchGroups(query).some((group) => group.category === expected), query);
  }
});

test('カテゴリに合う追加キーワードを10件提示する', async () => {
  const cases = [
    ['靴下', /くるぶし丈/, /着圧タイプ/],
    ['ノートパソコン', /13インチ/, /動画編集用/],
    ['韓国の美容液', /ビタミンC/, /レチノール/],
    ['쿠션 파운데이션', /ツヤ肌/, /リフィル付き/],
    ['韓国のTシャツ', /オーバーサイズ/, /韓国ストリート/]
  ];
  for (const [query, first, another] of cases) {
    const result = await applyIndexedSearchPolicy({ candidates: [] }, { PRODUCT_DB: emptyDb() }, query, 'JA');
    const labels = result.clarification.options.map((option) => option.label);
    assert.equal(labels.length, 10, query);
    assert.match(labels.join(' '), first, query);
    assert.match(labels.join(' '), another, query);
  }
});

test('明示カテゴリと矛盾する外部候補だけを表示前に除外する', () => {
  const candidates = filterCategoryMismatches('靴下', [
    { asin: 'B000SOCK01', product_name: 'Warm Crew Socks' },
    { asin: 'B000SHOE01', product_name: 'Running Shoes' },
    { asin: 'B000OTHER1', product_name: 'Unknown Korean Fashion Item' }
  ]);
  assert.deepEqual(candidates.map((item) => item.asin), ['B000SOCK01', 'B000OTHER1']);
});

test('portable parasol search excludes patio umbrellas and umbrella accessories', () => {
  const candidates = filterCategoryMismatches('折りたたみ日傘 / 軽量 / 晴雨兼用', [
    { asin: 'PORTABLE1', product_name: '超軽量 折りたたみ日傘 晴雨兼用' },
    { asin: 'PATIO0001', product_name: 'California 9 Foot Market Patio Umbrella Sunbrella Navy' },
    { asin: 'BEACH0001', product_name: 'All-In-One Beach Umbrella System with Base' },
    { asin: 'HOLDER001', product_name: 'Wet Umbrella Bag Holder Satin Aluminum' },
    { asin: 'GOLF00001', product_name: 'ProActive Drizzle Stik Flex Umbrellas Red/White' },
    { asin: 'KNIFE0001', product_name: 'Filework Folding Hunter' }
  ]);
  assert.deepEqual(candidates.map((item) => item.asin), ['PORTABLE1']);
});

test('完全ワイヤレス検索では有線イヤホンと無線根拠のない候補を除外する', () => {
  const candidates = filterCategoryMismatches('韓国っぽい透明のワイヤレスイヤホン / 完全ワイヤレス', [
    { asin: 'TWS000001', product_name: '透明ケース Bluetooth 5.3 完全ワイヤレスイヤホン' },
    { asin: 'WIRELESS2', product_name: 'Clear TWS True Wireless Earbuds' },
    { asin: 'WIRED0001', product_name: '透明 有線イヤホン 3.5mm コード付き' },
    { asin: 'WIRED0002', product_name: 'Clear Wired Earphones with Audio Cable' },
    { asin: 'UNKNOWN01', product_name: 'Clear In-Ear Earphones' }
  ]);
  assert.deepEqual(candidates.map((item) => item.asin), ['TWS000001', 'WIRELESS2']);
});

test('日英中韓のワイヤレスイヤホン検索でも有線候補を除外する', () => {
  const candidates = [
    { asin: 'WIRELESS01', product_name: '透明 Bluetooth ワイヤレスイヤホン' },
    { asin: 'WIRED00002', product_name: '透明 有線イヤホン 3.5mm コード付き' },
    { asin: 'UNKNOWN003', product_name: '透明 イヤホン' },
  ];
  for (const query of [
    '透明なワイヤレスイヤホン',
    'transparent bluetooth earbuds',
    '透明蓝牙耳机',
    '투명 무선 이어폰',
  ]) {
    assert.deepEqual(
      filterCategoryMismatches(query, candidates).map((item) => item.asin),
      ['WIRELESS01'],
      query
    );
  }
});

test('low-information and divergent queries request one clarification instead of asserting', () => {
  const low = analyzeSearchDecision('SNSで見た青いやつ', [{ product_name: 'Blue Lamp' }]);
  assert.equal(low.needs_clarification, true);
  assert.equal(low.offer_mywish, true);
  assert.ok(low.clarification_question);
  const divergent = analyzeSearchDecision('黒い機械', [
    { product_name: 'Black Gaming Mouse' },
    { product_name: 'Black Table Lamp' }
  ]);
  assert.equal(divergent.needs_clarification, true);
  assert.equal(divergent.reason, 'CATEGORY_DIVERGENCE');
});

test('specific brand/model category query can return results without clarification', () => {
  const decision = analyzeSearchDecision('Logitech G PRO X Superlight ワイヤレスゲーミングマウス', [
    { product_name: 'Logitech G PRO X Superlight Wireless Gaming Mouse - Black' }
  ]);
  assert.equal(decision.needs_clarification, false);
});

test('商品名の型番や固有語が候補と一致しない場合は断定しない', () => {
  const wrongModel = analyzeSearchDecision('LEGO 40370 188ピース 蒸気機関車', [
    { product_name: 'LEGO Creator Volkswagen Beetle 10252 Building Kit' }
  ]);
  assert.equal(wrongModel.needs_clarification, true);
  assert.equal(wrongModel.reason, 'EVIDENCE_MISMATCH');
  const wrongKey = analyzeSearchDecision('Hohner PentaHarp Cマイナー ハーモニカ', [
    { product_name: 'HOHNER Pentaharp Harmonica Key of G Minor' }
  ]);
  assert.equal(wrongKey.needs_clarification, true);
  assert.equal(wrongKey.reason, 'EVIDENCE_MISMATCH');
  const wrongCapacity = analyzeSearchDecision('自転車用の黒い20Lリュック', [
    { product_name: 'Black 45 Litre Backpack' }
  ]);
  assert.equal(wrongCapacity.reason, 'EVIDENCE_MISMATCH');
});

test('SNS文脈や「やつ」で終わる識別子なしの説明は一度聞き返す', () => {
  assert.equal(analyzeSearchDecision('配信で見た光る入力する板', [
    { product_name: 'RGB Gaming Keyboard' }
  ]).needs_clarification, true);
  assert.equal(analyzeSearchDecision('洗面所の鏡の上にある銀色で光るやつ', [
    { product_name: 'Silver Bathroom Vanity Light' }
  ]).needs_clarification, true);
});

test('public knowledge policy can show a backend product when D1 has no match', async () => {
  const env = {
    PRODUCT_DB: {
      prepare() {
        return { bind() { return { all: async () => ({ results: [] }) }; } };
      }
    }
  };
  const result = await applyIndexedSearchPolicy({
    query_id: 'q1',
    candidates: [{ asin: 'B000000099', product_name: 'Amazon catalog fallback' }]
  }, env, 'SNSで見た青いやつ', 'JA');
  assert.equal(result.candidates[0].asin, 'B000000099');
  assert.equal(result.clarification.required, true);
  assert.equal(result.clarification.options.length, 10);
  assert.match(result.clarification.options[0].label, /家で使う/);
  assert.equal(result.mywish.suggested, true);
});

test('カテゴリ不一致を除外した後も商品カードを10件まで補充する', async () => {
  const rows = [
    { asin: 'SHOE000001', record_key: 'shoe-1', product_name: 'Running Shoes', display_name: 'Running Shoes', stock: 1, text_rank: 0 },
    ...Array.from({ length: 10 }, (_, index) => ({
      asin: `CAMERA${String(index + 1).padStart(4, '0')}`,
      record_key: `camera-${index + 1}`,
      product_name: `Action Camera ${index + 1}`,
      display_name: `Action Camera ${index + 1}`,
      stock: 1,
      text_rank: index + 1
    }))
  ];
  const env = {
    PRODUCT_DB: {
      prepare(sql) {
        return {
          bind(...values) {
            return {
              all: async () => ({
                results: sql.includes('FROM product_search')
                  ? rows.slice(0, Number(values[2] || 10))
                  : []
              })
            };
          }
        };
      }
    }
  };
  const result = await applyIndexedSearchPolicy(
    { query_id: 'camera-backfill', candidates: [] },
    env,
    '推し活で使える小さな写真プリンター / 写真を撮る / 手のひらサイズ / アクションカメラ',
    'JA'
  );
  assert.equal(result.candidates.length, 10);
  assert.equal(result.candidates.some((candidate) => candidate.asin === 'SHOE000001'), false);
});

test('camera memory produces ten camera-related use suggestions', async () => {
  const env = { PRODUCT_DB: { prepare() { return { bind() { return { all: async () => ({ results: [] }) }; } }; } } };
  const result = await applyIndexedSearchPolicy(
    { query_id: 'camera-q', candidates: [] },
    env,
    'SNSで見たピンクの小さいカメラみたいなもの',
    'JA'
  );
  assert.equal(result.clarification.options.length, 10);
  assert.deepEqual(result.clarification.options.slice(0, 4).map((item) => item.label), [
    '写真を撮る', '動画を撮る', '旅行で使う', 'Vlog・SNS投稿に使う'
  ]);
  const continued = await applyIndexedSearchPolicy(
    { query_id: 'camera-q2', candidates: [] },
    env,
    'SNSで見たピンクの小さいカメラみたいなもの / 推し活で使う',
    'JA'
  );
  assert.equal(continued.clarification.required, true);
  assert.equal(continued.clarification.options.length, 10);
  assert.match(continued.clarification.question, /カメラの種類・特徴/);
  assert.deepEqual(continued.clarification.options.slice(0, 3).map((item) => item.label), [
    'トイカメラ', 'キッズカメラ', 'ミニデジタルカメラ'
  ]);
});

test('写真プリンターをカメラ用途へ誤分類しない', async () => {
  const env = { PRODUCT_DB: { prepare() { return { bind() { return { all: async () => ({ results: [] }) }; } }; } } };
  const groups = semanticSearchGroups('推し活で使える小さな写真プリンター');
  assert.ok(groups.some((group) => group.category === 'photo-printer'));
  assert.equal(groups.some((group) => group.category === 'camera'), false);
  const result = await applyIndexedSearchPolicy(
    { query_id: 'photo-printer-q', candidates: [] },
    env,
    '推し活で使える小さな写真プリンター',
    'JA'
  );
  assert.equal(result.clarification.options.some((item) => item.label === '写真を撮る'), false);
  assert.ok(result.clarification.options.some((item) => item.label === 'スマホ写真を印刷する'));
});

test('second search can relax strict terms into a broad product query', () => {
  const query = relaxedFtsQuery('ピンクの小さいカメラ / 推し活で使う');
  assert.match(query, /"camera"\*/);
  assert.doesNotMatch(query, /"pink"\*/i);
});

test('条件付き検索は厳密候補が不足した場合だけ緩和候補で補充する', async () => {
  let productSearches = 0;
  const strictRows = [{ asin: 'CAMERA0001', record_key: 'camera-1', product_name: 'Pink Action Camera' }];
  const relaxedRows = [
    strictRows[0],
    { asin: 'CAMERA0002', record_key: 'camera-2', product_name: 'Mini Action Camera' },
    { asin: 'CAMERA0003', record_key: 'camera-3', product_name: 'Pocket Camera' }
  ];
  const env = {
    PRODUCT_DB: {
      prepare(sql) {
        return {
          bind() {
            return {
              all: async () => {
                if (!sql.includes('FROM product_search')) return { results: [] };
                productSearches += 1;
                return { results: productSearches === 1 ? strictRows : relaxedRows };
              }
            };
          }
        };
      }
    }
  };
  const rows = await searchProductsV2(
    env,
    'itg',
    '推し活で使える小さな写真プリンター / 写真を撮る / 手のひらサイズ / アクションカメラ',
    10
  );
  assert.equal(productSearches, 2);
  assert.deepEqual(rows.map((row) => row.asin), ['CAMERA0001', 'CAMERA0002', 'CAMERA0003']);
});

test('光るスマホケースをAmazon商品語へ変換する', () => {
  const groups = semanticSearchGroups('TikTokで見た光るスマホケース / 持ち歩いて使う');
  const byCategory = new Map(groups.map((group) => [group.category, group.terms]));
  assert.deepEqual(byCategory.get('phone-case'), ['phone','case','cover','iphone','smartphone']);
  assert.deepEqual(byCategory.get('light-up'), ['led','light','glow','luminous']);
});

test('iPhoneケース検索から充電ケーブル候補を除外する', () => {
  const query = 'TikTokで見た光るiPhoneケース';
  const groups = semanticSearchGroups(query);
  assert.ok(groups.some((group) => group.category === 'phone-case'));
  const candidates = [
    { asin: 'CABLE0001', product_name: 'iPhone充電ケーブル ライトニングケーブル 充電コード' },
    { asin: 'CASE00001', product_name: 'iPhone ケース LEDで光る スマホカバー' }
  ];
  assert.deepEqual(
    filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
    ['CASE00001']
  );
});

test('光るスマホケースは初回提示から一般ケース・LED照明・カテゴリ不明商品を除外する', () => {
  const queries = [
    'TikTokで見た光るスマホケース',
    'light-up phone case seen on TikTok',
    '在TikTok看到的发光手机壳',
    'TikTok에서 본 빛나는 스마트폰 케이스',
    'TikTokで見たピカピカする携帯カバー',
    'viral glowing mobile cover from TikTok',
    '抖音看到的会发光的手机保护壳',
    '틱톡에서 본 불빛 나는 휴대폰 커버',
  ];
  const candidates = [
    { asin: 'VALIDJA001', product_name: 'LEDで光るスマホケース 通知発光カバー' },
    { asin: 'VALIDEN001', product_name: 'Light-up LED Smartphone Phone Case Cover' },
    { asin: 'VALIDEN002', product_name: 'Luminous Mobile Cover with LED Glow' },
    { asin: 'VALIDKO001', product_name: '불빛 나는 휴대폰 커버 LED 발광' },
    { asin: 'PLAIN00001', product_name: '透明 スマホケース シリコンカバー' },
    { asin: 'LIGHT00001', product_name: 'LED リングライト スマホ撮影用' },
    { asin: 'CABLE00001', product_name: 'iPhone LED ライトニング充電ケーブル' },
    { asin: 'CHARM00001', product_name: 'Glowing Mobile Phone Charm Accessory' },
    { asin: 'OTHER00001', product_name: 'TikTok Viral Luminous Accessory Gift' },
  ];
  for (const query of queries) {
    assert.deepEqual(
      filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['VALIDJA001', 'VALIDEN001', 'VALIDEN002', 'VALIDKO001'],
      query
    );
  }
});

test('SNSで見た光るケースは初回から機種・発光・MagSafeが一致する候補だけを提示する', () => {
  const queries = [
    'TikTokで見た光るiPhone 15 ProケースでMagSafe対応',
    'a glowing MagSafe iPhone 15 Pro case seen on TikTok',
    'TikTok看到的发光磁吸iPhone 15 Pro手机壳',
    '틱톡에서 본 빛나는 맥세이프 iPhone 15 Pro 케이스',
  ];
  const candidates = [
    { asin: 'MATCH', product_name: 'iPhone 15 Pro MagSafe Light-up LED Phone Case' },
    { asin: 'WRONGMODEL', product_name: 'iPhone 15 Pro Max MagSafe Light-up LED Phone Case' },
    { asin: 'GENERIC', product_name: 'iPhone MagSafe Light-up LED Phone Case' },
    { asin: 'NOTLIGHT', product_name: 'iPhone 15 Pro MagSafe Clear Phone Case' },
    { asin: 'NOTMAGSAFE', product_name: 'iPhone 15 Pro Light-up LED Phone Case' },
    { asin: 'LIGHT', product_name: 'MagSafe LED Ring Light for iPhone 15 Pro' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['MATCH'], query);
  }
});

test('通常のスマホケースも4言語で機種・MagSafe・透明条件が一致する候補だけを提示する', () => {
  const queries = [
    'iPhone 15 Pro用の透明なMagSafeケース',
    'a clear MagSafe case for iPhone 15 Pro',
    'iPhone 15 Pro透明磁吸手机壳',
    'iPhone 15 Pro 투명 맥세이프 케이스',
  ];
  const candidates = [
    { asin: 'MATCH', product_name: 'iPhone 15 Pro Clear MagSafe Phone Case' },
    { asin: 'BASE', product_name: 'iPhone 15 Clear MagSafe Phone Case' },
    { asin: 'MAX', product_name: 'iPhone 15 Pro Max Clear MagSafe Phone Case' },
    { asin: 'GENERIC', product_name: 'iPhone Clear MagSafe Phone Case' },
    { asin: 'OPAQUE', product_name: 'iPhone 15 Pro Black MagSafe Phone Case' },
    { asin: 'NONMAGNETIC', product_name: 'iPhone 15 Pro Clear Phone Case' },
    { asin: 'CHARGER', product_name: 'iPhone 15 Pro Clear MagSafe Charger Stand' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['MATCH'], query);
  }
});

test('スマホ保護フィルムは4言語で機種・ガラス・覗き見防止が一致する候補だけを提示する', () => {
  const cases = [
    ['iPhone 15 Pro', [
      'iPhone 15 Pro用の覗き見防止ガラスフィルム',
      'privacy tempered glass screen protector for iPhone 15 Pro',
      'iPhone 15 Pro 防窥钢化玻璃保护膜',
      'iPhone 15 Pro 사생활 보호 강화유리 필름',
    ], 'iPhone 15 Pro Max'],
    ['Galaxy S24 Ultra', [
      'Galaxy S24 Ultra用の覗き見防止ガラスフィルム',
      'privacy tempered glass screen protector for Galaxy S24 Ultra',
      'Galaxy S24 Ultra 防窥钢化玻璃保护膜',
      'Galaxy S24 Ultra 사생활 보호 강화유리 필름',
    ], 'Galaxy S24 Plus'],
  ];
  for (const [device, queries, wrongDevice] of cases) {
    const candidates = [
      { asin: 'MATCH', product_name: `${device} Privacy Tempered Glass Screen Protector` },
      { asin: 'WRONGMODEL', product_name: `${wrongDevice} Privacy Tempered Glass Screen Protector` },
      { asin: 'GENERIC', product_name: 'Smartphone Privacy Tempered Glass Screen Protector' },
      { asin: 'NOTPRIVACY', product_name: `${device} Clear Tempered Glass Screen Protector` },
      { asin: 'NOTGLASS', product_name: `${device} Privacy PET Protective Film` },
      { asin: 'CASE', product_name: `${device} Privacy Clear Phone Case` },
    ];
    for (const query of queries) {
      assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
        ['MATCH'], query);
    }
  }
});

test('単焦点レンズは4言語でマウント・焦点距離・F値が一致する候補だけを提示する', () => {
  const cases = [
    [['Sony Eマウント 35mm F1.8の単焦点レンズ', 'Sony E-mount 35mm F1.8 prime lens',
      '索尼E卡口35mm F1.8定焦镜头', '소니 E마운트 35mm F1.8 단렌즈'],
    'Sony E-mount 35mm F1.8 Prime Lens', 'Canon RF-mount 35mm F1.8 Prime Lens'],
    [['Canon RFマウント 50mm F1.8の単焦点レンズ', 'Canon RF-mount 50mm F1.8 prime lens',
      '佳能RF卡口50mm F1.8定焦镜头', '캐논 RF마운트 50mm F1.8 단렌즈'],
    'Canon RF-mount 50mm F1.8 Prime Lens', 'Sony E-mount 50mm F1.8 Prime Lens'],
  ];
  for (const [queries, matchName, wrongMountName] of cases) {
    const focal = matchName.match(/(\d{2,3})mm/u)[1];
    const candidates = [
      { asin: 'MATCH', product_name: matchName },
      { asin: 'WRONGMOUNT', product_name: wrongMountName },
      { asin: 'WRONGFOCAL', product_name: matchName.replace(`${focal}mm`, `${Number(focal) + 15}mm`) },
      { asin: 'WRONGAPERTURE', product_name: matchName.replace('F1.8', 'F2.8') },
      { asin: 'ZOOM', product_name: matchName.replace(`${focal}mm F1.8 Prime`, '24-70mm F2.8 Zoom') },
      { asin: 'ADAPTER', product_name: `${matchName} Mount Adapter` },
      { asin: 'CAP', product_name: `${matchName} Lens Cap` },
      { asin: 'CAMERA', product_name: `${matchName.split(' ')[0]} Mirrorless Camera Body` },
    ];
    for (const query of queries) {
      assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin), ['MATCH'], query);
    }
  }
});

test('充電ケーブルは4言語で端子・長さ・W数・編み込みが一致する候補だけを提示する', () => {
  const queries = [
    '2m 60Wの編み込みUSB-C to USB-C充電ケーブル',
    '2m 60W braided USB-C to USB-C charging cable',
    '2米60W编织USB-C转USB-C充电线',
    '2m 60W 패브릭 USB-C to USB-C 충전 케이블',
  ];
  const candidates = [
    { asin: 'MATCH', product_name: 'USB-C to USB-C 2m 60W Braided Charging Cable' },
    { asin: 'LIGHTNING', product_name: 'USB-C to Lightning 2m 60W Braided Charging Cable' },
    { asin: 'WRONGLENGTH', product_name: 'USB-C to USB-C 1m 60W Braided Charging Cable' },
    { asin: 'WRONGPOWER', product_name: 'USB-C to USB-C 2m 100W Braided Charging Cable' },
    { asin: 'NOTBRAIDED', product_name: 'USB-C to USB-C 2m 60W Silicone Charging Cable' },
    { asin: 'ADAPTER', product_name: 'USB-C to USB-C 2m 60W Braided Charging Cable Adapter' },
    { asin: 'CHARGER', product_name: 'USB-C 60W Charger with 2m USB-C Charging Cable' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin), ['MATCH'], query);
  }
});

test('GaN充電器は4言語で出力・ポート数・PD・PPS・USB-Cが一致する候補だけを提示する', () => {
  const queries = [
    '65W 3ポート GaN PD PPS USB-C充電器',
    '65W 3-port GaN PD PPS USB-C wall charger',
    '65W 3口 GaN PD PPS USB-C充电器',
    '65W 3포트 GaN PD PPS USB-C 충전기',
  ];
  const candidates = [
    { asin: 'MATCH', product_name: '65W 3-Port GaN USB-C PD PPS Wall Charger' },
    { asin: 'WRONGPOWER', product_name: '100W 3-Port GaN USB-C PD PPS Wall Charger' },
    { asin: 'WRONGPORTS', product_name: '65W 2-Port GaN USB-C PD PPS Wall Charger' },
    { asin: 'NOTGAN', product_name: '65W 3-Port USB-C PD PPS Wall Charger' },
    { asin: 'NOPPS', product_name: '65W 3-Port GaN USB-C PD Wall Charger' },
    { asin: 'USB-A', product_name: '65W 3-Port GaN USB-A PD PPS Wall Charger' },
    { asin: 'CABLE', product_name: '65W 3-Port GaN USB-C PD PPS Charging Cable' },
    { asin: 'POWERBANK', product_name: '65W 3-Port GaN USB-C PD PPS Power Bank Charger' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin), ['MATCH'], query);
  }
});

test('Androidの光るケースもGalaxyとPixelの完全一致候補だけを初回提示する', () => {
  const cases = [
    {
      queries: [
        'TikTokで見た光るGalaxy S24 UltraケースでMagSafe対応',
        'a glowing MagSafe Galaxy S24 Ultra case seen on TikTok',
        'TikTok看到的发光磁吸Galaxy S24 Ultra手机壳',
        '틱톡에서 본 빛나는 맥세이프 Galaxy S24 Ultra 케이스',
      ],
      candidates: [
        { asin: 'MATCH', product_name: 'Galaxy S24 Ultra MagSafe Light-up LED Phone Case' },
        { asin: 'BASE', product_name: 'Galaxy S24 MagSafe Light-up LED Phone Case' },
        { asin: 'PLUS', product_name: 'Galaxy S24 Plus MagSafe Light-up LED Phone Case' },
        { asin: 'GENERIC', product_name: 'Galaxy MagSafe Light-up LED Phone Case' },
      ],
    },
    {
      queries: [
        'TikTokで見た光るPixel 9 ProケースでMagSafe対応',
        'a glowing MagSafe Pixel 9 Pro case seen on TikTok',
        'TikTok看到的发光磁吸Pixel 9 Pro手机壳',
        '틱톡에서 본 빛나는 맥세이프 Pixel 9 Pro 케이스',
      ],
      candidates: [
        { asin: 'MATCH', product_name: 'Pixel 9 Pro MagSafe Light-up LED Phone Case' },
        { asin: 'BASE', product_name: 'Pixel 9 MagSafe Light-up LED Phone Case' },
        { asin: 'FOLD', product_name: 'Pixel 9 Pro Fold MagSafe Light-up LED Phone Case' },
        { asin: 'GENERIC', product_name: 'Pixel MagSafe Light-up LED Phone Case' },
      ],
    },
  ];
  for (const { queries, candidates } of cases) {
    for (const query of queries) {
      assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
        ['MATCH'], query);
    }
  }
});

test('モバイルバッテリーは容量と内蔵端子が一致する候補だけを提示する', () => {
  const queries = [
    '旅行用のUSB-Cケーブル内蔵10000mAhモバイルバッテリー',
    '10000mAh power bank with built-in USB-C cable for travel',
    '旅行用自带USB-C线的10000mAh充电宝',
    '여행용 USB-C 케이블 내장 10000mAh 보조배터리',
  ];
  const candidates = [
    { asin: 'POWER10000C', product_name: '10000mAh Power Bank Built-in USB-C Cable' },
    { asin: 'POWER20000C', product_name: '20000mAh Power Bank Built-in USB-C Cable' },
    { asin: 'POWER10000L', product_name: '10000mAh Power Bank Built-in Lightning Cable' },
    { asin: 'POWER10000N', product_name: '10000mAh Power Bank USB-C Port' },
    { asin: 'WALL10000C', product_name: 'USB-C Wall Charger 10000mAh Fast Charging' },
    { asin: 'CABLE10000C', product_name: 'USB-C Charging Cable 10000mAh Compatible' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['POWER10000C'], query);
  }
});

test('MagSafeモバイルバッテリーは磁気吸着と容量が一致する候補だけを提示する', () => {
  const queries = [
    'iPhone用MagSafe対応5000mAhモバイルバッテリー',
    '5000mAh magnetic MagSafe power bank for iPhone',
    '苹果手机用5000mAh磁吸充电宝',
    '아이폰용 맥세이프 자석 5000mAh 보조배터리',
  ];
  const candidates = [
    { asin: 'MAG5000', product_name: 'MagSafe Magnetic Power Bank 5000mAh' },
    { asin: 'PLAIN5000', product_name: 'Power Bank 5000mAh USB-C' },
    { asin: 'MAG10000', product_name: 'MagSafe Magnetic Power Bank 10000mAh' },
    { asin: 'PAD5000', product_name: 'MagSafe Wireless Charging Pad 5000mAh Compatible' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['MAG5000'], query);
  }
});

test('PDモバイルバッテリーは容量と出力が一致する候補だけを提示する', () => {
  const queries = [
    'PD20W急速充電10000mAhモバイルバッテリー',
    '10000mAh power bank with 20W USB-C PD fast charging',
    '支持20W PD快充的10000mAh充电宝',
    'PD 20W 고속충전 10000mAh 보조배터리',
  ];
  const candidates = [
    { asin: 'PD20', product_name: '10000mAh Power Bank USB-C PD 20W Fast Charging' },
    { asin: 'PD18', product_name: '10000mAh Power Bank USB-C PD 18W Fast Charging' },
    { asin: 'PD30', product_name: '10000mAh Power Bank USB-C PD 30W Fast Charging' },
    { asin: 'NOPD', product_name: '10000mAh Power Bank Fast Charging' },
    { asin: 'WALL20', product_name: 'USB-C PD 20W Wall Charger' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['PD20'], query);
  }
});

test('モバイルバッテリーの容量訂正は否定容量を候補照合へ残さない', () => {
  const queries = [
    '20000mAhじゃなく10000mAhのPD20Wモバイルバッテリー',
    'not 20000mAh, I want a 10000mAh PD20W power bank',
    '不要20000mAh，要10000mAh的PD20W充电宝',
    '20000mAh 말고 10000mAh PD20W 보조배터리',
  ];
  const candidates = [
    { asin: 'POWER10000', product_name: '10000mAh Power Bank USB-C PD20W' },
    { asin: 'POWER20000', product_name: '20000mAh Power Bank USB-C PD20W' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['POWER10000'], query);
  }
});

test('タブレット専用アクセサリーは4言語で汎用品や別端末向け商品を除外する', () => {
  const cases = [
    ['タブレット用Bluetoothキーボード', 'KEYBOARD'],
    ['tablet screen protector', 'PROTECTOR'],
    ['平板电脑充电器', 'CHARGER'],
    ['태블릿용 블루투스 키보드', 'KEYBOARD'],
  ];
  const candidates = [
    { asin: 'KEYBOARD', product_name: 'iPad Tablet Bluetooth Keyboard' },
    { asin: 'PROTECTOR', product_name: 'タブレット用 強化ガラス 保護フィルム' },
    { asin: 'CHARGER', product_name: '平板电脑 USB-C 充电器 Power Adapter' },
    { asin: 'GENERICKEY', product_name: 'Bluetooth Wireless Keyboard for Windows PC' },
    { asin: 'PHONEFILM', product_name: 'iPhone Tempered Glass Screen Protector' },
    { asin: 'LAPTOPAC', product_name: 'USB-C Laptop Charger Power Adapter' },
    { asin: 'TABLETCASE', product_name: 'Tablet Protective Case Cover' },
  ];
  for (const [query, expected] of cases) {
    assert.deepEqual(
      filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      [expected],
      query
    );
  }
});

test('スマホケースは初回から対応機種と光り方を提案する', async () => {
  const result = await applyIndexedSearchPolicy(
    { query_id: 'phone-case-q', candidates: [
      { asin: 'CASE00001', product_name: 'LEDで光るスマホケース 通知発光カバー' },
      { asin: 'PLAIN00001', product_name: '透明スマホケース' },
      { asin: 'LIGHT00001', product_name: 'スマホ撮影用LEDリングライト' },
      { asin: 'OTHER00001', product_name: 'TikTokで人気のアクセサリー' },
    ] },
    { PRODUCT_DB: emptyDb() },
    'TikTokで見た光るスマホケース',
    'JA'
  );
  assert.match(result.clarification.question, /対応機種.*光り方/);
  assert.deepEqual(result.clarification.options.slice(0, 4).map((item) => item.label), [
    'LEDで光るケース', '通知で光るケース', '背面が光るケース', '蓄光タイプ'
  ]);
  assert.doesNotMatch(result.clarification.options.map((item) => item.label).join(' '), /キッチン/);
  assert.deepEqual(result.candidates.map((candidate) => candidate.asin), ['CASE00001']);
});

test('さまざまな商品文でカテゴリ固有の候補を10件提示する', async () => {
  const cases = [
    ['電車で見た耳をふさがないイヤホン', /完全ワイヤレス/, /ノイズキャンセリング/],
    ['机に置く色が変わるライト', /卓上ライト/, /人感センサー/],
    ['旅行に持っていく小さい加湿器', /卓上/, /アロマ対応/],
    ['バッグに入る軽い折りたたみ傘', /自動開閉/, /完全遮光/],
    ['洗いやすくて漏れない水筒', /保温・保冷/, /ストロー付き/]
  ];
  for (const [query, first, another] of cases) {
    const result = await applyIndexedSearchPolicy(
      { query_id: crypto.randomUUID(), candidates: [] },
      { PRODUCT_DB: emptyDb() },
      query,
      'JA'
    );
    const options = result.clarification.options.map((item) => item.label);
    assert.equal(options.length, 10, query);
    assert.match(options.join(' '), first, query);
    assert.match(options.join(' '), another, query);
    assert.doesNotMatch(options.join(' '), /キッチン・食卓で使う/, query);
  }
});

test('生活用品の自然文でも購入判断に合う候補を10件提示する', async () => {
  const cases = [
    ['一人暮らしの狭い部屋に置くデスク', /省スペース/],
    ['夏に使う冷たい枕みたいなもの', /ひんやり素材/],
    ['学校で使う消せる細いペン', /勉強用/],
    ['キャンプで使える小さい鍋', /直火対応/],
    ['猫が留守番中に使う水飲み', /猫用/],
    ['赤ちゃんとの外出で使う折りたためるもの', /外出用/],
    ['登山に持っていく軽い道具', /防水/]
  ];
  for (const [query, expected] of cases) {
    const result = await applyIndexedSearchPolicy({ candidates: [] }, { PRODUCT_DB: emptyDb() }, query, 'JA');
    assert.equal(result.clarification.options.length, 10, query);
    assert.match(result.clarification.options.map((option) => option.label).join(' '), expected, query);
  }
});

test('英語・中国語・韓国語でもカテゴリ別候補を10件提示する', async () => {
  const cases = [
    ['EN', 'light-up phone case seen on TikTok', /LED light-up case/],
    ['ZH', '想找桌上可以变色的小灯', /桌面灯/],
    ['KO', '고양이가 혼자 있을 때 쓰는 물그릇', /고양이용/],
    ['EN', 'small fan I can carry on the train', /handheld/],
    ['ZH', '能放进包里的折叠雨伞', /自动开合/],
    ['KO', '휴대하기 좋은 가벼운 물병', /보온·보냉/]
  ];
  for (const [language, query, expected] of cases) {
    const result = await applyIndexedSearchPolicy({ candidates: [] }, { PRODUCT_DB: emptyDb() }, query, language);
    assert.equal(result.clarification.options.length, 10, query);
    assert.match(result.clarification.options.map((option) => option.label).join(' '), expected, query);
  }
});

test('一般的な日本語のカメラ表現をAmazon検索語に保持する', () => {
  const groups = semanticSearchGroups('SNSで見た、ピンクの小さいカメラみたいなもの / 遊び・趣味に使う');
  assert.ok(groups.some((group) => group.category === 'camera' && group.terms.includes('camera')));
});

test('contracted merchant products rank before non-contracted marketplace products', () => {
  const ranked = rankMerchantCandidates(
    [{
      asin: 'B000000002',
      product_name: 'Contracted product',
      offers: [{
        marketplace: 'AMAZON_JP',
        product_url: 'https://www.amazon.co.jp/dp/B000000002',
        stock_status: 'IN_STOCK'
      }]
    }],
    [{ asin: 'B000000001', product_name: 'Marketplace fallback' }]
  );
  assert.deepEqual(ranked.map((candidate) => candidate.asin), [
    'B000000002',
    'B000000001'
  ]);
});

test('同一ASINの商品カードを1件にまとめ全セラーのオファーを保持する', () => {
  const merged = rankMerchantCandidates([
    {
      asin: 'B000000777',
      product_name: '同じ商品',
      offers: [{ seller_id: 'seller-a', marketplace: 'AMAZON_JP', product_url: 'https://www.amazon.co.jp/dp/B000000777?m=a', stock_status: 'IN_STOCK' }]
    },
    {
      asin: 'B000000777',
      product_name: '同じ商品',
      offers: [{ seller_id: 'seller-b', marketplace: 'AMAZON_JP', product_url: 'https://www.amazon.co.jp/dp/B000000777?m=b', stock_status: 'IN_STOCK' }]
    }
  ], []);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].offers.map((offer) => offer.seller_id), ['seller-a', 'seller-b']);
});

test('public knowledge policy shows indexed products while asking one refinement', async () => {
  const row = {
    asin: 'B000000001',
    product_name: 'Blue Table Lamp',
    manufacturer: 'Example',
    image_url: 'https://images.example.test/lamp.jpg',
    stock: 4
  };
  const env = {
    PRODUCT_DB: {
      prepare() {
        return { bind() { return { all: async () => ({ results: [row] }) }; } };
      }
    }
  };
  const result = await applyIndexedSearchPolicy(
    { query_id: 'q2', candidates: [] },
    env,
    'SNSで見た blue lamp',
    'JA'
  );
  assert.equal(result.clarification.required, true);
  assert.equal(result.candidates[0].asin, row.asin);
  assert.equal(result.search_guidance.provisional, true);
});

test('kitchen appliance intent excludes broad cooking-only matches and supports one-pass search', () => {
  const groups = semanticSearchGroups('日本で使える米国の小型電化製品 / キッチン・食卓で使う');
  assert.equal(groups.some((group) => group.category === 'kitchen-appliance'), true);
  assert.equal(groups.some((group) => group.category === 'kitchen-use'), false);
  const query = intelligentFtsQuery('日本で使える米国の小型電化製品 / キッチン・食卓で使う');
  assert.match(query, /"cooktop"\*/);
  assert.match(query, /"blender"\*/);
  assert.match(query, /"115v"\*/);
  assert.match(query, / AND /);
  assert.doesNotMatch(query, /^"cooking"\*$/);
  const decision = analyzeSearchDecision('日本で使える米国の小型電化製品 / キッチン・食卓で使う', [
    { product_name: 'Compact Electric Kitchen Blender 110V' }
  ]);
  assert.equal(decision.needs_clarification, false);
});

test('公開検索はITG・ITT・MC2を横断し同一ASINを統合する', async () => {
  const queriedTenants = [];
  const env = {
    PRODUCT_DB: {
      prepare(sql) {
        return {
          bind(...values) {
            if (sql.includes('FROM product_search')) {
              queriedTenants.push(values[1]);
              return { all: async () => ({ results: [{
                asin: values[1] === 'mc2' ? 'B000000002' : 'B000000001',
                product_name: 'Camera', text_rank: values[1] === 'itt' ? -2 : -1
              }] }) };
            }
            return { all: async () => ({ results: [] }) };
          }
        };
      }
    }
  };
  const result = await searchProductsAcrossTenantsWithDecision(
    env, ['itg', 'itt', 'mc2'], 'カメラ', 10
  );
  assert.deepEqual(queriedTenants, ['itg', 'itt', 'mc2']);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.search.tenants, ['itg', 'itt', 'mc2']);
});


test('social media context does not outrank the remembered product category', () => {
  const memory = 'SNSで見たピンクの小さいレトロカメラ / 手のひらサイズ / 写真を撮る';
  assert.match(intelligentFtsQuery(memory), /"camera"\*/);
  assert.match(relaxedFtsQuery(memory), /"camera"\*/);
  assert.doesNotMatch(intelligentFtsQuery(memory), /"sns"\*/i);
  assert.doesNotMatch(relaxedFtsQuery(memory), /"sns"\*/i);
  assert.doesNotMatch(relaxedFtsQuery(memory), /"pink"\*/i);
});

test('4言語の自己訂正では否定後に言い直した商品属性を検索条件へ残す', () => {
  const cases = [
    '最初は黒を避けたかったが、やっぱり黒い財布',
    'not black at first, but actually a black wallet',
    '一开始不要黑色，后来决定要黑色钱包',
    '처음에는 검정 말고 생각했지만 결국 검정 지갑',
  ];
  for (const input of cases) {
    const query = intelligentFtsQuery(input);
    assert.match(query, /"wallet"\*/i, input);
    assert.match(query, /"black"\*/i, input);
  }
});

test('4言語の比較寸法を予算と誤認せず否定された寸法だけを除外する', () => {
  const positiveCases = [
    '幅50センチ以下の収納ボックス',
    'a storage box under 50 cm wide',
    '宽度不超过50厘米的收纳盒',
    '너비 50센티미터 이하 수납함',
  ];
  for (const input of positiveCases) {
    const query = intelligentFtsQuery(input);
    assert.match(query, /"50"\*/, input);
  }
  const correctedCases = [
    '50センチではなく40センチの収納ボックス',
    'not 50 cm but a 40 cm storage box',
    '不要50厘米，要40厘米的收纳盒',
    '50센티미터 말고 40센티미터 수납함',
  ];
  for (const input of correctedCases) {
    const query = intelligentFtsQuery(input);
    assert.match(query, /"40"\*/, input);
    assert.doesNotMatch(query, /"50"\*/, input);
  }
});

test('4言語の重量条件を商品仕様として保持し訂正前の重量を除外する', () => {
  const positiveCases = [
    '2キロ以下のバックパック',
    'a backpack under 2 kilograms',
    '不超过2公斤的背包',
    '2킬로그램 이하 백팩',
  ];
  for (const input of positiveCases) {
    const query = intelligentFtsQuery(input);
    assert.match(query, /"2kg"\*/i, input);
  }
  const correctedCases = [
    '3キロではなく2キロ以下のバックパック',
    'not 3 kg but a backpack under 2 kilograms',
    '不要3公斤，要2公斤的背包',
    '3킬로그램 말고 2킬로그램 이하 백팩',
  ];
  for (const input of correctedCases) {
    const query = intelligentFtsQuery(input);
    assert.match(query, /"2kg"\*/i, input);
    assert.doesNotMatch(query, /"3kg"\*/i, input);
  }
});

test('4言語の小数重量は末尾の整数を別仕様として混入させない', () => {
  const positiveCases = [
    '1.5kg以下のバックパック',
    'a 1.5kg backpack',
    '不超过1.5kg的背包',
    '1.5kg 이하 백팩',
  ];
  for (const input of positiveCases) {
    const query = intelligentFtsQuery(input);
    assert.match(query, /"1\.5kg"\*/i, input);
    assert.doesNotMatch(query, /"5kg"\*/i, input);
  }
  const correctedCases = [
    '2.5kgではなく1.5kgのバックパック',
    'not 2.5kg but a 1.5kg backpack',
    '不要2.5kg，要1.5kg的背包',
    '2.5kg 말고 1.5kg 백팩',
  ];
  for (const input of correctedCases) {
    const query = intelligentFtsQuery(input);
    assert.match(query, /"1\.5kg"\*/i, input);
    assert.doesNotMatch(query, /"2\.5kg"\*|"5kg"\*/i, input);
  }
});

test('iPhoneとGalaxyの現地語端末名でもケース意図と型番を保持する', () => {
  const cases = [
    'アイフォン15 Proの透明ケース',
    'iPhone 15 Pro clear case',
    '苹果手机15 Pro透明手机壳',
    '아이폰15 Pro 투명 케이스',
    'ギャラクシーS24 Ultraのケース',
    'Galaxy S24 Ultra case',
    '三星S24 Ultra手机壳',
    '갤럭시S24 Ultra 케이스',
  ];
  for (const input of cases) {
    const query = intelligentFtsQuery(input);
    assert.match(query, /"phone"\*|"case"\*/, input);
    assert.match(query, /"15"\*|"s24"\*/, input);
  }
});

test('XperiaとAQUOSの4言語ケース検索でもカテゴリと端末識別子を保持する', () => {
  const cases = [
    ['エクスペリア 1 VIの透明ケース', 'xperia'],
    ['clear case for Xperia 1 VI', 'xperia'],
    ['Xperia 1 VI透明手机壳', 'xperia'],
    ['엑스페리아 1 VI 투명 케이스', 'xperia'],
    ['アクオス sense8のケース', 'aquos'],
    ['AQUOS sense8 case', 'aquos'],
    ['AQUOS sense8手机壳', 'aquos'],
    ['아쿠오스 sense8 케이스', 'aquos'],
  ];
  for (const [input, brand] of cases) {
    const query = intelligentFtsQuery(input);
    assert.match(query, /"phone"\*|"case"\*/, input);
    assert.match(query, new RegExp(`"${brand}"\\*`, 'i'), input);
  }
});

test('4言語のワンピース検索はサイズ表現に左右されず商品カテゴリを保持する', () => {
  const cases = [
    'MではなくLサイズの黒いワンピース',
    'a black dress in size L, not M',
    '不要M码，要L码黑色连衣裙',
    'M사이즈 말고 L사이즈 검정 원피스',
  ];
  for (const input of cases) {
    const query = intelligentFtsQuery(input);
    assert.match(query, /"dress"\*/, input);
    assert.match(query, /"black"\*/, input);
  }
});

test('4言語と地域別の靴サイズは商品カテゴリと訂正後のサイズだけをFTSへ保持する', () => {
  const cases = [
    ['24cmではなく24.5cmの白いスニーカー', /"24\.5"\*/, /"24"\*/],
    ['white sneakers in US size 9, not US size 8', /"us 9"\*/, /"us 8"\*/],
    ['不要38码，要39码白色运动鞋', /"eu 39"\*/, /"eu 38"\*/],
    ['255mm 말고 260mm 흰색 운동화', /"260"\*/, /"255"\*/],
    ['EU 38ではなくEU 39の黒いスニーカー', /"eu 39"\*/, /"eu 38"\*/],
    ['black trainers in UK size 6', /"uk 6"\*/, /"uk 5"\*/],
  ];
  for (const [input, expected, forbidden] of cases) {
    const query = intelligentFtsQuery(input);
    assert.match(query, /"shoe"\*.*"sneaker"\*/, input);
    assert.match(query, expected, input);
    assert.doesNotMatch(query, forbidden, input);
  }
});

test('4言語の靴用品を靴本体のFTSカテゴリへ誤分類しない', () => {
  for (const input of ['靴箱', 'shoe lace', '鞋盒', '신발장']) {
    assert.doesNotMatch(intelligentFtsQuery(input), /"shoe"\*|"sneaker"\*/, input);
  }
});

test('パンツ・スカート・Tシャツを4言語から共通FTSカテゴリへ変換する', () => {
  const cases = [
    ['黒のデニムパンツ', /"pants"\*/, /"black"\*/], ['blue jeans', /"pants"\*/, /"blue"\*/],
    ['黑色牛仔裤', /"pants"\*/, /"black"\*/], ['검정 청바지', /"pants"\*/, /"black"\*/],
    ['黒いスカート', /"skirt"\*/, /"black"\*/], ['black skirt', /"skirt"\*/, /"black"\*/],
    ['黑色半身裙', /"skirt"\*/, /"black"\*/], ['검정 치마', /"skirt"\*/, /"black"\*/],
    ['白いTシャツ', /"t-shirt"\*/, /"white"\*/], ['white t-shirt', /"t-shirt"\*/, /"white"\*/],
    ['白色T恤', /"t-shirt"\*/, /"white"\*/], ['흰색 티셔츠', /"t-shirt"\*/, /"white"\*/],
  ];
  for (const [input, product, color] of cases) {
    const query = intelligentFtsQuery(input);
    assert.match(query, product, input);
    assert.match(query, color, input);
  }
});

test('4言語のカテゴリ訂正は否定したパンツを除きスカートだけをFTSへ保持する', () => {
  for (const input of [
    'パンツではなく黒いスカート', 'not pants but a black skirt',
    '不要裤子，要黑色半身裙', '바지 말고 검정 치마',
  ]) {
    const query = intelligentFtsQuery(input);
    assert.match(query, /"skirt"\*/, input);
    assert.doesNotMatch(query, /"pants"\*|"trousers"\*|"jeans"\*/, input);
  }
});

test('中国語・韓国語の主要色をFTS共通色へ正規化する', () => {
  const cases = [
    ['绿色T恤', 'green'], ['초록색 티셔츠', 'green'],
    ['蓝色裙子', 'blue'], ['파란색 치마', 'blue'],
    ['粉色T恤', 'pink'], ['핑크 티셔츠', 'pink'],
    ['银色裙子', 'silver'], ['은색 치마', 'silver'],
    ['棕色T恤', 'brown'], ['갈색 티셔츠', 'brown'],
    ['黄色裙子', 'yellow'], ['노란색 치마', 'yellow'],
    ['灰色T恤', 'gray'], ['회색 티셔츠', 'gray'],
  ];
  for (const [input, color] of cases) {
    assert.match(intelligentFtsQuery(input), new RegExp(`"${color}"\\*`), input);
  }
});

test('ジャケット・コート・パーカーを4言語から属性付きFTSカテゴリへ変換する', () => {
  const cases = [
    ['黒い防水ジャケット', 'jacket', 'black', 'waterproof'],
    ['black waterproof jacket', 'jacket', 'black', 'waterproof'],
    ['黑色防水夹克', 'jacket', 'black', 'waterproof'],
    ['검정 방수 재킷', 'jacket', 'black', 'waterproof'],
    ['ベージュのトレンチコート', 'coat', 'beige'],
    ['beige trench coat', 'coat', 'beige'],
    ['米色风衣', 'coat', 'beige'],
    ['베이지 트렌치코트', 'coat', 'beige'],
    ['グレーのパーカー', 'hoodie', 'gray'],
    ['gray hoodie', 'hoodie', 'gray'],
    ['灰色连帽衫', 'hoodie', 'gray'],
    ['회색 후드티', 'hoodie', 'gray'],
  ];
  for (const [input, ...expected] of cases) {
    const query = intelligentFtsQuery(input);
    for (const token of expected) assert.match(query, new RegExp(`"${token}"\\*`), input);
  }
});

test('4言語のアウター訂正は否定したジャケットを除きコートだけをFTSへ保持する', () => {
  for (const input of [
    'ジャケットではなく黒いコート', 'not a jacket but a black coat',
    '不要夹克，要黑色外套', '재킷 말고 검정 코트',
  ]) {
    const query = intelligentFtsQuery(input);
    assert.match(query, /"coat"\*/, input);
    assert.doesNotMatch(query, /"jacket"\*/, input);
  }
});

test('4言語のライフジャケットをファッション用ジャケットと分離する', () => {
  const cases = [
    ['オレンジのライフジャケット', 'orange'], ['orange life jacket', 'orange'],
    ['黄色救生衣', 'yellow'], ['노란색 구명조끼', 'yellow'],
  ];
  for (const [input, color] of cases) {
    const query = intelligentFtsQuery(input);
    assert.match(query, /"life jacket"\*/, input);
    assert.match(query, new RegExp(`"${color}"\\*`), input);
    assert.doesNotMatch(query, /\("jacket"\*\)/, input);
  }
});

test('4言語のノートPC本体はRAM・SSD条件と共通カテゴリを保持する', () => {
  for (const input of [
    '16GB RAM 512GB SSDの軽いノートPC',
    'lightweight laptop with 16GB RAM and 512GB SSD',
    '16GB内存512GB固态硬盘的轻薄笔记本电脑',
    '16GB RAM 512GB SSD 가벼운 노트북',
  ]) {
    const query = intelligentFtsQuery(input);
    assert.match(query, /"laptop"\*/, input);
    assert.match(query, /"16gb"\*/, input);
    assert.match(query, /"512gb"\*/, input);
  }
});

test('4言語の軽量表現を商品名必須条件にせずゲーミングマウス候補を維持する', () => {
  for (const input of [
    'すごく軽い黒い無線ゲーミングマウス',
    'a very lightweight black wireless gaming mouse for a computer',
    '轻量黑色无线电脑鼠标',
    '컴퓨터용 초경량 검정 무선 게이밍 마우스',
  ]) {
    const query = intelligentFtsQuery(input);
    assert.match(query, /"mouse"\*/, input);
    assert.match(query, /"black"\*/, input);
    assert.doesNotMatch(query, /"lightweight"\*|"ultralight"\*/, input);
  }
});

test('ノートPCケース・スタンド・充電器を4言語で本体FTSカテゴリから分離する', () => {
  const cases = [
    ['13インチのノートPCケース', 'laptop case'], ['13-inch laptop sleeve', 'laptop case'],
    ['13英寸笔记本电脑包', 'laptop case'], ['13인치 노트북 파우치', 'laptop case'],
    ['折りたたみノートPCスタンド', 'laptop stand'], ['foldable laptop stand', 'laptop stand'],
    ['可折叠笔记本电脑支架', 'laptop stand'], ['접이식 노트북 거치대', 'laptop stand'],
    ['USB-CノートPC充電器', 'laptop charger'], ['USB-C laptop charger', 'laptop charger'],
    ['USB-C笔记本电脑充电器', 'laptop charger'], ['USB-C 노트북 충전기', 'laptop charger'],
  ];
  for (const [input, category] of cases) {
    const query = intelligentFtsQuery(input);
    assert.match(query, new RegExp(`"${category}"\\*`), input);
    assert.doesNotMatch(query, /\("laptop"\* OR "notebook computer"\*\)/, input);
  }
});

test('4言語のタブレット本体は小数インチ・容量と共通FTSカテゴリを保持する', () => {
  for (const input of [
    '10.9インチ256GBのタブレット',
    '10.9-inch tablet with 256GB storage',
    '10.9英寸256GB平板电脑',
    '10.9인치 256GB 태블릿',
  ]) {
    const query = intelligentFtsQuery(input);
    assert.match(query, /"tablet"\*/, input);
    assert.match(query, /"10\.9"\*/, input);
    assert.match(query, /"256gb"\*/, input);
    assert.doesNotMatch(query, /"storage"\*|"10"\*|"9-inch"\*/, input);
  }
});

test('タブレットケース・スタンド・ペンを4言語で本体FTSカテゴリから分離する', () => {
  const cases = [
    ['10.9インチのタブレットケース', 'tablet case'], ['10.9-inch tablet case', 'tablet case'],
    ['10.9英寸平板电脑保护套', 'tablet case'], ['10.9인치 태블릿 케이스', 'tablet case'],
    ['折りたたみタブレットスタンド', 'tablet stand'], ['foldable tablet stand', 'tablet stand'],
    ['可折叠平板电脑支架', 'tablet stand'], ['접이식 태블릿 거치대', 'tablet stand'],
    ['タブレット用スタイラスペン', 'tablet stylus'], ['stylus pen for tablet', 'tablet stylus'],
    ['平板电脑触控笔', 'tablet stylus'], ['태블릿 스타일러스 펜', 'tablet stylus'],
  ];
  for (const [input, category] of cases) {
    const query = intelligentFtsQuery(input);
    assert.match(query, new RegExp(`"${category}"\\*`), input);
    assert.doesNotMatch(query, /^"tablet"\*|\("tablet"\*\)/, input);
  }
});

test('Bluetoothを青色と誤認せずタブレット用キーボードを4言語で専用FTSへ変換する', () => {
  for (const input of [
    'タブレット用Bluetoothキーボード',
    'Bluetooth keyboard for tablet',
    '平板电脑蓝牙键盘',
    '태블릿용 블루투스 키보드',
  ]) {
    const groups = semanticSearchGroups(input);
    assert.deepEqual(groups.map((group) => group.category), ['tablet-keyboard'], input);
    const query = intelligentFtsQuery(input);
    assert.match(query, /"tablet keyboard"\*|"bluetooth keyboard"\*|"wireless keyboard"\*/, input);
    assert.doesNotMatch(query, /"blue"\*|"aqua"\*/, input);
  }
});

test('タブレット保護フィルム・充電器を4言語で本体FTSカテゴリから分離する', () => {
  const cases = [
    ['10.9インチタブレット保護フィルム', 'tablet screen protector', '10.9'],
    ['10.9-inch tablet screen protector', 'tablet screen protector', '10.9'],
    ['10.9英寸平板电脑钢化膜', 'tablet screen protector', '10.9'],
    ['10.9인치 태블릿 액정보호필름', 'tablet screen protector', '10.9'],
    ['USB-Cタブレット充電器', 'tablet charger', 'usb-c'],
    ['USB-C charger for tablet', 'tablet charger', 'usb-c'],
    ['USB-C平板电脑充电器', 'tablet charger', 'usb-c'],
    ['USB-C 태블릿 충전기', 'tablet charger', 'usb-c'],
  ];
  for (const [input, category, condition] of cases) {
    const query = intelligentFtsQuery(input);
    assert.match(query, new RegExp(`"${category}"\\*`), input);
    assert.match(query, new RegExp(`"${condition.replace('.', '\\.') }"\\*`), input);
    assert.doesNotMatch(query, /^"tablet"\*|\("tablet"\*\)/, input);
  }
});

test('iPad Air・Proのアクセサリー意図と画面サイズを4言語で保持する', () => {
  const cases = [
    ['iPad Air 11インチ用キーボードケース', 'tablet-keyboard', 'tablet keyboard', '11'],
    ['keyboard case for iPad Pro 13-inch', 'tablet-keyboard', 'tablet keyboard', '13'],
    ['iPad Air 11英寸键盘保护套', 'tablet-keyboard', 'tablet keyboard', '11'],
    ['아이패드 프로 13인치 키보드 케이스', 'tablet-keyboard', 'tablet keyboard', '13'],
    ['iPad Air 11インチ用保護フィルム', 'tablet-screen-protector', 'tablet screen protector', '11'],
    ['USB-C charger for iPad Pro', 'tablet-charger', 'tablet charger', 'usb-c'],
  ];
  for (const [input, category, productTerm, condition] of cases) {
    assert.deepEqual(semanticSearchGroups(input).map((group) => group.category), [category], input);
    const query = intelligentFtsQuery(input);
    assert.match(query, new RegExp(`"${productTerm}"\\*`), input);
    assert.match(query, new RegExp(`"${condition}"\\*`, 'i'), input);
    assert.doesNotMatch(query, /^"tablet"\*|\("tablet"\*\)/, input);
  }
});

test('Apple Pencil本体・交換ペン先・充電用品を4言語で分離する', () => {
  const cases = [
    ['Apple Pencil 第2世代 iPad Pro用', 'tablet-stylus', 'apple pencil'],
    ['2nd generation Apple Pencil for iPad Pro', 'tablet-stylus', 'apple pencil'],
    ['iPad Pro用Apple Pencil交換ペン先', 'tablet-stylus-tip', 'apple pencil tips'],
    ['iPad Pro Apple Pencil替换笔尖', 'tablet-stylus-tip', 'apple pencil tips'],
    ['아이패드 프로 애플펜슬 교체 펜촉', 'tablet-stylus-tip', 'apple pencil tips'],
    ['USB-C Apple Pencil charging adapter', 'tablet-stylus-charger', 'apple pencil charger'],
  ];
  for (const [input, category, productTerm] of cases) {
    assert.deepEqual(semanticSearchGroups(input).map((group) => group.category), [category], input);
    assert.match(intelligentFtsQuery(input), new RegExp(`"${productTerm}"\\*`), input);
  }
});

test('Apple Pencil検索は商品種別が異なる候補を初回表示から除外する', () => {
  const candidates = [
    { asin: 'PENCIL', product_name: 'Apple Pencil 第2世代 iPad Pro対応 スタイラス' },
    { asin: 'TIPS', product_name: 'Apple Pencil 交換ペン先 Replacement Tips 4個' },
    { asin: 'CHARGER', product_name: 'Apple Pencil USB-C 充電アダプター' },
    { asin: 'GENERIC', product_name: 'タブレット用 汎用スタイラスペン' },
    { asin: 'IPAD', product_name: 'Apple iPad Pro 11インチ 本体' },
  ];
  assert.deepEqual(filterCategoryMismatches('Apple Pencil 第2世代 iPad Pro用', candidates).map((item) => item.asin), ['PENCIL']);
  assert.deepEqual(filterCategoryMismatches('iPad Pro用Apple Pencil交換ペン先', candidates).map((item) => item.asin), ['TIPS']);
  assert.deepEqual(filterCategoryMismatches('USB-C Apple Pencil charging adapter', candidates).map((item) => item.asin), ['CHARGER']);
});

test('Apple Pencilの世代指定は4言語で一致する候補だけを表示する', () => {
  const cases = [
    ['Apple Pencil 第2世代 iPad Pro用', 'Apple Pencil 第2世代 iPad Pro対応'],
    ['2nd generation Apple Pencil for iPad Pro', 'Apple Pencil 2nd generation for iPad Pro'],
    ['iPad Pro Apple Pencil 第2代', 'iPad Pro Apple Pencil 第2代'],
    ['아이패드 프로 애플펜슬 2세대', '아이패드 프로 애플펜슬 2세대'],
  ];
  for (const [query, matchingName] of cases) {
    const candidates = [
      { asin: 'MATCH', product_name: matchingName },
      { asin: 'GEN1', product_name: 'Apple Pencil 第1世代 iPad対応' },
      { asin: 'GEN3', product_name: 'Apple Pencil 第3世代 iPad対応' },
      { asin: 'UNKNOWN', product_name: 'Apple Pencil iPad対応 スタイラス' },
      { asin: 'GENERIC', product_name: 'タブレット用 第2世代 汎用スタイラス' },
    ];
    assert.deepEqual(
      filterCategoryMismatches(query, candidates).map((item) => item.asin),
      ['MATCH'],
      query
    );
  }
});

test('iPadアクセサリーはモデルと画面サイズが一致する候補だけを表示する', () => {
  const cases = [
    ['iPad Air 11インチ用キーボードケース', 'iPad Air 11インチ キーボードケース'],
    ['iPad Pro 13-inch screen protector', 'iPad Pro 13-inch screen protector'],
    ['iPad Air 11英寸键盘保护套', 'iPad Air 11英寸键盘保护套'],
    ['아이패드 프로 13인치 액정 보호 필름', '아이패드 프로 13인치 액정 보호 필름'],
  ];
  for (const [query, matchingName] of cases) {
    const candidates = [
      { asin: 'MATCH', product_name: matchingName },
      { asin: 'WRONGMODEL', product_name: 'iPad Pro 11インチ キーボードケース 保護フィルム' },
      { asin: 'WRONGSIZE', product_name: 'iPad Air 13インチ キーボードケース 保護フィルム' },
      { asin: 'GENERIC', product_name: 'iPad用 キーボードケース 保護フィルム' },
      { asin: 'PHONE', product_name: 'iPhone 11インチ風 ケース 保護フィルム' },
    ];
    assert.deepEqual(
      filterCategoryMismatches(query, candidates).map((item) => item.asin),
      ['MATCH'],
      query
    );
  }
});

test('iPad世代指定ケースは4言語で一致世代だけを表示する', () => {
  const cases = [
    ['iPad 第10世代 ケース', 'iPad 第10世代 ケース'],
    ['iPad 10th generation case', 'iPad 10th generation case'],
    ['iPad 第10代保护套', 'iPad 第10代保护套'],
    ['아이패드 10세대 케이스', '아이패드 10세대 케이스'],
  ];
  for (const [query, matchingName] of cases) {
    const candidates = [
      { asin: 'MATCH', product_name: matchingName },
      { asin: 'GEN9', product_name: 'iPad 第9世代 ケース' },
      { asin: 'GEN11', product_name: 'iPad 第11世代 ケース' },
      { asin: 'UNKNOWN', product_name: 'iPad ケース' },
      { asin: 'TABLET', product_name: '10世代 タブレット 汎用ケース' },
    ];
    assert.deepEqual(
      filterCategoryMismatches(query, candidates).map((item) => item.asin),
      ['MATCH'],
      query
    );
  }
});

test('ロボット掃除機の交換部品は本体・異種部品・別型番を候補から除外する', () => {
  const candidates = [
    { asin: 'FILTER', product_name: 'Roomba j7 交換用 HEPAフィルター 3個セット' },
    { asin: 'BODY', product_name: 'iRobot Roomba j7 ロボット掃除機 本体' },
    { asin: 'BRUSH', product_name: 'Roomba j7 交換サイドブラシ 3個セット' },
    { asin: 'OTHER_MODEL', product_name: 'Roomba i7 交換用フィルター 3個セット' },
    { asin: 'BAG', product_name: 'Roomba j7+ 交換紙パック 6枚' },
  ];
  const queries = [
    'ルンバ j7用 交換フィルター 3個セット',
    'replacement filters for Roomba j7 3 pack',
    '适用于Roomba j7的替换滤网3件套',
    '룸바 j7용 교체 필터 3개 세트',
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), ['FILTER'], query);
    assert.deepEqual(semanticSearchGroups(query).map((group) => group.category), ['robot-vacuum-filter'], query);
  }
});

test('ロボット掃除機の交換パーツセットは指定部品が揃う同型番候補だけを表示する', () => {
  const candidates = [
    { asin: 'KIT', product_name: 'Roomba j7 交換パーツセット HEPAフィルター サイドブラシ メインローラーブラシ' },
    { asin: 'FILTER_ONLY', product_name: 'Roomba j7 交換フィルター 3個セット' },
    { asin: 'PARTIAL', product_name: 'Roomba j7 フィルター サイドブラシ セット' },
    { asin: 'BODY', product_name: 'iRobot Roomba j7 ロボット掃除機 本体' },
    { asin: 'WRONG_MODEL', product_name: 'Roomba i7 交換パーツキット フィルター サイドブラシ メインブラシ' },
  ];
  const queries = [
    'ルンバ j7用 交換パーツセット フィルター サイドブラシ メインブラシ',
    'replacement parts kit for Roomba j7 with filter side brushes and roller brush',
    '适用于Roomba j7的配件套装 滤网 边刷 滚刷',
    '룸바 j7용 교체 부품 세트 필터 사이드 브러시 롤러 브러시',
    'ルンバ j7用 フィルターとサイドブラシとメインブラシ',
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), ['KIT'], query);
    assert.deepEqual(semanticSearchGroups(query).map((group) => group.category), ['robot-vacuum-parts-kit'], query);
  }
});

test('Dyson交換品は種類・V型番・バッテリー容量が一致する候補だけを表示する', () => {
  const candidates = [
    { asin: 'FILTER', product_name: 'Dyson V15 交換用 HEPAフィルター 2個セット' },
    { asin: 'BATTERY', product_name: 'Dyson V11 交換バッテリー 5000mAh' },
    { asin: 'LOW_BATTERY', product_name: 'Dyson V11 交換バッテリー 3000mAh' },
    { asin: 'CHARGER', product_name: 'Dyson V11 充電器 ACアダプター' },
    { asin: 'BODY', product_name: 'Dyson V15 Detect コードレス掃除機 本体' },
    { asin: 'WRONG_MODEL', product_name: 'Dyson V10 交換用 HEPAフィルター 2個セット' },
  ];
  const filterQueries = [
    'Dyson V15用 交換HEPAフィルター 2個セット',
    'replacement HEPA filters for Dyson V15 2 pack',
    '戴森V15替换HEPA滤网2件套',
    '다이슨 V15용 교체 HEPA 필터 2개 세트',
  ];
  for (const query of filterQueries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), ['FILTER'], query);
    assert.deepEqual(semanticSearchGroups(query).map((group) => group.category), ['cordless-vacuum-filter'], query);
  }
  assert.deepEqual(
    filterCategoryMismatches('replacement battery for Dyson V11 5000mAh', candidates).map((item) => item.asin),
    ['BATTERY']
  );
  assert.deepEqual(
    filterCategoryMismatches('Dyson V11 充電器', candidates).map((item) => item.asin),
    ['CHARGER']
  );
});

test('空気清浄機フィルターは本体・別型番・別種別・別交換品番を除外する', () => {
  const candidates = [
    { asin: 'SHARP_FILTER', product_name: 'Sharp KC-R50対応 交換用 集じんフィルター FZ-D50HF' },
    { asin: 'SHARP_BODY', product_name: 'Sharp KC-R50 空気清浄機 本体 HEPA搭載' },
    { asin: 'SHARP_DEODOR', product_name: 'Sharp KC-R50対応 交換用 脱臭フィルター FZ-D50DF' },
    { asin: 'SHARP_WRONG', product_name: 'Sharp KC-S50対応 交換用 集じんフィルター FZ-D50HF' },
    { asin: 'LEVOIT', product_name: 'Levoit Core 300 Replacement True HEPA Filter' },
    { asin: 'XIAOMI', product_name: 'Xiaomi Air Purifier 4 Lite 交換フィルター' },
    { asin: 'SAMSUNG', product_name: 'Samsung AX60R5080WD 교체 HEPA 필터' },
  ];
  const cases = [
    ['シャープ KC-R50用 集じんフィルター FZ-D50HF', ['SHARP_FILTER']],
    ['replacement HEPA filter for Levoit Core 300', ['LEVOIT']],
    ['适用于小米空气净化器4 Lite的替换滤芯', ['XIAOMI']],
    ['삼성 AX60R5080WD 교체 헤파 필터', ['SAMSUNG']],
  ];
  for (const [query, expected] of cases) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), expected, query);
    assert.deepEqual(semanticSearchGroups(query).map((group) => group.category), ['air-purifier-filter'], query);
  }
});

test('浄水器カートリッジは本体・別型番・別品番・本数違いを除外する', () => {
  const candidates = [
    { asin: 'BRITA3', product_name: 'BRITA MAXTRA PRO 交換カートリッジ 3個パック' },
    { asin: 'BRITA1', product_name: 'BRITA MAXTRA PRO 交換カートリッジ 1個' },
    { asin: 'BRITA_BODY', product_name: 'BRITA 浄水ポット 本体 MAXTRA PROカートリッジ付き' },
    { asin: 'TORAY', product_name: 'Toray MKC.MX2J 交換用 浄水カートリッジ 2 pack' },
    { asin: 'TORAY_WRONG', product_name: 'Toray MKC.XJ 交換用 浄水カートリッジ 2 pack' },
    { asin: 'CLEANSUI', product_name: 'Cleansui HGC9S 交換カートリッジ' },
    { asin: 'PANASONIC', product_name: 'Panasonic TK-CJ24対応 交換カートリッジ TK-CJ24C1' },
    { asin: 'PANASONIC_WRONG', product_name: 'Panasonic TK-CJ24対応 交換カートリッジ TK-CJ24C2' },
  ];
  const cases = [
    ['BRITA MAXTRA PRO 交換カートリッジ 3個', ['BRITA3']],
    ['replacement cartridge for Toray MKC.MX2J 2 pack', ['TORAY']],
    ['三菱丽阳可菱水HGC9S替换滤芯', ['CLEANSUI']],
    ['파나소닉 TK-CJ24용 교체 카트리지 TK-CJ24C1', ['PANASONIC']],
  ];
  for (const [query, expected] of cases) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), expected, query);
    assert.deepEqual(semanticSearchGroups(query).map((group) => group.category), ['water-filter-cartridge'], query);
  }
});

test('冷蔵庫給水フィルターは本体・別型番・互換品・個数違い・浄水器用品を除外する', () => {
  const candidates = [
    { asin: 'SAMSUNG', product_name: 'Samsung HAF-QIN DA97-17376B 純正 冷蔵庫給水フィルター 2個' },
    { asin: 'SAMSUNG_COMPAT', product_name: 'Samsung HAF-QIN DA97-17376B 互換 冷蔵庫給水フィルター 2個' },
    { asin: 'SAMSUNG_WRONG', product_name: 'Samsung HAF-CIN DA29-00020B 純正 冷蔵庫給水フィルター 2個' },
    { asin: 'SAMSUNG_ONE', product_name: 'Samsung HAF-QIN DA97-17376B 純正 冷蔵庫給水フィルター 1個' },
    { asin: 'LG', product_name: 'LG LT1000P ADQ74793501 genuine refrigerator water filter 2 pack' },
    { asin: 'LG_WRONG', product_name: 'LG LT700P ADQ36006101 genuine refrigerator water filter 2 pack' },
    { asin: 'GE', product_name: 'GE RPWFE original refrigerator water filter 2 pack' },
    { asin: 'GE_BODY', product_name: 'GE refrigerator appliance RPWFE filter included' },
    { asin: 'WHIRLPOOL', product_name: 'Whirlpool EveryDrop Filter 1 EDR1RXD1 genuine refrigerator water filter 2 pack' },
    { asin: 'WHIRLPOOL_WRONG', product_name: 'Whirlpool EveryDrop Filter 2 EDR2RXD1 genuine refrigerator water filter 2 pack' },
    { asin: 'PURIFIER', product_name: 'BRITA MAXTRA PRO 浄水器 交換カートリッジ 2個' },
  ];
  const cases = [
    ['Samsung HAF-QIN DA97-17376B 純正 冷蔵庫給水フィルター 2個', ['SAMSUNG']],
    ['LG LT1000P ADQ74793501 genuine refrigerator water filter 2 pack', ['LG']],
    ['GE RPWFE 原装冰箱净水滤芯 2个', ['GE']],
    ['월풀 EveryDrop Filter 1 EDR1RXD1 정품 냉장고 정수 필터 2개', ['WHIRLPOOL']],
  ];
  for (const [query, expected] of cases) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), expected, query);
    assert.deepEqual(semanticSearchGroups(query).map((group) => group.category), ['refrigerator-water-filter'], query);
  }
});

test('食洗機タブレットと洗濯ジェルボールは用途・ブランド・個数違いを除外する', () => {
  const candidates = [
    { asin: 'FINISH60', product_name: 'Finish 食洗機用洗剤 タブレット 60個' },
    { asin: 'FINISH30', product_name: 'Finish 食洗機用洗剤 タブレット 30個' },
    { asin: 'CASCADE52', product_name: 'Cascade Platinum Plus dishwasher detergent pods 52 count' },
    { asin: 'CASCADE_BASIC', product_name: 'Cascade Complete dishwasher detergent pods 52 count' },
    { asin: 'TIDE42', product_name: 'Tide PODS 洗衣凝珠 42颗' },
    { asin: 'TIDE_DISH', product_name: 'Tide dishwasher detergent pods 42 count' },
    { asin: 'ARIEL92', product_name: '아리엘 젤볼 세탁세제 92개' },
    { asin: 'ARIEL_DISH', product_name: '아리엘 식기세척기 세제 캡슐 92개' },
    { asin: 'POWDER', product_name: 'Ariel 粉末洗濯洗剤 92回分' },
  ];
  const cases = [
    ['フィニッシュ オールインワン 食洗機用洗剤 タブレット 60個', ['FINISH60'], 'dishwasher-detergent-tablet'],
    ['Cascade Platinum Plus dishwasher detergent pods 52 count', ['CASCADE52'], 'dishwasher-detergent-tablet'],
    ['汰渍 Tide PODS 洗衣凝珠 42颗', ['TIDE42'], 'laundry-detergent-pod'],
    ['아리엘 젤볼 세탁세제 92개', ['ARIEL92'], 'laundry-detergent-pod'],
  ];
  for (const [query, expected, category] of cases) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), expected, query);
    assert.deepEqual(semanticSearchGroups(query).map((group) => group.category), [category], query);
  }
});

test('洗剤ポッドは香り・無香料・詰め替え・剤形が一致する候補だけを提示する', () => {
  const candidates = [
    { asin: 'FINISH_REFILL', product_name: 'Finish レモン 食洗機用洗剤タブレット 詰め替え 60個' },
    { asin: 'FINISH_BOX', product_name: 'Finish レモン 食洗機用洗剤タブレット ボックス 60個' },
    { asin: 'FINISH_LIQUID', product_name: 'Finish レモン 食洗機用 液体洗剤 詰め替え 60回分' },
    { asin: 'CASCADE_FREE', product_name: 'Cascade Platinum Plus fragrance-free dishwasher detergent pods 52 count' },
    { asin: 'CASCADE_LEMON', product_name: 'Cascade Platinum Plus lemon dishwasher detergent pods 52 count' },
    { asin: 'TIDE_LAVENDER_REFILL', product_name: 'Tide PODS 薰衣草洗衣凝珠补充装42颗' },
    { asin: 'TIDE_FREE_REFILL', product_name: 'Tide PODS 无香洗衣凝珠补充装42颗' },
    { asin: 'TIDE_POWDER', product_name: 'Tide 薰衣草洗衣粉补充装42次' },
    { asin: 'ARIEL_FREE', product_name: '아리엘 무향 젤볼 세탁세제 92개' },
    { asin: 'ARIEL_LAVENDER', product_name: '아리엘 라벤더 젤볼 세탁세제 92개' },
  ];
  const cases = [
    ['フィニッシュ レモン 食洗機用洗剤タブレット 詰め替え 60個', ['FINISH_REFILL']],
    ['Cascade Platinum Plus fragrance-free dishwasher detergent pods 52 count', ['CASCADE_FREE']],
    ['汰渍 Tide PODS 薰衣草洗衣凝珠补充装42颗', ['TIDE_LAVENDER_REFILL']],
    ['아리엘 무향 젤볼 세탁세제 92개', ['ARIEL_FREE']],
  ];
  for (const [query, expected] of cases) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), expected, query);
  }
});

test('洗剤ポッドは敏感肌・抗菌・すすぎ条件が明記された候補だけを提示する', () => {
  const candidates = [
    { asin: 'ARIEL_SENSITIVE', product_name: 'Ariel 敏感肌向け すすぎ1回 洗濯ジェルボール 40個' },
    { asin: 'ARIEL_NORMAL', product_name: 'Ariel すすぎ1回 洗濯ジェルボール 40個' },
    { asin: 'ARIEL_TWO_RINSE', product_name: 'Ariel 敏感肌向け すすぎ2回 洗濯ジェルボール 40個' },
    { asin: 'FINISH_ANTIBACTERIAL', product_name: 'Finish antibacterial dishwasher detergent tablets 60 count' },
    { asin: 'FINISH_NORMAL', product_name: 'Finish dishwasher detergent tablets 60 count' },
    { asin: 'TIDE_GENTLE', product_name: 'Tide PODS 温和洗衣凝珠 漂洗1次 42颗' },
    { asin: 'TIDE_NORMAL', product_name: 'Tide PODS 洗衣凝珠 漂洗1次 42颗' },
    { asin: 'ARIEL_ANTIBACTERIAL', product_name: '아리엘 항균 세탁 젤볼 헹굼 1회 92개' },
    { asin: 'ARIEL_NO_RINSE', product_name: '아리엘 항균 세탁 젤볼 92개' },
  ];
  const cases = [
    ['アリエール 敏感肌向け すすぎ1回 洗濯ジェルボール 40個', ['ARIEL_SENSITIVE']],
    ['Finish antibacterial dishwasher detergent tablets 60 count', ['FINISH_ANTIBACTERIAL']],
    ['汰渍 Tide PODS 温和洗衣凝珠 漂洗1次 42颗', ['TIDE_GENTLE']],
    ['아리엘 항균 세탁 젤볼 헹굼 1회 92개', ['ARIEL_ANTIBACTERIAL']],
  ];
  for (const [query, expected] of cases) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), expected, query);
  }
});

test('洗剤ポッドは赤ちゃん衣類・部屋干し・防臭・増白剤条件が一致する候補だけを提示する', () => {
  const candidates = [
    { asin: 'ARIEL_BABY_FREE', product_name: 'Ariel 赤ちゃん衣類対応 蛍光増白剤不使用 洗濯ジェルボール 40個' },
    { asin: 'ARIEL_BABY', product_name: 'Ariel 赤ちゃん衣類対応 洗濯ジェルボール 40個' },
    { asin: 'ARIEL_FREE', product_name: 'Ariel 蛍光増白剤不使用 洗濯ジェルボール 40個' },
    { asin: 'TIDE_INDOOR_ODOR', product_name: 'Tide PODS indoor drying odor control laundry detergent 42 count' },
    { asin: 'TIDE_INDOOR', product_name: 'Tide PODS indoor drying laundry detergent 42 count' },
    { asin: 'TIDE_ODOR', product_name: 'Tide PODS odor control laundry detergent 42 count' },
    { asin: 'TIDE_BABY_FREE', product_name: 'Tide PODS 婴儿衣物无荧光增白剂洗衣凝珠42颗' },
    { asin: 'TIDE_NORMAL', product_name: 'Tide PODS 洗衣凝珠42颗' },
    { asin: 'ARIEL_KO_INDOOR_ODOR', product_name: '아리엘 실내 건조 냄새 제거 세탁 젤볼 92개' },
    { asin: 'ARIEL_KO_INDOOR', product_name: '아리엘 실내 건조 세탁 젤볼 92개' },
  ];
  const cases = [
    ['アリエール 赤ちゃん衣類対応 蛍光増白剤不使用 洗濯ジェルボール 40個', ['ARIEL_BABY_FREE']],
    ['Tide PODS indoor drying odor control laundry detergent 42 count', ['TIDE_INDOOR_ODOR']],
    ['汰渍 Tide PODS 婴儿衣物无荧光增白剂洗衣凝珠42颗', ['TIDE_BABY_FREE']],
    ['아리엘 실내 건조 냄새 제거 세탁 젤볼 92개', ['ARIEL_KO_INDOOR_ODOR']],
  ];
  for (const [query, expected] of cases) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), expected, query);
  }
});

test('洗剤ポッドは洗濯機タイプ・素材・柔軟剤条件が一致する候補だけを提示する', () => {
  const candidates = [
    { asin: 'ARIEL_FRONT_FREE', product_name: 'Ariel ドラム式対応 柔軟剤不使用 洗濯ジェルボール 40個' },
    { asin: 'ARIEL_TOP_FREE', product_name: 'Ariel 縦型対応 柔軟剤不使用 洗濯ジェルボール 40個' },
    { asin: 'ARIEL_FRONT_SOFT', product_name: 'Ariel ドラム式対応 柔軟剤入り 洗濯ジェルボール 40個' },
    { asin: 'TIDE_TOP_SOFT', product_name: 'Tide PODS top-load with fabric softener laundry detergent 42 count' },
    { asin: 'TIDE_FRONT_SOFT', product_name: 'Tide PODS front-load with fabric softener laundry detergent 42 count' },
    { asin: 'TIDE_FRONT_FREE', product_name: 'Tide PODS 滚筒洗衣机适用不含柔顺剂洗衣凝珠42颗' },
    { asin: 'TIDE_FRONT_INCLUDED', product_name: 'Tide PODS 滚筒洗衣机适用含柔顺剂洗衣凝珠42颗' },
    { asin: 'ARIEL_WOOL_FREE', product_name: '아리엘 울 의류용 유연제 무첨가 세탁 젤볼 92개' },
    { asin: 'ARIEL_COTTON_FREE', product_name: '아리엘 면 의류용 유연제 무첨가 세탁 젤볼 92개' },
  ];
  const cases = [
    ['アリエール ドラム式対応 柔軟剤不使用 洗濯ジェルボール 40個', ['ARIEL_FRONT_FREE']],
    ['Tide PODS top-load with fabric softener laundry detergent 42 count', ['TIDE_TOP_SOFT']],
    ['汰渍 Tide PODS 滚筒洗衣机适用不含柔顺剂洗衣凝珠42颗', ['TIDE_FRONT_FREE']],
    ['아리엘 울 의류용 유연제 무첨가 세탁 젤볼 92개', ['ARIEL_WOOL_FREE']],
  ];
  for (const [query, expected] of cases) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), expected, query);
  }
});

test('プリンターインクは本体・別型番・別品番・純正互換・色数違いを除外する', () => {
  const candidates = [
    { asin: 'CANON', product_name: 'Canon PIXUS TS8730 純正インク BCI-331+330 6色セット' },
    { asin: 'CANON_COMPAT', product_name: 'Canon PIXUS TS8730 互換インク BCI-331+330 6色セット' },
    { asin: 'CANON_BODY', product_name: 'Canon PIXUS TS8730 プリンター本体 BCI-331インク付属' },
    { asin: 'EPSON', product_name: 'Epson EP-881A compatible ink cartridges KAM-6CL-L 6 colors' },
    { asin: 'EPSON_4', product_name: 'Epson EP-881A compatible ink cartridges KAM-6CL-L 4 colors' },
    { asin: 'BROTHER', product_name: 'Brother DCP-J928N LC411-4PK original ink cartridges' },
    { asin: 'BROTHER_WRONG', product_name: 'Brother DCP-J926N LC411-4PK original ink cartridges' },
    { asin: 'HP', product_name: 'HP DeskJet 2720 67XL 정품 잉크 검정 컬러' },
    { asin: 'HP_WRONG', product_name: 'HP DeskJet 2720 65XL 정품 잉크 검정 컬러' },
  ];
  const cases = [
    ['Canon PIXUS TS8730用 純正インク BCI-331+330 6色', ['CANON']],
    ['compatible ink cartridges for Epson EP-881A KAM-6CL-L 6 color', ['EPSON']],
    ['适用于Brother DCP-J928N的LC411-4PK原装墨盒', ['BROTHER']],
    ['HP DeskJet 2720 67XL 정품 잉크 검정 컬러', ['HP']],
  ];
  for (const [query, expected] of cases) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), expected, query);
    assert.deepEqual(
      semanticSearchGroups(query).map((group) => group.category).filter((category) => category !== 'color'),
      ['printer-ink'],
      query
    );
  }
});

test('電動歯ブラシ替えブラシはシリーズ・種類・硬さ・本数違いと本体を除外する', () => {
  const candidates = [
    { asin: 'IO', product_name: 'Oral-B iO対応 Ultimate Clean 替えブラシ 4本' },
    { asin: 'IO_WRONG', product_name: 'Oral-B iO対応 Gentle Care 替えブラシ 4本' },
    { asin: 'IO_BODY', product_name: 'Oral-B iO Series 6 電動歯ブラシ 本体 替えブラシ付属' },
    { asin: 'SONICARE', product_name: 'Philips Sonicare HX9911 C3 Premium Plaque Control replacement brush heads 4 pack' },
    { asin: 'SONICARE_2', product_name: 'Philips Sonicare HX9911 C3 Premium Plaque Control replacement brush heads 2 pack' },
    { asin: 'DOLTZ', product_name: 'Panasonic Doltz EW-DP57対応 WEW0917 替えブラシ 2本' },
    { asin: 'DOLTZ_WRONG', product_name: 'Panasonic Doltz EW-DP57対応 WEW0915 替えブラシ 2本' },
    { asin: 'PRO', product_name: 'Oral-B Pro対応 CrossAction 부드러운 교체 칫솔모 4개' },
    { asin: 'PRO_HARD', product_name: 'Oral-B Pro対応 CrossAction 교체 칫솔모 4개' },
  ];
  const cases = [
    ['Oral-B iO Series 6用 アルティメイトクリーン 替えブラシ 4本', ['IO']],
    ['replacement brush heads for Philips Sonicare HX9911 C3 Premium Plaque Control 4 pack', ['SONICARE']],
    ['适用于松下Doltz EW-DP57的WEW0917替换刷头2支', ['DOLTZ']],
    ['오랄비 Pro 3용 크로스액션 부드러운 교체 칫솔모 4개', ['PRO']],
  ];
  for (const [query, expected] of cases) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), expected, query);
    assert.deepEqual(semanticSearchGroups(query).map((group) => group.category), ['electric-toothbrush-head'], query);
  }
});

test('シェーバー交換品は本体・別シリーズ・別品番・刃数個数違いを除外する', () => {
  const candidates = [
    { asin: 'BRAUN', product_name: 'Braun Series 9 94M 交換用 替刃' },
    { asin: 'BRAUN_WRONG', product_name: 'Braun Series 8 94M 交換用 替刃' },
    { asin: 'BRAUN_BODY', product_name: 'Braun Series 9 Pro シェーバー本体 94M付属' },
    { asin: 'PHILIPS', product_name: 'Philips S9000 SH91/51 replacement shaving heads' },
    { asin: 'PHILIPS_WRONG', product_name: 'Philips S9000 SH90/51 replacement shaving heads' },
    { asin: 'PANASONIC', product_name: 'Panasonic Lamdash ES-LV9W WES9600 替刃 5枚刃' },
    { asin: 'PANASONIC_3', product_name: 'Panasonic Lamdash ES-LV9W WES9600 替刃 3枚刃' },
    { asin: 'CLEAN6', product_name: 'Braun Clean & Renew CCR6 세정액 카트리지 6개' },
    { asin: 'CLEAN3', product_name: 'Braun Clean & Renew CCR6 세정액 카트리지 3개' },
  ];
  const cases = [
    ['Braun Series 9 Pro用 替刃 94M', ['BRAUN'], 'shaver-replacement-blade'],
    ['replacement shaving heads SH91/51 for Philips S9000', ['PHILIPS'], 'shaver-replacement-blade'],
    ['适用于松下Lamdash ES-LV9W的WES9600替换刀头 5枚刃', ['PANASONIC'], 'shaver-replacement-blade'],
    ['브라운 Clean & Renew CCR6 세정액 카트리지 6개', ['CLEAN6'], 'shaver-cleaning-cartridge'],
  ];
  for (const [query, expected, category] of cases) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), expected, query);
    assert.deepEqual(semanticSearchGroups(query).map((group) => group.category), [category], query);
  }
});

test('コーヒーカプセルは本体・別規格・再利用品・個数違いを除外する', () => {
  const candidates = [
    { asin: 'ORIGINAL50', product_name: 'Nespresso Original coffee capsules 50 pods' },
    { asin: 'ORIGINAL30', product_name: 'Nespresso Original coffee capsules 30 pods' },
    { asin: 'VERTUO30', product_name: 'Nespresso Vertuo coffee capsules 30 pods' },
    { asin: 'VERTUO_MACHINE', product_name: 'Nespresso Vertuo coffee machine 本体 30 capsules trial set' },
    { asin: 'VERTUO_REUSE', product_name: 'Nespresso Vertuo reusable refillable coffee capsule 30 uses' },
    { asin: 'DOLCE16', product_name: 'Nescafe Dolce Gusto 咖啡胶囊 16粒' },
    { asin: 'DOLCE48', product_name: 'Nescafe Dolce Gusto 咖啡胶囊 48粒' },
  ];
  const cases = [
    ['ネスプレッソ オリジナル コーヒーカプセル 50個', ['ORIGINAL50']],
    ['Nespresso Vertuo coffee capsules 30 pods', ['VERTUO30']],
    ['雀巢 Dolce Gusto 咖啡胶囊 16粒', ['DOLCE16']],
    ['네스프레소 오리지널 커피 캡슐 50개', ['ORIGINAL50']],
  ];
  for (const [query, expected] of cases) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), expected, query);
    assert.deepEqual(semanticSearchGroups(query).map((group) => group.category), ['coffee-capsule'], query);
  }
});

test('カメラ交換バッテリーは本体・充電器・別型番・純正条件・個数違いを除外する', () => {
  const candidates = [
    { asin: 'FZ2', product_name: 'Sony 純正 カメラバッテリー NP-FZ100 2個' },
    { asin: 'FZ1', product_name: 'Sony 純正 カメラバッテリー NP-FZ100 1個' },
    { asin: 'FZ_COMPAT', product_name: 'Sony NP-FZ100 互換 カメラバッテリー 2個' },
    { asin: 'FW2', product_name: 'Sony NP-FW50 camera replacement battery 2 pack' },
    { asin: 'FW_CHARGER', product_name: 'Sony NP-FW50 camera battery charger 2 slot' },
    { asin: 'CANON', product_name: 'Canon 原装相机电池 LP-E6NH 1块' },
    { asin: 'CANON_BODY', product_name: 'Canon EOS R6 Mark II 相机机身 LP-E6NH 1块套装' },
    { asin: 'NIKON', product_name: 'Nikon EN-EL15C 정품 카메라 배터리 2개' },
    { asin: 'NIKON_WRONG', product_name: 'Nikon EN-EL15B 정품 카메라 배터리 2개' },
  ];
  const cases = [
    ['Sony α7 IV用 純正カメラバッテリー NP-FZ100 2個', ['FZ2']],
    ['replacement camera battery NP-FW50 for Sony a6400 2 pack', ['FW2']],
    ['佳能 EOS R6 Mark II 原装相机电池 LP-E6NH 1块', ['CANON']],
    ['니콘 Z6 II 정품 카메라 배터리 EN-EL15c 2개', ['NIKON']],
  ];
  for (const [query, expected] of cases) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), expected, query);
    assert.deepEqual(semanticSearchGroups(query).map((group) => group.category), ['camera-battery'], query);
  }
});

test('電動工具バッテリーは本体・充電器・別型番・電圧容量個数違いを除外する', () => {
  const candidates = [
    { asin: 'MAKITA', product_name: 'Makita BL1860B 純正 電動工具バッテリー 18V 6.0Ah 2個' },
    { asin: 'MAKITA_ONE', product_name: 'Makita BL1860B 純正 電動工具バッテリー 18V 6.0Ah 1個' },
    { asin: 'MAKITA_COMPAT', product_name: 'Makita BL1860B 互換 電動工具バッテリー 18V 6.0Ah 2個' },
    { asin: 'DEWALT', product_name: 'DeWalt DCB184 18V 5Ah replacement power tool battery 2 pack' },
    { asin: 'DEWALT_4AH', product_name: 'DeWalt DCB184 18V 4Ah replacement power tool battery 2 pack' },
    { asin: 'BOSCH', product_name: 'Bosch GBA 18V 5.0Ah 原装电动工具电池 1块' },
    { asin: 'BOSCH_CHARGER', product_name: 'Bosch GBA 18V 5.0Ah 电池充电器 1块' },
    { asin: 'MILWAUKEE', product_name: 'Milwaukee M18 B5 18V 5.0Ah 정품 공구 배터리 2개' },
    { asin: 'MILWAUKEE_BODY', product_name: 'Milwaukee M18 B5 18V 5.0Ah 전동 공구 본체 키트 2개' },
  ];
  const cases = [
    ['マキタ 純正 18V 6.0Ah 電動工具バッテリー BL1860B 2個', ['MAKITA']],
    ['DeWalt DCB184 18V 5Ah replacement power tool battery 2 pack', ['DEWALT']],
    ['博世 GBA 18V 5.0Ah 原装电动工具电池 1块', ['BOSCH']],
    ['밀워키 M18 B5 18V 5.0Ah 정품 공구 배터리 2개', ['MILWAUKEE']],
  ];
  for (const [query, expected] of cases) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), expected, query);
    assert.deepEqual(semanticSearchGroups(query).map((group) => group.category), ['tool-battery'], query);
  }
});

test('ラベルテープは本体・別品番・幅個数違い・互換品を除外する', () => {
  const candidates = [
    { asin: 'BROTHER', product_name: 'Brother P-touch TZe-231 純正 ラベルテープ 12mm 黒文字 白 2個' },
    { asin: 'BROTHER_ONE', product_name: 'Brother P-touch TZe-231 純正 ラベルテープ 12mm 黒文字 白 1個' },
    { asin: 'BROTHER_COMPAT', product_name: 'Brother P-touch TZe-231 互換 ラベルテープ 12mm 黒文字 白 2個' },
    { asin: 'BROTHER_RED', product_name: 'Brother P-touch TZe-232 純正 ラベルテープ 12mm 赤文字 白 2個' },
    { asin: 'DYMO', product_name: 'DYMO D1 45013 12mm black on white genuine label tape 2 pack' },
    { asin: 'DYMO_9', product_name: 'DYMO D1 45013 9mm black on white genuine label tape 2 pack' },
    { asin: 'CASIO', product_name: 'CASIO XR-12WE 12毫米 黑字白底 原装标签带 2盒' },
    { asin: 'CASIO_BODY', product_name: 'CASIO 标签打印机 本体 XR-12WE 12毫米 2盒套装' },
    { asin: 'TEPRA', product_name: 'King Jim Tepra SS12K 12mm 검정 글씨 흰색 정품 라벨 테이프 2개' },
    { asin: 'TEPRA_WRONG', product_name: 'King Jim Tepra SS18K 18mm 검정 글씨 흰색 정품 라벨 테이프 2개' },
  ];
  const cases = [
    ['ブラザー P-touch 純正ラベルテープ TZe-231 12mm 黒文字 白 2個', ['BROTHER']],
    ['DYMO D1 45013 12mm black on white genuine label tape 2 pack', ['DYMO']],
    ['卡西欧 XR-12WE 12毫米 黑字白底 原装标签带 2盒', ['CASIO']],
    ['킹짐 Tepra SS12K 12mm 검정 글씨 흰색 정품 라벨 테이프 2개', ['TEPRA']],
  ];
  for (const [query, expected] of cases) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), expected, query);
    assert.deepEqual(semanticSearchGroups(query).map((group) => group.category), ['label-tape'], query);
  }
});

test('エアフライヤーライナーは本体・別機種・容量素材形状枚数違いを除外する', () => {
  const candidates = [
    { asin: 'PHILIPS', product_name: 'Philips NA230 6.2L 紙 エアフライヤーライナー 丸型 100枚' },
    { asin: 'PHILIPS50', product_name: 'Philips NA230 6.2L 紙 エアフライヤーライナー 丸型 50枚' },
    { asin: 'PHILIPS_SILICONE', product_name: 'Philips NA230 6.2L シリコン エアフライヤーライナー 丸型 100枚' },
    { asin: 'NINJA', product_name: 'Ninja AF400 9.5L dual basket paper air fryer liners 100 pack' },
    { asin: 'NINJA_SINGLE', product_name: 'Ninja AF400 9.5L single basket paper air fryer liners 100 pack' },
    { asin: 'COSORI', product_name: 'Cosori CP158 5.5L 方形空气炸锅纸垫 100张' },
    { asin: 'COSORI_ROUND', product_name: 'Cosori CP158 5.5L 圆形空气炸锅纸垫 100张' },
    { asin: 'INSTANT', product_name: 'Instant Vortex 5.7L 원형 실리콘 에어프라이어 라이너 2개' },
    { asin: 'INSTANT_PAPER', product_name: 'Instant Vortex 5.7L 원형 종이 에어프라이어 라이너 2개' },
    { asin: 'BODY', product_name: 'Instant Vortex 5.7L 에어프라이어 본체 실리콘 라이너 2개 포함' },
  ];
  const cases = [
    ['Philips NA230用 6.2L 紙 エアフライヤーライナー 丸型 100枚', ['PHILIPS']],
    ['Ninja AF400 9.5L dual basket paper air fryer liners 100 pack', ['NINJA']],
    ['科西 Cosori CP158 5.5L 方形空气炸锅纸垫 100张', ['COSORI']],
    ['인스턴트 볼텍스 5.7L 원형 실리콘 에어프라이어 라이너 2개', ['INSTANT']],
  ];
  for (const [query, expected] of cases) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), expected, query);
    assert.deepEqual(semanticSearchGroups(query).map((group) => group.category), ['air-fryer-liner'], query);
  }
});

test('掃除機紙パックは本体・フィルター・別規格品番・枚数違い・互換品を除外する', () => {
  const candidates = [
    { asin: 'FJM', product_name: 'Miele HyClean Pure FJM 純正 掃除機紙パック 4枚' },
    { asin: 'FJM2', product_name: 'Miele HyClean Pure FJM 純正 掃除機紙パック 2枚' },
    { asin: 'FJM_COMPAT', product_name: 'Miele HyClean Pure FJM 互換 掃除機紙パック 4枚' },
    { asin: 'GN', product_name: 'Miele HyClean Pure GN vacuum dust bags 4 pack' },
    { asin: 'GN_FILTER', product_name: 'Miele HyClean Pure GN vacuum filter 4 pack' },
    { asin: 'PHILIPS', product_name: 'Philips s-bag FC8021/03 原装吸尘器集尘袋 4个' },
    { asin: 'PHILIPS_WRONG', product_name: 'Philips s-bag FC8022/04 原装吸尘器集尘袋 4个' },
    { asin: 'BOSCH', product_name: 'Bosch Type G ALL BBZ41FGALL 정품 진공청소기 먼지봉투 4개' },
    { asin: 'BOSCH_BODY', product_name: 'Bosch Type G ALL BBZ41FGALL 진공청소기 본체 먼지봉투 4개 포함' },
  ];
  const cases = [
    ['ミーレ HyClean Pure FJM 純正 掃除機紙パック 4枚', ['FJM']],
    ['Miele HyClean Pure GN vacuum dust bags 4 pack', ['GN']],
    ['飞利浦 s-bag FC8021/03 原装吸尘器集尘袋 4个', ['PHILIPS']],
    ['보쉬 Type G ALL BBZ41FGALL 정품 진공청소기 먼지봉투 4개', ['BOSCH']],
  ];
  for (const [query, expected] of cases) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((item) => item.asin), expected, query);
    assert.deepEqual(semanticSearchGroups(query).map((group) => group.category), ['vacuum-dust-bag'], query);
  }
});

test('power-bank PD output corrections discard the negated output in four languages', () => {
  const queries = [
    'PD30WじゃなくPD20Wの10000mAhモバイルバッテリー',
    'not PD30W, I want a PD20W 10000mAh power bank',
    '不要PD30W，要PD20W的10000mAh充电宝',
    'PD30W 말고 PD20W 10000mAh 보조배터리',
  ];
  const candidates = [
    { asin: 'POWERPD20', product_name: '10000mAh Power Bank USB-C PD20W' },
    { asin: 'POWERPD30', product_name: '10000mAh Power Bank USB-C PD30W' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['POWERPD20'], query);
  }
});

test('power-bank built-in connector corrections discard the negated connector in four languages', () => {
  const queries = [
    'USB-CじゃなくLightningケーブル内蔵10000mAhモバイルバッテリー',
    'not USB-C, I want a 10000mAh power bank with a built-in Lightning cable',
    '不要USB-C，要自带Lightning线的10000mAh充电宝',
    'USB-C 말고 Lightning 케이블 내장 10000mAh 보조배터리',
  ];
  const candidates = [
    { asin: 'POWERLIGHTNING', product_name: '10000mAh Power Bank Built-in Lightning Cable' },
    { asin: 'POWERUSBC', product_name: '10000mAh Power Bank Built-in USB-C Cable' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['POWERLIGHTNING'], query);
  }
});

test('negated MagSafe requirements exclude magnetic power banks in four languages', () => {
  const queries = [
    'MagSafeじゃなく普通の10000mAhモバイルバッテリー',
    'not MagSafe, I want a regular 10000mAh power bank',
    '不要MagSafe，要普通的10000mAh充电宝',
    'MagSafe 말고 일반 10000mAh 보조배터리',
  ];
  const candidates = [
    { asin: 'POWERREGULAR', product_name: '10000mAh Power Bank USB-C' },
    { asin: 'POWERMAGSAFE', product_name: '10000mAh MagSafe Magnetic Power Bank' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['POWERREGULAR'], query);
  }
});

test('negated built-in cable requirements exclude integrated-cable power banks in four languages', () => {
  const queries = [
    'ケーブル内蔵じゃない10000mAhモバイルバッテリー',
    'a 10000mAh power bank without a built-in cable',
    '不要自带线的10000mAh充电宝',
    '케이블 내장 말고 일반 10000mAh 보조배터리',
  ];
  const candidates = [
    { asin: 'POWERPLAIN', product_name: '10000mAh Power Bank USB-C' },
    { asin: 'POWERBUILTIN', product_name: '10000mAh Power Bank Built-in USB-C Cable' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['POWERPLAIN'], query);
  }
});

test('negated PD output requirements exclude only that output in four languages', () => {
  const queries = [
    'PD20Wじゃない10000mAhモバイルバッテリー',
    'a 10000mAh power bank without PD20W',
    '不要PD20W的10000mAh充电宝',
    'PD20W 아닌 10000mAh 보조배터리',
  ];
  const candidates = [
    { asin: 'POWERNOPD', product_name: '10000mAh Power Bank USB-C' },
    { asin: 'POWERPD20', product_name: '10000mAh Power Bank USB-C PD20W' },
    { asin: 'POWERPD30', product_name: '10000mAh Power Bank USB-C PD30W' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['POWERNOPD', 'POWERPD30'], query);
  }
});

test('negated capacity requirements exclude only that capacity in four languages', () => {
  const queries = [
    '10000mAhじゃないモバイルバッテリー',
    'a power bank that is not 10000mAh',
    '不要10000mAh的充电宝',
    '10000mAh 아닌 보조배터리',
  ];
  const candidates = [
    { asin: 'POWER5000', product_name: '5000mAh Power Bank USB-C' },
    { asin: 'POWER10000', product_name: '10000mAh Power Bank USB-C' },
    { asin: 'POWER20000', product_name: '20000mAh Power Bank USB-C' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['POWER5000', 'POWER20000'], query);
  }
});

test('minimum power-bank capacity accepts the boundary and larger capacities in four languages', () => {
  const queries = [
    '10000mAh以上のモバイルバッテリー',
    'a power bank with at least 10000mAh',
    '至少10000mAh的充电宝',
    '10000mAh 이상 보조배터리',
  ];
  const candidates = [
    { asin: 'POWER5000', product_name: '5000mAh Power Bank USB-C' },
    { asin: 'POWER10000', product_name: '10000mAh Power Bank USB-C' },
    { asin: 'POWER20000', product_name: '20000mAh Power Bank USB-C' },
    { asin: 'POWERUNKNOWN', product_name: 'Power Bank USB-C' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['POWER10000', 'POWER20000'], query);
  }
});

test('maximum power-bank capacity accepts the boundary and smaller capacities in four languages', () => {
  const queries = [
    '10000mAh以下のモバイルバッテリー',
    'a power bank with at most 10000mAh',
    '不超过10000mAh的充电宝',
    '10000mAh 이하 보조배터리',
  ];
  const candidates = [
    { asin: 'POWER5000', product_name: '5000mAh Power Bank USB-C' },
    { asin: 'POWER10000', product_name: '10000mAh Power Bank USB-C' },
    { asin: 'POWER20000', product_name: '20000mAh Power Bank USB-C' },
    { asin: 'POWERUNKNOWN', product_name: 'Power Bank USB-C' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['POWER5000', 'POWER10000'], query);
  }
});

test('power-bank capacity ranges accept both boundaries and intermediate values in four languages', () => {
  const queries = [
    '5000mAhから10000mAhのモバイルバッテリー',
    'a power bank between 5000mAh and 10000mAh',
    '5000mAh到10000mAh的充电宝',
    '5000mAh에서 10000mAh 보조배터리',
  ];
  const candidates = [
    { asin: 'POWER3000', product_name: '3000mAh Power Bank USB-C' },
    { asin: 'POWER5000', product_name: '5000mAh Power Bank USB-C' },
    { asin: 'POWER7500', product_name: '7500mAh Power Bank USB-C' },
    { asin: 'POWER10000', product_name: '10000mAh Power Bank USB-C' },
    { asin: 'POWER20000', product_name: '20000mAh Power Bank USB-C' },
    { asin: 'POWERUNKNOWN', product_name: 'Power Bank USB-C' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['POWER5000', 'POWER7500', 'POWER10000'], query);
  }
});

test('compound power-bank requirements reject each mismatching dimension in four languages', () => {
  const queries = [
    '5000mAhから10000mAhでPD20W、Lightningケーブル内蔵、MagSafeじゃないモバイルバッテリー',
    'a power bank between 5000mAh and 10000mAh with PD20W and a built-in Lightning cable, not MagSafe',
    '5000mAh到10000mAh、PD20W、自带Lightning线、不要MagSafe的充电宝',
    '5000mAh에서 10000mAh, PD20W, Lightning 케이블 내장, MagSafe 아닌 보조배터리',
  ];
  const candidates = [
    { asin: 'MATCH', product_name: '7500mAh Power Bank Built-in Lightning Cable PD20W' },
    { asin: 'TOOLOW', product_name: '3000mAh Power Bank Built-in Lightning Cable PD20W' },
    { asin: 'TOOHIGH', product_name: '20000mAh Power Bank Built-in Lightning Cable PD20W' },
    { asin: 'WRONGOUTPUT', product_name: '7500mAh Power Bank Built-in Lightning Cable PD30W' },
    { asin: 'WRONGCONNECTOR', product_name: '7500mAh Power Bank Built-in USB-C Cable PD20W' },
    { asin: 'MAGNETIC', product_name: '7500mAh MagSafe Power Bank Built-in Lightning Cable PD20W' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['MATCH'], query);
  }
});

test('spoken power-bank ranges apply the omitted first capacity unit to candidate filtering', () => {
  const queries = [
    '5000から10000mAhのモバイルバッテリー',
    'a power bank between 5000 and 10000mAh',
    '5000到10000mAh的充电宝',
    '5000에서 10000mAh 보조배터리',
  ];
  const candidates = [
    { asin: 'POWER3000', product_name: '3000mAh Power Bank USB-C' },
    { asin: 'POWER5000', product_name: '5000mAh Power Bank USB-C' },
    { asin: 'POWER7500', product_name: '7500mAh Power Bank USB-C' },
    { asin: 'POWER10000', product_name: '10000mAh Power Bank USB-C' },
    { asin: 'POWER20000', product_name: '20000mAh Power Bank USB-C' },
    { asin: 'POWERUNKNOWN', product_name: 'Power Bank USB-C' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['POWER5000', 'POWER7500', 'POWER10000'], query);
  }
});

test('separate power-bank lower and upper bounds filter candidates together in four languages', () => {
  const queries = [
    '5000mAh以上、10000mAh以下のモバイルバッテリー',
    'a power bank with at least 5000mAh and at most 10000mAh',
    '至少5000mAh且不超过10000mAh的充电宝',
    '5000mAh 이상 10000mAh 이하 보조배터리',
  ];
  const candidates = [
    { asin: 'POWER3000', product_name: '3000mAh Power Bank USB-C' },
    { asin: 'POWER5000', product_name: '5000mAh Power Bank USB-C' },
    { asin: 'POWER7500', product_name: '7500mAh Power Bank USB-C' },
    { asin: 'POWER10000', product_name: '10000mAh Power Bank USB-C' },
    { asin: 'POWER20000', product_name: '20000mAh Power Bank USB-C' },
    { asin: 'POWERUNKNOWN', product_name: 'Power Bank USB-C' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['POWER5000', 'POWER7500', 'POWER10000'], query);
  }
});

test('contradictory power-bank bounds return no misleading candidates in four languages', () => {
  const queries = [
    '10000mAh以上、5000mAh以下のモバイルバッテリー',
    'a power bank with at least 10000mAh and at most 5000mAh',
    '至少10000mAh且不超过5000mAh的充电宝',
    '10000mAh 이상 5000mAh 이하 보조배터리',
  ];
  const candidates = [
    { asin: 'POWER3000', product_name: '3000mAh Power Bank USB-C' },
    { asin: 'POWER5000', product_name: '5000mAh Power Bank USB-C' },
    { asin: 'POWER7500', product_name: '7500mAh Power Bank USB-C' },
    { asin: 'POWER10000', product_name: '10000mAh Power Bank USB-C' },
    { asin: 'POWER20000', product_name: '20000mAh Power Bank USB-C' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates), [], query);
  }
});

test('minimum power-bank PD output accepts the boundary and higher output in four languages', () => {
  const queries = [
    'PD20W以上の10000mAhモバイルバッテリー',
    'a 10000mAh power bank with at least 20W PD',
    '至少PD20W的10000mAh充电宝',
    'PD20W 이상 10000mAh 보조배터리',
  ];
  const candidates = [
    { asin: 'NOPD', product_name: '10000mAh Power Bank USB-C' },
    { asin: 'PD18', product_name: '10000mAh Power Bank USB-C PD18W' },
    { asin: 'PD20', product_name: '10000mAh Power Bank USB-C PD20W' },
    { asin: 'PD30', product_name: '10000mAh Power Bank USB-C PD30W' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['PD20', 'PD30'], query);
  }
});

test('maximum power-bank PD output accepts the boundary and lower declared output in four languages', () => {
  const queries = [
    'PD20W以下の10000mAhモバイルバッテリー',
    'a 10000mAh power bank with at most 20W PD',
    '不超过PD20W的10000mAh充电宝',
    'PD20W 이하 10000mAh 보조배터리',
  ];
  const candidates = [
    { asin: 'NOPD', product_name: '10000mAh Power Bank USB-C' },
    { asin: 'PD18', product_name: '10000mAh Power Bank USB-C PD18W' },
    { asin: 'PD20', product_name: '10000mAh Power Bank USB-C PD20W' },
    { asin: 'PD30', product_name: '10000mAh Power Bank USB-C PD30W' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['PD18', 'PD20'], query);
  }
});

test('power-bank PD output ranges accept boundaries and intermediate output in four languages', () => {
  const queries = [
    'PD20Wから30Wの10000mAhモバイルバッテリー',
    'a 10000mAh power bank between 20W and 30W PD',
    'PD20W到30W的10000mAh充电宝',
    'PD20W에서 30W 10000mAh 보조배터리',
  ];
  const candidates = [
    { asin: 'NOPD', product_name: '10000mAh Power Bank USB-C' },
    { asin: 'PD18', product_name: '10000mAh Power Bank USB-C PD18W' },
    { asin: 'PD20', product_name: '10000mAh Power Bank USB-C PD20W' },
    { asin: 'PD25', product_name: '10000mAh Power Bank USB-C PD25W' },
    { asin: 'PD30', product_name: '10000mAh Power Bank USB-C PD30W' },
    { asin: 'PD45', product_name: '10000mAh Power Bank USB-C PD45W' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['PD20', 'PD25', 'PD30'], query);
  }
});

test('separate power-bank PD output bounds filter candidates together in four languages', () => {
  const queries = [
    'PD20W以上、PD30W以下の10000mAhモバイルバッテリー',
    'a 10000mAh power bank with at least 20W PD and at most 30W PD',
    '至少PD20W且不超过PD30W的10000mAh充电宝',
    'PD20W 이상 PD30W 이하 10000mAh 보조배터리',
  ];
  const candidates = [
    { asin: 'NOPD', product_name: '10000mAh Power Bank USB-C' },
    { asin: 'PD18', product_name: '10000mAh Power Bank USB-C PD18W' },
    { asin: 'PD20', product_name: '10000mAh Power Bank USB-C PD20W' },
    { asin: 'PD25', product_name: '10000mAh Power Bank USB-C PD25W' },
    { asin: 'PD30', product_name: '10000mAh Power Bank USB-C PD30W' },
    { asin: 'PD45', product_name: '10000mAh Power Bank USB-C PD45W' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin),
      ['PD20', 'PD25', 'PD30'], query);
  }
});

test('contradictory power-bank PD output bounds return no misleading candidates in four languages', () => {
  const queries = [
    'PD30W以上、PD20W以下の10000mAhモバイルバッテリー',
    'a 10000mAh power bank with at least 30W PD and at most 20W PD',
    '至少PD30W且不超过PD20W的10000mAh充电宝',
    'PD30W 이상 PD20W 이하 10000mAh 보조배터리',
  ];
  const candidates = [
    { asin: 'PD18', product_name: '10000mAh Power Bank USB-C PD18W' },
    { asin: 'PD20', product_name: '10000mAh Power Bank USB-C PD20W' },
    { asin: 'PD30', product_name: '10000mAh Power Bank USB-C PD30W' },
    { asin: 'PD45', product_name: '10000mAh Power Bank USB-C PD45W' },
  ];
  for (const query of queries) {
    assert.deepEqual(filterCategoryMismatches(query, candidates), [], query);
  }
});

test('smartwatch band results require the requested model, case size, and material in four languages', () => {
  const cases = [
    {
      queries: [
        'Apple Watch Ultra 2用49mmのチタンバンド',
        'a 49mm titanium band for Apple Watch Ultra 2',
        'Apple Watch Ultra 2 49mm 钛金属表带',
        'Apple Watch Ultra 2 49mm 티타늄 스트랩',
      ],
      candidates: [
        { asin: 'MATCH', product_name: 'Apple Watch Ultra 2 49mm Titanium Band' },
        { asin: 'WRONGMODEL', product_name: 'Apple Watch Ultra 49mm Titanium Band' },
        { asin: 'WRONGSIZE', product_name: 'Apple Watch Ultra 2 45mm Titanium Band' },
        { asin: 'WRONGMATERIAL', product_name: 'Apple Watch Ultra 2 49mm Silicone Band' },
        { asin: 'WATCH', product_name: 'Apple Watch Ultra 2 49mm Titanium Case Smartwatch' },
        { asin: 'CHARGER', product_name: 'Apple Watch Ultra 2 Magnetic Charger' },
      ],
    },
    {
      queries: [
        'Galaxy Watch6 Classic用47mmのステンレスベルト',
        'a 47mm stainless steel strap for Galaxy Watch6 Classic',
        'Galaxy Watch6 Classic 47mm 不锈钢表带',
        'Galaxy Watch6 Classic 47mm 스테인리스 스트랩',
      ],
      candidates: [
        { asin: 'MATCH', product_name: 'Galaxy Watch6 Classic 47mm Stainless Steel Strap' },
        { asin: 'WRONGMODEL', product_name: 'Galaxy Watch6 47mm Stainless Steel Strap' },
        { asin: 'WRONGSIZE', product_name: 'Galaxy Watch6 Classic 43mm Stainless Steel Strap' },
        { asin: 'WRONGMATERIAL', product_name: 'Galaxy Watch6 Classic 47mm Leather Strap' },
        { asin: 'WATCH', product_name: 'Galaxy Watch6 Classic 47mm Stainless Steel Smartwatch' },
        { asin: 'CHARGER', product_name: 'Galaxy Watch6 Classic Fast Charger' },
      ],
    },
  ];
  for (const { queries, candidates } of cases) {
    for (const query of queries) {
      assert.deepEqual(filterCategoryMismatches(query, candidates).map((candidate) => candidate.asin), ['MATCH'], query);
    }
  }
});
