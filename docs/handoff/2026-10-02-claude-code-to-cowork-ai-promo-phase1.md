# Claude Code → Cowork 引継ぎ: AI販促担当 Phase 1

## 1. 状態（2026-10-03 OK① 実施後）

- 本番: `feature/ui-search-v2` HEAD `e366cff0`、deploy success、`/health` ok
- 適用済み migration: 0090〜0092
- vars: `SELLER_PROMO_ENABLED=true`（販売・Price 作成・LP 公開は OFF のまま）
- R2 `hoshilu-seller-promo-assets`・`SELLER_PROMO_KEK` 作成済み
- QA 店舗 `qa-shop-1`（架空）: 初回確認のため土曜 04:00 JST に設定中。**確認後、次の 1 行で月曜 06:00 に戻してください**:
  `POST /api/admin/seller-promo/profiles {"seller_key":"qa-shop-1","display_name":"QA雑貨店（検証用）","plan":"LIGHT","qa":true,"categories":["生活雑貨"],"weekday":1,"hour_jst":6}`
- 実際の契約者画面で見る QA 店舗を作るときは、その店で /seller にログインし `GET /api/seller-promo/deliverables` が返す `seller_key` を使って登録する（未登録の店には本人の seller_key だけを返す）

### 販売 ON 後の案内（2026-10-03）
- Light 9,800円／Standard 19,800円（税込・月額）は販売中。ただし公開 LP `/for-sellers` には載せていない（大隆さん判断: 外部店の初回公開を見てから）
- 案内には下書きページ `https://hoshilu.app/for-sellers-preview`（noindex・リンクなし）を個別に送る
- 申込は管理 API の掲載パイロット CREATE に `"plan":"LIGHT"` か `"STANDARD"`。その店の AI販促プロファイルを同じ plan・`pilot_id` で登録すると、契約がトライアル中か支払済みの間だけ週次ジョブが動く
- SNS で料金を出すのは別承認（`seller-marketing-guard` が止める）

## 2. できること／できないこと

| | 実装済み | 本番確認済み | 無人実行済み | 外部店利用済み |
|---|---|---|---|---|
| 店の登録・商品 CSV・疑問の投入 | ○ | – | – | – |
| 手動起動→生成→検査→承認待ち | ○ | – | – | – |
| 月曜 06:00 JST の自動起動 | ○ | – | – | – |
| 契約者画面での承認・差し戻し・自動公開 | ○ | – | – | – |
| WordPress 公開／楽天GOLD ZIP／原稿納品 | ○ | – | – | – |
| 月次レポート | ○ | – | – | – |
| 画像 | 手動のみ（下の「画像」） | – | – | – |

## 3. 運用手順（runbook）

認証: 管理画面にログイン済みのブラウザ（同一オリジン）か、`Authorization: Bearer <SOCIAL_ADMIN_SECRET>`。以下 `$H` はそのヘッダー。

### 店の登録
```
curl -X POST https://hoshilu.app/api/admin/seller-promo/profiles $H -H 'content-type: application/json' -d '{
  "seller_key":"qa-shop-1","display_name":"QA雑貨店","plan":"LIGHT","qa":true,
  "categories":["生活雑貨"],"ng_words":["激安"],"publish_target":"NONE",
  "notify_email":"<店の通知先>","weekday":1,"hour_jst":6,"brand":{"color":"#1f6f5c"}}'
```
- `categories` は 生活雑貨・インテリア・ペット・文具・アウトドア・バッグ・靴 のみ。化粧品・健康食品・食品・医療機器は 400。
- `publish_target`: `NONE`（原稿納品）／`WORDPRESS`／`RAKUTEN_GOLD_DELIVERY`。
- 外部店は `qa:false` で登録し、販売 OFF の間は `SELLER_PROMO_PILOT_SELLER_KEYS` に seller_key を入れたときだけ週次対象になる（vars 変更は Claude Code に依頼）。
- 契約者画面（/seller）で見せるには、その店のログインの seller_key と同じ値で登録する。

