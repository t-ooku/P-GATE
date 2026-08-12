import { campaignContext } from './campaign-attribution.mjs';
import { buildMarketplaceSearchKeywords } from './marketplace-search-keywords-v2.mjs';
import { RESULT_ROW_LIMIT, resultRowCopyFor, splitCandidateRows } from './result-rows.mjs';
import { localizedWishLabel } from './wish-localization.mjs';
import { safeDiscoverySearchQuery, socialDiscoverySearchLinks, swippittDiscoveryMatch, gmailShareLink } from './discovery-actions.mjs';
import { attachVerticalTicker, detachVerticalTicker } from './vertical-ticker.mjs';
import { createRankingConfirmationFlow, currentRankingCategoryProposal, rejectRankingCategoryProposal } from './ranking-confirmation-flow.mjs';
const copy = {
  JA: { hero:'商品名が分からなくても、|欲しい物を探せる。', userView:'ユーザー体験', sellerView:'セラー体験', languageLabel:'表示言語', title:'商品名が分からなくても、うまく説明できなくても大丈夫。\n見た目、見た場所、使い方。覚えていることから話してください。', titleSummary:'使い方を見る', placeholder:'例：インスタで見た、ピンクで小さいカメラみたいなもの', consent:'質問の処理と匿名の利用状況計測に同意します。質問本文はサーバーログへ保存しません。', submit:'一緒に見つける', results:'ホシルからの提案', loading:'候補を探しています…', buy:'販売ページで確認', total:'合計', shipping:'送料', delivery:'配送目安', days:'日', error:'現在検索できません。入力内容または通信状態を確認して、もう一度お試しください。', examples:['TikTokで見た光るスマホケース','推し活で使える小さな写真プリンター','韓国っぽい透明のワイヤレスイヤホン'], wish:'この条件で新着を通知', wishSaved:'新着通知を設定しました', emptyWish:'新着通知を設定した検索条件はまだありません。', filteredEmptyWish:'一致する保存条件はありません。', wishTitle:'保存した検索条件', wishDescription:'お気に入りではありません。\n保存した検索条件に新しく一致する商品が見つかったらお知らせします。', watchSavedStatus:'AIウォッチ中', watchTitle:'AIウォッチ', watchDescription:'AIがこの商品の価格・在庫・クーポンを24時間監視します。', watchLabels:['値下げ','クーポン','再入荷','販売開始'], sellerTitle:'欲しいを、|売上機会に。', sellerDescription:'米国Amazon仕入れの並行輸入商品を、在日外国人と米国商品を探す日本人へ届けます。' },
  EN: { hero:'What are you |looking for today?', userView:'Shopper', sellerView:'Seller', languageLabel:'Language', title:'You do not need to know the product name.\nAppearance, where you saw it, and how it is used. Tell us whatever you remember.', titleSummary:'How it works', placeholder:'Example: a small US car part whose name I do not know in Japanese', consent:'I consent to processing my question and anonymous usage measurement. The raw question is not stored in server logs.', submit:'Find it with me', results:'Suggestions from HOSHILU', loading:'Looking for matches…', buy:'View product page', total:'Total', shipping:'Shipping', delivery:'Delivery estimate', days:'days', error:'Search is unavailable. Check your input or connection and try again.', examples:['a US-exclusive collectible figure','a small US appliance that works in Japan','a small car part whose name I forgot'], wish:'Notify me of new matches', wishSaved:'Notifications set', emptyWish:'No saved search conditions with notifications yet.', filteredEmptyWish:'No saved conditions match your search.', wishTitle:'Saved search conditions', wishDescription:'This is not a favorites list.\nWe will let you know when a new product matches a condition you saved.', watchSavedStatus:'AI Watch on', watchTitle:'AI Watch', watchDescription:'AI monitors this product’s price, stock, and coupons around the clock.', watchLabels:['Price drop','Coupon','Restock','Available'], sellerTitle:'Turn demand into |sales opportunities.', sellerDescription:'Connect US Amazon imports with international residents in Japan and Japanese shoppers seeking American products.' },
  ZH: { hero:'今天，您想找|什么？', userView:'买家体验', sellerView:'卖家体验', languageLabel:'显示语言', title:'不知道商品名称也没关系。\n外观、看到它的地方、用途。请告诉我们您记得的内容。', titleSummary:'查看使用方法', placeholder:'例如：不知道日语名称的美国小型汽车零件', consent:'我同意处理问题并进行匿名使用情况统计。问题原文不会保存到服务器日志。', submit:'一起寻找', results:'HOSHILU 的推荐', loading:'正在寻找候选商品…', buy:'前往销售页面确认', total:'合计', shipping:'运费', delivery:'配送预计', days:'天', error:'目前无法搜索。请确认输入或网络后重试。', examples:['美国限定收藏手办','可在日本使用的美国小家电','忘记名称的小型汽车零件'], wish:'为此条件开启新品提醒', wishSaved:'已设置新品提醒', emptyWish:'还没有设置新品提醒的搜索条件。', filteredEmptyWish:'没有符合条件的保存条件。', wishTitle:'已保存的搜索条件', wishDescription:'这不是收藏夹。\n当有新商品符合您保存的搜索条件时，我们会通知您。', watchSavedStatus:'AI监控中', watchTitle:'AI监控', watchDescription:'AI将24小时监控该商品的价格、库存和优惠券。', watchLabels:['降价','优惠券','补货','开售'], sellerTitle:'把需求变成|销售机会。', sellerDescription:'将美国亚马逊进口商品带给在日外国人及寻找美国商品的日本消费者。' },
  KO: { hero:'오늘은 무엇을|찾고 있나요?', userView:'구매자', sellerView:'판매자', languageLabel:'표시 언어', title:'상품명을 몰라도 괜찮습니다.\n생김새, 본 장소, 사용법. 기억나는 것을 말해 주세요.', titleSummary:'사용법 보기', placeholder:'예: 일본어 이름을 모르는 미국산 소형 자동차 부품', consent:'질문 처리와 익명 이용 통계에 동의합니다. 질문 원문은 서버 로그에 저장하지 않습니다.', submit:'함께 찾기', results:'HOSHILU 추천', loading:'후보를 찾고 있습니다…', buy:'판매 페이지에서 확인', total:'합계', shipping:'배송비', delivery:'배송 예상', days:'일', error:'현재 검색할 수 없습니다. 입력이나 연결 상태를 확인하고 다시 시도해 주세요.', examples:['미국 한정 피규어','일본에서 쓸 수 있는 미국 소형 가전','이름을 잊은 작은 자동차 부품'], wish:'이 조건으로 새 상품 알림 받기', wishSaved:'새 상품 알림을 설정했습니다', emptyWish:'새 상품 알림을 설정한 검색 조건이 아직 없습니다.', filteredEmptyWish:'검색과 일치하는 저장된 조건이 없습니다.', wishTitle:'저장한 검색 조건', wishDescription:'즐겨찾기가 아닙니다.\n저장한 검색 조건에 새로 일치하는 상품을 찾으면 알려드립니다.', watchSavedStatus:'AI 워치 중', watchTitle:'AI 워치', watchDescription:'AI가 이 상품의 가격·재고·쿠폰을 24시간 지켜봅니다.', watchLabels:['가격 인하','쿠폰','재입고','판매 시작'], sellerTitle:'원하는 마음을|판매 기회로.', sellerDescription:'미국 Amazon 병행수입 상품을 일본 거주 외국인과 미국 상품을 찾는 일본인에게 연결합니다.' }
};

const actionCopy = {
  JA:{advancedSearch:'詳細検索',advancedSearchClose:'詳細検索を閉じる',deleteWishAria:'この検索条件を削除',deleteAllWishes:'すべて削除',deleteAllConfirm:'保存した検索条件をすべて削除しますか？この操作は取り消せません。',clear:'クリア',searchAgain:'もう一度検索',updateWish:'変更を保存',updated:'変更を保存しました',deleteWish:'削除',deleteConfirm:'この検索条件の新着通知を解除しますか？',insightTitle:'保存した検索条件を振り返る。',insightTemplate:'保存した検索条件 {count}件、新着通知オン {enabled}件。',saveWish:'この検索条件を保存',wishSaved:'新着通知を設定しました',insightToggleLabel:'この条件で新着を通知',insightToggleDescription:'この検索条件に合う商品が新しく見つかったらお知らせします。',saveWatch:'この条件でAIウォッチ',watchSaved:'AIウォッチを保存しました',bundleNote:'AIがこの商品の価格・在庫・クーポンを24時間監視します。',discoveryTitle:'名前が分からなくても、\n記憶から探せる。',discoveryBody:'見た目、見た場所、使い方。覚えていることから話してください。',discoveryExample:'SNSで見た、ピンクの小さいカメラみたいなもの',journey:['検索する前に、|ホシルに話す。','曖昧な「欲しい」を、|見つかる検索へ変換します。','思い出せるまま話す','名前が分からなくても、見た目・用途・見た場所だけで大丈夫。','検索条件を精密化','ホシルが商品カテゴリや特徴を整理し、探せる言葉へ変換。','購入先まで案内','商品ページへ直接リンク。HOSHILUがまとめて比較する2モールに加え、最大13モールで探せます。'],copyKeywords:'検索ワードをコピー',copiedKeywords:'コピーしました'},
  EN:{advancedSearch:'Advanced search',advancedSearchClose:'Close advanced search',deleteWishAria:'Delete this saved condition',deleteAllWishes:'Delete all',deleteAllConfirm:'Delete every saved search condition? This cannot be undone.',clear:'Clear',searchAgain:'Search again',updateWish:'Save changes',updated:'Changes saved',deleteWish:'Delete',deleteConfirm:'Turn off new-match notifications for this condition?',insightTitle:'Review your saved search conditions.',insightTemplate:'{count} saved conditions, {enabled} with notifications on.',saveWish:'Save this search condition',wishSaved:'Notifications set',insightToggleLabel:'Notify me of new matches',insightToggleDescription:'We will let you know when a new product matches this search condition.',saveWatch:'Save these AI Watch settings',watchSaved:'AI Watch settings saved',bundleNote:'AI monitors this product’s price, stock, and coupons around the clock.',discoveryTitle:'Find it from what you remember—\neven without the name.',discoveryBody:'Appearance, where you saw it, and how it is used. Tell us whatever you remember.',discoveryExample:'A small pink camera-like thing I saw on social media',journey:['Talk to HOSHILU before you search.','Turn a vague want into a search that finds it.','Describe what you remember','A look, a use, or where you saw it is enough.','Sharpen the search','HOSHILU turns clues into product categories and precise terms.','Continue to purchase','Link directly to product pages. HOSHILU compares 2 marketplaces together, plus up to 13 in total.'],copyKeywords:'Copy search terms',copiedKeywords:'Copied'},
  ZH:{advancedSearch:'详细搜索',advancedSearchClose:'关闭详细搜索',deleteWishAria:'删除此保存条件',deleteAllWishes:'全部删除',deleteAllConfirm:'要删除所有已保存的搜索条件吗？此操作无法撤销。',clear:'清空',searchAgain:'再次搜索',updateWish:'保存更改',updated:'更改已保存',deleteWish:'删除',deleteConfirm:'要关闭此条件的新品提醒吗？',insightTitle:'回顾已保存的搜索条件。',insightTemplate:'已保存条件 {count} 项，已开启新品提醒 {enabled} 项。',saveWish:'保存此搜索条件',wishSaved:'已设置新品提醒',insightToggleLabel:'为此条件开启新品提醒',insightToggleDescription:'当有新商品符合此搜索条件时，我们会通知您。',saveWatch:'保存AI监控条件',watchSaved:'AI监控条件已保存',bundleNote:'AI将24小时监控该商品的价格、库存和优惠券。',discoveryTitle:'不知道名字，\n也能从记忆中寻找。',discoveryBody:'外观、看到它的地方、用途。请告诉我们您记得的内容。',discoveryExample:'在社交媒体上看到的粉色小相机一样的东西',journey:['搜索之前，先告诉 HOSHILU。','把模糊的“想要”变成更容易找到的搜索。','说出记得的线索','不知道名称也没关系，外观、用途或看到的地方即可。','优化搜索条件','HOSHILU 将线索整理为商品类别和准确关键词。','引导至购买页面','直接链接商品页面。HOSHILU可整合比较2个商城，最多可在13个商城查找。'],copyKeywords:'复制搜索词',copiedKeywords:'已复制'},
  KO:{advancedSearch:'상세 검색',advancedSearchClose:'상세 검색 닫기',deleteWishAria:'이 저장된 조건 삭제',deleteAllWishes:'전체 삭제',deleteAllConfirm:'저장한 검색 조건을 모두 삭제할까요? 되돌릴 수 없습니다.',clear:'전체 삭제',searchAgain:'다시 검색',updateWish:'변경 저장',updated:'변경을 저장했습니다',deleteWish:'삭제',deleteConfirm:'이 조건의 새 상품 알림을 해제할까요?',insightTitle:'저장한 검색 조건을 돌아보기.',insightTemplate:'저장한 조건 {count}건, 새 상품 알림 켬 {enabled}건.',saveWish:'이 검색 조건 저장',wishSaved:'새 상품 알림을 설정했습니다',insightToggleLabel:'이 조건으로 새 상품 알림 받기',insightToggleDescription:'이 검색 조건에 맞는 상품을 새로 찾으면 알려드립니다.',saveWatch:'이 조건으로 AI 워치',watchSaved:'AI 워치 설정을 저장했습니다',bundleNote:'AI가 이 상품의 가격·재고·쿠폰을 24시간 지켜봅니다.',discoveryTitle:'이름을 몰라도,\n기억에서 찾을 수 있어요.',discoveryBody:'생김새, 본 장소, 사용법. 기억나는 것을 말해 주세요.',discoveryExample:'SNS에서 본 분홍색 작은 카메라 같은 것',journey:['검색하기 전에 HOSHILU에게 말하세요.','막연한 원하는 것을 찾을 수 있는 검색으로 바꿉니다.','기억나는 대로 말하기','이름을 몰라도 생김새, 용도, 본 장소만으로 충분합니다.','검색 조건 정밀화','HOSHILU가 단서를 상품 분류와 정확한 검색어로 바꿉니다.','구매처까지 안내','상품 페이지로 바로 연결합니다. HOSHILU가 함께 비교하는 2개 쇼핑몰을 포함해 최대 13개 쇼핑몰에서 찾을 수 있습니다.'],copyKeywords:'검색어 복사',copiedKeywords:'복사했습니다'}
};

const navigationCopy = {
  JA:{eyebrow:'欲しいを、ちゃんと見つける。',features:['ホシル検索','AIウォッチ'],account:'マイページ',candidateAmazon:'Amazonでこの商品を探す'},
  EN:{eyebrow:'Find what you really want.',features:['HOSHILU Search','AI Watch'],account:'My page',candidateAmazon:'Find this product on Amazon'},
  ZH:{eyebrow:'找到真正想要的商品。',features:['HOSHILU 搜索','AI监控'],account:'我的页面',candidateAmazon:'在 Amazon 查找此商品'},
  KO:{eyebrow:'원하는 것을 제대로 찾기.',features:['HOSHILU 검색','AI 워치'],account:'마이페이지',candidateAmazon:'Amazon에서 이 상품 찾기'}
};
const searchModeCopy={
  JA:{step:'検索方法',identify:'AIに確認して探す',direct:'すぐ検索',identifySubmit:'AIに商品を聞く',directSubmit:'すぐ検索'},
  EN:{step:'Search mode',identify:'Confirm with AI',direct:'Search now',identifySubmit:'Ask AI which product',directSubmit:'Search now'},
  ZH:{step:'搜索方式',identify:'先让 AI 确认',direct:'立即搜索',identifySubmit:'询问 AI 商品',directSubmit:'立即搜索'},
  KO:{step:'검색 방법',identify:'AI 확인 후 찾기',direct:'바로 검색',identifySubmit:'AI에게 상품 묻기',directSubmit:'바로 검색'}
};
const journeyStep4Copy={JA:['見つからなければSNSやAIでも探せる','Instagram・X・TikTok・YouTubeでも同じ条件を横断して探せます。'],EN:['Search social platforms too','If marketplaces do not have it, continue the same search on Instagram, X, TikTok, and YouTube.'],ZH:['找不到时也搜索社交平台','如果商城里没有，可用相同条件继续搜索 Instagram、X、TikTok 和 YouTube。'],KO:['찾지 못하면 SNS에서도 검색','쇼핑몰에 없다면 같은 조건으로 Instagram, X, TikTok, YouTube에서도 계속 검색할 수 있습니다.']};
const wishSearchCopy={JA:'保存した「欲しい」を検索',EN:'Search saved wants',ZH:'搜索已保存的心愿',KO:'저장한 원하는 것 검색'};
// v4.2 項目10・11: 検索履歴の個別削除(×)・全削除。ローカル保存のみ(サーバー
// 同期なし)なので、削除はlocalStorageから消すだけでよく、ページ更新しても
// 復活しない。
const searchHistoryCopy={
  JA:{title:'検索履歴',deleteAll:'すべて削除',deleteAllConfirm:'検索履歴をすべて削除しますか？この操作は取り消せません。',rowDeleteAria:'この検索履歴を削除'},
  EN:{title:'Search history',deleteAll:'Delete all',deleteAllConfirm:'Delete your entire search history? This cannot be undone.',rowDeleteAria:'Delete this search history entry'},
  ZH:{title:'搜索历史',deleteAll:'全部删除',deleteAllConfirm:'要删除全部搜索历史吗？此操作无法撤销。',rowDeleteAria:'删除此搜索历史'},
  KO:{title:'검색 기록',deleteAll:'전체 삭제',deleteAllConfirm:'검색 기록을 모두 삭제할까요? 되돌릴 수 없습니다.',rowDeleteAria:'이 검색 기록 삭제'}
};
const shareCopy={
  JA:{title:'HOSHILUで探した',button:'他アプリでシェア',copy:'リンクをコピー',gmail:'Gmailで送る',include:'検索内容も投稿に含める',privacy:'初期状態では検索内容を共有しません。',tag:'#ホシルで見つけた',prefix:'HOSHILUで探しました：',copied:'投稿文とHOSHILUリンクをコピーしました'},
  EN:{title:'Found with HOSHILU',button:'Share with another app',copy:'Copy link',gmail:'Send with Gmail',include:'Include my search in the post',privacy:'Your search is not shared by default.',tag:'#FoundWithHOSHILU',prefix:'I searched with HOSHILU: ',copied:'Post text and HOSHILU link copied'},
  ZH:{title:'用 HOSHILU 找到',button:'用其他应用分享',copy:'复制链接',gmail:'用 Gmail 发送',include:'在帖子中包含搜索内容',privacy:'默认不会分享您的搜索内容。',tag:'#用HOSHILU找到',prefix:'我用 HOSHILU 搜索了：',copied:'已复制文字和 HOSHILU 链接'},
  KO:{title:'HOSHILU로 찾았어요',button:'다른 앱으로 공유',copy:'링크 복사',gmail:'Gmail로 보내기',include:'검색 내용도 게시물에 포함',privacy:'기본 상태에서는 검색 내용을 공유하지 않습니다.',tag:'#HOSHILU로찾음',prefix:'HOSHILU로 검색했어요: ',copied:'게시 문구와 HOSHILU 링크를 복사했습니다'}
};

