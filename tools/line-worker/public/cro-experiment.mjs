const EXPERIMENT = 'lp_search_cta_v1';
const STORAGE_KEY = `hoshilu_experiment_${EXPERIMENT}`;
const VARIANTS = new Set(['control', 'benefit']);

const copy = Object.freeze({
  JA: { control: '一緒に見つける', benefit: '無料で商品を探す' },
  EN: { control: 'Find it with me', benefit: 'Search products for free' },
  ZH: { control: '一起寻找', benefit: '免费查找商品' },
  KO: { control: '함께 찾기', benefit: '무료로 상품 찾기' }
});

function safeStorage(storage) {
  try { return storage; } catch { return null; }
}

export function experimentAssignment({ search = '', storage = null, random = Math.random, attribution = {} } = {}) {
  const params = new URLSearchParams(String(search).replace(/^\?/, ''));
  const forcedExperiment = params.get('exp');
  const forcedVariant = params.get('variant');
  const qa = /^(qa|test|codex)/i.test(String(attribution.source || ''))
    || String(attribution.medium || '').toLowerCase() === 'qa';
  if (qa && forcedExperiment === EXPERIMENT && VARIANTS.has(forcedVariant)) {
    return { experiment: EXPERIMENT, variant: forcedVariant, forced: true };
  }
  const target = safeStorage(storage);
  try {
    const stored = target?.getItem(STORAGE_KEY);
    if (VARIANTS.has(stored)) return { experiment: EXPERIMENT, variant: stored, forced: false };
  } catch {}
  const variant = Number(random()) < 0.5 ? 'control' : 'benefit';
  try { target?.setItem(STORAGE_KEY, variant); } catch {}
  return { experiment: EXPERIMENT, variant, forced: false };
}

export function applyExperiment(root = document, assignment = window.HoshiluGrowthExperiment) {
  const submit = root.querySelector('#submitText');
  const language = String(root.querySelector('#languageSelect')?.value || 'JA').toUpperCase();
  const variant = VARIANTS.has(assignment?.variant) ? assignment.variant : 'control';
  if (submit) submit.textContent = (copy[language] || copy.JA)[variant];
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  let browserStorage = null;
  try { browserStorage = window.localStorage; } catch {}
  const assignment = experimentAssignment({
    search: location.search,
    storage: browserStorage,
    attribution: window.HoshiluGrowthAttribution
  });
  window.HoshiluGrowthExperiment = Object.freeze({
    experiment: assignment.experiment,
    variant: assignment.variant
  });
  applyExperiment(document, assignment);
  window.HoshiluTrackGrowth?.('experiment_exposure');
  document.querySelector('#languageSelect')?.addEventListener('change', () => applyExperiment(document, assignment));
}
