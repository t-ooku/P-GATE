# HOSHILU implementation progress — 2026-07-24

## Production

- Public URL: https://hoshilu.app/
- Worker URL: https://project-gate-line-bridge.mygate-jp.workers.dev/
- Worker version after visual release: `947760ce-473e-4e80-9174-a5a5973e87d5`
- Health release: `1.14.0`
- D1: `hoshilu-products` / APAC
- Product and FTS index: 326,483 products across ITG, ITT, and MC2

## Confirmed completed

1. Production Turnstile keys and allowed hostnames are active.
2. Public search, real-product results, signed marketplace links, MYWISH, four languages, PWA, seller login, and member LINE Login are deployed.
3. Member LINE Login was accepted on a real account; the earlier LINE 400 error is resolved.
4. Free-member MYWISH supports list, re-search, watch-condition update, deletion, and anonymous-device-to-member merge.
5. Seller pages are protected with ID/password and HttpOnly session cookies and read tenant counts from D1.
6. ITG/ITT/MC2 product data and FTS indexes contain 326,483 rows; public search uses the low-cost index layer.
7. Search input supports one-click clear and four-language speech input where the browser supports Web Speech.
8. The four feature buttons remain compact and sticky; ホシル returns to the query and focuses the first character.
9. HOSHILU Discovery visual is deployed using fictional, unbranded product imagery. The top visual is intentionally reduced and the lower collage is the main visual.
10. The final search guidance is: `見た目、見た場所、使い方。覚えていることから話してください。`
11. The collage is localized in JA/EN/ZH/KO; its example button copies a query into the search box and focuses it.
12. Desktop/mobile WebP assets are 38,124 bytes and 18,836 bytes. Images are lazy-loaded; mobile hides the secondary hero crop.
13. PWA cache is `hoshilu-shell-v31` and contains the new CSS and both collage assets.
14. Search evaluation has a real ITG gold set of 30 targets × 3 information levels = 90 cases, with Top-1, Top-3, category match, MRR, nDCG@3, no-answer, wrong-answer, clarification, MYWISH, and safe-response metrics.
15. Low-confidence and cross-category searches ask one minimal clarification; context-only clues can propose MYWISH rather than assert an answer.
16. Low-confidence follow-up is now button-based in JA/EN/ZH/KO. A selected use, category, size, material, transparency, or power type is appended to the original query before the user presses search again.
17. The Discovery headline is fixed to two lines and its white copy panel was reduced so more product imagery remains visible.

## Search benchmark

| Metric | Baseline | Improved | Improved + safe policy |
|---|---:|---:|---:|
| Top-1 | 20.0% | 35.6% | 35.6% |
| Top-3 | 23.3% | 46.7% | 46.7% |
| Category match | 26.7% | 54.4% | 54.4% |
| MRR | 0.216 | 0.416 | 0.416 |
| nDCG@3 | 0.218 | 0.420 | 0.420 |
| Asserted wrong-answer rate | — | — | 7.8% |
| Safe-response rate | — | — | 92.2% |

Detailed reports:

- `docs/HOSHILU_SEARCH_EVALUATION_BASELINE_LOCKED.md`
- `docs/HOSHILU_SEARCH_EVALUATION_IMPROVED.md`
- `docs/HOSHILU_SEARCH_EVALUATION_IMPROVED_POLICY.md`

## Verification evidence

| Check | Result |
|---|---:|
| Worker automated tests | 38/38 PASS |
| HOSHILU UX test | PASS |
| Four-language UI test | PASS |
| Brand/compatibility test | PASS |
| Sticky navigation test | PASS |
| Four-language speech-input test | PASS |
| Wrangler dry-run | PASS; 40 assets; 59.51 KiB upload / 17.49 KiB gzip |
| Production root | HTTP 200 |
| Production CSS and both WebP assets | HTTP 200 |
| Production PWA cache | v27 confirmed |
| Production health | ok=true; missing=[]; weak=[] |

