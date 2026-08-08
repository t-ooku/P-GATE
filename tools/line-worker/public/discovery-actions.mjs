export function safeDiscoverySearchQuery(value) {
  return String(value || '').normalize('NFKC')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig, ' ')
    .replace(/\b0\d{1,4}-?\d{1,4}-?\d{3,4}\b/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function gmailShareLink(subject, body) {
  return `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function socialDiscoverySearchLinks(value, origin = 'https://hoshilu.app') {
  const query = safeDiscoverySearchQuery(value);
  if (!query) return [];
  const encoded = encodeURIComponent(query);
  const hoshiluUrl = `${String(origin).replace(/\/$/, '')}/?q=${encoded}`;
  // `channel` drives the brand-colour CSS in ai-search-ui.css
  // (.marketplace-search-link[data-channel="..."]). Without it these render
  // with no background at all - i.e. as plain blue default-link text, which
  // is exactly the "青文字リンク" regression.
  return [
    // Instagram/TikTokのモバイルアプリはUniversal Linkを開く際に検索クエリを
    // 落とすことがある。URLにも検索語を残しつつ、リンク押下時に同じ語を
    // クリップボードへ保存して、遷移先が空欄でもそのまま貼り付けられるようにする。
    { channel: 'instagram', label: 'Instagramで探す', url: `https://www.instagram.com/explore/search/keyword/?q=${encoded}`, search_query: query, copy_query: true },
    { channel: 'x', label: 'Xで探す', url: `https://x.com/search?q=${encoded}&src=typed_query` },
    { channel: 'tiktok', label: 'TikTokで探す', url: `https://www.tiktok.com/search/video?q=${encoded}`, search_query: query, copy_query: true },
    { channel: 'youtube', label: 'YouTubeで探す', url: `https://www.youtube.com/results?search_query=${encoded}` },
    { channel: 'line', label: 'LINEで共有', url: `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(hoshiluUrl)}` }
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
