import test from 'node:test';
import assert from 'node:assert/strict';
import cryptoModule from 'node:crypto';
import fs from 'node:fs';

globalThis.crypto ??= cryptoModule.webcrypto;
globalThis.btoa ??= (value) => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ??= (value) => Buffer.from(value, 'base64').toString('binary');

const workerModule = await import('../src/index.mjs');
const { rankMerchantCandidates: rankMerchantCandidatesForTest } = await import('../src/knowledge-search.mjs');
const {
  buildDeviceAccessorySearchKeywords,
  buildQoo10SearchKeywords: buildBrowserQoo10SearchKeywords,
  buildMarketplaceSearchKeywords
} = await import('../public/marketplace-search-keywords-v2.mjs');
const {
  verifyLineSignature, createTrackToken, verifyTrackToken,
  isAllowedDestination, isProductDetailDestination, productMarketplaceOffers, candidateDestination, marketplaceForDestination, buildReplyMessages, validateKnowledgeRequest, sanitizePublicCandidate,
  getEnvironmentReadiness, buildAmazonSearchDestination, buildRakutenSearchDestination,
  buildQoo10SearchDestination, buildQoo10SearchKeywords, buildSheinSearchDestination,
  buildAmazonSearchKeywords, buildRakutenSearchKeywords,
  buildRakutenSearchKeywordCandidates, trackingEventsForPayload, rankSellerOffers
} = workerModule;

test('Rakuten search keeps Japanese conditions separate from Amazon aliases', () => {
  const query = '折りたたみ日傘 / 軽量 / 晴雨兼用';
  const keywords = buildRakutenSearchKeywords(query);
  assert.equal(keywords, '折りたたみ日傘 軽量 晴雨兼用');
  assert.doesNotMatch(keywords, /\bumbrella\b/i);
  assert.equal(
    decodeURIComponent(new URL(buildRakutenSearchDestination(query)).pathname),
    '/search/mall/折りたたみ日傘 軽量 晴雨兼用/'
  );
  assert.equal(
    buildRakutenSearchKeywords(`${query} umbrella folding`),
    '折りたたみ日傘 軽量 晴雨兼用'
  );
  assert.equal(
    buildRakutenSearchKeywords('iPhone 16 / 透明ケース'),
    'iPhone 16 透明ケース'
  );
});

// v3.5 real-report fix: marketplace-search-keywords-v2.mjs's GENERIC_PRODUCTS
// dictionary only recognizes the broad category noun ("トップス"), not every
// specific garment ("カットソー" lives in apparel-query-attributes.mjs's
// finer PRODUCT_TYPE_PATTERNS instead). A query naming both used to have the
// specific term silently dropped from the built keywords - what the user
// typed and what Rakuten/Amazon actually searched for diverged.
test('カットソーとトップスを両方含む検索語は片方が消えずに両方残る', () => {
  const query = 'カットソー トップス';
  const rakutenKeywords = buildRakutenSearchKeywords(query);
  assert.match(rakutenKeywords, /カットソー/);
  assert.match(rakutenKeywords, /トップス/);
  assert.equal(
    decodeURIComponent(new URL(buildRakutenSearchDestination(query)).pathname),
    '/search/mall/カットソー トップス/'
  );
  const amazonKeywords = buildAmazonSearchKeywords(query);
  assert.match(amazonKeywords, /カットソー/);
  assert.match(amazonKeywords, /トップス/);
  // a garment noun the dictionary already recognizes on its own must not be
  // duplicated by the reinsertion fix.
  assert.equal(buildRakutenSearchKeywords('トップス'), 'トップス');
  // non-apparel queries are unaffected (extractApparelProductType is null).
  assert.doesNotMatch(buildRakutenSearchKeywords('モバイルバッテリー 1万円以下'), /カットソー|トップス/);
});

test('Amazon structured Japanese search does not add broad English aliases', () => {
  const keywords = buildAmazonSearchKeywords('折りたたみ日傘 / 軽量 / 晴雨兼用 / 完全遮光');
  assert.match(keywords, /折りたたみ日傘/);
  assert.match(keywords, /軽量/);
  assert.match(keywords, /晴雨兼用/);
  assert.match(keywords, /完全遮光/);
  assert.doesNotMatch(keywords, /\b(?:umbrella|folding)\b/i);
});

test('PWA response never exposes patio umbrellas for a portable parasol query', async () => {
  const decorated = await workerModule.decoratePwaResultForTest(
    {
      query_id: 'portable-parasol',
      candidates: [
        { asin: 'PATIO0001', product_name: 'California Market Patio Umbrella Sunbrella Navy' },
        { asin: 'PORTABLE1', product_name: '超軽量 折りたたみ日傘 晴雨兼用' }
      ]
    },
    new Request('https://p-gate.example/api/knowledge'),
    { LINK_SIGNING_SECRET: 'secret' },
    'session-hash',
    '折りたたみ日傘 / 軽量 / 晴雨兼用'
  );
  assert.deepEqual(decorated.candidates.map((item) => item.asin), ['PORTABLE1']);
});

async function lineSignature(body, secret) {
  return cryptoModule.createHmac('sha256', secret).update(body).digest('base64');
}

test('LINE署名は正しい本文だけを許可する', async () => {
  const body = JSON.stringify({ events: [] });
  const signature = await lineSignature(body, 'secret');
  assert.equal(await verifyLineSignature(body, signature, 'secret'), true);
  assert.equal(await verifyLineSignature(`${body} `, signature, 'secret'), false);
  assert.equal(await verifyLineSignature(body, signature, 'wrong'), false);
  assert.equal(await verifyLineSignature(body, 'not-valid-base64%%%', 'secret'), false);
});

test('追跡トークンは改ざんと期限切れを拒否する', async () => {
  const token = await createTrackToken({ exp: 2000, d: 'https://www.amazon.co.jp/dp/B000000001' }, 'secret');
  const payload = await verifyTrackToken(token, 'secret', 1000);
  assert.equal(payload.exp, 2000);
  await assert.rejects(() => verifyTrackToken(`${token}x`, 'secret', 1000), /SIGNATURE|FORMAT/);
  await assert.rejects(() => verifyTrackToken(token, 'secret', 3000), /EXPIRED/);
});

test('送客先は許可した複数ECのHTTPSドメインだけ', () => {
  assert.equal(isAllowedDestination('https://www.amazon.co.jp/dp/B000000001'), true);
  assert.equal(isAllowedDestination('https://amazon.com/dp/B000000001'), true);
  assert.equal(isAllowedDestination('https://item.rakuten.co.jp/shop/item-1'), true);
  assert.equal(isAllowedDestination('https://store.shopping.yahoo.co.jp/shop/item-1.html'), true);
  assert.equal(isAllowedDestination('https://www.qoo10.jp/s/?keyword=socks'), true);
  assert.equal(isAllowedDestination('https://jp.shein.com/pdsearch/socks/'), true);
  assert.equal(isAllowedDestination('http://amazon.co.jp/dp/B000000001'), false);
  assert.equal(isAllowedDestination('https://amazon.co.jp.evil.example/item'), false);
  assert.equal(isAllowedDestination('https://rakuten.co.jp.evil.example/item'), false);
  assert.equal(isAllowedDestination('https://user:pass@item.rakuten.co.jp/item'), false);
});

test('承認済み複数EC購入先を従来Amazon URLより優先する', () => {
  const selected = candidateDestination({
    amazon_jp_url: 'https://www.amazon.co.jp/dp/B000000001',
    offers: [
      { marketplace: 'RAKUTEN_JP', product_url: 'https://item.rakuten.co.jp/shop/item-1', stock_status: 'IN_STOCK' }
    ]
  });
  assert.equal(selected.offer.marketplace, 'RAKUTEN_JP');
  assert.equal(selected.url, 'https://item.rakuten.co.jp/shop/item-1');
});

test('未承認の従来Amazon URLへは送客しない', () => {
  const selected = candidateDestination({ amazon_jp_url: 'https://www.amazon.co.jp/dp/B000000001' });
  assert.equal(selected.url, '');
  assert.equal(selected.offer, null);
});

test('重複ASINの出品先はプラン順、同一プランは先登録順にする', () => {
  const offers = rankSellerOffers([
    { seller_id: 'lite-first', plan: 'lite', registered_at: '2026-01-01T00:00:00Z', stock_status: 'IN_STOCK', product_url: 'https://www.amazon.co.jp/dp/B000000001?m=lite' },
    { seller_id: 'pro-later', plan: 'pro', registered_at: '2026-02-01T00:00:00Z', stock_status: 'IN_STOCK', product_url: 'https://www.amazon.co.jp/dp/B000000001?m=pro2' },
    { seller_id: 'partner', plan: 'partner', registered_at: '2026-03-01T00:00:00Z', stock_status: 'IN_STOCK', product_url: 'https://www.amazon.co.jp/dp/B000000001?m=partner' },
    { seller_id: 'pro-first', plan: 'pro', registered_at: '2026-01-15T00:00:00Z', stock_status: 'IN_STOCK', product_url: 'https://www.amazon.co.jp/dp/B000000001?m=pro1' },
    { seller_id: 'growth', plan: 'growth', registered_at: '2025-12-01T00:00:00Z', stock_status: 'IN_STOCK', product_url: 'https://www.amazon.co.jp/dp/B000000001?m=growth' }
  ]);
  assert.deepEqual(offers.map((offer) => offer.seller_id), [
    'partner', 'pro-first', 'pro-later', 'growth', 'lite-first'
  ]);
});

