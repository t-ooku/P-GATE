# Codex → Cowork：Seller 1,980円・30日無料

## 状態
実装済み未公開（この段落はCI・本番検証後に追記で確定する）。新条件での契約受付開始はまだ不可。掲載見本の相談受付と価格に依存しない販促は継続可能。旧4,980円/3か月/カード不要/自動課金なしの新規勧誘を再開しない。

## 表示条件
新規Sellerは商品公開から30日間無料。その後は月額1,980円（税込）。開始前のカード登録と自動更新への明示同意が必須。表示期限までに解約しなければ31日目から自動課金、以後毎月更新。解約は掲載管理画面。起算点は初回公開成功、30×24時間。相談・登録・カード登録・公開失敗では時計を開始しない。

新規offer/termsは `external-seller-1980-30d-autorenew-v1` / `seller-1980-30d-autorenew-20260927-v1`。旧契約は既存バージョンのまま。保存済み同意、無料期間、請求日、自動更新の有無を変更しない。既存契約の値下げ移行は対象/請求プレビューの確認前で未実施。

## 変更箇所
- 料金正本・契約スナップショット・環境別Price/Product設定・Stripe検証・カードSetup・解約受付・新旧定期照合/Webhook。
- LP、申込み/掲載承認、規約、掲載管理、既存請求画面、通知/営業メールのテンプレート、SEO/JSON-LD、Creator案内、SNS/カルーセル元データ。
- 旧料金の新規Checkout発行をブロック。既存契約の履歴/Portalを保持。誤った金額・通貨・税区分・Product・quantity・環境は拒否。4,980円へのfallbackなし。
- 既存請求画面はStripeの実額/次回請求を取得。不明な場合は確認不能とし、新規1,980円を旧契約へ見せない。
- クリック従量課金は停止を維持。検索、保存、通知、販売先リンク、KPI/需要分析の回帰テストを維持。

## 公開URL
- https://hoshilu.app/for-sellers
- https://hoshilu.app/terms#seller-subscription
- https://hoshilu.app/api/seller-pilot/offer
- https://hoshilu.app/seller-pilot （契約本人のログイン/有効化が必要）
- https://hoshilu.app/for-creators
- https://hoshilu.app/ja/ec-shukyaku-without-ad-budget

## 検証
ローカル全回帰: Worker 2,871件、release 6件、拡張6件通過。GASテスト通過。検索品質ゲート・Wrangler 4.121.0 dry-run通過。決済テストは疑似Stripe応答＋実SQLiteによるテスト。実Stripe Test Clock/カード/請求成功とは区別する。

新旧offer/terms、旧Priceのアーカイブ、新規Price設定の変更後も保存契約で照合、誤額/税/通貨/Product/interval/mode/quantity、未同意/未登録、DB失敗、再公開、30×24時間/UTC/JST/月末、重複・古いWebhook、決済失敗、処理中解約受付、無料終了、匿名化/QA除外を検証。

本番source・CI・確認時刻・契約集計・migrationは公開後に追記する。GitHubへ連絡先、カード情報、Secret、個別契約文は掲載しない。

## 残件・運用境界
- Stripe接続後に、新1,980円Price/Productのテスト/本番照合、実テスト環境でカード登録/30日経過/終了前解約/自動更新/請求明細/失敗・遅延のE2E。実顧客へ試験課金しない。
- Stripeの既存契約・未完了Checkout/Payment Linkを棚卸し。完了済みや利用中を混同せず、対象を確認して未完了の旧募集リンクを失効。既存契約移行は請求プレビュー後の承認を経る。
- 必要D1 migrationを個別確認し既存承認手順で適用。その他の未適用を一括適用しない。
- 受付有効化時にStripeの事業者情報・領収内容と必要な法定表示も確認する。リポジトリには運営者の法定表示一式がなく、氏名/住所/電話を推測して追加しない。
- 上記完了まで準備中を維持。完了後に同じofferの受付・検証フラグを段階有効化し、LP/規約/申込みを再確認してこの記録を「本番確認済み・申込み可能」へ更新する。既存解約を止める全体フラグOFFは使わない。

担当はCodex継続。Coworkは同じソース/設定/Stripeを並行改修しない。独立表示確認と、許可されている相談受付の販促運用を担当する。料金変更を店舗獲得と数えない。外部店舗数/有料数は別途実測し、D1件数とStripe契約数も区別する。

## 初回公開・本番集計（2026-09-27 16:12 JST）
- コードcommit: d8948098c304611a9b7ab920a430e6dfaf11fa7e。PRを介さず既存のfeature/ui-search-v2 push→通常CIの経路。
- 通常CI: https://github.com/t-ooku/P-GATE/actions/runs/36302229791 （test/deploy/health成功）。
- 素材生成: https://github.com/t-ooku/P-GATE/actions/runs/36302229801 （全回帰/画像生成/deploy/health成功）。生成commit: 2b7954961d778e7eece26e791beab9672d378a89。
- 本番Worker sourceをCloudflareの読み取りAPIから取得。新offer/termsと旧offerを確認。取得本文SHA256: 1d343bcb4f62378c74fa231f1d435617441e04f0a05d3166a8673d524f212678。最終公開は下の追記を正とする（素材生成と通常CIの公開順差分を統合する）。
- 本番の新規Seller設定は未設定。したがって申込み受付はOFF。未適用migrationは0087_seller_contact_permissions.sql、0088_seller_inquiry_notifications.sql、0089_seller_listing_pilot.sqlの3本。他の未適用はない。
- D1の旧請求アカウント: BUSINESS / ACTIVE / FREE_OF_CHARGE / Stripe subscription紐付けなし が3件。有料移行対象とはみなさず、この特別な無料条件を維持。Stripe側全体の契約数や、外部有料店舗数はこの結果から断定しない。
- pilot契約集計は取得不可（D1 HTTP400、0089未適用）。0件と報告しない。
- 実Stripeの新Price・既存未完了Checkout/Payment Link・請求プレビュー・Test Clockは未確認。
- 証跡artifact: https://github.com/t-ooku/P-GATE/actions/runs/36302229791/artifacts/10926495003
- Yahoo canary抽出は対象行なし。#369の復旧証明にはならず、解決扱いにしない。
