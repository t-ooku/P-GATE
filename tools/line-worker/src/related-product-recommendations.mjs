import { expandSearchQuery } from './query-expansion.mjs';

const RULES = [
  { match:/スマホ.{0,4}(?:ケース|カバー)|iphone.{0,4}(?:case|ケース|カバー)/iu, items:[['スマホ充電器','一緒に使う充電用品'],['スマホストラップ','持ち歩きや落下防止に関連'],['スマホ保護フィルム','端末保護に関連']] },
  { match:/ハンディファン|携帯扇風機|顔用扇風機/iu, items:[['モバイルバッテリー','外出先での給電に関連'],['冷感タオル','暑さ対策として関連'],['ネッククーラー','同じ利用場面の暑さ対策']] },
  { match:/ワイヤレスイヤホン|bluetooth.{0,3}イヤホン/iu, items:[['イヤホンケース','持ち運びと保護に関連'],['USB充電器','イヤホンの充電に関連'],['Bluetoothトランスミッター','接続機器の拡張に関連']] },
  { match:/スニーカー|ランニングシューズ/iu, items:[['靴下','一緒に着用する商品'],['インソール','履き心地の調整に関連'],['防水スプレー 靴','靴の手入れに関連']] },
  { match:/化粧水|フェイスローション/iu, items:[['乳液','スキンケア手順で関連'],['美容液','同じスキンケア用途'],['コットン 化粧用','化粧水の使用時に関連']] }
];

export function relatedProductRecommendationQueries(rawQuery) {
  const query=expandSearchQuery(rawQuery).query;
  const rule=RULES.find(item=>item.match.test(query));
  return rule ? rule.items.map(([query,reason])=>({query,reason})) : [];
}