test('優先セラーが出品停止または在庫切れなら次順位へ自動繰り上げする', () => {
  const selected = candidateDestination({
    asin: 'B000000001',
    offers: [
      { seller_id: 'partner', plan: 'partner', status: 'INACTIVE', stock_status: 'IN_STOCK', product_url: 'https://www.amazon.co.jp/dp/B000000001?m=partner' },
      { seller_id: 'pro', plan: 'pro', stock_status: 'OUT_OF_STOCK', product_url: 'https://www.amazon.co.jp/dp/B000000001?m=pro' },
      { seller_id: 'unavailable', plan: 'pro', stock_status: 'UNAVAILABLE', product_url: 'https://www.amazon.co.jp/dp/B000000001?m=unavailable' },
      { seller_id: 'growth', plan: 'growth', active: true, stock_status: 'IN_STOCK', product_url: 'https://www.amazon.co.jp/dp/B000000001?m=growth' },
      { seller_id: 'lite', plan: 'lite', stock_status: 'IN_STOCK', product_url: 'https://www.amazon.co.jp/dp/B000000001?m=lite' }
    ]
  });
  assert.equal(selected.offer.seller_id, 'growth');
});

test('許可URLからMarketplace計測値を決定する', () => {
  assert.equal(marketplaceForDestination('https://amazon.co.jp/dp/B000000001'), 'AMAZON_JP');
  assert.equal(marketplaceForDestination('https://item.rakuten.co.jp/shop/item'), 'RAKUTEN_JP');
  assert.equal(marketplaceForDestination('https://store.shopping.yahoo.co.jp/shop/item'), 'YAHOO_JP');
  assert.equal(marketplaceForDestination('https://www.qoo10.jp/s/?keyword=socks'), 'QOO10_JP');
  assert.equal(marketplaceForDestination('https://jp.shein.com/pdsearch/socks/'), 'SHEIN_JP');
  assert.equal(marketplaceForDestination('https://evil.example/item'), '');
});

test('Amazon検索フォールバックは個人情報を除いて検索URLを作る', () => {
  const destination = buildAmazonSearchDestination(
    '青い 小型 加湿器 user@example.com 090-1234-5678'
  );
  const url = new URL(destination);
  assert.equal(url.origin, 'https://www.amazon.co.jp');
  assert.equal(url.pathname, '/s');
  assert.match(url.searchParams.get('k'), /humidifier/);
  assert.match(url.searchParams.get('k'), /blue/);
  assert.doesNotMatch(url.searchParams.get('k'), /example|090|5678/);
});

test('楽天・Qoo10・SHEINの公式検索URLへ同じ整理済み条件を渡す', () => {
  const query = '韓国っぽい靴下';
  const rakuten = new URL(buildRakutenSearchDestination(query));
  const qoo10 = new URL(buildQoo10SearchDestination(query));
  const shein = new URL(buildSheinSearchDestination(query));
  assert.equal(rakuten.origin, 'https://search.rakuten.co.jp');
  assert.match(decodeURIComponent(rakuten.pathname), /靴下/);
  assert.equal(qoo10.origin, 'https://www.qoo10.jp');
  assert.match(qoo10.searchParams.get('keyword'), /sock/);
  assert.equal(shein.origin, 'https://jp.shein.com');
  assert.match(decodeURIComponent(shein.pathname), /sock/);
});

test('説明だけの商品検索も主力4モールへカテゴリ語を引き継ぐ', () => {
  const cases = [
    ['a black charging dock that holds two devices at once', /dual charger/i, 'デュアル充電器'],
    ['회전할 수 있는 흰색 돔형 네트워크 카메라', /network camera/i, 'PTZ ネットワークカメラ'],
    ['浴室墙上会发热的金属杆', /towel/i, 'タオルウォーマー'],
    ['the nice-smelling powder my mother used', /perfumed/i, '香り付きボディパウダー'],
    ['입으로 불어서 연주하는 은색 작은 악기', /harmonica/i, 'ハーモニカ'],
    ['something soft and wintry to put on a sofa', /decorative pillow/i, '冬 クッション'],
    ['浴室镜子上方的银色横向六灯照明', /6-light/i, '浴室 6灯 照明'],
  ];
  for (const [query, amazonCategory, compactCategory] of cases) {
    assert.match(buildAmazonSearchKeywords(query), amazonCategory, query);
    assert.match(buildRakutenSearchKeywords(query), new RegExp(compactCategory), query);
    assert.match(buildQoo10SearchKeywords(query), new RegExp(compactCategory), query);
    const sheinKeywords = decodeURIComponent(new URL(buildSheinSearchDestination(query)).pathname);
    assert.match(sheinKeywords, new RegExp(compactCategory), query);
  }
});

test('公開検索APIが失敗しても4モールへの検索導線を表示する', async () => {
  const appSource = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(appSource, /function emergencyMarketplaceFallback\(query\)/);
  assert.match(appSource, /Amazonで探す/);
  assert.match(appSource, /tag=hoshilu-22/);
  assert.match(appSource, /楽天市場で探す/);
  assert.match(appSource, /Qoo10で探す/);
  assert.match(appSource, /SHEINで探す/);
  assert.match(appSource, /renderResults\(emergencyMarketplaceFallback\(elements\.query\.value\)\)/);
});
// 2026-08-05 report had reversed this: when results were already found, the
// "10モールとSNSを横断して探す" marketplaceFallbackCard was suppressed to
// avoid clutter below genuine results. The 2026-08-07 instructions (#8)
// explicitly reverse that decision: mall/SNS cross-search must stay visible
// even when a search already returned product cards, not only when it found
// nothing. Assert the card is now appended in *both* branches.
test('検索結果の有無に関わらずモール横断フォールバックカードを表示する', () => {
  const appSource = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  // Asserted without pinning the neighbouring pushes: the guarantee is that
  // the has-results branch builds and pushes the fallback card before it
  // renders, not that it is appended immediately after the carousel (the AI
  // related-keyword card was later inserted into this same branch).
  // 2026-08-07 (Phase C 項目A): the has-results branch now pushes two rows
  // (confirmed / unconfirmed) instead of a single carousel, so the assertion
  // is on the fallback card still being pushed into resultCards, not on the
  // exact single-line shape renderResults used to have.
  assert.match(
    appSource,
    /const marketplaceFallback=marketplaceFallbackCard\(result\);\s*if\(marketplaceFallback\)resultCards\.push\(marketplaceFallback\);/
  );
  assert.match(appSource, /resultCards\.push\(\.\.\.rows\)/);
  assert.doesNotMatch(appSource, /function refinementCard\(/);
  assert.match(appSource, /elements\.cards\.replaceChildren\(\.\.\.resultCards\);/);
  assert.match(
    appSource,
    /emptyCards\.push\(marketplaceFallback\);\s*elements\.cards\.replaceChildren\(\.\.\.emptyCards\);/
  );
});
// AI related-keyword suggestions (Phase C item 11, 2026-08-07): 5件以上の
// タップ可能な連想キーワードを検索条件に追加できること。出典は必ず実データ
// (AI意図解析 / 実際に見つかった商品の一致語・商品名)で、AIが価格や商品を
// 捏造しないのと同じ原則でキーワードも創作しない。
test('AI連想キーワードをタップで検索条件に追加できる', () => {
  const appSource = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(appSource, /function relatedKeywordSuggestions\(result,query\)/);
  assert.match(appSource, /function relatedKeywordCard\(result\)/);
  // 5件未満なら中途半端なブロックを出さない
  assert.match(appSource, /if\(terms\.length<5\)return null;/);
  // タップで既存条件に " / " 区切りで追加し、同じ検索ルートとして再検索する
  assert.match(appSource, /elements\.query\.value=current\?`\$\{current\} \/ \$\{term\}`:term;/);
  assert.match(appSource, /function applyRelatedKeyword\(term\)[\s\S]{0,400}runKnowledgeSearch\(\)/);
  // 読み取り専用のspanではなくbuttonで、クリックハンドラを持つ
  assert.match(appSource, /chip\.className='keyword-tag related-keyword-tag'/);
  assert.match(appSource, /chip\.addEventListener\('click',\(\)=>applyRelatedKeyword\(term\)\)/);
  // 検索結果あり／なしの両方の分岐に差し込まれている
  assert.match(appSource, /const relatedKeywords=relatedKeywordCard\(result\);\s*if\(relatedKeywords\)resultCards\.push\(relatedKeywords\)/);
  assert.match(appSource, /const emptyRelatedKeywords=relatedKeywordCard\(result\);\s*if\(emptyRelatedKeywords\)emptyCards\.push\(emptyRelatedKeywords\)/);
  // 出典は実データのみ: AI意図解析と、実際に返ってきた商品の一致語・商品名
  assert.match(appSource, /analysis\?\.search_keywords\|\|\[\]\)\.forEach\(pushAi\)/);
  assert.match(appSource, /candidate\?\.evidence\?\.matched_terms\|\|\[\]\)\.forEach\(countResult\)/);
  // モールの販促定型文はキーワード候補にしない
  assert.match(appSource, /const relatedKeywordStopWords=new Set\(\[[^\]]*'送料無料'/);
  // 4言語ぶんのラベル・補足・再検索ボタンがあり、旧「まだ見つからない場合」
  // セクションを増やさず同じ関連キーワード欄へ統合される
  ['JA', 'EN', 'ZH', 'KO'].forEach((language) => {
    assert.match(appSource, new RegExp(`${language}:\\{ai:'[^']+',result:'[^']+',body:'[^']+',button:'[^']+'\\}`));
  });
  assert.match(appSource, /覚えている色・大きさ・電源・使う場所などを検索文に追加すると、候補をさらに絞れます。/);
  assert.match(appSource, /button\.className='secondary related-keyword-refine'/);
  const layoutCss = fs.readFileSync(new URL('../public/ai-search-layout-fix.css', import.meta.url), 'utf8');
  // スマホでのタップ領域を44px以上に保つ
  assert.match(layoutCss, /\.related-keyword-tag\{[^}]*min-height:44px/);
});
test('Amazon検索フォールバックに承認済みアソシエイトIDを付ける', () => {
  const destination = buildAmazonSearchDestination('光るスマホケース', 'hoshilu-22');
  const url = new URL(destination);
  assert.equal(url.searchParams.get('tag'), 'hoshilu-22');
  assert.match(url.searchParams.get('k'), /phone/);
});

