import { storeMemberNotificationDestination, storeMemberRegistrationDestination } from './member-notification-delivery.mjs';
const encoder = new TextEncoder();
function b64(bytes) { let binary=''; for(const byte of bytes) binary+=String.fromCharCode(byte); return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,''); }
async function digest(value) { return b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))); }
function secret(env) { const value=String(env.MEMBER_SESSION_SECRET||env.LINK_SIGNING_SECRET||''); if(value.length<32) throw new Error('MEMBER_SESSION_SECRET_REQUIRED'); return value; }
function normalizeEmail(value) { const email=String(value||'').trim().toLowerCase(); return /^[^\s@]{1,64}@[^\s@.]{1,190}\.[^\s@]{2,24}$/.test(email)?email:''; }
export function emailLoginConfigured(env={}) { return Boolean(env.PRODUCT_DB&&String(env.RESEND_API_KEY||'').startsWith('re_')&&normalizeEmail(env.MEMBER_EMAIL_FROM)); }
async function sendCode(email,code,env) {
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:`HOSHILU <${env.MEMBER_EMAIL_FROM}>`,to:[email],subject:'HOSHILU ログインコード',text:`HOSHILUのログインコードは ${code} です。10分以内に入力してください。心当たりがない場合は、このメールを無視してください。`}),redirect:'manual'});
  if(!response.ok) throw new Error('EMAIL_SEND_FAILED');
}
export async function requestEmailCode(request,env,now=Math.floor(Date.now()/1000)) {
  if(!emailLoginConfigured(env)) return Response.json({ok:false,error:'EMAIL_LOGIN_NOT_CONFIGURED'},{status:503});
  const origin=request.headers.get('origin'); if(origin&&origin!==new URL(request.url).origin) return Response.json({ok:false,error:'ORIGIN_NOT_ALLOWED'},{status:403});
  const email=normalizeEmail((await request.json()).email); if(!email) return Response.json({ok:false,error:'EMAIL_INVALID'},{status:400});
  const emailHash=await digest(`email:${email}:${secret(env)}`);
  const recent=await env.PRODUCT_DB.prepare('SELECT created_at FROM member_email_challenges WHERE email_hash=?').bind(emailHash).first();
  if(recent&&now-Number(recent.created_at)<60) return Response.json({ok:false,error:'RETRY_LATER'},{status:429});
  const bytes=new Uint32Array(1); crypto.getRandomValues(bytes); const code=String(bytes[0]%1000000).padStart(6,'0');
  const codeHash=await digest(`code:${emailHash}:${code}:${secret(env)}`);
  await env.PRODUCT_DB.prepare(`INSERT INTO member_email_challenges(email_hash,code_hash,expires_at,attempts,created_at) VALUES(?,?,?,0,?)
    ON CONFLICT(email_hash) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0,created_at=excluded.created_at`).bind(emailHash,codeHash,now+600,now).run();
  try{await sendCode(email,code,env);}catch{await env.PRODUCT_DB.prepare('DELETE FROM member_email_challenges WHERE email_hash=?').bind(emailHash).run();return Response.json({ok:false,error:'EMAIL_SEND_FAILED'},{status:502});}
  return Response.json({ok:true,expires_in:600},{headers:{'cache-control':'no-store'}});
}
async function consumeEmailCode(request,env,now=Math.floor(Date.now()/1000)) {
  if(!emailLoginConfigured(env)) return Response.json({ok:false,error:'EMAIL_LOGIN_NOT_CONFIGURED'},{status:503});
  const origin=request.headers.get('origin'); if(origin&&origin!==new URL(request.url).origin) return Response.json({ok:false,error:'ORIGIN_NOT_ALLOWED'},{status:403});
  const input=await request.json(),email=normalizeEmail(input.email),code=String(input.code||'').trim();
  if(!email||!/^\d{6}$/.test(code)) return Response.json({ok:false,error:'CODE_INVALID'},{status:400});
  const emailHash=await digest(`email:${email}:${secret(env)}`);
  const row=await env.PRODUCT_DB.prepare('SELECT code_hash,expires_at,attempts FROM member_email_challenges WHERE email_hash=?').bind(emailHash).first();
  if(!row||Number(row.expires_at)<now||Number(row.attempts)>=5) return Response.json({ok:false,error:'CODE_EXPIRED'},{status:401});
  const expected=await digest(`code:${emailHash}:${code}:${secret(env)}`);
  if(expected!==row.code_hash){await env.PRODUCT_DB.prepare('UPDATE member_email_challenges SET attempts=attempts+1 WHERE email_hash=?').bind(emailHash).run();return Response.json({ok:false,error:'CODE_INVALID'},{status:401});}
  await env.PRODUCT_DB.prepare('DELETE FROM member_email_challenges WHERE email_hash=?').bind(emailHash).run();
  return {email,emailHash,registrationContext:input.registration_context};
}
export async function verifyEmailCode(request,env,issueSession,now=Math.floor(Date.now()/1000)) {
  const verified=await consumeEmailCode(request,env,now);if(verified instanceof Response)return verified;
  const {email,emailHash,registrationContext}=verified;
  await storeMemberRegistrationDestination(env,emailHash,'EMAIL',email,registrationContext);
  return issueSession({id:emailHash,name:email.split('@')[0].slice(0,40),picture:'',provider:'EMAIL'},env);
}
export async function linkEmailDestination(request,env,memberId,now=Math.floor(Date.now()/1000)) {
  if(!memberId)return Response.json({ok:false,error:'MEMBER_REQUIRED'},{status:401});
  const verified=await consumeEmailCode(request,env,now);if(verified instanceof Response)return verified;
  await storeMemberNotificationDestination(env,memberId,'EMAIL',verified.email);
  // Also mark the privacy-safe email identity as already verified. If this
  // user later chooses email login, it must not be counted as a second person.
  await storeMemberNotificationDestination(env,verified.emailHash,'EMAIL',verified.email);
  return Response.json({ok:true,channel:'EMAIL'},{headers:{'cache-control':'no-store'}});
}
