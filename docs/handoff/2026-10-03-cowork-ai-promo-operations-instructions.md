# Cowork 指示書｜HOSHILU Seller「AI販促担当」運用（版 ai-promo-ops-20261003-v1）

宛先: Cowork（Claude）
発行: Claude Code（2026-10-03）／ 承認: 大隆さん（「完全に Cowork 作業に移る」）
前提資料: `docs/handoff/2026-10-02-claude-code-to-cowork-ai-promo-phase1.md`（runbook・API・SQL の詳細。本書はその使い方と運用の流れ）、`docs/handoff/2026-10-02-claude-code-ai-promo-progress.md`（実装の状態）

---

## 0. ひとことで

コードは完成し、本番で販売中です。ここからは **外部のお店に案内し、登録し、毎週の原稿が届いて承認・公開されるまでを伴走する** のが Cowork の仕事です。コードの変更・本番設定の変更・DB の直接操作は Claude Code に依頼します（§7）。

## 1. 現在の状態（2026-10-03 04:00 JST 時点）

| 項目 | 状態 |
|---|---|
| 本番 | `feature/ui-search-v2`、deploy 済み、`https://hoshilu.app/health` ok |
| 機能フラグ | AI販促 ON（`SELLER_PROMO_ENABLED=true`）、販売 ON（`SELLER_PROMO_PLANS_ENABLED=true`） |
| 料金 | 掲載 1,980円／Light 9,800円／Standard 19,800円（税込・月額）。Stripe 本番 Price 作成済み |
| 公開 LP | `/for-sellers` は 1,980円「掲載のみ」の文言に更新済み。**Light/Standard は載せていない**（大隆さん判断: 外部店の初回公開を見てから） |
| 料金の案内ページ | `https://hoshilu.app/for-sellers-preview`（検索に出ない・リンクなし）。Light/Standard を案内するときはこの URL を個別に送る |
| QA 店舗 | 架空の `qa-shop-1`。土曜 04:00 JST に初回の無人実行（結果は Claude Code が確認し progress に記録する） |
| 外部店 | 0 店 |
| 画像 | 自動ではない。GitHub Actions を手で起動（§4-6） |

## 2. Cowork の担当（やること）

1. 外部店への案内文・データの扱いの説明・通知文の作成（Gmail 下書き。送信は大隆さん）
2. 申込を受けた店の登録（契約・AI販促プロファイル・商品・疑問）
3. 毎週の結果の確認と、店への承認の声かけ
4. 差し戻し・検査落ちの読み解きと、必要な情報（商品の寸法など）の追加
5. SNS 画像の生成（手動ワークフロー）
6. 月次レポートの確認と KPI の記録
7. 困りごとの切り分けと、Claude Code への依頼（§7）

## 3. やらないこと

- 料金を SNS・公開 LP に出す（別承認。`seller-marketing-guard` も止める）
- 売上・順位・人数の約束、根拠のない「限定」「最安」などの表現
- 店の SNS への自動投稿（未実装・Meta 審査が要る）
- コード・本番設定（vars）・DB の直接変更（Claude Code に依頼）
- レビュー原文・購入者情報・注文情報を受け取る／保存する

## 4. 手順

API の呼び方は全部 runbook（phase1 引継ぎ §3）にあります。認証は管理画面にログインしたブラウザ（同じオリジン）か、`Authorization: Bearer <SOCIAL_ADMIN_SECRET>`。

### 4-1. 案内（Day 2〜10）
- 対象: 楽天市場か Amazon に出店し、生活雑貨・インテリア・ペット・文具・アウトドア・バッグ・靴を扱う店（化粧品・健康食品・食品・医療機器は登録できない）
- 送るもの: 1,980円（掲載）は公開 LP、Light/Standard は `/for-sellers-preview`。文面は指示書 v2 §13 の既定文を基本にする
- 必ず書くこと: 「売上や順位は約束しません」「初回公開から30日間無料。開始前にカード登録と自動更新への同意が必要」
- Gmail は下書きまで。送信は大隆さん

### 4-2. 申込を受けたら（登録）
1. **掲載契約**: 管理 API の掲載パイロット CREATE（既存の 1,980円と同じ流れ）。Light/Standard は `"plan":"LIGHT"` か `"STANDARD"` を付ける。店は契約者画面で同意→カード登録→承認
2. **AI販促プロファイル**: `POST /api/admin/seller-promo/profiles`
   - `seller_key`: その店が /seller にログインして `GET /api/seller-promo/deliverables` を開くと返る値（未登録の店には本人の seller_key が出る）
   - `plan`: 契約と同じ（LIGHT/STANDARD）、`pilot_id`: 1 の契約 ID（**これが無いと週次ジョブが動かない**）
   - `publish_target`: WordPress を持つ店は `WORDPRESS`、楽天GOLD は `RAKUTEN_GOLD_DELIVERY`、それ以外は `NONE`
   - `notify_email`: 店の通知先（「今週の分ができました」が届く）
