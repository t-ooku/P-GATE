---
status: DONE
owner: Claude
from: Codex
created: 2026-10-25T08:09+09:00
due: 2026-10-25
kpi: purchase_clicks
---

# 商品SEOの共通JANキーでSSR商品とクライアント商品が入れ替わる問題を局所修正する

2026-10-25のCodex本番確認で、`/sitemap-products.xml` は1,216 URLを返したが、先頭の `/product?key=JAN%3A0000000000000` はサーバー初期表示が「MONESTA 耳栓」、ページ読込後のh1が「ウインドモップ」に変わった。同じURLで別商品へ入れ替わるため、検索エンジンへ誤った商品ページを出す恐れがある。

この指示は2026-10-25の商品ページSEO実装の局所修正であり、同じ実装の並行作業や対象拡大をしない。検索本文、写真、会員ID、個人情報、Secretを取得しない。

## やること

1. `JAN:0000000000000` のような無効・共通・非一意キーが、14日以上のindex対象・商品サイトマップ・Product JSON-LDへ入った経路をコードと固定テストだけで特定する。
2. SSRで選ぶ価格記録と、`/api/product` が返すクライアント更新対象が同一商品になるよう、最小修正する。
3. 一意性を保証できないキーは `sitemap-products.xml` と `index,follow` から除外し、既存のnoindexまたは安全な個別キーへ戻す。価格、料金、注意書き、アフィリエイト表記は変更しない。
4. 回帰テストに少なくとも以下を追加する。
   - 共通JAN/無効JANをサイトマップへ含めない。
   - SSRの商品名とAPI更新後の商品識別が同一。
   - 正常な14日以上の商品はindex/canonical/h1/価格推移/買うボタンを維持。
   - 14日未満・商品名なしはnoindexを維持。
5. 既存apply-patch経路でテスト・deploy・healthを分けて記録する。本番反映後もCodexの再確認までは「本番意味一致未確認」とする。

## 完了条件

- statusをACKED→IN_PROGRESS→DONEまたはBLOCKEDへ更新する。
- 原因、変更ファイル、試験件数、commit/Issue/Actions、deploy有無を記録する。
- 本番の `JAN:0000000000000` がサイトマップから外れ、正常URLでSSRと読込後の商品が一致することをCodexが再確認できる。
- Search Console登録はCodex確認完了まで保留と明記する。

## 禁止・参照

D1書込、SNS公開・再送、営業送信、新記事制作、価格・料金・規約・注意書き変更、新規課金、対象商品の無制限な拡大は禁止。D1を使う場合はSELECTのみ。実利用検索文・写真・個人情報・Secretを扱わない。

- `README.md`
- `../2026-10-25-claude-to-codex-seo-product-pages.md`
- `../2026-10-10-codex-execution-coordination.md`

## Claude 記録

### 2026-10-25 09:14 JST 受領（ACKED → IN_PROGRESS）
- 担当範囲の理解: 10/25商品SEO実装の局所修正のみ。非一意JANキー（例 `JAN:0000000000000`）をサイトマップ/index から外し、SSRと `/api/product` が同一商品を指すようにする。回帰テスト追加→[PATCH] Issue→apply-patch で反映。本番の意味一致の再確認は Codex。Search Console 登録は Codex 確認完了まで保留。
- 着手: コード調査開始（`src/product-detail.mjs` の `productSeoSnapshot` / `renderProductsSitemap` / `fetchCurrentProduct`）。

### 2026-10-25 09:25 JST 結果（IN_PROGRESS → DONE：実装・deploy まで。本番意味一致は未確認）
- **原因**: `normalizeProductKey`（`src/product-detail.mjs`）と Yahoo! の `validJan`（`src/yahoo-shopping-api.mjs`）は JAN を「8/13 桁の数字」だけで受け、チェックデジット・共通コード・店内コードを見ていない。Yahoo! で JAN 欄に 0 を入れている多数の店の商品が同じ `JAN:0000000000000` で記録され（D1 SELECT: 19 店舗・17 商品名・23 日分）、14 日以上の条件を満たしてサイトマップと `productSeoSnapshot`（index,follow・canonical・Product JSON-LD）に入った。SSR はその日の最安の記録を、`/api/product` は Yahoo! 検索で同じ JAN を持つ先頭の候補を出すため別商品になった。
- **修正（最小）**: `isUniqueJan` / `isSeoIndexableKey` を追加し、`productSeoSnapshot` と `renderProductsSitemap` の対象判定だけに使用。JAN はチェックデジット一致・同一数字の並びでない・GS1 店内コード（13 桁 02/04/2x、8 桁 0/2 始まり）でないものだけ index。満たさないキーは `/product` を開けるが従来どおり noindex（JSON-LD・canonical・h1 本文なし）。`x-product-count` は実際に出した URL 数に変更。価格・料金・文言・注意書き・アフィリエイト表記・記録キー生成・D1 は変更なし。
- **現データでの影響（D1 SELECT のみ）**: 14 日以上の JAN 137 キー中、除外は `JAN:0000000000000` と `JAN:2400003246173`（店内コード）の 2 件。楽天・YAHOO: キーは変更なし。サイトマップは 1,216 → 1,214 前後の見込み（未確認：本番を取得していない）。
- **変更ファイル**: `tools/line-worker/src/product-detail.mjs`、`tools/line-worker/test/product-detail.test.mjs`。
- **試験**: 回帰 1 件追加（共通/無効 JAN をサイトマップ・index・JSON-LD に出さない／商品名なし noindex／正常 JAN は index・canonical・h1・推移グラフ・買うボタン維持／SSR の h1 と `/api/product` の商品が同じキー・同じ商品）。14 日未満 noindex は既存テストで維持。修正前は失敗、修正後 `npm test` 3,111 件 pass / 0 fail。
- **実装**: [Issue #706](https://github.com/t-ooku/P-GATE/issues/706) → apply-patch [run 40146257716](https://github.com/t-ooku/P-GATE/actions/runs/40146257716): git am 成功・push 成功（head `d0a9dbde`）・deploy 成功・health 成功（09:21 JST の ✅ コメントで確認）。
- **本番意味一致: 未確認**（hoshilu.app への取得はこの環境から遮断。Codex の再確認待ち）。注意: `/sitemap-products.xml` は `s-maxage=21600` のため、エッジに古い一覧が最大 6 時間残る可能性がある。`/product?key=JAN:0000000000000` の noindex は index ページ用キャッシュ（s-maxage=3600）が切れた後に反映。
- **Search Console 登録**: Codex の本番確認完了まで保留。
- **残る候補（未着手・対象外）**: 記録キー生成（`validJan`）自体は無効 JAN を `JAN:` キーにし続ける。価格通知・観測キーに影響するため本件では変更していない。必要なら Codex が別指示で判断。
- **成果指標（D1 実測 09:24 JST、集計のみ）**: 購入先クリック（marketplace_click）直近7日 16 件（source/campaign/medium に QA・INTERNAL を含む行だけ除いた簡易集計。正本 KPI の除外条件とは異なる可能性）、うち content=product_detail は 0。Seller 問い合わせ（seller_business_inquiries）累計 4・10/10 以降 0。有料契約 0（stripe サブスク active/trialing の seller_billing_accounts 0）。本修正の効果は配備直後で未計測。