test('アパレル検索では統合3モールに直接検索10モールを追加する(v4.2項目14)', async () => {
  const decorated = await workerModule.decoratePwaResultForTest(
    { query_id: 'q-apparel', candidates: [] },
    new Request('https://hoshilu.app/api/knowledge'),
    { LINK_SIGNING_SECRET: 'test-secret', AMAZON_ASSOCIATE_TAG: 'hoshilu-22' },
    'session-hash',
    'Korean street black cropped top'
  );
  assert.deepEqual(
    decorated.marketplace_search_links.map((item) => item.marketplace),
    [
      'AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP', 'QOO10_JP', 'SHEIN_JP',
      'ZOZOTOWN_JP', 'LOFT_JP', 'HANDS_JP', 'MATSUKIYO_JP', 'COSME_JP', 'ABCMART_JP',
      'BUYMA_JP', 'SNKRDUNK_JP'
    ]
  );
  // v4.2 項目17: integrated/directの区分がレスポンスに載っていること。
  const modeByMarketplace = Object.fromEntries(
    decorated.marketplace_search_links.map((item) => [item.marketplace, item.mode])
  );
  assert.equal(modeByMarketplace.AMAZON_JP, 'integrated');
  assert.equal(modeByMarketplace.RAKUTEN_JP, 'integrated');
  assert.equal(modeByMarketplace.YAHOO_JP, 'integrated');
  for (const marketplace of ['QOO10_JP', 'SHEIN_JP', 'ZOZOTOWN_JP', 'LOFT_JP', 'HANDS_JP', 'MATSUKIYO_JP', 'COSME_JP', 'ABCMART_JP', 'BUYMA_JP', 'SNKRDUNK_JP']) {
    assert.equal(modeByMarketplace[marketplace], 'direct', marketplace);
  }
});

test('v4.2項目14: 検索結果リンクの許可ドメインに新規5モールが含まれる', async () => {
  const { isAllowedDestination } = await import('../src/index.mjs');
  assert.equal(isAllowedDestination('https://www.loft.co.jp/store/goods/search.aspx?keyword=a'), true);
  assert.equal(isAllowedDestination('https://hands.net/search/?q=a'), true);
  assert.equal(isAllowedDestination('https://www.matsukiyococokara-online.com/store/catalogsearch/result/?q=a'), true);
  assert.equal(isAllowedDestination('https://www.cosme.com/products/search.php'), true);
  assert.equal(isAllowedDestination('https://www.abc-mart.net/shop/goods/search.aspx'), true);
});

test('AmazonへはHOSHILUが整理した商品条件を引き継ぐ', () => {
  const keywords = buildAmazonSearchKeywords(
    'SNSで見た blue の小さい table lamp'
  );
  assert.match(keywords, /lamp/);
  assert.match(keywords, /light/);
  assert.match(keywords, /blue/);
  assert.doesNotMatch(keywords, /SNSで見た/);
});

test('カメラの手がかりは用途を追加してもAmazon検索語から落とさない', () => {
  const keywords = buildAmazonSearchKeywords(
    'SNSで見た、ピンクの小さいカメラみたいなもの / 遊び・趣味に使う'
  );
  assert.match(keywords, /camera/);
  assert.match(keywords, /pink/);
  assert.match(keywords, /toy/);
});

test('中国語と韓国語をAmazon.co.jpで探しやすい商品語へ変換する', () => {
  const chinese = buildAmazonSearchKeywords('想找可以放进包里的轻量折叠雨伞');
  assert.match(chinese, /折りたたみ傘/);
  assert.match(chinese, /軽量/);
  assert.match(chinese, /umbrella/);

  const korean = buildAmazonSearchKeywords('틱톡에서 본 투명하고 빛나는 휴대폰 케이스');
  assert.match(korean, /スマホケース/);
  assert.match(korean, /透明/);
  assert.match(korean, /LED/);
  assert.match(korean, /phone/);
});

test('Amazon検索流出は未充足需要として契約成果と分離する', () => {
  const events = trackingEventsForPayload({
    j: 'q1:AMAZON_SEARCH',
    u: 'anonymous-hash',
    r: 'q1',
    a: '',
    d: 'https://www.amazon.co.jp/s?k=humidifier',
    m: 'AMAZON_JP',
    t: 'SEARCH_FALLBACK'
  }, '2026-07-24T00:00:00.000Z');
  assert.equal(events.length, 2);
  events.forEach((event) => {
    assert.equal(event.asin, 'SEARCHFALL');
    assert.equal(event.destination_type, 'AMAZON_SEARCH_FALLBACK');
    assert.equal(event.contract_match, false);
    assert.equal(event.demand_status, 'UNMET');
  });
});

test('LINE返信は説明1件と商品最大3件', async () => {
  const candidates = Array.from({ length: 6 }, (_, index) => ({
    rank: index + 1, asin: `B00000000${index + 1}`,
    display_name: `商品${index + 1}`,
    offers: [{ marketplace: 'AMAZON_JP', product_url: `https://www.amazon.co.jp/dp/B00000000${index + 1}`, stock_status: 'IN_STOCK' }]
  }));
  const messages = await buildReplyMessages(
    { message: '候補です', query_id: 'q1', candidates }, 'https://line.example',
    { LINK_SIGNING_SECRET: 'secret' },
    { webhookEventId: 'w1', source: { userId: 'U123' } }
  );
  assert.equal(messages.length, 4);
  assert.equal(messages[0].text, '候補です');
  assert.match(messages[1].text, /\/go\?token=/);
});

test('PWA公開質問は同意・文字数・匿名セッション・Turnstileを必須にする', () => {
  const valid = validateKnowledgeRequest({
    query: ' breakfast cereal ', consent: true,
    session_id: 'abcdef0123456789abcdef0123456789', turnstile_token: 'verified-token'
  });
  assert.equal(valid.query, 'breakfast cereal');
  assert.equal(valid.search_attempt, 1);
  assert.equal(valid.traffic_class, 'UNATTRIBUTED');
  assert.equal(validateKnowledgeRequest({
    query: 'breakfast cereal', consent: true, search_attempt: 2,
    session_id: 'abcdef0123456789abcdef0123456789', turnstile_token: 'verified-token'
  }).search_attempt, 2);
  assert.equal(validateKnowledgeRequest({
    query: 'breakfast cereal', consent: true,
    session_id: 'abcdef0123456789abcdef0123456789', turnstile_token: 'verified-token',
    source: 'codex_acceptance', medium: 'qa', campaign: 'search_test'
  }).traffic_class, 'QA');
  assert.equal(validateKnowledgeRequest({
    query: 'breakfast cereal', consent: true,
    session_id: 'abcdef0123456789abcdef0123456789', turnstile_token: 'verified-token',
    source: 'instagram', medium: 'organic_social', campaign: 'itg_brand_reel'
  }).traffic_class, 'ATTRIBUTED');
  assert.throws(() => validateKnowledgeRequest({ ...valid, consent: false }), /CONSENT_REQUIRED/);
  assert.throws(() => validateKnowledgeRequest({ ...valid, query: 'x' }), /QUERY_LENGTH_INVALID/);
  assert.throws(() => validateKnowledgeRequest({ ...valid, session_id: 'email@example.com' }), /SESSION_ID_INVALID/);
  assert.throws(() => validateKnowledgeRequest({ ...valid, turnstile_token: '' }), /TURNSTILE_TOKEN_INVALID/);
});

