# HOSHILU SP-API自動同期仕様 v1.0

## 目的

Amazon出品情報の手動CSV出力を廃止し、新規出品・更新・販売停止をHOSHILUへ自動反映する。

## 正式テナント対応

| Tenant | 店舗 | Seller / Merchant ID | Secret binding |
|---|---|---|---|
| `itg` | with care | `A19ONFBH56J9DF` | `SPAPI_REFRESH_TOKEN_ITG` |
| `itt` | Find fun | `A1MIQXZ599XF4E` | `SPAPI_REFRESH_TOKEN_ITT` |
| `mc2` | Tomorrow's smile | `A3NNU8MHK7TN8Z` | `SPAPI_REFRESH_TOKEN_MC2` |

秘密情報はCloudflare Worker Secretだけに保存し、ソース、ログ、画面、URLへ出さない。

## 日本マーケットプレイス

- Marketplace ID: `A1VC38T7YXB528`
- Region: Far East
- Endpoint: `https://sellingpartnerapi-fe.amazon.com`

## 同期方式

### 初回

各テナントの全出品をページング取得する。`searchListingsItems`の1ページ上限は20件なので、
ページトークンを最後まで処理する。途中失敗時は再試行し、監査ログから再開可能にする。

### 通常差分

- `lastUpdatedAfter` と `lastUpdatedBefore` で更新商品を取得
- 前回カーソルに10分の重複を持たせる
- `(tenant, seller_sku, marketplace_id)` のupsertで重複を無害化
- 新規出品は作成時に`lastUpdatedDate`を持つため同じ差分処理で自動取得

### 通知

承認後、次を購読する。

- `LISTINGS_ITEM_STATUS_CHANGE`
- `LISTINGS_ITEM_ISSUES_CHANGE`
- `LISTINGS_ITEM_MFN_QUANTITY_CHANGE`（MFN在庫を使う場合）

通知受信時は対象SKUの即時再取得をキューへ投入する。通知は高速化のために使い、
正確性は差分同期と全件照合でも保証する。

### 日次照合

1日1回、3テナントを時間分散して全件走査する。全件走査に現れなかった既存SKUは
即削除せず、`missing_from_amazon`として販売候補から除外する。連続確認後に非アクティブ化する。

## データ更新規則

- 新規SKU: 作成
- 同一SKU更新: 価格、在庫、商品名、画像、ASIN、販売状態を更新
- `BUYABLE`なし: 販売候補から除外
- `DISCOVERABLE`なし: 検索候補から原則除外
- 問題あり: issueコードを運営画面に記録
- API一時障害: 既存商品を削除しない
- 認可切れ: テナント単位で同期停止し、他テナントは継続

## CSV廃止条件

次の全条件を満たした後に手動CSVを停止する。

1. 3アカウントすべてのOAuth認可が完了
2. 初回全件同期件数が既存CSVと許容差内
3. ASIN・Seller SKU・在庫・販売状態のサンプル照合に合格
4. 新規テスト出品が差分同期で自動追加される
5. 出品停止テストがHOSHILUへ反映される
6. 7日間連続で同期失敗・欠落がない
7. CSV経路を30日間、復旧用バックアップとして保持

## 実装

- `tools/line-worker/src/sp-api-sync.mjs`

Amazon承認後に必要なWorker Secret:

- `SPAPI_LWA_CLIENT_ID`
- `SPAPI_LWA_CLIENT_SECRET`
- `SPAPI_REFRESH_TOKEN_ITG`
- `SPAPI_REFRESH_TOKEN_ITT`
- `SPAPI_REFRESH_TOKEN_MC2`

値はチャットへ貼らず、PowerShellの`wrangler secret put`で直接登録する。
