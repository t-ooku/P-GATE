# HOSHILU MYWATCH実装記録 2026-07-25

## 本番化した範囲

- 販売開始、値下げ、クーポン、再入荷の4イベント
- 会員が選択した通知種別とミュートの尊重
- 即時、日次、週次、ミュートの配信時刻計算
- 日次・週次Web通知を配信時刻まで非表示にする15分cronキュー
- 会員画面から即時・日次・週次・停止を変更
- ほしっとく削除時に紐づく通知を同時削除
- 同一会員・Wish・イベント・チャネルの重複排除
- Web通知一覧、既読、非表示
- 会員境界による通知情報の分離
- 内部イベントAPIの専用Secret保護
- 指数バックオフによる再試行時刻計算
- 配信・既読・非表示の監査ログ
- 日本語、英語、中国語、韓国語の通知理由

## 本番構成

- D1 migration: `0005_mywatch_notifications.sql`
- Tables: `mywatch_notifications`, `mywatch_delivery_audit`
- Internal API: `POST /api/internal/mywatch/events`
- Member API: `GET /api/member/notifications`
- Member action: `PATCH /api/member/notifications/:notification_id`
- Worker secret: `MYWATCH_CRON_SECRET`（値は非表示・非保存）

## 次の接続

Web通知キューは本番化済み。LINE Messaging API配信は、LINE Loginの匿名会員IDと
Messaging APIの送信先IDを、明示同意のもとで安全に結び付ける処理が必要。
現在のハッシュを逆変換して送信先IDを作らない。LINE公式アカウントのSecret設定と
アカウントリンク受入試験後に、同じ通知キューへLINEチャネルを追加する。
