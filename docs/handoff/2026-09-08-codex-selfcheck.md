# 2026-09-08 Codex 朝ブリーフ対応

## 起動時確認

- `/health`: ok=true、missing/weak空、X/Instagram connected=true、Runway ready=true、database_featuresは全てtrue。
- 最新確認CI: https://github.com/t-ooku/P-GATE/actions/runs/34176914358 。source `f436a33384dafe30329cf95685d9230d3ff335ae`、test/deploy/read-operations成功。Cloudflare version `597c0f20-10cb-4c0d-9359-e15107989dd8`。
- 自動incident #106は記録上GITHUB_SCHEDULE_HEARTBEAT_STALEのみ。常設ルールに従い自己参照を除外。
- 新着 `2026-09-08-claude-to-codex-sns-operations.md` 全文を受領。SNS主幹移管・毎日Stories・火木日カルーセル・月水土新規Reel・金曜既存素材編集を確認。#123は最新方針の確認が必要。

## 本番実測（10:32:59 JST）

ソース: read-operations artifact 10037596349。内部会員を一般実績へ含めない。

- ウォッチ: 3件、IDあり0/なし3。一般ユーザー0件/0人。
- 巡回累計: API_FAILURE 103、NO_CANDIDATES_PARTIAL_API_FAILURE 95、NO_CANDIDATES 3。価格一致観測なし。新規保存から通知まで未証明。
- 楽天価格キャッシュ192件、期限内192件。最終取得9/7 14:38:27 JST。
- 営業: SENT 5、QUEUED 5。配信停止0/返信登録0。delivered/bounceは未取得。残る5件の次回予定は9/9 09:05 JST、現在送信対象0件。
- 今日のThreadsはPUBLISHED 2件・APPROVED 5件。今日のInstagramはAPPROVED 2件。現状の集計は当日分だけなので#252の全件再試行消滅とStories/カルーセルは証明できない。

## 今回の改善と制限

巡回のAPI別固定コード診断を追加。個人情報・検索文・商品名・ID・API本文を診断へ保存せず、QAイベントとして一般KPIから除外する。既存reason/同一商品判定/希望価格条件は変更しない。
Threadsの全日付再試行監査と、Instagram当日の形式・公開証拠件数も読取専用集計へ追加する。クエリ失敗はUNAVAILABLEを維持。

画面検証はQA流入で「サーモス 水筒」→すぐ検索まで操作したが、セキュリティ確認が完了せず候補取得前に停止。未ログインでもあり、新規Watch保存・受信を行っていない。認証やセキュリティ確認を回避しない。

旧3件のIDを推測補完しない。#252/#123は本番証拠確認前に閉じない。SNS・営業ジョブを再実行していない。

## 10:41 JST以降の確認・追加修正

- source `7b37cbc5bc0579ddb7ac80f590f743cd7603eaeb`を本番反映。全Worker 2,282件・検索品質検査PASS。CI https://github.com/t-ooku/P-GATE/actions/runs/34177383383 。
- artifact 10037744064（10:41:12 JST）で、全日付のThreads `last_error<>'' AND status IN ('APPROVED','PUBLISHING')` は0件。CANCELLED/TEXT_TOO_LONG 1件、FAILED/OTHER_REDACTED 4件は履歴として残る。これを証拠に#252をclose済み。自分で既存投稿をcancelしたとは報告しない。
- Instagram形式診断はUNAVAILABLEだった。原因は読み取り専用SQLガードが文字列関数REPLACEを更新文として弾くため。ガードは弱めず、同じ境界判定をGLOBへ変更し、テストにも本物のread-onlyガードを通す。
- [楽天公式仕様](https://webservice.rakuten.co.jp/documentation/ichiba-item-search)はkeyword最大128 single-byte characters・空白区切りAND検索。長い販促文付き商品名を200文字までそのまま送る旧巡回はこれに不適合。検索語だけ128 UTF-8 bytes以内に圧縮し、原文に実在する型番を優先する修正を準備。候補の同一商品判定・IDの完全一致は変えず、旧空IDも更新しない。
- 長い商品名→API候補→ABOVE_TARGETの回帰テストと、設定スナップショット不変を検証。実際の失敗198件すべてが文字数原因とはまだ断定せず、新しいprovider診断で確認する。

## 2026-09-09 00:08 JST 以降の未コミット監査

- `/health` は `ok:true`、`missing:[]`、`weak:[]`。X/Instagram接続、Runway準備、全database featureを確認した。既知の未設定項目（未充足需要同期、SP-API、Amazon Creators、TikTok）は増えていない。
- Issue #106 は `SEARCH_SLO_RECOVERY_UNVERIFIED:3/3:1.000` でopen。直近6時間の3件はいずれも `TURNSTILE_TOKEN_UNAVAILABLE` による縮退で、公開契約・AI/Rakuten/Yahoo canary・Cloudflare heartbeatはPASS。最新コードはセキュリティ確認を迂回せず13モール導線を表示する。一般利用者の正常検索がまだ観測されていないため、回復済みとは扱わない。
- 旧作業ツリーの未push `d7e1d55` は本番反映済み `425f7409` とpatch-idが完全一致。残る有効変更も `85c11a83`、`2a9a1c1c`、`b886de0f`、`c3e5dac8`、`07e4a427` で実装済み。古いアセット版への巻き戻しや匿名集計の削除になる差分は統合しない。
- KPI運用診断テストが固定日付に依存し、JSTの日付変更後に失敗する問題を発見。テストデータを現在時刻・現在JST日付基準へ変更し、日付をまたいでも同じ契約を検証できるようにした。