const $ = (selector) => document.querySelector(selector);
const elements = { form:$('#knowledgeForm'), query:$('#query'), consent:$('#consent'), language:$('#languageSelect'), languageLabel:$('#languageLabel'), heroTitle:$('#heroTitle'), heroEyebrow:$('#heroEyebrow'), searchStep:$('#searchStep'), searchTitle:$('#searchTitle'), searchTitleSummary:$('#searchTitleSummary'), consentText:$('#consentText'), submitText:$('#submitText'), submit:$('#submitButton'), searchModeSwitch:$('#searchModeSwitch'), searchModeIdentify:$('#searchModeIdentify'), searchModeDirect:$('#searchModeDirect'), rankingButton:$('#rankingSearchButton'), rankingDialog:$('#rankingDialog'), rankingModes:$('#rankingModeList'), rankingStatus:$('#rankingStatus'), rankingResults:$('#rankingResults'), status:$('#status'), quick:$('#quickQueries'), searchHistorySection:$('#searchHistorySection'), searchHistoryTitle:$('#searchHistoryTitle'), searchHistoryList:$('#searchHistoryList'), deleteAllSearchHistory:$('#deleteAllSearchHistory'), results:$('#resultsSection'), resultsTitle:$('#resultsTitle'), message:$('#resultMessage'), cards:$('#resultCards'), turnstile:$('#turnstileContainer'), install:$('#installButton'), wishList:$('#wishList'), wishTitle:$('#wishTitle'), wishDescription:$('#wishDescription'), wishFilter:$('#wishFilter'), clear:$('#clearQuery'), memberLink:$('#memberLink'), memberLogout:$('#memberLogout'), insightTitle:$('#insightTitle'), insightSummary:$('#insightSummary'), discoveryTitle:$('#discoveryTitle'), discoveryBody:$('#discoveryBody'), discoveryExample:$('#discoveryExample'), journey:[$('#journeyTitle'),$('#journeyLead'),$('#journeyStep1Title'),$('#journeyStep1Body'),$('#journeyStep2Title'),$('#journeyStep2Body'),$('#journeyStep3Title'),$('#journeyStep3Body')] };
let turnstileWidget = null; let lastIssuedTurnstileToken=''; let installPrompt = null; let memberSession = null; let memberWishRecords = []; let searchAttempt=0; let searchRoot=''; let rankingCategorySelection=null; let rankingConfirmationFlow=null; let rankingRequestSequence=0; const sessionId = getSessionId();

const installCopy = {
  JA: ['iPhone / iPad：Safariの共有ボタンを押し、「ホーム画面に追加」を選びます。','Android：Chromeのメニューから「アプリをインストール」または「ホーム画面に追加」を選びます。','PC：Chrome / Edgeのアドレスバー右側にあるインストールアイコンを押します。'],
  EN: ['iPhone / iPad: In Safari, tap Share, then Add to Home Screen.','Android: In Chrome, choose Install app or Add to Home screen.','PC: In Chrome or Edge, select the install icon in the address bar.'],
  ZH: ['iPhone / iPad：在 Safari 中点击共享，然后选择“添加到主屏幕”。','Android：在 Chrome 菜单中选择“安装应用”或“添加到主屏幕”。','PC：点击 Chrome / Edge 地址栏右侧的安装图标。'],
  KO: ['iPhone / iPad: Safari에서 공유를 누른 뒤 홈 화면에 추가를 선택하세요.','Android: Chrome 메뉴에서 앱 설치 또는 홈 화면에 추가를 선택하세요.','PC: Chrome / Edge 주소창 오른쪽의 설치 아이콘을 선택하세요.']
};

