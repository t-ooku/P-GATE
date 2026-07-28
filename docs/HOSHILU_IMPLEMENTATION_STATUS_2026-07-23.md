# HOSHILU implementation status

Date: 2026-07-23
Internal project: Project GATE
Public brand: ホシル / HOSHILU

## Completed locally

- Approved public naming architecture:
  - search: ホシル
  - save: ほしっトク
  - watch: ホシっといて
  - seller analytics: HOSHILU INSIGHT
- Retained the existing pink-violet-blue portrait palette.
- Replaced the M/gate mark with the H/heart/discovery mark.
- Updated Web page title, metadata, navigation brand, feature labels, result copy,
  four-language copy, footer, privacy, and terms.
- Updated PWA manifest and service-worker cache.
- Preserved legacy local-storage keys to protect existing saved wishes and language.
- Updated Chrome extension display, icon, copy, and package version to 0.3.0.
- Created profile images, X header, YouTube banner, OGP master, and three launch creatives.
- Created SNS profile copy and relaunch plan.
- Added Master Spec v5.1 rebrand addendum.
- Created `dist/HOSHILU_Chrome_Extension_v0.3.0.zip`.
- Completed Worker dry-run build.

## Verification

- Core Project GATE tests: PASS
- Chrome extension tests: 5/5 PASS
- Worker tests: 13/13 PASS
- HOSHILU brand/compatibility tests: PASS
- Wrangler dry-run: PASS
- Production deployment: NOT EXECUTED

## Compatibility retained intentionally

- Worker name and current beta hostname
- GAS project and spreadsheet identifiers
- API fields and historical metric names
- `mygate_session_id`
- `mygate_language`
- `mygate_wishes`

These are implementation identifiers, not the public brand. Renaming them requires a
separate data/integration migration and is not needed for the first public rebrand.

## User action required before SNS relaunch

1. In each platform, check handle availability in this order:
   `@hoshilu`, `@hoshilu_jp`, `@hoshilu_official`, `@hoshilu_app`.
2. Rename the existing Instagram and X accounts; do not delete them.
3. Upload `ロゴ/HOSHILU/hoshilu-profile-hq-2048.png`.
4. Upload the matching X or YouTube header.
5. Paste the profile copy from `SNS運用/HOSHILU/HOSHILU_SNS_PROFILE_COPY.md`.
6. Keep posts unpublished until the production site is deployed and visually confirmed.

## Remaining release gates

- Complete J-PlatPat and professional trademark clearance.
- Choose and connect a HOSHILU custom domain.
- Final visual review of the Web page and generated social images.
- Deploy the Worker.
- Verify Turnstile, search, outbound product links, four languages, PWA install, and mobile.
- Rename LINE display assets and complete LINE secrets/webhook configuration.
- Publish the three transition posts.
