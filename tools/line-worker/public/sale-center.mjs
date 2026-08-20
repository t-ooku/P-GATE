import { attachVerticalTicker } from './vertical-ticker.mjs';

const copy = {
  JA:{title:'全てのセールを、\n先回りチェックしよう',lead:'13モールのセール、始まる前に通知。',notice:'無料会員限定・セール専用通知',noticeBody:'届くのはセール通知だけ。開始前と開始時のみ。',toggle:'全モールのセール通知を受け取る',login:'ログインすると設定を保存できます。',empty:'確認済みのセール情報を準備中です。未確認情報は掲載しません。',starts:'開始',ends:'終了',updated:'更新',detail:'公式情報を見る',saved:'セール通知だけを受け取る設定を保存しました。',off:'セール通知を停止しました。'},
  EN:{title:'Only real sales, before they start.',lead:'Sales across 13 marketplaces. Get notified before they start.',notice:'Free members · sale-only alerts',noticeBody:'Sale alerts only - before and when they start.',toggle:'Receive sale alerts from all marketplaces',login:'Sign in to save this setting.',empty:'Verified sale updates are being prepared. Unverified information is not published.',starts:'Starts',ends:'Ends',updated:'Updated',detail:'View official details',saved:'Sale-only notifications are enabled.',off:'Sale notifications are disabled.'},
  ZH:{title:'只推送促销，并提前通知。',lead:'13个商城的促销，开始前先通知。',notice:'免费会员专享・仅促销通知',noticeBody:'只推送促销通知：开始前和开始时。',toggle:'接收所有商城的促销通知',login:'登录后可保存此设置。',empty:'正在准备已验证的促销信息。未经确认的信息不会发布。',starts:'开始',ends:'结束',updated:'更新',detail:'查看官方信息',saved:'已开启仅促销通知。',off:'已关闭促销通知。'},
  KO:{title:'세일만, 시작 전에 알려드려요.',lead:'13개 쇼핑몰 세일, 시작 전에 알림.',notice:'무료 회원 전용 · 세일 알림만',noticeBody:'세일 알림만 보냅니다. 시작 전과 시작 시에만.',toggle:'모든 쇼핑몰 세일 알림 받기',login:'로그인하면 설정을 저장할 수 있습니다.',empty:'확인된 세일 정보를 준비 중입니다. 미확인 정보는 게시하지 않습니다.',starts:'시작',ends:'종료',updated:'업데이트',detail:'공식 정보 보기',saved:'세일 알림만 받도록 설정했습니다.',off:'세일 알림을 중지했습니다.'}
};

