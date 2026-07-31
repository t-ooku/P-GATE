const coverage = document.querySelector('.marketplace-coverage');
const journey = document.querySelector('.search-journey');
const search = document.querySelector('#hoshiluSearch');

if (coverage && journey && search) {
  coverage.after(journey, search);
}

for (const selector of [
  '#marketplaceCoverageLead',
  '#marketplaceCoverageNote'
]) {
  document.querySelectorAll(selector).forEach((element) => element.classList.add('lp-compact-copy'));
}
