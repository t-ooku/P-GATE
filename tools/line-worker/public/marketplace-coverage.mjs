const COPY = {
  JA: {
    title: '探せるモールが、ひと目で分かる。',
    lead: '商品・家電・コスメなどは主要5モール。ファッション検索では5モールを追加して横断します。',
    count: '最大10モール対応',
    core: 'すべてのジャンル',
    coreAria: '主要5モール',
    fashion: 'ファッション検索で追加',
    fashionAria: 'ファッション追加5モール',
    note: '出品を確認できた商品は商品ページへ。未確認の場合は各モールの検索結果へ案内し、見つからなければInstagram・X・TikTok・YouTubeでも探せます。'
  },
  EN: {
    title: 'See where HOSHILU can search.',
    lead: 'Search five core marketplaces for every category, with five more added for fashion searches.',
    count: 'Up to 10 marketplaces',
    core: 'All categories',
    coreAria: 'Five core marketplaces',
    fashion: 'Added for fashion searches',
    fashionAria: 'Five additional fashion marketplaces',
    note: 'Verified listings open the product page. Otherwise, HOSHILU opens marketplace results, then lets you continue on Instagram, X, TikTok, and YouTube.'
  },
  ZH: {
    title: '一眼看懂可搜索的商城。',
    lead: '所有品类可搜索五个主要商城；搜索时尚商品时，再增加五个商城进行跨平台查找。',
    count: '最多支持10个商城',
    core: '所有品类',
    coreAria: '五个主要商城',
    fashion: '时尚搜索时追加',
    fashionAria: '五个时尚类追加商城',
    note: '已确认在售的商品会直接打开商品页；尚未找到时，还可继续在 Instagram、X、TikTok 和 YouTube 搜索。'
  },
  KO: {
    title: '검색 가능한 쇼핑몰을 한눈에.',
    lead: '모든 카테고리는 주요 5개 쇼핑몰, 패션 검색은 5개를 더해 함께 찾습니다.',
    count: '최대 10개 쇼핑몰',
    core: '모든 카테고리',
    coreAria: '주요 5개 쇼핑몰',
    fashion: '패션 검색 시 추가',
    fashionAria: '패션 추가 5개 쇼핑몰',
    note: '판매가 확인된 상품은 상품 페이지로 안내하고, 찾지 못하면 Instagram, X, TikTok, YouTube에서도 계속 검색할 수 있습니다.'
  }
};

const nodes = {
  title: document.querySelector('#marketplaceCoverageTitle'),
  lead: document.querySelector('#marketplaceCoverageLead'),
  count: document.querySelector('#marketplaceCoverageCount'),
  core: document.querySelector('#marketplaceCoreLabel'),
  coreList: document.querySelector('#marketplaceCoreList'),
  fashion: document.querySelector('#marketplaceFashionLabel'),
  fashionList: document.querySelector('#marketplaceFashionList'),
  note: document.querySelector('#marketplaceCoverageNote')
};

function selectedLanguage() {
  const saved = localStorage.getItem('mygate_language');
  return COPY[saved] ? saved : 'JA';
}

export function applyMarketplaceCoverage(language = selectedLanguage()) {
  const copy = COPY[language] || COPY.JA;
  if (!nodes.title) return;
  nodes.title.textContent = copy.title;
  nodes.lead.textContent = copy.lead;
  nodes.count.textContent = copy.count;
  nodes.core.textContent = copy.core;
  nodes.coreList.setAttribute('aria-label', copy.coreAria);
  nodes.fashion.textContent = copy.fashion;
  nodes.fashionList.setAttribute('aria-label', copy.fashionAria);
  nodes.note.textContent = copy.note;
}

document.addEventListener('hoshilu:languagechange', event => {
  applyMarketplaceCoverage(event.detail?.language);
});

applyMarketplaceCoverage();
