import { creatorsApiConfigured, searchAmazonCreators } from './amazon-creators-api.mjs';
import { rakutenApiConfigured, searchRakutenMarketplace } from './rakuten-marketplace-api.mjs';
import { yahooShoppingApiConfigured, searchYahooShopping } from './yahoo-shopping-api.mjs';
import { nextDeliveryAt } from './mywatch-policy.mjs';
import { targetPriceProductKey } from './target-price-product-key.mjs';

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
// ---- 同一商品判定 --------------------------------------------------------------
// 2026-09-07 修正: これまでは「タイトルの先頭12語のうち2語が一致すれば同一商品」
// だった。実データで確かめたところ、保存されている商品名の先頭はキャンペーン文
// （「8/16 23:59まで まとめ買いクーポン3点以上で 10%OFF」）で埋まっていて、
// 型番やブランドは12語の外に落ちていた。その結果
//   希望: java ジャバ バッグ ... jv1159001（希望価格 2,500円）
//   候補: 全く別のブランド レディース トートバッグ 大容量 軽量
// が「バッグ・レディース・トートバッグ」の3語一致で同一商品と判定される。
// 別商品の値段で「希望価格になりました」と通知するのは、通知しないことより悪い。
//
// 直し方: 語を選ぶ前にキャンペーン文を捨て、型番とブランドを必ず見るようにする。
//   1. 型番（jv1159001 のような英字＋数字）があれば、それが候補名に無いと不一致
//   2. ブランド語（最初の英字語／カタカナ語）が候補名に無ければ不一致
//   3. 残りの内容語も半分以上が一致すること
// 迷ったら通知しない側に倒す。見送った理由は target_price_observations に残すので、
// 「厳しすぎて誰にも通知が届かない」状態は記録から気づける。
const NOISE_WORDS=new Set(['特価品','送料無料','あす楽','即納','正規品','新品','限定','数量限定','タイムセール','セール','クーポン','まとめ買い','ポイント','最大','新作','公式','楽天','yahoo','amazon','off','sale','new','set','日本製','対応','選べる','人気','おすすめ','箱','枚','個','本']);
function isNoiseToken(token){
  if(NOISE_WORDS.has(token))return true;
  if(/^\d+$/u.test(token))return true;                 // 「16」「23」など日付・数字だけ
  if(/(?:まで|以上|以下|off)$/u.test(token)&&/\d/u.test(token))return true; // 「59まで」「3点以上で」
  if(/クーポン|まとめ買い|ポイント|送料/u.test(token))return true;
  return false;
}
// 型番らしい語: 英字と3桁以上の数字が地続きになっているもの（jv1159001 / se215 など）。
export function modelCodeTokens(tokens=[]){
  return tokens.filter((token)=>/^[a-z][a-z0-9-]*\d{3,}[a-z0-9-]*$/iu.test(token));
}
// 一番効く語（ブランド）: 最初の英字語、無ければ最初のカタカナ語。
export function brandToken(tokens=[]){
  return tokens.find((token)=>/^[a-z][a-z0-9-]{2,}$/iu.test(token))
    ||tokens.find((token)=>/^[ァ-ヴー]{3,}$/u.test(token))||'';
}
// 商品名から、判定に使う語だけを取り出す（キャンペーン文は捨てる。先頭12語で切らない）。
export function identityTokens(title){
  const seen=new Set();const out=[];
  for(const token of clean(title).split(/\s+/u)){
    if(token.length<2||isNoiseToken(token)||seen.has(token))continue;
    seen.add(token);out.push(token);
    if(out.length>=16)break;
  }
  return out;
}
export const IDENTITY_MIN_TOKENS=3;
export const IDENTITY_MIN_RATIO=0.5;
export const IDENTITY_STRICT_RATIO=0.7;
export function sameProduct(wish,candidate){
  const key=String(wish.target_product_key||'').trim();
  // A saved identifier must not fall through to title similarity on mismatch.
  // Punctuation is significant (item-1 and item_1 are different listings).
  if(key)return key===targetPriceProductKey(candidate);
  const title=wish.target_product_name||wish.query_text;
  const expected=identityTokens(title);
  const actual=clean(candidate.display_name||candidate.product_name);
  if(expected.length<IDENTITY_MIN_TOKENS||!actual)return false;
  // 1. 型番は商品名のどこにあっても拾う（キャンペーン文が長く、型番は末尾に置かれる）。
  //    型番が一致すればそれだけで同一商品と見なせる。逆に、型番があるのに候補名に
  //    無いときは、ブランドと内容語で厳しめに見る（下の 2・3）。
  const models=modelCodeTokens(clean(title).split(/\s+/u));
  if(models.some((token)=>actual.includes(token)))return true;
  // 2. ブランド語が入っていない商品も別物として扱う。
  const brand=brandToken(expected);
  if(brand&&!actual.includes(brand))return false;
  // 3. 残りの内容語も半分以上が一致すること。
  const ratio=models.length?IDENTITY_STRICT_RATIO:IDENTITY_MIN_RATIO;
  const matched=expected.filter((token)=>actual.includes(token));
  return matched.length>=Math.max(IDENTITY_MIN_TOKENS,Math.ceil(expected.length*ratio));
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
  // 逆ウォッチ（買った後の値下がり）: 「希望価格以下」ではなく「買った価格より安い」と伝える。
  if(String(wish.watch_kind||'')==='POST_PURCHASE'){
    const paid=Number(wish.purchase_price_jpy)||target+1;
    const values={JA:{title:'買った後に値下がりしました',body:`${best.name}：API確認価格 ¥${best.price.toLocaleString('ja-JP')}（買った価格 ¥${paid.toLocaleString('ja-JP')}より安い）。返金・価格保証の条件は購入先で確認してください。`},EN:{title:'Price dropped after your purchase',body:`${best.name}: API-confirmed price JPY ${best.price.toLocaleString('en-US')} (lower than the JPY ${paid.toLocaleString('en-US')} you paid). Check the seller for refund or price-guarantee terms.`},ZH:{title:'购买后降价了',body:`${best.name}：API确认价格 ¥${best.price.toLocaleString('zh-CN')}（低于您购买时的 ¥${paid.toLocaleString('zh-CN')}）。退款或价格保证条件请向购买店铺确认。`},KO:{title:'구매 후 가격이 내렸습니다',body:`${best.name}: API 확인 가격 ¥${best.price.toLocaleString('ko-KR')} (구매 가격 ¥${paid.toLocaleString('ko-KR')}보다 저렴). 환불·가격 보장 조건은 구매처에서 확인하세요.`}};
    return values[String(wish.language||'JA').toUpperCase()]||values.JA;
  }
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

// 2026-09-07: 巡回の結果を残す。これまでは「調べた」印だけで、いくらだったのか、
// そもそも同じ商品を見つけられたのかが分からず、直しようがなかった。
// 残すのは結果の数字だけ（会員IDも検索文も入れない）。書けなくても巡回は止めない。
export const OBSERVATION_RETENTION_DAYS=90;
export function observationReason({candidateCount,best,target}){
  if(!candidateCount)return 'NO_CANDIDATES';   // モールAPIが何も返さなかった
  if(!best)return 'NO_MATCH';                  // 返ってきたが同じ商品が無かった
  return best.price<=target?'REACHED':'ABOVE_TARGET';
}
async function recordObservation(env,wish,best,candidateCount,now){
  const target=Number(wish.target_price_jpy)||0;
  try{
    await env.PRODUCT_DB.prepare(`INSERT INTO target_price_observations
      (observation_id,wish_id,observed_at,matched,price_jpy,target_price_jpy,marketplace,candidate_count,reason)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)`)
      .bind(crypto.randomUUID(),String(wish.wish_id||''),now,best?1:0,best?best.price:null,
        target,best?String(best.marketplace||''):'',Number(candidateCount)||0,
        observationReason({candidateCount,best,target})).run();
  }catch{/* migration 0076 未適用でも巡回そのものは動かす */}
}
export async function purgeTargetPriceObservations(env,now=new Date()){
  if(!env?.PRODUCT_DB)return{deleted:0};
  try{
    const cutoff=new Date(now);cutoff.setUTCDate(cutoff.getUTCDate()-OBSERVATION_RETENTION_DAYS);
    const result=await env.PRODUCT_DB.prepare('DELETE FROM target_price_observations WHERE observed_at<?1')
      .bind(cutoff.toISOString()).run();
    return{deleted:Number(result?.meta?.changes||0)};
  }catch{return{deleted:0};}
}

export async function scanTargetPriceWish(env,wish,now=new Date().toISOString(),fetcher=fetch){
  if(!wish||Number(wish.watch_price)!==1||Number(wish.target_price_jpy)<100)return{scanned:false,notified:false};
  const query=String(wish.target_product_name||wish.query_text||'').trim();
  const candidates=await searchConnectedMarketplaces(env,query,fetcher);
  const best=pricedOffers(wish,candidates)[0]||null;
  const notified=await persistObservation(env,wish,best,now);
  await recordObservation(env,wish,best,candidates.length,now);
  return{scanned:true,notified,best_price_jpy:best?.price||null};
}

export async function runTargetPriceScan(env,now=new Date().toISOString(),fetcher=fetch){
  if(!env.PRODUCT_DB)return{scanned:0,notifications_sent:0};
  const rows=await env.PRODUCT_DB.prepare(`SELECT member_id,wish_id,query_text,language,watch_price,watch_frequency,
    CAST(json_extract(condition_snapshot,'$.price_condition.target_price_jpy') AS INTEGER) AS target_price_jpy,
    COALESCE(json_extract(condition_snapshot,'$.price_condition.target_product_key'),'') AS target_product_key,
    COALESCE(json_extract(condition_snapshot,'$.price_condition.target_product_name'),'') AS target_product_name,
    COALESCE(json_extract(condition_snapshot,'$.price_condition.kind'),'') AS watch_kind,
    CAST(COALESCE(json_extract(condition_snapshot,'$.price_condition.purchase_price_jpy'),0) AS INTEGER) AS purchase_price_jpy,
    EXISTS(SELECT 1 FROM search_watch_matches reached WHERE reached.wish_id=member_wishes.wish_id AND reached.product_identity_key='TARGET_PRICE_REACHED') AS target_price_notified
    FROM member_wishes WHERE watch_price=1
      AND CAST(json_extract(condition_snapshot,'$.price_condition.target_price_jpy') AS INTEGER)>=100
      AND (json_extract(condition_snapshot,'$.price_condition.expires_at') IS NULL
        OR datetime(json_extract(condition_snapshot,'$.price_condition.expires_at'))>datetime(?1))
      AND NOT EXISTS(SELECT 1 FROM search_watch_matches checked WHERE checked.wish_id=member_wishes.wish_id
        AND checked.product_identity_key='TARGET_PRICE_CHECK' AND datetime(checked.matched_at)>datetime(?1,?2))
    ORDER BY updated_at ASC LIMIT ?3`).bind(now,`-${CHECK_INTERVAL_HOURS} hours`,BATCH_LIMIT).all();
  let scanned=0,notifications=0;
  for(const wish of rows?.results||[]){try{const result=await scanTargetPriceWish(env,wish,now,fetcher);if(result.scanned)scanned+=1;if(result.notified)notifications+=1;}catch(error){console.warn('TARGET_PRICE_SCAN_FAILED',{wish_id:String(wish.wish_id||''),error:String(error?.message||error).slice(0,160)});}}
  return{scanned,notifications_sent:notifications};
}
