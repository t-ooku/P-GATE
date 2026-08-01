# HOSHILU 流入・アトリビューション運用手順

## 原則

- Search Consoleの自然検索クリックと、HOSHILU内の匿名イベントは別データとして扱う。利用者単位で推定接続しない。
- `traffic_class='QA'` は検証専用。成果、広告CV、プレス実績、提携実績へ混ぜない。
- `landing_view` などはイベント件数であり、ユーザー数ではない。ユニークユーザー数として公表しない。
- メールアドレス、会員ID、検索文、商品名を広告媒体へ送らない。

## UTM命名

`utm_source`: 媒体または提携先を小文字英数で表す。例 `google`, `partner_slug`, `newsletter`。

`utm_medium`: `cpc`, `display`, `referral`, `affiliate`, `newsletter`, `offline_qr` のいずれか。

`utm_campaign`: `目的_テーマ_yyyymm`。例 `acq_unknown_product_202608`。

`utm_content`: 広告または掲載枠を識別。例 `rsa_a`, `directory_profile`, `a6_card_front`。

QAは必ず `utm_source=qa_acceptance&utm_medium=qa&utm_campaign=measurement_acceptance` とする。

## 週次処理

1. `HOSHILU_GROWTH_FUNNEL_REPORT.sql` の期間を対象週へ変更して実行。
2. QA表を先に確認し、本表へQAが混入していないことを確認。
3. Search Consoleから指名クエリ `HOSHILU` / `ホシル` と非指名クエリを別々に集計。
4. LP到達→検索開始→検索完了→無料登録→モール送客をチャネル別に比較。
5. 率の分母が20未満なら判断を保留。100セッションまたは4週間まで継続。

## 広告コンバージョン候補

- Primary: `search_completed`
- Secondary: `registration_completed`, `marketplace_click`
- Diagnostic: `landing_view`, `search_started`, `pwa_install_completed`, `return_visit`

媒体タグ・Cookie・拡張コンバージョンは未実装。本人がプライバシー表示、同意管理、媒体規約、データ保持期間を承認するまで設定しない。
