const copy = {
  JA:{title:'セールだけ、先回りして届く。',lead:'掲載10モールの確認済みセール情報を横断。開始前にもお知らせし、始まったらホシルで本当に安い購入先を探せます。',notice:'無料会員限定・セール専用通知',noticeBody:'おすすめ記事や一般ニュースは通知しません。割引セールの開始前と開始時だけをお知らせします。',toggle:'全モールのセール通知を受け取る',login:'ログインすると設定を保存できます。',empty:'確認済みのセール情報を準備中です。未確認情報は掲載しません。',starts:'開始',ends:'終了',detail:'公式情報を見る',saved:'セール通知だけを受け取る設定を保存しました。',off:'セール通知を停止しました。'},
  EN:{title:'Only real sales, before they start.',lead:'Track verified sale events across ten marketplaces. Get advance notice, then compare where the final price is truly lowest.',notice:'Free members · sale-only alerts',noticeBody:'No general news or recommendation alerts. HOSHILU only notifies you before and when verified sales start.',toggle:'Receive sale alerts from all marketplaces',login:'Sign in to save this setting.',empty:'Verified sale updates are being prepared. Unverified information is not published.',starts:'Starts',ends:'Ends',detail:'View official details',saved:'Sale-only notifications are enabled.',off:'Sale notifications are disabled.'},
  ZH:{title:'只推送促销，并提前通知。',lead:'汇总十个商城的已确认促销。开售前提醒，开始后可在 HOSHILU 比较真正的最低价。',notice:'免费会员专享・仅促销通知',noticeBody:'不推送一般资讯或推荐，只在已确认促销开始前和开始时通知。',toggle:'接收所有商城的促销通知',login:'登录后可保存此设置。',empty:'正在准备已验证的促销信息。未经确认的信息不会发布。',starts:'开始',ends:'结束',detail:'查看官方信息',saved:'已开启仅促销通知。',off:'已关闭促销通知。'},
  KO:{title:'세일만, 시작 전에 알려드려요.',lead:'10개 쇼핑몰의 확인된 세일을 모아 시작 전 알려드리고, 시작 후에는 실제 최저 구매처를 비교할 수 있습니다.',notice:'무료 회원 전용 · 세일 알림만',noticeBody:'일반 뉴스나 추천 알림은 보내지 않습니다. 확인된 세일의 시작 전과 시작 시점만 알려드립니다.',toggle:'모든 쇼핑몰 세일 알림 받기',login:'로그인하면 설정을 저장할 수 있습니다.',empty:'확인된 세일 정보를 준비 중입니다. 미확인 정보는 게시하지 않습니다.',starts:'시작',ends:'종료',detail:'공식 정보 보기',saved:'세일 알림만 받도록 설정했습니다.',off:'세일 알림을 중지했습니다.'}
};

