import { applyRefinementChips } from "./search-refinement-policy.mjs";

function normalizeFreeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export function appendFreeText(query, freeText) {
  const base = String(query || "").trim();
  const addition = normalizeFreeText(freeText);
  if (!addition) return base;
  if (base.toLocaleLowerCase().includes(addition.toLocaleLowerCase())) return base;
  return [base, addition].filter(Boolean).join(" / ");
}

export function refinementRequestWithFreeText({
  query,
  selectedChips,
  context = {},
  locale = "ja",
  freeText = "",
}) {
  const chipQuery = applyRefinementChips(query, selectedChips, locale);
  return {
    original_query: String(query || "").trim(),
    refined_query: appendFreeText(chipQuery, freeText),
    free_text: normalizeFreeText(freeText),
    locale: String(locale || "ja").toLowerCase().split(/[-_]/)[0],
    refinements: (Array.isArray(selectedChips) ? selectedChips : []).map((chip) => ({
      dimension: chip.dimension,
      value: chip.value,
    })),
    continuation: true,
    prior_search_id: String(context?.search_id || ""),
  };
}
