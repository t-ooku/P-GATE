# 認証強化リリース手順

対象は Worker release `1.18.0`、`0027_admin_login_guard.sql`、
`0028_seller_login_guard.sql` です。同期リース／通知状態の0025・0026は別リリースであり、
この手順の合否条件には含めません。

## 1. ローカル確認

`tools/line-worker` で実行します。

```powershell
npm.cmd run check:auth-release
npm.cmd test
```

合格条件は、認証専用テスト、Worker bundle dry-run、0027・0028の単独D1適用、
認証用2テーブル・2索引が管理者用とセラー用に各1組存在すること、Worker全回帰が
すべて成功することです。認証checkerは0025・0026を読み込まず、その有無を判定しません。

## 2. 本番preflight

本番では0027、0028がこの順で適用済みです。移行番号の欠番は別リリースとの分離による
意図した状態です。再適用はせず、履歴と認証用テーブル・索引の存在を読み取り確認します。

```powershell
npx.cmd --yes wrangler@4.113.0 d1 migrations list hoshilu-products --remote
npx.cmd --yes wrangler@4.113.0 d1 export hoshilu-products --remote --output ..\..\outputs\hoshilu-products-pre-auth.sql
```

次をすべて満たさない場合はdeployしません。

- migration履歴に0027、0028がこの順で記録され、未適用一覧へ再出現していない。
- 退避SQLが空でない。
- `PRODUCT_DB` が `hoshilu-products` に接続されている。
- 次の値が本番Secret／設定に存在し、すべて相互に異なる。

```text
ADMIN_AUTH_ID
ADMIN_AUTH_PASSWORD（16文字以上）
ADMIN_SESSION_SECRET（独立したランダム値64文字以上）
SELLER_AUTH_ID
SELLER_AUTH_PASSWORD（12文字以上）
AUTH_SESSION_SECRET（独立したランダム値64文字以上）
SELLER_ALLOWED_TENANTS（許可店舗だけをカンマ区切り）
```

サンプル値、コマンド引数、チャット、GitにSecretを記録しません。IDまたはパスワードの変更時は
既存セッションは即時失効し、管理者・セラーとも再ログインが必要です。Cookie名も
`__Host-hoshilu_admin_session`／`__Host-hoshilu_seller_session` へ変わるため、旧Cookieは継続利用できません。

## 3. 移行と公開

preflight合格後だけWorkerを公開します。0027、0028は適用済みのため再適用しません。

```powershell
npx.cmd --yes wrangler@4.113.0 deploy
```

公開後は `/health` がHTTP 200、`release` が `1.18.0`、次の値であることを確認します。

- `admin_auth_configured=true`
- `admin_auth_weak=false`
- `admin_credentials_distinct=true`
- `seller_auth_configured=true`
- `seller_auth_partial=false`
- `seller_auth_weak=false`

管理者／セラーの正常ログイン、同一Origin以外の更新拒否、5回失敗後の15分停止、
ログアウト、監査集計を確認します。応答・画面・ログにSecretやIPアドレスが出ないことも確認します。

## 4. 問題発生時

0027・0028は追加移行であり、適用後にテーブルや索引を削除しません。Workerを直前版へ戻しても
認証監査テーブルは残します。移行の破壊的ロールバックは行わず、原因修正後に前進適用します。
認証設定不足で `/health` が503になる場合は、新Workerを公開せずSecret設定を完了します。
