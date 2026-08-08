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

  // 2026-08-08 report: マツキヨの検索語が維持されないと再報告があり、
  // ?q= パラメータを実際に検証した(WebFetchで同一クエリ・存在しないはず
  // のダミーキーワードの両方を投げても「検索結果 27,438 商品」と常に同じ
  // 件数が返り、キーワードが一切フィルタに効いていないことを確認)。誤った
  // パラメータのまま検索結果面に直リンクするより安全なため、@cosme/
  // ABC-MARTと同じ「暫定ランディングページ」方式に切り替える。正しい
  // パラメータ名(または検索がJS側でのみ発火する仕様)が確認でき次第、
  // keywordsFor()を使った直リンクに戻すこと。
  const matsukiyo = 'https://www.matsukiyococokara-online.com/store/catalogsearch/result/';

  // 2026-08-08: @cosme SHOPPINGの正しい検索パラメータをWebFetchで特定した。
  // products/search.php(旧実装)はキーワードを受け付けない静的ランディング
  // ページだったが、products/list.php?name=<keyword> は実際のブランド商品
  // 検索ページが使っている形式で、実クエリ(例:「ファンデーション」→
  // 3,106件)と存在しないダミー語(→「該当件数0件です」)とで結果件数が
  // 正しく変わることを確認済み。
  const cosme = new URL('https://www.cosme.com/products/list.php');
  cosme.searchParams.set('name', keywordsFor('COSME_JP'));

  // 2026-08-08: ABC-MARTの検索パラメータをWebSearchで調査した。
  // www.abc-mart.net/shop/goods/search.aspx?keyword=... という形の実URLが
  // 検索エンジンに複数件インデックスされており(例: gs.abc-mart.net/shop/
  // goods/search.aspx?keyword=adidas+gazelle)、keyword= が正しいパラメータ
  // 名である可能性が高い。ただしabc-mart.net自体はWebFetchを403で拒否する
  // ためライブでの差分検証(実クエリ/ダミー語で件数が変わるか)はできて
  // いない - マツキヨ・@cosmeほど確実ではない点は正直に記しておく。誤りと
  // 分かった場合はランディングページ方式に戻すこと。
  const abcmart = new URL('https://www.abc-mart.net/shop/goods/search.aspx');
  abcmart.searchParams.set('keyword', keywordsFor('ABCMART_JP'));

  return [
    { marketplace: 'ZOZOTOWN_JP', label: 'ZOZOTOWNで探す', destination: zozo },
    { marketplace: 'LOFT_JP', label: 'ロフトで探す', destination: loft.toString() },
    { marketplace: 'HANDS_JP', label: 'ハンズで探す', destination: hands },
    { marketplace: 'MATSUKIYO_JP', label: 'マツキヨココカラで探す', destination: matsukiyo },
    { marketplace: 'COSME_JP', label: '@cosme SHOPPINGで探す', destination: cosme.toString() },
    { marketplace: 'ABCMART_JP', label: 'ABC-MARTで探す', destination: abcmart.toString() },
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
