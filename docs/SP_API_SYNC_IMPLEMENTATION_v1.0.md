# HOSHILU SP-API同期実装

## 実装済み

- D1出品リポジトリ: `0010_sp_api_listing_sync.sql`
- 15分ごとの差分同期（10分オーバーラップ）
- ITG・ITT・MC2を個別に認証し、1社失敗時も他社を継続
- 同期カーソルと成功・失敗監査ログ
- 日次全件照合を日本時間03:00、04:00、05:00へテナント別に分散
- 全件照合で消えたSKUは即削除せず、非表示化して欠落回数を保持
- BUYABLEかつDISCOVERABLEな出品だけを公開購入先へ接続
- 公開検索をITG・ITT・MC2の商品索引横断へ変更
- 同一ASINは1商品へ統合し、有効な購入先を保持

## 外部ゲート

Amazon承認と次のWorker Secret設定待ち。

- `SPAPI_LWA_CLIENT_ID`
- `SPAPI_LWA_CLIENT_SECRET`
- `SPAPI_REFRESH_TOKEN_ITG`
- `SPAPI_REFRESH_TOKEN_ITT`
- `SPAPI_REFRESH_TOKEN_MC2`

Secret未設定のテナントは外部通信せずスキップする。