const marketplaces=[
  ['AMAZON_JP','Amazon'],['RAKUTEN_JP','楽天市場'],['YAHOO_JP','Yahoo!ショッピング'],['QOO10_JP','Qoo10'],['SHEIN_JP','SHEIN'],
  ['ZOZOTOWN','ZOZOTOWN'],['LOFT_JP','ロフト'],['HANDS_JP','ハンズ'],['MATSUKIYO_JP','マツキヨココカラ'],
  ['COSME_JP','@cosme'],['ABCMART_JP','ABC-MART'],['BUYMA','BUYMA'],['SNKRDUNK','SNKRDUNK']
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
const deliveryChannels={
  JA:[['APP','HOSHILUアプリ','アプリ内・端末のお知らせ'],['LINE','LINE','連携済みの公式LINE'],['EMAIL','メール','登録・確認済みメール']],
  EN:[['APP','HOSHILU app','In-app and device notifications'],['LINE','LINE','Connected official LINE account'],['EMAIL','Email','Verified email address']],
  ZH:[['APP','HOSHILU 应用','应用内和设备通知'],['LINE','LINE','已连接的官方 LINE'],['EMAIL','电子邮件','已验证的邮箱']],
  KO:[['APP','HOSHILU 앱','앱 내·기기 알림'],['LINE','LINE','연결된 공식 LINE'],['EMAIL','이메일','인증된 이메일 주소']]
};
const emailLinkCopy={
  JA:{title:'メール通知先を追加',send:'確認コードを送る',verify:'認証して追加',address:'メールアドレス',code:'6桁コード',sending:'確認コードを送信しています…',sent:'メールに届いた6桁コードを入力してください。',linked:'メール通知先を追加しました。メールを選択して設定を保存できます。',failed:'メールアドレスまたは確認コードを確認してください。'},
  EN:{title:'Add an email destination',send:'Send verification code',verify:'Verify and add',address:'Email address',code:'6-digit code',sending:'Sending a verification code…',sent:'Enter the 6-digit code sent to your email.',linked:'Email destination added. Select Email and save your settings.',failed:'Check the email address or verification code.'},
  ZH:{title:'添加电子邮件通知地址',send:'发送验证码',verify:'验证并添加',address:'电子邮件地址',code:'6位验证码',sending:'正在发送验证码…',sent:'请输入邮件中收到的6位验证码。',linked:'电子邮件通知地址已添加。请选择电子邮件并保存设置。',failed:'请检查电子邮件地址或验证码。'},
  KO:{title:'이메일 알림 주소 추가',send:'인증 코드 보내기',verify:'인증 후 추가',address:'이메일 주소',code:'6자리 코드',sending:'인증 코드를 보내는 중…',sent:'이메일로 받은 6자리 코드를 입력하세요.',linked:'이메일 알림 주소를 추가했습니다. 이메일을 선택하고 설정을 저장하세요.',failed:'이메일 주소 또는 인증 코드를 확인하세요.'}
};
const settingsCopy={
  JA:{open:'通知設定を開く',title:'通知設定',lead:'セールだけ最初からON。通知方法と必要な情報を選べます。',info:'受け取る情報',channel:'通知方法：アプリ・LINE・メール',channelNote:'SMSは使いません。',externalRequired:'ブラウザで受け取るには、連携済みのLINEまたはメールを1つ以上選択してください。',mall:'対象モール',frequency:'通知頻度',language:'通知言語',timing:'通知する時間',advance:'セール開始前にも知らせる',quietStart:'おやすみ開始',quietEnd:'おやすみ終了',privacy:'通知設定は会員IDに紐づけて保存します。',reset:'初期設定に戻す',save:'設定を保存',saved:'通知設定を保存しました。',login:'無料会員でログインすると設定できます。'},
  EN:{open:'Notification settings',title:'Notification settings',lead:'Sales are on by default. Choose how and what to receive.',info:'Updates to receive',channel:'Notification methods: App, LINE, Email',channelNote:'SMS is not used.',externalRequired:'To receive browser-user alerts, select at least one connected LINE or email destination.',mall:'Marketplaces',frequency:'Frequency',language:'Notification language',timing:'Delivery time',advance:'Notify me before sales start',quietStart:'Quiet hours start',quietEnd:'Quiet hours end',privacy:'Settings are stored with your member ID.',reset:'Restore defaults',save:'Save settings',saved:'Notification settings saved.',login:'Sign in as a free member to change settings.'},
  ZH:{open:'通知设置',title:'通知设置',lead:'默认只开启促销，并可选择通知方式。',info:'接收的信息',channel:'通知方式：应用、LINE、电子邮件',channelNote:'不使用短信。',externalRequired:'浏览器用户必须至少选择一个已连接的 LINE 或电子邮件地址。',mall:'目标商城',frequency:'通知频率',language:'通知语言',timing:'通知时间',advance:'促销开始前提醒',quietStart:'免打扰开始',quietEnd:'免打扰结束',privacy:'设置将与会员ID关联保存。',reset:'恢复默认',save:'保存设置',saved:'通知设置已保存。',login:'免费会员登录后可设置。'},
  KO:{open:'알림 설정',title:'알림 설정',lead:'세일만 기본 ON이며 알림 방법을 선택할 수 있습니다.',info:'받을 정보',channel:'알림 방법: 앱, LINE, 이메일',channelNote:'SMS는 사용하지 않습니다.',externalRequired:'브라우저에서 알림을 받으려면 연결된 LINE 또는 이메일을 하나 이상 선택하세요.',mall:'대상 쇼핑몰',frequency:'알림 빈도',language:'알림 언어',timing:'알림 시간',advance:'세일 시작 전에도 알림',quietStart:'방해 금지 시작',quietEnd:'방해 금지 종료',privacy:'설정은 회원 ID와 연결해 저장합니다.',reset:'기본값 복원',save:'설정 저장',saved:'알림 설정을 저장했습니다.',login:'무료 회원으로 로그인하면 설정할 수 있습니다.'}
};

const officialUpdates=[
  // Amazonだけtagを付けている。これが無いと、セール情報からAmazonへ何件
  // 送客しても適格販売にならない(2027-02-09までに3件が必要)。ここは/goを
  // 通らない静的リンクなので、サーバ側のdecorateAmazonAssociateDestinationが
  // 効かず、URLに直接持たせる必要がある。値がwrangler.jsoncの
  // AMAZON_ASSOCIATE_TAGと一致していることはtest/index.test.mjsで固定して
  // いるので、片方だけ古くなることはない。
  {marketplace_label:'Amazon',title:'公式セール・キャンペーン情報',summary:'Amazon公式のセール、タイムセール、キャンペーンを確認できます。',source_url:'https://www.amazon.co.jp/deals?tag=hoshilu00-22',official:true},
  {marketplace_label:'楽天市場',title:'公式キャンペーン情報',summary:'楽天市場公式のお得なキャンペーンやポイント情報を確認できます。',source_url:'https://event.rakuten.co.jp/incentive/client/',official:true},
  {marketplace_label:'Yahoo!ショッピング',title:'公式キャンペーン情報',summary:'Yahoo!ショッピング公式のセール、クーポン、ポイント情報を確認できます。',source_url:'https://shopping.yahoo.co.jp/promotion/campaign/',official:true},
  {marketplace_label:'Qoo10',title:'公式セール・特集情報',summary:'Qoo10公式のセール、クーポン、特集を確認できます。',source_url:'https://www.qoo10.jp/gmkt.inc/Events/Promotion.aspx',official:true},
  {marketplace_label:'SHEIN',title:'公式セール・新着情報',summary:'SHEIN公式のセール、新着商品、特集を確認できます。',source_url:'https://jp.shein.com/',official:true},
  {marketplace_label:'ZOZOTOWN',title:'公式ファッション情報',summary:'ZOZOTOWN公式のセール、新着、ショップ情報を確認できます。',source_url:'https://zozo.jp/',official:true},
  {marketplace_label:'ロフト',title:'公式セール・商品情報',summary:'ロフト公式のセール、新着、商品情報を確認できます。',source_url:'https://www.loft.co.jp/store/',official:true},
  {marketplace_label:'ハンズ',title:'公式セール・商品情報',summary:'ハンズ公式のセール、新着、商品情報を確認できます。',source_url:'https://hands.net/',official:true},
  {marketplace_label:'マツキヨココカラ',title:'公式セール・商品情報',summary:'マツキヨココカラ公式のセール、クーポン、商品情報を確認できます。',source_url:'https://www.matsukiyococokara-online.com/',official:true},
  {marketplace_label:'@cosme',title:'公式セール・商品情報',summary:'@cosme SHOPPING公式のセール、特集、商品情報を確認できます。',source_url:'https://www.cosme.com/',official:true},
  {marketplace_label:'ABC-MART',title:'公式セール・商品情報',summary:'ABC-MART公式のセール、新着、商品情報を確認できます。',source_url:'https://www.abc-mart.net/shop/',official:true},
  {marketplace_label:'BUYMA',title:'公式ファッション情報',summary:'BUYMA公式の特集、新着、ブランド情報を確認できます。',source_url:'https://www.buyma.com/',official:true}
  ,{marketplace_label:'SNKRDUNK',title:'公式スニーカー・ファッション情報',summary:'SNKRDUNK公式の新着、発売情報、鑑定付き商品を確認できます。',source_url:'https://snkrdunk.com/information/',official:true}
];
const officialCopy={
  JA:{title:'確認済みの最新情報はまだありません',summary:'HOSHILU内に掲載できる公式情報を確認中です。確認でき次第、内容と期間をここに表示します。',status:'未確認情報は掲載しません'},
  EN:{title:'No verified update is available yet',summary:'HOSHILU is checking official information. Details and dates will appear here after verification.',status:'Unverified information is not published'},
  ZH:{title:'暂无已验证的最新信息',summary:'HOSHILU 正在核实官方信息，确认后将在此显示内容与日期。',status:'不发布未经确认的信息'},
  KO:{title:'확인된 최신 정보가 아직 없습니다',summary:'HOSHILU가 공식 정보를 확인 중이며 확인 후 내용과 기간을 여기에 표시합니다.',status:'미확인 정보는 게시하지 않습니다'}
};

function language(){return document.querySelector('[data-language-select]')?.value||'JA';}
function date(value){return new Intl.DateTimeFormat(language()==='JA'?'ja-JP':language()==='KO'?'ko-KR':language()==='ZH'?'zh-CN':'en-US',{month:'short',day:'numeric'}).format(new Date(value));}
function dateTime(value){return new Intl.DateTimeFormat(language()==='JA'?'ja-JP':language()==='KO'?'ko-KR':language()==='ZH'?'zh-CN':'en-US',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));}

