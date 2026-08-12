# HOSHILU SNS自動投稿開始手順

## 現在の状態

- Cloudflare Cronは15分ごとに投稿キューを確認する。
- `REVIEW_REQUIRED`は投稿されない。
- `APPROVED`かつ予約時刻到来済みの投稿だけを最大5件処理する。
- 成功後は`PUBLISHED`と外部投稿IDを保存し、同じ投稿を再送しない。
- 失敗は`FAILED`と短いエラーコードだけを保存する。
- Instagram Business Loginで取得した長期アクセストークンは、Worker Secretから
  導出したAES-GCM鍵で暗号化し、暗号文と有効期限だけをD1へ保存する。

## 必須Secret

- 共通: `SOCIAL_ADMIN_SECRET`
- X: `X_USER_ACCESS_TOKEN`
- Instagram Business Login: `INSTAGRAM_APP_SECRET`、32文字以上の
  `SOCIAL_OAUTH_ENCRYPTION_KEY`
- Instagram移行中のフォールバック: `INSTAGRAM_ACCESS_TOKEN`
- TikTok: `TIKTOK_ACCESS_TOKEN`、審査通過後に`TIKTOK_APP_AUDITED=true`

`INSTAGRAM_APP_ID`、`INSTAGRAM_ACCOUNT_ID`、`INSTAGRAM_OAUTH_REDIRECT_URI`は
`wrangler.jsonc`の公開設定を使う。SecretはWrangler Secretとして登録し、CSV、
文書、チャットへ保存しない。アクセストークンの平文はD1へ保存しない。

## Instagram Business Login

Metaアプリには次のURLを登録する。

- OAuthリダイレクトURI: `https://hoshilu.app/api/oauth/instagram/callback`
- コールバックURLの承認取り消し: `https://hoshilu.app/api/oauth/instagram/deauthorize`
- データの削除リクエストURL: `https://hoshilu.app/api/oauth/instagram/data-deletion`

接続前にD1をバックアップし、`0049_instagram_oauth_credentials.sql`を本番へ適用する。
その後、`INSTAGRAM_APP_SECRET`と`SOCIAL_OAUTH_ENCRYPTION_KEY`をWorker Secretへ登録し、
`https://hoshilu.app/api/oauth/instagram/start`から本人がInstagram認証を完了する。
接続状態は`/health`の`checks.instagram_oauth`で確認できる。値は
`configured:true`かつ`connected:true`でなければ投稿テストへ進まない。

## アカウント側の準備

1. X Developerで書込権限を持つユーザー認証を完了する。
2. Instagramをプロアカウント（BusinessまたはCreator）にする。
3. Metaアプリで`instagram_business_basic`と
   `instagram_business_content_publish`を許可し、Business Loginを完了する。
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

InstagramはD1の接続行を削除し、移行用`INSTAGRAM_ACCESS_TOKEN`も削除すると
`NOT_CONFIGURED`で停止する。他SNSは認証Secretを削除すると停止する。
予約済みの未公開行は`cancel`で停止できる。公開済み投稿の削除は各SNS公式画面で行う。
Cronが重複しても状態の排他的更新に成功した1処理だけが投稿する。`PUBLISHING`のまま
30分を超えた行は`FAILED`へ隔離し、自動再投稿せず人が確認する。
