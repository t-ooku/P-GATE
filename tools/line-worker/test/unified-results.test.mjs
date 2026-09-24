// 2026-09-22 指示書「検索結果UI統合改修」。E2E の Case A〜H をそのまま固定する。
// ・HOSHILU＋Web を1本にまとめ、一致度順に並べる
// ・最大60件。**60件を埋めるために合わないものを混ぜない**
// ・HOSHILU商品だけ価格を出す。Web商品の価格は出さない
// ・同じ商品が両方にあれば HOSHILU を残す
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  UNIFIED_LIMIT, UNIFIED_PAGE_SIZE, canonicalProductUrl, dedupeKey, dedupeKeys, detailScore, priceOrder, relevanceThreshold, unifyResults
} from '../src/unified-results.mjs';
import { demandConditions } from '../src/shop-demand.mjs';

const QUERY = '黒 本革 トートバッグ';
const candidate = (n, over = {}) => ({
  display_name: `黒 本革 トートバッグ ${n}`,
  asin: `B0${String(n).padStart(8, '0')}`,
  image_urls: ['https://img.example/a.jpg'],
  product_url: `https://www.amazon.co.jp/dp/B0${String(n).padStart(8, '0')}`,
  offers: [{ total_cost: 12800, marketplace: 'AMAZON_JP', tracking_url: `https://hoshilu.app/go?token=h${n}` }],
  ...over
});
const web = (n, over = {}) => ({
  title: `黒 本革 トートバッグ web ${n}`,
  image_url: 'https://img.example/w.jpg',
  product_url: `https://zozo.jp/shop/item/${n}/`,
  tracking_url: `https://hoshilu.app/go?token=w${n}`,
  mall_label: 'ZOZOTOWN', marketplace: 'ZOZO_JP', listed_price_jpy: 9800,
  // Google 側は一覧・カテゴリページも返す。商品ページだけが商品として並ぶ。
  product_page: true,
  ...over
});
const many = (make, count) => Array.from({ length: count }, (_, i) => make(i + 1));

test('Case A: HOSHILU 30 + Web 30 → 60件', () => {
  const result = unifyResults({ candidates: many(candidate, 30), googleItems: many(web, 30), query: QUERY });
  assert.equal(result.shown, 60);
  assert.equal(result.hoshilu_count + result.web_count, 60);
  assert.equal(result.truncated, false);
});

test('Case B: HOSHILU 50 + Web 40 → 上位60件だけ。候補はもっとあると分かる', () => {
  const result = unifyResults({ candidates: many(candidate, 50), googleItems: many(web, 40), query: QUERY });
  assert.equal(result.shown, UNIFIED_LIMIT);
  assert.equal(result.total_candidates, 90);
  assert.equal(result.truncated, true, '「全部で60件」と誤解させないため');
});

test('Case C: HOSHILU 8 + Web 7 → 15件。60件まで埋めない', () => {
  const result = unifyResults({ candidates: many(candidate, 8), googleItems: many(web, 7), query: QUERY });
  assert.equal(result.shown, 15);
  assert.equal(result.truncated, false);
});

test('Case D: 同じ商品が両方にあれば HOSHILU を残して1件にする', () => {
  const shared = 'https://www.amazon.co.jp/dp/B000000001';
  const result = unifyResults({
    candidates: [candidate(1)],
    googleItems: [web(1, { product_url: `${shared}?tag=someone-22&utm_source=x` })],
    query: QUERY
  });
  assert.equal(result.shown, 1);
  assert.equal(result.items[0].source, 'HOSHILU');
});

test('Case E/F: HOSHILU商品だけ価格を出す。Web商品は価格を持たない', () => {
  const result = unifyResults({ candidates: [candidate(1)], googleItems: [web(9)], query: QUERY });
  const hoshilu = result.items.find((item) => item.source !== 'WEB');
  const webItem = result.items.find((item) => item.source === 'WEB');
  assert.equal(hoshilu.price_jpy, 12800);
  assert.equal(webItem.price_jpy, null, 'ページに書いてあっただけの数字を、確認した価格と同じ顔で出さない');
  for (const item of result.items) {
    assert.ok(item.product_name && item.url, '商品名と行き先は必ずある');
  }
  assert.equal(webItem.shop_name, 'ZOZOTOWN');
});

