---
status: IN_PROGRESS
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
