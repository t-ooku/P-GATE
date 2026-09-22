// 2026-09-22 指示書「検索結果UI統合改修」。E2E の Case A〜H をそのまま固定する。
// ・HOSHILU＋Web を1本にまとめ、一致度順に並べる
// ・最大60件。**60件を埋めるために合わないものを混ぜない**
// ・HOSHILU商品だけ価格を出す。Web商品の価格は出さない
// ・同じ商品が両方にあれば HOSHILU を残す
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  UNIFIED_LIMIT, UNIFIED_PAGE_SIZE, canonicalProductUrl, dedupeKey, dedupeKeys, unifyResults
} from '../src/unified-results.mjs';

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

test('同点のときだけ HOSHILU を先に（§6）。Seller はさらに先', () => {
  const result = unifyResults({
    candidates: [
      candidate(1),
      candidate(2, { shop: { name: 'かばん堂', slug: 'kaban' } })
    ],
    googleItems: [web(1, { title: '黒 本革 トートバッグ web 1' })],
    query: QUERY
  });
  assert.deepEqual(result.items.map((item) => item.source), ['HOSHILU_SHOP', 'HOSHILU', 'WEB']);
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

// 2026-09-22 大隆さん指示「Amazonが検索した商品も提示してね」。
// Amazon は PA-API 未解放で HOSHILU 自身では商品を取れない。Google 側の検索を
// 「候補があるモールは除く」規則から外し、常に探しにいく。
test('Amazon だけは候補があっても web 検索から外さない', () => {
  const index = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(index, /excludeMarketplaces: \[\.\.\.presentMarketplaces\]\.filter\(\(marketplace\) => marketplace !== 'AMAZON_JP'\)/u);
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
test('web検索の一覧ページ・カテゴリページは商品として並べない', () => {
  const result = unifyResults({
    candidates: [],
    googleItems: [
      web(1, { title: 'Amazon.co.jp: ベースメイク: 韓国コスメストア', product_page: false }),
      web(2, { product_page: true })
    ],
    query: QUERY
  });
  assert.equal(result.items.length, 1, '一覧ページは落ちる');
  assert.ok(!result.items[0].product_name.includes('韓国コスメストア'));
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
