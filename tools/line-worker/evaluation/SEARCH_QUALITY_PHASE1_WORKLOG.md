# HOSHILU search quality Phase 1 worklog

## Isolation

- The shared root worktree contains unrelated authentication, SP-API, SEO, marketing, and release artifacts. None are modified here.
- Phase 1 work is performed in the clean integrated worktree `.deploy-ai-c693113`, starting at `a160d6f`.

## Current search sequence

1. `src/index.mjs` validates the public request and obtains indexed/GAS knowledge candidates.
2. `src/knowledge-search.mjs` normalizes intent, builds marketplace terms, filters category mismatches, and ranks candidates.
3. `src/amazon-creators-api.mjs`, `src/rakuten-marketplace-api.mjs`, and `src/yahoo-shopping-api.mjs` fetch connected marketplace candidates; Qoo10/SHEIN use verified offer feeds or search destinations.
4. `src/product-index.mjs` and `src/product-index-v2.mjs` read D1 FTS product data and confirmed marketplace offers.
5. `src/index.mjs` composes at most ten candidates, signs confirmed offer URLs, and invokes grounded AI discovery only when no candidate remains.

## Persistence

- `0001_product_search.sql` defines the product table and FTS5 index.
- `0011_marketplace_offers.sql`, `0019_marketplace_offer_rights.sql`, and `0032_marketplace_offer_shipping.sql` hold verified offer URLs, rights state, price, and shipping evidence.
- Existing growth/unmet-demand tables record aggregate search outcomes; raw personal queries must not be retained.

## Existing safeguards to replace or generalize later

- `filterCategoryMismatches` in `knowledge-search.mjs` contains category-specific hard filters, including true-wireless/body-versus-accessory handling.
- Phase 3 must add a feature-flagged canonical attribute hard-filter layer beside this path before any replacement.
- Commercial ranking already receives filtered candidates, but Phase 7 must formalize that interface and test that a commercial flag cannot rescue a rejected candidate.

## Phase 1 scope

- Add the supplied 50-case multilingual fixture.
- Add a metric harness that distinguishes unmeasured values from genuine zeroes.
- Do not connect the new fixture or evaluator to production traffic.
- Do not deploy Phase 1; it changes evaluation assets only.

## Phase 2 implementation

- `src/search-quality/query-structurer.mjs` produces the canonical structured-query schema while preserving `raw_query`.
- Attribute and product-type expressions live in JSON configuration rather than the legacy regular-expression file.
- `HOSHILU_STRUCTURED_QUERY_ENABLED` defaults to OFF; the module is not imported by `index.mjs`, so production behavior remains unchanged.
- The 50-case test measures product-type, required-attribute, and excluded-attribute classification thresholds before any future shadow connection.

## Phase 3 implementation

- `src/search-quality/hard-filter.mjs` applies product type, required attributes, then excluded attributes in a fixed order.
- Every rejection includes a stable reason code and relevant canonical attribute IDs.
- `HOSHILU_CANONICAL_HARD_FILTER_ENABLED` defaults to OFF and the module is not connected to production traffic.
- The 50-case synthetic-candidate regression requires both exclusion and required-attribute violation rates to remain exactly zero.

## Phase 4 implementation

- `body-accessory-classifier.mjs` classifies explicit structured evidence first, then multilingual body/accessory terms from JSON rules.
- Body requests reject accessory-only candidates with `ACCESSORY_ONLY`; uncertain candidates are retained for later evidence gates rather than guessed.
- `HOSHILU_ACCESSORY_CLASSIFIER_ENABLED` defaults to OFF and production search remains unchanged.

## Phase 5 implementation

- `evidence-gate.mjs` rejects model incompatibility before evaluating evidence-required claims.
- Voltage, waterproofing, model compatibility, and genuine-brand claims require a confirmed value and named source; image-only or missing evidence never passes.
- Product URLs explicitly requested as verified require `url_verified: true`.
- `HOSHILU_EVIDENCE_GATE_ENABLED` defaults to OFF and production search remains unchanged.
