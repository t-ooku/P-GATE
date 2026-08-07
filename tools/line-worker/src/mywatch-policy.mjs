export const WATCH_EVENT_TYPES = [
  'SALE_START', 'PRICE_DROP', 'COUPON', 'RESTOCK'
];
export const WATCH_FREQUENCIES = ['INSTANT', 'DAILY', 'WEEKLY', 'MUTED'];

const FLAG_FOR_EVENT = {
  SALE_START: 'watch_sale',
  PRICE_DROP: 'watch_price',
  COUPON: 'watch_coupon',
  RESTOCK: 'watch_restock'
};

const KNOWN_MARKETPLACES = new Set([
  'AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP', 'QOO10_JP', 'SHEIN_JP',
  'ZOZOTOWN_JP', 'SHOPLIST_JP', 'MUSINSA_JP', 'BUYMA_JP', 'SNKRDUNK_JP',
  // v4.2 項目14で追加された5モール。この商品でAIウォッチを保存できるように
  // する(SHOPLIST_JP/MUSINSA_JPは既存ウォッチの後方互換のため残す)。
  'LOFT_JP', 'HANDS_JP', 'MATSUKIYO_JP', 'COSME_JP', 'ABCMART_JP'
]);

export function normalizeWatchEvent(input = {}) {
  const type = String(input.event_type || '').trim().toUpperCase();
  if (!WATCH_EVENT_TYPES.includes(type)) throw new Error('MYWATCH_EVENT_TYPE_INVALID');
  const eventKey = String(input.event_key || '').trim();
  if (!/^[A-Za-z0-9:_-]{8,160}$/.test(eventKey)) throw new Error('MYWATCH_EVENT_KEY_INVALID');
  const occurredAt = new Date(input.occurred_at || Date.now());
  if (Number.isNaN(occurredAt.valueOf())) throw new Error('MYWATCH_OCCURRED_AT_INVALID');
  const imageUrl = String(input.image_url || '').trim();
  return {
    event_key: eventKey,
    event_type: type,
    asin: /^[A-Z0-9]{10}$/i.test(String(input.asin || '').trim())
      ? String(input.asin).trim().toUpperCase() : '',
    marketplace: KNOWN_MARKETPLACES.has(String(input.marketplace || '').trim().toUpperCase())
      ? String(input.marketplace).trim().toUpperCase() : '',
    image_url: /^https:\/\//i.test(imageUrl) ? imageUrl.slice(0, 500) : '',
    title: String(input.title || '').trim().slice(0, 120),
    detail: String(input.detail || '').trim().slice(0, 500),
    occurred_at: occurredAt.toISOString()
  };
}

export function wishAcceptsEvent(wish = {}, event = {}) {
  const type = String(event.event_type || '').toUpperCase();
  const flag = FLAG_FOR_EVENT[type];
  const frequency = String(wish.watch_frequency || 'INSTANT').toUpperCase();
  return Boolean(flag && Number(wish[flag]) === 1)
    && WATCH_FREQUENCIES.includes(frequency)
    && frequency !== 'MUTED';
}

export function nextDeliveryAt(frequency = 'INSTANT', occurredAt = new Date()) {
  const date = new Date(occurredAt);
  const mode = String(frequency || 'INSTANT').toUpperCase();
  if (mode === 'DAILY') {
    date.setUTCDate(date.getUTCDate() + 1);
    date.setUTCHours(0, 0, 0, 0);
  } else if (mode === 'WEEKLY') {
    date.setUTCDate(date.getUTCDate() + 7);
    date.setUTCHours(0, 0, 0, 0);
  }
  return date.toISOString();
}

export function retryAt(attempts, now = new Date()) {
  const count = Math.max(0, Math.min(8, Number(attempts) || 0));
  const date = new Date(now);
  date.setUTCMinutes(date.getUTCMinutes() + Math.min(1440, 2 ** count * 5));
  return date.toISOString();
}

export function notificationCopy(event, language = 'JA') {
  const labels = {
    JA: { SALE_START: '販売が始まりました', PRICE_DROP: '価格が下がりました', COUPON: 'クーポン情報があります', RESTOCK: '再入荷しました' },
    EN: { SALE_START: 'Now available', PRICE_DROP: 'Price dropped', COUPON: 'Coupon available', RESTOCK: 'Back in stock' },
    ZH: { SALE_START: '现已开售', PRICE_DROP: '价格下降', COUPON: '有可用优惠券', RESTOCK: '已补货' },
    KO: { SALE_START: '판매가 시작되었습니다', PRICE_DROP: '가격이 내려갔습니다', COUPON: '쿠폰 정보가 있습니다', RESTOCK: '재입고되었습니다' }
  };
  const locale = labels[language] || labels.JA;
  return {
    title: locale[event.event_type] || locale.SALE_START,
    body: [event.title, event.detail].filter(Boolean).join(' — ').slice(0, 500)
  };
}
