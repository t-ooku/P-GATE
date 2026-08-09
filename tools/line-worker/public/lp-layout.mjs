// HOSHILU UI v5 places every section via static HTML/CSS grid order
// (.hoshilu-primary, single column at every breakpoint) - this module
// intentionally does not move sections around at runtime anymore, since
// a JS-based reorder after first paint causes a visible layout shift and
// previously fought with the static order.
const searchLabels = { JA:'検索方法', EN:'Search mode', ZH:'搜索方式', KO:'검색 방법' };
function applySearchLabel() {
  const language = document.querySelector('[data-language-select]')?.value || 'JA';
  const label = searchLabels[language] || searchLabels.JA;
  const searchStep = document.querySelector('#searchStep');
  if (searchStep) searchStep.textContent = label;
}

window.addEventListener('hoshilu:languagechange', applySearchLabel);
document.querySelector('[data-language-select]')?.addEventListener('change', () => window.setTimeout(applySearchLabel));
window.setTimeout(applySearchLabel);

for (const selector of [
  '#marketplaceCoverageLead',
  '#marketplaceCoverageNote'
]) {
  document.querySelectorAll(selector).forEach((element) => element.classList.add('lp-compact-copy'));
}