const marketplaces=[
  ['AMAZON_JP','Amazon'],['RAKUTEN_JP','楽天市場'],['YAHOO_JP','Yahoo!ショッピング'],['QOO10_JP','Qoo10'],['SHEIN_JP','SHEIN'],
  ['ZOZOTOWN','ZOZOTOWN'],['SHOPLIST','SHOPLIST'],['MUSINSA','MUSINSA'],['BUYMA','BUYMA'],['SNKRDUNK','SNKRDUNK']
];
const infoTypes=[
  ['SALE','セール','割引セール・大型セール'],
  ['COUPON','クーポン','公式クーポン・ポイント施策'],
  ['NEW_ARRIVAL','新着商品','新商品・新規取扱い'],
  ['LIMITED','限定品・コラボ','期間限定・別注・コラボ'],
  ['RESTOCK','再入荷','売り切れ商品の再入荷'],
  ['EDITORIAL','モール最新情報','特集・ランキング・注目情報']
];
const infoTypesLocalized={
  EN:[['SALE','Sales','Major and seasonal sales'],['COUPON','Coupons','Official coupons and points'],['NEW_ARRIVAL','New arrivals','New products and listings'],['LIMITED','Limited & collaborations','Limited editions and collaborations'],['RESTOCK','Restocks','Back-in-stock updates'],['EDITORIAL','Marketplace updates','Features, rankings and trends']],
  ZH:[['SALE','促销','大型及季节促销'],['COUPON','优惠券','官方优惠券及积分活动'],['NEW_ARRIVAL','新品','新品及新上架'],['LIMITED','限定与联名','期间限定及联名'],['RESTOCK','补货','缺货商品重新上架'],['EDITORIAL','商城最新信息','专题、榜单及趋势']],
  KO:[['SALE','세일','대형·시즌 세일'],['COUPON','쿠폰','공식 쿠폰·포인트'],['NEW_ARRIVAL','신상품','신상품·신규 입점'],['LIMITED','한정·콜라보','기간 한정·콜라보'],['RESTOCK','재입고','품절 상품 재입고'],['EDITORIAL','쇼핑몰 최신 정보','기획전·랭킹·트렌드']]
};
const settingsCopy={
  JA:{open:'通知設定を開く',title:'通知設定',lead:'セールだけ最初からON。必要な情報だけ後から追加できます。',info:'受け取る情報',mall:'対象モール',frequency:'通知頻度',language:'通知言語',timing:'通知する時間',advance:'セール開始前にも知らせる',quietStart:'おやすみ開始',quietEnd:'おやすみ終了',privacy:'通知設定は会員IDに紐づけて保存します。',reset:'初期設定に戻す',save:'設定を保存',saved:'通知設定を保存しました。',login:'無料会員でログインすると設定できます。'},
  EN:{open:'Notification settings',title:'Notification settings',lead:'Sales are on by default. Add only the updates you want.',info:'Updates to receive',mall:'Marketplaces',frequency:'Frequency',language:'Notification language',timing:'Delivery time',advance:'Notify me before sales start',quietStart:'Quiet hours start',quietEnd:'Quiet hours end',privacy:'Settings are stored with your member ID.',reset:'Restore defaults',save:'Save settings',saved:'Notification settings saved.',login:'Sign in as a free member to change settings.'},
  ZH:{open:'通知设置',title:'通知设置',lead:'默认只开启促销。其他信息可按需添加。',info:'接收的信息',mall:'目标商城',frequency:'通知频率',language:'通知语言',timing:'通知时间',advance:'促销开始前提醒',quietStart:'免打扰开始',quietEnd:'免打扰结束',privacy:'设置将与会员ID关联保存。',reset:'恢复默认',save:'保存设置',saved:'通知设置已保存。',login:'免费会员登录后可设置。'},
  KO:{open:'알림 설정',title:'알림 설정',lead:'세일만 기본 ON입니다. 필요한 정보만 추가하세요.',info:'받을 정보',mall:'대상 쇼핑몰',frequency:'알림 빈도',language:'알림 언어',timing:'알림 시간',advance:'세일 시작 전에도 알림',quietStart:'방해 금지 시작',quietEnd:'방해 금지 종료',privacy:'설정은 회원 ID와 연결해 저장합니다.',reset:'기본값 복원',save:'설정 저장',saved:'알림 설정을 저장했습니다.',login:'무료 회원으로 로그인하면 설정할 수 있습니다.'}
};

const officialUpdates=[
  {marketplace_label:'Amazon',title:'公式セール・キャンペーン情報',summary:'Amazon公式のセール、タイムセール、キャンペーンを確認できます。',source_url:'https://www.amazon.co.jp/deals',official:true},
  {marketplace_label:'楽天市場',title:'公式キャンペーン情報',summary:'楽天市場公式のお得なキャンペーンやポイント情報を確認できます。',source_url:'https://event.rakuten.co.jp/incentive/client/',official:true},
  {marketplace_label:'Yahoo!ショッピング',title:'公式キャンペーン情報',summary:'Yahoo!ショッピング公式のセール、クーポン、ポイント情報を確認できます。',source_url:'https://shopping.yahoo.co.jp/promotion/campaign/',official:true},
  {marketplace_label:'Qoo10',title:'公式セール・特集情報',summary:'Qoo10公式のセール、クーポン、特集を確認できます。',source_url:'https://www.qoo10.jp/gmkt.inc/Events/Promotion.aspx',official:true},
  {marketplace_label:'SHEIN',title:'公式セール・新着情報',summary:'SHEIN公式のセール、新着商品、特集を確認できます。',source_url:'https://jp.shein.com/',official:true},
  {marketplace_label:'ZOZOTOWN',title:'公式ファッション情報',summary:'ZOZOTOWN公式のセール、新着、ショップ情報を確認できます。',source_url:'https://zozo.jp/',official:true},
  {marketplace_label:'SHOPLIST',title:'公式ファッション情報',summary:'SHOPLIST公式のセール、クーポン、新着情報を確認できます。',source_url:'https://shop-list.com/',official:true},
  {marketplace_label:'MUSINSA',title:'公式ファッション情報',summary:'MUSINSA公式のセール、新着、ブランド情報を確認できます。',source_url:'https://global.musinsa.com/jp/',official:true},
  {marketplace_label:'BUYMA',title:'公式ファッション情報',summary:'BUYMA公式の特集、新着、ブランド情報を確認できます。',source_url:'https://www.buyma.com/',official:true}
  ,{marketplace_label:'SNKRDUNK',title:'公式スニーカー・ファッション情報',summary:'SNKRDUNK公式の新着、発売情報、鑑定付き商品を確認できます。',source_url:'https://snkrdunk.com/information/',official:true}
];
const officialCopy={
  JA:{title:'公式セール・最新情報',summary:'公式サイトのセール、キャンペーン、新着情報を確認できます。',status:'公式情報を常時掲載'},
  EN:{title:'Official sales & updates',summary:'See sales, campaigns and new arrivals on the official marketplace site.',status:'Official updates always available'},
  ZH:{title:'官方促销与最新信息',summary:'查看商城官方网站的促销、活动和新品信息。',status:'持续显示官方信息'},
  KO:{title:'공식 세일·최신 정보',summary:'쇼핑몰 공식 사이트의 세일, 캠페인, 신상품 정보를 확인하세요.',status:'공식 정보를 항상 표시'}
};