const ROW_PAGE_SIZE=8;
const moreCopy={JA:'もっと見る',EN:'Show more',ZH:'查看更多',KO:'더 보기'};
let visibleRowCount=ROW_PAGE_SIZE;

function sortedByNewest(items){
  return [...items].sort((a,b)=>{
    const left=new Date(a.updated_at||a.starts_at||0).getTime();
    const right=new Date(b.updated_at||b.starts_at||0).getTime();
    return right-left;
  });
}

function render(sales=[]){
  const rail=document.querySelector('#saleRail'); if(!rail)return;
  const t=copy[language()]||copy.JA;
  const officialText=officialCopy[language()]||officialCopy.JA;
  const covered=new Set(sales.map((sale)=>sale.marketplace_label));
  const items=sortedByNewest([...sales,...officialUpdates.filter((item)=>!covered.has(item.marketplace_label))]);
  const visible=items.slice(0,visibleRowCount);
  const rows=visible.map(sale=>{
    const row=document.createElement('a');
    row.className='info-row';
    row.href=sale.source_url;
    row.target='_blank';
    row.rel='noopener noreferrer';
    if(sale.official)row.classList.add('official-update');
    const label=document.createElement('span');
    label.className=`info-row-label info-row-label-${(sale.info_type||'SALE').toLowerCase()}`;
    label.textContent=sale.info_type||'SALE';
    const dateEl=document.createElement('time');
    dateEl.className='info-row-date';
    dateEl.textContent=sale.official?officialText.status:date(sale.updated_at||sale.starts_at||Date.now());
    const mall=document.createElement('span');
    mall.className='info-row-mall';
    mall.textContent=sale.marketplace_label;
    const title=document.createElement('span');
    title.className='info-row-title';
    title.textContent=sale.official?officialText.title:(sale.title||sale.summary||'');
    row.append(label,dateEl,mall,title);
    return row;
  });
  rail.replaceChildren(...rows);
  attachVerticalTicker(rail);
  const moreWrap=document.querySelector('#saleRailMore');
  if(moreWrap){
    moreWrap.replaceChildren();
    if(items.length>visibleRowCount){
      const button=document.createElement('button');
      button.type='button';
      button.className='info-row-more-button';
      button.textContent=moreCopy[language()]||moreCopy.JA;
      button.addEventListener('click',()=>{visibleRowCount+=ROW_PAGE_SIZE;render(sales);});
      moreWrap.append(button);
    }
  }
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
  const email=emailLinkCopy[language()]||emailLinkCopy.JA;
  const values={
    openNotificationSettings:t.open,notificationSettingsTitle:t.title,
    notificationSettingsLead:t.lead,settingsInfoLegend:t.info,settingsChannelLegend:t.channel,
    settingsChannelNote:t.channelNote,settingsMallLegend:t.mall,
    settingsFrequencyLabel:t.frequency,settingsLanguageLabel:t.language,
    settingsTimingLegend:t.timing,settingsAdvanceLabel:t.advance,
    settingsQuietStartLabel:t.quietStart,settingsQuietEndLabel:t.quietEnd,
    settingsPrivacyText:t.privacy,settingsReset:t.reset,settingsSave:t.save
  };
  Object.entries(values).forEach(([id,value])=>{const element=document.querySelector(`#${id}`);if(element)element.textContent=value;});
  document.querySelector('#settingsEmailLinkTitle').textContent=email.title;
  document.querySelector('#settingsEmailSend').textContent=email.send;
  document.querySelector('#settingsEmailVerify').textContent=email.verify;
  document.querySelector('#settingsEmailAddress').placeholder=email.address;
  document.querySelector('#settingsEmailCode').placeholder=email.code;
}

