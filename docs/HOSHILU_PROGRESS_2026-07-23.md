# HOSHILU implementation progress — 2026-07-23

## Production

- URL: https://hoshilu.app/
- Worker version: `13433563-280d-49b3-b822-1ef50c7253ed`
- D1: `hoshilu-products` / APAC
- D1 migrations: 2 applied

## Completed

1. Public, member login, seller login, and seller console share JA/EN/ZH/KO UI.
2. Production Turnstile remains active.
3. LINE Login backend supports PKCE, state, nonce, ID-token verification, signed HttpOnly sessions, and logout.
4. LINE Login button remains disabled until Channel ID and Channel Secret are configured.
5. D1 product and FTS schemas were created.
6. Latest CSVs for all three tenants were streamed from Shift_JIS without loading whole files into memory.
7. Production product index contains 326,483 rows:
   - itg: 130,386
   - itt: 99,972
   - mc2: 96,125
8. FTS index contains 326,483 rows; representative query latency was 0.33–6.7 ms.
9. MYWISH member API and anonymous-device-to-member merge are deployed.
10. Seller console now reads production tenant/product counts from D1 after authentication.
11. Import-blocked demand classification was added for liquid, lithium, hazardous cargo, oversized goods, food/plant/animal, regulation, stock, delivery, price, and changed-mind reasons.
12. High-risk domestic alternatives require human verification.
13. GAS bundle contains bounded D1 delta synchronization; seller profit is never sent to the public index.
14. HOSHILU SNS profile copy uses `hoshilu.app` and https://hoshilu.app/.

## Verified counts and performance

| Check | Result |
|---|---:|
| Product rows | 326,483 |
| FTS rows | 326,483 |
| Bootstrap rejected rows | 0 |
| D1 size | 271.71 MB |
| Basic FTS query | 0.33 ms |
| Snack intent query | 4.14 ms |
| Vehicle-parts grouped query | 6.67 ms |
| Worker tests | 29 passing |
| GAS/full repository tests | passing |

## User action required

### LINE Login

Register callback:

`https://hoshilu.app/api/member/line/callback`

Then set Worker secrets:

- `LINE_LOGIN_CHANNEL_ID`
- `LINE_LOGIN_CHANNEL_SECRET`

### GAS production

The local bundle is updated, but no `.clasp.json` is connected. Replace the Apps Script source with:

`dist/Project_GATE_Complete_v1.14.gs`

Save and deploy a new Web App version. Existing properties and deployment access settings must be preserved.

## Remaining

- Complete LINE Login and Messaging API live-device acceptance tests.
- Activate D1 candidate prefilter in the public Knowledge path after relevance benchmarks.
- Import and aggregate the order-management cancellation columns after confirming the source Sheet/range.
- Add MYWATCH notification persistence and delivery.
- Finalize Chrome Web Store and native-app go/no-go operations.
