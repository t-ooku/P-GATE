import { buildMarketplaceSearchKeywords } from '../public/marketplace-search-keywords-v2.mjs';
import { encodeShiftJisPercent } from './shift-jis-url.mjs';
import { ensureApparelProductTypeTerm } from './apparel-query-attributes.mjs';

const APPAREL_TERMS = [
  /服|洋服|トップス|シャツ|ブラウス|ニット|カーディガン|ジャケット|アウター|コート|カットソー|長袖|半袖|袖なし|ノースリーブ/u,
  /パンツ|デニム|ジーンズ|スカート|ワンピース|ドレス|セットアップ|スウェット|パーカー/u,
  /靴|スニーカー|ブーツ|サンダル|バッグ|帽子|アクセサリー|ファッション/u,
  /韓国(?:系|風|ファッション)|Y2K|海外ガール|ストリート|ガーリー|モード|古着/iu,
  /\b(?:clothes?|fashion|tops?|shirt|blouse|knit|cardigan|jacket|coat|pants|jeans|skirt|dress|shoes?|sneakers?|boots?|bag|cut[- ]?(?:and[- ]?)?sewn?|cutsew)\b/iu,
  /衣服|服装|服裝|上衣|衬衫|襯衫|针织|針織|开衫|開衫|夹克|夾克|外套|裤子|褲子|牛仔裤|牛仔褲|裙子|连衣裙|連衣裙|鞋|运动鞋|運動鞋|靴子|包|帽子|时尚|時尚/u,
  /옷|의류|상의|셔츠|블라우스|니트|카디건|재킷|자켓|아우터|코트|바지|청바지|스커트|치마|원피스|드레스|신발|운동화|스니커즈|부츠|가방|모자|패션/u
];

function searchText(query) {
  return String(query || '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 200);
}

export function isApparelSearch(query) {
  const value = searchText(query);
  return value.length > 0 && APPAREL_TERMS.some((pattern) => pattern.test(value));
}

export function buildApparelMarketplaceDestinations(query) {
  const source = searchText(query);
  // 2026-08-07 instructions #8: every "direct" marketplace stays searchable
  // on every query, not just apparel-looking ones (isApparelSearch is kept
  // exported for other callers/tests, just no longer gates this list).
  if (!source) return [];

  // buildMarketplaceSearchKeywords collapses the specific garment noun into
  // its broad category ("ブラウス" -> "トップス", "カットソー" -> dropped), which
  // is exactly the word that narrows an apparel search. Amazon and Rakuten
  // already put it back; these malls did not, so a blouse search reached
  // them as a generic tops search (reported 2026-08-07).
  const keywordsFor = (marketplace) =>
    ensureApparelProductTypeTerm(source, buildMarketplaceSearchKeywords(source, marketplace)) || source;

  // ZOZOTOWN decodes its keyword parameter as Shift_JIS (see shift-jis-url.mjs
  // for the live verification). URL.searchParams always percent-encodes as
  // UTF-8, so the query string is assembled by hand here - going through
  // searchParams would re-encode the Shift_JIS escapes.
  const zozo = `https://zozo.jp/search/?p_keyv=${encodeShiftJisPercent(keywordsFor('ZOZOTOWN_JP'))}`;

  // v4.2 項目14: SHOPLIST/MUSINSAはこの検索導線から外す。既存ユーザーの保存
  // データ(AIウォッチ等)との後方互換のため、マーケットプレイスコード自体は
  // mywatch-policy.mjs等に残すが、新規の検索結果としては提示しない。代わり
  // にロフト・ハンズ・マツキヨココカラ・@cosme SHOPPING・ABC-MARTを追加する。
  const loft = new URL('https://www.loft.co.jp/store/goods/search.aspx');
  loft.searchParams.set('keyword', keywordsFor('LOFT_JP'));
  loft.searchParams.set('search', 'x');

  const hands = `https://hands.net/search/?q=${encodeURIComponent(keywordsFor('HANDS_JP'))}`;

  const matsukiyo = new URL('https://www.matsukiyococokara-online.com/store/catalogsearch/result/');
  matsukiyo.searchParams.set('q', keywordsFor('MATSUKIYO_JP'));

  // @cosme SHOPPINGとABC-MARTは、検索結果ページのGETキーワードパラメータ名
  // を2026-08-07時点で確定できなかった(WebSearch/WebFetch経由で複数の候補
  // パラメータを試したが確認できず、このサンドボックスは生のcurl/Bashネッ
  // トワークアクセスを遮断しているため直接確認もできない)。誤ったパラメー
  // タで検索結果0件のリンクを静かに出すより安全なため、暫定的に検索ランデ
  // ィングページへリンクする。パラメータが確認でき次第、keywordsFor()を
  // 使った検索結果への直リンクに更新すること。
  const cosme = 'https://www.cosme.com/products/search.php';
  const abcmart = 'https://www.abc-mart.net/shop/goods/search.aspx';

  return [
    { marketplace: 'ZOZOTOWN_JP', label: 'ZOZOTOWNで探す', destination: zozo },
    { marketplace: 'LOFT_JP', label: 'ロフトで探す', destination: loft.toString() },
    { marketplace: 'HANDS_JP', label: 'ハンズで探す', destination: hands },
    { marketplace: 'MATSUKIYO_JP', label: 'マツキヨココカラで探す', destination: matsukiyo.toString() },
    { marketplace: 'COSME_JP', label: '@cosme SHOPPINGで探す', destination: cosme },
    { marketplace: 'ABCMART_JP', label: 'ABC-MARTで探す', destination: abcmart },
    {
      marketplace: 'BUYMA_JP',
      label: 'BUYMAで探す',
      destination: `https://www.buyma.com/r/${encodeURIComponent(keywordsFor('BUYMA_JP'))}/`
    },
    {
      marketplace: 'SNKRDUNK_JP',
      label: 'SNKRDUNKで探す',
      destination: `https://snkrdunk.com/search/?keywords=${encodeURIComponent(keywordsFor('SNKRDUNK_JP'))}`
    }
  ];
}
