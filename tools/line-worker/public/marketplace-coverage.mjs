// v4.2 項目15・16: 「主要5モール/ファッション5モール」という分け方は、
// SHOPLIST/MUSINSAが標準検索から外れ新規5モールが加わったことで実態と
// ずれるため廃止。/api/knowledge のレスポンスが持つ integrated(=HOSHILUが
// 商品データを取得できる) / direct(=検索結果ページへ案内するだけ) という
// 区分に統一する(src/index.mjs の searchModeForMarketplace が唯一の判定元)。
const COPY = {
  JA: {
    title: '探せるモールが、ひと目で分かる。',
    lead: 'まとめて検索3モールと、個別に探す10モールに対応。',
    count: '最大13モール対応',
    core: 'まとめて検索',
    coreAria: 'HOSHILUが商品をまとめて探して比較する3モール',
    fashion: '個別に探す',
    fashionAria: 'HOSHILUの検索結果には含まれない、個別に探す10モール',
    note: '出品を確認できた商品は商品ページへ。未確認の場合は各モールの検索結果へ案内し、見つからなければInstagram・X・TikTok・YouTubeでも探せます。'
  },
  EN: {
    title: 'See where HOSHILU can search.',
    lead: 'HOSHILU compares 3 integrated marketplaces and links out to 10 more you can search directly.',
    count: 'Up to 13 marketplaces',
    core: 'Search together',
    coreAria: 'Three marketplaces HOSHILU compares directly',
    fashion: 'Search individually',
    fashionAria: 'Ten marketplaces not included in HOSHILU results, searchable directly',
    note: 'Verified listings open the product page. Otherwise, HOSHILU opens marketplace results, then lets you continue on Instagram, X, TikTok, and YouTube.'
  },
  ZH: {
    title: '一眼看懂可搜索的商城。',
    lead: 'HOSHILU可比较3个整合商城，并可另外前往10个商城单独搜索。',
    count: '最多支持13个商城',
    core: '一起搜索',
    coreAria: 'HOSHILU可整合比较的3个商城',
    fashion: '单独搜索',
    fashionAria: '不包含在HOSHILU结果中、可单独搜索的10个商城',
    note: '已确认在售的商品会直接打开商品页；尚未找到时，还可继续在 Instagram、X、TikTok 和 YouTube 搜索。'
  },
  KO: {
    title: '검색 가능한 쇼핑몰을 한눈에.',
    lead: 'HOSHILU가 3개 통합 쇼핑몰을 비교하고, 10개 쇼핑몰은 개별 검색으로 연결합니다.',
    count: '최대 13개 쇼핑몰',
    core: '한번에 검색',
    coreAria: 'HOSHILU가 상품을 모아 비교하는 3개 쇼핑몰',
    fashion: '개별 검색',
    fashionAria: 'HOSHILU 검색 결과에는 포함되지 않는, 개별 검색용 10개 쇼핑몰',
    note: '판매가 확인된 상품은 상품 페이지로 안내하고, 찾지 못하면 Instagram, X, TikTok, YouTube에서도 계속 검색할 수 있습니다.'
  }
};

const nodes = {
  title: document.querySelector('#marketplaceCoverageTitle'),
  lead: document.querySelector('#marketplaceCoverageLead'),
  count: document.querySelector('#marketplaceCoverageCount'),
  core: document.querySelector('#marketplaceIntegratedLabel'),
  coreList: document.querySelector('#marketplaceIntegratedList'),
  fashion: document.querySelector('#marketplaceDirectLabel'),
  fashionList: document.querySelector('#marketplaceDirectList'),
  note: document.querySelector('#marketplaceCoverageNote')
};

function selectedLanguage() {
  const saved = localStorage.getItem('mygate_language');
  return COPY[saved] ? saved : 'JA';
}

export function applyMarketplaceCoverage(language = selectedLanguage()) {
  const copy = COPY[language] || COPY.JA;
  if (!nodes.title) return;
  const responsiveCopy = (node, parts) => {
    node.replaceChildren(...parts.map((part) => {
      const line = document.createElement('span');
      line.className = 'marketplace-mobile-line';
      line.textContent = part;
      return line;
    }));
  };
  if (language === 'JA') {
    responsiveCopy(nodes.title, ['探せるモールが、', 'ひと目で分かる。']);
    responsiveCopy(nodes.lead, ['まとめて検索3モールと、', '個別に探す10モールに対応。']);
  } else {
    nodes.title.textContent = copy.title;
    nodes.lead.textContent = copy.lead;
  }
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
