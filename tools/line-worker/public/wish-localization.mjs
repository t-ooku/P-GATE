const DEMO_WISHES = Object.freeze({
  'アメリカで見た限定フィギュア バットマン 黒': {
    EN: 'US-exclusive Batman figure, black',
    ZH: '在美国看到的限定版黑色蝙蝠侠手办',
    KO: '미국에서 본 한정판 배트맨 피규어, 블랙'
  },
  '日本で使える米国の小型電化製品 電源 ドライヤー': {
    EN: 'Compact US hair dryer compatible with Japan',
    ZH: '可在日本使用的美国小型吹风机',
    KO: '일본에서 사용할 수 있는 미국 소형 헤어드라이어'
  },
  'オーガニック系のさつまいもチップス': {
    EN: 'Organic-style sweet potato chips',
    ZH: '有机风味红薯片',
    KO: '유기농 스타일 고구마 칩'
  },
  '夏用のグレーのジャケット / 美容・身だしなみに使う': {
    EN: 'Gray summer jacket / for personal styling',
    ZH: '夏季灰色夹克 / 用于穿搭造型',
    KO: '여름용 회색 재킷 / 스타일링에 사용'
  }
});

export function localizedWishLabel(query, language = 'JA') {
  const value = String(query || '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (!value || language === 'JA') return value;
  return DEMO_WISHES[value]?.[language] || value;
}

export const localizedDemoWishes = DEMO_WISHES;