## External action still required

### LINE Messaging API (official-account chat)

LINE Login and LINE Messaging API are separate channels. Login is working, but `/health` still reports `line_configured:false`, which means chat replies from the LINE official account are not yet live.

Required Worker secrets:

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`

Then configure and verify the Messaging API webhook URL documented in `docs/LINE_INTEGRATION_SPEC_v1.6.md`. Never paste either secret into documents or chat.

### Native apps and stores

PWA is already installable. Native iOS/Android release should begin only after pilot retention and notification use are measurable, as specified in `docs/NATIVE_APP_ARCHITECTURE_v2.0.md`.

## Remaining roadmap, in priority order

1. Complete LINE Messaging API secret/webhook/live-message acceptance test.
2. Improve ambiguous-search Top-3, especially category branching, compatibility, and social-context queries, while preserving the 92.2% safe-response behavior.
3. Add production MYWATCH scheduling, delivery, retry, unsubscribe, and notification audit logs.
4. Connect cancellation/import-prohibition data to the unmet-demand knowledge layer and human-reviewed domestic alternatives.
5. Turn seller INSIGHT placeholders into contract-scoped demand/restriction/alternative reports.
6. Start SNS launch operations with measured links and privacy-safe creative testing.
7. Package and operate the Chrome extension; do not publish until store copy, privacy disclosure, and support route are final.
8. Add native app shell only after the PWA/LINE pilot meets the agreed go/no-go metrics.
9. Continue trademark clearance and reserve consistent brand handles.

## Source-of-truth note

The approved Master Spec remains authoritative, with the HOSHILU rebrand addendum and this evidence-based progress record layered on top. Existing internal keys such as `mygate_*` and Project GATE identifiers remain unchanged intentionally to preserve compatibility.
## 2026-07-24 検索・送客改善（Version 93da4a0d-5204-4553-8fd2-d0155bf8fc47）

- 「日本で使える米国の小型電化製品 / キッチン・食卓で使う」を、キッチン家電タイプと100〜120V根拠の複合意図として検索するよう修正。ゲーム・エプロン等の cooking 単独一致を除外。
- 公開検索候補を最低1件・最大10件へ変更。PCは3件ずつ表示し、4件目以降を左右ボタンで横送り。スマホは横スワイプ対応。
- 表示順位を防御的にNO.1始まりへ統一。
- 候補末尾へ「条件を追加して再検索」を追加。元の検索文を残したまま検索窓へ戻り、色・大きさ・電源・使用場所などを追記可能。
- 契約・承認済みMarketplace_OffersのProduct_URLを従来Amazon URLより優先する方針を維持。契約登録項目へMerchant_ID、Seller_SKU、Offer_Listing_IDを追加し、検証済みProduct_URLを送客先SSoTとした。
- 未承認の従来Amazon一般商品URLへのフォールバックを停止。承認済みProduct_URLが無い候補は商品表示・ほしっトクのみとし、販売ボタンは出さない。
- Workerテスト40件、GAS主要テストすべて合格。本番D1実商品で電圧根拠付きキッチン家電候補を確認。
- PWAキャッシュ: hoshilu-shell-v32。

## 2026-07-26 本番索引再評価と安全ポリシー改善

- 本番D1のITG索引に対して90ケースを再評価。
- 現行検索: Top-1 37.8%、Top-3 47.8%、カテゴリ一致56.7%、安全応答90.0%、断定誤答10.0%。
- 型番、容量、個数、調性、固有語が上位候補の根拠と一致しない場合は断定せず、最小1問を返す。
- SNS文脈または「やつ／もの」で終わる識別子なし説明も、商品候補を表示しながら1問だけ確認する。
- 改善後: Top-1 37.8%、Top-3 47.8%を維持し、安全応答96.7%、断定誤答3.3%。
- 根拠: `benchmarks/results/itg-gold-evidence-policy-v3-20260726.json`
