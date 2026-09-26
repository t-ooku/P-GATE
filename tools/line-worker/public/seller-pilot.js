const root=document.querySelector('#pilotApp'),status=document.querySelector('#pilotStatus');
const admin=root.dataset.admin==='true',base=admin?'/api/admin/seller-pilot':'/api/seller-pilot';
const esc=v=>String(v??'').replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function post(path,input){
  const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
  const data=await r.json();if(!r.ok)throw new Error(data.error||'保存できませんでした');return data;
}
async function load(){
  const r=await fetch(base,{cache:'no-store'});const data=await r.json();
  if(!r.ok){root.innerHTML='<p>この店舗の連絡先メールでログインしてください。</p><a href="/login.html">ログイン</a>';return;}
  root.innerHTML=`<p>本人が有料継続を選ぶまで課金しません。体験は公開開始から暦3か月（末日は月末へ調整）。終了後は公開を停止し、データと結果は保持します。</p><p>${data.offer_enabled?'適用条件を確認して承認してください。':'体験条件は承認待ちです。現在、公開承認・公開はできません。'}</p>`+
    (admin?'<details><summary>許諾済み商品で非公開見本を作る</summary><p>相談受付ID、事業者確認と外部店舗確認の証跡、許諾済みの商品3点以上を入力します。実データ・許諾のない見本は登録しないでください。</p><form id="pilotCreate"><label>確認済みデータ（JSON）<textarea name="document" rows="12" required style="width:100%"></textarea></label><button>非公開見本を保存</button></form></details>':'')+
    (data.items.length?data.items.map(item=>`<article style="margin:24px 0;border-top:1px solid #ddd;padding-top:16px"><h2>${esc(item.shop_name)}</h2><p>${esc(item.business_name)} / ${esc(item.registered_address)}</p><p>状態: ${esc(item.entitlement.expired?'体験終了':item.status)} / 通常月額4,980円（税込）</p><p>開始: ${esc(item.starts_at||'公開時に開始')} / 終了: ${esc(item.ends_at||'開始から暦3か月')}</p>${item.products.map(p=>`<div><img src="${esc(p.image_url)}" referrerpolicy="no-referrer" alt="" width="100"><strong>${esc(p.title)}</strong> / ${p.price_jpy===null?'価格未確認':`${p.price_jpy}円`} <a target="_blank" rel="noopener noreferrer" href="${esc(p.destination_url)}">販売先を確認</a></div>`).join('')}<p>KPI: ${item.kpi?.status==='MEASURED'?`閲覧 ${item.kpi.views} / 保存 ${item.kpi.saves} / 販売先クリック ${item.kpi.outbound_clicks}（計測できた回数。購入・売上は未計測）`:'未計測・集計対象外'}。本人の掲載確認: ${esc(item.owner_confirmed_at||'未確認')}</p>${item.status==='PUBLISHED'?`<p><a href="/seller-pilot/shops/${esc(item.pilot_id)}">公開ページを確認</a></p>`:''}${!admin&&item.status==='DRAFT'?`<label><input type="checkbox" data-consent="${esc(item.pilot_id)}">商品・画像・販売先と事業者情報を確認し、上記の体験条件での公開を承認します。有料契約の同意ではありません。</label><button data-action="APPROVE" data-id="${esc(item.pilot_id)}" data-revision="${item.revision}" ${data.offer_enabled?'':'disabled'}>掲載を承認</button>`:''}${admin&&item.status==='APPROVED'?`<button data-action="PUBLISH" data-id="${esc(item.pilot_id)}" data-revision="${item.revision}" ${data.offer_enabled?'':'disabled'}>承認済み見本を公開</button>`:''}${!admin&&item.entitlement.active&&!item.owner_confirmed_at?`<button data-action="CONFIRM" data-id="${esc(item.pilot_id)}" data-revision="${item.revision}">店舗本人として掲載内容を確認しました</button>`:''}${item.entitlement.expired?'<p>体験は終了しました。料金は発生していません。有料継続をご希望の場合は、担当者へご連絡ください。</p>':''}</article>`).join(''):'<p>確認する掲載見本はまだありません。</p>');
  document.querySelector('#pilotCreate')?.addEventListener('submit',async event=>{
    event.preventDefault();try{await post(base,{...JSON.parse(new FormData(event.currentTarget).get('document')),action:'CREATE'});await load();status.textContent='非公開で保存しました。';}catch(e){status.textContent=e.message;}
  });
  root.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;try{
      const consent=root.querySelector(`[data-consent="${button.dataset.id}"]`)?.checked===true;
      if(button.dataset.action==='APPROVE'&&!consent)throw new Error('掲載内容と条件を確認してチェックしてください。');
      await post(`${base}/${button.dataset.id}`,{action:button.dataset.action,revision:Number(button.dataset.revision),publication_consent:consent,offer_version:data.offer_version});await load();status.textContent='保存しました。';
    }catch(e){status.textContent=e.message;button.disabled=false;}
  }));
}
load().catch(()=>{status.textContent='読み込めませんでした。再読み込みしてください。';});
