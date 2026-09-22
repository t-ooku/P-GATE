# HOSHILU SNS自動投稿開始手順

## 現在の状態

- Cloudflare Cronは15分ごとに投稿キューを確認する。
- `REVIEW_REQUIRED`は投稿されない。
- `APPROVED`かつ予約時刻到来済みの投稿だけを最大5件処理する。
- 成功後は`PUBLISHED`と外部投稿IDを保存し、同じ投稿を再送しない。
- 失敗は`FAILED`と短いエラーコードだけを保存する。アクセストークンは保存しない。

## 必須Secret

- 共通: `SOCIAL_ADMIN_SECRET`
- X: `X_USER_ACCESS_TOKEN`
- Instagram: `INSTAGRAM_ACCESS_TOKEN`、`INSTAGRAM_ACCOUNT_ID`
- TikTok: `TIKTOK_ACCESS_TOKEN`、審査通過後に`TIKTOK_APP_AUDITED=true`

SecretはWrangler Secretとして登録し、CSV、文書、チャット、D1へ保存しない。

## アカウント側の準備

1. X Developerで書込権限を持つユーザー認証を完了する。
2. Instagramをプロアカウント（BusinessまたはCreator）にする。
3. MetaアプリでContent Publishing権限と長期アクセストークンを準備する。
4. TikTok DeveloperでContent Posting APIを追加し、`video.publish`承認とアプリ監査を完了する。
5. Instagram/TikTok用画像は公開HTTPS URLへ配置する。権利確認済み素材だけを使う。

## キュー確認と承認

PowerShellの現在セッションだけに管理Secretを設定する。

```powershell
$env:HOSHILU_SOCIAL_ADMIN_SECRET = '<32文字以上の管理Secret>'
node tools/social-queue-cli.mjs list
node tools/social-queue-cli.mjs approve launch01-phone-case 2026-07-29T02:00:00Z
node tools/social-queue-cli.mjs cancel launch01-phone-case
```

承認前に、権利、本文、リンク、計測値、広告表示、公開日時を二者確認する。

## ロールバック

SNS認証Secretを削除すると、そのプラットフォームは即座に`NOT_CONFIGURED`で停止する。
予約済みの未公開行は`cancel`で停止できる。公開済み投稿の削除は各SNS公式画面で行う。
Cronが重複しても状態の排他的更新に成功した1処理だけが投稿する。`PUBLISHING`のまま
30分を超えた行は`FAILED`へ隔離し、自動再投稿せず人が確認する。