test('Case G: 12件ずつ読み込む前提を返す', () => {
  assert.equal(UNIFIED_PAGE_SIZE, 12);
  const result = unifyResults({ candidates: many(candidate, 30), googleItems: many(web, 30), query: QUERY });
  assert.equal(result.page_size, 12);
  assert.deepEqual(result.items.map((item) => item.position).slice(0, 3), [1, 2, 3]);
});

test('Case H: 61件以上の候補があっても60件で止め、低品質を足さない', () => {
  const result = unifyResults({
    candidates: many(candidate, 40),
    googleItems: [...many(web, 40), web(99, { title: 'まったく関係のない掃除機' })],
    query: QUERY
  });
  assert.equal(result.shown, 60);
  assert.ok(!result.items.some((item) => item.product_name.includes('掃除機')), '条件に合わないものを混ぜない');
});

// --- 並び順 -------------------------------------------------------------
test('一致度が高い方が上。HOSHILUだから上、にはしない', () => {
  const result = unifyResults({
    candidates: [candidate(1, { display_name: 'ブラウン 本革 トートバッグ' })],
    googleItems: [web(1, { title: '黒 本革 トートバッグ 完全一致' })],
    query: QUERY
  });
  assert.equal(result.items[0].source, 'WEB', '明らかにWebの方が一致していればWebを上に');
});

// 2026-09-24 大隆さん「ホシルもgoogle提示も平等なルールで順に表示すべき」「1本で平等に並べよう」。
test('同点なら HOSHILU と Web を交互に並べる。HOSHILU の中では Seller が先', () => {
  const result = unifyResults({
    candidates: [
      candidate(1),
      candidate(2, { shop: { name: 'かばん堂', slug: 'kaban' } })
    ],
    googleItems: [web(1, { title: '黒 本革 トートバッグ web 1' })],
    query: QUERY
  });
  assert.deepEqual(result.items.map((item) => item.source), ['HOSHILU_SHOP', 'WEB', 'HOSHILU']);
});

test('HOSHILU の候補が多くても、同点の Web は1ページ目に入る（最後尾に回さない）', () => {
  const result = unifyResults({
    candidates: many(candidate, 30),
    googleItems: many(web, 5),
    query: QUERY
  });
  const firstPage = result.items.slice(0, UNIFIED_PAGE_SIZE);
  const sources = firstPage.map((item) => (item.source === 'WEB' ? 'W' : 'H')).join('');
  assert.equal(firstPage.filter((item) => item.source === 'WEB').length, 5, `1ページ目: ${sources}`);
  assert.match(sources, /^HWHWHWHWHW/u, '交互に並ぶ');
  // Web 側の中の順番は、Google が返した順のまま
  const webOrder = result.items.filter((item) => item.source === 'WEB').map((item) => Number(item.product_name.match(/\d+$/u)[0]));
  assert.deepEqual(webOrder, [1, 2, 3, 4, 5]);
});

// レビューで見つかった取りこぼし: 「何番目か」を側全体で数えると、上の組や一覧ページで番号を
// 使った側が、次の同点の組で後ろにまとめて回されていた。同点の組の中で数える。
test('一致数の違う組があっても、同点の組の中では交互に並ぶ', () => {
  const result = unifyResults({
    candidates: [
      ...many(candidate, 4),
      ...[5, 6, 7, 8].map((n) => candidate(n, { display_name: `黒 トートバッグ ${n}` }))
    ],
    googleItems: many((n) => web(n, { title: `黒 トートバッグ web ${n}` }), 4),
    query: QUERY
  });
  const sources = result.items.map((item) => (item.source === 'WEB' ? 'W' : 'H')).join('');
  assert.equal(sources, 'HHHHHWHWHWHW', sources);
});

test('Web の一覧ページが多くても、Web の商品は HOSHILU と交互に並ぶ（一覧ページは最後）', () => {
  const result = unifyResults({
    candidates: many(candidate, 4),
    googleItems: [
      ...[1, 2, 3, 4].map((n) => web(n, { product_page: false })),
      ...[5, 6, 7, 8].map((n) => web(n))
    ],
    query: QUERY
  });
  const kinds = result.items.map((item) => (item.source === 'WEB' ? (item.listing ? 'L' : 'W') : 'H')).join('');
  assert.match(kinds, /^HWHWHWHW/u, kinds);
});

