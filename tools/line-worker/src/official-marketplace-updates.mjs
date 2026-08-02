const SOURCES = Object.freeze([
  ['AMAZON_JP','Amazon','https://www.amazon.co.jp/gp/goldbox/','Amazonのタイムセール・公式情報'],
  ['RAKUTEN_JP','楽天市場','https://event.rakuten.co.jp/','楽天市場のキャンペーン・公式情報'],
  ['YAHOO_JP','Yahoo!ショッピング','https://shopping.yahoo.co.jp/promotion/campaign/guide/','Yahoo!ショッピングのお得情報'],
  ['QOO10_JP','Qoo10','https://www.qoo10.jp/gmkt.inc/deal/timesale.aspx','Qoo10のタイムセール・公式情報'],
  ['SHEIN_JP','SHEIN','https://jp.shein.com/','SHEINのセール・公式情報'],
  ['ZOZOTOWN','ZOZOTOWN','https://zozo.jp/coupon/','ZOZOTOWNの本日のショップクーポン'],
  ['SHOPLIST','SHOPLIST','https://shop-list.com/all/svc/product/Search/?type=sale','SHOPLISTのセール・公式情報'],
  ['MUSINSA','MUSINSA','https://global.musinsa.com/jp/main/welcome','MUSINSAのセール・公式情報'],
  ['BUYMA','BUYMA','https://www.buyma.com/','BUYMAのクーポン・公式情報'],
  ['SNKRDUNK','SNKRDUNK','https://snkrdunk.com/information/','SNKRDUNKの運営からのお知らせ']
]);

const DOMAIN = Object.freeze({
  AMAZON_JP:'amazon.co.jp',RAKUTEN_JP:'rakuten.co.jp',YAHOO_JP:'shopping.yahoo.co.jp',QOO10_JP:'qoo10.jp',
  SHEIN_JP:'shein.com',ZOZOTOWN:'zozo.jp',SHOPLIST:'shop-list.com',MUSINSA:'musinsa.com',BUYMA:'buyma.com',SNKRDUNK:'snkrdunk.com'
});

function decode(value='') {
  return String(value).replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/\s+/g,' ').trim();
}

