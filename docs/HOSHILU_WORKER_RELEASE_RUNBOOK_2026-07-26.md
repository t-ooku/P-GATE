# HOSHILU Worker release runbook — 2026-07-26

## Scope

MYWATCH、輸入制限Knowledge、SP-API出品同期を本番へ反映する。
Secret値は文書、チャット、Git、Spreadsheetへ貼らない。

## Before deployment

1. `npm.cmd test` をリポジトリ直下で実行する。
2. `tools/line-worker` でWrangler dry-runを実行する。
3. D1バックアップまたはexportを取得する。
4. `wrangler d1 migrations list hoshilu-products --remote` で未適用migrationを確認する。
5. 次の追加migrationが一覧にあることを確認する。
   - `0005_mywatch_notifications.sql`
   - `0010_sp_api_listing_sync.sql`
   - `0011_import_restriction_knowledge.sql`

## Apply

1. `wrangler d1 migrations apply hoshilu-products --remote`
2. migration結果に失敗がないことを確認する。
3. 必要なSecretを対話入力で設定する。
   - `MYWATCH_CRON_SECRET`
   - `UNMET_DEMAND_SYNC_SECRET`
   - `SPAPI_LWA_CLIENT_ID`
   - `SPAPI_LWA_CLIENT_SECRET`
   - `SPAPI_REFRESH_TOKEN_ITG`
   - `SPAPI_REFRESH_TOKEN_ITT`
   - `SPAPI_REFRESH_TOKEN_MC2`
4. `wrangler deploy`

Amazon未承認の場合、SP-API Secretは設定せずにdeployできる。未設定テナントは
cronから安全に除外される。

## Acceptance

- `/health` がHTTP 200で、既存必須Secretに不足がない。
- 公開検索でITG・ITT・MC2の商品候補を検索できる。
- 同一ASINが複数テナントに存在しても商品カードが重複しない。
- MYWATCHの日次・週次通知が配信時刻前に表示されない。
- 会員が通知頻度を即時・日次・週次・停止へ変更できる。
- `sp_api_sync_audit` は認可済みテナントだけに成功または失敗を記録する。
- SP-API失敗時も既存出品を削除しない。
- HOSHILU INSIGHTはGROWTH以上だけに詳細需要を表示する。
- 輸入制限集計は同一分類5件未満を表示しない。

## Rollback

- Worker障害時は直前のCloudflare deploymentへrollbackする。
- D1の追加テーブルは既存商品検索テーブルを破壊しないため、緊急時は新機能のSecretを
  削除してcron連携を停止し、テーブル削除は行わない。
- SP-API認可障害時は該当テナントのrefresh tokenだけを失効し、他テナントを継続する。
