# Seller 1,980円・30日無料：承認範囲と実装

## 承認の根拠
2026-09-27の大隆さんからの変更指示書を承認済みの正本とする。新規Sellerは月額1,980円（税込）。初回商品公開成功から30×24時間無料、開始前にカード登録・明示同意、期限までに解約しなければ31日目から毎月自動更新。クリック従量課金なし。機能/KPI/需要分析を維持。将来料金・自動値上げなし。値下げを宣伝する文言は使わない。

本書は料金・規約の再承認依頼ではない。AGENTS.mdが求める承認根拠の記録。過去の新規4,980円募集指示は本書が置き換える。保存済み契約・同意文・無料期間は置き換えない。

## 実装した分離
- 新規offer: `external-seller-1980-30d-autorenew-v1`
- 新規terms: `seller-1980-30d-autorenew-20260927-v1`
- 新規Price/Product: `SELLER_PILOT_1980_TEST_PRICE_ID` / `SELLER_PILOT_1980_TEST_PRODUCT_ID` と `SELLER_PILOT_1980_LIVE_PRICE_ID` / `SELLER_PILOT_1980_LIVE_PRODUCT_ID`。テストと本番を別に保存。
- 既存の `SELLER_PILOT_PRICE_ID` は旧4,980円契約の参照先として維持し、新規1,980円のIDを上書きしない。
- 同意時のoffer/terms/amount/currency/interval/interval_count/tax_behavior/Price/Product/mode/表示文/日時を契約JSONへ保存。公開の開始・終了は同じJSONの最初の公開成功時に保存。
- 旧自動更新offer/termsは登録表に保持し、定期照合は新旧双方を対象とする。旧Priceのactive=falseでも既存照合・解約は継続。
- 旧カード不要・自動課金なし・暦3か月の契約は自動更新処理に入れない。
- 旧管理画面からの新規請求アカウント作成と古いCheckout新規発行は停止。既存Portal/Webhook/履歴は維持。Stripe側に既に残る未完了Checkout/Payment Linkの棚卸し・失効は未実施。
- 旧請求管理はStripeの実契約/次回請求を読み取り、取得不能なら確認不能と表示。新規料金から推測しない。
- 解約は受付日時を先に永続化。処理中の競合でも受付を保存し、Stripe停止確認中と完了を区別。期限前受付の遅延反映について実Stripeテストが必要。

## 外部操作と有効化の境界
コード公開は依頼の範囲。今回、実顧客への試験課金・返金・日割り請求・自動値上げ・SNS投稿・既存契約の一律移行は実施しない。

本番D1の変更は、対象migrationと復旧点を確認し既存承認手順に従う。読み取り専用CIで未適用一覧と契約件数を取得する。0088/0089が未適用なら、その必要な追加migrationだけを対象とし、他の未適用を一括適用しない。現在は新規受付フラグを有効化しない。

Stripe接続が未導入のため、実Price作成・実テスト環境E2E・旧契約の請求プレビューは未実施。`scripts/prepare-seller-1980-price.mjs` は明示したmode/Productを検証して読み取り、`--create-price` 指定時のみ正しい1,980円Priceを作成または再利用する。旧PriceやSubscriptionを更新しない。ツール自体は本番未実行。

## 既存契約の値下げ移行案（適用していない）
1. D1とStripe双方で実数・契約条件を照合。内部店/テスト/外部店、無料中/有料/解約予約/特別条件を区別。D1の件数だけでStripe契約数を断定しない。
2. 対象は月次・JPY・quantity=1の標準契約。特別条件、未完了Checkout、複数明細、請求不一致は個別確認。解約予約済みは更新を再開しない。
3. 条件を確認した標準契約について、既存subscription itemのPriceだけを1,980円へ置換する案を作る。Subscription新規追加やitem追加はしない。`proration_behavior=none`、請求アンカー・trial_end・cancel_at_period_endは変更しない。既存の未請求項目もプレビューで確認。
4. 変更前後の次回請求プレビューで、無料中は既存trial_end後の初回、有料中は既存の次回更新から1,980円になること、即時/日割り請求・返金がないことを確認。
5. 保存済みの旧同意を残した価格改定履歴と、照合可能な移行先バージョンを用意し、対象・プレビュー・差分について既存承認手順に従ってから適用する。今回この移行は実行していない。

Stripe一次資料（確認済み）:
- https://docs.stripe.com/products-prices/manage-prices
- https://docs.stripe.com/billing/subscriptions/change-price
- https://docs.stripe.com/api/subscriptions/update
- https://docs.stripe.com/api/invoices/upcoming?api-version=2024-06-20
