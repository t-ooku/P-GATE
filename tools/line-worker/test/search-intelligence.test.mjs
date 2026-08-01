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
  assert.match(adapter, /"adapter"\*|"usb"\*/);
  assert.doesNotMatch(adapter, /"laptop"\*|"compact"\*|"ports"\*/);
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

test('スマホケースは初回から対応機種と光り方を提案する', async () => {
  const result = await applyIndexedSearchPolicy(
    { query_id: 'phone-case-q', candidates: [] },
    { PRODUCT_DB: emptyDb() },
    'TikTokで見た光るスマホケース',
    'JA'
  );
  assert.match(result.clarification.question, /対応機種.*光り方/);
  assert.deepEqual(result.clarification.options.slice(0, 4).map((item) => item.label), [
    'LEDで光るケース', '通知で光るケース', '背面が光るケース', '蓄光タイプ'
  ]);
  assert.doesNotMatch(result.clarification.options.map((item) => item.label).join(' '), /キッチン/);
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