test('PWAはインストール可能なmanifestとオフラインshellを持つ', () => {
  const publicDir = new URL('../public/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.webmanifest', publicDir), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.icons.some((icon) => icon.sizes === '192x192'), true);
  assert.equal(manifest.icons.some((icon) => icon.sizes === '512x512'), true);
  const app = fs.readFileSync(new URL('app.js', publicDir), 'utf8');
  assert.equal(/innerHTML/.test(app), false);
  ['JA', 'EN', 'ZH', 'KO'].forEach((language) => assert.match(app, new RegExp(`${language}:`)));
  ['AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP'].forEach((marketplace) => assert.match(app, new RegExp(marketplace)));
  assert.match(app, /candidate\.selected_offer/);
  const serviceWorker = fs.readFileSync(new URL('service-worker.js', publicDir), 'utf8');
  assert.match(serviceWorker, /hoshilu-shell-v344/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\('\/admin'\)/);
  assert.doesNotMatch(serviceWorker.match(/const SHELL = \[[\s\S]*?\];/)?.[0] || '', /\/admin/);
});

test('PWA公開回答は内部SKU・在庫数・元URL・取込証跡を除外する', () => {
  const result = sanitizePublicCandidate({
    asin: 'B000000001', manufacturer: '公開メーカー', sku: 'INTERNAL-SKU', stock: 17,
    internal_cost: 432, private_supplier_score: 98, future_internal_field: '非公開',
    amazon_jp_url: 'https://www.amazon.co.jp/dp/B000000001',
    offers: [{ marketplace: 'RAKUTEN_JP', product_url: 'https://item.rakuten.co.jp/shop/item', seller_name: '非公開店舗', external_product_id: 'secret', price: 1000, shipping_fee: 200, total_cost: 1200, currency: 'JPY', stock_status: 'IN_STOCK', delivery_days: 2 }],
    evidence: { matched_terms: ['朝食'], information_score: 90, source_hash: 'secret-hash', imported_at: 'now' }
  });
  assert.equal(result.asin, 'B000000001');
  assert.equal(result.manufacturer, '公開メーカー');
  assert.equal(result.available, true);
  assert.equal('sku' in result, false);
  assert.equal('stock' in result, false);
  assert.equal('amazon_jp_url' in result, false);
  assert.equal(result.offers[0].total_cost, 1200);
  assert.equal('product_url' in result.offers[0], false);
  assert.equal('seller_name' in result.offers[0], false);
  assert.equal('external_product_id' in result.offers[0], false);
  assert.equal('source_hash' in result.evidence, false);
  assert.equal('internal_cost' in result, false);
  assert.equal('private_supplier_score' in result, false);
  assert.equal('future_internal_field' in result, false);
});

test('PWAは実在する複数モール購入先を個別の署名付きURLへ変換し元URLを返さない', async () => {
  const env = { LINK_SIGNING_SECRET: 'secret' };
  const gasResult = {
    query_id: 'q-multi', candidates: [{
      asin: 'B000000001', offers: [
        { marketplace: 'AMAZON_JP', product_url: 'https://amazon.co.jp/dp/B000000001', price: 1200, total_cost: 1200, currency: 'JPY', stock_status: 'IN_STOCK' },
        { marketplace: 'RAKUTEN_JP', product_url: 'https://item.rakuten.co.jp/shop/item', price: 1000, shipping_fee: 200, total_cost: 1200, currency: 'JPY', stock_status: 'IN_STOCK' },
        { marketplace: 'QOO10_JP', product_url: 'https://www.qoo10.jp/gmkt.inc/Goods/Goods.aspx?goodscode=987654321', price: 1100, shipping_fee: 100, total_cost: 1200, currency: 'JPY', stock_status: 'IN_STOCK' }
      ]
    }]
  };
  const decorated = await workerModule.decoratePwaResultForTest(gasResult, new Request('https://p-gate.example/api/knowledge'), env, 'session-hash');
  assert.equal(decorated.candidates[0].offers.length, 3);
  decorated.candidates[0].offers.forEach((offer) => {
    assert.match(offer.tracking_url, /^https:\/\/p-gate\.example\/go\?token=/);
    assert.equal('product_url' in offer, false);
  });
  const firstToken = new URL(decorated.candidates[0].offers[0].tracking_url).searchParams.get('token');
  assert.equal((await verifyTrackToken(firstToken, env.LINK_SIGNING_SECRET)).m, 'AMAZON_JP');
});

test('PWAはAmazon検索フォールバックを署名付きURLで返す', async () => {
  const env = { LINK_SIGNING_SECRET: 'secret' };
  const decorated = await workerModule.decoratePwaResultForTest(
    { query_id: 'q-fallback', candidates: [] },
    new Request('https://p-gate.example/api/knowledge'),
    env,
    'session-hash',
    '青い 小型 加湿器'
  );
  assert.match(
    decorated.amazon_search_url,
    /^https:\/\/p-gate\.example\/go\?token=/
  );
  const token = new URL(decorated.amazon_search_url).searchParams.get('token');
  const payload = await verifyTrackToken(token, env.LINK_SIGNING_SECRET);
  assert.equal(payload.t, 'SEARCH_FALLBACK');
  assert.equal(payload.m, 'AMAZON_JP');
  assert.match(payload.d, /^https:\/\/www\.amazon\.co\.jp\/s\?k=/);
  assert.match(decorated.amazon_search_keywords, /humidifier/);
});

test('商品カードには実出品でないモール検索ボタンを付けない', async () => {
  const env = { LINK_SIGNING_SECRET: 'secret' };
  const decorated = await workerModule.decoratePwaResultForTest(
    { query_id: 'q-candidate-fallback', candidates: [{
      asin: 'B000000001',
      product_name: 'DC Icons Black Adam Action Figure',
      marketplace_search_links: [{ marketplace: 'QOO10_JP', url: 'https://example.invalid' }],
      amazon_search_url: 'https://example.invalid'
    }] },
    new Request('https://p-gate.example/api/knowledge'),
    env,
    'session-hash',
    '黒いフィギュア'
  );
  const candidate = decorated.candidates[0];
  assert.equal('marketplace_search_links' in candidate, false);
  assert.equal('amazon_search_url' in candidate, false);
  assert.equal(candidate.offers.length, 0);

  const appSource = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(appSource, /candidate\.marketplace_search_links|candidate\.amazon_search_url/);
});

// AI Search v2 STEP2 (docs/HOSHILU_AI_SEARCH_V2_SPEC_2026-08-04.md section 8):
// every AI-generated product candidate needs its own marketplace search
// links, not just the top candidate. These must be signed /go tracking
// tokens like every other product link on the site (per [hoshilu-ssot]:
// AI never generates URLs, HOSHILU signs and verifies all of them) - never a
// raw, client-built marketplace URL.
test('AI検索候補には候補ごとに署名済みのモール検索リンクが付く', async () => {
  const env = { LINK_SIGNING_SECRET: 'secret' };
  const decorated = await workerModule.decoratePwaResultForTest(
    {
      query_id: 'q-ai-discovery',
      candidates: [],
      ai_discovery: {
        triggered: true,
        configured: true,
        provider: 'GEMINI_PRODUCT_INTENT',
        analysis: {
          category: '完全ワイヤレスイヤホン',
          intent_summary: '',
          features: ['透明'],
          product_candidates: [
            { name: 'Nothing Ear', brand: 'Nothing', match_score: 95, reason: '透明デザイン', matched_features: ['透明'], search_keywords: ['Nothing Ear 透明'] },
            { name: 'JBL Tune Beam', brand: 'JBL', match_score: 70, reason: '', matched_features: [], search_keywords: [] }
          ],
          search_keywords: ['透明 ワイヤレスイヤホン'],
          multilingual_keywords: { ja: [], en: [], zh: [], ko: [] }
        }
      }
    },
    new Request('https://p-gate.example/api/knowledge'),
    env,
    'session-hash',
    '韓国っぽい透明のワイヤレスイヤホン'
  );
  const candidates = decorated.ai_discovery.analysis.product_candidates;
  assert.equal(candidates.length, 2);
  for (const candidate of candidates) {
    assert.ok(Array.isArray(candidate.marketplace_search_links));
    assert.ok(candidate.marketplace_search_links.length >= 5);
    for (const link of candidate.marketplace_search_links) {
      assert.match(link.url, /^https:\/\/p-gate\.example\/go\?token=/);
      const token = new URL(link.url).searchParams.get('token');
      const payload = await verifyTrackToken(token, env.LINK_SIGNING_SECRET);
      assert.equal(payload.t, 'SEARCH_FALLBACK');
      assert.equal(payload.m, link.marketplace);
    }
  }
  // the second candidate falls back to its own name when it has no AI-
  // generated search_keywords - never the first candidate's keywords.
  const secondCandidateToken = new URL(candidates[1].marketplace_search_links[0].url).searchParams.get('token');
  const secondPayload = await verifyTrackToken(secondCandidateToken, env.LINK_SIGNING_SECRET);
  assert.match(decodeURIComponent(secondPayload.d).replace(/\+/g, ' '), /JBL Tune Beam/);
});

