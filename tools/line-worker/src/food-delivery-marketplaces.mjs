const FOOD_TERMS = [
  /\u98df\u4e8b|\u3054\u98ef|\u3054\u306f\u3093|\u30e9\u30f3\u30c1|\u5915\u98df|\u5f01\u5f53|\u5b85\u914d|\u51fa\u524d|\u30c7\u30ea\u30d0\u30ea\u30fc|\u30d4\u30b6|\u5bff\u53f8|\u30e9\u30fc\u30e1\u30f3|\u30ab\u30ec\u30fc|\u30cf\u30f3\u30d0\u30fc\u30ac\u30fc/u,
  /\b(?:food|meal|lunch|dinner|delivery|takeout|pizza|sushi|ramen|curry|burger)\b/iu
];

function searchText(query) {
  return String(query || '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 200);
}

export function isFoodDeliverySearch(query) {
  const value = searchText(query);
  return value.length > 0 && FOOD_TERMS.some((pattern) => pattern.test(value));
}

export function buildFoodDeliveryDestinations(query) {
  if (!isFoodDeliverySearch(query)) return [];
  return [
    { marketplace: 'UBER_EATS_JP', label: 'Uber Eatsで探す', destination: 'https://www.ubereats.com/jp' },
    { marketplace: 'DEMAE_CAN_JP', label: '出前館で探す', destination: 'https://demae-can.com/' },
    { marketplace: 'MENU_JP', label: 'menuで探す', destination: 'https://menu.jp/' },
    { marketplace: 'ROCKET_NOW_JP', label: 'Rocket Nowで探す', destination: 'https://www.rocketnow.co.jp/' }
  ];
}
