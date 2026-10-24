// 2026-10-14 大隆さん指示「オウンドメディア作って」。
//
// ホシルの読みもの（/media）。既存の買い物ガイド 142 本の実測（8/12〜10/14）では、一般的な「○○の選び方」は
// ほぼ読まれず、読まれているのは「探し方」「セール時期」「モールの比べ方」「出店者向け」だった。
// そこで、ここでは次の 2 つだけを出す。
//   1. ホシル自身の価格記録から毎日自動で作る「値下がりした商品」（他のサイトが持っていないデータ）
//   2. 実際に読まれている記事と、目的別に選んだ既存記事
//
// 守ること:
// - 価格は HOSHILU が楽天市場・Yahoo!ショッピングの API で確認した記録（price_observations）だけ。推測で埋めない。
// - 値下がり記事に載せるのは、モール公式ランキング経由で記録した商品だけ（利用者の検索から記録した商品は載せない。
//   誰かの検索の中身が、公開ページから推し量れないように）。
// - 価格は「確認した時点」のもの。現在の価格と在庫は商品ページ（/product）で、いま API に取りに行って出す。
// - 将来の価格は予言しない。「最安」「今が買い時」とは書かない。
// - 広告（アフィリエイト）を含むことを明記する。掲載と並び順は価格の記録だけで決める。
import { isSeasonalProduct, seasonFor } from './season-calendar.mjs';
import { seoArticleCard } from './seo-pages.mjs';
import { jstDate } from './price-observations.mjs';
import { RAKUTEN_RANKING_CATEGORIES } from './marketplace-ranking.mjs';

const ORIGIN = 'https://hoshilu.app';
export const MEDIA_NAME = 'ホシルの買い物ノート';
export const MEDIA_PATHS = ['/media', '/media/price-drops'];
const CACHE_SECONDS = 1800;
// ページの作りを変えたら上げる。30 分の保存の鍵に入れ、反映と同時に新しい作りへ切り替える（古い保存を出し続けない）。
// 2026-10-19 v8: 値下がりの並びを服寄りに（服 2 → 服以外 1）。古いキャッシュの並びを使わない。
// （#682 は push 後の wrangler deploy だけが失敗したため、この行で反映し直す）
export const MEDIA_TEMPLATE_VERSION = '9';
const PRICE_RECORD_STARTED = '2026-10-03';
const MALL_LABEL = { RAKUTEN_JP: '楽天市場', YAHOO_JP: 'Yahoo!ショッピング' };

// 値下がりの条件。数字を変えたらページの説明文（DROP_RULE_TEXT）も合わせる。
export const DROP_RULES = Object.freeze({
  windowDays: 14,     // 直近 14 日の記録で比べる
  minDays: 3,         // 3 日以上記録がある商品だけ
  freshDays: 2,       // 最後の記録が 2 日以内
  minDropRate: 0.10,  // 記録上の最高値から 10% 以上下がった
  maxDropRate: 0.70,  // 70% を超える下がり方は、別の型番・セット違いの取り違えを疑って載せない
  limit: 30
});
const DROP_RULE_TEXT = '直近14日のうち3日以上価格を記録した商品で、記録上の最高値から10%以上（70%以下）下がり、最後の確認が2日以内のもの';

// 目的別の入口。2026-10-14 の実測で読まれていた型を中心に選ぶ（slug が無くなったらテストで止まる）。
// 2026-10-15: Search Console で 7〜11 位にいる「同一商品」「Amazon セール 通知」の記事を足す。
export const MEDIA_SECTIONS = Object.freeze([
  { id: 'find', kicker: 'FIND', title: '名前が分からない物を探す', description: '見た目・用途・写真から、商品名にたどり着く方法。', slugs: [
    'find-product-without-name', 'how-to-search-by-description', 'identify-correct-product-name-from-vague-memory',
    'search-products-from-saved-images', 'find-fashion-items-seen-on-instagram'] },
  { id: 'timing', kicker: 'TIMING', title: 'セールと買い時', description: '大型セールの時期と、その値引きが本当に得かを確かめる方法。', slugs: [
    'qoo10-mega-sale-next-round-alert', 'sale-notification-only-for-malls-you-use', 'prime-day-vs-rakuten-super-sale-vs-mega-wari', 'check-if-sale-price-is-really-cheaper',
    'is-it-cheaper-to-wait-for-sale', 'track-price-history-before-buying', 'usual-hoshilu-never-run-out-of-daily-essentials'] },
  { id: 'compare', kicker: 'COMPARE', title: 'モールを比べる', description: 'Amazon・楽天市場・Yahoo!ショッピング・Qoo10 の違いと、まとめて比べる方法。', slugs: [
    'how-to-compare-the-same-product', 'compare-amazon-rakuten-yahoo-shopping', 'compare-amazon-and-rakuten', 'compare-qoo10-and-rakuten',
    'compare-online-shopping-sites', 'cross-search-ec-sites'] },
  { id: 'sellers', kicker: 'FOR SELLERS', title: '出店者・メーカーの方へ', description: 'モールの外で探されている需要と、見つけてもらう方法。', slugs: [
    'ec-repeat-customers', 'oudan-kensaku-de-mitsukete-morau', 'mall-seller-see-demand-outside-the-mall',
    'pr-post-rules-for-influencers', 'sell-more-on-ec-malls'] }
]);

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
const yen = (n) => `¥${Math.round(Number(n) || 0).toLocaleString('ja-JP')}`;
const daysAgo = (now, days) => jstDate(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));

// 値下がりに載せてよい記録の元（どれも公開ランキング・固定の検索語。利用者の検索から記録した商品は載せない）。
// 2026-10-17 大隆さん「特に韓国系とかもね」: 韓国コスメ棚・韓国ファッション（buzz-shelf.mjs）を足した。
// 2026-10-19 大隆さん「服に寄せる」: 楽天の服（ジャンル固定・口コミ件数順の公式商品検索）を足した（buzz-shelf.mjs recordRakutenFashionPrices）。
export const DROP_SOURCES = Object.freeze(['rakuten_ranking_api', 'yahoo_korean_beauty', 'yahoo_korean_fashion', 'rakuten_fashion_review']);

