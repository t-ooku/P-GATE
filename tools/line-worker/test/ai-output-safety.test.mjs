import test from 'node:test';
import assert from 'node:assert/strict';
import {
  containsUnsafeAiOutputContent, sanitizeAiOutputList, sanitizeAiOutputText
} from '../src/ai-output-safety.mjs';
import { normalizeChatTurnResult } from '../src/ai-chat-intent.mjs';
import { normalizeAiIntent } from '../src/ai-product-discovery.mjs';
import { normalizeSearchInputAnalysis } from '../src/search-input-analysis.mjs';

test('AI公開文からURL・価格・在庫販売断定を除く', () => {
  const unsafe = [
    '商品 www.evil.example/path USD 99 sold out',
    '候補 3,980 yen 在庫切れ',
    '候補 九千八百円 残り1点',
    '候補 https : //evil.example 購入先',
    '候補 shop.example.museum/item 192.168.1.2:8080/private 99 $',
    '候補 Amazonで購入できます available at Walmart 再入荷'
  ];
  const cleaned = unsafe.map((value) => sanitizeAiOutputText(value));
  assert.deepEqual(cleaned, ['', '', '', '', '', '']);
  assert.doesNotMatch(JSON.stringify(cleaned), /evil|example|192\.168|USD|99|yen|在庫|残り|購入|Amazon|Walmart|再入荷/iu);
});

test('stockを含む固有名詞は壊さず、重複だけを除く', () => {
  assert.equal(sanitizeAiOutputText('Birkenstock Boston'), 'Birkenstock Boston');
  assert.equal(sanitizeAiOutputText('Stockholm Design'), 'Stockholm Design');
  assert.equal(sanitizeAiOutputText('Woodstock Style'), 'Woodstock Style');
  assert.deepEqual(sanitizeAiOutputList(['Birkenstock', 'Birkenstock', 'Stockholm']), ['Birkenstock', 'Stockholm']);
});

test('AIが未確認の購入先・販売場所を基本表現でも主張できない', () => {
  const cases = new Map([
    ['Amazonで購入', ''],
    ['Amazonで販売', ''],
    ['楽天で売っています', ''],
    ['Amazonで購入できるバッグ', ''],
    ['購入先はAmazonです', ''],
    ['透明バッグ。販売先：Example Store', '透明バッグ'],
    ['available at Walmart', ''],
    ['small camera sold by ExampleStore', '']
  ]);
  for (const [unsafe, expected] of cases) {
    assert.equal(sanitizeAiOutputText(unsafe), expected, unsafe);
  }
});

test('AI公開文から購入先・略記価格・在庫表現の変種も除く', () => {
  const cases = [
    'Buy it at Amazon',
    'Order it from Amazon',
    'Sold via Amazon',
    '12k yen',
    'in-stock',
    '在庫がある',
    '残り僅少',
    'Amazonで買う',
    'Amazonで取り扱っています'
  ];
  for (const unsafe of cases) {
    assert.equal(sanitizeAiOutputText(unsafe), '', unsafe);
  }
});

test('AI公開文から自然言語価格と購入先の句全体をfail-closedで除く', () => {
  const cases = [
    'around ten thousand yen',
    '가격은 10,000원입니다',
    '价格是一百元',
    'Amazonで取り扱い中です',
    'Amazonで見つけました',
    '販売元はAmazonです',
    'Amazonにあります',
    'can be purchased at Amazon',
    'on sale at Amazon'
  ];
  for (const unsafe of cases) {
    assert.equal(sanitizeAiOutputText(unsafe), '', unsafe);
  }
});

test('AI公開文から概算語なし・日中韓表記の単独価格も除く', () => {
  const cases = [
    'ten thousand yen',
    '10,000원',
    '一百元',
    '1만원'
  ];
  for (const unsafe of cases) {
    assert.equal(sanitizeAiOutputText(unsafe), '', unsafe);
  }
});

test('AI公開文から中国語・韓国語の購入先断定も句ごと除く', () => {
  const cases = [
    '可在Amazon购买',
    'Amazon有售',
    '在Amazon可以买到',
    'Amazon에서 구매할 수 있습니다',
    'Amazon에서 판매 중입니다',
    'Amazon에서 찾을 수 있습니다'
  ];
  for (const unsafe of cases) {
    assert.equal(sanitizeAiOutputText(unsafe), '', unsafe);
  }
});

test('AI公開文から英語のfind・has・carries・can-buy購入先断定も句ごと除く', () => {
  const cases = [
    'find it on Amazon',
    'Amazon has it',
    'Amazon carries it',
    'you can buy it at Amazon'
  ];
  for (const unsafe of cases) {
    assert.equal(sanitizeAiOutputText(unsafe), '', unsafe);
  }
});

