# Codex startup self-check — 2026-10-06

## Production state

- Production branch: `feature/ui-search-v2`
- Starting HEAD: `d81b64449e73e441e2d935d72be1ce145dee5a16`
- Latest successful patch/deploy run: `37387384497`
- Production Version ID: `7fbb9d11-5e4b-4576-8974-5278442f3a12`
- `/health`: HTTP 200, `ok: true`, release `1.22.1`, missing `[]`, weak `[]`

## Mandatory checks

- Open reliability incident: #369 remains open.
  - External contract check: PASS.
  - Real-user search SLI: `QUERY_STRUCTURER_PRIMARY` recorded 7 repeated `AI_PROVIDER_TIMEOUT` results. Raw-query fallback remains available and the latest 7-day KPI snapshot reports 0 failed search sessions.
  - AI-actress social SLA: future inventory is missing for 2026-10-07 and 2026-10-12 on X and Instagram.
- Weekly seller promotion record: `docs/handoff/2026-10-05-seller-promo-weekly.md` exists.
  - QA shop job: DONE (attempts 2; image skipped because no R2 asset).
  - Article v1: QA_FAILED; article v2, improvement v1 and SNS v1: QA_PASSED.
  - Estimated AI cost: 5.47 JPY.
- No new `*-claude-to-codex-*.md` handoff after 2026-09-28.

## Latest privacy-safe KPI snapshot

Generated 2026-10-06 03:18 JST; 7-day window 2026-09-29 03:18–2026-10-06 03:18 JST.

- Seller candidates 252; send targets 190; sent lifecycle 191; unsubscribe 1; response records 0.
- Delivered and bounce are unavailable because the Resend delivery webhooks are not connected.
- Actual mailbox replies remain unverified because the correct mailbox is not connected.
- Seller LP views 13; seller CTA clicks 0; inquiries 4; qualified leads 0; external seller accounts 0; external products 0.
- Landing sessions 77; searches 19; completed 15; failed 0; watch started 1; watch set 0; notification return 0; mall-click sessions 5.
- SEO article sessions 6; article-to-search started 2; article CTA clicks 0; article-to-watch set 0; article-to-mall click 0.
- Tracking coverage 100%. Internal members (3), ITG seller shops and QA traffic are excluded where the aggregate supports exclusion.

## Safe improvement in this run

Existing seller-growth SEO articles currently keep a buyer-search sticky CTA visible even though their main goal is seller acquisition. Change only those articles' sticky CTA to the existing `/for-sellers` feature link and its existing `data-seo-feature-link` measurement. Buyer articles keep the price-alert/search sticky CTA.

No new SEO article, seller-promo ownership file, pricing, contract, D1, paid action, email send or SNS publish is included.

The heartfelt seller-LP rewrite and plan-interest form remain owned by the existing Claude Code handoffs. Production still shows the previous hero and does not render a plan selector.
