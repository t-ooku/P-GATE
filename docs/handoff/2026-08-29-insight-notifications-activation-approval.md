# HOSHILU 1.22.0 activation approval record

- Date: `2026-08-29`
- Requester / approver: 大隆さん
- Approval source: current ChatGPT instruction, 「ホシルに新たな機能が追加された。一新してどんどん販促していこう。」
- Status: approved within the scope below; reliability gate cleared after production incident #83 closed automatically at `2026-08-29T08:37:08Z`

## Approved scope

- Deploy HOSHILU release `1.22.0`
- Apply D1 migrations `0063` through `0066` for explicit opt-in continuous search, notification result links, scan indexes, and scan leases
- Activate only through the guarded commit marker `[activate-insight-notifications-approved]`
- Publish the five new feature guides and the refreshed guide hub/sitemap
- Queue the approved HOSHILU-owned X and Instagram launch campaign defined in `marketing/social/HOSHILU_NEW_SEARCH_LAUNCH_20260829.md`

## Excluded scope

- Amazon Creators API or SP-API work
- Advertiser or affiliate partnership applications
- TikTok activation
- External outreach, paid media spend, pricing changes, or policy changes

The CI workflow must capture a D1 Time Travel bookmark, verify the four migration hashes and schema, and apply the migrations before deployment. A failed or skipped migration gate must block deployment.