test('弁当の緑の草状仕切りは画面・Amazon・楽天でバラン検索へ統一する', () => {
  const query = '弁当に入っている草みたいな見た目の緑のしきり / 料理・食事に使う';
  const expected = '弁当 バラン 仕切り';
  assert.equal(buildMarketplaceSearchKeywords(query, 'AMAZON_JP'), expected);
  assert.equal(buildAmazonSearchKeywords(query), expected);
  assert.equal(buildRakutenSearchKeywords(query), expected);
  assert.deepEqual(buildRakutenSearchKeywordCandidates(query), [expected]);
});

test('保存済みAmazon商品詳細URLは非収益の商品確認リンクとして署名する', async () => {
  const env = { LINK_SIGNING_SECRET: 'secret' };
  const decorated = await workerModule.decoratePwaResultForTest(
    { query_id: 'q-product-lead', candidates: [{
      asin: 'B0061BRUBY', product_name: '12 Electric Cooktop with 1 Burner', stock: 99,
      amazon_jp_url: 'https://www.amazon.co.jp/dp/B0061BRUBY', offers: []
    }] },
    new Request('https://p-gate.example/api/knowledge'), env, 'session-hash', '電気コンロ'
  );
  const offer = decorated.candidates[0].offers[0];
  assert.equal(offer.marketplace, 'AMAZON_JP');
  assert.equal(offer.verification_status, 'UNVERIFIED');
  assert.match(offer.tracking_url, /^https:\/\/p-gate\.example\/go\?token=/);
  assert.equal('product_url' in offer, false);
  const token = new URL(offer.tracking_url).searchParams.get('token');
  const payload = await verifyTrackToken(token, env.LINK_SIGNING_SECRET);
  assert.equal(payload.t, 'PRODUCT_LEAD');
  assert.equal(payload.cm, false);
  assert.equal(payload.d, 'https://www.amazon.co.jp/dp/B0061BRUBY');
});
test('PWA公開設定はSite Keyだけを返し、無効な質問をAPI境界で拒否する', async () => {
  const ctx = { waitUntil() {} };
  const configResponse = await workerModule.default.fetch(
    new Request('https://p-gate.example/api/config'),
    { TURNSTILE_SITE_KEY: 'public-site-key', TURNSTILE_SECRET_KEY: 'must-not-leak' }, ctx
  );
  const config = await configResponse.json();
  assert.deepEqual(config, { turnstile_site_key: 'public-site-key', line_login_configured: false, email_login_configured: false, sms_login_configured: false });
  assert.equal(JSON.stringify(config).includes('must-not-leak'), false);

  const invalidResponse = await workerModule.default.fetch(
    new Request('https://p-gate.example/api/knowledge', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://p-gate.example' },
      body: JSON.stringify({ query: 'x', consent: false, session_id: 'bad', turnstile_token: '' })
    }), {}, ctx
  );
  assert.equal(invalidResponse.status, 400);
});

test('公開前ヘルスチェックはSecret値を返さず不足・弱い鍵・LINE片側設定を検出する', async () => {
  const base = {
    GAS_BACKEND_URL: 'https://script.google.com/macros/s/example/exec',
    GAS_BRIDGE_SECRET: 'g'.repeat(32), LINK_SIGNING_SECRET: 'l'.repeat(32),
    TURNSTILE_SITE_KEY: 'site-key', TURNSTILE_SECRET_KEY: 'turnstile-secret',
    ADMIN_AUTH_ID: 'operator', ADMIN_AUTH_PASSWORD: 'admin-password-12345',
    ADMIN_SESSION_SECRET: 'a'.repeat(64),
    SELLER_AUTH_ID: 'seller-admin',
    SELLER_AUTH_PASSWORD: 'seller-password-123',
    AUTH_SESSION_SECRET: 's'.repeat(64),
    SELLER_ALLOWED_TENANTS: 'itg'
  };
  assert.equal(getEnvironmentReadiness(base).ready, true);
  assert.equal(getEnvironmentReadiness({ ...base, GAS_BACKEND_URL: 'http://example.com' }).ready, false);
  assert.deepEqual(getEnvironmentReadiness({ ...base, LINK_SIGNING_SECRET: 'short' }).weak, ['LINK_SIGNING_SECRET']);
  assert.equal(getEnvironmentReadiness({ ...base, ADMIN_AUTH_PASSWORD: 'short' }).ready, false);
  assert.equal(getEnvironmentReadiness({ ...base, ADMIN_AUTH_PASSWORD: 'short' }).checks.admin_auth_weak, true);
  const placeholders = getEnvironmentReadiness({
    ...base,
    GAS_BACKEND_URL: 'https://script.google.com/macros/s/REPLACE_WITH_DEPLOYMENT_ID/exec',
    ADMIN_AUTH_PASSWORD: 'replace-with-password-at-least-16-characters',
    ADMIN_SESSION_SECRET: 'replace-with-secret-at-least-64-characters-xxxxxxxxxxxxxxxxxxxxxxxx'
  });
  assert.equal(placeholders.ready, false);
  assert.equal(placeholders.checks.gas_backend_https, false);
  assert.ok(placeholders.weak.includes('ADMIN_AUTH_PASSWORD'));
  assert.ok(placeholders.weak.includes('ADMIN_SESSION_SECRET'));
  assert.equal(getEnvironmentReadiness({
    ...base, ADMIN_SESSION_SECRET: base.LINK_SIGNING_SECRET
  }).checks.admin_credentials_distinct, false);
  assert.equal(getEnvironmentReadiness(base).checks.turnstile_configured, true);
  assert.equal(getEnvironmentReadiness(base).checks.social_autopilot_enabled, false);
  assert.equal(getEnvironmentReadiness({ ...base, SOCIAL_AUTOPILOT_ENABLED: 'true' }).checks.social_autopilot_enabled, true);
  assert.equal(getEnvironmentReadiness({ ...base, TURNSTILE_SECRET_KEY: '' }).checks.turnstile_configured, false);
  assert.equal(getEnvironmentReadiness(base).checks.ai_chat_configured, false);
  assert.equal(getEnvironmentReadiness({ ...base, GEMINI_API_KEY: 'g'.repeat(20) }).checks.ai_chat_configured, true);
  assert.equal(getEnvironmentReadiness({ ...base, OPENAI_API_KEY: 'o'.repeat(20) }).checks.ai_chat_configured, true);
  assert.equal(getEnvironmentReadiness(base).checks.admin_auth_configured, true);
  assert.equal(getEnvironmentReadiness(base).checks.admin_credentials_distinct, true);
  assert.equal(getEnvironmentReadiness(base).checks.seller_auth_configured, true);
  assert.equal(getEnvironmentReadiness(base).checks.seller_auth_partial, false);
  const {
    SELLER_AUTH_ID: omittedSellerId,
    SELLER_AUTH_PASSWORD: omittedSellerPassword,
    AUTH_SESSION_SECRET: omittedSellerSecret,
    SELLER_ALLOWED_TENANTS: omittedSellerTenants,
    ...withoutSeller
  } = base;
  assert.equal(getEnvironmentReadiness(withoutSeller).ready, false);
  assert.equal(getEnvironmentReadiness(withoutSeller).checks.seller_auth_configured, false);
  const sellerConfigured = getEnvironmentReadiness({
    ...withoutSeller,
    SELLER_AUTH_ID: 'seller-admin',
    SELLER_AUTH_PASSWORD: 'seller-password-123',
    AUTH_SESSION_SECRET: 's'.repeat(64),
    SELLER_ALLOWED_TENANTS: 'itg'
  });
  assert.equal(sellerConfigured.ready, true);
  assert.equal(sellerConfigured.checks.seller_auth_configured, true);
  assert.equal(sellerConfigured.checks.seller_auth_weak, false);
  const sellerPartial = getEnvironmentReadiness({ ...withoutSeller, SELLER_AUTH_ID: 'seller-admin' });
  assert.equal(sellerPartial.ready, false);
  assert.equal(sellerPartial.checks.seller_auth_partial, true);
  const sellerWeak = getEnvironmentReadiness({
    ...withoutSeller,
    SELLER_AUTH_ID: 'replace-with-seller-id',
    SELLER_AUTH_PASSWORD: 'seller-password-123',
    AUTH_SESSION_SECRET: 'short',
    SELLER_ALLOWED_TENANTS: '***'
  });
  assert.equal(sellerWeak.ready, false);
  assert.equal(sellerWeak.checks.seller_auth_weak, true);
  assert.ok(sellerWeak.weak.includes('SELLER_AUTH_ID'));
  assert.ok(sellerWeak.weak.includes('AUTH_SESSION_SECRET'));
  assert.ok(sellerWeak.weak.includes('SELLER_ALLOWED_TENANTS'));
  assert.equal(getEnvironmentReadiness({ ...base, LINE_CHANNEL_SECRET: 'only-one-side' }).checks.line_partial, true);
  const optional = getEnvironmentReadiness({
    ...base,
    MYWATCH_CRON_SECRET: 'm'.repeat(32),
    UNMET_DEMAND_SYNC_SECRET: 'u'.repeat(32),
    SPAPI_LWA_CLIENT_ID: 'client',
    SPAPI_LWA_CLIENT_SECRET: 'secret',
    SPAPI_REFRESH_TOKEN_ITG: 'refresh',
    AMAZON_CREATORS_CREDENTIAL_ID: 'amazon-id',
    AMAZON_CREATORS_CREDENTIAL_SECRET: 'amazon-secret',
    AMAZON_CREATORS_CREDENTIAL_VERSION: '2.3',
    AMAZON_ASSOCIATE_TAG: 'hoshilu-22',
    RAKUTEN_APPLICATION_ID: 'rakuten-app',
    RAKUTEN_ACCESS_KEY: 'rakuten-key',
    YAHOO_SHOPPING_CLIENT_ID: 'yahoo-client-id'
  });
  assert.equal(optional.checks.mywatch_configured, true);
  assert.equal(optional.checks.unmet_demand_sync_configured, true);
  assert.deepEqual(optional.checks.sp_api_configured_tenants, ['itg']);
  assert.equal(optional.checks.amazon_creators_configured, true);
  assert.equal(optional.checks.rakuten_marketplace_configured, true);
  assert.equal(optional.checks.yahoo_shopping_configured, true);
  assert.equal(JSON.stringify(optional.checks).includes('refresh'), false);

  const ctx = { waitUntil() {} };
  const response = await workerModule.default.fetch(
    new Request('https://p-gate.example/health'), base, ctx
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.release, '1.18.0');
  assert.equal(payload.checks.database_features.mywatch_notifications, false);
  // §3移行(ContractPolicy/MultilingualSeo/Measurement/SocialKnowledge/ProductIdentifier)で
  // 追加したD1テーブルもgas/PreflightEngine.gsの「必須シート」チェック相当として含まれる。
  assert.equal(payload.checks.database_features.contracts, false);
  assert.equal(payload.checks.database_features.kpi_events, false);
  assert.equal(payload.checks.database_features.social_knowledge_inbox, false);
  assert.equal(payload.checks.database_features.product_identifiers, false);
  assert.deepEqual(payload.checks.social_publishers, {
    X: false,
    INSTAGRAM: false,
    TIKTOK: false
  });
  assert.equal(JSON.stringify(payload).includes(base.GAS_BRIDGE_SECRET), false);
  assert.equal(JSON.stringify(payload).includes(base.TURNSTILE_SECRET_KEY), false);

  const missingSellerResponse = await workerModule.default.fetch(
    new Request('https://p-gate.example/health'), withoutSeller, ctx
  );
  const missingSellerPayload = await missingSellerResponse.json();
  assert.equal(missingSellerResponse.status, 503);
  assert.equal(missingSellerPayload.ok, false);
  assert.equal(missingSellerPayload.checks.seller_auth_configured, false);
  assert.ok(missingSellerPayload.missing.includes('SELLER_AUTH_ID'));
  assert.ok(missingSellerPayload.missing.includes('SELLER_ALLOWED_TENANTS'));
});

