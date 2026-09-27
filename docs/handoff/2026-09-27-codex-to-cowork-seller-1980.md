# Codex → Cowork：Seller 1,980円・30日無料

## 状態
公開表示・実装は本番確認済み。Stripe決済設定と申込み全体の本番確認は未完了。新条件での契約受付開始はまだ不可。掲載見本の相談受付と価格に依存しない販促は継続可能。旧4,980円/3か月/カード不要/自動課金なしの新規勧誘を再開しない。

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
- https://hoshilu.app/terms
- https://hoshilu.app/api/seller-pilot/offer
- https://hoshilu.app/seller-pilot （契約本人のログイン/有効化が必要）
- https://hoshilu.app/for-creators
- https://hoshilu.app/ja/ec-shukyaku-without-ad-budget

## 検証
ローカル全回帰: Worker 2,871件、release 6件、拡張6件通過。GASテスト通過。検索品質ゲート・Wrangler 4.121.0 dry-run通過。決済テストは疑似Stripe応答＋実SQLiteによるテスト。実Stripe Test Clock/カード/請求成功とは区別する。

新旧offer/terms、旧Priceのアーカイブ、新規Price設定の変更後も保存契約で照合、誤額/税/通貨/Product/interval/mode/quantity、未同意/未登録、DB失敗、再公開、30×24時間/UTC/JST/月末、重複・古いWebhook、決済失敗、処理中解約受付、無料終了、匿名化/QA除外を検証。

本番source・CI・確認時刻・契約集計・migrationは以下の確認記録を参照。GitHubへ連絡先、カード情報、Secret、個別契約文は掲載しない。

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

## 最終確認（2026-09-27 16:21 JST）
- 本番source commit: `9f3753c46f8132f26014b792ff75cc5397bc0788`。通常CI: https://github.com/t-ooku/P-GATE/actions/runs/36302612501 。test/deploy/healthすべて成功。CI全回帰はWorker 2,872件、release 6件、拡張6件、失敗0。GAS・検索品質ゲートも通過。
- 2026-09-27 16:19:22 JST、Cloudflare読み取りAPIの本番Worker本文と、このcommitから再生成したbundleが一致（matches_built_bundle=true）。Worker Version ID: `3fc6336c-b5e4-44cc-a8e1-5fbbf553cb12`。
- Built bundle SHA256: `8dca091d6f2b47379658c2a5a07802005b1ba9b4f87c7ea046ae5df245e79b06`。取得本文SHA256: `de11f745c4f719d235782d695c6f2812a164189f059c1191de87babdf82e61f9`。新offer/termsと旧offerを確認。
- 最終監査artifact: https://github.com/t-ooku/P-GATE/actions/runs/36302612501/artifacts/10926027176 。未適用migration3本、無料扱い3件、pilot集計取得不可、受付設定未設定は初回確認と同じ。
- 16:21 JSTの公開確認: /health、/for-sellers、/terms、/api/seller-pilot/offer、/for-creators、SEO記事すべてHTTP200。health ok=true、missing/weak=[]。公開4ページの1,980円・カード登録・自動更新・準備中を確認し、旧4,980円や値下げ告知なし。
- 公開offer API: monthly_jpy=1980、currency=jpy、tax_inclusive=true、trial_days=30、新terms。enabled=false（契約受付は不可）。
- ブラウザでLPの料金・無料条件、相談フォームの初期未選択チェック、FAQのモール手数料の区別、規約への遷移と本文を確認。QA識別URLを使用。フォーム送信・実カード登録・実課金はしていない。
- Creatorの画像リンクは新版。Seller画像24枚を生成済み。公開画像 `/social/carousel/seller1980-30d-autorenew-20260927/seller-demand-visible/4.jpg` はリポジトリの画像とバイト一致。SHA256: `41eeceebc8fcee87eb96ec41efa41b686f9e8fd6ed1cc2de7d39c1cc4b8423a1`。販促時はカード登録・自動更新・解約条件を含む全文キャプションを使う。
- 旧FREE_OF_CHARGEかつSubscriptionなしのアカウントは保存済み免除条件から0円と表示し、不要なStripe照会を行わない。3件への課金・契約変更はなし。
- 別担当の追加commit `f77bd7e5e9d03b1aa5b9c2a0bee68ff06406027b`（Threads文面に残ったカード不要説明の修正と回帰テスト）を検出。料金正本・Stripe設定を変更していないため保持し、この記録の更新と合わせて通常CI・公開を確認する。最終sourceの追記を確認するまで、この追加commitの本番反映は未確認。

### Coworkの運用判断
**新条件での有料契約申込み受付は開始不可。掲載見本の相談受付と価格に依存しない販促は可能。** 公開文面は「新規Sellerは商品公開から30日間無料。その後は月額1,980円（税込）」と必要な自動更新条件を提示し、現在は準備中であることを保持する。料金変更の告知、旧条件の新規募集、未確認の店舗獲得数は使わない。

開始を止めているのは、Stripe接続と実決済テスト・旧リンク棚卸し、AGENTS.mdに基づく0087/0088/0089の本番適用承認、事業者・法定表示の照合。ソース実装や公開表示の未反映を理由に止めているわけではない。承認待ち中も相談受付は継続する。