test('未知の言い回しでも価格・在庫・購入先を文単位でfail-closedにする', () => {
  const cases = [
    'Amazon offers this', 'Amazon lists this', 'You can get it at Amazon',
    'Get it from Amazon', 'This is available through Amazon',
    'inventory is available', 'there is stock', 'low inventory', 'preorder now',
    '販売しています', '取扱中', '予約できます', '発売中', '在庫有',
    '10 bucks', '100 yuan', '만원', '約十ドル'
  ];
  for (const unsafe of cases) {
    assert.equal(sanitizeAiOutputText(unsafe), '', unsafe);
    assert.equal(containsUnsafeAiOutputContent(unsafe), true, unsafe);
  }
  assert.equal(sanitizeAiOutputText('Birkenstock Boston。Amazon offers this'), 'Birkenstock Boston');
  assert.equal(sanitizeAiOutputText('Amazon Echo'), 'Amazon Echo');
});

test('marketplace名と掲載・提供・入手動詞の組合せを一般則でfail-closedにする', () => {
  const cases = [
    'Amazonで提供されています', 'Amazonに掲載されています', 'Amazonで手に入ります',
    'Amazonで取り寄せ可能です', 'Amazonに出品されています', 'Amazonに商品があります',
    'Amazonで扱っています', 'Amazonからお求めいただけます', 'listed on Amazon',
    'offered by Amazon', 'get yours on Amazon'
  ];
  for (const unsafe of cases) {
    assert.equal(sanitizeAiOutputText(unsafe), '', unsafe);
    assert.equal(containsUnsafeAiOutputContent(unsafe), true, unsafe);
  }
  assert.equal(sanitizeAiOutputText('Amazon Echo スマートスピーカー'), 'Amazon Echo スマートスピーカー');
});

test('named marketplaceは既知の商品名以外を拒否して未知の販売同義語も漏らさない', () => {
  const cases = [
    'You can obtain this from Amazon', 'Amazon retails it', 'Amazon supplies this',
    'Shipped by Amazon', 'Fulfilled by Amazon', 'Dispatched by Amazon',
    'Amazon可以买到', 'Amazon에서 구할 수 있습니다'
  ];
  for (const unsafe of cases) {
    assert.equal(sanitizeAiOutputText(unsafe), '', unsafe);
    assert.equal(containsUnsafeAiOutputContent(unsafe), true, unsafe);
  }
  for (const productName of ['Amazon', 'Amazon Echo Dot', 'Amazon Kindle Paperwhite', 'Rakuten Kobo']) {
    assert.equal(sanitizeAiOutputText(productName), productName, productName);
  }
});

test('価格・在庫・配送・掲載概念はsource名なし／未知店名でも文単位で拒否する', () => {
  const cases = [
    'ten bucks', 'fifty yuan', 'currently backordered', 'arrives tomorrow',
    'listed on Best Buy', 'offered by Newegg', '完売です', '入荷待ちです',
    '翌日お届け', 'ヨドバシに掲載中', 'ヨドバシで提供中', '九十九块钱',
    '仅剩3件', '卖完了', '预计明天送达', '京东已上架', '3개 남음',
    '당일 출고', '내일 도착', '네이버 쇼핑에 등록되어 있습니다',
    'メーカー公式サイトに掲載されています', '公式サイトで提供されています',
    '家電量販店で取り寄せ可能です', 'listed on the official website',
    'offered by the manufacturer', 'get yours from the official store'
  ];
  for (const unsafe of cases) {
    assert.equal(sanitizeAiOutputText(unsafe), '', unsafe);
    assert.equal(containsUnsafeAiOutputContent(unsafe), true, unsafe);
  }
});

test('通貨alias・販売ライフサイクル・配送費・generic retailerもfail-closedにする', () => {
  const cases = [
    '99 quid', 'RMB 99', '₩9,900', '3千円', '人民币99',
    'currently unavailable', 'restocking soon', 'discontinued', '欠品中',
    '补货中', '재입고 예정', 'free postage', '送料無料', '包邮', '免运费',
    '무료 배달', 'Best Buy is carrying it', '家電量販店で取り寄せ可能です',
    '京东有卖', '淘宝可以买'
  ];
  for (const unsafe of cases) {
    assert.equal(sanitizeAiOutputText(unsafe), '', unsafe);
    assert.equal(containsUnsafeAiOutputContent(unsafe), true, unsafe);
  }
});

