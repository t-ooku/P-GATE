# MYGATE / ITG SNS・LINE・アプリ開始状況

## MYGATE公式SNS

| 媒体 | アカウント | 現在地 | 次の必須作業 |
|---|---|---|---|
| Instagram | `@mygate_official` | 作成済み | ログイン権限、プロフィール設定、初回投稿承認 |
| X | `MY GATE` / `@iCHMR81Lv4VYJYG` | 作成済み | ログイン権限、プロフィール設定、初回投稿承認 |
| TikTok | 未作成 | 保留 | 縦型動画10本を制作後に開始判断 |

TikTokは不要ではない。Instagram Reels用動画を10本制作し、継続性を確認した後、同じマスター動画をTikTokへ展開する。休眠アカウントを先に増やさない。

## MYGATE公式プロフィール

### Instagram

> 自分の欲しいを、ちゃんと見つける。
> 商品名が分からなくても、曖昧な記憶からAIと一緒に探せます。
> MYCONCIERGE｜MYWISH｜MYTREASURE｜MYWATCH
> https://project-gate-line-bridge.mygate-jp.workers.dev/

### X

> 商品名が分からなくても大丈夫。MYGATEは、曖昧な「欲しい」を会話から一緒に探し、見つかるまで覚えるAIです。
> https://project-gate-line-bridge.mygate-jp.workers.dev/

## LINE

コード、署名検証、Cloudflare Worker、テストは準備済み。開始にはLINE公式アカウント側のChannel secret、Channel access token、Webhook URL登録、Webhook利用ONが必要。SecretはチャットやSpreadsheetへ貼らず、Cloudflare Worker Secretへ登録する。

## アプリ

MYGATEはPWAとしてPC、Android、iPhoneのホーム画面から利用できる。自動テスト13件合格済み。

- URL: https://project-gate-line-bridge.mygate-jp.workers.dev/
- Android / Chrome: 「アプリを追加」または「ホーム画面に追加」
- iPhone / Safari: 共有 → ホーム画面に追加

現在利用可能: 多言語表示、MYCONCIERGE検索、候補・購入先表示、MYWISH端末保存、PWAインストール。

次段階: MYWISHクラウド同期、MYWATCHプッシュ通知、App Store / Google Play向け包装。