// 2026-10-17 大隆さん「値下がり中のリアル画像を、デカデカとアピール。若い者向けや主婦向け、流行ってるアパレルや生活雑貨も。特に韓国系」:
// SNS の値下がり投稿に載せる順（data-focus）。韓国系 → アパレル → 生活雑貨 → 美容 の順に 1 つずつ回し、残りは下がり幅の大きい順。
// 一覧ページの並び（下がり幅の大きい順）は変えない。
// 2026-10-19 大隆さん「もっと売上増やそう」→「服に寄せる」（楽天で売れているのは服のお店）:
// 服（韓国ファッション・レディース・メンズ・靴・バッグ）を先頭に、1 巡ごとに服 2 つ → 服以外 1 つ（韓国コスメ・生活雑貨・美容を日替わりで回す）。
// 服が尽きたら残りのジャンルを 1 つずつ回し、最後は下がり幅の大きい順。一覧ページの並び（下がり幅の大きい順）は変えない。
const DROP_SEGMENTS = Object.freeze([
  { id: 'fashion', categories: ['korean_fashion', 'womens_fashion', 'mens_fashion', 'shoes', 'womens_sneakers', 'bags'] },
  { id: 'korean', categories: ['buzz_korean_beauty'] },
  { id: 'daily', categories: ['daily_goods', 'kitchen', 'interior', 'kids_baby', 'pet'] },
  { id: 'beauty', categories: ['beauty_cosme', 'skincare', 'face_wash', 'face_lotion', 'beauty_health_appliance'] }
]);
const EXTRA_CATEGORY_LABEL = { buzz_korean_beauty: '韓国コスメ', korean_fashion: '韓国ファッション' };
export const DROP_FOCUS_LIMIT = 8;
export const DROP_FASHION_PER_ROUND = 2;

export function dropSegment(row = {}) {
  const category = String(row.category_id || '');
  const segment = DROP_SEGMENTS.find((item) => item.categories.includes(category));
  const label = EXTRA_CATEGORY_LABEL[category] || SHELF_CATEGORY.get(category) || '';
  // 商品名に「韓国」とあってジャンルの分からない物（服でも美容でもない）は韓国系として回す
  if (!segment && /韓国/u.test(String(row.product_name || ''))) return { id: 'korean', label: label || '韓国系' };
  return { id: segment?.id || 'other', label };
}

// rotate: 日替わりの番号。服以外のジャンルの順番と、各ジャンルの中の並び（2 つずつずらす）を日替わりにする。
// season: その時期の季節（season-calendar.mjs）。商品名が季節の目印に合う物を、各ジャンルの中で先に出す（2026-10-20 大隆さん「季節やトレンドを読む」）。
export function withDropFocus(drops, limit = DROP_FOCUS_LIMIT, rotate = 0, season = null) {
  if (!Array.isArray(drops)) return drops;
  const rows = drops.map((row) => ({ ...row, segment: dropSegment(row) }));
  const others = DROP_SEGMENTS.slice(1).map((segment) => segment.id);
  const shift = ((Number(rotate) || 0) % others.length + others.length) % others.length;
  // 2026-10-18 10/17 と 10/18 の投稿で 6 商品中 4 つが同じだった（大隆さん 10/17「昨日と同じ投稿」）:
  // ジャンルの中の並びも日替わりで 2 つずつずらす（下がり幅の大きい順を起点に、毎日ちがう商品から選ぶ）。
  const dayOffset = Math.max(0, Math.floor(Number(rotate) || 0)) * 2;
  const turn = (pool) => (pool.length > 1 ? [...pool.slice(dayOffset % pool.length), ...pool.slice(0, dayOffset % pool.length)] : pool);
  const poolOf = (id) => {
    const pool = rows.filter((row) => row.image_url && row.segment.id === id);
    // 季節の物を先に（季節の物どうし・それ以外どうしの中では、従来どおり日替わりでずらす）
    const seasonal = pool.filter((row) => isSeasonalProduct(row.product_name, season));
    return [...turn(seasonal), ...turn(pool.filter((row) => !seasonal.includes(row)))];
  };
  const fashion = poolOf('fashion');
  const otherPools = [...others.slice(shift), ...others.slice(0, shift)].map(poolOf);
  const rest = poolOf('other');
  // 1 投稿に同じお店の商品は 1 つまで（10/18: 同じ店の同じファンデーションの本品と詰め替えが 2 枚並んだ）
  const shops = new Set();
  const take = (pool) => {
    while (pool.length) {
      const row = pool.shift();
      const shop = row.seller_id ? `${row.marketplace || ''}:${row.seller_id}` : '';
      if (shop && shops.has(shop)) continue;
      if (shop) shops.add(shop);
      return row;
    }
    return null;
  };
  const picked = [];
  const push = (pool) => { if (pool.length && picked.length < limit) { const row = take(pool); if (row) { picked.push(row); return true; } } return false; };
  let next = 0;
  while (picked.length < limit && (fashion.length || otherPools.some((pool) => pool.length))) {
    for (let i = 0; i < DROP_FASHION_PER_ROUND; i += 1) push(fashion);
    // 服以外は 1 巡に 1 つ（空のジャンルは飛ばす）。服が尽きたら服以外を 1 つずつ回す
    const rounds = fashion.length ? 1 : otherPools.length;
    for (let r = 0; r < rounds; r += 1) {
      for (let tries = 0; tries < otherPools.length; tries += 1) {
        const pool = otherPools[next % otherPools.length];
        next += 1;
        if (push(pool)) break;
      }
    }
  }
  while (rest.length && picked.length < limit) push(rest);
  picked.forEach((row, index) => { row.focus = index + 1; });
  return rows;
}

