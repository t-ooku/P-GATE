const copy = {
  JA:{title:'セールだけ、先回りして届く。',lead:'掲載8モールの確認済みセール情報を横断。開始前にもお知らせし、始まったらホシルで本当に安い購入先を探せます。',notice:'無料会員限定・セール専用通知',noticeBody:'おすすめ記事や一般ニュースは通知しません。割引セールの開始前と開始時だけをお知らせします。',toggle:'全モールのセール通知を受け取る',login:'ログインすると設定を保存できます。',empty:'確認済みのセール情報を準備中です。未確認情報は掲載しません。',starts:'開始',ends:'終了',detail:'公式情報を見る',saved:'セール通知だけを受け取る設定を保存しました。',off:'セール通知を停止しました。'},
  EN:{title:'Only real sales, before they start.',lead:'Track verified sale events across eight marketplaces. Get advance notice, then compare where the final price is truly lowest.',notice:'Free members · sale-only alerts',noticeBody:'No general news or recommendation alerts. HOSHILU only notifies you before and when verified sales start.',toggle:'Receive sale alerts from all marketplaces',login:'Sign in to save this setting.',empty:'Verified sale updates are being prepared. Unverified information is not published.',starts:'Starts',ends:'Ends',detail:'View official details',saved:'Sale-only notifications are enabled.',off:'Sale notifications are disabled.'},
  ZH:{title:'只推送促销，并提前通知。',lead:'汇总八个商城的已确认促销。开售前提醒，开始后可在 HOSHILU 比较真正的最低价。',notice:'免费会员专享・仅促销通知',noticeBody:'不推送一般资讯或推荐，只在已确认促销开始前和开始时通知。',toggle:'接收所有商城的促销通知',login:'登录后可保存此设置。',empty:'正在准备已验证的促销信息。未经确认的信息不会发布。',starts:'开始',ends:'结束',detail:'查看官方信息',saved:'已开启仅促销通知。',off:'已关闭促销通知。'},
  KO:{title:'세일만, 시작 전에 알려드려요.',lead:'8개 쇼핑몰의 확인된 세일을 모아 시작 전 알려드리고, 시작 후에는 실제 최저 구매처를 비교할 수 있습니다.',notice:'무료 회원 전용 · 세일 알림만',noticeBody:'일반 뉴스나 추천 알림은 보내지 않습니다. 확인된 세일의 시작 전과 시작 시점만 알려드립니다.',toggle:'모든 쇼핑몰 세일 알림 받기',login:'로그인하면 설정을 저장할 수 있습니다.',empty:'확인된 세일 정보를 준비 중입니다. 미확인 정보는 게시하지 않습니다.',starts:'시작',ends:'종료',detail:'공식 정보 보기',saved:'세일 알림만 받도록 설정했습니다.',off:'세일 알림을 중지했습니다.'}
};

function language(){return document.querySelector('[data-language-select]')?.value||'JA';}
function date(value){return new Intl.DateTimeFormat(language()==='JA'?'ja-JP':language()==='KO'?'ko-KR':language()==='ZH'?'zh-CN':'en-US',{month:'short',day:'numeric'}).format(new Date(value));}

function render(sales=[]){
  const rail=document.querySelector('#saleRail'); if(!rail)return;
  const t=copy[language()]||copy.JA;
  if(!sales.length){rail.innerHTML=`<p class="sale-empty">${t.empty}</p>`;return;}
  rail.replaceChildren(...sales.map(sale=>{
    const card=document.createElement('article');card.className='sale-card';
    const mall=document.createElement('span');mall.className='mall';mall.textContent=sale.marketplace_label;
    const title=document.createElement('h3');title.textContent=sale.title;
    const body=document.createElement('p');body.textContent=sale.summary;
    const period=document.createElement('time');period.textContent=`${t.starts} ${date(sale.starts_at)} · ${t.ends} ${date(sale.ends_at)}`;
    const link=document.createElement('a');link.href=sale.source_url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=t.detail;
    card.append(mall,title,body,period,link);return card;
  }));
}

function renderCopy(){
  const t=copy[language()]||copy.JA;
  document.querySelector('#saleCenterTitle').textContent=t.title;
  document.querySelector('#saleCenterLead').textContent=t.lead;
  document.querySelector('#saleNoticeTitle').textContent=t.notice;
  document.querySelector('#saleNoticeBody').textContent=t.noticeBody;
  document.querySelector('#saleToggleLabel').textContent=t.toggle;
  if(!status?.textContent||status.dataset.untouched!=='false')status.textContent=t.login;
}

const toggle=document.querySelector('#saleOnlyToggle');
const status=document.querySelector('#salePreferenceStatus');
let sales=[];
renderCopy();
fetch('/api/sales').then(r=>r.ok?r.json():{sales:[]}).then(data=>{sales=data.sales||[];render(sales);}).catch(()=>render([]));
window.addEventListener('hoshilu:languagechange',()=>{renderCopy();render(sales);});
fetch('/api/member/sale-preferences',{cache:'no-store'}).then(async response=>{
  if(response.status===401){toggle.disabled=true;return;}
  const data=await response.json();toggle.checked=Boolean(data.preference?.enabled);
}).catch(()=>{toggle.disabled=true;});
toggle?.addEventListener('change',async()=>{
  const response=await fetch('/api/member/sale-preferences',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:toggle.checked,advance_notice:true})});
  if(!response.ok){toggle.checked=!toggle.checked;return;}
  const t=copy[language()]||copy.JA;status.dataset.untouched='false';status.textContent=toggle.checked?t.saved:t.off;
});
