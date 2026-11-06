import { load } from 'cheerio';
import type { SellerInfo } from '../types/index.js';
import { fetchPublic, assertRobotsAllowed } from '../lib/publicWeb.js';

export function parseSeller(html: string, storeUrl: string): SellerInfo {
  const $ = load(html), base = new URL(storeUrl);
  const platform = /(?:^|\.)(?:thebase\.in|base\.shop)$/i.test(base.hostname)
    || /base(?:\.shop|ec\.in)|thebase\.in/i.test(html) ? 'BASE'
    : /(?:^|\.)stores\.jp$/i.test(base.hostname) || /stores\.jp/i.test(html) ? 'STORES' : 'OTHER';
  const text = (s: string) => s.replace(/\s+/gu, ' ').trim();
  const sameOrigin = (href: string | undefined) => {
    try { const u = new URL(href ?? '', base); return u.origin === base.origin && u.protocol === 'https:' ? u.href : null; }
    catch { return null; }
  };
  const products: SellerInfo['mainProducts'] = [];
  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href');
    const url = sameOrigin(href);
    if (!url || !/\/(?:items|products)\//u.test(new URL(url).pathname)) return;
    const name = text($(el).find('[itemprop=name],.itemTitle,.item-name,.product-title').first().text()
      || $(el).find('img').first().attr('alt') || $(el).text()).slice(0, 160);
    if (name && !products.some(p => p.url === url) && products.length < 5) products.push({ name, url });
  });
  const contactUrls: string[] = [];
  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href');
    let url = sameOrigin(href);
    if (!url && href) {
      try {
        const external = new URL(href, base);
        if (external.protocol === 'https:' && external.hostname === 'thebase.com'
          && external.pathname.startsWith('/inquiry/')) url = external.href;
      } catch { /* Not a supported public contact URL. */ }
    }
    if (url && /contact|inquiry|お問い合わせ/u.test(`${url} ${$(el).text()}`)) contactUrls.push(url);
  });
  const description = $('meta[name=description]').attr('content') ?? '';
  const about = $('[itemprop=description],.shop-description,.about-description').first().text();
  const name = text($('meta[property="og:site_name"]').attr('content') || $('h1').first().text()
    || $('title').text()).slice(0, 120);
  const categories = [...new Set($('[itemprop=category],a[href*="/categories/"]').map((_i, el) =>
    text($(el).text())).get().filter(Boolean))].slice(0, 20);
  const mailto = $('a[href^="mailto:"]').first().attr('href');
  const email = mailto?.slice(7).split('?')[0] ?? null;
  return { name, platform, storeUrl: base.href, contactFormUrl: contactUrls[0] ?? null,
    email, categories, mainProducts: products, features: text(`${description} ${about}`).slice(0, 2000),
    fetchedAt: new Date().toISOString(), sourceUrls: [base.href] };
}

export async function scrapeSeller(storeUrl: string): Promise<SellerInfo> {
  await assertRobotsAllowed(storeUrl);
  const page = await fetchPublic(storeUrl);
  if (page.status !== 200) throw new Error(`STORE_HTTP_${page.status}`);
  const seller = parseSeller(page.text, page.url);
  if (!seller.name || !seller.mainProducts.length || seller.features.length < 12) {
    throw new Error('INSUFFICIENT_PUBLIC_STORE_EVIDENCE');
  }
  return seller;
}
