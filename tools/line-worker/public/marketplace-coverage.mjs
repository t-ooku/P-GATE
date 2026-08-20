// v4.2 項目15・16: 「主要5モール/ファッション5モール」という分け方は、
// SHOPLIST/MUSINSAが標準検索から外れ新規5モールが加わったことで実態と
// ずれるため廃止。/api/knowledge のレスポンスが持つ integrated(=HOSHILUが
// 商品データを取得できる) / direct(=検索結果ページへ案内するだけ) という
// 区分に統一する(src/index.mjs の searchModeForMarketplace が唯一の判定元)。
// 2026-08-08: ヒーロー直下に置く2つ目のMARKETPLACE COVERAGEウィジェット
// (hero-marketplace-coverage.mjs)が同じ文言・同じ判定を再利用できるよう、
// COPYとレンダリング本体(applyMarketplaceCoverageToNodes)をここからexport
// する。この節の下にある既存のnodes/applyMarketplaceCoverage自体の挙動は
// 一切変えていない(id・出力とも従来通り)。
export const COPY = {
  JA: {
    title: '探せるモールが、ひと目で分かる。',
    lead: 'まとめて検索2モールと、個別に探す11モールに対応。',
    count: '最大13モール対応',
    core: 'まとめて検索',
    coreAria: 'HOSHILUが商品をまとめて探して比較する2モール',
    fashion: '個別に探す',
    fashionAria: 'HOSHILUの検索結果には含まれない、個別に探す11モール',
    note: '出品を確認できた商品は商品ページへ、それ以外は各モールの検索結果へ案内します。'
  },
  EN: {
    title: 'See where HOSHILU can search.',
    lead: 'HOSHILU compares 2 integrated marketplaces and links out to 11 more you can search directly.',
    count: 'Up to 13 marketplaces',
    core: 'Search together',
    coreAria: 'Two marketplaces HOSHILU compares directly',
    fashion: 'Search individually',
    fashionAria: 'Eleven marketplaces not included in HOSHILU results, searchable directly',
    note: 'Verified listings open the product page; everything else opens each marketplace\'s search results.'
  },
  ZH: {
    title: '一眼看懂可搜索的商城。',
    lead: 'HOSHILU可比较2个整合商城，并可另外前往11个商城单独搜索。',
    count: '最多支持13个商城',
    core: '一起搜索',
    coreAria: 'HOSHILU可整合比较的2个商城',
    fashion: '单独搜索',
    fashionAria: '不包含在HOSHILU结果中、可单独搜索的11个商城',
    note: '已确认在售的商品直接打开商品页，其余打开各商城的搜索结果。'
  },
  KO: {
    title: '검색 가능한 쇼핑몰을 한눈에.',
    lead: 'HOSHILU가 2개 통합 쇼핑몰을 비교하고, 11개 쇼핑몰은 개별 검색으로 연결합니다.',
    count: '최대 13개 쇼핑몰',
    core: '한번에 검색',
    coreAria: 'HOSHILU가 상품을 모아 비교하는 2개 쇼핑몰',
    fashion: '개별 검색',
    fashionAria: 'HOSHILU 검색 결과에는 포함되지 않는, 개별 검색용 11개 쇼핑몰',
    note: '판매가 확인된 상품은 상품 페이지로, 그 외에는 각 쇼핑몰 검색 결과로 안내합니다.'
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

export function selectedLanguage() {
  const saved = localStorage.getItem('mygate_language');
  return COPY[saved] ? saved : 'JA';
}

// nodesを引数として受け取る形にし、同じ文言・同じ分岐ロジックをヒーロー側
// ウィジェット(hero-marketplace-coverage.mjs)からも再利用できるようにした
// 以外、中身はapplyMarketplaceCoverageの元実装と同一。
export function applyMarketplaceCoverageToNodes(targetNodes, language = selectedLanguage()) {
  const copy = COPY[language] || COPY.JA;
  if (!targetNodes.title) return;
  const responsiveCopy = (node, parts) => {
    node.replaceChildren(...parts.map((part) => {
      const line = document.createElement('span');
      line.className = 'marketplace-mobile-line';
      line.textContent = part;
      return line;
    }));
  };
  if (language === 'JA') {
    responsiveCopy(targetNodes.title, ['探せるモールが、', 'ひと目で分かる。']);
    responsiveCopy(targetNodes.lead, ['まとめて検索2モールと、', '個別に探す11モールに対応。']);
  } else {
    targetNodes.title.textContent = copy.title;
    targetNodes.lead.textContent = copy.lead;
  }
  targetNodes.count.textContent = copy.count;
  targetNodes.core.textContent = copy.core;
  targetNodes.coreList.setAttribute('aria-label', copy.coreAria);
  targetNodes.fashion.textContent = copy.fashion;
  targetNodes.fashionList.setAttribute('aria-label', copy.fashionAria);
  targetNodes.note.textContent = copy.note;
}

export function applyMarketplaceCoverage(language = selectedLanguage()) {
  applyMarketplaceCoverageToNodes(nodes, language);
}

document.addEventListener('hoshilu:languagechange', event => {
  applyMarketplaceCoverage(event.detail?.language);
});

applyMarketplaceCoverage();