test('公開設定はTurnstile Site Key未設定時に503を返す', async () => {
  const response = await workerModule.default.fetch(
    new Request('https://p-gate.example/api/config'), {}, { waitUntil() {} }
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { turnstile_site_key: '', line_login_configured: false, email_login_configured: false, sms_login_configured: false });
});

test('Qoo10の商品検索はASINと末尾ノイズを除き短い商品条件へ整える', () => {
  const keywords = buildQoo10SearchKeywords(
    'B09NKLIJ57 black casetify iphone arson banana'
  );
  assert.equal(keywords, 'iPhoneケース');
  assert.doesNotMatch(keywords, /B09NKLIJ57|arson|banana/i);
  assert.ok(keywords.split(/\s+/).length <= 4);
});
test('Qoo10の商品検索はiPhoneの充電器をケースへ誤変換しない', () => {
  const keywords = buildQoo10SearchKeywords(
    'iPhoneで使える急速充電器を探して charger charging'
  );
  assert.equal(keywords, 'iPhone 充電器');
});

test('Qoo10は曖昧な説明を短い商品語と必須属性へ自動変換する', () => {
  const query = '韓国っぽい透明のワイヤレスイヤホン / 完全ワイヤレス';
  assert.equal(buildQoo10SearchKeywords(query), '透明 完全ワイヤレス イヤホン');
  assert.equal(buildQoo10SearchKeywords(query), buildBrowserQoo10SearchKeywords(query));
});

test('モール検索は他カテゴリの曖昧な文章も商品語と重要属性へ短縮する', () => {
  const cases = [
    ['推し活で使える手のひらサイズの小さな写真プリンター', '小型 写真プリンター'],
    ['雨の日も使える軽い折りたたみ日傘', '軽量 折りたたみ傘'],
    ['韓国っぽい黒いミニバッグ', '小型 黒 韓国風 バッグ'],
    ['白くて小さい防水アクションカメラ', '小型 防水 白 カメラ'],
    ['TikTokで見たピンクの携帯扇風機', 'ピンク 携帯扇風機'],
    ['韓国で買った紫のサツマイモチップス 料理・食事に使う', '紫 さつまいもチップス']
  ];
  for (const [query, expected] of cases) {
    assert.equal(buildMarketplaceSearchKeywords(query, 'AMAZON_JP'), expected, query);
  }
});

test('美容・生活・家電・ペット・ファッションも説明文を商品検索語へ変換する', () => {
  const cases = [
    ['SNSで見た韓国の透明な加湿器が欲しい', '透明 韓国風 加湿器'],
    ['旅行で使える折り畳める軽い水筒', '軽量 折りたたみ 水筒'],
    ['インスタで見たピンクのシートマスクを探している', 'ピンク シートマスク'],
    ['犬が水を飲む白い自動の給水器', '自動 白 ペット給水器'],
    ['通勤で使う黒い軽量ノートパソコン', '軽量 黒 ノートパソコン'],
    ['海外で見たゴールドのネックレスが欲しい', 'ゴールド ネックレス'],
    ['料理に使う小型の黒いエアフライヤー', '小型 黒 調理家電']
  ];
  for (const [query, expected] of cases) {
    assert.equal(buildMarketplaceSearchKeywords(query, 'QOO10_JP'), expected, query);
  }
});

test('未知商品でも購入文脈とSNS文脈を除き商品手掛かりを保持する', () => {
  assert.equal(
    buildMarketplaceSearchKeywords('TikTokで見た机の下につける白い引き出しが欲しい', 'QOO10_JP'),
    '机の下につける白い引き出し'
  );
  assert.equal(
    buildMarketplaceSearchKeywords('韓国で買った星形のキーホルダーを探したい', 'QOO10_JP'),
    '星形のキーホルダー'
  );
});

test('楽天公式アフィリエイトURLは実商品ページを内包する場合だけ許可する', () => {
  const valid = 'https://hb.afl.rakuten.co.jp/hgc/abc123/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fshop%2Fitem-1%2F';
  const externalTarget = 'https://hb.afl.rakuten.co.jp/hgc/abc123/?pc=https%3A%2F%2Fevil.example%2Fitem';
  const searchTarget = 'https://hb.afl.rakuten.co.jp/hgc/abc123/?pc=https%3A%2F%2Fsearch.rakuten.co.jp%2Fsearch%2Fmall%2Fcamera%2F';
  assert.equal(isProductDetailDestination(valid), true);
  assert.equal(isProductDetailDestination(externalTarget), false);
  assert.equal(isProductDetailDestination(searchTarget), false);
});