3. **商品**: CSV（`products/import`）か SP-API（`"source":"SP_API","tenant":...`）。見出しが合わないと AI が対応表の案を返す（409）ので、確かめて `mapping` を付けて再送
   - 寸法・素材・容量などは CSV の列に入れる。**AI はデータにある数字しか書けない**ので、数字が無いと記事が薄くなる
4. **疑問**: 店から聞いたお客さんの質問を `questions` に。レビュー原文は入れず、要約で
5. **WordPress**（Standard で希望する店）: 店にアプリケーションパスワードを発行してもらい `connections` に登録。パスワードはチャット・メモに残さない
6. **初回**: `POST /api/admin/seller-promo/run {"seller_key":...}` で今週分を作り、中身を一緒に確認する

### 4-3. 毎週（月曜 06:00 JST に自動）
- 月曜 午前: `GET /api/admin/seller-promo/jobs` と `deliverables` で全店の状態を見る
  - `DONE` で `QA_PASSED` が揃っていれば店に承認の声かけ（店にはメールも届いている）
  - `FAILED`／全版 `QA_FAILED` は §5 で切り分け
- 承認が 7 日無ければ翌週分も作られる（未承認分は消えない）。2 週続いたら連絡する

### 4-4. 差し戻しへの対応
- 理由が「事実が違う」→ 商品データを直してから `run` を `force:true` で作り直し
- 「言い回し」→ NG 語に追加（プロファイル再登録）して作り直し
- 「商品が違う」→ 商品 CSV を見直す（販売終了品は再取り込みで自動的に外れる）

### 4-5. 月次（毎月1日 06:00 JST に自動）
- `deliverables` の `type=REPORT` を確認。「計測不能」はそのまま伝える（推測で埋めない）
- KPI（phase1 引継ぎ §4 の SQL）を記録: 案内→許諾→初回公開の日数、人手介入回数、そのまま／直した／捨てた、原価／店

### 4-6. SNS 画像（手動）
GitHub Actions →「Build seller promo images (Pillow, manual)」→ `briefs` に SNS 原稿の `image_brief` から作った JSON（`key` は `<seller_key>/<week_key>/<納品物id>-1`、`image_url` は店が許諾した https の商品画像）→ まず `upload` 空で実行して成果物を目で確認 → 良ければ `upload=UPLOAD`。文字が見切れると失敗する。

## 5. 困ったとき

| 症状 | まず見る所 | 対応 |
|---|---|---|
| job `FAILED` | `error` | `SELLER_PROMO_NO_PRODUCTS` → 商品を入れる。`SELLER_PROMO_AI_NOT_CONFIGURED`／`GEMINI_FAILED` が続く → Claude Code へ |
| job が作られない | プロファイルの `plan`・`pilot_id`、契約がトライアル中か支払済みか | 契約が切れていれば正常（作らない） |
| 全版 `QA_FAILED` | `qa.reasons` | 数字 → 商品データに足す。禁止表現・NG 語 → 店の設定を確認 |
| `PUBLISH_FAILED` | 接続の `last_error` | `WP_HTTP_401` → パスワード再発行 |
| `SKIPPED` | `SELLER_TOKEN_CAP`／`MONTHLY_COST_CAP` | 上限の見直しを Claude Code へ（大隆さん判断） |
| 店が「料金が違う」と言う | 契約者画面の規約・月額 | 契約ごとに固定。変更は新しい契約で（Claude Code へ） |

全体を止める必要があるときは Claude Code に `SELLER_PROMO_ENABLED=false` を依頼（cron・手動起動・契約者 API がすべて止まる）。1 店だけ止めるならプロファイルを `"status":"PAUSED"` で再登録。

## 6. 判断の目安（Cowork が決めてよいこと／聞くこと）

- 決めてよい: 案内文の言い回し（§3 の範囲内）、登録・商品・疑問の投入、作り直し、NG 語の追加、1 店の一時停止
- 大隆さんに選択式で聞く: 公開 LP に Light/Standard を載せる時期、SNS で料金を出すか、上限（予算）の変更、値引き・特例、Phase 4（Appstore 掲載）の着手

## 7. Claude Code に頼むこと

`docs/handoff/YYYY-MM-DD-cowork-to-claude-code-ai-promo.md` に書いて依頼する。頼むもの:
- 不具合・エラーの修正、本番設定（vars）の変更、DB の直接確認・修正
- 公開 LP への料金掲載（大隆さんの OK 後）
- Phase 4（Appstore 認可・楽天GOLD の FTP 自動化・Search Console・店 SNS）

## 8. 大隆さんの作業（これだけ）

- Gmail 下書きの送信（Day 2〜10）
- 選択式の質問への回答
- Phase 4: Appstore 申請と 050 番号（14 日検証の後）

## 9. 最初の 1 週間の目標

1. 土曜 04:00 の QA 店舗の結果を progress で確認（Claude Code が記録）
2. 外部店 1 店目の案内（下書き 10 通）
3. 1 店目の登録→初回作成→店の承認→公開／納品まで
4. 月曜 06:00 の自動作成で 1 店目の 2 週目が届くこと
