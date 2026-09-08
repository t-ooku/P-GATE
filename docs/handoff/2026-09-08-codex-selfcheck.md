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