function getSessionId(){ const key='mygate_session_id'; const current=localStorage.getItem(key); if(current&&/^[A-Za-z0-9_-]{16,100}$/.test(current))return current; const value=crypto.randomUUID().replaceAll('-',''); localStorage.setItem(key,value); return value; }
function selectedCopy(){ return copy[elements.language.value]||copy.JA; }
function splitEmphasis(value){ const [plain,accent='']=value.split('|'); const fragment=document.createDocumentFragment(); fragment.append(plain); if(accent){const span=document.createElement('span');span.textContent=accent;fragment.append(span);} return fragment; }
function splitLines(value){return String(value||'').split('|').map(line=>textElement('span','',line));}
function currentSearchMode(){return elements.searchModeSwitch?.dataset.mode==='direct'?'direct':'identify';}
function isUsableProductQuery(value){const query=String(value||'').normalize('NFKC').trim();return query.length>=2||/^[\p{Script=Han}\p{Script=Katakana}]$/u.test(query);}
function setSearchMode(mode,persist=true){const value=mode==='direct'?'direct':'identify';const labels=searchModeCopy[elements.language.value]||searchModeCopy.JA;elements.searchModeSwitch.dataset.mode=value;elements.searchModeIdentify.classList.toggle('active',value==='identify');elements.searchModeDirect.classList.toggle('active',value==='direct');elements.searchModeIdentify.setAttribute('aria-pressed',String(value==='identify'));elements.searchModeDirect.setAttribute('aria-pressed',String(value==='direct'));elements.submitText.textContent=value==='identify'?labels.identifySubmit:labels.directSubmit;if(persist)localStorage.setItem('hoshilu_search_mode',value);}
function setLanguage(language){ const t=copy[language]||copy.JA; const nav=navigationCopy[language]||navigationCopy.JA; const modes=searchModeCopy[language]||searchModeCopy.JA; window.HoshiluI18n?.apply(language); document.documentElement.lang={JA:'ja',EN:'en',ZH:'zh-CN',KO:'ko'}[language]||'ja'; localStorage.setItem('mygate_language',language); elements.language.value=language; elements.heroTitle.replaceChildren(splitEmphasis(t.hero)); elements.heroEyebrow.textContent=nav.eyebrow; elements.languageLabel.textContent=t.languageLabel; elements.searchModeSwitch.setAttribute('aria-label',modes.step);elements.searchModeIdentify.textContent=modes.identify;elements.searchModeDirect.textContent=modes.direct;elements.searchStep.textContent=modes.step; elements.searchTitleSummary.textContent=t.titleSummary; elements.searchTitle.replaceChildren(...t.title.split('\n').map(line=>{ const span=document.createElement('span'); span.textContent=line; return span; })); elements.query.placeholder=t.placeholder; elements.consentText.textContent=t.consent; elements.resultsTitle.textContent=t.results; elements.wishTitle.textContent=t.wishTitle; elements.wishDescription.replaceChildren(...t.wishDescription.split('\n').map(line=>{const span=document.createElement('span');span.textContent=line;return span;})); const actions=actionCopy[language]||actionCopy.JA; elements.clear.setAttribute('aria-label',actions.clear); elements.clear.textContent=actions.clear; elements.discoveryTitle.replaceChildren(...actions.discoveryTitle.split('\n').map(line=>{const span=document.createElement('span');span.textContent=line;return span;})); elements.discoveryBody.textContent=actions.discoveryBody; elements.discoveryExample.textContent=actions.discoveryExample; elements.journey.forEach((node,index)=>{node.replaceChildren(...(index<2?splitLines(actions.journey[index]):[document.createTextNode(actions.journey[index])]));}); elements.quick.replaceChildren(...t.examples.map(example=>{ const b=document.createElement('button'); b.type='button'; b.className='chip'; b.textContent=example; b.addEventListener('click',()=>{elements.query.value=example;elements.query.focus();}); return b; })); setSearchMode(currentSearchMode(),false);renderWishes(); }
const baseSetLanguage=setLanguage;setLanguage=function(language){baseSetLanguage(language);renderQuickExamples(language);renderSearchHistory();};
document.addEventListener('hoshilu:languagechange',event=>{const step4=journeyStep4Copy[event.detail?.language]||journeyStep4Copy.JA;$('#journeyStep4Title').textContent=step4[0];$('#journeyStep4Body').textContent=step4[1];});
function textElement(tag,className,text){ const node=document.createElement(tag); if(className)node.className=className; node.textContent=String(text||''); return node; }
// v4.2 項目14: SHOPLIST_JP/MUSINSA_JPは新規検索導線には出なくなったが、既存
// のAIウォッチ・注文履歴等に保存済みのデータを表示する際に必要なため表示名
// は残す。LOFT_JP以降が今回追加した5モール。
function marketplaceLabel(value){ return {AMAZON_JP:'Amazon',RAKUTEN_JP:'楽天市場',QOO10_JP:'Qoo10',SHEIN_JP:'SHEIN',ZOZOTOWN_JP:'ZOZOTOWN',SHOPLIST_JP:'SHOPLIST',MUSINSA_JP:'MUSINSA',BUYMA_JP:'BUYMA',SNKRDUNK_JP:'SNKRDUNK',YAHOO_JP:'Yahoo!ショッピング',LOFT_JP:'ロフト',HANDS_JP:'ハンズ',MATSUKIYO_JP:'マツキヨココカラ',COSME_JP:'@cosme',ABCMART_JP:'ABC-MART'}[value]||String(value||''); }
function priorityListingBadge(offer,language){if(offer?.priority_listing!==true)return null;return textElement('span','priority-listing-badge',language==='EN'?'Priority listing':language==='ZH'?'优先刊登':language==='KO'?'우선 노출':'優先出品');}
function formatMoney(value,currency,language){ const number=Number(value||0); if(!Number.isFinite(number)||number<=0)return''; try{return new Intl.NumberFormat({JA:'ja-JP',EN:'en-US',ZH:'zh-CN',KO:'ko-KR'}[language]||'ja-JP',{style:'currency',currency:currency||'JPY',maximumFractionDigits:0}).format(number);}catch{return`${currency||'JPY'} ${Math.round(number).toLocaleString()}`;} }
function offerDetail(offer,t,language){ if(!offer)return''; const total=formatMoney(offer.total_cost,offer.currency,language); const shipping=Number(offer.shipping_fee||0)>0?formatMoney(offer.shipping_fee,offer.currency,language):''; const delivery=Number(offer.delivery_days||0)>0?`${t.delivery} ${Number(offer.delivery_days)}${t.days}`:''; return[marketplaceLabel(offer.marketplace),total?`${t.total} ${total}`:'',shipping?`${t.shipping} ${shipping}`:'',delivery].filter(Boolean).join(' · '); }
function getWishes(){try{const value=JSON.parse(localStorage.getItem('mygate_wishes')||'[]');return Array.isArray(value)?value.filter(item=>typeof item==='string'&&item.trim()):[];}catch{return[];}}
function setWishes(values){localStorage.setItem('mygate_wishes',JSON.stringify(values.slice(0,100)));}
function getSearchHistory(){try{const value=JSON.parse(localStorage.getItem('hoshilu_member_search_history')||'[]');return Array.isArray(value)?value.filter(item=>typeof item==='string'&&item.trim()).slice(0,20):[];}catch{return[];}}
function rememberMemberSearch(query){if(!memberSession)return;const value=String(query||'').trim().slice(0,180);if(!value)return;const history=[value,...getSearchHistory().filter(item=>item!==value)].slice(0,20);localStorage.setItem('hoshilu_member_search_history',JSON.stringify(history));updateDiscoveryExample();renderQuickExamples();renderSearchHistory();}
// v4.2 項目10・11: 検索履歴の個別削除・全削除。hoshilu_member_search_history
// はサーバー同期を持たないlocalStorage専用のキーなので(syncMemberWishesの
// ようなAPI往復が無い)、ここで削除すればページ更新後も復活しない。
function setSearchHistory(values){localStorage.setItem('hoshilu_member_search_history',JSON.stringify(values.slice(0,20)));}
function deleteSearchHistoryEntry(value){setSearchHistory(getSearchHistory().filter(item=>item!==value));updateDiscoveryExample();renderQuickExamples();renderSearchHistory();}
function deleteAllSearchHistory(){const history=getSearchHistory();if(!history.length)return;const t=searchHistoryCopy[elements.language.value]||searchHistoryCopy.JA;if(!confirm(t.deleteAllConfirm))return;localStorage.removeItem('hoshilu_member_search_history');updateDiscoveryExample();renderQuickExamples();renderSearchHistory();}
function searchHistoryRowDeleteButton(value,t){const button=document.createElement('button');button.type='button';button.className='search-history-row-delete';button.textContent='×';button.setAttribute('aria-label',`${t.rowDeleteAria}: ${value}`);button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();deleteSearchHistoryEntry(value);});return button;}
function searchHistoryRow(value,t){const row=document.createElement('li');row.className='search-history-row';const apply=document.createElement('button');apply.type='button';apply.className='search-history-apply';apply.textContent=value;apply.title=value;apply.addEventListener('click',()=>{elements.query.value=value;elements.clear.classList.remove('hidden');focusSearch();});row.append(apply,searchHistoryRowDeleteButton(value,t));return row;}
function renderSearchHistory(){if(!elements.searchHistorySection)return;const t=searchHistoryCopy[elements.language.value]||searchHistoryCopy.JA;if(elements.searchHistoryTitle)elements.searchHistoryTitle.textContent=t.title;if(elements.deleteAllSearchHistory)elements.deleteAllSearchHistory.textContent=t.deleteAll;const history=memberSession?getSearchHistory():[];elements.searchHistorySection.classList.toggle('hidden',!history.length);if(elements.deleteAllSearchHistory){elements.deleteAllSearchHistory.classList.toggle('hidden',!history.length);elements.deleteAllSearchHistory.onclick=deleteAllSearchHistory;}if(elements.searchHistoryList){elements.searchHistoryList.replaceChildren(...history.map(value=>searchHistoryRow(value,t)));attachVerticalTicker(elements.searchHistoryList,{intervalMs:4200});}}
const discoveryIdeas=[
  {match:/camera|photo|写真|カメラ|撮影|相机|照片|카메라|사진/i,JA:'スマホの写真をその場で印刷できる、手のひらサイズのもの',EN:'A palm-sized thing that prints phone photos on the spot',ZH:'可以现场打印手机照片的掌上小物',KO:'스마트폰 사진을 바로 인쇄하는 손바닥 크기의 물건'},
  {match:/推し|アイドル|figure|collect|フィギュア|收藏|偶像|피규어|덕질/i,JA:'推しのグッズを光らせて飾れる、透明な小さいケース',EN:'A small clear case that lights up collectibles on display',ZH:'可以发光展示收藏品的小型透明盒',KO:'최애 굿즈를 빛나게 전시하는 작은 투명 케이스'},
  {match:/beauty|makeup|skin|美容|メイク|化粧|美妆|护肤|뷰티|메이크업/i,JA:'外出先で髪やメイクを直せる、充電式の小さいもの',EN:'A small rechargeable thing for fixing hair or makeup on the go',ZH:'外出时可整理头发或补妆的充电式小物',KO:'외출 중 머리나 메이크업을 고치는 충전식 작은 물건'},
  {match:/car|車|ドライブ|汽车|车载|자동차|차량/i,JA:'車内をすっきり使える、取り付けが簡単な収納グッズ',EN:'An easy-to-install organizer that keeps a car tidy',ZH:'安装简单、让车内更整洁的收纳用品',KO:'설치가 쉽고 차 안을 깔끔하게 하는 수납용품'},
  {match:/lamp|light|room|部屋|ライト|照明|灯|房间|조명|방/i,JA:'部屋の雰囲気を変えられる、置くだけの小さいライト',EN:'A small light you can place anywhere to change a room’s mood',ZH:'随手摆放就能改变房间氛围的小灯',KO:'놓기만 해도 방 분위기를 바꾸는 작은 조명'},
  {match:/kitchen|cook|料理|キッチン|厨房|烹饪|주방|요리/i,JA:'一人分の料理が手軽に作れる、洗いやすい小型家電',EN:'An easy-clean compact appliance for cooking one portion',ZH:'适合一人份料理、容易清洗的小家电',KO:'1인분 요리를 쉽게 만들고 세척하기 편한 소형 가전'}
];
function personalizedDiscoveryExample(language){if(!memberSession)return'';const history=getSearchHistory();if(!history.length)return'';const recent=history.slice(0,5).join(' ');const idea=discoveryIdeas.find(item=>item.match.test(recent));if(idea)return idea[language]||idea.JA;const seed=history[0].split(' / ')[0].slice(0,48);const templates={JA:`${seed}に合いそうな、まだ名前を知らない便利グッズ`,EN:`A useful product related to “${seed}” whose name I do not know yet`,ZH:`与“${seed}”有关、但我还不知道名称的实用商品`,KO:`“${seed}”와 관련 있지만 아직 이름을 모르는 편리한 제품`};return templates[language]||templates.JA;}
function updateDiscoveryExample(){const language=elements.language.value||'JA';const actions=actionCopy[language]||actionCopy.JA;elements.discoveryExample.textContent=personalizedDiscoveryExample(language)||actions.discoveryExample;}
// 2026-08-08: 履歴由来の「次の検索例」は検索履歴と同じ文字列を×なしで
// 直下に再掲していた。利用者には消せない検索履歴に見えるため、会員時は
// この重複欄を表示せず、×付きの正式な履歴だけを残す。
function renderQuickExamples(language=elements.language.value||'JA'){elements.quick.replaceChildren();elements.quick.classList.toggle('hidden',Boolean(memberSession));if(memberSession)return;const link=document.createElement('a');link.className='chip member-example-cta';link.href='/login.html';link.textContent={JA:'無料会員登録で検索履歴を保存',EN:'Sign up free to save search history',ZH:'免费注册后保存搜索历史',KO:'무료 가입 후 검색 기록 저장'}[language]||'無料会員登録で検索履歴を保存';elements.quick.append(link);}
function getWatchPreferences(){try{const value=JSON.parse(localStorage.getItem('hoshilu_watch_preferences')||'[]');return Array.isArray(value)?value:[];}catch{return[];}}
function watchOptionsFor(query){const item=getWatchPreferences().find(saved=>saved.query===query);return Array.isArray(item?.options)&&item.options.length===4?item.options.map(Boolean):[true,true,false,false];}
function watchFrequencyFor(query){const item=getWatchPreferences().find(saved=>saved.query===query);return['INSTANT','DAILY','WEEKLY','MUTED'].includes(item?.frequency)?item.frequency:'INSTANT';}
function storeWatchPreference(query,options,asin='',frequency=watchFrequencyFor(query),target={}){const current=getWatchPreferences();const item={asin:String(asin||''),query:String(query||'').trim(),options:options.map(Boolean),frequency,target_price_jpy:Number(target.target_price_jpy)||null,target_product_key:String(target.target_product_key||''),target_product_name:String(target.target_product_name||''),updatedAt:new Date().toISOString()};localStorage.setItem('hoshilu_watch_preferences',JSON.stringify([item,...current.filter(saved=>saved.query!==item.query)].slice(0,100)));}
function removeLocalWish(query){setWishes(getWishes().filter(item=>item!==query));localStorage.setItem('hoshilu_watch_preferences',JSON.stringify(getWatchPreferences().filter(item=>item.query!==query)));}
function recordFor(query){return memberWishRecords.find(item=>item.query_text===query);}
function payloadFor(query,options,frequency=watchFrequencyFor(query),target={}){const targetPrice=Number(target.target_price_jpy)||null;return{query,language:elements.language.value,watch_sale:Boolean(options[0]),watch_price:targetPrice?true:Boolean(options[1]),watch_coupon:Boolean(options[2]),watch_restock:Boolean(options[3]),watch_frequency:frequency,...(targetPrice?{target_price_jpy:targetPrice,target_product_key:String(target.target_product_key||''),target_product_name:String(target.target_product_name||'')}:{})};}
function saveWish(query,options=watchOptionsFor(String(query||'').trim()),target={}){const value=String(query||'').trim();if(!value)return false;setWishes([value,...getWishes().filter(item=>item!==value)]);storeWatchPreference(value,options,target.target_product_key||'',watchFrequencyFor(value),target);renderWishes();if(memberSession)persistMemberWish(value,options,target);return true;}
async function persistMemberWish(query,options=watchOptionsFor(query),target={}){try{const response=await fetch('/api/member/wishes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payloadFor(query,options,watchFrequencyFor(query),target))});if(response.ok){const record=(await response.json()).wish;memberWishRecords=[record,...memberWishRecords.filter(item=>item.wish_id!==record.wish_id)];return record;}}catch{}return null;}
// HOSHILU INSIGHT v1.0: 保存した検索条件専用の保存/更新経路。AIウォッチ
// (🔔)のsaveWish/persistMemberWish/payloadForとは完全に別経路であり、
// watch_sale/watch_price/watch_coupon/watch_restockには一切触れない -
// サーバー側(member-wish-v2.mjs)がCOALESCEで既存のAIウォッチ設定を
// 温存するので、この経路から送るのはnotify_new_matchとwatch_frequencyだけ
// でよい。
async function persistInsightWatch(query,notifyNewMatch,frequency){try{const response=await fetch('/api/member/wishes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,language:elements.language.value,notify_new_match:notifyNewMatch,watch_frequency:frequency})});if(response.ok){const record=(await response.json()).wish;memberWishRecords=[record,...memberWishRecords.filter(item=>item.wish_id!==record.wish_id)];return record;}}catch{}return null;}
async function updateInsightWatch(record,notifyNewMatch,frequency){try{const response=await fetch(`/api/member/wishes/${record.wish_id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({notify_new_match:notifyNewMatch,watch_frequency:frequency})});if(response.ok){const updated=(await response.json()).wish;memberWishRecords=[{...record,...updated},...memberWishRecords.filter(item=>item.wish_id!==record.wish_id)];return updated;}}catch{}return null;}
// 検索結果ページの「この条件で新着を通知」ボタン(section5)から呼ばれる。
async function saveInsightWatch(query){const value=String(query||'').trim();if(!value)return false;setWishes([value,...getWishes().filter(item=>item!==value)]);renderWishes();if(memberSession)await persistInsightWatch(value,true,watchFrequencyFor(value));return true;}
function insightEnabledFor(query){const record=recordFor(query);return record?Boolean(record.notify_new_match):true;}
function renderMemberState(){if(memberSession){elements.memberLink.textContent=memberSession.name||window.HoshiluI18n?.t('nav.member',elements.language.value)||'無料会員';elements.memberLink.href='#wishTitle';elements.memberLogout.classList.remove('hidden');}else{elements.memberLink.textContent=(navigationCopy[elements.language.value]||navigationCopy.JA).account;elements.memberLink.href='/login.html';elements.memberLogout.classList.add('hidden');}updateDiscoveryExample();renderQuickExamples();renderSearchHistory();}
async function syncMemberWishes(){try{const sessionResponse=await fetch('/api/member/session',{cache:'no-store'});if(!sessionResponse.ok)return;memberSession=(await sessionResponse.json()).member;renderMemberState();const local=getWishes();for(const query of local){const saved=getWatchPreferences().find(item=>item.query===query)||{};await persistMemberWish(query,watchOptionsFor(query),saved);}const response=await fetch('/api/member/wishes',{cache:'no-store'});if(!response.ok)return;memberWishRecords=(await response.json()).wishes||[];memberWishRecords.forEach(item=>storeWatchPreference(item.query_text,[item.watch_sale,item.watch_price,item.watch_coupon,item.watch_restock].map(Boolean),item.target_product_key||'',item.watch_frequency,item));const merged=[...memberWishRecords.map(item=>item.query_text),...local].filter((value,index,array)=>value&&array.indexOf(value)===index);setWishes(merged);renderWishes();}catch{}}
function renderInsight(){const actions=actionCopy[elements.language.value]||actionCopy.JA;const wishes=getWishes();const enabled=wishes.filter(query=>insightEnabledFor(query)).length;elements.insightTitle.textContent=actions.insightTitle;elements.insightSummary.textContent=actions.insightTemplate.replace('{count}',String(wishes.length)).replace('{enabled}',String(enabled));}
// HOSHILU INSIGHT delete controls (2026-08-07 request). Removing an AI Watch
// item used to mean opening the row's <details>, finding 削除 in the editor
// and confirming - three interactions to undo one. The same removal now also
// hangs off a one-tap button on the row itself, so this is the single
// implementation both paths call: local list, stored watch preferences, the
// in-memory member records and the server record all have to go together, or
// a deleted watch reappears on the next render/reload.
async function deleteWish(value){
  const record=recordFor(value);
  removeLocalWish(value);
  memberWishRecords=memberWishRecords.filter(item=>item.query_text!==value);
  if(record)await fetch(`/api/member/wishes/${record.wish_id}`,{method:'DELETE'});
}
// Bulk delete keeps its confirm: one row is trivially re-added by searching
// again, the whole list is not.
async function deleteAllWishes(actions){
  const values=getWishes();
  if(!values.length||!confirm(actions.deleteAllConfirm))return;
  for(const value of values)await deleteWish(value);
  renderWishes();
}
function wishRowDeleteButton(value,actions){
  const button=document.createElement('button');
  button.type='button';
  button.className='wish-row-delete';
  button.textContent='×';
  button.setAttribute('aria-label',`${actions.deleteWishAria}: ${value}`);
  // Inside <summary>, a click would otherwise toggle the <details> open as
  // well as delete the row it belongs to.
  button.addEventListener('click',async event=>{
    event.preventDefault();
    event.stopPropagation();
    await deleteWish(value);
    renderWishes();
  });
  return button;
}
// HOSHILU INSIGHT v1.0 (section5): この編集エリアはAIウォッチの4種類の
// チェックボックス(値下げ/クーポン/再入荷/販売開始)を持たない - このリスト
// が監視しているのは「保存した検索条件」であり、個別商品ではないため。
// 単一のトグル「この条件で新着を通知」だけを持つ。AIウォッチの🔔ダイアログ
// (createWatchOptions)はこの変更と無関係で、そちらのUI・保存経路は無傷。
function wishItem(value,t,actions){const details=document.createElement('details');details.className='wish-item';const summary=document.createElement('summary');summary.append(textElement('span','wish-item-label',localizedWishLabel(value,elements.language.value)),wishRowDeleteButton(value,actions));const editor=document.createElement('div');editor.className='wish-editor';const toggleRow=document.createElement('label');toggleRow.className='insight-toggle';const toggleInput=document.createElement('input');toggleInput.type='checkbox';toggleInput.checked=insightEnabledFor(value);toggleRow.append(toggleInput,document.createTextNode(` ${actions.insightToggleLabel}`));const toggleDescription=textElement('p','insight-toggle-description',actions.insightToggleDescription);const frequency=document.createElement('select');frequency.setAttribute('aria-label','通知頻度');[['INSTANT','すぐに通知'],['DAILY','1日1回'],['WEEKLY','週1回'],['MUTED','通知を停止']].forEach(([key,label])=>{const option=document.createElement('option');option.value=key;option.textContent=label;frequency.append(option);});frequency.value=watchFrequencyFor(value);const controls=document.createElement('div');controls.className='wish-controls';const search=document.createElement('button');search.type='button';search.textContent=actions.searchAgain;search.addEventListener('click',()=>{elements.query.value=value;elements.clear.classList.remove('hidden');focusSearch();});const update=document.createElement('button');update.type='button';update.textContent=actions.updateWish;const remove=document.createElement('button');remove.type='button';remove.className='danger';remove.textContent=actions.deleteWish;const status=textElement('p','wish-edit-status','');update.addEventListener('click',async()=>{const notifyNewMatch=toggleInput.checked;setWishes([value,...getWishes().filter(item=>item!==value)]);const record=recordFor(value);if(record)await updateInsightWatch(record,notifyNewMatch,frequency.value);else if(memberSession)await persistInsightWatch(value,notifyNewMatch,frequency.value);renderWishes();});remove.addEventListener('click',async()=>{if(!confirm(actions.deleteConfirm))return;await deleteWish(value);renderWishes();});controls.append(search,update,remove);editor.append(toggleRow,toggleDescription,frequency,controls,status);details.append(summary,editor);return details;}
function wishCycle(wishes,t,actions){const cycle=document.createElement('div');cycle.className='wish-cycle';cycle.append(...wishes.map(value=>wishItem(value,t,actions)));return cycle;}
function renderWishes(){const allWishes=getWishes(),term=String(elements.wishFilter?.value||'').trim().toLocaleLowerCase(),wishes=term?allWishes.filter(value=>`${value} ${localizedWishLabel(value,elements.language.value)}`.toLocaleLowerCase().includes(term)):allWishes,t=selectedCopy(),actions=actionCopy[elements.language.value]||actionCopy.JA;elements.wishFilter.placeholder=wishSearchCopy[elements.language.value]||wishSearchCopy.JA;const deleteAll=document.querySelector('#deleteAllWishes');if(deleteAll){deleteAll.textContent=actions.deleteAllWishes;deleteAll.classList.toggle('hidden',!allWishes.length);deleteAll.onclick=()=>deleteAllWishes(actionCopy[elements.language.value]||actionCopy.JA);}elements.wishList.classList.remove('circular');elements.wishList.onscroll=null;if(!wishes.length){elements.wishList.replaceChildren(textElement('p','empty',term?t.filteredEmptyWish:t.emptyWish));renderInsight();return;}const first=wishCycle(wishes,t,actions);if(wishes.length<=5){elements.wishList.replaceChildren(first);renderInsight();return;}const second=wishCycle(wishes,t,actions);elements.wishList.classList.add('circular');elements.wishList.replaceChildren(first,second);elements.wishList.onscroll=()=>{const cycleHeight=first.offsetHeight+9;if(elements.wishList.scrollTop>=cycleHeight)elements.wishList.scrollTop-=cycleHeight;};renderInsight();}
// AI Lowest-Price Compare gap-fill (Phase C item 12/13, 2026-08-07).
//
// The price-comparison panel only lists marketplaces with a CONFIRMED total
// including shipping. A mall can still carry this exact product without a
// confirmed price (no shipping figure, stock unknown), and dropping those
// hid a real place to buy it.
//
// These entries come from candidate.offers - the same per-product offer list
// the confirmed prices come from - filtered to the ones with a tracked
// product URL but no confirmed total. So every link here opens the SAME
// product's page on that mall. It is deliberately NOT built from
// result.marketplace_search_links: those are whole-query search links, which
// would send the user to a keyword search results page rather than to this
// product, and would list malls that were never shown to carry it at all.
// No price is displayed, because none was confirmed - HOSHILU never
// estimates one.
function unverifiedMarketplaceLinks(offers,language){
  const seen=new Set();
  const links=(Array.isArray(offers)?offers:[]).filter(offer=>{
    const marketplace=String(offer?.marketplace||'');
    if(!offer?.tracking_url||!marketplace||Number(offer?.total_cost)>0||seen.has(marketplace))return false;
    seen.add(marketplace);
    return true;
  }).map(offer=>({marketplace:offer.marketplace,label:marketplaceLabel(offer.marketplace),url:offer.tracking_url}));
  if(!links.length)return null;
  const labels={JA:'同じ商品が見つかったモール（価格未確認）',EN:'Same product on these marketplaces (price unverified)',ZH:'在这些商城找到同一商品（价格未确认）',KO:'같은 상품이 있는 쇼핑몰 (가격 미확인)'};
  const wrap=document.createElement('div');
  wrap.className='price-compare-gap';
  wrap.append(textElement('span','price-compare-gap-label',labels[language]||labels.JA));
  const node=marketplaceLinks(links,true);
  if(node)wrap.append(node);
  return wrap.childElementCount>1?wrap:null;
}
function renderOfferOptions(candidate,t,language){const source=candidate.offers?.length?candidate.offers:[candidate.selected_offer];const linked=source.filter(o=>o?.tracking_url).slice(0,10);if(!linked.length)return null;const priced=linked.filter(o=>Number(o.total_cost)>0).sort((a,b)=>Number(a.total_cost)-Number(b.total_cost));if(!priced.length){const list=document.createElement('div');list.className='offer-list';linked.forEach(offer=>{const link=document.createElement('a');link.className='offer-link';link.dataset.marketplace=String(offer.marketplace||'');link.href=offer.tracking_url;link.target='_blank';link.rel='noopener noreferrer';const badge=priorityListingBadge(offer,language);if(badge)link.append(badge);link.append(textElement('strong','',`${marketplaceLabel(offer.marketplace)}で見る`),textElement('span','',offerDetail(offer,t,language).replace(`${marketplaceLabel(offer.marketplace)} · `,'')));list.append(link);});return list;}const labels={JA:{button:'価格を比較',heading:`送料込み価格が確認できた${priced.length}モール`,verified:'確認済み送料込み価格',open:'商品ページへ'},EN:{button:'Compare prices',heading:`${priced.length} verified totals including shipping`,verified:'Verified total including shipping',open:'Open product page'},ZH:{button:'比较价格',heading:`已确认${priced.length}个商城的含运费价格`,verified:'已确认含运费价格',open:'前往商品页面'},KO:{button:'가격 비교',heading:`배송비 포함 가격이 확인된 ${priced.length}개 쇼핑몰`,verified:'확인된 배송비 포함 가격',open:'상품 페이지로'}}[language]||null;if(priced.length===1){const offer=priced[0];const link=document.createElement('a');link.className='price-offer single-price-offer';link.dataset.marketplace=String(offer.marketplace||'');link.href=offer.tracking_url;link.target='_blank';link.rel='noopener noreferrer';const badge=priorityListingBadge(offer,language);if(badge)link.append(badge);link.append(textElement('span','price-rank',labels.verified),textElement('strong','',marketplaceLabel(offer.marketplace)),textElement('b','',formatMoney(offer.total_cost,offer.currency,language)),textElement('small','',`${t.shipping} ${formatMoney(offer.shipping_fee||0,offer.currency,language)} · ${labels.open}`));const gap=unverifiedMarketplaceLinks(linked,language);if(!gap)return link;const singleWrap=document.createElement('div');singleWrap.className='price-comparison single-price-comparison';singleWrap.append(link,gap);return singleWrap;}const wrap=document.createElement('div');wrap.className='price-comparison';const button=document.createElement('button');button.type='button';button.className='price-compare-button';button.textContent=labels.button;button.setAttribute('aria-expanded','false');const panel=document.createElement('div');panel.className='price-compare-panel hidden';panel.append(textElement('strong','price-compare-heading',labels.heading));const scroller=document.createElement('div');scroller.className='price-offer-scroll';priced.forEach((offer,index)=>{const link=document.createElement('a');link.className='price-offer';link.dataset.marketplace=String(offer.marketplace||'');link.href=offer.tracking_url;link.target='_blank';link.rel='noopener noreferrer';const badge=priorityListingBadge(offer,language);if(badge)link.append(badge);link.append(textElement('span','price-rank',`NO. ${index+1}`),textElement('strong','',marketplaceLabel(offer.marketplace)),textElement('b','',formatMoney(offer.total_cost,offer.currency,language)),textElement('small','',Number(offer.shipping_fee||0)>0?`${t.shipping} ${formatMoney(offer.shipping_fee,offer.currency,language)} · ${labels.open}`:`${t.shipping} 0 · ${labels.open}`));scroller.append(link);});panel.append(scroller);const gap=unverifiedMarketplaceLinks(linked,language);if(gap)panel.append(gap);button.addEventListener('click',()=>{const open=panel.classList.toggle('hidden')===false;button.setAttribute('aria-expanded',String(open));if(open)panel.scrollIntoView({behavior:'smooth',block:'nearest'});});wrap.append(button,panel);return wrap;}
function allMarketplacesButton(){const labels={JA:'全部のモールで探す',EN:'Search all marketplaces',ZH:'在所有商城查找',KO:'모든 쇼핑몰에서 찾기'};const link=document.createElement('a');link.href='#marketplaceFallback';link.className='buy-link all-marketplaces-button';link.textContent=labels[elements.language.value]||labels.JA;link.addEventListener('click',event=>{event.preventDefault();document.querySelector('.marketplace-fallback')?.scrollIntoView({behavior:'smooth',block:'center'});});return link;}
function createWatchOptions(candidate,t){
  const dialog=document.createElement('dialog');
  dialog.className='product-watch-dialog';
  const panel=document.createElement('div');
  panel.className='product-watch-dialog-card';
  const close=document.createElement('button');
  close.type='button';close.className='product-watch-dialog-close';close.setAttribute('aria-label','close');close.textContent='✕';
  close.addEventListener('click',()=>dialog.close());
  const bell=document.createElement('button');
  const watchButtonCopy={JA:'値下がり通知☑',EN:'Price drop alert ✓',ZH:'降价通知☑',KO:'가격 인하 알림☑'};
  bell.type='button';bell.className='watch-bell watch-settings-button';bell.setAttribute('aria-label',t.watchTitle);bell.textContent=watchButtonCopy[elements.language.value]||watchButtonCopy.JA;
  bell.addEventListener('click',()=>dialog.showModal());
  // AI Watch (v3.2): title + the required "AI monitors price/stock/coupons
  // 24h" description must always be shown together, before the notification
  // condition checkboxes - this is not a favorites list.
  panel.append(close,textElement('strong','',t.watchTitle),textElement('p','watch-save-note',t.watchDescription));
  const options=document.createElement('div');
  options.className='watch-options';
  const inputs=t.watchLabels.map((label,index)=>{const input=document.createElement('input');input.type='checkbox';input.checked=index<2;const item=document.createElement('label');item.append(input,document.createTextNode(` ${label}`));options.append(item);return input;});
  const priceLabels={JA:{label:'この金額以下になったら購入したい',current:'現在価格',unavailable:'未取得',unit:'円',note:'API確認価格だけを監視します（AI推定価格は不使用）。希望額は5人以上で匿名集計し、契約セラーの需要分析にも使います。',login:'価格監視には無料会員ログインが必要です。'},EN:{label:'Notify me at or below this price',current:'Current price',unavailable:'Unavailable',unit:'JPY',note:'We use API prices only, never AI estimates. Target prices may appear in seller demand analytics only in anonymous groups of 5+.',login:'Sign in as a free member to monitor a target price.'},ZH:{label:'降到此价格以下时通知',current:'当前价格',unavailable:'未获取',unit:'日元',note:'仅使用商城API确认价格。希望价仅在5人以上时匿名汇总，用于签约卖家的需求分析。',login:'价格监控需要登录免费会员。'},KO:{label:'이 가격 이하일 때 알림',current:'현재 가격',unavailable:'확인 불가',unit:'엔',note:'쇼핑몰 API 확인 가격만 사용합니다. 희망가는 5명 이상일 때만 익명 집계해 계약 판매자 수요 분석에 활용합니다.',login:'목표 가격 감시에는 무료 회원 로그인이 필요합니다.'}}[elements.language.value]||null;
  const pricedOffers=[...(Array.isArray(candidate?.offers)?candidate.offers:[]),candidate?.selected_offer].filter(Boolean).map(offer=>({offer,total:Number(offer.total_cost||offer.price)})).filter(item=>Number.isFinite(item.total)&&item.total>0).sort((a,b)=>a.total-b.total);const currentOffer=pricedOffers[0];const currentPrice=currentOffer?.total;const currentPriceText=Number.isFinite(currentPrice)?formatMoney(currentPrice,currentOffer?.offer?.currency||'JPY',elements.language.value):priceLabels.unavailable;
  const targetWrap=document.createElement('label');targetWrap.className='target-price-field';targetWrap.append(textElement('strong','target-price-current',`${priceLabels.current}：${currentPriceText}`),textElement('span','target-price-label',priceLabels.label));
  const targetInput=document.createElement('input');targetInput.type='number';targetInput.inputMode='numeric';targetInput.min='100';targetInput.max='100000000';targetInput.step='100';if(Number.isFinite(currentPrice))targetInput.placeholder=String(Math.max(100,Math.floor(currentPrice*.9/100)*100));const productKey=String(candidate?.record_key||candidate?.asin||'');const productName=String(candidate?.display_name||candidate?.product_name||elements.query.value);const savedTarget=getWatchPreferences().find(item=>(productKey&&item.target_product_key===productKey)||item.target_product_name===productName);if(Number(savedTarget?.target_price_jpy)>=100)targetInput.value=String(savedTarget.target_price_jpy);targetWrap.append(targetInput,textElement('small','',priceLabels.unit));
  const targetNote=textElement('p','watch-save-note',priceLabels.note);
  const actions=actionCopy[elements.language.value]||actionCopy.JA;
  const save=document.createElement('button');
  save.type='button';save.className='watch-save-button';save.textContent=actions.saveWatch;
  const status=textElement('p','watch-save-status','');
  save.addEventListener('click',()=>{
    const amount=Number(targetInput.value||0);if(targetInput.value&&(amount<100||amount>100000000)){targetInput.setCustomValidity('100円以上で入力してください');targetInput.reportValidity();return;}targetInput.setCustomValidity('');
    if(amount&&!memberSession){status.textContent=priceLabels.login;return;}
    const target=amount?{target_price_jpy:amount,target_product_key:productKey,target_product_name:productName}:{};
    // 希望額は検索文ではなく商品単位で保存する。同じ検索結果から複数商品へ
    // 希望額を付けても、同じwish_idへ上書きされないよう商品名を保存キーにする。
    const wishQuery=amount?productName:elements.query.value;
    if(saveWish(wishQuery,inputs.map((input)=>input.checked),target)){
      status.textContent=t.watchSavedStatus;
      bell.classList.add('watching');
      setTimeout(()=>dialog.close(),700);
    }
  });
  panel.append(options,targetWrap,targetNote,save,status);
  dialog.append(panel);
  return{bell,dialog,inputs};
}
function saveWatchChoice(candidate,inputs){const current=JSON.parse(localStorage.getItem('hoshilu_watch_preferences')||'[]');const item={asin:String(candidate.asin||''),query:elements.query.value.trim(),options:inputs.map(input=>input.checked),updatedAt:new Date().toISOString()};const next=[item,...(Array.isArray(current)?current:[]).filter(saved=>saved.asin!==item.asin||saved.query!==item.query)].slice(0,100);localStorage.setItem('hoshilu_watch_preferences',JSON.stringify(next));}
function clarificationCard(result){const clarification=result?.clarification;if(!clarification?.required||!Array.isArray(clarification.options)||!clarification.options.length)return null;const card=document.createElement('article');card.className='clarification-card';card.append(textElement('strong','',clarification.question||''));const options=document.createElement('div');options.className='clarification-options';clarification.options.forEach(option=>{const button=document.createElement('button');button.type='button';button.className='clarification-option';button.textContent=String(option.label||option.value||'');button.addEventListener('click',()=>{options.querySelectorAll('button').forEach(item=>item.classList.remove('selected'));button.classList.add('selected');const addition=String(option.value||option.label||'').trim();const current=elements.query.value.trim();const parts=current.split(' / ').map(value=>value.trim());elements.query.value=addition&&!parts.includes(addition)?`${current} / ${addition}`:current;elements.clear.classList.remove('hidden');elements.submit.scrollIntoView({behavior:'smooth',block:'center'});});options.append(button);});card.append(options);return card;}
function shareDiscoveryCard(){const copy=shareCopy[elements.language.value]||shareCopy.JA;const card=document.createElement('article');card.className='share-discovery';const intro=document.createElement('div');intro.className='share-discovery-copy';intro.append(textElement('strong','',copy.title),textElement('p','',copy.privacy));const include=document.createElement('input');include.type='checkbox';const includeLabel=document.createElement('label');includeLabel.className='share-include-query';includeLabel.append(include,document.createTextNode(` ${copy.include}`));const actions=document.createElement('div');actions.className='share-discovery-actions';const button=document.createElement('button');button.type='button';button.className='secondary share-discovery-button';button.textContent=copy.button;const copyButton=document.createElement('button');copyButton.type='button';copyButton.className='secondary share-copy-button';copyButton.textContent=copy.copy;const gmailButton=document.createElement('button');gmailButton.type='button';gmailButton.className='secondary share-gmail-button';gmailButton.textContent=copy.gmail;const status=textElement('span','share-discovery-status','');const payload=()=>{const raw=elements.query.value.trim().slice(0,80).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig,'').replace(/\b0\d{1,4}-?\d{1,4}-?\d{3,4}\b/g,'').trim();const url=`${location.origin}/?utm_source=user_share&utm_medium=social&utm_campaign=found_with_hoshilu`;const text=include.checked&&raw?`${copy.prefix}${raw}\n${copy.tag}`:copy.tag;return{text,url};};button.addEventListener('click',async()=>{const data=payload();try{if(navigator.share){await navigator.share({title:copy.title,...data});return;}await navigator.clipboard.writeText(`${data.text}\n${data.url}`);status.textContent=copy.copied;}catch(error){if(error?.name==='AbortError')return;}});copyButton.addEventListener('click',async()=>{const data=payload();try{await navigator.clipboard.writeText(`${data.text}\n${data.url}`);status.textContent=copy.copied;}catch{}});gmailButton.addEventListener('click',()=>{const data=payload();window.open(gmailShareLink(copy.title,`${data.text}\n${data.url}`),'_blank','noopener,noreferrer');});actions.append(button,copyButton,gmailButton);card.append(intro,includeLabel,actions,status);return card;}
const shareObserver=new MutationObserver(()=>{if(!elements.results.classList.contains('hidden')&&!elements.cards.querySelector('.share-discovery'))elements.cards.append(shareDiscoveryCard());});
shareObserver.observe(elements.cards,{childList:true});
async function copySearchKeywords(value,button,labels){try{await navigator.clipboard.writeText(value);}catch{const area=document.createElement('textarea');area.value=value;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();document.execCommand('copy');area.remove();}button.textContent=labels.copiedKeywords;setTimeout(()=>{button.textContent=labels.copyKeywords;},1800);}
async function copySocialSearchQuery(value){try{if(!navigator.clipboard?.writeText)throw new Error('clipboard unavailable');await navigator.clipboard.writeText(value);return true;}catch{const area=document.createElement('textarea');area.value=value;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();const copied=document.execCommand('copy')===true;area.remove();return copied;}}
const socialSearchHandoffCopy={
  JA:{title:'検索語をコピーしてSNSで探す',body:'Instagram・TikTokのアプリは検索語を自動入力できないことがあります。下の検索語をコピーし、SNSの検索欄へ貼り付けてください。',copy:'検索語をコピー',copied:'コピーしました',failed:'自動コピーできませんでした。検索語を長押ししてコピーしてください。',open:name=>`${name}を開く`,close:'閉じる'},
  EN:{title:'Copy the search terms, then open the app',body:'Instagram and TikTok may remove search terms when their apps open. Copy the terms below and paste them into the app search box.',copy:'Copy search terms',copied:'Copied',failed:'Automatic copy failed. Press and hold the terms to copy them.',open:name=>`Open ${name}`,close:'Close'},
  ZH:{title:'复制搜索词后打开应用',body:'Instagram或TikTok应用打开时可能不会自动填入搜索词。请复制下方文字并粘贴到应用的搜索框。',copy:'复制搜索词',copied:'已复制',failed:'无法自动复制，请长按搜索词进行复制。',open:name=>`打开${name}`,close:'关闭'},
  KO:{title:'검색어를 복사한 뒤 앱에서 찾기',body:'Instagram·TikTok 앱을 열 때 검색어가 자동 입력되지 않을 수 있습니다. 아래 검색어를 복사해 앱 검색창에 붙여 넣어 주세요.',copy:'검색어 복사',copied:'복사했습니다',failed:'자동 복사에 실패했습니다. 검색어를 길게 눌러 복사해 주세요.',open:name=>`${name} 열기`,close:'닫기'}
};
function openSocialSearchHandoff(item){const copy=socialSearchHandoffCopy[elements.language.value]||socialSearchHandoffCopy.JA;const name=item.channel==='instagram'?'Instagram':'TikTok';const dialog=document.createElement('dialog');dialog.className='social-search-handoff-dialog';const panel=document.createElement('div');panel.className='social-search-handoff-card';const close=document.createElement('button');close.type='button';close.className='social-search-handoff-close';close.setAttribute('aria-label',copy.close);close.textContent='✕';close.addEventListener('click',()=>dialog.close());const query=textElement('output','social-search-handoff-query',String(item.search_query));const status=textElement('p','social-search-handoff-status','');const copyButton=document.createElement('button');copyButton.type='button';copyButton.className='secondary social-search-copy-button';copyButton.textContent=copy.copy;const runCopy=async()=>{const copied=await copySocialSearchQuery(item.search_query);status.textContent=copied?copy.copied:copy.failed;copyButton.textContent=copied?copy.copied:copy.copy;return copied;};copyButton.addEventListener('click',()=>{void runCopy();});const open=document.createElement('a');open.className='buy-link social-search-open-button';open.href=item.url;open.target='_blank';open.rel='noopener noreferrer';open.textContent=copy.open(name);const actions=document.createElement('div');actions.className='social-search-handoff-actions';actions.append(copyButton,open);panel.append(close,textElement('strong','social-search-handoff-title',copy.title),textElement('p','social-search-handoff-body',copy.body),query,status,actions);dialog.append(panel);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();void runCopy();}
function marketplaceLinks(links,compact=false){const valid=(Array.isArray(links)?links:[]).filter(item=>item?.url);if(!valid.length)return null;const wrap=document.createElement('div');wrap.className=compact?'marketplace-links compact':'marketplace-links';valid.forEach(item=>{const link=document.createElement('a');link.className='buy-link marketplace-search-link';link.dataset.marketplace=String(item.marketplace||'');
// Social links carry `channel` instead of `marketplace`; ai-search-ui.css
// colours them via [data-channel]. Emitting it is what keeps them rendering
// as brand-coloured buttons rather than bare blue links.
if(item.channel)link.dataset.channel=String(item.channel);link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';if(item.copy_query&&item.search_query){link.dataset.searchQuery=String(item.search_query);link.title='検索語をコピーして開きます';link.addEventListener('click',(event)=>{event.preventDefault();openSocialSearchHandoff(item);});}
// Mall buttons sit under a "モールで探す" group heading, so the per-button
// "〜で探す" suffix is redundant and gets stripped. Social buttons keep their
// label verbatim ("Instagramで探す" / "LINEで共有") so the action stays explicit.
const rawLabel=String(item.label||item.marketplace||'');link.textContent=item.channel?rawLabel:rawLabel.replace(/(?:で探す|で検索)$/u,'');wrap.append(link);});return wrap;}
function emergencySearchKeywords(query){const source=String(query||'').trim();return source?(buildMarketplaceSearchKeywords(source,'AMAZON_JP')||source):'';}
function emergencyMarketplaceSearchLinks(query){const keywords=emergencySearchKeywords(query);if(!keywords)return[];const encoded=encodeURIComponent(keywords);return[{marketplace:'AMAZON_JP',label:'Amazonで探す',url:`https://www.amazon.co.jp/s?k=${encoded}&tag=hoshilu-22`,search_query:keywords},{marketplace:'RAKUTEN_JP',label:'楽天市場で探す',url:`https://search.rakuten.co.jp/search/mall/${encoded}/`,search_query:keywords},{marketplace:'YAHOO_JP',label:'Yahoo!ショッピングで探す',url:`https://shopping.yahoo.co.jp/search?p=${encoded}`,search_query:keywords},{marketplace:'QOO10_JP',label:'Qoo10で探す',url:`https://www.qoo10.jp/s/?keyword=${encoded}`,search_query:keywords},{marketplace:'SHEIN_JP',label:'SHEINで探す',url:`https://jp.shein.com/pdsearch/${encoded}/`,search_query:keywords}];}
function emergencyMarketplaceFallback(query){const messages={JA:'商品候補を取得できなかったため、5つのモールで同じ条件を探せるリンクを表示しています。',EN:'Product suggestions are temporarily unavailable, so you can continue the same search across five marketplaces.',ZH:'暂时无法获取商品候选，因此显示可在五个商城继续搜索相同条件的链接。',KO:'상품 후보를 가져오지 못해 같은 조건으로 5개 쇼핑몰에서 계속 찾을 수 있는 링크를 표시합니다.'};return{message:messages[elements.language.value]||messages.JA,candidates:[],search_keywords:emergencySearchKeywords(query),marketplace_search_links:emergencyMarketplaceSearchLinks(query)};}
// linksNote (2026-08-08): AI候補のモールボタンは商品ページの直リンクでは
// なく、そのモールでの検索リンクなので、どこを見ればよいか分からないという
// 声を受けてボタンの直前に明示する(marketplaceLinksの'で探す'/'で検索'は
// これらのボタンでは既定で削られて表示されるため、ラベルだけでは検索リンク
// だと分かりにくい)。
const aiIntentLabels={JA:{category:'カテゴリ',features:'特徴',confidence:'理解度',reason:'理由',keywords:'検索ワード',brand:'ブランド',candidates:'HOSHILU AIが見つけた商品候補',linksNote:'気になったら、下のモールで検索して確認してください（この商品が必ず見つかるとは限りません）。'},EN:{category:'Category',features:'Features',confidence:'Match confidence',reason:'Why',keywords:'Search terms',brand:'Brand',candidates:'Product candidates from HOSHILU AI',linksNote:'Tap a marketplace below to search for this item (it is not guaranteed to be listed there).'},ZH:{category:'类别',features:'特征',confidence:'理解度',reason:'理由',keywords:'搜索词',brand:'品牌',candidates:'HOSHILU AI找到的商品候选',linksNote:'如果感兴趣，请在下方商城搜索确认（不保证一定能找到该商品）。'},KO:{category:'카테고리',features:'특징',confidence:'이해도',reason:'이유',keywords:'검색어',brand:'브랜드',candidates:'HOSHILU AI가 찾은 상품 후보',linksNote:'관심 있으면 아래 쇼핑몰에서 검색해 확인해 주세요(이 상품이 반드시 있는 것은 아닙니다).'}};
function bulletList(className,items){const values=(Array.isArray(items)?items:[]).map(item=>String(item||'').trim()).filter(Boolean);if(!values.length)return null;const list=document.createElement('ul');list.className=className;values.forEach(value=>list.append(textElement('li','',value)));return list;}
function aiIntentRow(label,valueNode){if(!valueNode)return null;const row=document.createElement('div');row.className='ai-intent-row';row.append(textElement('span','ai-intent-label',label),valueNode);return row;}
function aiIntentSummaryBlock(analysis,language){if(!analysis)return null;const labels=aiIntentLabels[language]||aiIntentLabels.JA;const wrap=document.createElement('div');wrap.className='ai-intent-summary';const category=String(analysis.category||'').trim();if(category)wrap.append(aiIntentRow(labels.category,textElement('span','ai-intent-value',category)));const features=bulletList('ai-intent-features',analysis.features);if(features)wrap.append(aiIntentRow(labels.features,features));return wrap.childElementCount?wrap:null;}
// AI Search v2 STEP2 (docs/HOSHILU_AI_SEARCH_V2_SPEC_2026-08-04.md section 8):
// every candidate the AI returns - not just the first one - needs its own
// match rate, reason, matched features and marketplace search buttons.
// marketplace_search_links is attached server-side in index.mjs's
// aiDiscoveryWithSignedCandidateLinks(), so the buttons here are the same
// signed /go tracking links as every other product link (never a raw,
// client-built marketplace URL).
function aiCandidateCard(aiCandidate,labels){const card=document.createElement('article');card.className='ai-candidate-card';const heading=document.createElement('div');heading.className='ai-candidate-heading';heading.append(textElement('strong','ai-candidate-name',aiCandidate.name));const score=Math.round(Number(aiCandidate.match_score||0));if(score>0)heading.append(textElement('span','ai-intent-confidence-score',`${score}%`));card.append(heading);if(aiCandidate.brand)card.append(aiIntentRow(labels.brand,textElement('span','ai-intent-value',aiCandidate.brand)));if(aiCandidate.reason)card.append(aiIntentRow(labels.reason,textElement('span','ai-intent-value',aiCandidate.reason)));const features=bulletList('ai-intent-features',aiCandidate.matched_features);if(features)card.append(aiIntentRow(labels.features,features));const links=marketplaceLinks(aiCandidate.marketplace_search_links,true);if(links){card.append(textElement('p','ai-candidate-links-note',labels.linksNote));card.append(links);}return card;}
function aiCandidateCards(candidates,language){const list=(Array.isArray(candidates)?candidates:[]).filter(aiCandidate=>aiCandidate?.name);if(!list.length)return null;const labels=aiIntentLabels[language]||aiIntentLabels.JA;const wrap=document.createElement('div');wrap.className='ai-candidate-list';wrap.append(textElement('strong','ai-candidate-list-title',labels.candidates));list.forEach(aiCandidate=>wrap.append(aiCandidateCard(aiCandidate,labels)));return wrap;}
function keywordTags(value){const seen=new Set();const tags=[];for(const part of String(value||'').split(/[\/\n]+/)){for(const token of part.trim().split(/\s+/)){const clean=token.trim();if(!clean)continue;const key=clean.toLocaleLowerCase();if(seen.has(key))continue;seen.add(key);tags.push(clean);if(tags.length>=12)return tags;}}return tags;}
function keywordTagBlock(value,actions,label){const tags=keywordTags(value);if(!tags.length)return null;const wrap=document.createElement('div');wrap.className='keyword-tag-block';if(label)wrap.append(textElement('span','ai-intent-label keyword-tag-label',label));const list=document.createElement('div');list.className='keyword-tag-list';tags.forEach(tag=>list.append(textElement('span','keyword-tag',tag)));const copyButton=document.createElement('button');copyButton.type='button';copyButton.className='copy-keywords copy-all-keywords';copyButton.textContent=actions.copyKeywords;copyButton.addEventListener('click',()=>copySearchKeywords(value,copyButton,actions));wrap.append(list,copyButton);return wrap;}
// AI related-keyword suggestions (Phase C item 11, 2026-08-07). The
// keywordTagBlock above only ever echoed the user's own words back as
// read-only chips, so on a search that returned products there was no way
// to narrow down without retyping. These chips are tappable and append to
// the existing condition using the same " / " convention runKnowledgeSearch
// already treats as "same search root, attempt 2".
//
// Every suggestion is real data, never an invented term:
//   1. the AI intent analysis (search_keywords / candidate brands+names /
//      features) when it ran - index.mjs only calls discoverProductsWithAi
//      when the search returned zero candidates, so this source is the
//      zero-result path;
//   2. the matched terms and product titles of the products HOSHILU
//      actually found, frequency-ranked, on the has-results path.
// Terms already in the query are dropped: re-adding them is a no-op.
const relatedKeywordCopy={
  JA:{ai:'AI連想キーワード（タップで検索条件に追加）',result:'検索結果からの関連キーワード（タップで検索条件に追加）',body:'覚えている色・大きさ・電源・使う場所などを検索文に追加すると、候補をさらに絞れます。',button:'条件を追加して再検索'},
  EN:{ai:'AI related keywords (tap to add to your search)',result:'Related keywords from these results (tap to add to your search)',body:'Add any remembered color, size, power source, or place of use to narrow the matches.',button:'Add details and search again'},
  ZH:{ai:'AI联想关键词（点击加入搜索条件）',result:'来自搜索结果的相关关键词（点击加入搜索条件）',body:'补充记得的颜色、大小、电源或使用场所，可以进一步缩小候选范围。',button:'补充条件并再次搜索'},
  KO:{ai:'AI 연상 키워드 (탭하여 검색 조건에 추가)',result:'검색 결과의 관련 키워드 (탭하여 검색 조건에 추가)',body:'기억나는 색상, 크기, 전원 방식, 사용 장소를 추가하면 후보를 더 좁힐 수 있습니다.',button:'조건을 추가해 다시 검색'}
};
// Marketplace listing titles are padded with promo boilerplate ("送料無料",
// "正規品", ...). Suggesting those as refinements would narrow the search by
// seller marketing rather than by product attributes, so they are dropped.
const relatedKeywordStopWords=new Set(['送料無料','送料込み','送料込','正規品','新品','中古','未使用','即日発送','あす楽','ポイント','ポイント10倍','セール','sale','限定','数量限定','期間限定','クーポン','まとめ買い','公式','公式ストア','日本製','国内発送','ラッピング','ギフト','プレゼント','人気','おすすめ','高品質','最安値','激安','翌日配送','在庫あり','set','セット','新作','対応','用','的','and','the','for','with','a','of']);
function splitKeywordTokens(value){return String(value||'').split(/[\s/／・|｜,、，.。;；:：!！?？~〜+＋*＊"'“”‘’()（）\[\]【】「」『』<>＜＞{}]+/u).map(token=>token.trim()).filter(Boolean);}
function queryTokenSet(query){const set=new Set();splitKeywordTokens(query).forEach(token=>set.add(token.toLocaleLowerCase()));return set;}
function relatedKeywordSuggestions(result,query){
  const used=queryTokenSet(query);
  const seen=new Set();
  const aiTerms=[];
  const resultTerms=new Map();
  const clean=value=>{
    const text=String(value||'').trim().replace(/\s+/g,' ');
    if(text.length<2||text.length>28)return'';
    const key=text.toLocaleLowerCase();
    if(used.has(key)||seen.has(key)||relatedKeywordStopWords.has(key))return'';
    if(!/[\p{L}\p{N}]/u.test(text)||/^[\p{N}\p{P}\s]+$/u.test(text))return'';
    return text;
  };
  const pushAi=value=>{const text=clean(value);if(!text)return;seen.add(text.toLocaleLowerCase());aiTerms.push(text);};
  const countResult=value=>{const text=clean(value);if(!text)return;const key=text.toLocaleLowerCase();resultTerms.set(key,{text,count:(resultTerms.get(key)?.count||0)+1});};
  const analysis=result?.ai_discovery?.analysis||null;
  (analysis?.search_keywords||[]).forEach(pushAi);
  (analysis?.product_candidates||[]).forEach(candidate=>{pushAi(candidate?.brand);pushAi(candidate?.name);});
  (analysis?.features||[]).forEach(pushAi);
  (result?.candidates||[]).forEach(candidate=>{
    (candidate?.evidence?.matched_terms||[]).forEach(countResult);
    splitKeywordTokens(candidate?.display_name||candidate?.product_name||'').forEach(countResult);
  });
  const ranked=[...resultTerms.values()].sort((a,b)=>b.count-a.count).map(entry=>entry.text);
  return{aiSourced:aiTerms.length>0,terms:[...aiTerms,...ranked].slice(0,12)};
}
function applyRelatedKeyword(term){
  // " / " is the refinement separator runKnowledgeSearch() already parses to
  // detect "same root, narrowed" - reusing it keeps searchAttempt correct.
  const current=String(elements.query.value||'').trim();
  elements.query.value=current?`${current} / ${term}`:term;
  elements.clear?.classList.remove('hidden');
  runKnowledgeSearch();
}
function relatedKeywordCard(result){
  const language=elements.language.value;
  const query=String(elements.query.value||'');
  const{aiSourced,terms}=relatedKeywordSuggestions(result,query);
  if(terms.length<5)return null;
  const copy=relatedKeywordCopy[language]||relatedKeywordCopy.JA;
  const card=document.createElement('article');
  card.className='refinement-card related-keyword-card';
  const wrap=document.createElement('div');
  wrap.className='keyword-tag-block related-keyword-block';
  wrap.append(textElement('span','ai-intent-label keyword-tag-label',aiSourced?copy.ai:copy.result));
  const list=document.createElement('div');
  list.className='keyword-tag-list';
  terms.forEach(term=>{
    const chip=document.createElement('button');
    chip.type='button';
    chip.className='keyword-tag related-keyword-tag';
    chip.textContent=term;
    chip.addEventListener('click',()=>applyRelatedKeyword(term));
    list.append(chip);
  });
  wrap.append(list);
  const note=textElement('p','related-keyword-note',copy.body);
  const button=document.createElement('button');
  button.type='button';
  button.className='secondary related-keyword-refine';
  button.textContent=copy.button;
  button.addEventListener('click',()=>{focusSearch();setTimeout(()=>{const end=elements.query.value.length;elements.query.setSelectionRange(end,end);},380);});
  card.append(wrap,note,button);
  return card;
}
// Condition search (Phase C item 11, 2026-08-07). This is the second entry
// point into the SAME search condition the AI free-text box drives, not a
// separate search mode: picking chips appends their labels to the current
// query with " / " - exactly what applyRefinementChips() does server-side and
// what runKnowledgeSearch() already parses as "same root, narrowed". So one
// query string remains the single condition model, reachable either by
// describing the product in words or by picking conditions.
//
// The groups, labels and per-language copy all come from the server
// (refinement_chips, built by search-refinement-policy.mjs) so this file
// never holds a second copy of that dictionary. One value per dimension,
// matching applyRefinementChips()'s own one-chip-per-dimension rule.
const conditionSearchCopy={
  JA:{title:'条件で絞り込む',body:'各項目から1つずつ選べます。選んだ条件は今の検索にそのまま追加されます。',submit:'この条件で探す'},
  EN:{title:'Narrow by condition',body:'Pick up to one from each row. Your choices are added to the current search.',submit:'Search with these conditions'},
  ZH:{title:'按条件筛选',body:'每项最多选择一个，所选条件将直接加入当前搜索。',submit:'用这些条件搜索'},
  KO:{title:'조건으로 좁히기',body:'각 항목에서 하나씩 선택할 수 있습니다. 선택한 조건은 현재 검색에 추가됩니다.',submit:'이 조건으로 찾기'}
};
function conditionSearchCard(groups){
  groups=(Array.isArray(groups)?groups:[]).filter(group=>group?.label&&group?.values?.length);
  if(!groups.length)return null;
  const copy=conditionSearchCopy[elements.language.value]||conditionSearchCopy.JA;
  const selected=new Map();
  const card=document.createElement('article');
  card.className='condition-search-card';
  card.append(textElement('strong','condition-search-title',copy.title),textElement('p','condition-search-body',copy.body));
  const submit=document.createElement('button');
  submit.type='button';
  submit.className='primary condition-search-submit';
  submit.textContent=copy.submit;
  submit.disabled=true;
  groups.forEach(group=>{
    const row=document.createElement('div');
    row.className='condition-group';
    row.append(textElement('span','condition-group-label',group.label));
    const list=document.createElement('div');
    list.className='condition-value-list';
    group.values.filter(item=>item?.label).forEach(item=>{
      const chip=document.createElement('button');
      chip.type='button';
      chip.className='keyword-tag condition-chip';
      chip.textContent=item.label;
      chip.setAttribute('aria-pressed','false');
      chip.addEventListener('click',()=>{
        const active=selected.get(group.dimension)===item.label;
        // one value per dimension: clear the row, then set unless re-tapped
        [...list.children].forEach(node=>{node.classList.remove('selected');node.setAttribute('aria-pressed','false');});
        if(active)selected.delete(group.dimension);
        else{selected.set(group.dimension,item.label);chip.classList.add('selected');chip.setAttribute('aria-pressed','true');}
        submit.disabled=selected.size===0;
      });
      list.append(chip);
    });
    row.append(list);
    card.append(row);
  });
  submit.addEventListener('click',()=>{
    if(!selected.size)return;
    const base=String(elements.query.value||'').trim();
    elements.query.value=[base,...selected.values()].filter(Boolean).join(' / ');
    elements.clear?.classList.remove('hidden');
    runKnowledgeSearch();
  });
  card.append(submit);
  return card;
}
function marketplaceFallbackGroup(label,linksNode,description,searchJumpLabel){if(!linksNode)return null;const group=document.createElement('div');group.className='marketplace-fallback-group';group.append(textElement('p','marketplace-fallback-group-label',label));if(description)group.append(textElement('p','marketplace-fallback-group-description',description));if(searchJumpLabel){const jump=document.createElement('button');jump.type='button';jump.className='marketplace-fallback-search-jump';jump.textContent=searchJumpLabel;jump.addEventListener('click',()=>{document.querySelector('#hoshiluSearch')?.scrollIntoView({behavior:'smooth',block:'start'});window.setTimeout(()=>elements.query?.focus({preventScroll:true}),450);});group.append(jump);}group.append(linksNode);return group;}
function marketplaceFallbackCard(result){if(!result?.marketplace_search_links?.length&&!result?.amazon_search_url)return null;const labels={
  JA:{heading:'13モールとSNSを横断して探す',directLabel:'個別に探す',directBody:'各ショップでも同じ条件で探せます。',searchJump:'※まとめて検索する場合は、ホシル検索へ。',socialLabel:'SNSで探す',socialBody:'Instagram・TikTokは検索語もコピーして開きます。検索欄が空の場合は、そのまま貼り付けてください。'},
  EN:{heading:'Search 13 marketplaces and social platforms',directLabel:'Search individually',directBody:'You can search the same terms directly on each shop.',searchJump:'※For a combined search, go to HOSHILU Search.',socialLabel:'Social search',socialBody:'Instagram and TikTok also copy the search terms. Paste them if the app opens with an empty search field.'},
  ZH:{heading:'跨13个商城和社交平台查找',directLabel:'单独搜索',directBody:'您可以在各商城使用相同条件继续搜索。',searchJump:'※如需一次搜索多个商城，请前往HOSHILU搜索。',socialLabel:'社交平台',socialBody:'打开Instagram或TikTok时也会复制搜索词。如搜索框为空，请直接粘贴。'},
  KO:{heading:'13개 쇼핑몰과 SNS에서 함께 찾기',directLabel:'개별 검색',directBody:'각 쇼핑몰에서도 같은 조건으로 찾을 수 있습니다.',searchJump:'※한번에 검색하려면 HOSHILU 검색으로 이동하세요.',socialLabel:'SNS',socialBody:'Instagram과 TikTok을 열 때 검색어도 복사합니다. 검색창이 비어 있으면 그대로 붙여넣으세요.'}
};const {heading,directLabel,directBody,searchJump,socialLabel,socialBody}=labels[elements.language.value]||labels.JA;const actions=actionCopy[elements.language.value]||actionCopy.JA;const language=elements.language.value;const card=document.createElement('article');card.className='refinement-card marketplace-fallback';card.id='marketplaceFallback';const intro=document.createElement('div');intro.className='marketplace-fallback-intro';intro.append(textElement('strong','',heading));const analysis=result?.ai_discovery?.analysis||null;const intentBlock=aiIntentSummaryBlock(analysis,language);if(intentBlock)intro.append(intentBlock);const candidateCards=aiCandidateCards(analysis?.product_candidates,language);if(candidateCards)intro.append(candidateCards);const keywords=String(result?.search_keywords||result?.amazon_search_keywords||elements.query.value||'');const tagBlock=keywordTagBlock(keywords,actions,(aiIntentLabels[language]||aiIntentLabels.JA).keywords);if(tagBlock)intro.append(tagBlock);card.append(intro);const legacy=result.amazon_search_url?[{marketplace:'AMAZON_JP',label:'Amazonで探す',url:result.amazon_search_url,mode:'direct'}]:[];const allLinks=result.marketplace_search_links?.length?result.marketplace_search_links:legacy;const directGroup=marketplaceFallbackGroup(directLabel,marketplaceLinks(allLinks),directBody,searchJump);if(directGroup)card.append(directGroup);const socialLinks=marketplaceLinks(socialDiscoverySearchLinks(keywords));if(socialLinks){socialLinks.classList.add('social-search-links');const socialGroup=marketplaceFallbackGroup(socialLabel,socialLinks,socialBody);if(socialGroup)card.append(socialGroup);}return card;}
function aiDiscoveryCard(result){const items=(result?.ai_discovery?.candidates||[]).filter(item=>item?.url&&item?.image).slice(0,3);if(!items.length)return null;const labels={JA:['AIが見つけた可能性のある商品','API連携モールで確認できなかったため、公開Webから近い候補を探しました。未確認候補のため、商品ページで内容を確認してください。','候補ページを見る'],EN:['Possible products found by AI','The connected marketplaces had no confirmed match, so AI searched the public web. These are unconfirmed leads; verify the product page.','View candidate page'],ZH:['AI找到的可能商品','API连接商城均无确认结果，因此AI搜索了公开网页。这些是未确认候选，请在商品页核实。','查看候选页面'],KO:['AI가 찾은 가능성 있는 상품','API 연동 쇼핑몰에서 확인되지 않아 공개 웹에서 비슷한 후보를 찾았습니다. 미확인 후보이므로 상품 페이지에서 확인하세요.','후보 페이지 보기']}[elements.language.value]||null;const card=document.createElement('article');card.className='ai-discovery-card';card.append(textElement('span','ai-discovery-badge','AI DISCOVERY'),textElement('h3','',labels[0]),textElement('p','ai-discovery-notice',labels[1]));const list=document.createElement('div');list.className='ai-discovery-list';items.forEach(item=>{const link=document.createElement('a');link.className='ai-discovery-item';link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';const image=document.createElement('img');image.src=item.image;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';link.append(image,textElement('strong','',item.title),textElement('small','',item.source||''),textElement('span','',labels[2]));list.append(link);});card.append(list);return card;}// 2026-08-07: 提示欄を上下2段に分割する（Phase C 項目A）。
// 上段 = 接続済みモールで送料込みの合計金額を実際に確認できた商品。
// 下段 = 商品としては実在するが、価格・在庫が確認できていない商品。
// API連携できた商品だけを出すと提示数が極端に少なくなるが、HOSHILUは価格を
// 推測しない。したがって下段は「価格・在庫は未確認」と明示したうえで、商品
// ページへのリンクだけを出す。各段の上限は30件（Worker側は合計60件まで返す）。
function productImageGallery(candidate){
  const urls=[...(Array.isArray(candidate?.image_urls)?candidate.image_urls:[]),candidate?.image,candidate?.image_url]
    .map(value=>String(value||'').trim())
    .filter((value,index,values)=>/^https:\/\//i.test(value)&&values.indexOf(value)===index)
    .slice(0,8);
  if(!urls.length)return null;
  const gallery=document.createElement('div');
  gallery.className='product-image-gallery';
  const image=document.createElement('img');
  image.className='product-image';
  image.src=urls[0];
  image.alt=String(candidate?.display_name||candidate?.product_name||'商品画像');
  image.loading='lazy';
  image.referrerPolicy='no-referrer';
  image.tabIndex=0;
  image.setAttribute('role','button');
  image.setAttribute('aria-label','商品画像を拡大して見る');
  gallery.append(image);

  let current=0;
  let count=null;
  const show=index=>{
    current=(index+urls.length)%urls.length;
    image.src=urls[current];
    if(count)count.textContent=`${current+1} / ${urls.length}`;
  };
  if(urls.length>1){
    const previous=document.createElement('button');
    previous.type='button';previous.className='product-image-gallery-button previous';previous.textContent='‹';previous.setAttribute('aria-label','前の画像を見る');
    const next=document.createElement('button');
    next.type='button';next.className='product-image-gallery-button next';next.textContent='›';next.setAttribute('aria-label','次の画像を見る');
    count=textElement('span','product-image-gallery-count',`1 / ${urls.length}`);
    previous.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();show(current-1);});
    next.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();show(current+1);});
    gallery.append(previous,next,count);
  }

  const lightbox=document.createElement('dialog');
  lightbox.className='product-image-lightbox';
  lightbox.setAttribute('aria-label','商品画像ギャラリー');
  const close=document.createElement('button');
  close.type='button';close.className='product-image-lightbox-close';close.textContent='✕';close.setAttribute('aria-label','拡大画像を閉じる');
  const track=document.createElement('div');
  track.className='product-image-lightbox-track';
  urls.forEach((url,index)=>{
    const slide=document.createElement('div');
    slide.className='product-image-lightbox-slide';
    const expanded=document.createElement('img');
    expanded.src=url;expanded.alt=`${image.alt} ${index+1}枚目`;expanded.loading='lazy';expanded.referrerPolicy='no-referrer';
    slide.append(expanded);track.append(slide);
  });
  const lightboxCount=textElement('span','product-image-lightbox-count',`1 / ${urls.length}`);
  lightbox.append(close,track,lightboxCount);
  const openLightbox=()=>{
    if(typeof lightbox.showModal==='function')lightbox.showModal();else lightbox.setAttribute('open','');
    requestAnimationFrame(()=>track.scrollTo({left:current*track.clientWidth,behavior:'instant'}));
    lightboxCount.textContent=`${current+1} / ${urls.length}`;
  };
  image.addEventListener('click',openLightbox);
  image.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openLightbox();}});
  close.addEventListener('click',()=>lightbox.close());
  lightbox.addEventListener('click',event=>{if(event.target===lightbox)lightbox.close();});
  track.addEventListener('scroll',()=>{
    const index=Math.max(0,Math.min(urls.length-1,Math.round(track.scrollLeft/Math.max(1,track.clientWidth))));
    show(index);
    lightboxCount.textContent=`${index+1} / ${urls.length}`;
  },{passive:true});
  gallery.append(lightbox);
  return gallery;
}
function productCard(candidate,index,t,confirmed,searchQuery=''){
  const card=document.createElement('article');
  card.className=confirmed?'product-card':'product-card unverified-card';
  const safeRank=Math.max(1,Number(candidate.rank)||index+1);
  card.append(textElement('span','rank',`NO. ${safeRank}`));
  if(!confirmed)card.append(textElement('span','unverified-badge',resultRowCopyFor(elements.language.value).badge));
  const mediaColumn=document.createElement('div');
  mediaColumn.className='product-card-media-column';
  const gallery=productImageGallery(candidate);
  if(gallery)mediaColumn.append(gallery);
  const mediaActions=document.createElement('div');
  mediaActions.className='product-card-media-actions';
  mediaColumn.append(mediaActions);
  card.append(mediaColumn);
  const title=textElement('h3','',candidate.display_name||candidate.product_name||candidate.asin);
  card.append(title);
  if(!confirmed&&candidate.recommendation_reason)title.after(textElement('div','recommendation-reason',`AI選定理由：${candidate.recommendation_reason}`));
  if(candidate.description)card.append(textElement('p','',candidate.description));
  const terms=candidate.evidence?.matched_terms||[];
  if(terms.length)card.append(textElement('div','evidence',`${window.HoshiluI18n?.t('search.evidence',elements.language.value)||'一致した手がかり：'}${terms.slice(0,4).join(' / ')}`));
  const options=renderOfferOptions(candidate,t,elements.language.value);
  if(options)card.append(options);else card.append(allMarketplacesButton());
  const watch=createWatchOptions(candidate,t);
  mediaActions.append(watch.bell);
  card.append(watch.dialog);
  window.HoshiluPriceComparison?.attach(card,{...candidate,search_query:searchQuery||candidate.search_query||'',search_category:searchQuery||candidate.search_category||candidate.related_category||''});
  const priceComparisonButton=card.querySelector(':scope > .ai-price-compare-button');
  if(priceComparisonButton)mediaActions.append(priceComparisonButton);
  return card;
}
function rankingCard(candidate,index,rankingType,searchQuery,rankingKind='popularity'){
  const card=productCard(candidate,index,selectedCopy(),true,searchQuery);
  card.classList.add('ranking-product-card');
  const rank=card.querySelector(':scope > .rank');
  const number=Math.max(1,Number(rankingKind==='cheapest'?candidate.ai_cheapest_rank:(candidate.hoshilu_popularity_rank||candidate.rank))||index+1);
  if(rank)rank.textContent=number===1?'🥇 1位':number===2?'🥈 2位':number===3?'🥉 3位':`${number}位`;
  const review=document.createElement('div');review.className='ranking-review-summary';
  const average=Number(candidate.review_average)||0;const count=Math.max(0,Number(candidate.review_count)||0);
  review.textContent=average&&count?`★ ${average.toFixed(2)} ・ 口コミ ${count.toLocaleString()}件`:'口コミ評価は公式データ未取得';
  const title=card.querySelector(':scope > h3');
  const fullTitle=String(title?.textContent||candidate.display_name||candidate.product_name||'商品名未取得').trim();
  if(title){title.classList.add('ranking-product-title');title.title=fullTitle;title.after(review);}
  const description=card.querySelector(':scope > p');
  const descriptionText=String(description?.textContent||'').trim();
  description?.remove();
  const evidence=card.querySelector(':scope > .evidence');
  evidence?.remove();
  let detailsAnchor=review;
  if(rankingKind==='cheapest'){
    const price=document.createElement('div');price.className='ranking-price-summary';
    const min=Math.max(0,Number(candidate.ai_cheapest_price_min)||0);const max=Math.max(min,Number(candidate.ai_cheapest_price_max)||min);
    if(candidate.ai_cheapest_price_source==='AI_ESTIMATE'){
      price.classList.add('ai-estimated');price.textContent=`AI推定価格 約¥${min.toLocaleString()}〜¥${max.toLocaleString()}（参考）`;
    }else if(candidate.ai_cheapest_price_source==='CONFIRMED_TOTAL')price.textContent=`確認済み送料込み価格 ¥${min.toLocaleString()}`;
    else price.textContent=`確認済み商品価格 ¥${min.toLocaleString()}（送料は別途確認）`;
    review.after(price);detailsAnchor=price;
  }
  const details=document.createElement('details');details.className='ranking-product-details';
  const summary=document.createElement('summary');summary.append(textElement('span','ranking-details-open','詳細を見る'),textElement('span','ranking-details-close','閉じる'));
  const content=document.createElement('div');content.className='ranking-product-details-content';
  content.append(textElement('strong','ranking-full-product-title',fullTitle));
  if(descriptionText)content.append(textElement('p','ranking-product-description',descriptionText));
  if(evidence)content.append(evidence);
  details.append(summary,content);detailsAnchor.after(details);
  card.dataset.rankingType=rankingType;
  return card;
}
function resultCarousel(cards,rowKind='confirmed'){
  const carousel=document.createElement('div');
  carousel.className='result-carousel';
  const track=document.createElement('div');
  track.className='result-track';
  track.append(...cards);
  carousel.append(track);
  if(rowKind!=='recommended')attachVerticalTicker(track,{intervalMs:6500,rowSelector:':scope > .product-card',useRowOffsets:true});
  if(cards.length>3){
    const previous=document.createElement('button');
    const horizontal=rowKind==='recommended';
    previous.type='button';previous.className='carousel-button previous';previous.setAttribute('aria-label','前の商品を見る');previous.textContent=horizontal?'‹':'↑';
    const next=document.createElement('button');
    next.type='button';next.className='carousel-button next';next.setAttribute('aria-label','次の商品を見る');next.textContent=horizontal?'›':'↓';
    const move=direction=>{const first=track.querySelector(':scope > .product-card');const distance=horizontal?(first?.getBoundingClientRect().width||280)+14:(first?.getBoundingClientRect().height||220)+14;track.scrollBy(horizontal?{left:direction*distance,behavior:'smooth'}:{top:direction*distance,behavior:'smooth'});};
    previous.addEventListener('click',()=>move(-1));
    next.addEventListener('click',()=>move(1));
    carousel.append(previous,next);
  }
  return carousel;
}
function resultRow(cards,title,note,rowKind){
  if(!cards.length)return null;
  const row=document.createElement('section');
  row.className=`result-row result-row-${rowKind}`;
  row.dataset.row=rowKind;
  const heading=document.createElement('div');
  heading.className='result-row-heading';
  heading.append(textElement('h3','result-row-title',title),textElement('span','result-row-count',String(cards.length)));
  row.append(heading,textElement('p','result-row-note',note),resultCarousel(cards,rowKind));
  return row;
}
function renderResults(result,requestId){
  // resultCarouselは検索ごとに新しいtrackを作るため、DOMから外す前に旧tickerの
  // interval・アニメーション・イベントを明示解除する。
  elements.cards.querySelectorAll('.result-track').forEach(detachVerticalTicker);
  const t=selectedCopy();
  elements.results.classList.remove('hidden');
  elements.message.textContent=result.message||'';
  const copy=resultRowCopyFor(elements.language.value);
  const {confirmed}=splitCandidateRows(result.candidates,RESULT_ROW_LIMIT);
  const recommended=(Array.isArray(result.related_recommendations)?result.related_recommendations:[]).slice(0,RESULT_ROW_LIMIT);
  console.info('SEARCH_TRACE_CLIENT',{requestId,stage:'11_ui_render',ui_render_count:confirmed.length+recommended.length,ui_confirmed_count:confirmed.length,ui_recommended_count:recommended.length});
  const sharedSearchQuery=String(result?.search_keywords||result?.amazon_search_keywords||elements.query.value||'');
  const rows=[
    resultRow(confirmed.map((candidate,index)=>productCard(candidate,index,t,true,sharedSearchQuery)),copy.confirmedTitle,copy.confirmedNote,'confirmed'),
    resultRow(recommended.map((candidate,index)=>productCard(candidate,index,t,false,sharedSearchQuery)),copy.unconfirmedTitle,copy.unconfirmedNote,'recommended')
  ].filter(Boolean);
  if(rows.length){
    const resultCards=[];
    const clarification=clarificationCard(result);
    if(clarification)resultCards.push(clarification);
    resultCards.push(...rows);
    const relatedKeywords=relatedKeywordCard(result);
    if(relatedKeywords)resultCards.push(relatedKeywords);
    const marketplaceFallback=marketplaceFallbackCard(result);
    if(marketplaceFallback)resultCards.push(marketplaceFallback);
    elements.cards.replaceChildren(...resultCards);
  }else{
    const emptyCards=[];
    const clarification=clarificationCard(result);
    if(clarification)emptyCards.push(clarification);
    const empty=document.createElement('article');
    empty.className='empty-result';
    empty.append(textElement('p','',elements.query.value));
    const wish=document.createElement('button');
    wish.type='button';wish.className='wish-button';wish.textContent=t.wish;
    wish.addEventListener('click',()=>{saveInsightWatch(elements.query.value);wish.textContent=t.wishSaved;wish.disabled=true;});
    empty.append(wish);
    emptyCards.push(empty);
    const emptyRelatedKeywords=relatedKeywordCard(result);
    if(emptyRelatedKeywords)emptyCards.push(emptyRelatedKeywords);
    const aiCard=aiDiscoveryCard(result);
    if(aiCard)emptyCards.push(aiCard);
    const marketplaceFallback=marketplaceFallbackCard(result);
    if(marketplaceFallback)emptyCards.push(marketplaceFallback);
    elements.cards.replaceChildren(...emptyCards);
  }
  syncStickySearch();
  elements.results.scrollIntoView({behavior:'smooth',block:'start'});
}

let relatedRecommendationSequence=0;
async function loadRelatedRecommendations(query,sequence){
  const token=await waitForFreshTurnstileToken();
  if(!token||sequence!==relatedRecommendationSequence)return;
  const response=await fetch('/api/related-recommendations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
    query,consent:elements.consent.checked,session_id:sessionId,language:elements.language.value,turnstile_token:token
  })});
  const payload=await response.json();
  if(!response.ok||!payload.ok||sequence!==relatedRecommendationSequence)return;
  const recommendations=(Array.isArray(payload.result?.recommendations)?payload.result.recommendations:[]).slice(0,RESULT_ROW_LIMIT);
  const oldRow=elements.cards.querySelector('[data-row="recommended"]');
  if(!recommendations.length){oldRow?.remove();return;}
  const copy=resultRowCopyFor(elements.language.value);
  const row=resultRow(recommendations.map((candidate,index)=>productCard(candidate,index,selectedCopy(),false,query)),copy.unconfirmedTitle,copy.unconfirmedNote,'recommended');
  if(!row)return;
  if(oldRow)oldRow.replaceWith(row);else{
    const anchor=elements.cards.querySelector('.related-keywords-card,.marketplace-fallback');
    if(anchor)elements.cards.insertBefore(row,anchor);else elements.cards.append(row);
  }
}
async function initializeTurnstile(){ const response=await fetch('/api/config',{cache:'no-store'});if(!response.ok)throw new Error('TURNSTILE_NOT_CONFIGURED');const config=await response.json();for(let i=0;i<200&&!window.turnstile;i+=1)await new Promise(resolve=>setTimeout(resolve,50));if(!window.turnstile)throw new Error('TURNSTILE_UNAVAILABLE');await new Promise((resolve,reject)=>window.turnstile.ready(()=>{try{turnstileWidget=window.turnstile.render(elements.turnstile,{sitekey:config.turnstile_site_key,theme:'light',size:'flexible',retry:'auto','retry-interval':3000,'refresh-expired':'auto','error-callback':code=>console.warn('TURNSTILE_CLIENT_ERROR',String(code||'').slice(0,40))});resolve();}catch(error){reject(error);}})); }

const notificationUiCopy={JA:{title:'AIウォッチ通知',refresh:'更新',login:'無料会員でログインすると通知を確認できます。',empty:'通知はまだありません。',read:'既読にする',dismiss:'非表示'},EN:{title:'AI Watch alerts',refresh:'Refresh',login:'Sign in as a free member to see alerts.',empty:'No notifications yet.',read:'Mark read',dismiss:'Dismiss'},ZH:{title:'AI监控提醒',refresh:'更新',login:'登录免费会员后即可查看提醒。',empty:'暂无提醒。',read:'标为已读',dismiss:'隐藏'},KO:{title:'AI 워치 알림',refresh:'새로고침',login:'무료 회원으로 로그인하면 알림을 확인할 수 있습니다.',empty:'아직 알림이 없습니다.',read:'읽음',dismiss:'숨기기'}};
let memberNotifications=[];
async function updateNotification(id,action){const response=await fetch(`/api/member/notifications/${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action})});if(!response.ok)return false;if(action==='DISMISS')memberNotifications=memberNotifications.filter(item=>item.notification_id!==id);else memberNotifications=memberNotifications.map(item=>item.notification_id===id?{...item,read_at:new Date().toISOString()}:item);renderNotifications();return true;}
function safeNotificationSource(item){try{const url=new URL(String(item.source_url||''));return url.protocol==='https:'?url.toString():'';}catch{return '';}}
// Vertical ticker row (2026-08-05 v3/v4.0 instructions): one line per
// notification, unread first, unread/read visually distinguished, small
// thumbnail only. Replaces the previous 3-card-per-page horizontal
// carousel, but keeps every action the old card exposed (product click,
// read, dismiss) - v4.0 explicitly requires not dropping existing features,
// which the first ticker pass incorrectly did by removing the read/dismiss
// buttons entirely. A <div> (not <a>) is the row root so the action buttons
// can be real, independently-clickable <button> children without nesting
// interactive elements inside an <a>; the row itself is keyboard-operable
// via role="link"/tabindex.
function notificationRow(item,ui){const sourceUrl=safeNotificationSource(item);const row=document.createElement('div');row.className=`info-row notification-row${item.read_at?'':' unread'}`;row.tabIndex=0;row.setAttribute('role','link');const open=()=>{if(!item.read_at)updateNotification(item.notification_id,'READ');if(sourceUrl)window.open(sourceUrl,'_blank','noopener,noreferrer');};row.addEventListener('click',open);row.addEventListener('keydown',event=>{if(event.target===row&&(event.key==='Enter'||event.key===' ')){event.preventDefault();open();}});const dot=document.createElement('span');dot.className='info-row-label notification-unread-dot';dot.setAttribute('aria-hidden','true');if(item.image_url){const thumb=document.createElement('img');thumb.className='notification-thumb';thumb.src=item.image_url;thumb.alt='';thumb.loading='lazy';thumb.referrerPolicy='no-referrer';row.append(thumb);}else{row.append(dot);}const dateEl=document.createElement('time');dateEl.className='info-row-date';dateEl.textContent=new Date(item.delivered_at||item.created_at).toLocaleDateString();row.append(dateEl);const content=document.createElement('span');content.className='notification-row-content';const title=document.createElement('span');title.className='info-row-title';title.textContent=item.title;content.append(title);if(item.marketplace){const mall=document.createElement('span');mall.className='info-row-mall';mall.textContent=marketplaceLabel(item.marketplace);content.append(mall);}if(item.body){const body=document.createElement('span');body.className='notification-row-body';body.textContent=item.body;content.append(body);}row.append(content);const actions=document.createElement('span');actions.className='notification-row-actions';if(!item.read_at){const read=document.createElement('button');read.type='button';read.className='notification-row-action';read.setAttribute('aria-label',ui.read);read.textContent='✓';read.addEventListener('click',event=>{event.stopPropagation();updateNotification(item.notification_id,'READ');});actions.append(read);}const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='notification-row-action dismiss';dismiss.setAttribute('aria-label',ui.dismiss);dismiss.textContent='×';dismiss.addEventListener('click',event=>{event.stopPropagation();updateNotification(item.notification_id,'DISMISS');});actions.append(dismiss);row.append(actions);return row;}
function renderNotifications(){const ui=notificationUiCopy[elements.language.value]||notificationUiCopy.JA;const title=document.querySelector('#mywatchTitle'),refresh=document.querySelector('#refreshNotifications'),list=document.querySelector('#notificationList');title.textContent=ui.title;refresh.textContent=ui.refresh;if(!memberSession){list.replaceChildren(textElement('p','empty',ui.login));return;}if(!memberNotifications.length){list.replaceChildren(textElement('p','empty',ui.empty));return;}list.classList.add('info-row-list');const sorted=[...memberNotifications].sort((a,b)=>{const unreadDiff=Number(!a.read_at)-Number(!b.read_at);if(unreadDiff)return -unreadDiff;return new Date(b.delivered_at||b.created_at)-new Date(a.delivered_at||a.created_at);});list.replaceChildren(...sorted.map(item=>notificationRow(item,ui)));attachVerticalTicker(list);}
async function showNewDeviceNotifications(items){if(!('serviceWorker'in navigator)||!('Notification'in window)||Notification.permission!=='granted')return;const shown=new Set(JSON.parse(localStorage.getItem('hoshilu_device_notifications')||'[]'));const registration=await navigator.serviceWorker.ready;for(const item of items.filter((entry)=>!entry.read_at&&!shown.has(entry.notification_id))){registration.active?.postMessage({type:'HOSHILU_NOTIFY',id:item.notification_id,title:item.title,body:item.body});shown.add(item.notification_id);}localStorage.setItem('hoshilu_device_notifications',JSON.stringify([...shown].slice(-100)));}
async function loadNotifications(){if(!memberSession){memberNotifications=[];renderNotifications();return;}try{const response=await fetch('/api/member/notifications',{cache:'no-store'});if(!response.ok)throw new Error('NOTIFICATION_LOAD_FAILED');memberNotifications=((await response.json()).notifications||[]).filter(item=>item.wish_id!=='AI_WATCH_TEST');await showNewDeviceNotifications(memberNotifications);}catch{memberNotifications=[];}renderNotifications();}
function focusSearch(){document.querySelector('#hoshiluSearch').scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>elements.query.focus({preventScroll:true}),350);}
const topbar=document.querySelector('.topbar');const syncTopbarHeight=()=>document.documentElement.style.setProperty('--topbar-height',`${Math.ceil(topbar.getBoundingClientRect().height)}px`);syncTopbarHeight();new ResizeObserver(syncTopbarHeight).observe(topbar);document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();window.scrollTo({top:0,behavior:'smooth'});});
elements.searchModeIdentify.addEventListener('click',()=>{setSearchMode('identify');focusSearch();});
elements.searchModeDirect.addEventListener('click',()=>{setSearchMode('direct');focusSearch();});
elements.discoveryExample.addEventListener('click',()=>{elements.query.value=elements.discoveryExample.textContent;elements.clear.classList.remove('hidden');focusSearch();});
document.querySelector('#refreshNotifications').addEventListener('click',loadNotifications);
setInterval(()=>{if(document.visibilityState==='visible'&&memberSession)loadNotifications();},300000);
elements.memberLogout.addEventListener('click',async()=>{elements.memberLogout.disabled=true;try{await fetch('/api/member/logout',{method:'POST'});}finally{memberSession=null;renderMemberState();elements.memberLogout.disabled=false;location.href='/';}});
elements.query.addEventListener('input',()=>elements.clear.classList.toggle('hidden',!elements.query.value));
elements.clear.addEventListener('click',()=>{elements.query.value='';searchAttempt=0;searchRoot='';elements.clear.classList.add('hidden');elements.query.focus();});
let wishMatchIndex=0;
elements.wishFilter.addEventListener('input',()=>{wishMatchIndex=0;renderWishes();elements.wishList.scrollTop=0;});
elements.wishFilter.addEventListener('keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();const matches=[...elements.wishList.querySelectorAll('.wish-cycle:first-child .wish-item')];if(!matches.length)return;const target=matches[wishMatchIndex%matches.length];wishMatchIndex=(wishMatchIndex+1)%matches.length;matches.forEach(item=>{item.open=false;});target.open=true;elements.wishList.scrollTo({top:Math.max(0,target.offsetTop-matches[0].offsetTop),behavior:'smooth'});});

function issueTurnstileToken(token){lastIssuedTurnstileToken=token;return token;}
async function waitForTurnstileToken(){for(let attempt=0;attempt<150;attempt+=1){const token=window.turnstile?.getResponse(turnstileWidget)||'';if(token&&token!==lastIssuedTurnstileToken)return issueTurnstileToken(token);if(attempt===0&&lastIssuedTurnstileToken&&turnstileWidget!==null)window.turnstile?.reset(turnstileWidget);await new Promise(resolve=>setTimeout(resolve,100));}return '';}
// v3.4 fix: Turnstile tokens are single-use server-side. The main search
// form already resets the widget after every submission (see the form's
// finally block), but Chrome may briefly keep returning the consumed response
// while reset is being applied. Track every token handed to an API and accept
// only a different value. HOSHILU AI Chat also resets before every turn so a
// multi-turn dialog cannot replay the preceding response.
async function waitForFreshTurnstileToken(){if(turnstileWidget!==null)window.turnstile?.reset(turnstileWidget);for(let attempt=0;attempt<100;attempt+=1){const token=window.turnstile?.getResponse(turnstileWidget)||'';if(token&&token!==lastIssuedTurnstileToken)return issueTurnstileToken(token);await new Promise(resolve=>setTimeout(resolve,100));}return '';}
// Exposed for ai-search-ui.mjs (HOSHILU AI Chat), which needs the same
// session_id and Turnstile token as the main search form. Uses a window
// global rather than an ES module import so app.js is never evaluated a
// second time under a different cache-busting query string (which would
// silently double-register the form's submit listener).
window.HoshiluChatAuth={sessionId,requestToken:()=>waitForFreshTurnstileToken()};
function renderCuratedDiscoveryMatch(){const existing=elements.cards.querySelector('.curated-discovery-match');const match=swippittDiscoveryMatch(elements.query.value);if(!match){existing?.remove();return;}if(existing)return;const language=elements.language.value||'JA';const question={JA:'これですか？↓',EN:'Is this it? ↓',ZH:'是这个吗？↓',KO:'이 제품인가요? ↓'}[language]||'これですか？↓';const card=document.createElement('article');card.className='product-card curated-discovery-match';const mediaLink=document.createElement('a');mediaLink.className='curated-discovery-media-link';mediaLink.href=match.url;mediaLink.target='_blank';mediaLink.rel='noopener noreferrer';mediaLink.setAttribute('aria-label',`${match.name} 公式サイト`);const image=document.createElement('img');image.className='product-image curated-discovery-media';image.src=match.imageUrl;image.alt='Swippitt HubとSwippitt Link';image.loading='lazy';image.decoding='async';image.referrerPolicy='no-referrer';mediaLink.append(image);card.append(textElement('span','rank','HOSHILU VERIFIED MATCH'),textElement('strong','curated-match-question',question),mediaLink,textElement('h3','',match.name),textElement('p','',match.description));const link=document.createElement('a');link.className='buy-link';link.href=match.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Swippitt公式サイトで確認';card.append(link);elements.cards.prepend(card);}
const curatedDiscoveryObserver=new MutationObserver(renderCuratedDiscoveryMatch);curatedDiscoveryObserver.observe(elements.cards,{childList:true});
// Extracted from the form's submit handler so the AI chat flow (ai-search-
// ui.mjs) can run the exact same search - real success/failure included -
// instead of faking a click and polling elements.submit.disabled, which
// could not distinguish "results rendered" from "silently did nothing".
// Exposed on window (see the HoshiluChatAuth precedent above) for the same
// reason: app.js must never be evaluated a second time as an ES module.
async function runKnowledgeSearch(){const t=selectedCopy();const submittedQuery=String(elements.query.value||'').trim();const currentRoot=submittedQuery.split(' / ')[0].trim().toLocaleLowerCase();searchAttempt=currentRoot&&currentRoot===searchRoot?Math.min(2,searchAttempt+1):1;searchRoot=currentRoot;elements.status.className='status';elements.status.textContent=t.loading;elements.submit.disabled=true;const sequence=++relatedRecommendationSequence;try{const token=await waitForTurnstileToken();if(!token)throw new Error('TURNSTILE_TOKEN_UNAVAILABLE');const response=await fetch('/api/knowledge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:submittedQuery,consent:elements.consent.checked,session_id:sessionId,language:elements.language.value,search_attempt:searchAttempt,turnstile_token:token,...(window.HoshiluGrowthAttribution||{})})});const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||'SEARCH_FAILED');const effectiveQuery=String(payload.result?.ai_query_refinement?.effective_query||'').trim();if(effectiveQuery&&effectiveQuery!==elements.query.value){elements.query.value=effectiveQuery;elements.query.dispatchEvent(new Event('input',{bubbles:true}));}rememberMemberSearch(elements.query.value);renderResults(payload.result,response.headers.get('x-request-id'));document.dispatchEvent(new CustomEvent('hoshilu:search-completed'));elements.status.textContent='';setTimeout(()=>{loadRelatedRecommendations(effectiveQuery||submittedQuery,sequence).catch(()=>{});},0);return{ok:true,result:payload.result};}catch(error){const safeError=String(error?.message||error).slice(0,80);console.warn('HOSHILU_SEARCH_FAILED',safeError);rememberMemberSearch(elements.query.value);renderResults(emergencyMarketplaceFallback(elements.query.value));document.dispatchEvent(new CustomEvent('hoshilu:search-failed'));elements.status.className='status';elements.status.textContent='';return{ok:false,error:safeError};}finally{elements.submit.disabled=false;if(turnstileWidget!==null)window.turnstile?.reset(turnstileWidget);}}

// Advanced (condition) search panel (2026-08-07 request). Originally rendered
// with the results; moved into the search panel under the query box and the
// example chips, collapsed behind a 詳細検索 button, so conditions can be set
// BEFORE the first search instead of only narrowing one afterwards. Because
// it now renders before any search exists, the chips come from
// /api/refinement-chips rather than from a search response - still built by
// the same search-refinement-policy module, so there is one dictionary.
let advancedSearchGroups=null;
async function loadRefinementChips(){
  const language=elements.language.value;
  try{
    const response=await fetch(`/api/refinement-chips?language=${encodeURIComponent(language)}`,{cache:'no-store'});
    if(!response.ok)return null;
    return (await response.json()).groups||null;
  }catch{return null;}
}
async function renderAdvancedSearch(){
  const panel=document.querySelector('#advancedSearchPanel');
  const toggle=document.querySelector('#advancedSearchToggle');
  if(!panel||!toggle)return;
  const actions=actionCopy[elements.language.value]||actionCopy.JA;
  const open=toggle.getAttribute('aria-expanded')==='true';
  toggle.textContent=open?actions.advancedSearchClose:actions.advancedSearch;
  if(!open){panel.classList.add('hidden');return;}
  if(!advancedSearchGroups)advancedSearchGroups=await loadRefinementChips();
  const card=conditionSearchCard(advancedSearchGroups);
  // No chips (offline / endpoint down) means nothing to choose, so the panel
  // stays closed rather than opening on an empty box.
  if(!card){toggle.setAttribute('aria-expanded','false');toggle.textContent=actions.advancedSearch;panel.classList.add('hidden');return;}
  panel.replaceChildren(card);
  panel.classList.remove('hidden');
}
document.querySelector('#advancedSearchToggle')?.addEventListener('click',()=>{
  const toggle=document.querySelector('#advancedSearchToggle');
  toggle.setAttribute('aria-expanded',String(toggle.getAttribute('aria-expanded')!=='true'));
  renderAdvancedSearch();
});

// Persistent search bar over the results (2026-08-07 request). Once products
// are on screen the query has to stay reachable, so the user can add a word
// and re-search instead of scrolling back to the original panel.
//
// It deliberately does NOT hold its own state. #query stays the single source
// of truth that runKnowledgeSearch() reads and that the AI related-keyword
// chips and condition chips write into; this bar mirrors #query on every
// render and writes back into it on submit. Keeping one field authoritative
// is what stops the two inputs from drifting apart and searching different
// things.
const stickySearchCopy={
  JA:{placeholder:'ワードを足して絞り込む',submit:'絞り込む',label:'検索ワードを足して絞り込む',marketplaces:'モールで直接探す'},
  EN:{placeholder:'Add a word to narrow this search',submit:'Narrow',label:'Add a word to narrow this search',marketplaces:'Search directly on marketplaces'},
  ZH:{placeholder:'追加关键词以缩小范围',submit:'缩小范围',label:'追加关键词以缩小范围',marketplaces:'直接前往商城搜索'},
  KO:{placeholder:'단어를 추가해 좁히기',submit:'좁히기',label:'단어를 추가해 검색 좁히기',marketplaces:'쇼핑몰에서 직접 찾기'}
};
function syncStickySearch(){
  const form=document.querySelector('#stickySearch');
  const input=document.querySelector('#stickySearchInput');
  const submit=document.querySelector('#stickySearchSubmit');
  if(!form||!input||!submit)return;
  const copy=stickySearchCopy[elements.language.value]||stickySearchCopy.JA;
  input.placeholder=copy.placeholder;
  input.setAttribute('aria-label',copy.label);
  submit.textContent=copy.submit;
  const marketplaceJump=document.querySelector('#stickyMarketplaceJump');
  if(marketplaceJump)marketplaceJump.textContent=copy.marketplaces;
  // Only meaningful once there are results to refine.
  const showing=!elements.results.classList.contains('hidden');
  form.classList.toggle('hidden',!showing);
  // Do not clobber what the user is part-way through typing.
  if(showing&&document.activeElement!==input)input.value=elements.query.value;
}
document.querySelector('#stickySearch')?.addEventListener('submit',event=>{
  event.preventDefault();
  const input=document.querySelector('#stickySearchInput');
  const value=String(input?.value||'').trim();
  if(!value)return;
  elements.query.value=value;
  elements.clear?.classList.remove('hidden');
  runKnowledgeSearch();
});
document.querySelector('#stickyMarketplaceJump')?.addEventListener('click',()=>{
  document.querySelector('#marketplaceFallback')?.scrollIntoView({behavior:'smooth',block:'start'});
});
window.HoshiluSearch={run:runKnowledgeSearch};
elements.form.addEventListener('submit',event=>{event.preventDefault();const query=String(elements.query.value||'').trim();if(!isUsableProductQuery(query)){elements.query.focus();elements.status.textContent='商品名・ジャンル・覚えている特徴を入力してください。';return;}if(currentSearchMode()==='identify'&&typeof window.HoshiluIdentifySearch?.open==='function'){window.HoshiluIdentifySearch.open(query,elements.language.value);return;}runKnowledgeSearch();});
function returnFromRankingToSearch(){
  rankingRequestSequence+=1;rankingCategorySelection=null;rankingConfirmationFlow=null;
  if(elements.rankingDialog.open)elements.rankingDialog.close();
  elements.status.textContent='小ジャンルを特定できませんでした。検索文に種類・用途・対象などを追加してください。';
  elements.form.scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(()=>elements.query.focus(),300);
}
function renderRankingRefinement(rerun){
  elements.rankingModes.replaceChildren();
  elements.rankingStatus.textContent=`別の小ジャンルを探します。検索文に特徴を追加してください（NO ${rankingConfirmationFlow?.rejectionCount||0}/3）`;
  const instruction=document.createElement('form');instruction.className='ranking-category-instruction';
  const input=document.createElement('input');input.type='search';input.value=elements.query.value;input.placeholder='例：レディーススニーカー';input.setAttribute('aria-label','ランキングの小分類を入力');
  const submit=document.createElement('button');submit.type='submit';submit.textContent='AIにもう一度聞く';
  instruction.append(input,submit);instruction.addEventListener('submit',event=>{event.preventDefault();const value=String(input.value||'').trim();if(!isUsableProductQuery(value)){input.focus();return;}rankingCategorySelection=null;elements.query.value=value;rerun(null,{confirmationOnly:true,preserveRejections:true});});
  elements.rankingResults.replaceChildren(instruction);
  input.focus();
}
function renderRankingCategoryConfirmation(confirmation,rerun,rejectionCount=0){
  rankingConfirmationFlow=createRankingConfirmationFlow(confirmation.options||[],rejectionCount);
  elements.rankingModes.replaceChildren();
  const paint=()=>{
    const proposal=currentRankingCategoryProposal(rankingConfirmationFlow);
    if(!proposal){renderRankingRefinement(rerun);return;}
    elements.rankingStatus.textContent=confirmation.question||'このジャンルですか？';
    const card=document.createElement('section');card.className='ranking-confirmation-card';
    card.append(textElement('p','ranking-confirmation-guide',confirmation.guidance||'該当する場合はYES、違う場合はNOを押してください。'),textElement('strong','ranking-confirmation-label',proposal.label));
    const actions=document.createElement('div');actions.className='ranking-confirmation-actions';
    const yes=document.createElement('button');yes.type='button';yes.className='ranking-confirmation-yes';yes.textContent='YES';
    const no=document.createElement('button');no.type='button';no.className='ranking-confirmation-no';no.textContent='NO';
    yes.addEventListener('click',()=>{yes.disabled=true;no.disabled=true;rankingCategorySelection={id:proposal.value,label:proposal.label,genre_id:proposal.genre_id,source:proposal.source};rerun(rankingCategorySelection,{confirmationOnly:false,preserveRejections:false});});
    no.addEventListener('click',()=>{const outcome=rejectRankingCategoryProposal(rankingConfirmationFlow);rankingConfirmationFlow=outcome.flow;if(outcome.action==='return_to_search'){returnFromRankingToSearch();return;}if(outcome.action==='needs_refinement'){renderRankingRefinement(rerun);return;}paint();});
    actions.append(yes,no);card.append(actions,textElement('small','ranking-rejection-count',`NO ${rankingConfirmationFlow.rejectionCount}/3`));
    elements.rankingResults.replaceChildren(card);
  };
  paint();
}
function renderHoshiluRanking(result,rankingKind){
  const isCheapest=rankingKind==='cheapest';
  const ranking=isCheapest?result.ai_cheapest:{ranking_type:result.ranking_type,methodology:result.methodology,candidates:result.candidates};
  elements.rankingModes.querySelectorAll('.ranking-mode-button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===rankingKind)));
  elements.rankingStatus.textContent=`${result.category.label}｜${ranking.ranking_type}`;
  const nodes=[textElement('h3',`ranking-result-title${isCheapest?' ranking-ai-cheapest-title':''}`,ranking.ranking_type),textElement('p','ranking-ai-cheapest-methodology',ranking.methodology)];
  const categorySearchQuery=String(result.category?.label||'').split(/[>›»→]/u).map((value)=>value.trim()).filter(Boolean).at(-1)||String(result.category?.label||'').trim();
  if(ranking.candidates?.length)nodes.push(...ranking.candidates.map((candidate,index)=>rankingCard(candidate,index,ranking.ranking_type,categorySearchQuery,isCheapest?'cheapest':'popularity')));
  else nodes.push(textElement('p','ranking-ai-cheapest-disclaimer','この小ジャンルでは、現在価格を比較できる商品がありません。'));
  if(isCheapest&&ranking.disclaimer)nodes.push(textElement('p','ranking-ai-cheapest-disclaimer',ranking.disclaimer));
  elements.rankingResults.replaceChildren(...nodes);
}
function renderRankingModeChoices(result){
  elements.rankingStatus.textContent=`小ジャンル：${result.category.label}。見たいランキングを選んでください。`;
  elements.rankingResults.replaceChildren();elements.rankingModes.replaceChildren();
  [{mode:'popularity',label:'HOSHILU総合人気ランキング'},{mode:'cheapest',label:'HOSHILU最安値ランキング'}].forEach(item=>{const button=document.createElement('button');button.type='button';button.className='ranking-mode-button';button.dataset.mode=item.mode;button.setAttribute('aria-pressed','false');button.textContent=item.label;button.addEventListener('click',()=>renderHoshiluRanking(result,item.mode));elements.rankingModes.append(button);});
}
async function prepareHoshiluRankings(categorySelection=rankingCategorySelection,{confirmationOnly=categorySelection===null,preserveRejections=false}={}){
  const requestSequence=++rankingRequestSequence;
  const rejectionCount=preserveRejections?(rankingConfirmationFlow?.rejectionCount||0):0;
  if(!preserveRejections)rankingConfirmationFlow=null;
  elements.rankingStatus.textContent='AIが小ジャンルを確認しています…';elements.rankingResults.replaceChildren();elements.rankingModes.replaceChildren();
  try{
    const token=await waitForFreshTurnstileToken();if(!token)throw new Error('TURNSTILE_TOKEN_UNAVAILABLE');
    const response=await fetch('/api/hoshilu-rankings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:elements.query.value,category_selection:categorySelection,confirmation_only:confirmationOnly,consent:elements.consent.checked,session_id:sessionId,turnstile_token:token})});
    const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||'HOSHILU_RANKING_FAILED');
    if(requestSequence!==rankingRequestSequence||!elements.rankingDialog.open)return;
    const result=payload.result;
    if(result.mode==='category_confirmation'){renderRankingCategoryConfirmation(result.confirmation,prepareHoshiluRankings,rejectionCount);return;}
    if(result.mode==='clarification'){renderRankingCategoryConfirmation({question:'このジャンルですか？',guidance:result.clarification.guidance,options:result.clarification.options},prepareHoshiluRankings,rejectionCount);return;}
    renderRankingModeChoices(result);
  }catch{if(requestSequence===rankingRequestSequence&&elements.rankingDialog.open)elements.rankingStatus.textContent='現在、総合ランキングを取得できません。検索窓の文章を確認して、もう一度お試しください。';}
}
async function openRankingSearch(){
  if(!isUsableProductQuery(elements.query.value)){elements.query.focus();elements.status.textContent='ランキングを見たい商品カテゴリを入力してください。';return;}
  if(elements.rankingDialog.open)return;
  rankingCategorySelection=null;rankingConfirmationFlow=null;elements.rankingDialog.showModal();elements.rankingModes.replaceChildren();elements.rankingResults.replaceChildren();elements.rankingStatus.textContent='';
  prepareHoshiluRankings(null,{confirmationOnly:true,preserveRejections:false});
}
elements.rankingButton?.addEventListener('click',openRankingSearch);
document.querySelector('#rankingDialogClose')?.addEventListener('click',()=>{rankingRequestSequence+=1;rankingConfirmationFlow=null;elements.rankingDialog.close();});
elements.rankingDialog?.addEventListener('cancel',()=>{rankingRequestSequence+=1;rankingConfirmationFlow=null;});
elements.language.addEventListener('change',()=>{setLanguage(elements.language.value);renderMemberState();renderNotifications();advancedSearchGroups=null;renderAdvancedSearch();syncStickySearch();});
const installDialog=$('#installDialog');const installInstructions=$('#installInstructions');
function isStandalone(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;}
function showInstallHelp(){const language=elements.language.value||'JA';installInstructions.replaceChildren(...(installCopy[language]||installCopy.JA).map(value=>textElement('p','',value)));installDialog.showModal();}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
window.addEventListener('appinstalled',()=>{installPrompt=null;elements.install.classList.add('hidden');});
elements.install.addEventListener('click',async()=>{if(isStandalone()){elements.install.classList.add('hidden');return;}if(installPrompt){await installPrompt.prompt();const choice=await installPrompt.userChoice;installPrompt=null;if(choice.outcome==='accepted')elements.install.classList.add('hidden');return;}showInstallHelp();});
$('#installDialogClose').addEventListener('click',()=>installDialog.close());$('#installDialogDone').addEventListener('click',()=>installDialog.close());installDialog.addEventListener('click',event=>{if(event.target===installDialog)installDialog.close();});if(isStandalone())elements.install.classList.add('hidden');
const panelHeadingDetails=document.querySelector('.panel-heading-details');if(panelHeadingDetails&&!localStorage.getItem('hoshilu_panel_heading_seen')){panelHeadingDetails.open=true;localStorage.setItem('hoshilu_panel_heading_seen','1');}
// 2026-08-08: ヒーロー直下のMARKETPLACE COVERAGEウィジェットは、各ブラウザで
// 最初の1回だけ開いた状態にし、検索窓が下へ行き過ぎないよう2回目以降は
// 閉じておく(panelHeadingDetailsと同じ「1回だけ開く」パターン)。
const heroMarketplaceCoverageDetails=document.querySelector('#heroMarketplaceCoverage');if(heroMarketplaceCoverageDetails){heroMarketplaceCoverageDetails.open=!localStorage.getItem('hoshilu_hero_coverage_seen');localStorage.setItem('hoshilu_hero_coverage_seen','1');}
const browserLanguage=(navigator.languages?.[0]||navigator.language||'ja').toLowerCase();const initialLanguage=localStorage.getItem('mygate_language')||(/^en/.test(browserLanguage)?'EN':/^zh/.test(browserLanguage)?'ZH':/^ko/.test(browserLanguage)?'KO':'JA');setSearchMode(localStorage.getItem('hoshilu_search_mode')||'identify',false);setLanguage(initialLanguage);const inboundCampaign=campaignContext(location.search);if(inboundCampaign.query){elements.query.value=inboundCampaign.query;elements.clear.classList.remove('hidden');sessionStorage.setItem('hoshilu_campaign_context',JSON.stringify(inboundCampaign));focusSearch();}syncMemberWishes().then(loadNotifications);initializeTurnstile().catch(()=>{elements.status.className='status error';elements.status.textContent=window.HoshiluI18n?.t('search.securityPending',elements.language.value)||'公開検索のセキュリティ設定を確認中です。設定完了後に検索できます。';});if('serviceWorker'in navigator)navigator.serviceWorker.register('/service-worker.js');
