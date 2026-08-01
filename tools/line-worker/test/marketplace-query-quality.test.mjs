import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEnglishChineseStressCorpus,
  buildMarketplaceQueryCorpus,
  evaluateMarketplaceQueryCorpus,
  MARKETPLACE_QUERY_NEGATIVE_CASES,
  scoreMarketplaceQueryCase,
} from "../evaluation/marketplace-query-quality.mjs";
import {
  buildMarketplaceSearchKeywords,
  buildQoo10SearchKeywords,
} from "../public/marketplace-search-keywords-v2.mjs";

const SEARCH_MARKETPLACES = [
  "AMAZON_JP", "RAKUTEN_JP", "QOO10_JP", "SHEIN_JP",
  "ZOZOTOWN_JP", "SHOPLIST_JP", "MUSINSA_JP", "BUYMA_JP", "SNKRDUNK_JP",
];

test("日英中韓640件の検索語コーパスを決定論的に生成する", () => {
  const corpus = buildMarketplaceQueryCorpus();
  assert.equal(corpus.length, 640);
  assert.deepEqual(new Set(corpus.map((item) => item.locale)), new Set(["ja", "en", "zh", "ko"]));
  assert.equal(new Set(corpus.map((item) => item.case_id)).size, corpus.length);
});

test("英語200件・中国語400件の重点コーパスを追加する", () => {
  const corpus = buildEnglishChineseStressCorpus();
  assert.equal(corpus.length, 600);
  assert.equal(corpus.filter((item) => item.locale === "en").length, 200);
  assert.equal(corpus.filter((item) => item.locale === "zh").length, 400);
  assert.equal(new Set(corpus.map((item) => item.case_id)).size, corpus.length);
});

test("検索語評価は必須条件の欠落・禁止条件・空・長すぎる語を分ける", () => {
  const score = scoreMarketplaceQueryCase(
    {
      case_id: "sample",
      locale: "ja",
      category: "earphones",
      required_tokens: ["透明", "イヤホン"],
      forbidden_tokens: ["有線"],
      max_length: 20,
    },
    "透明 有線 イヤホン",
  );
  assert.equal(score.passed, false);
  assert.deepEqual(score.missing_required, []);
  assert.deepEqual(score.leaked_forbidden, ["有線"]);
});

test("Qoo10向け検索語は640件と重要な負例で必須条件を保持する", () => {
  const cases = [
    ...buildMarketplaceQueryCorpus(),
    ...buildEnglishChineseStressCorpus(),
    ...MARKETPLACE_QUERY_NEGATIVE_CASES,
  ];
  const report = evaluateMarketplaceQueryCorpus(
    cases,
    (input) => buildQoo10SearchKeywords(input),
  );
  assert.equal(report.overall.cases, 1256);
  assert.equal(report.overall.pass_rate, 1, JSON.stringify(report.failures.slice(0, 10), null, 2));
  assert.equal(report.overall.empty_rate, 0);
  assert.equal(report.overall.required_token_violation_rate, 0);
  assert.equal(report.overall.forbidden_token_leak_rate, 0);
  for (const locale of ["ja", "en", "zh", "ko"]) {
    assert.equal(report.by_locale[locale].pass_rate, 1);
  }
});

test("4言語の検索条件を全検索対応モール向けに欠落なく変換する", () => {
  const baseCases = [
    ...buildMarketplaceQueryCorpus(),
    ...buildEnglishChineseStressCorpus(),
    ...MARKETPLACE_QUERY_NEGATIVE_CASES,
  ];
  const cases = SEARCH_MARKETPLACES.flatMap((marketplace) =>
    baseCases.map((item) => ({ ...item, marketplace })),
  );
  const report = evaluateMarketplaceQueryCorpus(
    cases,
    (input, testCase) => buildMarketplaceSearchKeywords(input, testCase.marketplace),
  );
  assert.equal(report.overall.cases, 11304);
  assert.equal(report.overall.pass_rate, 1, JSON.stringify(report.failures.slice(0, 10), null, 2));
  for (const marketplace of SEARCH_MARKETPLACES) {
    assert.equal(report.by_marketplace[marketplace].cases, 1256);
    assert.equal(report.by_marketplace[marketplace].pass_rate, 1);
  }
});

