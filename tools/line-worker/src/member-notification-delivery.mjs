import { buildMemberRegistrationEvent } from './member-registration-telemetry.mjs';
const encoder=new TextEncoder(),decoder=new TextDecoder();
function b64(bytes){let value='';for(const byte of bytes)value+=String.fromCharCode(byte);return btoa(value).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');}
function unb64(value){const text=String(value||'').replace(/-/g,'+').replace(/_/g,'/');const raw=atob(text+'='.repeat((4-text.length%4)%4));return Uint8Array.from(raw,char=>char.charCodeAt(0));}
async function key(env){const secret=String(env.MEMBER_SESSION_SECRET||env.LINK_SIGNING_SECRET||'');if(secret.length<32)throw new Error('MEMBER_NOTIFICATION_SECRET_REQUIRED');const digest=await crypto.subtle.digest('SHA-256',encoder.encode(`hoshilu-notification:${secret}`));return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function encrypt(value,env){const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(env),encoder.encode(String(value)));return`${b64(iv)}.${b64(new Uint8Array(data))}`;}
async function decrypt(value,env){const[iv,data]=String(value||'').split('.');if(!iv||!data)throw new Error('DESTINATION_INVALID');return decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv)},await key(env),unb64(data)));}
export async function storeMemberNotificationDestination(env,memberId,channel,destination){if(!env.PRODUCT_DB||!['LINE','EMAIL'].includes(channel)||!memberId||!destination)return;const now=new Date().toISOString();await env.PRODUCT_DB.prepare(`INSERT INTO member_notification_destinations(member_id,channel,encrypted_destination,verified_at,updated_at) VALUES(?1,?2,?3,?4,?4) ON CONFLICT(member_id,channel) DO UPDATE SET encrypted_destination=excluded.encrypted_destination,verified_at=excluded.verified_at,updated_at=excluded.updated_at`).bind(memberId,channel,await encrypt(destination,env),now).run();}
const IDENTITY_ALIAS_CHANNEL='IDENTITY_ALIAS';
const MEMBER_ID=/^[A-Za-z0-9_-]{20,100}$/u;
export async function linkMemberNotificationIdentity(env,aliasMemberId,canonicalMemberId,channel,destination){
  const alias=String(aliasMemberId||''),canonical=String(canonicalMemberId||'');
  if(!env.PRODUCT_DB||typeof env.PRODUCT_DB.batch!=='function'||!['LINE','EMAIL'].includes(channel)||!destination)throw new Error('IDENTITY_LINK_UNAVAILABLE');
  if(!MEMBER_ID.test(alias)||!MEMBER_ID.test(canonical))throw new Error('IDENTITY_LINK_INVALID');
  if(alias===canonical){await storeMemberNotificationDestination(env,canonical,channel,destination);return canonical;}
  const now=new Date().toISOString();
  const marker=`member:${canonical}`;
  const aliasStatement=env.PRODUCT_DB.prepare(`INSERT OR IGNORE INTO member_notification_destinations
    (member_id,channel,encrypted_destination,verified_at,updated_at)
    SELECT ?1,?2,?3,?4,?4
    WHERE NOT EXISTS (
      SELECT 1 FROM member_notification_destinations
      WHERE member_id=?1 AND channel IN ('LINE','EMAIL') AND verified_at<>''
    ) AND EXISTS (
      SELECT 1 FROM member_notification_destinations
      WHERE member_id=?5 AND channel IN ('LINE','EMAIL') AND verified_at<>''
    ) AND NOT EXISTS (
      SELECT 1 FROM member_notification_destinations
      WHERE member_id=?5 AND channel=?2 AND verified_at<>''
    )`).bind(alias,IDENTITY_ALIAS_CHANNEL,marker,now,canonical);
  const destinationStatement=env.PRODUCT_DB.prepare(`INSERT INTO member_notification_destinations
    (member_id,channel,encrypted_destination,verified_at,updated_at)
    SELECT ?1,?2,?3,?4,?4
    WHERE EXISTS (
      SELECT 1 FROM member_notification_destinations
      WHERE member_id=?5 AND channel=?6 AND encrypted_destination=?7 AND verified_at<>''
    ) AND NOT EXISTS (
      SELECT 1 FROM member_notification_destinations
      WHERE member_id=?5 AND channel IN ('LINE','EMAIL') AND verified_at<>''
    ) AND EXISTS (
      SELECT 1 FROM member_notification_destinations
      WHERE member_id=?1 AND channel IN ('LINE','EMAIL') AND verified_at<>''
    ) AND NOT EXISTS (
      SELECT 1 FROM member_notification_destinations
      WHERE member_id=?1 AND channel=?6 AND verified_at<>''
    )
    ON CONFLICT(member_id,channel) DO UPDATE SET encrypted_destination=excluded.encrypted_destination,verified_at=excluded.verified_at,updated_at=excluded.updated_at`)
    .bind(canonical,channel,await encrypt(destination,env),now,alias,IDENTITY_ALIAS_CHANNEL,marker);
  const results=await env.PRODUCT_DB.batch([aliasStatement,destinationStatement]);
  if(Number(results?.[1]?.meta?.changes||0)!==1)throw new Error('IDENTITY_ALIAS_CONFLICT');
  return canonical;
}
export async function resolveMemberIdentityAlias(env,memberId){
  const fallback=String(memberId||'');
  if(!env.PRODUCT_DB||!MEMBER_ID.test(fallback))return fallback;
  let row;
  try{row=await env.PRODUCT_DB.prepare(`SELECT encrypted_destination FROM member_notification_destinations
    WHERE member_id=?1 AND channel=?2 AND verified_at<>''`).bind(fallback,IDENTITY_ALIAS_CHANNEL).first();}
  catch(error){
    const message=String(error?.message||'');
    if(/no such table.*member_notification_destinations|no such column.*(?:encrypted_destination|verified_at|channel)/iu.test(message))return fallback;
    throw new Error('IDENTITY_ALIAS_UNAVAILABLE');
  }
  if(!row?.encrypted_destination)return fallback;
  const value=String(row.encrypted_destination||'');
  const canonical=value.startsWith('member:')?value.slice(7):'';
  if(!MEMBER_ID.test(canonical)||canonical===fallback)throw new Error('IDENTITY_ALIAS_INVALID');
  let target;
  try{target=await env.PRODUCT_DB.prepare(`SELECT
    MAX(CASE WHEN channel='IDENTITY_ALIAS' AND verified_at<>'' THEN 1 ELSE 0 END) AS is_alias,
    MAX(CASE WHEN channel IN ('LINE','EMAIL') AND verified_at<>'' THEN 1 ELSE 0 END) AS has_identity
    FROM member_notification_destinations WHERE member_id=?1`).bind(canonical).first();}
  catch{throw new Error('IDENTITY_ALIAS_UNAVAILABLE');}
  if(Number(target?.is_alias||0)!==0)throw new Error('IDENTITY_ALIAS_CHAIN');
  if(Number(target?.has_identity||0)!==1)throw new Error('IDENTITY_ALIAS_INVALID');
  return canonical;
}
export async function storeMemberRegistrationDestination(env,memberId,channel,destination,registrationContext={}){
  if(!env.PRODUCT_DB||!['LINE','EMAIL'].includes(channel)||!memberId||!destination)throw new Error('MEMBER_REGISTRATION_DESTINATION_INVALID');
  const now=new Date(),at=now.toISOString(),event=await buildMemberRegistrationEvent(env,memberId,registrationContext,now);
  const encryptedDestination=await encrypt(destination,env);
  const destinationStatement=()=>env.PRODUCT_DB.prepare(`INSERT INTO member_notification_destinations(member_id,channel,encrypted_destination,verified_at,updated_at)
    SELECT ?1,?2,?3,?4,?4
    WHERE NOT EXISTS (
      SELECT 1 FROM member_notification_destinations
      WHERE member_id=?1 AND channel='IDENTITY_ALIAS' AND verified_at<>''
    )
    ON CONFLICT(member_id,channel) DO UPDATE SET encrypted_destination=excluded.encrypted_destination,verified_at=excluded.verified_at,updated_at=excluded.updated_at`).bind(memberId,channel,encryptedDestination,at);
  const ensureDestinationStored=result=>{if(Number(result?.meta?.changes||0)!==1)throw new Error('MEMBER_IDENTITY_ALIAS_CHANGED');};
  const identityRegistrationStatement=()=>env.PRODUCT_DB.prepare(`INSERT OR IGNORE INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class,visitor_id,session_id)
    SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12
    WHERE NOT EXISTS (SELECT 1 FROM member_notification_destinations WHERE member_id=?13 AND verified_at<>'')`).bind(
    event.event_id,event.event_type,event.locale,event.source,event.medium,event.campaign,event.content,
    event.marketplace,event.occurred_at,event.traffic_class,event.visitor_id,event.session_id,memberId
  );
  // D1 batch order is intentional: the event checks for a pre-existing verified
  // destination before the upsert, and both writes commit or roll back together.
  // The deterministic event PK also makes concurrent first registrations safe.
  let results;
  try{
    results=await env.PRODUCT_DB.batch([identityRegistrationStatement(),destinationStatement()]);
  }catch(error){
    const message=String(error?.message||error);
    if(/(?:no column named|has no column named|no such column).*(?:visitor_id|session_id)/iu.test(message)){
      // Production migrations are intentionally independent from Worker deploys.
      // If identity columns are still pending, preserve registration availability
      // and the exact-once aggregate without pretending attribution was recorded.
      const legacyRegistration=env.PRODUCT_DB.prepare(`INSERT OR IGNORE INTO growth_events
        (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class)
        SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10
        WHERE NOT EXISTS (SELECT 1 FROM member_notification_destinations WHERE member_id=?11 AND verified_at<>'')`).bind(
        event.event_id,event.event_type,event.locale,event.source,event.medium,event.campaign,event.content,
        event.marketplace,event.occurred_at,event.traffic_class,memberId
      );
      try{results=await env.PRODUCT_DB.batch([legacyRegistration,destinationStatement()]);}
      catch{const destinationResult=await destinationStatement().run();ensureDestinationStored(destinationResult);return{registered:false,telemetry_recorded:false};}
    }else{
      // Growth telemetry is advisory and must never make an otherwise valid
      // LINE/email authentication fail. The destination write remains required.
      const destinationResult=await destinationStatement().run();ensureDestinationStored(destinationResult);
      return{registered:false,telemetry_recorded:false};
    }
  }
  ensureDestinationStored(results?.[1]);
  return{registered:Number(results?.[0]?.meta?.changes||0)===1,telemetry_recorded:true};
}
export function safeMemberNotificationCopy(title,body){
  const broken=value=>(String(value||'').match(/�/g)||[]).length>=2;
  const safeTitle=broken(title)?'HOSHILUからのお知らせ':String(title||'HOSHILU');
  if(!broken(body))return{title:safeTitle,body:String(body||'')};
  const officialUrl=String(body||'').match(/https:\/\/[^\s]+/)?.[0]||'';
  return{title:safeTitle,body:`公式ページで最新情報をご確認ください。${officialUrl?`\n\n公式ページを開く\n${officialUrl}`:''}`};
}
async function sendLine(to,title,body,env){if(!String(env.LINE_CHANNEL_ACCESS_TOKEN||''))throw new Error('LINE_NOT_CONFIGURED');const response=await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{authorization:`Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,'content-type':'application/json'},body:JSON.stringify({to,messages:[{type:'text',text:`${title}\n${body}`.slice(0,5000)}]}),redirect:'manual'});if(!response.ok)throw new Error('LINE_DELIVERY_FAILED');}
async function sendEmail(to,title,body,env){if(!String(env.RESEND_API_KEY||'').startsWith('re_')||!String(env.MEMBER_EMAIL_FROM||''))throw new Error('EMAIL_NOT_CONFIGURED');const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:`HOSHILU <${env.MEMBER_EMAIL_FROM}>`,to:[to],subject:title,text:`${body}\n\nHOSHILU: https://hoshilu.app/`}),redirect:'manual'});if(!response.ok)throw new Error('EMAIL_DELIVERY_FAILED');}
export async function deliverDueMemberNotifications(env,now=new Date()){if(!env.PRODUCT_DB)return{delivered:0,failed:0};const at=new Date(now).toISOString();const due=await env.PRODUCT_DB.prepare(`SELECT n.notification_id,n.member_id,n.channel,n.title,n.body,d.encrypted_destination FROM mywatch_notifications n LEFT JOIN member_notification_destinations d ON d.member_id=n.member_id AND d.channel=n.channel WHERE n.channel IN ('LINE','EMAIL') AND n.status='PENDING' AND n.next_attempt_at<=?1 ORDER BY n.next_attempt_at ASC LIMIT 100`).bind(at).all();let delivered=0,failed=0;for(const row of due?.results||[]){let result='SUCCESS',errorCode='';try{if(!row.encrypted_destination)throw new Error('DESTINATION_NOT_CONNECTED');const destination=await decrypt(row.encrypted_destination,env);const copy=safeMemberNotificationCopy(row.title,row.body);if(row.channel==='LINE')await sendLine(destination,copy.title,copy.body,env);else await sendEmail(destination,copy.title,copy.body,env);await env.PRODUCT_DB.prepare(`UPDATE mywatch_notifications SET status='DELIVERED',attempts=attempts+1,delivered_at=?2,updated_at=?2,last_error_code='' WHERE notification_id=?1 AND status='PENDING'`).bind(row.notification_id,at).run();delivered+=1;}catch(error){result='FAILED';errorCode=String(error?.message||'DELIVERY_FAILED').slice(0,60);await env.PRODUCT_DB.prepare(`UPDATE mywatch_notifications SET attempts=attempts+1,last_error_code=?2,next_attempt_at=?3,updated_at=?4 WHERE notification_id=?1 AND status='PENDING'`).bind(row.notification_id,errorCode,new Date(new Date(now).getTime()+3600000).toISOString(),at).run();failed+=1;}await env.PRODUCT_DB.prepare(`INSERT INTO mywatch_delivery_audit(audit_id,notification_id,action,channel,result,error_code,occurred_at) VALUES(?1,?2,'DELIVER',?3,?4,?5,?6)`).bind(crypto.randomUUID(),row.notification_id,row.channel,result,errorCode,at).run();}return{delivered,failed};}