// 値下がりした商品（ホシルの価格記録だけで決める）。表が無い・読めない時は null（0 件とは区別する）。
export async function loadPriceDrops(env, { now = new Date(), rules = DROP_RULES } = {}) {
  const db = env?.PRODUCT_DB;
  if (!db) return null;
  const today = jstDate(now);
  const since = daysAgo(now, rules.windowDays);
  const freshSince = daysAgo(now, rules.freshDays);
  try {
    const { results = [] } = await db.prepare(`WITH w AS (
        SELECT marketplace, external_product_id, seller_id, record_key, product_name, observed_date, price, stock_status,
          ROW_NUMBER() OVER (PARTITION BY marketplace, external_product_id, seller_id ORDER BY observed_date DESC) AS rn,
          MAX(price) OVER (PARTITION BY marketplace, external_product_id, seller_id) AS max_price,
          COUNT(*) OVER (PARTITION BY marketplace, external_product_id, seller_id) AS days
        FROM price_observations WHERE observed_date >= ?1 AND observed_date <= ?2)
      SELECT w.marketplace, w.seller_id, w.record_key, w.product_name, w.observed_date AS latest_date, w.price AS latest_price,
        w.max_price, w.days,
        (SELECT MAX(m.observed_date) FROM price_observations m WHERE m.marketplace = w.marketplace
          AND m.external_product_id = w.external_product_id AND m.seller_id = w.seller_id
          AND m.price = w.max_price AND m.observed_date >= ?1) AS max_date
      FROM w
      WHERE w.rn = 1 AND w.days >= ?3 AND w.observed_date >= ?4 AND w.stock_status <> 'OUT_OF_STOCK'
        AND w.price <= w.max_price * (1 - ?5) AND w.price >= w.max_price * (1 - ?6)
        AND EXISTS (SELECT 1 FROM price_observations r WHERE r.marketplace = w.marketplace
          AND r.external_product_id = w.external_product_id AND r.source IN (${DROP_SOURCES.map((source) => `'${source}'`).join(',')}))
      ORDER BY (w.max_price - w.price) * 1.0 / w.max_price DESC, w.observed_date DESC
      LIMIT ?7`).bind(since, today, rules.minDays, freshSince, rules.minDropRate, rules.maxDropRate, rules.limit).all();
    return results.map((row) => ({
      record_key: String(row.record_key || ''),
      marketplace: String(row.marketplace || ''),
      // 1 投稿に同じお店は 1 つまで（withDropFocus）。画面には出さない（#673 で読むようにしたが、ここで落としていた）
      seller_id: String(row.seller_id || ''),
      product_name: String(row.product_name || '').replace(/\s+/gu, ' ').trim().slice(0, 90),
      latest_price: Number(row.latest_price) || 0,
      latest_date: String(row.latest_date || ''),
      max_price: Number(row.max_price) || 0,
      max_date: String(row.max_date || ''),
      days: Number(row.days) || 0,
      drop_rate: row.max_price ? Math.round((1 - Number(row.latest_price) / Number(row.max_price)) * 100) : 0
    })).filter((row) => row.record_key && row.product_name && row.latest_price > 0 && row.max_price > row.latest_price);
  } catch {
    return null;
  }
}

