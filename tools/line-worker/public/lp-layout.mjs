// HOSHILU UI v5 places every section via static HTML/CSS grid order
// (.hoshilu-primary, single column at every breakpoint) - this module
// intentionally does not move sections around at runtime anymore, since
// a JS-based reorder after first paint causes a visible layout shift and
// previously fought with the static order.
const search = document.querySelector('#hoshiluSearch');

const searchLabels = { JA:'ホシル検索', EN:'HOSHILU Search', ZH:'HOSHILU 搜索', KO:'HOSHILU 검색' };
function applySearchLabel() {
  const language = document.querySelector('[data-language-select]')?.value || 'JA';
  const label = searchLabels[language] || searchLabels.JA;
  const searchStep = document.querySelector('#searchStep');
  const goSearch = document.querySelector('#goSearch');
  if (searchStep) searchStep.textContent = label;
  if (goSearch) goSearch.textContent = label;
}

document.querySelectorAll('.marketplace-group li').forEach((item) => {
  item.tabIndex = 0;
  item.setAttribute('role', 'button');
  item.setAttribute('aria-label', `${item.textContent.trim()}を検索する`);
  const moveToSearch = () => {
    search?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => document.querySelector('#query')?.focus({ preventScroll: true }), 450);
  };
  item.addEventListener('click', moveToSearch);
  item.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      moveToSearch();
    }
  });
});

window.addEventListener('hoshilu:languagechange', applySearchLabel);
document.querySelector('[data-language-select]')?.addEventListener('change', () => window.setTimeout(applySearchLabel));
window.setTimeout(applySearchLabel);

for (const selector of [
  '#marketplaceCoverageLead',
  '#marketplaceCoverageNote'
]) {
  document.querySelectorAll(selector).forEach((element) => element.classList.add('lp-compact-copy'));
}
