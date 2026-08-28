// Shared public-output boundary for AI-generated product hypotheses.
// Prompts are guidance, not enforcement: every AI-controlled display/search
// field passes this sanitizer before it may reach the client or a marketplace.

const URL_LIKE = /(?:https?\s*:\s*\/\/|www\.)[^\s<>()]+|(?<![\p{L}\p{N}@])(?:[a-z0-9](?:[a-z0-9-]{0,62})\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})(?::[0-9]{1,5})?(?:\/[^\s<>()]*)?|(?<![\p{L}\p{N}])(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?::[0-9]{1,5})?(?:\/[^\s<>()]*)?/giu;
const UNVERIFIED_CLAIM_PHRASE = /(?:\b(?:(?:about|around|approximately|roughly)\s+)?(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)(?:[\s-]+(?:and|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion))*\s+(?:yen|dollars?|euros?|pounds?)\b|가격\s*(?:은|는|이|가)?\s*[0-9０-９][0-9０-９,，.．\s]*\s*원\s*(?:입니다|이다|이에요|예요)?|价格\s*(?:是|为|為|:|：)?\s*(?:[0-9０-９][0-9０-９,，.．\s]*|[〇零一二三四五六七八九十百千万億]+)\s*元|(?:販売元)\s*(?:は|が|:|：)?\s*[^,，.。;；\n]{1,80}|[^\s,，.。;；:：]{1,60}\s*(?:で\s*(?:取(?:り)?扱(?:い)?中(?:です)?|見つけ(?:ました|ます|た|る))|に\s*あり(?:ます)?)|\b(?:can\s+be\s+purchased|on\s+sale)\s+(?:at|from|on|by|via)\s+[\p{L}\p{N}.&'’_-]{1,60}\b)/giu;
const PRICE = /(?:(?:US|CA|AU|NZ|HK|SG)?[¥￥$＄€£]\s*[0-9０-９][0-9０-９,，.．\s]*|(?:USD|JPY|EUR|GBP|CNY|KRW)\s*[0-9０-９][0-9０-９,，.．\s]*|[0-9０-９]+(?:[.,．][0-9０-９]+)?\s*[kKmM]\s*(?:円|ドル|ユーロ|ポンド|元|ウォン|원|USD|JPY|EUR|GBP|CNY|KRW|yen|[¥￥$＄€£])|[0-9０-９][0-9０-９,，.．\s]*(?:만|억)\s*원|[0-9０-９][0-9０-９,，.．\s]*\s*(?:円|ドル|ユーロ|ポンド|元|ウォン|원|USD|JPY|EUR|GBP|CNY|KRW|yen|[¥￥$＄€£])|[〇零一二三四五六七八九十百千万億]+\s*(?:円|元|원))/giu;
const PURCHASE_LOCATION_CLAIM = /(?:(?:購入先|販売先|取扱(?:い)?店(?:舗)?|買える店)\s*(?:は|が|:|：)?\s*[^,，.。;；\n]{1,80}|[^\s,，.。;；:：]{1,60}\s*(?:で|にて|から)\s*(?:購入(?:でき(?:ます|る)|可能)?|買(?:えます|える|います|う)|注文(?:でき(?:ます|る)|可能)?|販売(?:中|しています|している)?|売(?:っています|っている|られています|られている)?|取(?:り)?扱(?:っています|っている|います|う)|見つか(?:ります|る)|入手(?:できます|できる|可能)?|在庫\s*(?:あり|有り|ございます))|(?:可\s*在|在)\s*[^,，.。;；\n]{1,60}?\s*(?:购买|購買|可以买到|可以買到)|[^,，.。;；\n]{1,60}?\s*(?:有售|正在出售)|[^,，.。;；\n]{1,60}?\s*에서\s*(?:구매할\s*수\s*있습니다|구매\s*가능|판매\s*중(?:입니다)?|찾을\s*수\s*있습니다)|\b(?:(?:you\s+)?can\s+)?(?:buy|purchase|order|find)\s+(?:it|this|that|them)\s+(?:at|from|on|by|via)\s+[\p{L}\p{N}.&'’_-]{1,60}\b|\b[\p{L}\p{N}.&'’_-]{1,60}\s+(?:has|carries|stocks|sells)\s+(?:it|this|that|them)\b|\b(?:available|sold|buy|purchase|order|found)(?:\s+now)?\s+(?:(?:it|this|that|them)\s+)?(?:at|from|on|by|via)\s+[\p{L}\p{N}.&'’_-]{1,60}\b)/giu;
const COMMERCIAL_CLAIM = /(?:在庫\s*(?:(?:が|は)\s*)?(?:ある|あります|あり|有り|ございます|切れ|なし|無し|僅少)|残り\s*(?:[0-9０-９]+|[〇零一二三四五六七八九十百千万]+)\s*(?:点|個|台|本)?|残り\s*(?:わずか|僅か|僅少)|販売\s*中|売り切れ|品切れ|再入荷|入荷済み?|取扱(?:い)?\s*あり|予約受付\s*中|購入先|今すぐ購入|購入\s*(?:できます|可能)|買えます|買える店|注文\s*(?:できます|可能)|有货|現貨|现货|缺货|缺貨|售罄|在售|재고\s*(?:있음|없음|소진)|품절|판매\s*중|구매처)|\b(?:in(?:\s+|-)stock|out\s+of\s+stock|back\s+in\s+stock|sold\s+out|available\s+now|now\s+available|stock\s+available|limited\s+stock|few\s+left|only\s+[0-9]+\s+(?:item|items|unit|units)?\s*left|buy\s+now|order\s+now|purchase\s+at|for\s+sale)\b/giu;

// Broad, sentence-level backstop. Commerce language evolves much faster than
// a phrase denylist, so an AI-controlled sentence containing a price,
// availability, fulfilment, or purchase-location claim is discarded in full.
// Word boundaries deliberately preserve names such as Birkenstock, Stockholm,
// and Woodstock while rejecting the standalone commerce word "stock".
const BROAD_COMMERCE_SIGNAL = /(?:\b(?:inventory|availability|available|unavailable|stock|sold|selling|sale|pre[ -]?order|back[ -]?order(?:ed)?|restock(?:ed|ing|s)?|discontinued|ship(?:ped|ping|s)?|postage|freight|delivery|deliver(?:ed|ies|ing|s)?|arriv(?:e|ed|es|ing)|fulfill(?:ed|ment|s)?|dispatch(?:ed|es|ing)?|list(?:ed|ing|s)?|offer(?:ed|ing|s)?|retail(?:ed|ing|s)?|suppl(?:y|ied|ies)|carr(?:y|ied|ies|ying))\b|\b(?:buy|purchase|order|get|find)\s+(?:it|this|that|them|yours)\b|\b(?:amazon|rakuten|walmart|target|etsy|ebay|shop|store|seller|marketplace)\b.{0,40}\b(?:offers?|lists?|has|carries|stocks?|sells?)\b|(?:価格|値段|販売|購入|注文|予約|発売|在庫|売り切れ|品切れ|欠品|完売|再入荷|入荷待ち|取(?:り)?扱(?:い)?|取(?:り)?寄せ|買(?:え|える|えます)|入手|出荷|発送|配送|配達|送料|お届け|届く|掲載|提供|出品)|(?:价格|價格|售价|售價|库存|庫存|购买|購買|下单|下單|有售|有卖|有賣|在售|缺货|缺貨|售罄|补货|補貨|发货|發貨|包邮|包郵|免运费|免運費|仅剩\s*[0-9０-９]+\s*件|僅剩\s*[0-9０-９]+\s*件|卖完了|賣完了|送达|送達|到货|到貨|上架|提供|出售|销售|銷售|可以买|可以買)|(?:가격|재고|판매|구매|주문|예약|출시|품절|재입고|배송|배달|출고|도착|등록|제공|취급|[0-9０-９]+\s*개\s*남음))/iu;
const BROAD_PRICE_SIGNAL = /(?:\p{Sc}\s*[0-9０-９][0-9０-９,，.．\s]*|[0-9０-９][0-9０-９,，.．\s]*\s*\p{Sc}|\b(?:USD|JPY|EUR|GBP|CNY|RMB|KRW)\s*[0-9０-９][0-9０-９,，.．\s]*\b|(?:人民币|人民幣)\s*[0-9０-９][0-9０-９,，.．\s]*|\b[0-9０-９][0-9０-９,，.．\s]*\s*(?:bucks?|yuan|won|quid)\b|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)(?:[\s-]+(?:and|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million))*\s+(?:bucks?|yuan|won|quid)\b|[0-9０-９]+\s*[十百千万億]\s*(?:円|ドル|ユーロ|ポンド|元|ウォン)|(?:約|约|大約|약)?\s*[〇零一二三四五六七八九十百千万億]+\s*(?:円|ドル|ユーロ|ポンド|元|ウォン|块钱|塊錢|块|塊)|[일이삼사오육칠팔구십백천만억]+\s*원)/iu;

// Additional concept-level guards keep the public boundary fail-closed even
// when a model paraphrases a commerce assertion without a currency symbol or
// a marketplace name. These are intentionally sentence-level: HOSHILU's
// verified marketplace pipeline, not AI prose, owns price and offer facts.
const BROAD_CURRENCY_ALIAS_SIGNAL = /(?:\b[0-9０-９][0-9０-９,，.．\s]*\s*(?:USD|JPY|EUR|GBP|CNY|RMB|KRW)\b|[0-9０-９][0-9０-９,，.．\s]*\s*(?:人民币|人民幣|块钱|塊錢|块|塊|えん))/iu;
const BROAD_NUMERIC_PRICE_ASSERTION = /(?:\b(?:current\s+price|today['’]s\s+price|price|cost|msrp)\s*(?::|=|is)?\s*[0-9０-９][0-9０-９,，.．\s]*\b|\bcosts\s+[0-9０-９][0-9０-９,，.．\s]*\b|\bpriced\s+at\s+[0-9０-９][0-9０-９,，.．\s]*\b)/iu;
const BROAD_PROMOTION_SIGNAL = /(?:\b(?:(?:[0-9]+(?:\.[0-9]+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s*(?:%|per\s*cent|percent)\s*off|half[ -]?price|discount(?:ed|s)?(?:\s+now)?|limited[ -]?time\s+deal|flash\s+deal|promo(?:tional)?\s+price|special\s+price|clearance(?:\s+price)?|price\s+reduced|reduced\s+to\s+[0-9]+|buy\s+one\s+get\s+one\s+free|free\s+gift\s+with\s+purchase|save\s+(?:[0-9]+(?:\.[0-9]+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+(?:percent|per\s+cent)|coupon\s+code|deal\s+of\s+the\s+day)\b|(?:セール中?|[0-9]+(?:\.[0-9]+)?\s*(?:%\s*(?:off|オフ|引き)|パーセント\s*オフ)|[0-9]+\s*割\s*off|半額|割引中?|特価|値下げ(?:しました|中)?|クーポン(?:あり|コード)?|お買い得|2点目無料|1個買うと1個無料|まとめ買い割引|ポイント\s*[0-9]+倍)|(?:(?:打)?[0-9一二三四五六七八九]\s*折|优惠中?|優惠中?|限时折扣|限時折扣|特价|特價|促销价|促銷價|降价了?|降價了?|立减\s*[0-9]+|滿?满?\s*[0-9]+\s*减\s*[0-9]+|买一送一|買一送一|第二件半价|第二件半價|满减优惠|滿減優惠)|(?:(?:[0-9]+(?:\.[0-9]+)?\s*(?:%|퍼센트|프로)|[0-9]+\s*할)\s*할인|반값|세일\s*중?|특가|할인가|최저가|할인\s*쿠폰|1\s*\+\s*1\s*행사|사은품\s*증정|두\s*번째\s*반값|쿠폰\s*코드))/iu;
const BROAD_AVAILABILITY_FULFILMENT_SIGNAL = /(?:\b(?:ready\s+(?:for\s+(?:purchase|collection)|to\s+order)|can\s+be\s+ordered|orderable(?:\s+now)?|orders?\s+accepted|accepting\s+orders|preorders?\s+open|only\s+(?:[0-9]+|zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:items?\s+)?left|(?:[0-9]+|zero|one|two|three|four|five|six|seven|eight|nine|ten|few)\s+(?:items?\s+)?remain(?:ing)?|last\s+(?:one|(?:[0-9]+|one|two|three|four|five|six|seven|eight|nine|ten|few)\s+(?:items?|units?))|almost\s+gone|running\s+low|quantity\s+remaining\s*:?\s*[0-9]*|limited\s+quantity|pick\s+(?:it|this|that|them)?\s*up|pickup|collect\s+today|next[ -]?day\s+arrival|retailers?)\b|(?:お求めいただけます|取寄(?:可|可能)?|残数\s*[0-9０-９]+|あと\s*[0-9０-９]+\s*(?:個|点|台|本)|品薄|売切れ?|入荷予定|廃番|終売|補充待ち|(?:当日|本日|店舗|店頭)受取(?:可|可能)?|翌日着|即納(?:できます)?|納期\s*[0-9０-９]+\s*日|無貨|无货|售完|賣光(?:了)?|卖光(?:了)?|次日達|次日达|(?:只剩|仅剩|僅剩|仅余|僅餘|余)\s*[0-9０-９〇零一二三四五六七八九十百千万]+\s*件|断货|斷貨|预售中|預售中|可预订|可預訂|当日达|當日達|门店自提|門店自提|可自提)|(?:[0-9０-９]+\s*개\s*(?:남았습니다|남았어요|남아\s*있습니다)|마지막\s*[0-9０-９]+\s*개|소량\s*남음|수량\s*한정|입고\s*(?:예정|대기)|매진|택배비(?:\s*무료)?|입점|당일\s*수령|매장\s*픽업|내일\s*받기))/iu;
const BROAD_PURCHASE_SOURCE_LABEL = /(?:\b(?:where\s+to\s+buy|(?:purchase|buy)\s+(?:source|link)|(?:official\s+)?(?:seller|retailer|store|shop|stockist))\s*[:：]|\b(?:stockist|official\s+(?:seller|retailer|store|shop))\b|公式(?:店舗|ストア|ショップ)\s*[:：]|官方(?:店铺|店舖|商店)\s*[:：]|공식\s*(?:매장|스토어|샵)\s*[:：])/iu;
const MARKETPLACE_NAME = String.raw`(?:amazon|rakuten|楽天(?:市場)?|yahoo!?\s*(?:shopping|ショッピング)?|walmart|target|etsy|ebay|qoo10|shein|zozotown|buyma|snkrdunk|ショップ|ストア|店舗|モール|販売店)`;
const MARKETPLACE_COMMERCE_VERB = String.raw`(?:list(?:ed|s|ing)?|offer(?:ed|s|ing)?|stock(?:ed|s|ing)?|sell(?:s|ing)?|sold|carr(?:y|ies|ied)|available|buy|purchase|order|get\s+(?:it|this|that|yours)|提供(?:されています|されている|中)?|掲載(?:されています|されている|中)?|手に入(?:ります|る)|取(?:り)?寄せ(?:可能|できます|できる)?|出品(?:されています|されている|中)?|取(?:り)?扱(?:っています|っている|い中)?|扱(?:っています|っている)|お?求め(?:いただけます|になれます)?|販売|購入|注文|買|売|商品(?:が|は)?\s*(?:あります|ある)|あります|ある)`;
const MARKETPLACE_COMMERCE_ASSERTION = new RegExp(
  `(?:${MARKETPLACE_NAME}.{0,60}${MARKETPLACE_COMMERCE_VERB}|${MARKETPLACE_COMMERCE_VERB}.{0,60}${MARKETPLACE_NAME})`,
  'iu'
);
// Marketplace names are unnecessary in an AI hypothesis: the verified
// destination pipeline adds them later. Treat any named-marketplace mention
// as unsafe unless the complete field is a narrowly recognized product/brand
// name (for example Amazon Echo). This closes synonym churn such as
// obtain/retail/supply/fulfil without attempting to enumerate every verb.
const NAMED_MARKETPLACE_MENTION = /(?:\b(?:amazon|rakuten|walmart|target|etsy|ebay|qoo10|shein|zozotown|buyma|snkrdunk)\b|楽天(?:市場)?|yahoo!?\s*(?:shopping|ショッピング)?|亚马逊|亞馬遜|아마존|라쿠텐|쿠팡)/iu;
const SAFE_MARKETPLACE_PRODUCT_REFERENCE = /^(?!.*(?:\b(?:at|from|via|pickup|retailers?|stores?|shops?|sellers?)\b|best\s+buy|bic\s+camera|yodobashi|costco))(?:amazon(?:\s+(?:echo|kindle|fire|basics|ring|eero)(?:[\s\p{L}\p{N}._+()\-]{0,80})?)?|rakuten\s+kobo(?:[\s\p{L}\p{N}._+()\-]{0,60})?|楽天\s*kobo(?:[\s\p{L}\p{N}._+()\-]{0,60})?)$/iu;

function patternMatches(pattern, value) {
  pattern.lastIndex = 0;
  const matched = pattern.test(value);
  pattern.lastIndex = 0;
  return matched;
}

export function containsUnverifiedCommerceClaim(value) {
  const text = String(value || '').normalize('NFKC');
  if ([UNVERIFIED_CLAIM_PHRASE, PRICE, PURCHASE_LOCATION_CLAIM, COMMERCIAL_CLAIM,
    BROAD_COMMERCE_SIGNAL, BROAD_PRICE_SIGNAL, BROAD_CURRENCY_ALIAS_SIGNAL,
    BROAD_NUMERIC_PRICE_ASSERTION, BROAD_PROMOTION_SIGNAL,
    BROAD_AVAILABILITY_FULFILMENT_SIGNAL, BROAD_PURCHASE_SOURCE_LABEL,
    MARKETPLACE_COMMERCE_ASSERTION]
    .some((pattern) => patternMatches(pattern, text))) return true;
  return patternMatches(NAMED_MARKETPLACE_MENTION, text)
    && !patternMatches(SAFE_MARKETPLACE_PRODUCT_REFERENCE, text.trim());
}

export function containsUnsafeAiOutputContent(value) {
  const text = String(value || '').normalize('NFKC');
  return patternMatches(URL_LIKE, text) || containsUnverifiedCommerceClaim(text);
}

function discardUnsafeCommerceClauses(value) {
  const text = String(value || '');
  if (!containsUnverifiedCommerceClaim(text)) return text;
  return text.split(/[。！？!?;；\n]+/u)
    .filter((clause) => clause.trim() && !containsUnverifiedCommerceClaim(clause))
    .join(' ');
}

export function sanitizeAiOutputText(value, max = 200) {
  const limit = Math.max(0, Math.min(2000, Number(max) || 0));
  const cleaned = discardUnsafeCommerceClauses(String(value || '').normalize('NFKC'))
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(URL_LIKE, ' ')
    .replace(UNVERIFIED_CLAIM_PHRASE, ' ')
    .replace(PRICE, ' ')
    .replace(PURCHASE_LOCATION_CLAIM, ' ')
    .replace(COMMERCIAL_CLAIM, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/^[\s,，.。;；:：|｜/／·・\-–—]+|[\s,，.。;；:：|｜/／·・\-–—]+$/gu, '')
    .trim()
    .slice(0, limit);
  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : '';
}

export function sanitizeAiOutputList(value, maxItems = 8, maxLength = 100) {
  const output = [];
  const seen = new Set();
  for (const item of Array.isArray(value) ? value : []) {
    const cleaned = sanitizeAiOutputText(item, maxLength);
    const key = cleaned.toLocaleLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    output.push(cleaned);
    if (output.length >= maxItems) break;
  }
  return output;
}

export const aiOutputSafetyTest = {
  URL_LIKE,
  UNVERIFIED_CLAIM_PHRASE,
  PRICE,
  PURCHASE_LOCATION_CLAIM,
  COMMERCIAL_CLAIM
};
