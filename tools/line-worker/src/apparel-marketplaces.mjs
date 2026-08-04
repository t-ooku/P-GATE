import { buildMarketplaceSearchKeywords } from '../public/marketplace-search-keywords-v2.mjs';

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
  if (!source || !isApparelSearch(source)) return [];

  const keywordsFor = (marketplace) =>
    buildMarketplaceSearchKeywords(source, marketplace) || source;

  const zozo = new URL('https://zozo.jp/search/');
  zozo.searchParams.set('p_keyv', keywordsFor('ZOZOTOWN_JP'));

  const shoplist = new URL('https://www.shop-list.com/women/svc/product/Search/');
  shoplist.searchParams.set('keyword', keywordsFor('SHOPLIST_JP'));

  const musinsa = new URL('https://global.musinsa.com/jp/search/goods');
  musinsa.searchParams.set('keyword', keywordsFor('MUSINSA_JP'));

  return [
    { marketplace: 'ZOZOTOWN_JP', label: 'ZOZOTOWNで探す', destination: zozo.toString() },
    { marketplace: 'SHOPLIST_JP', label: 'SHOPLISTで探す', destination: shoplist.toString() },
    { marketplace: 'MUSINSA_JP', label: 'MUSINSAで探す', destination: musinsa.toString() },
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