test("商品名を省いた4言語の説明検索を9モール向け商品語へ変換する", () => {
  const cases = [
    ['a black charging dock that holds two devices at once', 'デュアル充電器'],
    ['可以同时放两台设备的黑色双充电座', 'デュアル充電器'],
    ['기기 두 대를 동시에 올리는 검은색 듀얼 충전 거치대', 'デュアル充電器'],
    ['a white dome network camera that can pan and tilt', 'PTZ ネットワークカメラ'],
    ['可以云台转动的白色球形网络摄像头', 'PTZ ネットワークカメラ'],
    ['회전할 수 있는 흰색 돔형 네트워크 카메라', 'PTZ ネットワークカメラ'],
    ['the warm metal bars mounted on a bathroom wall', 'タオルウォーマー'],
    ['浴室墙上会发热的金属杆', 'タオルウォーマー'],
    ['욕실 벽에 달린 따뜻해지는 금속 막대', 'タオルウォーマー'],
    ['the nice-smelling powder my mother used', '香り付きボディパウダー'],
    ['妈妈以前用的有香味的粉', '香り付きボディパウダー'],
    ['엄마가 쓰던 향기 좋은 파우더', '香り付きボディパウダー'],
    ['a small silver instrument you play by blowing with your mouth', 'ハーモニカ'],
    ['用嘴吹奏的银色小乐器', 'ハーモニカ'],
    ['입으로 불어서 연주하는 은색 작은 악기', 'ハーモニカ'],
    ['something soft and wintry to put on a sofa', '冬 クッション'],
    ['放在沙发上的冬季柔软装饰', '冬 クッション'],
    ['소파에 놓는 겨울 느낌의 푹신한 것', '冬 クッション'],
    ['a silver horizontal six-light fixture above a bathroom mirror', '浴室 6灯 照明'],
    ['浴室镜子上方的银色横向六灯照明', '浴室 6灯 照明'],
    ['욕실 거울 위의 은색 가로형 6등 조명', '浴室 6灯 照明'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, required] of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.match(keywords, new RegExp(required), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(keywords.length <= 48, `${marketplace}: ${keywords}`);
    }
  }
});

test("否定した商品種別と色を9モール検索語から除外する", () => {
  const cases = [
    ['充電器ではなくiPhone 15用の透明ケース', ['iPhone 15ケース'], ['充電器']],
    ['an iPhone 15 clear case, not a charger', ['iPhone 15ケース'], ['充電器']],
    ['不要充电器，想要iPhone 15透明手机壳', ['iPhone 15ケース'], ['充電器']],
    ['충전기 말고 iPhone 15용 투명 케이스', ['iPhone 15ケース'], ['充電器']],
    ['赤ではなく黒い財布', ['黒', '財布'], ['赤']],
    ['a black wallet, not red', ['黒', '財布'], ['赤']],
    ['不要红色，要黑色钱包', ['黒', '財布'], ['赤']],
    ['빨간색 말고 검은색 지갑', ['黒', '財布'], ['赤', 'シルバー']],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, required, forbidden] of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      for (const token of required) assert.match(keywords, new RegExp(token), `${marketplace}: ${input}`);
      for (const token of forbidden) assert.doesNotMatch(keywords, new RegExp(token), `${marketplace}: ${input}`);
    }
  }
  assert.match(buildMarketplaceSearchKeywords('은색 지갑', 'QOO10_JP'), /シルバー 財布/);
});

