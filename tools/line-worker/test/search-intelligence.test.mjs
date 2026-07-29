import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSearchDecision, semanticSearchGroups } from '../src/search-intelligence.mjs';
import {
  intelligentFtsQuery, relaxedFtsQuery, searchProductsAcrossTenantsWithDecision
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

test('second search can relax strict terms into a broad product query', () => {
  const query = relaxedFtsQuery('ピンクの小さいカメラ / 推し活で使う');
  assert.match(query, /"camera"\*/);
  assert.doesNotMatch(query, /"pink"\*/i);
});

test('光るスマホケースをAmazon商品語へ変換する', () => {
  const groups = semanticSearchGroups('TikTokで見た光るスマホケース / 持ち歩いて使う');
  const byCategory = new Map(groups.map((group) => [group.category, group.terms]));
  assert.deepEqual(byCategory.get('phone-case'), ['phone','case','cover','iphone','smartphone']);
  assert.deepEqual(byCategory.get('light-up'), ['led','light','glow','luminous']);
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
