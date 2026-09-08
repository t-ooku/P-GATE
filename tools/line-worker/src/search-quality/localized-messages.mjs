import messages from './messages.json' with { type: 'json' };

const LOCALES = ['ja', 'en', 'ko', 'zh'];

export function searchMessageLocale(value) {
  const locale = String(value || 'ja').toLowerCase().split(/[-_]/u)[0];
  return LOCALES.includes(locale) ? locale : 'ja';
}

function interpolate(template, values) {
  return String(template || '').replace(/\{([a-z_]+)\}/giu, (_, key) => String(values?.[key] ?? ''));
}

export function renderSearchQualityMessage(group, key, locale = 'ja', values = {}) {
  const entry = messages?.[group]?.[key];
  if (!entry) return null;
  return interpolate(entry[searchMessageLocale(locale)] || entry.ja, values).trim();
}

export function renderZeroResult(reasonCode, locale, values) {
  return renderSearchQualityMessage('zero_result', reasonCode, locale, values);
}

export function renderClarification(key, locale, values) {
  return renderSearchQualityMessage('clarification_question', key, locale, values);
}

export function renderEvidenceBadge(status, locale) {
  return renderSearchQualityMessage('evidence_badge', status, locale);
}

export function validateSearchQualityLocales() {
  const errors = [];
  for (const [group, entries] of Object.entries(messages)) {
    for (const [key, entry] of Object.entries(entries)) {
      for (const locale of LOCALES) if (!String(entry?.[locale] || '').trim()) errors.push(`${group}.${key}.${locale}`);
    }
  }
  return errors;
}