function language(){return document.querySelector('[data-language-select]')?.value||'JA';}
function date(value){return new Intl.DateTimeFormat(language()==='JA'?'ja-JP':language()==='KO'?'ko-KR':language()==='ZH'?'zh-CN':'en-US',{month:'short',day:'numeric'}).format(new Date(value));}

function render(sales=[]){
  const rail=document.querySelector('#saleRail'); if(!rail)return;
  const t=copy[language()]||copy.JA;
  const officialText=officialCopy[language()]||officialCopy.JA;
  const items=[...sales,...officialUpdates];
  rail.replaceChildren(...items.map(sale=>{
    const card=document.createElement('article');card.className='sale-card';
    if(sale.video_url){
      const video=document.createElement('video');video.className='sale-media';video.src=sale.video_url;video.muted=true;video.loop=true;video.autoplay=true;video.playsInline=true;video.preload='metadata';card.append(video);
    }else if(sale.image_url){
      const image=document.createElement('img');image.className='sale-media';image.src=sale.image_url;image.alt='';image.loading='lazy';image.decoding='async';card.append(image);
    }
    const mall=document.createElement('span');mall.className='mall';mall.textContent=sale.marketplace_label;
    const title=document.createElement('h3');title.textContent=sale.official?officialText.title:sale.title;
    const body=document.createElement('p');body.textContent=sale.official?officialText.summary:sale.summary;
    const period=document.createElement('time');period.textContent=sale.official?officialText.status:`${t.starts} ${date(sale.starts_at)} · ${t.ends} ${date(sale.ends_at)}`;
    const link=document.createElement('a');link.href=sale.source_url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=t.detail;
    if(sale.official)card.classList.add('official-update');
    card.append(mall,title,body,period,link);return card;
  }));
}

const saleRail=document.querySelector('#saleRail');
let railDirection=1;
let railPaused=false;
function advanceSaleRail(){
  if(!saleRail||railPaused||saleRail.scrollWidth<=saleRail.clientWidth)return;
  saleRail.scrollLeft+=railDirection*.45;
  if(saleRail.scrollLeft+saleRail.clientWidth>=saleRail.scrollWidth-2)railDirection=-1;
  if(saleRail.scrollLeft<=1)railDirection=1;
}
if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
  setInterval(advanceSaleRail,30);
  ['pointerenter','focusin','touchstart'].forEach(type=>saleRail?.addEventListener(type,()=>{railPaused=true;},{passive:true}));
  ['pointerleave','focusout','touchend'].forEach(type=>saleRail?.addEventListener(type,()=>{railPaused=false;},{passive:true}));
}

function renderCopy(){
  const t=copy[language()]||copy.JA;
  document.querySelector('#saleCenterTitle').textContent=t.title;
  document.querySelector('#saleCenterLead').textContent=t.lead;
  document.querySelector('#saleNoticeTitle').textContent=t.notice;
  document.querySelector('#saleNoticeBody').textContent=t.noticeBody;
  document.querySelector('#saleToggleLabel').textContent=t.toggle;
  if(!status?.textContent||status.dataset.untouched!=='false')status.textContent=t.login;
  renderSettingsCopy();
}

function renderSettingsCopy(){
  const t=settingsCopy[language()]||settingsCopy.JA;
  const values={
    openNotificationSettings:t.open,notificationSettingsTitle:t.title,
    notificationSettingsLead:t.lead,settingsInfoLegend:t.info,settingsMallLegend:t.mall,
    settingsFrequencyLabel:t.frequency,settingsLanguageLabel:t.language,
    settingsTimingLegend:t.timing,settingsAdvanceLabel:t.advance,
    settingsQuietStartLabel:t.quietStart,settingsQuietEndLabel:t.quietEnd,
    settingsPrivacyText:t.privacy,settingsReset:t.reset,settingsSave:t.save
  };
  Object.entries(values).forEach(([id,value])=>{const element=document.querySelector(`#${id}`);if(element)element.textContent=value;});
}