// 2026-10-14 大隆さん指示「商品画像も表示して。人は視認性が大切よ。あと価格履歴ね」。
// 画像: 値下がり記事に載せるのはモール公式ランキング経由の商品だけなので、ランキングの保存データ
// （marketplace_ranking_cache の公式 API の結果）から record_key で引く。D1 の表は変えない。
// 見つからない商品は画像なしの枠にする（別の商品の画像で埋めない）。
export function largerImage(url) {
  const value = String(url || '');
  if (!/^https:\/\//iu.test(value)) return '';
  // 楽天のサムネイルは ?_ex=128x128 のようにサイズを指定できる。カードで粗く見えないよう 300px を求める。
  return /thumbnail\.image\.rakuten\.co\.jp/iu.test(value) ? value.replace(/([?&]_ex=)\d+x\d+/iu, '$1300x300') : value;
}

export async function loadRankingImages(env, recordKeys = []) {
  const db = env?.PRODUCT_DB;
  const wanted = new Set(recordKeys.filter(Boolean));
  const images = new Map();
  if (!db || !wanted.size) return images;
  try {
    const { results = [] } = await db.prepare(`SELECT category_id, payload_json FROM marketplace_ranking_cache
      WHERE marketplace_id IN ('RAKUTEN_JP','YAHOO_JP') ORDER BY updated_at DESC LIMIT 200`).all();
    // 商品のジャンル（保存した一覧の category_id）も一緒に返す（SNS の値下がり投稿の並びとラベルに使う）
    images.category = new Map();
    for (const row of results) {
      let items = [];
      try { items = JSON.parse(row.payload_json); } catch { items = []; }
      for (const item of Array.isArray(items) ? items : []) {
        const key = String(item?.record_key || '');
        if (wanted.has(key) && row.category_id && !images.category.has(key)) images.category.set(key, String(row.category_id).replace(/^buzz_(?!korean)/u, ''));
        if (!wanted.has(key) || images.has(key)) continue;
        const image = largerImage(item?.image_url || (Array.isArray(item?.image_urls) ? item.image_urls[0] : ''));
        if (image) images.set(key, image);
      }
    }
  } catch {}
  return images;
}

// 価格履歴: HOSHILU が記録した日の価格だけ（記録の無い日は線でつなぐだけで、値を作らない）。
export async function loadPriceHistories(env, recordKeys = [], { now = new Date(), days = DROP_RULES.windowDays } = {}) {
  const db = env?.PRODUCT_DB;
  const keys = [...new Set(recordKeys.filter(Boolean))].slice(0, 90);
  const histories = new Map();
  if (!db || !keys.length) return histories;
  try {
    const placeholders = keys.map((_, index) => `?${index + 3}`).join(',');
    const { results = [] } = await db.prepare(`SELECT record_key, observed_date, MIN(price) AS price FROM price_observations
      WHERE observed_date >= ?1 AND observed_date <= ?2 AND record_key IN (${placeholders})
      GROUP BY record_key, observed_date ORDER BY record_key, observed_date`)
      .bind(daysAgo(now, days), jstDate(now), ...keys).all();
    for (const row of results) {
      const key = String(row.record_key || '');
      if (!histories.has(key)) histories.set(key, []);
      histories.get(key).push({ date: String(row.observed_date || ''), price: Number(row.price) || 0 });
    }
  } catch {}
  return histories;
}

export async function withImagesAndHistory(env, drops, { now = new Date() } = {}) {
  if (!Array.isArray(drops) || !drops.length) return drops;
  const keys = drops.map((row) => row.record_key);
  const [images, histories] = await Promise.all([loadRankingImages(env, keys), loadPriceHistories(env, keys, { now })]);
  const dayNumber = Math.floor((now.getTime() + 9 * 60 * 60 * 1000) / 86_400_000);
  return withDropFocus(drops.map((row) => ({ ...row, image_url: images.get(row.record_key) || '',
    category_id: images.category?.get(row.record_key) || '', history: histories.get(row.record_key) || [] })), DROP_FOCUS_LIMIT, dayNumber, seasonFor(now));
}

// 小さな折れ線（価格履歴）。CSP（style-src 'self'）に合わせ、色や太さは CSS のクラスで付ける。
export function sparkline(history = []) {
  const points = (Array.isArray(history) ? history : []).filter((point) => point.price > 0);
  if (points.length < 2) return '';
  const width = 220;
  const height = 48;
  const pad = 5;
  const prices = points.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const first = Date.parse(`${points[0].date}T00:00:00Z`);
  const span = Math.max(1, Date.parse(`${points[points.length - 1].date}T00:00:00Z`) - first);
  const xy = points.map((point) => {
    const x = pad + ((Date.parse(`${point.date}T00:00:00Z`) - first) / span) * (width - pad * 2);
    const y = max === min ? height / 2 : pad + ((max - point.price) / (max - min)) * (height - pad * 2);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  });
  const line = xy.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `${xy[0][0]},${height} ${line} ${xy[xy.length - 1][0]},${height}`;
  const [lastX, lastY] = xy[xy.length - 1];
  const label = `価格の推移（${points.length}日分の記録）: ${points.map((point) => `${point.date.slice(5).replace('-', '/')} ${yen(point.price)}`).join('、')}`;
  return `<svg class="media-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}"><polygon class="media-spark-area" points="${area}"/><polyline class="media-spark-line" points="${line}"/><circle class="media-spark-dot" cx="${lastX}" cy="${lastY}" r="3.5"/></svg>`;
}

// 2026-10-14 大隆さん指示「ページの後半は文章だけになってるじゃん。もっと商品画像や価格履歴をたくさん表示して」。
// ジャンル別の「いま売れている商品と価格の動き」。楽天市場の公式ランキング（BUZZ が保存した公式 API の結果）の
// 上位商品に、ホシルの価格記録の折れ線を付ける。公開ランキングの商品だけなので、利用者の検索の中身は出ない。
// 3 日より古い保存は使わない（古い順位を「いま売れている」と言わない）。
const SHELF_CATEGORY = new Map(RAKUTEN_RANKING_CATEGORIES.map((category) => [category.id, category.label]));
export const SHELF_RULES = Object.freeze({ categories: 6, perCategory: 4, freshDays: 3 });

// 2026-10-24 大隆さん「閲覧数と購入サイト送客を100倍に増やして」→「検索記事を大量に作る」:
// ジャンルごとのページ（/media/genre/<slug>、楽天の公式ランキングのジャンル 22）。「〇〇 値下がり」「〇〇 ランキング 価格」で探す人に向けて、
// そのジャンルの公式ランキング上位（最大 20）と値下がりした商品に、ホシルの価格記録の折れ線を付ける。毎日中身が変わる。
// 載せるのは公開ランキングと価格記録だけ（利用者の検索は使わない）。記録の付いた商品が少ない日は索引させない（薄いページを出さない）。
export const MEDIA_GENRES = Object.freeze(RAKUTEN_RANKING_CATEGORIES.map((category) => Object.freeze({
  id: category.id, label: category.label, slug: category.id.replaceAll('_', '-')
})));
export const MEDIA_GENRE_PATHS = Object.freeze(MEDIA_GENRES.map((genre) => `/media/genre/${genre.slug}`));
export const GENRE_RULES = Object.freeze({ items: 20, freshDays: 3, minIndexed: 4 });
const genrePath = (genre) => `/media/genre/${genre.slug}`;

export async function loadGenreRanking(env, genre, { now = new Date(), rules = GENRE_RULES } = {}) {
  const db = env?.PRODUCT_DB;
  if (!db || !genre) return [];
  const since = new Date(now.getTime() - rules.freshDays * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { results = [] } = await db.prepare(`SELECT payload_json FROM marketplace_ranking_cache
      WHERE marketplace_id = 'RAKUTEN_JP' AND category_id IN (?1, 'buzz_' || ?1) AND updated_at >= ?2
      ORDER BY updated_at DESC LIMIT 1`).bind(genre.id, since).all();
    return results.length ? rankingItems(results[0].payload_json, { limit: rules.items }) : [];
  } catch {
    return [];
  }
}

// 公式ランキングの保存（payload_json）から、画像と商品 ID のある上位商品を取り出す。used に入っている商品は飛ばし、取った物を足す。
function rankingItems(payloadJson, { used = new Set(), limit = 4 } = {}) {
  let items = [];
  try { items = JSON.parse(payloadJson); } catch { items = []; }
  const picked = [];
  for (const [index, item] of (Array.isArray(items) ? items : []).entries()) {
    const recordKey = String(item?.record_key || '');
    const image = largerImage(item?.image_url || (Array.isArray(item?.image_urls) ? item.image_urls[0] : ''));
    const name = String(item?.display_name || item?.product_name || '').replace(/\s+/gu, ' ').trim().slice(0, 90);
    if (!/^(?:RAKUTEN|YAHOO|JAN):/u.test(recordKey) || /^(?:RAKUTEN|YAHOO):https?:/iu.test(recordKey) || !image || !name || used.has(recordKey)) continue;
    const offer = Array.isArray(item?.offers) ? item.offers[0] || {} : {};
    used.add(recordKey);
    picked.push({ record_key: recordKey, product_name: name, image_url: image, rank: Math.max(1, Number(item?.rank) || index + 1),
      listed_price: Math.round(Number(offer.price) || 0), marketplace: String(offer.marketplace || 'RAKUTEN_JP') });
    if (picked.length >= limit) break;
  }
  return picked;
}

export async function loadRankingShelves(env, { now = new Date(), rules = SHELF_RULES, exclude = [] } = {}) {
  const db = env?.PRODUCT_DB;
  if (!db) return [];
  const since = new Date(now.getTime() - rules.freshDays * 24 * 60 * 60 * 1000).toISOString();
  const used = new Set(exclude);
  const shelves = [];
  try {
    const { results = [] } = await db.prepare(`SELECT category_id, payload_json, updated_at FROM marketplace_ranking_cache
      WHERE marketplace_id = 'RAKUTEN_JP' AND updated_at >= ?1 ORDER BY updated_at DESC LIMIT 80`).bind(since).all();
    const seenCategories = new Set();
    for (const row of results) {
      const id = String(row.category_id || '');
      const label = SHELF_CATEGORY.get(id);
      if (!label || seenCategories.has(id)) continue;
      seenCategories.add(id);
      const picked = rankingItems(row.payload_json, { used, limit: rules.perCategory });
      if (picked.length >= 2) shelves.push({ id, label, items: picked });
      if (shelves.length >= rules.categories) break;
    }
  } catch {
    return [];
  }
  return shelves;
}

export async function withShelfHistories(env, shelves, { now = new Date() } = {}) {
  if (!Array.isArray(shelves) || !shelves.length) return shelves || [];
  const histories = await loadPriceHistories(env, shelves.flatMap((shelf) => shelf.items.map((item) => item.record_key)), { now });
  return shelves.map((shelf) => ({ ...shelf, items: shelf.items.map((item) => ({ ...item, history: histories.get(item.record_key) || [] })) }));
}

// 記録の最初と最後の差（記録が 2 日以上ある時だけ）。
export function priceChange(history = []) {
  const points = (Array.isArray(history) ? history : []).filter((point) => point.price > 0);
  if (points.length < 2) return null;
  const diff = points[points.length - 1].price - points[0].price;
  return { diff, days: points.length, from: points[0].date, to: points[points.length - 1].date };
}

// 実際に読まれている記事（直近30日の人の閲覧。テスト訪問と名乗るクローラは除く）。読めなければ空。
export async function loadPopularArticles(env, { limit = 6 } = {}) {
  const db = env?.PRODUCT_DB;
  if (!db) return [];
  try {
    const { results = [] } = await db.prepare(`SELECT content AS slug, COUNT(*) AS views FROM growth_events
      WHERE event_type = 'seo_article_view' AND traffic_class <> 'QA' AND occurred_at >= datetime('now', '-30 days')
      GROUP BY content ORDER BY views DESC LIMIT 20`).all();
    return results.map((row) => seoArticleCard(String(row.slug || ''))).filter(Boolean).slice(0, limit);
  } catch {
    return [];
  }
}

function productLink(row) {
  return `/product?key=${encodeURIComponent(row.record_key)}&from=media`;
}

const shortDate = (date) => String(date || '').slice(5).replace('-', '/');

function dropCard(row, index) {
  const rank = String(index + 1).padStart(2, '0');
  const image = row.image_url
    ? `<img src="${esc(row.image_url)}" alt="" loading="${index < 2 ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer" width="300" height="300">`
    : `<span class="media-drop-noimage" aria-hidden="true">${esc(String(row.product_name || '').slice(0, 1))}</span>`;
  const history = sparkline(row.history);
  const genre = row.segment?.label ? `<span class="media-drop-genre">${esc(row.segment.label)}</span>` : '';
  return `<li class="media-drop"${row.focus ? ` data-focus="${row.focus}"` : ''}><a href="${productLink(row)}">
<span class="media-drop-figure">${image}<span class="media-drop-rate"><b>-${row.drop_rate}</b>%</span><span class="media-drop-rank" aria-hidden="true">${rank}</span></span>
<span class="media-drop-body">${genre}<strong>${esc(row.product_name)}</strong>
<span class="media-drop-prices"><s>${yen(row.max_price)}</s><span aria-hidden="true">→</span><b>${yen(row.latest_price)}</b></span>
${history ? `<span class="media-drop-history"><span class="media-drop-history-label">価格の推移</span>${history}<span class="media-spark-axis"><span>${esc(shortDate(row.history[0].date))}</span><span>${esc(shortDate(row.history[row.history.length - 1].date))}</span></span></span>` : ''}
<span class="media-drop-meta">${esc(MALL_LABEL[row.marketplace] || row.marketplace)}・${row.days}日分の記録</span>
<span class="media-drop-cta">今の価格と履歴を見る</span></span>
</a></li>`;
}

function shelfTile(item, index) {
  const change = priceChange(item.history);
  const latest = item.history?.length ? item.history[item.history.length - 1].price : item.listed_price;
  const badge = !change ? '<span class="media-tile-badge media-tile-badge-new">記録1日目</span>'
    : change.diff < 0 ? `<span class="media-tile-badge media-tile-badge-down">${yen(-change.diff).replace('¥', '-¥')}</span>`
      : change.diff > 0 ? `<span class="media-tile-badge media-tile-badge-up">${yen(change.diff).replace('¥', '+¥')}</span>`
        : '<span class="media-tile-badge">変わらず</span>';
  const history = sparkline(item.history);
  return `<li class="media-tile"><a href="${productLink(item)}">
<span class="media-tile-figure"><img src="${esc(item.image_url)}" alt="" loading="${index < 2 ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer" width="300" height="300"><span class="media-tile-rank">${item.rank}位</span>${badge}</span>
<strong>${esc(item.product_name)}</strong>
${latest > 0 ? `<span class="media-tile-price">${yen(latest)}</span>` : ''}
${history ? `<span class="media-tile-history">${history}<span class="media-spark-axis"><span>${esc(shortDate(item.history[0].date))}</span><span>${esc(shortDate(item.history[item.history.length - 1].date))}</span></span></span>` : '<span class="media-tile-history media-tile-history-empty">価格の記録はこれから</span>'}
</a></li>`;
}

function shelvesSection(shelves) {
  if (!Array.isArray(shelves) || !shelves.length) return '';
  return `<section class="media-section" id="ranking">${sectionHead('RANKING × PRICE', 'ジャンル別・いま売れている商品と価格の動き', '楽天市場の公式ランキング上位の商品に、ホシルが記録した価格の推移を付けています。バッジは記録の最初の日と比べた値動きです。')}
<nav class="media-shelf-nav" aria-label="ジャンル">${shelves.map((shelf) => `<a href="#shelf-${esc(shelf.id)}">${esc(shelf.label)}</a>`).join('')}</nav>
${shelves.map((shelf) => `<section class="media-shelf" id="shelf-${esc(shelf.id)}"><h3>${esc(shelf.label)}</h3><ol class="media-tiles">${shelf.items.map(shelfTile).join('')}</ol></section>`).join('')}
</section>`;
}

function articleList(cards) {
  return `<ol class="media-articles">${cards.map((card, index) => `<li><a href="${esc(card.path)}"><span class="media-article-no" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><span class="media-article-text"><strong>${esc(card.title)}</strong><span>${esc(card.description)}</span></span><span class="media-article-arrow" aria-hidden="true">→</span></a></li>`).join('')}</ol>`;
}

function sectionHead(kicker, title, description) {
  return `<header class="media-section-head"><p class="media-kicker">${esc(kicker)}</p><h2>${esc(title)}</h2>${description ? `<p>${esc(description)}</p>` : ''}</header>`;
}

function issueLabel(now) {
  return jstDate(now).replaceAll('-', '.');
}

function recordDays(now) {
  return Math.max(1, Math.round((Date.parse(`${jstDate(now)}T00:00:00Z`) - Date.parse(`${PRICE_RECORD_STARTED}T00:00:00Z`)) / 86400000) + 1);
}

function shell({ title, description, canonical, robots, articleId, intent, body, structured }) {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | HOSHILU</title><meta name="description" content="${esc(description)}"><meta name="robots" content="${robots}">
<link rel="canonical" href="${canonical}"><meta property="og:type" content="website"><meta property="og:site_name" content="HOSHILU"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${ORIGIN}/og-hoshilu.png">
<link rel="stylesheet" href="/seo-article.css"><link rel="stylesheet" href="/owned-media.css?v=${MEDIA_TEMPLATE_VERSION}"><script type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\\u003c')}</script></head>
<body class="media-page" data-seo-article-id="${articleId}" data-seo-intent="${intent}" data-seo-cluster="owned-media" data-seo-article-type="hub" data-seo-content-kind="hub"><header class="seo-header"><a href="/" aria-label="HOSHILUホーム">HOSHILU <small>ホシル</small></a><a class="media-header-link" href="/media">${MEDIA_NAME}</a></header>
<main class="seo-shell">${body}</main>
<footer><a href="/media">${MEDIA_NAME}</a><a href="/ja/guides">買い物ガイド一覧</a><a href="/privacy">プライバシー</a><a href="/terms">利用上の注意</a></footer>
<script type="module" src="/seo-article-analytics.mjs"></script></body></html>`;
}

const SEARCH_CTA = `<aside class="mid-cta" id="media-search"><h2>名前が分からなくても、ホシルでまとめて探せます</h2><p>用途・見た目・使う人・予算を文章で入れると、楽天市場・Yahoo!ショッピングなどからまとめて探します。</p><form action="/" method="get" data-seo-search-form><label for="media-search-input">探したい商品の条件</label><textarea id="media-search-input" name="q" required maxlength="200" placeholder="例：洗いやすい、500mlくらいの保冷できる水筒"></textarea><button type="submit">この条件でまとめて探す</button></form></aside>`;
const AD_NOTE = '<p class="media-note">商品ページ・購入先へのリンクには広告（アフィリエイト）を含みます。掲載する商品と並び順は、ホシルの価格記録だけで決めています。</p>';

export function renderMediaTop({ drops = null, popular = [], shelves = [], now = new Date() } = {}) {
  const canonical = `${ORIGIN}/media`;
  const today = jstDate(now);
  const dropCount = Array.isArray(drops) ? drops.length : 0;
  const dropsPreview = Array.isArray(drops) && drops.length
    ? `<ol class="media-drops">${drops.slice(0, 12).map(dropCard).join('')}</ol><p class="media-more"><a href="/media/price-drops">値下がりした商品をすべて見る（${drops.length}件）<span aria-hidden="true">→</span></a></p>`
    : `<p class="media-empty">${drops === null ? '価格の記録を読み込めませんでした。時間をおいて開き直してください。' : '今週は、条件に合う大きな値下がりはありませんでした。'}</p>`;
  const sections = MEDIA_SECTIONS.map((section) => {
    const cards = section.slugs.map(seoArticleCard).filter(Boolean);
    return `<section class="media-section" id="${section.id}">${sectionHead(section.kicker, section.title, section.description)}${articleList(cards)}</section>`;
  }).join('');
  const body = `<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">HOSHILU</a><span aria-hidden="true">›</span><span>${MEDIA_NAME}</span></nav>
<article><header class="media-hero"><p class="media-issue"><span>HOSHILU NOTES</span><time datetime="${today}">${issueLabel(now)} 号</time></p><h1>ホシルの<br>買い物ノート</h1><p class="media-lead">ホシルが毎日記録している楽天市場・Yahoo!ショッピングの価格から、値下がりした商品をお知らせします。名前が分からない物の探し方、セールの見分け方も。</p>
<dl class="media-stats"><div><dt>値下がり</dt><dd>${dropCount}<small>件</small></dd></div><div><dt>価格の記録</dt><dd>${recordDays(now)}<small>日分</small></dd></div><div><dt>更新</dt><dd>毎日</dd></div></dl></header>
<nav class="media-toc" aria-label="この号の内容"><a href="#drops">今週の値下がり</a>${shelves.length ? '<a href="#ranking">売れている商品と価格</a>' : ''}${popular.length ? '<a href="#popular">よく読まれている記事</a>' : ''}${MEDIA_SECTIONS.map((s) => `<a href="#${s.id}">${esc(s.title)}</a>`).join('')}</nav>
<section class="media-section" id="drops">${sectionHead('PRICE DROPS', '今週の値下がり', 'ホシルの価格記録で、記録上の最高値から10%以上下がった商品です（モール公式ランキングに出た商品から選んでいます）。')}${dropsPreview}</section>
${shelvesSection(shelves)}
${SEARCH_CTA}
${popular.length ? `<section class="media-section" id="popular">${sectionHead('MOST READ', 'よく読まれている記事', '直近30日によく読まれた記事です。')}${articleList(popular)}</section>` : ''}
${genreNav()}
${sections}
<p class="bottom-cta"><a href="/ja/guides">買い物ガイドをすべて見る</a></p>
${AD_NOTE}</article>`;
  return shell({
    title: `${MEDIA_NAME}｜値下がりした商品と、買う前の探し方`,
    description: 'ホシルが毎日記録している楽天市場・Yahoo!ショッピングの価格から、値下がりした商品をお知らせ。名前が分からない物の探し方、セールの見分け方、モールの比べ方もまとめています。',
    canonical, robots: 'index,follow,max-image-preview:large,max-snippet:-1',
    articleId: 'media-top', intent: 'owned_media_top', body,
    structured: { '@context': 'https://schema.org', '@graph': [
      { '@type': 'CollectionPage', name: MEDIA_NAME, url: canonical, dateModified: today, inLanguage: 'ja',
        publisher: { '@type': 'Organization', name: 'HOSHILU', url: ORIGIN } },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'HOSHILU', item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: MEDIA_NAME, item: canonical }] }
    ] }
  });
}

export function renderPriceDrops({ drops = null, shelves = [], now = new Date() } = {}) {
  const canonical = `${ORIGIN}/media/price-drops`;
  const today = jstDate(now);
  const list = Array.isArray(drops) ? drops : [];
  // 載せる商品が少ない日は検索結果に出さない（中身の薄いページを索引させない）。
  const robots = list.length >= 3 ? 'index,follow,max-image-preview:large,max-snippet:-1' : 'noindex,follow';
  const content = list.length
    ? `<ol class="media-drops media-drops-full">${list.map(dropCard).join('')}</ol>`
    : `<p class="media-empty">${drops === null ? '価格の記録を読み込めませんでした。時間をおいて開き直してください。' : '今週は、条件に合う大きな値下がりはありませんでした。'}</p>`;
  const body = `<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">HOSHILU</a><span aria-hidden="true">›</span><a href="/media">${MEDIA_NAME}</a><span aria-hidden="true">›</span><span>値下がりした商品</span></nav>
<article><header class="media-hero media-hero-compact"><p class="media-issue"><span>PRICE DROPS</span><time datetime="${today}">${issueLabel(now)} 号</time></p><h1>今週値下がりした商品</h1><p class="media-lead">ホシルが楽天市場・Yahoo!ショッピングで毎日確認している価格の記録から、記録上の最高値より下がった商品を、下がった割合の大きい順に並べています。</p><p class="media-updated">毎日自動で更新しています。</p></header>
<section class="media-rules"><h2>このページの決まり</h2><p>${DROP_RULE_TEXT}です。価格はホシルが確認した時点の商品価格（送料は含みません）で、ホシルでの価格記録は${PRICE_RECORD_STARTED}から始まっています。今の価格と在庫は、各商品を開くとその場でモールに確認して表示します。これから上がるか下がるかの予想はしていません。</p></section>
<section class="media-section">${sectionHead('THIS WEEK', list.length ? `${list.length}件` : '今週の値下がり', '')}${content}</section>
${shelvesSection(shelves)}
${SEARCH_CTA}
${genreNav()}
${AD_NOTE}</article>`;
  return shell({
    title: '今週値下がりした商品（ホシルの価格記録より）',
    description: 'ホシルが毎日記録している楽天市場・Yahoo!ショッピングの価格から、記録上の最高値より10%以上下がった商品を毎日自動でまとめています。',
    canonical, robots, articleId: 'media-price-drops', intent: 'owned_media_price_drops', body,
    structured: { '@context': 'https://schema.org', '@graph': [
      { '@type': 'ItemList', name: '今週値下がりした商品', url: canonical, numberOfItems: list.length,
        itemListElement: list.map((row, index) => ({ '@type': 'ListItem', position: index + 1, name: row.product_name, url: `${ORIGIN}${productLink(row)}` })) },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'HOSHILU', item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: MEDIA_NAME, item: `${ORIGIN}/media` },
        { '@type': 'ListItem', position: 3, name: '値下がりした商品', item: canonical }] }
    ] }
  });
}

// ジャンル別ページへの入口（ページどうしをつなぐ）。current は今いるジャンル。
function genreNav(current = '') {
  return `<section class="media-section" id="genres">${sectionHead('BY GENRE', 'ジャンル別の値下がりと価格の動き', '楽天市場の公式ランキングのジャンルごとに、上位商品の価格の記録をまとめています。')}
<nav class="media-shelf-nav" aria-label="ジャンル別のページ">${MEDIA_GENRES.map((genre) => (genre.id === current
    ? `<span aria-current="page">${esc(genre.label)}</span>`
    : `<a href="${genrePath(genre)}">${esc(genre.label)}</a>`)).join('')}</nav></section>`;
}

export function renderGenrePage({ genre, items = [], drops = null, now = new Date() } = {}) {
  const canonical = `${ORIGIN}${genrePath(genre)}`;
  const today = jstDate(now);
  const genreDrops = Array.isArray(drops) ? drops.filter((row) => row.category_id === genre.id) : [];
  const changes = items.map((item) => priceChange(item.history)).filter(Boolean);
  const down = changes.filter((change) => change.diff < 0).length;
  const up = changes.filter((change) => change.diff > 0).length;
  // 値下がり欄とランキングの両方に出る商品は 1 つと数える
  const droppedKeys = new Set([...genreDrops.map((row) => row.record_key),
    ...items.filter((item) => (priceChange(item.history)?.diff || 0) < 0).map((item) => item.record_key)]);
  const recorded = changes.length + genreDrops.filter((row) => !items.some((item) => item.record_key === row.record_key)).length;
  const robots = recorded >= GENRE_RULES.minIndexed ? 'index,follow,max-image-preview:large,max-snippet:-1' : 'noindex,follow';
  const summary = changes.length
    ? `ランキング上位${items.length}商品のうち、価格を2日以上記録できた${changes.length}商品では、記録の最初の日と比べて${down}商品が値下がり、${up}商品が値上がり、${changes.length - down - up}商品が変わらずでした（${shortDate(today)}時点）。`
    : `ランキング上位の商品の価格は、記録を始めたところです。`;
  const ranking = items.length
    ? `<ol class="media-tiles">${items.map(shelfTile).join('')}</ol>`
    : `<p class="media-empty">${esc(genre.label)}の公式ランキングの保存が古いため、今日は表示していません。</p>`;
  const body = `<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">HOSHILU</a><span aria-hidden="true">›</span><a href="/media">${MEDIA_NAME}</a><span aria-hidden="true">›</span><span>${esc(genre.label)}</span></nav>
<article><header class="media-hero media-hero-compact"><p class="media-issue"><span>GENRE × PRICE</span><time datetime="${today}">${issueLabel(now)} 号</time></p><h1>${esc(genre.label)}の値下がりと価格の動き</h1><p class="media-lead">楽天市場の${esc(genre.label)}ランキング上位の商品について、ホシルが毎日確認している価格の記録をまとめています。${esc(summary)}</p>
<dl class="media-stats"><div><dt>値下がり</dt><dd>${droppedKeys.size}<small>件</small></dd></div><div><dt>掲載</dt><dd>${items.length}<small>商品</small></dd></div><div><dt>更新</dt><dd>毎日</dd></div></dl></header>
${genreDrops.length ? `<section class="media-section" id="drops">${sectionHead('PRICE DROPS', `${genre.label}で値下がりした商品`, 'ホシルの価格記録で、記録上の最高値から10%以上下がった商品です。')}<ol class="media-drops">${genreDrops.map(dropCard).join('')}</ol></section>` : ''}
<section class="media-section" id="ranking">${sectionHead('RANKING × PRICE', `${genre.label}・ランキング上位の価格の推移`, 'バッジは、ホシルが記録した最初の日と比べた値動きです。商品を開くと、今の価格と在庫をその場でモールに確認して表示します。')}${ranking}</section>
<section class="media-rules"><h2>このページの決まり</h2><p>載せている商品は楽天市場の公式ランキング（${GENRE_RULES.freshDays}日以内の保存）の上位だけで、並びはランキングの順位のままです。価格はホシルが確認した時点の商品価格（送料は含みません）で、ホシルでの価格記録は${PRICE_RECORD_STARTED}から始まっています。値下がりの条件は「${DROP_RULE_TEXT}」です。これから上がるか下がるかの予想はしていません。</p></section>
${SEARCH_CTA}
${genreNav(genre.id)}
<p class="media-more"><a href="/media/price-drops">すべてのジャンルの値下がりを見る<span aria-hidden="true">→</span></a></p>
${AD_NOTE}</article>`;
  return shell({
    title: `${genre.label}の値下がり・価格の動き｜楽天ランキング上位を毎日記録`,
    description: `楽天市場の${genre.label}ランキング上位の商品の価格を、ホシルが毎日記録。値下がりした商品と、ここ2週間の価格の推移をまとめています（毎日自動で更新）。`,
    canonical, robots, articleId: `media-genre-${genre.slug}`.slice(0, 64), intent: 'owned_media_genre', body,
    structured: { '@context': 'https://schema.org', '@graph': [
      { '@type': 'ItemList', name: `${genre.label}の値下がりと価格の動き`, url: canonical, numberOfItems: items.length,
        itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.product_name, url: `${ORIGIN}${productLink(item)}` })) },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'HOSHILU', item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: MEDIA_NAME, item: `${ORIGIN}/media` },
        { '@type': 'ListItem', position: 3, name: genre.label, item: canonical }] }
    ] }
  });
}

// 2026-10-19 大隆さん OK（入口の改善案 2）: トップの検索窓のすぐ下に「今日の値下がり」を 3 つ出す。
// 値下がりページ（/media/price-drops）と同じ記録・同じ並び（data-focus の 1〜3）。商品名・記録した価格・下がり幅・画像だけを返す。
// 検索文や利用者の情報は使わない。30 分キャッシュ（値下がりページと同じ）。
export const TOP_DROPS_PATH = '/api/media/top-drops';
export const TOP_DROPS_LIMIT = 3;
export function topDropItems(drops, limit = TOP_DROPS_LIMIT) {
  if (!Array.isArray(drops)) return [];
  return drops.filter((row) => row.focus && row.image_url && /^https:\/\//u.test(String(row.image_url)))
    .sort((a, b) => a.focus - b.focus).slice(0, limit)
    .map((row) => ({
      name: String(row.product_name || '').slice(0, 60),
      genre: String(row.segment?.label || ''),
      image_url: String(row.image_url),
      drop_rate: Number(row.drop_rate) || 0,
      max_price: Number(row.max_price) || 0,
      latest_price: Number(row.latest_price) || 0,
      mall: MALL_LABEL[row.marketplace] || '',
      href: `/product?key=${encodeURIComponent(row.record_key)}&from=top`
    }));
}
export async function handleTopDropsApi(request, env, { now = new Date(), cache = globalThis.caches?.default ?? null } = {}) {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  if (url.pathname !== TOP_DROPS_PATH) return null;
  const cacheKey = new Request(`${ORIGIN}${TOP_DROPS_PATH}?media-cache=${jstDate(now)}&v=${MEDIA_TEMPLATE_VERSION}`);
  if (cache) {
    try { const hit = await cache.match(cacheKey); if (hit) return hit; } catch {}
  }
  const drops = await withImagesAndHistory(env, await loadPriceDrops(env, { now }), { now });
  // 2026-10-20 季節の一言（season-calendar.mjs。期間外は空）
  const body = { ok: drops !== null, date: jstDate(now), season: seasonFor(now)?.top_line || '', items: topDropItems(drops), note: 'ホシルの記録で、14日間の最高値から下がった幅です。価格は変わります。' };
  const response = new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${CACHE_SECONDS}`, 'x-content-type-options': 'nosniff' }
  });
  if (cache && drops !== null) {
    try { await cache.put(cacheKey, response.clone()); } catch {}
  }
  return response;
}

