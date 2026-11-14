const FACET_RULES = {
  style: [
    ['korean-street', /韓国(?:系|風)?(?:ストリート|ファッション)?|korean street/iu, ['韓国ストリート']],
    ['korean-girly', /韓国(?:系|風)?(?:ガーリー|フェミニン)|korean girly/iu, ['韓国ガーリー']],
    ['y2k', /\bY2K\b|平成ギャル|2000年代風/iu, ['Y2K']],
    ['overseas-girl', /海外ガール|海外セレブ風|western girl/iu, ['海外ガール']],
    ['city-boy', /シティボーイ|city boy/iu, ['シティボーイ']],
    ['mode', /モード系?|minimal mode/iu, ['モード']],
    ['girly', /ガーリー|girly/iu, ['ガーリー']],
    ['feminine', /フェミニン|feminine/iu, ['フェミニン']],
    ['jirai', /地雷系?|jirai/iu, ['地雷系']],
    ['ryousangata', /量産型|量産系/iu, ['量産型']],
    ['grunge', /グランジ|grunge/iu, ['グランジ']],
    ['vintage', /古着|ヴィンテージ|vintage|retro/iu, ['古着風']],
    ['sporty', /スポーティー|スポーツミックス|sporty/iu, ['スポーティー']]
  ],
  category: [
    ['tops', /トップス|シャツ|ブラウス|ニット|セーター|カーディガン|Tシャツ|tee|tops?|shirt|blouse|knit|cardigan/iu, ['トップス']],
    ['outer', /ジャケット|アウター|コート|ブルゾン|ダウン|jacket|outer|coat|blouson/iu, ['アウター']],
    ['pants', /パンツ|ズボン|デニム|ジーンズ|カーゴ|スラックス|pants|jeans|denim|cargo|trousers/iu, ['パンツ']],
    ['skirt', /スカート|skirt/iu, ['スカート']],
    ['dress', /ワンピース|ドレス|dress/iu, ['ワンピース']],
    ['setup', /セットアップ|上下セット|two.piece|setup/iu, ['セットアップ']],
    ['shoes', /靴|スニーカー|ブーツ|サンダル|shoes?|sneakers?|boots?|sandals?/iu, ['シューズ']],
    ['bag', /バッグ|かばん|鞄|bag|purse/iu, ['バッグ']]
  ],
  silhouette: [
    ['cropped', /クロップド|ショート丈|短い丈|crop(?:ped)?/iu, ['クロップド丈']],
    ['oversized', /オーバーサイズ|だぼだぼ|ゆったり|oversized|baggy/iu, ['オーバーサイズ']],
    ['tight', /タイト|ぴったり|bodycon|slim fit/iu, ['タイト']],
    ['wide', /ワイド|wide leg/iu, ['ワイド']],
    ['flare', /フレア|flare/iu, ['フレア']],
    ['mini', /ミニ丈|ミニスカ|mini/iu, ['ミニ丈']],
    ['long', /ロング丈|マキシ|long|midi|m[áa]xi/iu, ['ロング丈']]
  ],
  detail: [
    ['sheer', /シアー|透け感|メッシュ|sheer|mesh/iu, ['シアー']],
    ['ribbon', /リボン|bow/iu, ['リボン']],
    ['off-shoulder', /オフショル|肩出し|off.shoulder/iu, ['オフショルダー']],
    ['frill', /フリル|ruffle/iu, ['フリル']],
    ['pleats', /プリーツ|pleat/iu, ['プリーツ']]
  ],
  color: [
    ['black', /黒|ブラック|black/iu, ['黒']],
    ['white', /白|ホワイト|white/iu, ['白']],
    ['gray', /グレー|灰色|gray|grey/iu, ['グレー']],
    ['beige', /ベージュ|beige/iu, ['ベージュ']],
    ['pink', /ピンク|pink/iu, ['ピンク']],
    ['blue', /青|ブルー|blue/iu, ['ブルー']],
    ['silver', /シルバー|銀|silver/iu, ['シルバー']]
  ]
};

export function apparelSearchFacets(query) {
  const source = String(query || '').normalize('NFKC').trim().slice(0, 500);
  const facets = {};
  for (const [dimension, rules] of Object.entries(FACET_RULES)) {
    const matches = rules
      .filter(([, pattern]) => pattern.test(source))
      .map(([id,, terms]) => ({ id, terms }));
    if (matches.length) facets[dimension] = matches;
  }
  return facets;
}

export function apparelMarketplaceKeywords(query) {
  const facets = apparelSearchFacets(query);
  const normalized = Object.values(facets)
    .flat()
    .flatMap((item) => item.terms)
    .filter((value, index, values) => values.indexOf(value) === index);
  return normalized.length ? normalized.join(' ') : String(query || '').normalize('NFKC').trim().slice(0, 200);
}

export const apparelFacetDimensions = Object.freeze(Object.keys(FACET_RULES));