test('後置通貨・無通貨の価格断定・在庫配送変種もfail-closedにする', () => {
  const cases = [
    '99 RMB', '99人民币', '99块', '99块钱',
    'current price: 3999', 'today’s price is 3999', 'price is 3999',
    'costs 3999', 'priced at 3999', 'MSRP 3999',
    'ready for purchase', 'can be ordered', 'orderable now', 'ready to order',
    'orders accepted', 'only three left', 'three remaining', 'last 3 items',
    'quantity remaining: 3', 'limited quantity', '无货', '售完', '卖光了',
    '3개 남았습니다', '매진', '次日达', '택배비 무료',
    'pick it up at Best Buy', 'ビックカメラにてお求めいただけます',
    'ヨドバシで取寄可', '11번가에 입점되어 있습니다'
  ];
  for (const unsafe of cases) {
    assert.equal(sanitizeAiOutputText(unsafe), '', unsafe);
    assert.equal(containsUnsafeAiOutputContent(unsafe), true, unsafe);
  }
});

test('セール・割引・クーポン表現を4言語でfail-closedにする', () => {
  const cases = [
    '20% off', 'half price', 'discounted now', 'limited-time deal',
    'clearance price', 'price reduced', 'buy one get one free',
    'free gift with purchase', 'save 20 percent', 'coupon code SAVE20',
    'deal of the day', 'セール中', '20%OFF', '20%オフ', '半額です',
    '割引中', '特価です', '値下げしました', 'クーポンあり', '2点目無料',
    '1個買うと1個無料', 'まとめ買い割引', 'ポイント10倍', '打八折',
    '优惠中', '限时折扣', '特价', '促销价', '降价了', '买一送一',
    '第二件半价', '满减优惠', '20% 할인', '반값', '세일 중', '특가',
    '할인 쿠폰', '1+1 행사', '사은품 증정', '두 번째 반값', '쿠폰 코드 SAVE20'
  ];
  for (const unsafe of cases) {
    assert.equal(sanitizeAiOutputText(unsafe), '', unsafe);
    assert.equal(containsUnsafeAiOutputContent(unsafe), true, unsafe);
  }
});

test('既知ブランド商品名の例外へ店舗・受取情報を混入できない', () => {
  const unsafe = [
    'Rakuten Kobo at Bic Camera for pickup', 'Rakuten Kobo pickup at Bic Camera',
    'Amazon Echo at Bic Camera for pickup', 'Amazon Kindle at Yodobashi for pickup',
    'Amazon Echo retailer Bic Camera', 'Amazon Fire at Costco'
  ];
  for (const value of unsafe) {
    assert.equal(sanitizeAiOutputText(value), '', value);
    assert.equal(containsUnsafeAiOutputContent(value), true, value);
  }
  for (const productName of ['Amazon Echo Show 8', 'Amazon Fire HD 10', 'Rakuten Kobo Clara Colour']) {
    assert.equal(sanitizeAiOutputText(productName), productName, productName);
  }
});

test('購入先ラベル・追加の割引在庫受取表現も公開しない', () => {
  const cases = [
    'Where to buy: Bic Camera', 'Purchase source: Bic Camera',
    'Stockist: Bic Camera', 'Official seller: Bic Camera',
    'Purchase link: Bic Camera', 'save twenty percent',
    'save ten percent', 'save thirty percent', 'last three items',
    'last few items', 'three items remain', 'almost gone', 'running low',
    'accepting orders', 'Bic Camera is the official seller',
    'Official store: Bic Camera', 'Official shop: Bic Camera',
    'Seller: Bic Camera', 'Stockist Bic Camera', 'Buy link: Bic Camera',
    'Store: Bic Camera', '公式店舗：ビックカメラ', '公式ストア：ビックカメラ',
    '官方店铺：苏宁', '官方商店：苏宁', '공식 매장: 하이마트',
    '売切', '当日受取可', '本日受取可', '店舗受取可', '廃番', '終売', '補充待ち',
    '仅余3件', '仅剩三件', '只剩三件', '卖光', '3개 남아 있습니다'
  ];
  for (const unsafe of cases) {
    assert.equal(sanitizeAiOutputText(unsafe), '', unsafe);
    assert.equal(containsUnsafeAiOutputContent(unsafe), true, unsafe);
  }
});

test('全AI候補経路が同じ公開出力境界を使う', () => {
  const unsafe = 'Birkenstock。USD 99 在庫切れ';
  assert.equal(normalizeChatTurnResult({ refined_query: unsafe }).refined_query, 'Birkenstock');
  assert.equal(normalizeSearchInputAnalysis({ refined_query: unsafe }).refined_query, 'Birkenstock');
  const discovery = normalizeAiIntent({ product_candidates: [{ name: unsafe }] });
  assert.equal(discovery.product_candidates[0].name, 'Birkenstock');
});