### 商品 CSV
```
curl -X POST https://hoshilu.app/api/admin/seller-promo/products/import $H -H 'content-type: application/json' \
  -d "$(jq -n --arg csv "$(cat items.csv)" '{seller_key:"qa-shop-1",csv:$csv}')"
```
列の読み方（左が優先）:
- 商品ID: `商品管理番号（商品URL）`／`商品番号`／`seller-sku`／`sku`／`asin1`／`asin`／`id`
- 商品名（必須）: `商品名`／`item-name`／`name`／`title`
- 価格: `販売価格`／`通常購入販売価格`／`価格`／`price`（数字以外は空＝推測しない）
- URL: `商品ページURL`／`商品URL`／`url`（https のみ）
- 画像: `商品画像パス1`／`商品画像URL`／`image_url`（https のみ）
- それ以外の列は `attrs`（最大 30 列）。AI が使ってよい数字は、商品名・価格・attrs にある数字だけ。
- 商品名の列が見つからないと、AI が対応表の案を作って `409 CSV_MAPPING_PROPOSED` と `proposal` を返す（**まだ取り込まない**）。案を確かめ、正しければ `"mapping": <proposal>` を足して同じリクエストを再送。AI を使わないときは `"ai_mapping":false`（`CSV_MAPPING_REQUIRED` と見出しが返る）。
- SP-API（店本人の認可で同期済みの Amazon 出品から）: `{"seller_key":..,"source":"SP_API","tenant":"<SP-API のテナント名>"}`。ASIN は AI に渡さない。JPY 以外の価格は空。
- CSV 以外: `{"seller_key":..,"source":"URL","products":[{"external_id","name","price_jpy","url","image_url","attrs":{}}]}`

### 疑問
```
curl -X POST https://hoshilu.app/api/admin/seller-promo/questions $H -H 'content-type: application/json' -d '{
  "seller_key":"qa-shop-1","items":[
   {"source":"STORE_PASTE","text":"玄関に置けるサイズか知りたい","product_ref":"box-1","weight":3},
   {"source":"SUGGEST","text":"収納ボックス 玄関 おしゃれ"},
   {"source":"FEEDBACK_API","text":"サイズ感についての言及が多い（集計要約）","aggregate":true}]}'
```
- 300 字まで。`FORM` はメール・電話・郵便番号・URL を伏せて保存。レビュー原文は入れない。
- `HOSHILU_DEMAND` は手入力不可（実行時に 5 人以上・内部会員除外の需要から自動で足す）。

### 手動起動
```
curl -X POST https://hoshilu.app/api/admin/seller-promo/run $H -H 'content-type: application/json' -d '{"seller_key":"qa-shop-1"}'
```
- `week_key`（例 `2026-W41`）省略時は今週（JST）。完了済み・3 回失敗済みの週は `"force":true` で作り直し（版が増える）。

### 結果の確認
- API: `GET /api/admin/seller-promo/jobs?seller_key=qa-shop-1`、`GET /api/admin/seller-promo/deliverables?seller_key=qa-shop-1&week_key=2026-W41`
- SQL（`wrangler d1 execute hoshilu-products --remote --command "..."` は Claude Code に依頼）:
```sql
SELECT type,version,status,json_extract(qa,'$.reasons') AS reasons FROM seller_promo_deliverables
 WHERE seller_key='qa-shop-1' AND week_key='2026-W41' ORDER BY type,version;
```

### 承認・公開
- 店: /seller →「今週のサポート」で 承認／差し戻し（事実が違う・言い回し・商品が違う・その他）。楽天GOLD の店は承認後に ZIP をダウンロード。
- 管理者代行: `POST /api/admin/seller-promo/deliverables/<id>/approve`｜`reject {"reason":"WORDING","note":"…"}`｜`publish`（公開失敗・確認中の再試行）。
- WordPress 接続（店の許諾後）: `POST /api/admin/seller-promo/connections {"seller_key","site_url":"https://…","username","app_password":"<アプリケーションパスワード>","scope":{"category_ids":[7]}}`。パスワードは暗号化して保存し、どの応答にも出ない。

### 画像（R2 作成後・手動）
GitHub Actions →「Build seller promo images (Pillow, manual)」→ `briefs` に SNS 納品物の `image_brief` から作った JSON（`key` は `<seller_key>/<week_key>/<納品物id>-1`、`image_url` は店が許諾した https の商品画像）→ まず `upload` 空で実行し成果物の画像を目で確認 → 良ければ `upload=UPLOAD` で再実行。文字が見切れると失敗する。