// GET /media・/media/price-drops・/media/genre/<slug>。D1 を毎回読まないよう 30 分キャッシュする（中身は毎日変わる程度）。
export async function handleOwnedMediaRoutes(request, env, { headers = {}, now = new Date(), cache = globalThis.caches?.default ?? null } = {}) {
  if (!['GET', 'HEAD'].includes(request.method)) return null;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/u, '') || '/';
  const genre = MEDIA_GENRES.find((item) => genrePath(item) === path);
  if (!MEDIA_PATHS.includes(path) && !genre) return null;
  const cacheKey = new Request(`${ORIGIN}${path}?media-cache=${jstDate(now)}&v=${MEDIA_TEMPLATE_VERSION}`);
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return request.method === 'HEAD' ? new Response(null, hit) : hit;
    } catch {}
  }
  const drops = await withImagesAndHistory(env, await loadPriceDrops(env, { now }), { now });
  const html = genre
    ? renderGenrePage({ genre, drops, now, items: (await withShelfHistories(env, [{ id: genre.id, label: genre.label, items: await loadGenreRanking(env, genre, { now }) }], { now }))[0]?.items || [] })
    : path === '/media'
    ? renderMediaTop({ drops, popular: await loadPopularArticles(env), now,
      shelves: await withShelfHistories(env, await loadRankingShelves(env, { now, exclude: (drops || []).slice(0, 12).map((row) => row.record_key) }), { now }) })
    : renderPriceDrops({ drops, now,
      shelves: await withShelfHistories(env, await loadRankingShelves(env, { now, exclude: (drops || []).map((row) => row.record_key) }), { now }) });
  const response = new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': `public, max-age=${CACHE_SECONDS}`, ...headers }
  });
  // 読み込めなかった時（drops === null）はキャッシュしない。
  if (cache && drops !== null) {
    try { await cache.put(cacheKey, response.clone()); } catch {}
  }
  return request.method === 'HEAD' ? new Response(null, response) : response;
}
