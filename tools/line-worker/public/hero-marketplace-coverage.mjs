// 2026-08-08: ヒーロー(「今日は、何が欲しい？」)直下に置く、折りたたみ式の
// 2つ目のMARKETPLACE COVERAGEウィジェット。既存の#marketplaceCoverage
// (ページ下部)とは別の<details>要素で、開閉状態はブラウザごとに独立して
// 管理する(このファイルではDOMへ文言を反映するだけで、初回だけ開いておく
// 制御はapp.jsが#heroMarketplaceCoverageのopenプロパティを直接操作する)。
//
// 文言・integrated/direct区分は既存ウィジェットと完全に同じにするため、
// marketplace-coverage.mjsからCOPYとapplyMarketplaceCoverageToNodesを
// そのまま再利用する(文言の二重管理を避ける)。
import { COPY, applyMarketplaceCoverageToNodes, selectedLanguage } from './marketplace-coverage.mjs';

const nodes = {
  title: document.querySelector('#heroMarketplaceCoverageTitle'),
  lead: document.querySelector('#heroMarketplaceCoverageLead'),
  count: document.querySelector('#heroMarketplaceCoverageCount'),
  core: document.querySelector('#heroMarketplaceIntegratedLabel'),
  coreList: document.querySelector('#heroMarketplaceIntegratedList'),
  fashion: document.querySelector('#heroMarketplaceDirectLabel'),
  fashionList: document.querySelector('#heroMarketplaceDirectList'),
  note: document.querySelector('#heroMarketplaceCoverageNote')
};

export function applyHeroMarketplaceCoverage(language = selectedLanguage()) {
  applyMarketplaceCoverageToNodes(nodes, language);
}

document.addEventListener('hoshilu:languagechange', (event) => {
  applyHeroMarketplaceCoverage(event.detail?.language);
});

applyHeroMarketplaceCoverage();

// COPYは再export不要(呼び出し元は文言を直接扱わないため)だが、テストや
// 将来の再利用のために参照だけ残しておく。
export { COPY };