function metadata(html, fallbackTitle, label) {
  const title = decode(html.match(/<meta[^>]+(?:property|name)=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1]
    || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || fallbackTitle).slice(0,140);
  const description = decode(html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content=["']([^"']+)/i)?.[1]
    || `${label}の公式ページで現在掲載されている情報です。条件・対象者・期間は公式ページで確認してください。`).slice(0,500);
  return { title: title || fallbackTitle, summary: description };
}

function officialUrl(marketplace, value) {
  try {
    const url = new URL(value), domain = DOMAIN[marketplace];
    return url.protocol === 'https:' && (url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  } catch { return false; }
}

function stableId(value='') {
  let hash=2166136261;
  for(const char of String(value)){hash^=char.codePointAt(0);hash=Math.imul(hash,16777619);}
  return (hash>>>0).toString(36);
}

function noticeType(title='') {
  if(/(?:クーポン|coupon|优惠券|쿠폰)/iu.test(title))return'COUPON';
  if(/(?:新着|新商品|new arrivals?|新品|신상품)/iu.test(title))return'NEW_ARRIVAL';
  if(/(?:限定|limited|限量|한정)/iu.test(title))return'LIMITED';
  if(/(?:セール|sale|割引|off|deal|タイムセール|促销|세일)/iu.test(title))return'SALE';
  return'EDITORIAL';
}

export function extractOfficialNotices(html,marketplace,label,baseUrl) {
  const notices=[],seen=new Set();
  const pattern=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu;
  for(const match of String(html||'').matchAll(pattern)){
    const title=decode(match[2]).slice(0,140);
    if(title.length<6||!/(?:セール|クーポン|キャンペーン|ポイント|お得|割引|特集|新着|限定|sale|coupon|campaign|points?|deal|event|new arrivals?|促销|优惠|积分|活动|세일|쿠폰|이벤트|포인트)/iu.test(title))continue;
    if(/(?:TOPへ$|について$|^その他の|AIでさがす|ポイントメイク$|利用ガイド|ヘルプ|よくある質問)/iu.test(title))continue;
    let url='';try{url=new URL(match[1],baseUrl).href;}catch{continue;}
    if(!officialUrl(marketplace,url)||seen.has(url)||url===baseUrl)continue;
    seen.add(url);
    notices.push({marketplace,title,summary:`${label}公式ページに現在掲載されている情報です。条件・対象・期間は公式ページで確認してください。`,source_url:url,info_type:noticeType(title),sale_id:`official-notice-${marketplace}-${stableId(url)}`});
    if(notices.length===3)break;
  }
  return notices;
}

async function fetchSource(source, fetcher) {
  const [marketplace,label,url,fallbackTitle] = source;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(url, { redirect:'follow', signal:controller.signal, headers:{'user-agent':'HOSHILU-Sale-Radar/1.0 (+https://hoshilu.app/)','accept':'text/html'} });
    if (!response.ok || !officialUrl(marketplace, response.url || url)) throw new Error(`OFFICIAL_SOURCE_${response.status}`);
    const html = (await response.text()).slice(0,750000);
    const copy = metadata(html, fallbackTitle, label);
    const sourceUrl=response.url || url;
    return { marketplace, source_url:sourceUrl, ...copy, notices:extractOfficialNotices(html,marketplace,label,sourceUrl) };
  } finally { clearTimeout(timer); }
}

export async function syncOfficialMarketplaceUpdates(env, now=new Date(), fetcher=fetch) {
  if (!env.PRODUCT_DB) return { checked:SOURCES.length, updated:0, failed:SOURCES.length };
  const results = await Promise.allSettled(SOURCES.map((source)=>fetchSource(source,fetcher)));
  const startsAt = now.toISOString(), endsAt = new Date(now.getTime()+36*3600000).toISOString();
  let updated=0, failed=0;
  for (const result of results) {
    if (result.status !== 'fulfilled') { failed+=1; continue; }
    const item=result.value;
    await env.PRODUCT_DB.prepare(`UPDATE marketplace_sale_events SET status='DRAFT',updated_at=?2 WHERE marketplace=?1 AND sale_id LIKE ?3`)
      .bind(item.marketplace,startsAt,`official-notice-${item.marketplace}-%`).run();
    const rows=[{...item,sale_id:`official-feed-${item.marketplace}`,info_type:'EDITORIAL'},...(item.notices||[])];
    for(const row of rows){
      const infoType=['SALE','COUPON','NEW_ARRIVAL','LIMITED','EDITORIAL'].includes(row.info_type)?row.info_type:'EDITORIAL';
      await env.PRODUCT_DB.prepare(
      `INSERT INTO marketplace_sale_events
       (sale_id,marketplace,info_type,title,summary,starts_at,ends_at,announced_at,source_url,image_url,image_rights_status,video_url,video_rights_status,status,created_at,updated_at)
       VALUES(?1,?2,'${infoType}',?3,?4,?5,?6,?5,?7,'','NONE','','NONE','APPROVED',?5,?5)
       ON CONFLICT(sale_id) DO UPDATE SET title=excluded.title,summary=excluded.summary,starts_at=excluded.starts_at,
       ends_at=excluded.ends_at,announced_at=excluded.announced_at,source_url=excluded.source_url,info_type=excluded.info_type,status='APPROVED',updated_at=excluded.updated_at`
      ).bind(row.sale_id,item.marketplace,row.title,row.summary,startsAt,endsAt,row.source_url).run();
    }
    updated+=1;
  }
  return { checked:SOURCES.length, updated, failed };
}

export const OFFICIAL_MARKETPLACE_SOURCES = SOURCES;