### 失敗時の切り分け
| 症状 | 見る所 | 対処 |
|---|---|---|
| job `SKIPPED` / `SELLER_TOKEN_CAP`・`MONTHLY_COST_CAP` | 原価 SQL | 上限見直しは Claude Code へ |
| job `FAILED` / `SELLER_PROMO_GEMINI_FAILED` | 3 回で管理者メール | 時間をおいて `force` |
| job `FAILED` / `SELLER_PROMO_NO_PRODUCTS` | 商品 0 件 | CSV を入れ直す |
| 全版 `QA_FAILED` | `qa.reasons` | 理由が数値なら商品 CSV の attrs を足す。NG 語なら店の設定を確認 |
| `PUBLISH_FAILED` / `WP_HTTP_401` | 接続 | アプリケーションパスワードを入れ直す |
| `CONFIRMING` | WordPress 側で公開状態 | `publish` で再確認 |

### 原価の集計
`GET /api/admin/seller-promo/usage?month=2026-10`、または
```sql
SELECT seller_key, COUNT(*) calls, SUM(input_tokens) in_tok, SUM(output_tokens) out_tok, ROUND(SUM(cost_jpy_est),2) jpy
FROM seller_promo_usage WHERE created_at >= '2026-09-30T15:00:00Z' AND created_at < '2026-10-31T15:00:00Z' GROUP BY seller_key;
```

### 止め方
- 全体: `SELLER_PROMO_ENABLED=false`（Claude Code が vars を変えて push）。cron・手動起動・契約者 API がすべて止まる。
- 1 店: プロファイルを `"status":"PAUSED"` で再登録。

## 4. KPI の SQL

```sql
-- 案内→許諾→初回公開日数（初回公開までの日数。案内・許諾日は Cowork の記録と突き合わせ）
SELECT p.seller_key, p.created_at AS registered_at, MIN(d.published_at) AS first_published_at,
  ROUND(julianday(MIN(d.published_at)) - julianday(p.created_at), 1) AS days
FROM seller_promo_profiles p LEFT JOIN seller_promo_deliverables d
  ON d.seller_key=p.seller_key AND d.status IN ('PUBLISHED','DELIVERED','CONFIRMING') AND d.type<>'REPORT'
GROUP BY p.seller_key;

-- 人手介入回数（ADMIN 操作）
SELECT seller_key, action, COUNT(*) n FROM seller_promo_audit WHERE actor='ADMIN' GROUP BY seller_key, action;

-- 納品物の「そのまま／直した／捨てた」: 1 版目で承認＝そのまま、2 版目以降で承認＝直した、差し戻しのまま＝捨てた
SELECT seller_key, week_key, type,
  CASE WHEN MAX(CASE WHEN status IN ('APPROVED','PUBLISHED','DELIVERED','CONFIRMING') THEN 1 ELSE 0 END)=0 THEN '捨てた'
       WHEN MIN(CASE WHEN status IN ('APPROVED','PUBLISHED','DELIVERED','CONFIRMING') THEN version END)=1 THEN 'そのまま'
       ELSE '直した' END AS outcome
FROM seller_promo_deliverables WHERE type IN ('ARTICLE','SNS','IMPROVEMENT') GROUP BY seller_key, week_key, type;

-- 原価／店（月）
SELECT seller_key, ROUND(SUM(cost_jpy_est),2) jpy FROM seller_promo_usage
WHERE created_at >= '2026-09-30T15:00:00Z' AND created_at < '2026-10-31T15:00:00Z' GROUP BY seller_key;
```
注: 「直した」は版が増えた（検査落ち・差し戻し後の再生成）ことを数える。店が WordPress 上で手で直した分は計測不能。

## 5. 未解決と次

- 画像（R2・テンプレ・Vision 検査）未実装。IMAGE は作られず、job の error 欄に `IMAGE_SKIPPED_NO_R2`。
- 本番での実行・原価の実測は OK① の後。
- Phase 2: ローカル WordPress での統合確認、Phase 3: 料金・文言・LP 下書き。

## 6. 大隆さんの操作が要るもの

OK①（migration 0090〜0092 の本番適用、`SELLER_PROMO_KEK` の生成・投入、R2 作成、`SELLER_PROMO_ENABLED=true`）のチャットでの「OK」だけ。
理由: 本番 DB への書き込みとフラグ ON は承認が要る約束（§1・AGENTS.md）だから。操作そのものは Claude Code が GitHub Actions 経由で行う（このセッションはクラウド環境で `wrangler login` のブラウザ許可ができないため、CI と同じ API トークンを使う）。