test("4言語の素材・互換機種・容量寸法を9モールの検索語に保持する", () => {
  const cases = [
    ['黒い20Lのナイロン製自転車バックパック、革ではない', ['20L', 'ナイロン', 'バックパック'], ['革']],
    ['a black 20 L nylon cycling backpack, not leather', ['20L', 'ナイロン', 'バックパック'], ['革']],
    ['黑色20升尼龙骑行背包，不要皮革', ['20L', 'ナイロン', 'バックパック'], ['革']],
    ['검은색 20리터 나일론 자전거 백팩, 가죽 말고', ['20L', 'ナイロン', 'バックパック'], ['革']],
    ['iPhone 15用の透明シリコンケース、革ではない', ['シリコン', '透明', 'iPhone 15ケース'], ['革']],
    ['a clear silicone case for iPhone 15, not leather', ['シリコン', '透明', 'iPhone 15ケース'], ['革']],
    ['iPhone 15透明硅胶手机壳，不要皮革', ['シリコン', '透明', 'iPhone 15ケース'], ['革']],
    ['가죽 말고 iPhone 15용 투명 실리콘 케이스', ['シリコン', '透明', 'iPhone 15ケース'], ['革']],
    ['52mmのガラス製カメラフィルター', ['52mm', 'ガラス', 'カメラフィルター'], []],
    ['10×5×6インチの木製収納ボックス', ['10x5x6インチ', '木製', '収納ボックス'], []],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, required, forbidden] of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      for (const token of required) assert.ok(keywords.includes(token), `${marketplace}: ${input} -> ${keywords}`);
      for (const token of forbidden) assert.ok(!keywords.includes(token), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語の予算を除外し対象者・利用場面を9モールの商品語へ保持する", () => {
  const cases = [
    ['5000円以下の男性用防水バックパック', ['メンズ', '防水', 'バックパック'], ['5000', '円']],
    ["a waterproof men's backpack under $50", ['メンズ', '防水', 'バックパック'], ['50', '$']],
    ['预算300元以内的男士用防水背包', ['メンズ', '防水', 'バックパック'], ['300', '元']],
    ['예산 5만원 이하 남성용 방수 백팩', ['メンズ', '防水', 'バックパック'], ['5', '만원']],
    ['通勤用の軽量バックパック', ['通勤', '軽量', 'バックパック'], []],
    ['a lightweight backpack for commuting', ['通勤', '軽量', 'バックパック'], []],
    ['通勤用轻量背包', ['通勤', '軽量', 'バックパック'], []],
    ['출퇴근용 경량 백팩', ['通勤', '軽量', 'バックパック'], []],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, required, forbidden] of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      for (const token of required) assert.ok(keywords.includes(token), `${marketplace}: ${input} -> ${keywords}`);
      for (const token of forbidden) assert.ok(!keywords.includes(token), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語の年齢はキッズ用途へ変換しレビュー件数は9モール検索語から除外する", () => {
  const cases = [
    ['12歳の子供用防水バックパック', ['キッズ', '防水', 'バックパック'], ['12']],
    ['a waterproof backpack for a 12-year-old', ['キッズ', '防水', 'バックパック'], ['12']],
    ['适合12岁儿童的防水背包', ['キッズ', '防水', 'バックパック'], ['12']],
    ['12세 아이용 방수 백팩', ['キッズ', '防水', 'バックパック'], ['12']],
    ['口コミ1000件以上の黒い財布', ['黒', '財布'], ['1000']],
    ['a black wallet with over 1000 reviews', ['黒', '財布'], ['1000']],
    ['有1000条以上评价的黑色钱包', ['黒', '財布'], ['1000']],
    ['리뷰 1000개 이상인 검은색 지갑', ['黒', '財布'], ['1000']],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, required, forbidden] of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      for (const token of required) assert.ok(keywords.includes(token), `${marketplace}: ${input} -> ${keywords}`);
      for (const token of forbidden) assert.ok(!keywords.includes(token), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語のセット数量を9モール向けに統一し否定数量を除外する", () => {
  const cases = [
    ['12個入りセットの香り付きキャンドル', ['12個セット', 'キャンドル'], []],
    ['a 12-pack of scented candles', ['12個セット', 'キャンドル'], []],
    ['12件套香薰蜡烛', ['12個セット', 'キャンドル'], []],
    ['12개 세트 향초 캔들', ['12個セット', 'キャンドル'], []],
    ['12個セットではなく6個セットのキャンドル', ['6個セット', 'キャンドル'], ['12個セット']],
    ['not a 12-pack, but a 6-pack of candles', ['6個セット', 'キャンドル'], ['12個セット']],
    ['不要12件套，要6件套蜡烛', ['6個セット', 'キャンドル'], ['12個セット']],
    ['12개 세트 말고 6개 세트 캔들', ['6個セット', 'キャンドル'], ['12個セット']],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, required, forbidden] of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      for (const token of required) assert.ok(keywords.includes(token), `${marketplace}: ${input} -> ${keywords}`);
      for (const token of forbidden) assert.ok(!keywords.includes(token), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語の空白付き容量でも希望容量だけを9モール検索語へ保持する", () => {
  const cases = [
    '64 GBではなく128 GBのiPhone 15ケース',
    'not 64 GB but 128 GB iPhone 15 case',
    '不要64 GB，要128 GB的iPhone 15手机壳',
    '64 GB 말고 128 GB iPhone 15 케이스',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.ok(keywords.includes('iPhone 15ケース'), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(keywords.includes('128GB'), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(!keywords.includes('64GB'), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語の自己訂正では否定後に言い直した属性を9モール検索語へ保持する", () => {
  const cases = [
    '最初は黒を避けたかったが、やっぱり黒い財布',
    'not black at first, but actually a black wallet',
    '一开始不要黑色，后来决定要黑色钱包',
    '처음에는 검정 말고 생각했지만 결국 검정 지갑',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.ok(keywords.includes('黒'), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(keywords.includes('財布'), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語の比較寸法を予算と誤認せず9モール向け共通単位へ変換する", () => {
  const cases = [
    '幅50センチ以下の収納ボックス',
    'a storage box under 50 cm wide',
    '宽度不超过50厘米的收纳盒',
    '너비 50센티미터 이하 수납함',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.ok(keywords.includes('50cm'), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(keywords.includes('収納ボックス'), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語の否定寸法は除外し訂正寸法だけを9モール検索語へ保持する", () => {
  const cases = [
    '50センチではなく40センチの収納ボックス',
    'not 50 cm but a 40 cm storage box',
    '不要50厘米，要40厘米的收纳盒',
    '50센티미터 말고 40센티미터 수납함',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.ok(keywords.includes('40cm'), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(!keywords.includes('50cm'), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語の重量条件を9モール向け共通単位へ変換する", () => {
  const cases = [
    '2キロ以下のバックパック',
    'a backpack under 2 kilograms',
    '不超过2公斤的背包',
    '2킬로그램 이하 백팩',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.ok(keywords.includes('2kg'), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(keywords.includes('バックパック'), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語の訂正重量は旧条件を除外し最終重量だけを9モール検索語へ保持する", () => {
  const cases = [
    '3キロではなく2キロ以下のバックパック',
    'not 3 kg but a backpack under 2 kilograms',
    '不要3公斤，要2公斤的背包',
    '3킬로그램 말고 2킬로그램 이하 백팩',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.ok(keywords.includes('2kg'), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(!keywords.includes('3kg'), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});