test('楽天API検索は複合条件と主要商品語の順で候補を作る', () => {
  assert.deepEqual(
    buildRakutenSearchKeywordCandidates(
      '推し活で使える小さな写真プリンター / 写真を撮る / 手のひらサイズ / スマホ対応'
    ),
    [
      '推し活で使える小さな写真プリンター 写真を撮る 手のひらサイズ スマホ対応',
      '小型 写真プリンター'
    ]
  );
  assert.deepEqual(
    buildRakutenSearchKeywordCandidates('透明なワイヤレスイヤホン'),
    ['透明 ワイヤレス イヤホン']
  );
});
test('Qoo10はiPhoneより明示された商品種別を優先し多言語でもケースへ誤変換しない', () => {
  const cases = [
    ['iPhone用のUSB-C充電ケーブルが欲しい', 'iPhone ケーブル USB-C'],
    ['iPhone compatible wireless earbuds', 'iPhone イヤホン'],
    ['iPhone用の急速充電器', 'iPhone 充電器'],
      ['iPhone 15 tempered glass screen protector', 'iPhone 15 保護フィルム 強化ガラス'],
    ['iPhone用スマホスタンド', 'iPhone スタンド'],
    ['iPhone portable charger power bank', 'iPhone モバイルバッテリー'],
    ['iPhone 15 Pro対応ケース', 'iPhone 15 Proケース'],
    ['iPhone用充电线 케이블', 'iPhone ケーブル'],
    ['iPhone', 'iPhone'],
  ];
  for (const [query, expected] of cases) {
    assert.equal(buildQoo10SearchKeywords(query), expected, query);
  }
});
test('Qoo10はAndroid系端末と型番・容量・サイズ・規格を短い商品語へ統一する', () => {
  const cases = [
    ['Galaxy S24 Ultra USB-C 2m 60W charging cable', 'Galaxy S24 Ultra ケーブル USB-C 2m 60W'],
    ['Pixel 9 Pro 10000mAh power bank', 'Pixel 9 Pro モバイルバッテリー 10000mAh'],
    ['iPhone 10000mAh モバイルバッテリー', 'iPhone モバイルバッテリー 10000mAh'],
    ['Android Qi2 充電器', 'Android 充電器 Qi2'],
    ['Galaxy S23 6.1インチ 保護フィルム', 'Galaxy S23 保護フィルム 6.1インチ'],
    ['Pixel 8 phone stand', 'Pixel 8 スタンド'],
    ['安卓 手机壳', 'Android ケース'],
    ['갤럭시 S24 이어폰', 'Galaxy S24 イヤホン'],
    ['苹果手机 15 充电器', 'iPhone 15 充電器'],
  ];
  for (const [query, expected] of cases) {
    assert.equal(buildQoo10SearchKeywords(query), expected, query);
  }
});
test('Qoo10のAPI成功時とブラウザ緊急フォールバックは同じ商品検索語を使う', () => {
  const queries = [
    'iPhone 15 Pro USB-C 2m 60W 充電ケーブル',
    'Galaxy S24 Ultra 10000mAh power bank',
    'Pixel 9 Pro tempered glass screen protector',
    '안드로이드 Qi2 충전기',
  ];
  for (const query of queries) {
    assert.equal(buildQoo10SearchKeywords(query), buildDeviceAccessorySearchKeywords(query));
  }
});
test('横断検索語はスラッシュ付き長文も主要商品と必須属性へ短縮する', () => {
  const query = '推し活で使える小さな写真プリンター / 写真を撮る / 手のひらサイズ / アクションカメラ';
  const amazonKeywords = buildAmazonSearchKeywords(query);
  const qoo10Keywords = buildQoo10SearchKeywords(query);
  assert.match(amazonKeywords, /写真プリンター/);
  assert.notEqual(amazonKeywords, 'camera');
  assert.equal(qoo10Keywords, '小型 写真プリンター カメラ');
  assert.doesNotMatch(qoo10Keywords, /推し活|写真を撮る|手のひらサイズ|\//);
});

test('日英中韓のコードなしイヤホンを完全ワイヤレス検索へ統一する', () => {
  const cases = [
    '透明でコードなしのイヤホン',
    'transparent wire-free earbuds',
    '透明真无线耳机',
    '투명 완전 무선 이어폰',
  ];
  for (const query of cases) {
    const keywords = buildQoo10SearchKeywords(query);
    assert.match(keywords, /透明/);
    assert.match(keywords, /完全ワイヤレス/);
    assert.match(keywords, /イヤホン/);
    assert.doesNotMatch(keywords, /有線|wired|유선|有线/);
  }
});

test('商品カードは10モールの実在商品ページを1モール1件だけ購入先にする', async () => {
  const env = { LINK_SIGNING_SECRET: 'secret' };
  const offers = [
    { marketplace: 'AMAZON_JP', product_url: 'https://www.amazon.co.jp/dp/B000000001', stock_status: 'IN_STOCK' },
    { marketplace: 'AMAZON_JP', product_url: 'https://www.amazon.co.jp/dp/B000000002', stock_status: 'IN_STOCK' },
    { marketplace: 'RAKUTEN_JP', product_url: 'https://item.rakuten.co.jp/shop/item-1/', stock_status: 'IN_STOCK' },
    { marketplace: 'YAHOO_JP', product_url: 'https://store.shopping.yahoo.co.jp/shop/item-1.html', stock_status: 'IN_STOCK' },
    { marketplace: 'QOO10_JP', product_url: 'https://www.qoo10.jp/gmkt.inc/Goods/Goods.aspx?goodscode=123456789', stock_status: 'IN_STOCK' },
    { marketplace: 'SHEIN_JP', product_url: 'https://jp.shein.com/example-p-12345678.html', stock_status: 'IN_STOCK' },
    { marketplace: 'ZOZOTOWN_JP', product_url: 'https://zozo.jp/shop/example/goods/12345678/', stock_status: 'IN_STOCK' },
    { marketplace: 'SHOPLIST_JP', product_url: 'https://www.shop-list.com/women/example/item-code/', stock_status: 'IN_STOCK' },
    { marketplace: 'MUSINSA_JP', product_url: 'https://global.musinsa.com/jp/goods/1234567', stock_status: 'IN_STOCK' },
    { marketplace: 'BUYMA_JP', product_url: 'https://www.buyma.com/item/123456789/', stock_status: 'IN_STOCK' },
    { marketplace: 'SNKRDUNK_JP', product_url: 'https://snkrdunk.com/products/123456', stock_status: 'IN_STOCK' },
    { marketplace: 'QOO10_JP', product_url: 'https://www.qoo10.jp/s/?keyword=camera', stock_status: 'IN_STOCK' }
  ];
  assert.equal(isProductDetailDestination(offers[11].product_url), false);
  assert.equal(isProductDetailDestination('https://www.qoo10.jp/item/sample-product/123456789'), true);
  assert.deepEqual(productMarketplaceOffers(offers).map((offer) => offer.marketplace), ['AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP', 'QOO10_JP', 'SHEIN_JP', 'ZOZOTOWN_JP', 'SHOPLIST_JP', 'MUSINSA_JP', 'BUYMA_JP', 'SNKRDUNK_JP']);
  const decorated = await workerModule.decoratePwaResultForTest(
    { query_id: 'q-ten-marketplaces', candidates: [{ asin: 'B000000001', offers }] },
    new Request('https://p-gate.example/api/knowledge'), env, 'session-hash'
  );
  assert.equal(decorated.candidates[0].offers.length, 10);
  decorated.candidates[0].offers.forEach((offer) => assert.equal(offer.tracking_url.startsWith('https://p-gate.example/go?token='), true));
  const appSource = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.equal(appSource.includes('marketplaceLabel(offer.marketplace)}で見る'), true);
  assert.equal(appSource.includes("JA:'全部のモールで探す'"), true);
  assert.equal(appSource.includes("document.querySelector('.marketplace-fallback')?.scrollIntoView"), true);
});

// AI Lowest-Price Compare gap-fill (Phase C item 12/13, 2026-08-07).
//
// The price-comparison panel lists only marketplaces with a CONFIRMED total
// including shipping. A mall can carry this exact product without one, and
// dropping those hid a real place to buy it.
//
// 2026-08-07 real-device report: the first cut of this built the entries
// from result.marketplace_search_links, so every product card listed all
// nine other malls regardless of whether they were ever shown to carry that
// product, and each link went to a keyword search page rather than to the
// product. These entries must come from candidate.offers - the same
// per-product offer list the confirmed prices come from - so every link
// opens the SAME product on that mall, and only malls where it was actually
// found appear. No price is shown, because none was confirmed.
test('価格未確認モールの導線は同一商品のオファーだけから作る', () => {
  const appSource = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(appSource, /function unverifiedMarketplaceLinks\(offers,language\)/);
  assert.match(appSource, /同じ商品が見つかったモール（価格未確認）/);
  // 全体クエリの検索リンクではなく、その商品のオファーのtracking_urlを使う
  assert.match(appSource, /url:offer\.tracking_url/);
  assert.doesNotMatch(appSource, /unverifiedMarketplaceLinks\([^)]*marketplace_search_links/);
  // 価格が確定しているモールは価格側に出るので、ここでは除外する
  assert.match(appSource, /Number\(offer\?\.total_cost\)>0\|\|seen\.has\(marketplace\)/);
  // 確定価格あり(単数・複数)の両方の分岐に差し込む
  assert.match(appSource, /const gap=unverifiedMarketplaceLinks\(linked,language\);if\(!gap\)return link;/);
  assert.match(appSource, /const gap=unverifiedMarketplaceLinks\(linked,language\);if\(gap\)panel\.append\(gap\)/);
  // オファーが1件も無ければ同一商品の情報が無いので何も出さない
  assert.match(appSource, /if\(!linked\.length\)return null;/);
});


test('indexed knowledge candidates remain ahead of unverified GAS fallbacks', () => {
  const ranked = rankMerchantCandidatesForTest(
    [{ asin: 'B000CAMERA', product_name: 'Pink Camera' }],
    [{ asin: 'B000SOCIAL', product_name: 'SNS Sensor' }]
  );
  assert.deepEqual(ranked.map((candidate) => candidate.asin), ['B000CAMERA', 'B000SOCIAL']);
});

// Unified search condition model (Phase C item 11, 2026-08-07). "AI検索" and
// "条件検索" must be two entry points to ONE condition, not two search paths.
// search-refinement-policy.mjs held a complete condition model that nothing
// ever called; attaching its chips to the search response is what joins
// them, because selecting a chip appends its label to the same query string
// the AI free-text search already reads.
test('検索応答に条件検索チップを軸ごとにまとめて返す', async () => {
  const env = { LINK_SIGNING_SECRET: 'secret' };
  const request = new Request('https://p-gate.example/api/knowledge');
  const decorated = await workerModule.decoratePwaResultForTest(
    { query_id: 'q-chips', candidates: [] }, request, env, 'session-hash', 'ワイヤレスイヤホン', 'JA'
  );
  assert.deepEqual(
    decorated.refinement_chips.map((group) => group.dimension),
    ['category', 'scene', 'size', 'power', 'appearance']
  );
  assert.deepEqual(
    decorated.refinement_chips.map((group) => group.label),
    ['種類', '使う場所', '大きさ', '電源', '見た目']
  );
  decorated.refinement_chips.forEach((group) => {
    assert.ok(group.values.length >= 5);
    group.values.forEach((item) => {
      assert.equal(typeof item.value, 'string');
      assert.ok(item.label.length > 0);
    });
  });

  // 既に決まっている軸は出し直さない（条件を足すほど絞れる）
  const narrowed = await workerModule.decoratePwaResultForTest(
    { query_id: 'q-narrow', candidates: [] }, request, env, 'session-hash', 'モバイル充電器 / USB充電 / 旅行中', 'JA'
  );
  assert.deepEqual(narrowed.refinement_chips.map((group) => group.dimension), ['category', 'size', 'appearance']);

  // 表示言語に追従する
  const english = await workerModule.decoratePwaResultForTest(
    { query_id: 'q-en', candidates: [] }, request, env, 'session-hash', 'wireless earbuds', 'EN'
  );
  assert.deepEqual(english.refinement_chips.map((group) => group.label), ['Type', 'Where you use it', 'Size', 'Power', 'Look']);
});

test('条件検索チップはAI検索と同じ1本のクエリ条件に追加される', () => {
  const appSource = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(appSource, /function conditionSearchCard\(groups\)/);
  // サーバーが返したラベルをそのまま描画する（軸名も値名もハードコードしない）
  assert.match(appSource, /textElement\('span','condition-group-label',group\.label\)/);
  assert.match(appSource, /chip\.textContent=item\.label/);
  // AI検索・連想キーワードと同じ " / " 区切りで既存クエリに追加して再検索する
  assert.match(appSource, /elements\.query\.value=\[base,\.\.\.selected\.values\(\)\]\.filter\(Boolean\)\.join\(' \/ '\)/);
  assert.match(appSource, /submit\.addEventListener\('click',\(\)=>\{[\s\S]{0,400}runKnowledgeSearch\(\)/);
  // 1軸につき1つ（applyRefinementChips のルールと揃える）
  assert.match(appSource, /if\(active\)selected\.delete\(group\.dimension\);/);
  assert.match(appSource, /selected\.set\(group\.dimension,item\.label\)/);
  // 未選択では実行できない
  assert.match(appSource, /submit\.disabled=selected\.size===0/);
  // 2026-08-07: 検索結果側ではなく検索パネル内の「詳細検索」に移動し、
  // 初回検索の前から条件を指定できるようにした。検索前に描画されるため
  // チップは検索応答ではなく /api/refinement-chips から取るが、生成元は
  // 同じ search-refinement-policy なので辞書は1つのまま。
  assert.match(appSource, /async function renderAdvancedSearch\(\)/);
  assert.match(appSource, /fetch\(`\/api\/refinement-chips\?language=\$\{encodeURIComponent\(language\)\}`/);
  assert.match(appSource, /toggle\.setAttribute\('aria-expanded',String\(toggle\.getAttribute\('aria-expanded'\)!=='true'\)\)/);
  // 言語を変えたらラベルもチップも取り直す
  assert.match(appSource, /advancedSearchGroups=null;renderAdvancedSearch\(\)/);
  ['JA', 'EN', 'ZH', 'KO'].forEach((language) => {
    assert.match(appSource, new RegExp(`${language}:\\{title:'[^']+',body:'[^']+',submit:'[^']+'\\}`));
  });
  const layoutCss = fs.readFileSync(new URL('../public/ai-search-layout-fix.css', import.meta.url), 'utf8');
  assert.match(layoutCss, /\.condition-chip\.selected\{/);
  assert.match(layoutCss, /\.condition-chip\{[^}]*min-height:44px/);
});

// 商品提示中も検索窓を画面に残す (2026-08-07 request)。
// 商品が出たあとに絞り込みたくなったとき、元の検索パネルまでスクロールで
// 戻らないと語を足せなかった。
//
// 重要なのは #query を唯一の正とし続けること。AI連想キーワードのチップも
// 条件検索のチップも #query に書き込むので、常駐バーが自前の状態を持つと
// 2つの入力欄が別々の内容で検索してしまう。バーは描画のたびに #query を
// 映し、送信時に #query へ書き戻すだけにしてある。
test('検索結果の上に検索窓を常駐させ、#queryを唯一の正とする', () => {
  const appSource = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../public/sticky-nav.css', import.meta.url), 'utf8');

  assert.match(html, /id="stickySearch"[^>]*class="sticky-search hidden"/);
  assert.match(html, /id="stickySearchInput"/);
  // 結果が出ているときだけ出す
  assert.match(appSource, /form\.classList\.toggle\('hidden',!showing\)/);
  // 送信時は #query に書き戻してから同じ検索経路を通す
  assert.match(appSource, /elements\.query\.value=value;[\s\S]{0,120}runKnowledgeSearch\(\)/);
  // 入力途中の内容を描画で上書きしない
  assert.match(appSource, /if\(showing&&document\.activeElement!==input\)input\.value=elements\.query\.value/);
  // 描画のたびに同期する
  assert.match(appSource, /syncStickySearch\(\);\s*elements\.results\.scrollIntoView/);
  // スクロールしても残る
  assert.match(css, /\.sticky-search\s*\{[^}]*position:\s*sticky/);
  // タップ領域44px
  assert.match(css, /\.sticky-search input\s*\{[^}]*min-height:\s*44px/);
  ['JA', 'EN', 'ZH', 'KO'].forEach((language) => {
    assert.match(appSource, new RegExp(`${language}:\\{placeholder:'[^']+',submit:'[^']+',label:'[^']+'\\}`));
  });
});

// HOSHILU AIチャットが本番で動かないという報告 (2026-08-07)。画面には
// 「通信に失敗しました」としか出ず、catch {} が例外を完全に捨てていたため、
// Turnstileが未準備なのか、APIキーが未設定なのか、レート制限なのかが
// 利用者からも開発者からも分からなかった。原因の判別が付かない障害は
// 直しようがないので、コードを画面とコンソールの両方へ出す。
test('AIチャットの失敗はエラーコードを表示して原因が分かるようにする', () => {
  const chatUi = fs.readFileSync(new URL('../public/ai-search-ui.mjs', import.meta.url), 'utf8');
  // 例外を握り潰さない
  assert.doesNotMatch(chatUi, /\}\s*catch\s*\{\s*\n\s*status\.remove\(\);/);
  assert.match(chatUi, /catch \(error\)/);
  assert.match(chatUi, /console\.error\('HOSHILU_CHAT_FAILED'/);
  assert.match(chatUi, /\$\{copy\.error\}（\$\{code\}）/);
  // Turnstileが取れていないことを、通信失敗と区別して止める
  assert.match(chatUi, /if \(!token\) throw new Error\('TURNSTILE_TOKEN_UNAVAILABLE'\)/);
});
