# HOSHILU 朝ブリーフ実行結果 2026-09-08

最優先P0の新規Watch Set→3時間巡回→通知受信は未完了。今回、実測で巡回障害を検知し、検索語修正と匿名診断を本番反映した。推測で完了扱いにしない。

## 本番反映済み

- source: `35fca079fccced4f2915a2f57833fb350cdb42ee`
- Cloudflare Version ID: `f3f8492a-7b79-45be-9613-92a50c71ac58`
- [CI](https://github.com/t-ooku/P-GATE/actions/runs/34177607145): test / deploy / read-operationsすべてsuccess。
- Worker 2,284件PASS、release/extension各6件PASS。検索品質検査PASS。
- 本番health・重要API・KPI接続は10:45:20 JSTにCIで確認済み。
- migration追加、旧WatchのID補完、SNS/営業ジョブの再送は実行していない。

### 変更内容

1. 巡回APIの固定コード診断を追加。RAKUTEN/YAHOO/AMAZON・HTTP状態・候補あり/なし・タイムアウト・接続調整失敗を、個人情報・検索文・商品ID・API本文を含まないQAイベントとして記録する。
2. [楽天公式仕様](https://webservice.rakuten.co.jp/documentation/ichiba-item-search)に対し長い商品名の送信が不適合だったため、候補取得用の検索語を128 UTF-8 bytes以内にする。元の名称にある型番等を優先。ID完全一致・候補同一性判定・希望価格の閾値を緩めず、旧空IDを変更しない。
3. Threadsは全日付のエラー付き再試行を匿名監査する。当日だけの集計による見落としを防ぐ。
4. Instagram当日のStory判定/形式/公開証拠件数を匿名集計する。SQLの文字列REPLACEがread-onlyガードで弾かれた問題はGLOBで解消し、ガードそのものは維持。

## 10:45 JSTの本番実数

取得元: `hoshilu-codex-kpi-34177607145`、artifact 10037816299、生成 `2026-09-08T01:45:20.602Z`。

| 項目 | 実測 |
|---|---|
| 全Watch / IDあり / IDなし | 3 / 0 / 3（内部確認用） |
| 一般ユーザーWatch | 0件 / 0人 |
| API_FAILURE累計 | 104 |
| NO_CANDIDATES_PARTIAL_API_FAILURE累計 | 97 |
| NO_CANDIDATES累計 | 3 |
| 10:45巡回の楽天 | HTTP_400 3件 |
| 10:45巡回のYahoo | EMPTY 2件、COORDINATOR_UNAVAILABLE 1件 |
| 楽天キャッシュ | 192件、期限内192件 |
| キャッシュ最終取得 | 9/7 14:38:27 JST |
| 最初のキャッシュ失効 | 9/8 13:22:54 JST |
| 営業sent / queued | 5 / 5 |
| unsubscribe / response登録 / failed | 0 / 0 / 0 |
| delivered / bounce | 未取得（一次イベント未接続） |
| 残る営業予約 | 9/9 09:05 JST、現在eligible 0 |

10:45巡回の観測時刻は10:45:10 JST、検索語修正のデプロイ完了は10:45:17 JST。したがってこの3件は修正前巡回として扱い、修正後の成否に混ぜない。HTTP400の詳細本文は取得しない。過去201件全ての原因が文字数だったとは断言できず、Yahooの接続調整失敗も別に追う。

## Threads #252

10:41・10:45の全日付匿名監査で、THREADSの `last_error<>'' AND status IN ('APPROVED','PUBLISHING')` は0件。過去のCANCELLED/TEXT_TOO_LONG 1件とFAILED/OTHER_REDACTED 4件は保持。

既存の本文＋リンク＋広告表記の長さ制御、恒久エラー即停止、最大3回打切りも本番反映済み。[#252](https://github.com/t-ooku/P-GATE/issues/252)に証拠を追記しclose済み。今回自分でcancelしたとは報告しない。

## 火曜カルーセル＋Stories

当日のInstagram予約はREEL/APPROVED 1件（20:15）、UNSPECIFIED/APPROVED 1件（20:00）。Story行0件、公開証拠付き0件。形式未指定をカルーセルとして数えない。

現行publishInstagramの分岐はSTORIES/REELS/単一画像。native CAROUSEL作成経路は確認できず、content_formatのDB制約もCAROUSELを許さない。よって最新運用に未達。[#123](https://github.com/t-ooku/P-GATE/issues/123)に本番証拠と最新曜日方針を追記しopenを維持。

既存キューの置換・削除は行っていない。残る作業は正式カルーセル経路、権利確認済み素材、毎日Story、日付一意の投稿枠の整備と公開証拠確認。既存APPROVED行の置換は引継ぎの対象限定承認境界に従う。

## 本番Watch保存の制限と再確認

QA用画面で「サーモス 水筒」→すぐ検索を操作したが、セキュリティ確認が完了せず候補取得前に停止。会員も未ログイン。新規Watchを作った証拠はない。認証やTurnstileを迂回せず、内部テストを一般実績に含めない。

大隆さんのログイン済み画面で、楽天の商品候補1件を選び希望価格を保存してもらう必要がある。これは動作確認であり、一般利用者の自発的採用実績ではない。保存後、ID件数・巡回・通知判定を追う。

既存「HOSHILU巡回の本番確認」を9/8 11:15・14:15 JSTの2回に更新済み。新旧reason・API別診断・ID保存・3時間後継続を確認し、必要なread-operationsだけ再実行する。SNS/メールの再送はしない。
