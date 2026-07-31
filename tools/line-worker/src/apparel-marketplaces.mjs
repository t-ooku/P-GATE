const APPAREL_TERMS = [
  /服|洋服|トップス|シャツ|ブラウス|ニット|カーディガン|ジャケット|アウター|コート/u,
  /パンツ|デニム|ジーンズ|スカート|ワンピース|ドレス|セットアップ|スウェット|パーカー/u,
  /靴|スニーカー|ブーツ|サンダル|バッグ|帽子|アクセサリー|ファッション/u,
  /韓国(?:系|風|ファッション)|Y2K|海外ガール|ストリート|ガーリー|モード|古着/iu,
  /\b(?:clothes?|fashion|tops?|shirt|blouse|knit|cardigan|jacket|coat|pants|jeans|skirt|dress|shoes?|sneakers?|boots?|bag)\b/iu
];

function searchText(query) {
  return String(query || '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 200);
}

export function isApparelSearch(query) {
  const value = searchText(query);
  return value.length > 0 && APPAREL_TERMS.some((pattern) => pattern.test(value));
}

export function buildApparelMarketplaceDestinations(query) {
  const keywords = searchText(query);
  if (!keywords || !isApparelSearch(keywords)) return [];

  const zozo = new URL('https://zozo.jp/search/');
  zozo.searchParams.set('p_keyv', keywords);

  const shoplist = new URL('https://www.shop-list.com/women/svc/product/Search/');
  shoplist.searchParams.set('keyword', keywords);

  const musinsa = new URL('https://global.musinsa.com/jp/search/goods');
  musinsa.searchParams.set('keyword', keywords);

  return [
    { marketplace: 'ZOZOTOWN_JP', label: 'ZOZOTOWNで探す', destination: zozo.toString() },
    { marketplace: 'SHOPLIST_JP', label: 'SHOPLISTで探す', destination: shoplist.toString() },
    { marketplace: 'MUSINSA_JP', label: 'MUSINSAで探す', destination: musinsa.toString() },
    {
      marketplace: 'BUYMA_JP',
      label: 'BUYMAで探す',
      destination: `https://www.buyma.com/r/${encodeURIComponent(keywords)}/`
    },
    {
      marketplace: 'SNKRDUNK_JP',
      label: 'SNKRDUNKで探す',
      destination: `https://snkrdunk.com/search/?keywords=${encodeURIComponent(keywords)}`
    }
  ];
}
