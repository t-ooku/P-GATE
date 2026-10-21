# MYGATE to HOSHILU Rebrand Addendum v5.1

Date: 2026-07-23
Status: Approved for implementation
Applies to: MYGATE Master Spec v5.0 and all dependent public-facing assets

## 1. Decision

The public product brand changes from `MYGATE` to `ホシル｜HOSHILU`.

`Project GATE` remains the internal project and repository name during the compatibility
phase. Cloudflare Worker names, Google Apps Script project names, spreadsheet tabs, API
fields, analytics event names, and local storage keys are not renamed merely for visual
consistency. They require a separately tested migration.

If this addendum conflicts with a public-brand instruction in MYGATE Master Spec v5.0,
this addendum takes precedence. Functional, safety, privacy, marketplace, and evidence
requirements in v5.0 remain in force.

## 2. Public product language

| v5.0 name | v5.1 public label |
|---|---|
| MYGATE | ホシル / HOSHILU |
| MYCONCIERGE | ホシル |
| MYWISH | ほしっとく |
| MYWATCH | ホシっといて |
| MYTREASURE | HOSHILU INSIGHT |

## 3. Positioning

Brand line:

> 欲しいを、ちゃんと見つける。

Habit line:

> 気になったら、ほしっとく。

Conversational request:

> これ、ホシっといて。

The product must be understandable before feature explanation. Public copy should use
the user action first and the internal system name only in technical or migration notes.

## 4. Visual continuity

Retain the existing portrait gradient:

- Pink `#F238B5`
- Violet `#8A4CF4`
- Blue `#258CFF`

Replace the old M/gate mark with the HOSHILU H/heart/discovery mark. Do not use the old
MYGATE mark in new public posts, app icons, store listings, LINE profiles, or extensions.

## 5. Compatibility

During v5.1:

- retain `mygate_session_id`;
- retain `mygate_language`;
- retain `mygate_wishes`;
- retain current Worker route and secret names;
- retain current GAS sheet and metric identifiers;
- retain historical `MYWISH`, `MYWATCH`, and `MYTREASURE` data labels in stored records.

This prevents loss of saved wishes, session continuity, analytics history, and integrations.
New public UI labels map onto these identifiers.

## 6. Domain and account transition

The current beta URL may remain active during controlled testing. Before paid promotion,
app-store submission, or large-scale creator outreach:

1. acquire and connect a HOSHILU-owned custom domain;
2. rename existing SNS accounts where possible instead of deleting them;
3. reserve consistent handles;
4. update LINE display name and rich-menu assets;
5. maintain redirects and a short transition notice from MYGATE to HOSHILU.

## 7. Trademark gate

The rebrand is not a legal clearance conclusion. Before general launch, complete:

- J-PlatPat exact and similar-pronunciation searches;
- relevant software, marketplace, SaaS, advertising, and communication classes;
- app-store, domain, company-name, and major social-handle checks;
- professional trademark advice where required.

## 8. Acceptance criteria

- No public page title, logo, PWA name, Chrome extension screen, privacy page, terms page,
  SNS profile, or new creative displays MYGATE as the current public brand.
- Existing saved data continues to load.
- Four-language UI remains functional.
- Product search, Turnstile, outbound marketplace links, PWA installation, and tests pass.
- Deployment occurs only after the production page and social preview are visually checked.
