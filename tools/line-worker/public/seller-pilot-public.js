import {growthVisitorId,growthSessionId} from './growth-identity.mjs';
const el=document.querySelector('#pilotPublic'),id=el.dataset.pilotId;
const status=document.querySelector('#saveStatus');
let owner=false;
try{const r=await fetch('/api/seller-pilot',{cache:'no-store'});if(r.ok){const data=await r.json();owner=data.measurement_excluded||data.items.some(row=>row.pilot_id===id);}}catch{}
const qa=el.dataset.test==='true'||new URLSearchParams(location.search).get('qa')==='1';
function event(type,content=''){
 if(owner||qa)return;
 fetch('/api/events',{method:'POST',headers:{'content-type':'application/json'},keepalive:true,body:JSON.stringify({event_type:type,visitor_id:growthVisitorId(),session_id:growthSessionId(),source:'seller_pilot',medium:'listing',campaign:id,content})}).catch(()=>{});
}
if(document.visibilityState==='visible')event('shop_view_confirmed');
document.querySelectorAll('[data-pilot-click]').forEach(link=>link.addEventListener('click',()=>event('marketplace_click',link.dataset.pilotClick)));
document.querySelectorAll('[data-pilot-save]').forEach(button=>button.addEventListener('click',async()=>{
 button.disabled=true;try{
  const r=await fetch(`/api/seller-pilot/${id}/save`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({product_id:button.dataset.pilotSave})});
  if(r.status===401){status.innerHTML='保存するには <a href="/login.html">ログイン</a> してください。';return;}
  const data=await r.json();if(!r.ok||!data.ok)throw new Error();
  status.innerHTML='保存しました。<a href="/seller-pilot/saved">保存した商品を見る</a>'; event('wish_saved',button.dataset.pilotSave);
 }catch{status.textContent='保存できませんでした。再度お試しください。';}finally{button.disabled=false;}
}));