function checkboxGrid(root,rows,name,selected){
  root.replaceChildren(...rows.map(([value,label,description])=>{
    const wrapper=document.createElement('label');
    const input=document.createElement('input');input.type='checkbox';input.name=name;input.value=value;input.checked=selected.has(value);
    const copyWrap=document.createElement('span');const strong=document.createElement('strong');strong.textContent=label;copyWrap.append(strong);
    if(description){const small=document.createElement('small');small.textContent=description;copyWrap.append(small);}
    wrapper.append(input,copyWrap);return wrapper;
  }));
}

function selectedValues(name){return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(input=>input.value);}
function defaultPreference(){return{enabled:1,advance_notice:1,marketplaces:'ALL',info_types:'SALE',frequency:'INSTANT',quiet_start:'21:00',quiet_end:'08:00',language:language()};}
function fillSettings(preference=defaultPreference()){
  const selectedMalls=new Set(preference.marketplaces==='ALL'?marketplaces.map(([value])=>value):String(preference.marketplaces||'').split(','));
  const selectedTypes=new Set(preference.enabled===0?[]:String(preference.info_types||'SALE').split(','));
  checkboxGrid(document.querySelector('#settingsMarketplaces'),marketplaces,'marketplace',selectedMalls);
  checkboxGrid(document.querySelector('#settingsInfoTypes'),infoTypesLocalized[language()]||infoTypes,'infoType',selectedTypes);
  document.querySelector('#settingsFrequency').value=preference.frequency||'INSTANT';
  document.querySelector('#settingsLanguage').value=preference.language||language();
  document.querySelector('#settingsAdvance').checked=Boolean(preference.advance_notice);
  document.querySelector('#settingsQuietStart').value=preference.quiet_start||'21:00';
  document.querySelector('#settingsQuietEnd').value=preference.quiet_end||'08:00';
}

const toggle=document.querySelector('#saleOnlyToggle');
const status=document.querySelector('#salePreferenceStatus');
const settingsDialog=document.querySelector('#notificationSettingsDialog');
const settingsStatus=document.querySelector('#notificationSettingsStatus');
let memberPreference=null;
let sales=[];
renderCopy();
fetch('/api/sales').then(r=>r.ok?r.json():{sales:[]}).then(data=>{sales=data.sales||[];render(sales);}).catch(()=>render([]));
window.addEventListener('hoshilu:languagechange',()=>{renderCopy();render(sales);});
document.querySelector('[data-language-select]')?.addEventListener('change',()=>{renderCopy();render(sales);});
fetch('/api/member/sale-preferences',{cache:'no-store'}).then(async response=>{
  if(response.status===401){toggle.disabled=true;document.querySelector('#settingsSave').disabled=true;return;}
  const data=await response.json();memberPreference=data.preference||defaultPreference();
  toggle.checked=Boolean(memberPreference.enabled)&&String(memberPreference.info_types||'SALE').split(',').includes('SALE');
  fillSettings(memberPreference);
}).catch(()=>{toggle.disabled=true;});
toggle?.addEventListener('change',async()=>{
  const response=await fetch('/api/member/sale-preferences',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:toggle.checked,advance_notice:true})});
  if(!response.ok){toggle.checked=!toggle.checked;return;}
  const t=copy[language()]||copy.JA;status.dataset.untouched='false';status.textContent=toggle.checked?t.saved:t.off;
});
document.querySelector('#openNotificationSettings')?.addEventListener('click',()=>{
  fillSettings(memberPreference||defaultPreference());
  settingsStatus.textContent=memberPreference?'':(settingsCopy[language()]||settingsCopy.JA).login;
  settingsDialog.showModal();
});
document.querySelector('#notificationSettingsClose')?.addEventListener('click',()=>settingsDialog.close());
document.querySelector('#settingsReset')?.addEventListener('click',()=>fillSettings(defaultPreference()));
document.querySelector('#notificationSettingsForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const types=selectedValues('infoType');
  const malls=selectedValues('marketplace');
  const payload={
    enabled:types.length>0,advance_notice:document.querySelector('#settingsAdvance').checked,
    info_types:types,marketplaces:malls,frequency:document.querySelector('#settingsFrequency').value,
    language:document.querySelector('#settingsLanguage').value,
    quiet_start:document.querySelector('#settingsQuietStart').value,
    quiet_end:document.querySelector('#settingsQuietEnd').value
  };
  const response=await fetch('/api/member/sale-preferences',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  if(!response.ok){settingsStatus.textContent=(settingsCopy[language()]||settingsCopy.JA).login;return;}
  const data=await response.json();memberPreference=data.preference;
  toggle.checked=Boolean(memberPreference.enabled)&&String(memberPreference.info_types||'').split(',').includes('SALE');
  settingsStatus.textContent=(settingsCopy[language()]||settingsCopy.JA).saved;
});
