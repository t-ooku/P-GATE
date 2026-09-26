import { PILOT_OFFER, LEGACY_PILOT_OFFER, TRIAL_COPY, jstDateTime } from './seller-trial-policy.mjs';
const root=document.querySelector('#pilotApp'),status=document.querySelector('#pilotStatus');
const admin=root.dataset.admin==='true',base=admin?'/api/admin/seller-pilot':'/api/seller-pilot';
const esc=v=>String(v??'').replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(item,action,label,extra='')=>`<button data-action="${action}" data-id="${esc(item.pilot_id)}" data-revision="${item.revision}" ${extra}>${label}</button>`;
async function post(path,input){
  const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
  const data=await r.json();if(!r.ok)throw new Error(data.error||'保存できませんでした');return data;
}
function offerText(item){
  if(item.offer_version===PILOT_OFFER)return TRIAL_COPY;
  if(item.offer_version===LEGACY_PILOT_OFFER)return 'この店舗には合意済みの暦3か月条件を適用します。保存済みの開始・終了日時は変更しません。本人の有料申込みなしに課金しません。';
  return '以前の案内条件を確認中です。条件が確認されるまで公開できません。';
}
async function load(){
  const r=await fetch(base,{cache:'no-store'});const data=await r.json();
  if(!r.ok){root.innerHTML='<p>この店舗の連絡先メールでログインしてください。</p><a href="/login.html">ログイン</a>';return;}
  root.innerHTML=`<p>相談・登録・見本作成では無料期間は始まりません。公開承認と有料契約は別です。</p><p>体験終了後は公開SHOP・横断検索・新規掲載と販促通知を停止し、管理画面・商品・保存履歴・KPIを既存の保持方針に従って残します。保存済みの商品は「掲載終了」となります。</p><p>${data.offer_enabled?'各店舗の適用条件を確認してください。':'条件は承認待ちです。現在、公開承認・公開はできません。'}</p>`+
    (admin?'<details><summary>許諾済み商品で非公開見本を作る</summary><p>相談受付ID、事業者・外部店舗の確認証跡、許諾済み商品を入力します。獲得の目標は3商品以上の公開と店舗本人確認です。prior_terms_reviewed=true は以前の案内を確認した場合のみ。既に3か月を案内した対象には legacy_promise_ref を必須とします。</p><form id="pilotCreate"><label>確認済みデータ（JSON）<textarea name="document" rows="12" required style="width:100%"></textarea></label><button>非公開見本を保存</button></form></details>':'')+
    (data.items.length?data.items.map(item=>`<article style="margin:24px 0;border-top:1px solid #ddd;padding-top:16px"><h2>${esc(item.shop_name)}</h2><p>${esc(item.business_name)} / ${esc(item.registered_address)}</p><p>${esc(offerText(item))}</p><p>状態: ${esc(item.entitlement.paid?'有料契約確認済み':item.entitlement.expired?'体験終了':item.status)} / 通常月額4,980円（税込）</p><p>開始: ${esc(item.starts_at?jstDateTime(item.starts_at):'初回公開成功時に開始')} / 終了: ${esc(item.ends_at?jstDateTime(item.ends_at):'未開始')}</p>${item.entitlement.active&&!item.entitlement.paid?`<p>${esc(jstDateTime(item.ends_at))}まで無料</p>`:''}${item.products.map(p=>`<div><img src="${esc(p.image_url)}" referrerpolicy="no-referrer" alt="" width="100"><strong>${esc(p.title)}</strong> / ${p.price_jpy===null?'価格未確認':`${p.price_jpy}円`} <a target="_blank" rel="noopener noreferrer" href="${esc(p.destination_url)}">販売先を確認</a></div>`).join('')}<p>KPI: ${item.kpi?.status==='MEASURED'?`閲覧 ${item.kpi.views} / 保存 ${item.kpi.saves} / 販売先クリック ${item.kpi.outbound_clicks}（計測できた回数。購入・売上は未計測）`:'未計測・集計対象外'}。本人の掲載確認: ${esc(item.owner_confirmed_at?jstDateTime(item.owner_confirmed_at):'未確認')}</p>${item.status==='PUBLISHED'&&item.entitlement.active?`<p><a href="/seller-pilot/shops/${esc(item.pilot_id)}">公開ページを確認</a></p>`:''}${!admin&&item.status==='DRAFT'?`<label><input type="checkbox" data-consent="${esc(item.pilot_id)}">商品・画像・販売先・事業者情報と、この店舗の体験条件・終了後の扱いを確認し、公開を承認します。有料契約の同意ではありません。</label>${button(item,'APPROVE','掲載を承認',data.offer_enabled?'':'disabled')}`:''}${admin&&['APPROVED','UNPUBLISHED'].includes(item.status)?button(item,'PUBLISH','承認済み商品を公開',data.offer_enabled?'':'disabled'):''}${!admin&&item.entitlement.active&&!item.owner_confirmed_at?button(item,'CONFIRM','店舗本人として掲載内容を確認しました'):''}${item.status==='PUBLISHED'?button(item,'UNPUBLISH','掲載を非公開にする'):''}${!admin&&item.starts_at&&!item.continuation_interest_at?`<p>継続に関心がある場合、意思だけを担当者に記録できます。この操作では契約・請求・決済は発生しません。体験中の有料申込みは受け付けず、無料日数を保持します。</p>${button(item,'CONTINUE_INTEREST','有料継続に関心がある（意思のみ）')}`:''}${item.continuation_interest_at?'<p>継続への関心を記録済みです。有料契約は未成立です。</p>':''}${item.entitlement.expired&&!item.entitlement.paid?'<p>無料体験は終了しました。続ける場合は月額4,980円（税込）でお申し込みください。本人の申込みなしに請求はしません。</p>':''}${!admin&&item.entitlement.expired&&!item.entitlement.paid?`<p>初回請求は申込み時の決済日、以後毎月自動更新。次回更新前にこの管理画面から解約できます。解約後は支払済み期間の終了まで利用できます。</p><label><input type="checkbox" data-paid-consent="${esc(item.pilot_id)}">月額4,980円（税込）・初回請求日・月次更新・解約方法を確認し、有料継続を申し込みます。</label>${button(item,'PAID_OPT_IN','条件に同意して支払いへ',data.payments_enabled?'':'disabled')}${data.payments_enabled?'':'<p>有料申込みの受付準備中です。継続への関心を記録して担当者の案内をお待ちください。この状態では請求しません。</p>'}`:''}${!admin&&item.payment?.session_id?button(item,'SYNC_PAYMENT','決済側の契約状態を確認'):''}${!admin&&item.entitlement.paid?`<p>支払済み期間: ${esc(jstDateTime(item.payment.current_period_end_at))}まで。${item.payment.cancel_at_period_end?'次回更新停止済み':''}</p>${item.payment.cancel_at_period_end?'':button(item,'CANCEL_PAID','次回の月次更新を停止する')}`:''}${admin&&['DRAFT','UNPUBLISHED','APPROVED'].includes(item.status)?`<details><summary>見本の修正・旧案内条件の確認</summary><p>商品修正は再承認が必要です。初回公開済みの場合も期間は延長しません。旧案内の条件確認は、未確定の下書きのみ変更できます。</p><form data-revise="${esc(item.pilot_id)}" data-revision="${item.revision}"><label>修正する確認済みデータ（JSON）<textarea name="document" rows="8" required>${esc(JSON.stringify({shop_name:item.shop_name,business_name:item.business_name,registered_address:item.registered_address,business_evidence_ref:item.business_evidence_ref,external_verified:item.external_verified,external_evidence_ref:item.external_evidence_ref,test:item.test,products:item.products},null,2))}</textarea></label><button>修正して再承認待ちにする</button></form>${!item.offer_version?`<form data-review="${esc(item.pilot_id)}" data-revision="${item.revision}"><label>旧3か月案内証跡ID（該当しなければ空欄）<input name="legacy_promise_ref"></label><label><input name="prior_terms_reviewed" type="checkbox" required>以前の案内・合意を確認しました</label><button>適用条件を記録する</button></form>`:''}</details>`:''}${admin?`<details><summary>7日・21日・30日の担当作業</summary><p>7日:表示・リンク・計測・本人確認。21日:実績と改善点。30日:終了と継続案内。自動メール送信ではありません。完了時に非公開の対応記録IDを登録します。</p>${(item.followup_tasks||[]).map(t=>`<p>${t.day}日: ${esc(jstDateTime(t.due_at))} / ${esc(t.status)}</p>${t.status==='DUE'?`<form data-followup="${esc(item.pilot_id)}" data-revision="${item.revision}"><input type="hidden" name="day" value="${t.day}"><label>担当<input name="operator" required></label><label>対応証跡ID<input name="evidence_ref" required></label><label>計測<select name="measurement_status"><option value="UNAVAILABLE">未計測・確認不能</option><option value="MEASURED">実測確認済み</option></select></label><label>作業時間（分）<input type="number" min="0" name="minutes"></label><label>追加費用（円）<input type="number" min="0" name="additional_cost_jpy"></label><button>対応完了を記録</button></form>`:''}`).join('')}</details>`:''}</article>`).join(''):'<p>確認する掲載見本はまだありません。</p>');
  document.querySelector('#pilotCreate')?.addEventListener('submit',async event=>{
    event.preventDefault();try{await post(base,{...JSON.parse(new FormData(event.currentTarget).get('document')),action:'CREATE'});await load();status.textContent='非公開で保存しました。';}catch(e){status.textContent=e.message;}
  });
  root.querySelectorAll('[data-revise],[data-review]').forEach(form=>form.addEventListener('submit',async event=>{
    event.preventDefault();try{
      const values=new FormData(form),revise=Boolean(form.dataset.revise);
      const input=revise?{...JSON.parse(values.get('document')),action:'REVISE'}:{action:'REVIEW_TERMS',legacy_promise_ref:values.get('legacy_promise_ref'),prior_terms_reviewed:values.get('prior_terms_reviewed')==='on'};
      await post(`${base}/${form.dataset.revise||form.dataset.review}`,{...input,revision:Number(form.dataset.revision)});await load();status.textContent='保存しました。';
    }catch(e){status.textContent=e.message;}
  }));
  root.querySelectorAll('[data-followup]').forEach(form=>form.addEventListener('submit',async event=>{
    event.preventDefault();try{await post(`${base}/${form.dataset.followup}`,{...Object.fromEntries(new FormData(form)),action:'FOLLOWUP',revision:Number(form.dataset.revision)});await load();status.textContent='対応を記録しました。';}catch(e){status.textContent=e.message;}
  }));
  root.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',async()=>{
    b.disabled=true;try{
      const consent=root.querySelector(`[data-consent="${b.dataset.id}"]`)?.checked===true;
      if(b.dataset.action==='APPROVE'&&!consent)throw new Error('掲載内容と条件を確認してチェックしてください。');
      const item=data.items.find(x=>x.pilot_id===b.dataset.id);
      if(b.dataset.action==='PAID_OPT_IN') {
        if(root.querySelector(`[data-paid-consent="${b.dataset.id}"]`)?.checked!==true)throw new Error('有料契約条件を確認してチェックしてください。');
        const saved=await post(`${base}/${b.dataset.id}`,{action:'PAID_OPT_IN',revision:Number(b.dataset.revision),paid_consent:true,paid_terms_version:data.paid_terms_version});
        const checkout=await post(`${base}/${b.dataset.id}`,{action:'CHECKOUT',revision:saved.revision});
        if(!/^https:\/\/checkout\.stripe\.com\//u.test(checkout.checkout_url||''))throw new Error('支払いURLを確認できませんでした');
        location.assign(checkout.checkout_url);return;
      }
      await post(`${base}/${b.dataset.id}`,{action:b.dataset.action,revision:Number(b.dataset.revision),publication_consent:consent,offer_version:item.offer_version,continuation_interest:b.dataset.action==='CONTINUE_INTEREST'});await load();status.textContent='保存しました。';
    }catch(e){status.textContent=e.message;b.disabled=false;}
  }));
}
load().catch(()=>{status.textContent='読み込めませんでした。再読み込みしてください。';});
