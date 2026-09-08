import { readMemberSession } from './member-auth.mjs';
const LANGUAGES=new Set(['JA','EN','ZH','KO']);
function clean(value){return String(value||'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,200);}
export async function handleMemberWishRoutes(request,env){
  const url=new URL(request.url);if(!url.pathname.startsWith('/api/member/wishes'))return null;
  if(!env.PRODUCT_DB)return Response.json({ok:false,error:'MEMBER_STORE_NOT_CONFIGURED'},{status:503});
  const member=await readMemberSession(request,env);if(!member)return Response.json({ok:false,error:'MEMBER_LOGIN_REQUIRED'},{status:401});
  if(request.method==='GET'&&url.pathname==='/api/member/wishes'){const result=await env.PRODUCT_DB.prepare('SELECT wish_id,query_text,language,created_at,updated_at FROM member_wishes WHERE member_id=?1 ORDER BY updated_at DESC LIMIT 100').bind(member.id).all();return Response.json({ok:true,wishes:result.results||[]},{headers:{'cache-control':'no-store'}});}
  if(request.method==='POST'&&url.pathname==='/api/member/wishes'){const payload=await request.json(),query=clean(payload.query),language=LANGUAGES.has(payload.language)?payload.language:'JA';if(query.length<2)return Response.json({ok:false,error:'WISH_QUERY_INVALID'},{status:400});const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${member.id}:${query.toLowerCase()}`));const wishId=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('').slice(0,32),now=new Date().toISOString();await env.PRODUCT_DB.prepare('INSERT INTO member_wishes(member_id,wish_id,query_text,language,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?5) ON CONFLICT(member_id,wish_id) DO UPDATE SET query_text=excluded.query_text,language=excluded.language,updated_at=excluded.updated_at').bind(member.id,wishId,query,language,now).run();return Response.json({ok:true,wish:{wish_id:wishId,query_text:query,language,created_at:now,updated_at:now}});}
  if(request.method==='DELETE'){const wishId=url.pathname.split('/').pop();if(!/^[a-f0-9]{32}$/.test(wishId))return Response.json({ok:false,error:'WISH_ID_INVALID'},{status:400});await env.PRODUCT_DB.prepare('DELETE FROM member_wishes WHERE member_id=?1 AND wish_id=?2').bind(member.id,wishId).run();return Response.json({ok:true});}
  return Response.json({ok:false,error:'METHOD_NOT_ALLOWED'},{status:405});
}
