export function safeDiscoverySearchQuery(value) {
  return String(value || '').normalize('NFKC')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig, ' ')
    .replace(/\b0\d{1,4}-?\d{1,4}-?\d{3,4}\b/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function socialDiscoverySearchLinks(value, origin = 'https://hoshilu.app') {
  const query = safeDiscoverySearchQuery(value);
  if (!query) return [];
  const encoded = encodeURIComponent(query);
  const hoshiluUrl = `${String(origin).replace(/\/$/, '')}/?q=${encoded}`;
  const shareBody = `HOSHILUでこの検索を続ける\n${query}\n${hoshiluUrl}`;
  return [
    { label: 'Instagram', url: `https://www.instagram.com/explore/search/keyword/?q=${encoded}` },
    { label: 'X', url: `https://x.com/search?q=${encoded}&src=typed_query` },
    { label: 'TikTok', url: `https://www.tiktok.com/search?q=${encoded}` },
    { label: 'YouTube', url: `https://www.youtube.com/results?search_query=${encoded}` },
    { label: 'LINEで共有', url: `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(hoshiluUrl)}` },
    { label: 'Gmailで送る', url: `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent('HOSHILU検索')}&body=${encodeURIComponent(shareBody)}` }
  ];
}

export function swippittDiscoveryMatch(value) {
  const query = String(value || '').normalize('NFKC').toLowerCase();
  const battery = /(?:バッテリー|電池|battery)/u.test(query);
  const multiple = /(?:6|六|複数|いくつも)/u.test(query);
  const phone = /(?:スマホ|携帯|iphone|phone)/u.test(query);
  const insert = /(?:入れる|差し込む|挿す|insert)/u.test(query);
  const machine = /(?:機械|マシン|装置|システム|machine|device|system)/u.test(query);
  const instant = /(?:2秒|二秒|すぐ|一瞬|数秒|充電|charge|power)/u.test(query);
  return battery && multiple && phone && instant && (insert || machine) ? {
    name: 'Swippitt Instant Power System',
    description: 'スマホをHubへ挿入すると、専用Link内のバッテリーを約2秒で交換する電源システムです。現在は公式サイトでウェイトリストを案内しています。',
    url: 'https://www.swippitt.net/',
    imageUrl: 'https://static.wixstatic.com/media/494321_4c8ba17bf4944bed9df24223e2fa8552~mv2.jpg/v1/crop/x_0%2Cy_481%2Cw_3587%2Ch_4418/fill/w_630%2Ch_776%2Cal_c%2Cq_85%2Cusm_0.66_1.00_0.01%2Cenc_avif%2Cquality_auto/_DSC4066.jpg'
  } : null;
}
