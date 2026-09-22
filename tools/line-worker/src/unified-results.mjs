// 2026-09-22 大隆さん指示書「HOSHILU 検索結果UI統合改修」。
//
// 「ホシルからの提案」と「web検索から発見」を上下に分けず、**1つの「見つかった商品」**に
// まとめる。ユーザーにソースの違いを意識させすぎず、HOSHILU が Web 全体から
// まとめて見つけてきた、という体験に統一する。
//
// ここ（サーバー）で統合する理由:
//   ・検索の質は順番で決まる。順番を作る仕事は、材料が全部そろっている場所でやる
//   ・同じ物差しを当てるには judgeTitle が要る。それはここにしかない
//   ・ブラウザに配ってから並べ替えると、Web結果が遅れて届くたびに並びが動く（§28）
//
// 一致度の物差し（2026-09-22 大隆さん決定）:
//   HOSHILU商品にも Web商品にも **同じ judgeTitle** を当てる。
//   judgeTitle は「商品名に書かれている語だけ」で見る。どちらも商品名しか
//   確かな材料が無いので、これが唯一公平な当て方になる。
//   同点のときだけ、指示書§6 のとおり Seller商品 → HOSHILU商品 → Web商品 の順にする。
//
// 価格（§7）:
//   HOSHILU商品だけ価格を出す。Web商品の価格は出さない。
//   Web の価格はページに書いてあった数字を検索時点で読んだだけで、
//   HOSHILU が API で確認したものではない。確認していない数字を、確認した数字と
//   同じ顔で並べない。
//
// 60件（§3・§4）:
//   HOSHILU＋Web の合計で最大60件。**60件を埋めるために条件に合わないものを混ぜない。**
//   22件しか合わなければ22件。最大60件であり、必ず60件ではない。
import { demandConditions, judgeTitle } from './shop-demand.mjs';

export const UNIFIED_LIMIT = 60;
export const UNIFIED_PAGE_SIZE = 12;

const SOURCE_RANK = Object.freeze({ HOSHILU_SHOP: 0, HOSHILU: 1, WEB: 2 });

const text = (value, max = 200) =>
  String(value ?? '').normalize('NFKC').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// 2026-09-22 大隆さん報告「リンク先に飛ばない」（TRACK_TOKEN_FORMAT_INVALID）。
// 送客リンクは /go?token=... で、token には行き先URLを含む署名付きの中身が入る。
// Qoo10 のように長いURLだと token だけで600字を超え、ここで途中から切れていた。
// 切れた token は署名の前で千切れるので、/go が形式不正として弾く。
// URL は長くなるものとして扱う（ブラウザの実質上限まで許す）。
const URL_MAX = 2000;
const httpsOnly = (value) => {
  const url = text(value, URL_MAX);
  return url.slice(0, 8) === 'https://' ? url : '';
};

