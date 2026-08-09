import { creatorsApiConfigured, searchAmazonCreators } from './amazon-creators-api.mjs';
import { rakutenApiConfigured, searchRakutenMarketplace } from './rakuten-marketplace-api.mjs';
import { yahooShoppingApiConfigured, searchYahooShopping } from './yahoo-shopping-api.mjs';
import { nextDeliveryAt } from './mywatch-policy.mjs';

// 購入希望価格は既存member_wishes.condition_snapshot.price_conditionへ保存し、
// 定期確認/到達済み状態は既存search_watch_matchesへ内部マーカーとして持つ。
// 本番D1へ先行マイグレーションを要求せず、既存の保存・削除・重複防止境界を
// そのまま再利用する。比較対象は3モール公式APIが返した価格だけで、AI最安
// 比較の推定値や直接検索リンク上の未確認価格は一切入力されない。
const BATCH_LIMIT=20;
const CHECK_INTERVAL_HOURS=3;
const CHECK_MARKER='TARGET_PRICE_CHECK';
const REACHED_MARKER='TARGET_PRICE_REACHED';

function clean(value){return String(value||'').normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').trim().toLowerCase();}
function tokens(value){return clean(value).split(/\s+/).filter(token=>token.length>=2).slice(0,12);}
function sameProduct(wish,candidate){
  const key=clean(wish.target_product_key);const candidateKeys=[candidate.record_key,candidate.asin].map(clean);
  if(key&&candidateKeys.includes(key))return true;
  const expected=tokens(wish.target_product_name||wish.query_text);const actual=clean(candidate.display_name||candidate.product_name);
  if(!expected.length||!actual)return false;
  const matched=expected.filter(token=>actual.includes(token));
  return matched.length>=Math.min(2,expected.length)||matched.some(token=>/^[a-z][a-z0-9-]{3,}$/i.test(token));
}
function pricedOffers(wish,candidates){
  const rows=[];
  for(const candidate of candidates){
    if(!sameProduct(wish,candidate))continue;
    for(const offer of Array.isArray(candidate.offers)?candidate.offers:[]){
      const price=Math.round(Number(offer.total_cost||offer.price)||0);
      if(price<=0||String(offer.stock_status||'').toUpperCase()==='OUT_OF_STOCK')continue;
      rows.push({price,marketplace:String(offer.marketplace||''),url:String(offer.product_url||offer.tracking_url||''),image:String(candidate.image_url||candidate.image||''),name:String(candidate.display_name||candidate.product_name||wish.target_product_name||wish.query_text)});
    }
  }
  return rows.sort((left,right)=>left.price-right.price);
}
function notificationText(wish,best,target){
  const values={JA:{title:'購入したい価格になりました',body:`${best.name}：API確認価格 ¥${best.price.toLocaleString('ja-JP')}（希望価格 ¥${target.toLocaleString('ja-JP')}以下）`},EN:{title:'Your target price has been reached',body:`${best.name}: API-confirmed price JPY ${best.price.toLocaleString('en-US')} (at or below your target of JPY ${target.toLocaleString('en-US')})`},ZH:{title:'商品已达到您的目标价格',body:`${best.name}：API确认价格 ¥${best.price.toLocaleString('zh-CN')}（不高于目标价 ¥${target.toLocaleString('zh-CN')}）`},KO:{title:'원하는 구매 가격에 도달했습니다',body:`${best.name}: API 확인 가격 ¥${best.price.toLocaleString('ko-KR')} (희망 가격 ¥${target.toLocaleString('ko-KR')} 이하)`}};
  return values[String(wish.language||'JA').toUpperCase()]||values.JA;
}
async function searchConnectedMarketplaces(env,query,fetcher){
  const calls=[];
  if(creatorsApiConfigured(env))calls.push(searchAmazonCreators(env,query,fetcher));
  if(rakutenApiConfigured(env))calls.push(searchRakutenMarketplace(env,query,fetcher));
  if(yahooShoppingApiConfigured(env))calls.push(searchYahooShopping(env,query,fetcher));
  const outcomes=await Promise.allSettled(calls);
  return outcomes.flatMap(outcome=>outcome.status==='fulfilled'&&Array.isArray(outcome.value)?outcome.value:[]);
}
async function persistObservation(env,wish,best,now){
  const target=Number(wish.target_price_jpy)||0;
  const reached=best&&best.price<=target;
  const alreadyNotified=Number(wish.target_price_notified)===1;
  const checkStatement=env.PRODUCT_DB.prepare(`INSERT INTO search_watch_matches
    (member_id,wish_id,product_identity_key,asin,marketplace,matched_at,notification_id)
    VALUES(?1,?2,?3,'','',?4,NULL)
    ON CONFLICT(wish_id,product_identity_key) DO UPDATE SET matched_at=excluded.matched_at`)
    .bind(wish.member_id,wish.wish_id,CHECK_MARKER,now);
  if(!reached||alreadyNotified){
    const statements=[checkStatement];
    if(best&&best.price>target)statements.push(env.PRODUCT_DB.prepare('DELETE FROM search_watch_matches WHERE wish_id=?1 AND product_identity_key=?2').bind(wish.wish_id,REACHED_MARKER));
    await env.PRODUCT_DB.batch(statements);
    return false;
  }
  const nextAt=nextDeliveryAt(wish.watch_frequency,now);const delivered=Date.parse(nextAt)<=Date.parse(now);
  const status=delivered?'DELIVERED':'PENDING';const {title,body}=notificationText(wish,best,target);
  const notificationId=crypto.randomUUID();const eventKey=`TARGET:${wish.wish_id}:${crypto.randomUUID()}`;
  let connectedChannels=[];try{const result=await env.PRODUCT_DB.prepare(`SELECT channel FROM member_notification_destinations WHERE member_id=?1 AND channel IN ('LINE','EMAIL')`).bind(wish.member_id).all();connectedChannels=(result?.results||[]).map(row=>String(row.channel||'')).filter(channel=>channel==='LINE'||channel==='EMAIL');}catch{}
  const notificationStatements=[{channel:'WEB',id:notificationId,status,attempts:delivered?1:0,deliveredAt:delivered?now:null},...connectedChannels.map(channel=>({channel,id:crypto.randomUUID(),status:'PENDING',attempts:0,deliveredAt:null}))].map(item=>env.PRODUCT_DB.prepare(`INSERT INTO mywatch_notifications
    (notification_id,member_id,wish_id,event_key,event_type,channel,title,body,status,attempts,next_attempt_at,delivered_at,created_at,updated_at,asin,marketplace,image_url)
    VALUES(?1,?2,?3,?4,'PRICE_DROP',?5,?6,?7,?8,?9,?10,?11,?12,?12,'',?13,?14)`)
    .bind(item.id,wish.member_id,wish.wish_id,eventKey,item.channel,title,body,item.status,item.attempts,nextAt,item.deliveredAt,now,best.marketplace,/^https:\/\//i.test(best.image)?best.image:''));
  await env.PRODUCT_DB.batch([
    ...notificationStatements,
    checkStatement,
    env.PRODUCT_DB.prepare(`INSERT INTO search_watch_matches
      (member_id,wish_id,product_identity_key,asin,marketplace,matched_at,notification_id)
      VALUES(?1,?2,?3,'',?4,?5,?6)
      ON CONFLICT(wish_id,product_identity_key) DO UPDATE SET matched_at=excluded.matched_at,notification_id=excluded.notification_id,marketplace=excluded.marketplace`)
      .bind(wish.member_id,wish.wish_id,REACHED_MARKER,best.marketplace,now,notificationId)
  ]);
  return true;
}

export async function scanTargetPriceWish(env,wish,now=new Date().toISOString(),fetcher=fetch){
  if(!wish||Number(wish.watch_price)!==1||Number(wish.target_price_jpy)<100)return{scanned:false,notified:false};
  const query=String(wish.target_product_name||wish.query_text||'').trim();
  const candidates=await searchConnectedMarketplaces(env,query,fetcher);
  const best=pricedOffers(wish,candidates)[0]||null;
  const notified=await persistObservation(env,wish,best,now);
  return{scanned:true,notified,best_price_jpy:best?.price||null};
}

export async function runTargetPriceScan(env,now=new Date().toISOString(),fetcher=fetch){
  if(!env.PRODUCT_DB)return{scanned:0,notifications_sent:0};
  const rows=await env.PRODUCT_DB.prepare(`SELECT member_id,wish_id,query_text,language,watch_price,watch_frequency,
    CAST(json_extract(condition_snapshot,'$.price_condition.target_price_jpy') AS INTEGER) AS target_price_jpy,
    COALESCE(json_extract(condition_snapshot,'$.price_condition.target_product_key'),'') AS target_product_key,
    COALESCE(json_extract(condition_snapshot,'$.price_condition.target_product_name'),'') AS target_product_name,
    EXISTS(SELECT 1 FROM search_watch_matches reached WHERE reached.wish_id=member_wishes.wish_id AND reached.product_identity_key='TARGET_PRICE_REACHED') AS target_price_notified
    FROM member_wishes WHERE watch_price=1
      AND CAST(json_extract(condition_snapshot,'$.price_condition.target_price_jpy') AS INTEGER)>=100
      AND NOT EXISTS(SELECT 1 FROM search_watch_matches checked WHERE checked.wish_id=member_wishes.wish_id
        AND checked.product_identity_key='TARGET_PRICE_CHECK' AND datetime(checked.matched_at)>datetime(?1,?2))
    ORDER BY updated_at ASC LIMIT ?3`).bind(now,`-${CHECK_INTERVAL_HOURS} hours`,BATCH_LIMIT).all();
  let scanned=0,notifications=0;
  for(const wish of rows?.results||[]){try{const result=await scanTargetPriceWish(env,wish,now,fetcher);if(result.scanned)scanned+=1;if(result.notified)notifications+=1;}catch(error){console.warn('TARGET_PRICE_SCAN_FAILED',{wish_id:String(wish.wish_id||''),error:String(error?.message||error).slice(0,160)});}}
  return{scanned,notifications_sent:notifications};
}