// 2026-09-24 大隆さん決定「1をベースに（点数を細かくする・出どころは一切見ない）、２のように順もユーザーが変えられる」。
test('細かい点は出どころを見ない（同じ中身なら HOSHILU でも Web でも同じ点）', () => {
  const conditions = demandConditions(QUERY);
  const row = { product_name: '黒 本革 トートバッグ A4', image_url: 'https://img.example/a.jpg', price_jpy: null, listed_price_jpy: 9800 };
  const points = ['HOSHILU_SHOP', 'HOSHILU', 'WEB'].map((source) => detailScore({ ...row, source }, conditions, QUERY));
  assert.deepEqual(points, [points[0], points[0], points[0]]);
  assert.equal(points[0], 4, '順番どおり+2・価格+1・写真+1');
  // 一覧ページの数字は価格として数えない
  assert.equal(detailScore({ ...row, listing: true }, conditions, QUERY), 3);
  // 確認済みの価格でも参考価格でも同じ1点
  assert.equal(detailScore({ ...row, price_jpy: 12800, listed_price_jpy: null }, conditions, QUERY), points[0]);
  // 条件が作れない検索では付けない（元の順番を保つ）
  assert.equal(detailScore(row, [], ''), 0);
  const source = readFileSync(new URL('../src/unified-results.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('export function detailScore('), source.indexOf('export function rankUnified('));
  assert.ok(!/source|SOURCE_RANK|HOSHILU|WEB/u.test(body), '細かい点の計算で出どころを読まない');
});

test('語の順番・価格・写真で差が付けば、HOSHILU か Web かに関係なく上に来る', () => {
  const result = unifyResults({
    candidates: [
      candidate(1, { display_name: 'A4 収納 大容量 通勤 トートバッグ 本革 黒' }),
      candidate(2, { display_name: 'トートバッグ 本革 黒', image_urls: [] })
    ],
    googleItems: [web(1, { title: '黒 本革 トートバッグ 通勤' })],
    query: QUERY
  });
  assert.deepEqual(result.items.map((item) => item.source), ['WEB', 'HOSHILU', 'HOSHILU']);
  assert.deepEqual(result.items.slice(1).map((item) => item.product_name), ['A4 収納 大容量 通勤 トートバッグ 本革 黒', 'トートバッグ 本革 黒']);
});

// レビューで判明: Web の商品名はページの題名そのままで「Amazon.co.jp: 」などの前置きが付く。
// 語の位置で点を付けると、同じ商品でも Web が負けていた。位置は使わない。
test('「Amazon.co.jp: 」「【楽天市場】」の前置きが付いた Web 商品名でも、同じ中身なら同じ点', () => {
  const conditions = demandConditions(QUERY);
  const base = { image_url: 'https://img.example/a.jpg', price_jpy: 12800, listed_price_jpy: null };
  const plain = detailScore({ ...base, product_name: 'レディース 通勤 A4 大容量 黒 本革 トートバッグ' }, conditions, QUERY);
  for (const prefix of ['Amazon.co.jp: ', '【楽天市場】', '【Yahoo!ショッピング】ストア名 | ']) {
    const webRow = { ...base, price_jpy: null, listed_price_jpy: 12800, product_name: `${prefix}レディース 通勤 A4 大容量 黒 本革 トートバッグ : バッグ` };
    assert.equal(detailScore(webRow, conditions, QUERY), plain, prefix);
  }
});

test('価格が分からない Web 商品は、同じ一致なら価格の分かる商品の後ろ（出どころでなく価格の有無で決まる）', () => {
  const result = unifyResults({
    candidates: [candidate(1)],
    googleItems: [web(1, { listed_price_jpy: null }), web(2)],
    query: QUERY
  });
  const names = result.items.map((item) => item.product_name);
  assert.equal(names.at(-1), '黒 本革 トートバッグ web 1');
});

test('安い順の並びもサーバーが作る。参考価格も同じ物差し、価格なしと一覧ページは最後', () => {
  const result = unifyResults({
    candidates: [
      candidate(1, { offers: [{ total_cost: 12800, marketplace: 'AMAZON_JP', tracking_url: 'https://hoshilu.app/go?token=h1' }] }),
      candidate(2, { offers: [{ total_cost: 5980, marketplace: 'AMAZON_JP', tracking_url: 'https://hoshilu.app/go?token=h2' }] })
    ],
    googleItems: [
      web(1, { listed_price_jpy: 9800 }),
      web(2, { listed_price_jpy: null }),
      web(3, { product_page: false, listed_price_jpy: 100 })
    ],
    query: QUERY
  });
  const byPosition = new Map(result.items.map((item) => [item.position, item]));
  const cheapFirst = result.price_order.map((position) => byPosition.get(position));
  assert.equal(result.price_order.length, result.items.length);
  assert.deepEqual(cheapFirst.slice(0, 3).map((item) => item.price_jpy || item.listed_price_jpy), [5980, 9800, 12800]);
  assert.ok(cheapFirst.slice(3).every((item) => !(item.price_jpy > 0) && !(item.listed_price_jpy > 0)), '価格なし・一覧は後ろ');
  assert.equal(cheapFirst.at(-1).listing, true, '一覧ページの数字は価格として使わない');
  // 同じ価格ならおすすめ順
  assert.deepEqual(priceOrder([{ position: 2, price_jpy: 100 }, { position: 1, listed_price_jpy: 100 }, { position: 3 }]), [1, 2, 3]);
  // 数字でないもの・無限大・一覧ページの数字は価格として扱わない
  assert.deepEqual(priceOrder([{ position: 1, price_jpy: Infinity }, { position: 2, listed_price_jpy: 'abc' }, { position: 3, listing: true, listed_price_jpy: 1 }, { position: 4, price_jpy: 500 }]), [4, 1, 2, 3]);
});

test('条件が作れない検索では、絞り込まず元の順番を保つ', () => {
  const result = unifyResults({ candidates: many(candidate, 3), googleItems: many(web, 3), query: '' });
  assert.equal(result.shown, 6, '判定できないものを「合わない」と決めつけない');
  assert.equal(result.ranked_by_conditions, false);
});

test('一致した条件と、一致していない条件を必ず両方持たせる', () => {
  const result = unifyResults({
    candidates: [candidate(1, { display_name: '本革 トートバッグ' })],
    googleItems: [], query: QUERY
  });
  assert.ok(Array.isArray(result.items[0].matched));
  assert.ok(Array.isArray(result.items[0].unmatched));
  assert.ok(result.items[0].unmatched.length > 0, '足りない条件を隠さない');
});

// --- 重複判定 -----------------------------------------------------------
test('計測用のパラメータだけ落として同じURLと見る', () => {
  const a = canonicalProductUrl('https://www.amazon.co.jp/dp/B01?tag=x-22&utm_source=y');
  const b = canonicalProductUrl('http://amazon.co.jp/dp/B01/');
  assert.equal(a, b);
  // 商品を決めているパラメータは落とさない
  assert.notEqual(canonicalProductUrl('https://zozo.jp/shop?goods=1'), canonicalProductUrl('https://zozo.jp/shop?goods=2'));
  assert.equal(canonicalProductUrl('javascript:alert(1)'), '');
});

test('鍵は ASIN → JAN → URL → 商品名 の順で使う', () => {
  assert.equal(dedupeKey({ asin: 'B0ABCDEFGH', url: 'https://a.example/x' }), 'asin:B0ABCDEFGH');
  assert.equal(dedupeKey({ jan: '4901234567894', url: 'https://a.example/x' }), 'jan:4901234567894');
  assert.match(dedupeKey({ url: 'https://a.example/x' }), /^url:/u);
  assert.equal(dedupeKey({ product_name: 'かばん' }), 'name:かばん');
  assert.equal(dedupeKey({}), '');
  // HOSHILU は ASIN を、Web は URL しか持たないことが多い。どれか1つ一致すれば同じ商品と見る
  assert.deepEqual(dedupeKeys({ product_url: 'https://www.amazon.co.jp/dp/B0ABCDEFGH' }),
    ['url:amazon.co.jp/dp/B0ABCDEFGH', 'asin:B0ABCDEFGH']);
});

test('行き先が https で無いものは出さない', () => {
  const result = unifyResults({
    candidates: [candidate(1, { offers: [{ total_cost: 100, tracking_url: 'http://insecure.example/x' }], product_url: '' })],
    googleItems: [web(1, { tracking_url: '', product_url: '' })],
    query: QUERY
  });
  assert.equal(result.shown, 0);
});

test('価格が確認できない HOSHILU 商品に 0円と書かない', () => {
  const result = unifyResults({
    candidates: [candidate(1, { offers: [{ marketplace: 'AMAZON_JP', tracking_url: 'https://hoshilu.app/go?token=h1' }] })],
    googleItems: [], query: QUERY
  });
  assert.equal(result.items[0].price_jpy, null);
});

test('サーバーが並べる（ブラウザで並べ直さない）', () => {
  const index = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(index, /import \{ unifyResults \} from '\.\/unified-results\.mjs';/u);
  assert.match(index, /unified_results: unifyResults\(/u);
});

// 2026-09-22 大隆さん指示「ホシル提示は、5個ボタン設置」。
// 画面が元の候補へ戻れるよう、HOSHILU 行には候補の番号を付けて返す。
// 名前で突き合わせると、同じ名前の別商品にボタンが付く。
test('HOSHILU 行は元の候補の番号を持ち、Web 行は持たない', () => {
  const result = unifyResults({
    candidates: [candidate(1), candidate(2)],
    googleItems: [web(1)],
    query: QUERY
  });
  for (const item of result.items) {
    if (item.source === 'WEB') assert.equal(item.candidate_index, null);
    else assert.ok(Number.isInteger(item.candidate_index) && item.candidate_index >= 0, item.product_name);
  }
  const hoshilu = result.items.filter((item) => item.source !== 'WEB');
  assert.deepEqual([...new Set(hoshilu.map((item) => item.candidate_index))].length, hoshilu.length, '番号が重ならない');
});

// 2026-09-22 大隆さん指示「Amazonが検索した商品も提示してね」
// →「検索したら、ホシルもGoogleの提示が必ずたくさん出ること」。
// Amazon だけを外す形から、モール単位で捨てるのをやめる形へ広げた。
// 重複は unifyResults が ASIN・JAN・URL でまとめる。
test('web 検索の結果をモール単位で捨てない（Amazon を含む）', () => {
  const index = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(index, /excludeMarketplaces: \[\]/u);
  assert.ok(!index.includes("marketplace !== 'AMAZON_JP'"), 'Amazon だけの例外は要らなくなった');
});

// 2026-09-22 大隆さん報告「リンク先に飛ばない」（TRACK_TOKEN_FORMAT_INVALID）。
// 送客リンクは /go?token=... で、token には行き先URLごと署名した中身が入る。
// 長い商品URLだと token だけで600字を超え、署名の前で千切れていた。
test('長い送客リンクを途中で切らない', () => {
  const long = `https://hoshilu.app/go?token=${'a'.repeat(900)}.${'b'.repeat(43)}`;
  const result = unifyResults({
    candidates: [],
    googleItems: [web(1, { tracking_url: long })],
    query: QUERY
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].url, long, 'トークンが欠けていない');
});

// 2026-09-22 大隆さん報告「価格もでてない」。
test('web検索の価格は別の欄で返す（確認済みの価格とは混ぜない）', () => {
  const result = unifyResults({
    candidates: [],
    googleItems: [web(1, { listed_price_jpy: 1980 })],
    query: QUERY
  });
  assert.equal(result.items[0].price_jpy, null, 'API確認価格としては出さない');
  assert.equal(result.items[0].listed_price_jpy, 1980);
});

// 2026-09-22 大隆さん報告「web検索、提示してるの商品じゃないやん」。
// Google 側は「Amazon.co.jp: ベースメイク: 韓国コスメストア」のような
// カテゴリ・ストアの一覧ページも返す。ここは商品を並べる列なので入れない。
// 2026-09-22 大隆さん報告「web検索提示がない。どうにか出して。Googleの直検索なら出るよ」。
// 広い言葉では Google が返すのは一覧ページばかりで、商品ページだけに絞ると0件になる。
// 落とさずに出し、「一覧ページ」と断って商品の後ろに並べる。
test('web検索の一覧ページは、商品の後ろに「一覧ページ」として並べる', () => {
  const result = unifyResults({
    candidates: [],
    googleItems: [
      web(1, { product_page: false }),
      web(2, { product_page: true })
    ],
    query: QUERY
  });
  assert.equal(result.items.length, 2, '一覧ページも出す');
  assert.equal(result.items[0].listing, false, '商品が先');
  assert.equal(result.items[1].listing, true, '一覧は後ろ');
  // 一覧ページに価格は出さない（商品の価格ではない）
  assert.equal(result.items[1].listed_price_jpy, null);
});

// 2026-09-22 大隆さん報告「価格出てない」。
// 送料込みの合計が取れている商品は少なく、多くは商品価格しか持っていない。
// 合計だけを見ていたため、価格のある商品まで無表示になっていた。
test('送料込みの合計が無くても、商品価格があれば出す', () => {
  const result = unifyResults({
    candidates: [candidate(1, {
      offers: [{ marketplace: 'QOO10_JP', tracking_url: 'https://hoshilu.app/go?token=h1', price: 1210 }]
    })],
    googleItems: [],
    query: QUERY
  });
  assert.equal(result.items[0].price_jpy, 1210);
});

test('価格がどこにも無ければ 0 と書かない', () => {
  const result = unifyResults({
    candidates: [candidate(1, {
      offers: [{ marketplace: 'QOO10_JP', tracking_url: 'https://hoshilu.app/go?token=h1' }]
    })],
    googleItems: [],
    query: QUERY
  });
  assert.equal(result.items[0].price_jpy, null);
});

// 2026-09-22 大隆さん報告「ホシル提示でなくなったとや」。
// 価格を持つ offer を1つ選んでリンクにも使っていたため、価格はあるがリンクの無い
// offer が選ばれると商品ごと落ちていた。リンクと価格は別の offer から読む。
test('価格のある offer にリンクが無くても、商品を落とさない', () => {
  const result = unifyResults({
    candidates: [candidate(1, {
      product_url: '',
      offers: [
        { marketplace: 'QOO10_JP', price: 1210 },
        { marketplace: 'RAKUTEN', tracking_url: 'https://hoshilu.app/go?token=h1' }
      ]
    })],
    googleItems: [],
    query: QUERY
  });
  assert.equal(result.items.length, 1, '商品が残る');
  assert.equal(result.items[0].url, 'https://hoshilu.app/go?token=h1');
  assert.equal(result.items[0].price_jpy, 1210);
});

// 2026-09-22 大隆さん報告「スカルプに何故この商品が提示されたの？」。
// 「2列に割れる」を直すために、一時的に「1件も残らないなら絞り込む前を出す」に
// していたが、それはスカルプブラシの検索にリバティ生地を出すということだった。
// 関係のない商品は出さない。0 件なら 0 件のまま返す（画面側で1行断る）。
test('条件に合わない商品は、1件も残らなくても混ぜない', () => {
  const result = unifyResults({
    candidates: [candidate(1, { display_name: 'まったく関係のない品物' })],
    googleItems: [web(1, { title: 'これも関係のない品物' })],
    query: QUERY
  });
  assert.equal(result.items.length, 0, '関係のない商品を出さない');
});

// 2026-09-22 大隆さん指示「検索したら、ホシルもGoogleの提示が必ずたくさん出ること。
// 関係ないものは提示しないこと」。
//
// これまでは「1語でも当たれば出す」だった。「LILIB 韓国 頭皮ケア」に対して
// LILIBETH の化粧水（LILIB だけ）や BUYMA の韓国ワンピース（韓国 だけ）が残っていた。
// 条件の半分以上（切り上げ）当たったものだけを出す。
test('語数が多い検索で、1語だけ当たった関係のない商品を出さない', () => {
  const result = unifyResults({
    candidates: [
      candidate(1, { display_name: 'LILIBETH ローズディープ トナー 化粧水' }),
      candidate(2, { display_name: 'LILIB 韓国 頭皮ケア スカルプブラシ' }),
      candidate(3, { display_name: '韓国 頭皮ケア シャンプー' })
    ],
    googleItems: [web(1, { title: '韓国ファッション ネイビー系 ワンピース - BUYMA' })],
    query: 'LILIB 韓国 頭皮ケア'
  });
  const names = result.items.map((item) => item.product_name);
  assert.ok(names.some((name) => name.includes('スカルプブラシ')), '合うものは残す');
  assert.ok(names.some((name) => name.includes('シャンプー')), '2語当たれば残す');
  assert.ok(!names.some((name) => name.includes('化粧水')), 'LILIB だけの化粧水は出さない');
  assert.ok(!names.some((name) => name.includes('ワンピース')), '韓国 だけのワンピースは出さない');
});

test('半分以上で1件も残らないときは、1語一致まで緩める（無言で0件にしない）', () => {
  const result = unifyResults({
    candidates: [candidate(1, { display_name: '韓国 コスメ ポーチ' })],
    googleItems: [],
    query: 'LILIB 韓国 頭皮ケア'
  });
  assert.equal(result.items.length, 1, '1語一致まで緩める');
});

test('しきい値: 1語→1, 2語→1, 3語→2, 4語→2, 5語→3', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(relevanceThreshold), [1, 1, 2, 2, 3]);
});

// 2026-09-22 大隆さん指示「Googleの提示が必ずたくさん出ること」。
// HOSHILU に候補があるモールを Google 側から捨てていたぶん、提示が減っていた。
// 重複は unifyResults がまとめるので、捨てずに全部受け取る。
test('Google 側の結果をモール単位で捨てない', () => {
  const index = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(index, /excludeMarketplaces: \[\]/u);
});