function checkboxGrid(root,rows,name,selected,available=null){
  root.replaceChildren(...rows.map(([value,label,description])=>{
    const wrapper=document.createElement('label');
    const input=document.createElement('input');input.type='checkbox';input.name=name;input.value=value;input.checked=selected.has(value);input.disabled=available instanceof Set&&!available.has(value);
    const copyWrap=document.createElement('span');const strong=document.createElement('strong');strong.textContent=label;copyWrap.append(strong);
    if(description){const small=document.createElement('small');small.textContent=description;copyWrap.append(small);}
    wrapper.append(input,copyWrap);return wrapper;
  }));
}

function selectedValues(name){return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(input=>input.value);}
function defaultPreference(){return{enabled:1,advance_notice:1,marketplaces:'ALL',info_types:'SALE',delivery_channels:'APP',frequency:'INSTANT',quiet_start:'21:00',quiet_end:'08:00',language:language()};}
function fillSettings(preference=defaultPreference(),availableChannels=['APP']){
  const selectedMalls=new Set(preference.marketplaces==='ALL'?marketplaces.map(([value])=>value):String(preference.marketplaces||'').split(','));
  const selectedTypes=new Set(preference.enabled===0?[]:String(preference.info_types||'SALE').split(','));
  checkboxGrid(document.querySelector('#settingsMarketplaces'),marketplaces,'marketplace',selectedMalls);
  checkboxGrid(document.querySelector('#settingsInfoTypes'),infoTypesLocalized[language()]||infoTypes,'infoType',selectedTypes);
  const selectedChannels=new Set(String(preference.delivery_channels||'APP').split(','));
  checkboxGrid(document.querySelector('#settingsChannels'),deliveryChannels[language()]||deliveryChannels.JA,'deliveryChannel',selectedChannels,new Set(availableChannels));
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
const settingsEmailStatus=document.querySelector('#settingsEmailStatus');
let memberPreference=null;
let availableDeliveryChannels=['APP'];
let sales=[];
renderCopy();
fetch('/api/sales').then(r=>r.ok?r.json():{sales:[]}).then(data=>{sales=data.sales||[];render(sales);}).catch(()=>render([]));
window.addEventListener('hoshilu:languagechange',()=>{renderCopy();render(sales);});
document.querySelector('[data-language-select]')?.addEventListener('change',()=>{renderCopy();render(sales);});
fetch('/api/member/sale-preferences',{cache:'no-store'}).then(async response=>{
  if(response.status===401){toggle.disabled=true;document.querySelector('#settingsSave').disabled=true;return;}
  const data=await response.json();memberPreference=data.preference||defaultPreference();availableDeliveryChannels=data.available_delivery_channels||['APP'];
  toggle.checked=Boolean(memberPreference.enabled)&&String(memberPreference.info_types||'SALE').split(',').includes('SALE');
  fillSettings(memberPreference,availableDeliveryChannels);
}).catch(()=>{toggle.disabled=true;});
toggle?.addEventListener('change',async()=>{
  const response=await fetch('/api/member/sale-preferences',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:toggle.checked,advance_notice:true})});
  if(!response.ok){toggle.checked=!toggle.checked;return;}
  const t=copy[language()]||copy.JA;status.dataset.untouched='false';status.textContent=toggle.checked?t.saved:t.off;
});
document.querySelector('#openNotificationSettings')?.addEventListener('click',()=>{
  fillSettings(memberPreference||defaultPreference(),availableDeliveryChannels);
  settingsStatus.textContent=memberPreference?'':(settingsCopy[language()]||settingsCopy.JA).login;
  settingsDialog.showModal();
});
document.querySelector('#notificationSettingsClose')?.addEventListener('click',()=>settingsDialog.close());
document.querySelector('#settingsReset')?.addEventListener('click',()=>fillSettings(defaultPreference(),availableDeliveryChannels));
document.querySelector('#settingsEmailSend')?.addEventListener('click',async()=>{
  const labels=emailLinkCopy[language()]||emailLinkCopy.JA;
  const email=document.querySelector('#settingsEmailAddress').value.trim();
  if(!email){settingsEmailStatus.textContent=labels.failed;return;}
  settingsEmailStatus.textContent=labels.sending;
  const response=await fetch('/api/member/email/request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email})});
  settingsEmailStatus.textContent=response.ok?labels.sent:labels.failed;
});
document.querySelector('#settingsEmailVerify')?.addEventListener('click',async()=>{
  const labels=emailLinkCopy[language()]||emailLinkCopy.JA;
  const email=document.querySelector('#settingsEmailAddress').value.trim();
  const code=document.querySelector('#settingsEmailCode').value.trim();
  if(!email||!/^\d{6}$/.test(code)){settingsEmailStatus.textContent=labels.failed;return;}
  const response=await fetch('/api/member/email/link',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,code})});
  if(!response.ok){settingsEmailStatus.textContent=labels.failed;return;}
  availableDeliveryChannels=[...new Set([...availableDeliveryChannels,'EMAIL'])];
  fillSettings(memberPreference||defaultPreference(),availableDeliveryChannels);
  const emailChoice=document.querySelector('input[name="deliveryChannel"][value="EMAIL"]');if(emailChoice)emailChoice.checked=true;
  settingsEmailStatus.textContent=labels.linked;
});
document.querySelector('#notificationSettingsForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const types=selectedValues('infoType');
  const malls=selectedValues('marketplace');
  const channels=selectedValues('deliveryChannel');
  const installed=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  if(!installed&&!channels.some((value)=>value==='LINE'||value==='EMAIL')){
    settingsStatus.textContent=(settingsCopy[language()]||settingsCopy.JA).externalRequired;
    return;
  }
  if(channels.includes('APP')&&'Notification'in window&&Notification.permission==='default')await Notification.requestPermission();
  const payload={
    enabled:types.length>0,advance_notice:document.querySelector('#settingsAdvance').checked,
    info_types:types,marketplaces:malls,delivery_channels:channels,frequency:document.querySelector('#settingsFrequency').value,
    language:document.querySelector('#settingsLanguage').value,
    quiet_start:document.querySelector('#settingsQuietStart').value,
    quiet_end:document.querySelector('#settingsQuietEnd').value
  };
  const response=await fetch('/api/member/sale-preferences',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  if(!response.ok){settingsStatus.textContent=(settingsCopy[language()]||settingsCopy.JA).login;return;}
  const data=await response.json();memberPreference=data.preference;availableDeliveryChannels=data.available_delivery_channels||availableDeliveryChannels;
  toggle.checked=Boolean(memberPreference.enabled)&&String(memberPreference.info_types||'').split(',').includes('SALE');
  settingsStatus.textContent=(settingsCopy[language()]||settingsCopy.JA).saved;
  settingsDialog.close();
});