// 同じ商品かどうかを見るための鍵。持っている材料の確かな順に使う（§14）。
// JAN/GTIN・型番は Web検索の結果には基本入っていない。入っていないものを
// 入っているふりで使わない。実際に効くのは ASIN と URL の正規化になる。
export function canonicalProductUrl(value) {
  let url;
  try { url = new URL(String(value || '')); } catch { return ''; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
  const host = url.hostname.toLowerCase().replace(/^www\./u, '');
  // 計測用のパラメータだけを落とす。商品を決めているパラメータ（item id など）は残す。
  const drop = /^(utm_|gclid|fbclid|yclid|msclkid|ref|ref_|tag|_encoding|psc|th|linkCode|creative|creativeASIN|ascsubtag|scid|sc_e|rafcid|icm_|trflg)/iu;
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !drop.test(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const search = params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join('&')}` : '';
  const path = url.pathname.replace(/\/+$/u, '') || '/';
  return `${host}${path}${search}`;
}

export function dedupeKey(item) {
  return dedupeKeys(item)[0] || '';
}

// 1つの商品が持ちうる鍵を全部出す。HOSHILU 側は ASIN を持ち、Web 側は URL しか
// 持たないことが多いので、**どれか1つでも一致したら同じ商品**と見る。
// Amazon の URL には ASIN が文字として入っているので、そこからは読み取ってよい
// （推測ではなく、書いてあるものを読むだけ）。
export function dedupeKeys(item) {
  const keys = [];
  const asin = text(item?.asin, 20).toUpperCase();
  if (/^[A-Z0-9]{10}$/u.test(asin)) keys.push(`asin:${asin}`);
  const jan = text(item?.jan || item?.gtin, 20).replace(/\D/gu, '');
  if (jan.length === 8 || jan.length === 13) keys.push(`jan:${jan}`);
  const canonical = canonicalProductUrl(item?.product_url || item?.url);
  if (canonical) {
    keys.push(`url:${canonical}`);
    const fromUrl = canonical.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/u);
    if (fromUrl) keys.push(`asin:${fromUrl[1]}`);
  }
  if (keys.length) return keys;
  const name = text(item?.product_name, 80).toLowerCase();
  return name ? [`name:${name}`] : [];
}

// HOSHILU の候補（/api/search の candidates）を統合用の形にする。
function fromCandidate(candidate, index) {
  // 2026-09-22 大隆さん報告「価格出てない」。
  // 送料込みの合計（total_cost）が取れている商品は少なく、多くは商品価格（price）しか
  // 持っていない。合計だけを見ていたため、価格のある商品まで無表示になっていた。
  // 合計 → 商品価格 → selected_offer の順に、**実際に入っている数字**を拾う。
  // どれも無ければ出さない（0 とは書かない）。
  //
  // 2026-09-22 大隆さん報告「ホシル提示でなくなったとや」。
  // 上の修正で「価格を持っている offer」を1つ選び、その offer のリンクを使っていた。
  // 価格はあるがリンクの無い offer が選ばれると、リンクが空になり、その商品ごと
  // 落ちていた（url の無い行は出さない決まりのため）。
  // **リンクを選ぶ offer と、価格を読む offer は別物として扱う。**
  const offers = Array.isArray(candidate?.offers) ? candidate.offers : [];
  const linkOffer = offers.find((item) => httpsOnly(item?.tracking_url))
    || (httpsOnly(candidate?.selected_offer?.tracking_url) ? candidate.selected_offer : null)
    || candidate?.selected_offer
    || offers.find(Boolean)
    || null;
  const priceOffer = offers.find((item) => Number(item?.total_cost) > 0)
    || offers.find((item) => Number(item?.price) > 0)
    || candidate?.selected_offer
    || linkOffer
    || null;
  const price = Number(priceOffer?.total_cost) > 0
    ? Number(priceOffer.total_cost)
    : Number(priceOffer?.price ?? candidate?.price);
  const offer = linkOffer;
  const url = httpsOnly(offer?.tracking_url || candidate?.product_url);
  const images = Array.isArray(candidate?.image_urls) ? candidate.image_urls : [];
  const image = httpsOnly(images.find(Boolean) || candidate?.image_url || candidate?.image);
  // Seller のショップに載っている商品かどうかで、バッジと同点時の順番が変わる（§6・§8）。
  const shop = candidate?.shop || null;
  return {
    source: shop ? 'HOSHILU_SHOP' : 'HOSHILU',
    listing: false,
    order: index,
    // 画面側で「元の候補」に戻れるようにしておく。商品カードと同じ5個のボタン
    // （これ、今買う？／この価格になったら教えて／いつものにする／気になる／口コミ）は
    // 候補そのものを必要とするため（2026-09-22 大隆さん指示「ホシル提示は、5個ボタン設置」）。
    candidate_index: index,
    product_name: text(candidate?.display_name || candidate?.product_name || candidate?.asin, 200),
    image_url: image,
    url,
    product_url: httpsOnly(candidate?.product_url || offer?.product_url),
    shop_name: text(shop?.name || shop?.shop_name || offer?.marketplace_label, 60),
    marketplace: text(offer?.marketplace, 32),
    asin: text(candidate?.asin, 20),
    // HOSHILU 商品だけ価格を出す。確認できた金額が無ければ出さない（0 と書かない）。
    price_jpy: Number.isFinite(price) && price > 0 ? Math.round(price) : null,
    listed_price_jpy: null
  };
}

// Google（web検索）の結果を統合用の形にする。価格は落とす（§7）。
function fromGoogleItem(item, index, offset) {
  return {
    source: 'WEB',
    // 2026-09-22 大隆さん報告「web検索、提示してるの商品じゃないやん」。
    // Google 側は「Amazon.co.jp: ベースメイク: 韓国コスメストア」のような
    // カテゴリ・ストアの一覧ページも返す。元の web検索の枠は一覧ページも
    // 「一覧ページ」と断って残していたが、ここは商品を並べる列なので入れない。
    // 商品ページか、モールの一覧・カテゴリページか。一覧なら画面でそう断る。
    listing: item?.product_page !== true,
    order: offset + index,
    candidate_index: null,
    product_name: text(item?.title, 200),
    image_url: httpsOnly(item?.image_url),
    url: httpsOnly(item?.tracking_url || item?.product_url),
    product_url: httpsOnly(item?.product_url),
    shop_name: text(item?.mall_label, 60),
    marketplace: text(item?.marketplace, 32),
    asin: '',
    // Web の価格は「ページに書いてあった数字」でしかない。確認した価格と混ぜない。
    price_jpy: null,
    // 2026-09-22 大隆さん報告「価格もでてない」。数字を隠すと何も分からない。
    // 混ぜないという約束は守ったまま、別の欄に入れて画面で
    //「参考価格・検索時点」と断って出す。HOSHILU が確認した価格ではない。
    listed_price_jpy: Number(item?.listed_price_jpy) > 0 ? Math.round(Number(item.listed_price_jpy)) : null
  };
}

// 一致度で並べる。conditions が作れない検索（写真だけ・語が短いなど）では
// 判定しようがないので、**絞り込まずに元の順番を保つ**。
// 判定できないものを「合わない」と決めつけない。
// 条件の半分以上（切り上げ）当たったものを残す。0 件なら 1語一致まで緩める。
export function relevanceThreshold(conditionCount) {
  return Math.max(1, Math.ceil(conditionCount / 2));
}

function relevant(judged, conditionCount) {
  const strict = judged.filter((row) => row.score >= relevanceThreshold(conditionCount));
  if (strict.length) return strict;
  return judged.filter((row) => row.score >= 1);
}

export function rankUnified(rows, conditions) {
  const judged = rows.map((row) => {
    if (!conditions.length) return { ...row, matched: [], unmatched: [], level: 'UNKNOWN', score: 0 };
    const verdict = judgeTitle(row.product_name, conditions);
    return { ...row, matched: verdict.matched, unmatched: verdict.unmatched, level: verdict.level, score: verdict.matched.length };
  });
  // 2026-09-22 大隆さん指示「関係ないものは提示しないこと」。
  //
  // これまでは「1語でも当たれば出す」だった。それだと
  // 「LILIB 韓国 頭皮ケア」に対して
  //   ・LILIBETH の化粧水（LILIB だけ当たる）
  //   ・BUYMA の韓国ワンピース（韓国 だけ当たる）
  // が残ってしまう。語数が増えるほど、1語だけの一致は「関係ない」に近づく。
  //
  // そこで、条件の**半分以上**（切り上げ）当たったものだけを出す。
  //   1語 → 1語一致、2語 → 1語、3語 → 2語、4語 → 2語、5語 → 3語
  // それで 1件も残らないときだけ、1語一致まで緩める（無言で0件にしない）。
  // どちらにしても、1語も当たらないものは出さない。
  const kept = conditions.length ? relevant(judged, conditions.length) : judged;
  return kept.sort((a, b) => {
    // 一覧ページは、どれだけ言葉が合っていても商品より後ろ（2026-09-22）。
    const listing = (a.listing ? 1 : 0) - (b.listing ? 1 : 0);
    if (listing !== 0) return listing;
    if (b.score !== a.score) return b.score - a.score;
    if (a.unmatched.length !== b.unmatched.length) return a.unmatched.length - b.unmatched.length;
    // ここまで同点のときだけ HOSHILU を先に（§6）。Seller だから常に上、にはしない。
    const source = SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
    if (source !== 0) return source;
    return a.order - b.order;
  });
}

// 同じ商品が両方に出たら、HOSHILU 商品を残して1件にする（§14）。
export function dedupe(rows) {
  const byKey = new Map();
  const out = [];
  for (const row of rows) {
    const keys = dedupeKeys(row);
    if (!keys.length) { out.push(row); continue; }
    const seen = keys.map((key) => byKey.get(key)).find(Boolean);
    if (!seen) {
      for (const key of keys) byKey.set(key, row);
      out.push(row);
      continue;
    }
    // すでに HOSHILU 側が入っているなら何もしない。Web が先に入っていたら入れ替える。
    if (seen.source === 'WEB' && row.source !== 'WEB') {
      const at = out.indexOf(seen);
      if (at >= 0) out[at] = row;
      for (const key of [...dedupeKeys(seen), ...keys]) byKey.set(key, row);
    } else {
      for (const key of keys) if (!byKey.has(key)) byKey.set(key, seen);
    }
  }
  return out;
}

export function unifyResults({ candidates = [], googleItems = [], query = '', limit = UNIFIED_LIMIT } = {}) {
  const hoshilu = (Array.isArray(candidates) ? candidates : []).map(fromCandidate).filter((row) => row.url && row.product_name);
  // 2026-09-22 大隆さん報告「web検索提示がない。どうにか出して。Googleの直検索なら出るよ」。
  // 「ダイエット サプリ 燃焼系」のような広い言葉では、Google が返すのはモールの
  // カテゴリ・一覧ページばかりで、商品ページだけに絞ると1件も残らなかった。
  // 落とすのをやめ、**一覧ページは一覧ページと断って、商品の後ろに並べる**。
  // 商品のふりはさせない（§一覧ページにホシっとく等は出さない）。
  const web = (Array.isArray(googleItems) ? googleItems : [])
    .map((item, index) => fromGoogleItem(item, index, hoshilu.length))
    .filter((row) => row.url && row.product_name);
  const conditions = demandConditions(query);
  const ranked = rankUnified(dedupe([...hoshilu, ...web]), conditions);
  const items = ranked.slice(0, Math.max(0, limit)).map((row, index) => ({
    position: index + 1,
    source: row.source,
    product_name: row.product_name,
    image_url: row.image_url,
    url: row.url,
    shop_name: row.shop_name,
    marketplace: row.marketplace,
    price_jpy: row.price_jpy,
    listed_price_jpy: row.listing ? null : (row.listed_price_jpy ?? null),
    listing: row.listing === true,
    candidate_index: row.source === 'WEB' ? null : (Number.isInteger(row.candidate_index) ? row.candidate_index : null),
    matched: row.matched,
    unmatched: row.unmatched
  }));
  return {
    items,
    // 出した件数と、候補がもっとあったかどうか。「全部で60件しかない」と
    // 誤解させないため、画面が「60件表示中」と書けるようにしておく（§9）。
    shown: items.length,
    total_candidates: ranked.length,
    truncated: ranked.length > items.length,
    hoshilu_count: items.filter((item) => item.source !== 'WEB').length,
    web_count: items.filter((item) => item.source === 'WEB').length,
    page_size: UNIFIED_PAGE_SIZE,
    // 条件が作れなかった検索では一致度で並べていない。画面がそれを知れるようにする。
    ranked_by_conditions: conditions.length > 0
  };
}
