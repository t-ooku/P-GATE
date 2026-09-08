# HOSHILU LINE開始ランブック

## 完成済み

- Webhook署名検証
- 再送重複排除
- テキスト質問のKnowledge連携
- 最大3候補の返信
- 署名付きEC送客
- 表示・クリック・送客計測
- 非テキストイベントへの安全な案内
- Secret未設定・片側設定のヘルス診断

## アカウント所有者が行う作業

1. LINE公式アカウント名を「ホシル｜欲しいを一緒に見つける」にする。
2. Messaging APIのChannel secretとChannel access tokenを発行する。
3. 値を文書・チャット・Spreadsheetへ貼らず、Cloudflare Worker Secret
   `LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`へ設定する。
4. Webhook URLを
   `https://project-gate-line-bridge.mygate-jp.workers.dev/webhook`
   に設定して利用をONにする。
5. LINE DevelopersのWebhook検証を成功させる。

## 受入試験

- 日本語、英語、中国語、韓国語で各1件送信
- 同一Webhook再送で二重返信しない
- 非テキスト画像へ安全な使い方案内を返す
- 商品候補が最大3件
- 商品リンクが許可ECだけへ遷移
- GASログに生のLINEユーザーID・質問本文・Secretが残らない
- `/health` の `line_configured` が `true`

失敗時はWebhookをOFFにし、Secretは失効・再発行する。GASへLINE Secretを移さない。
