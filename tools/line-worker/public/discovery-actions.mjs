export function safeDiscoverySearchQuery(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig, ' ')
    .replace(/\b0\d{1,4}-?\d{1,4}-?\d{3,4}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function socialDiscoverySearchLinks(value) {
  const query = safeDiscoverySearchQuery(value);
  if (!query) return [];
  const encoded = encodeURIComponent(query);
  return [
    { label: 'Instagram', url: `https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com ${query}`)}` },
    { label: 'X', url: `https://x.com/search?q=${encoded}&src=typed_query` },
    { label: 'TikTok', url: `https://www.google.com/search?q=${encodeURIComponent(`site:tiktok.com ${query}`)}` },
    { label: 'YouTube', url: `https://www.youtube.com/results?search_query=${encoded}` },
  ];
}

export function swippittDiscoveryMatch(value) {
  const query = String(value || '').normalize('NFKC').toLowerCase();
  const battery = /(?:バッテリー|電池|battery)/u.test(query);
  const multiple = /(?:6|六|複数|いくつも)/u.test(query);
  const phone = /(?:スマホ|携帯|iphone|phone)/u.test(query);
  const insert = /(?:入れ|差し|挿し|insert)/u.test(query);
  const instant = /(?:すぐ|一瞬|数秒|充電|charge|power)/u.test(query);
  return battery && multiple && phone && insert && instant ? {
    name: 'Swippitt Instant Power System',
    description: 'スマホをHubへ挿入すると、専用Link内のバッテリーを約2秒で交換する電源システムです。現在は公式サイトでウェイトリストを案内しています。',
    url: 'https://www.swippitt.net/',
    imageUrl: 'https://static.wixstatic.com/media/494321_4c8ba17bf4944bed9df24223e2fa8552~mv2.jpg/v1/crop/x_0%2Cy_481%2Cw_3587%2Ch_4418/fill/w_630%2Ch_776%2Cal_c%2Cq_85%2Cusm_0.66_1.00_0.01%2Cenc_avif%2Cquality_auto/_DSC4066.jpg',
  } : null;
}
