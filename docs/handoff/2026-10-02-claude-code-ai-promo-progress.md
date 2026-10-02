# AI販促担当 進捗（Claude Code）— 指示書 ai-promo-20261003-v2

最終更新: 2026-10-02（セッション 2）

## 状態

| 項目 | 値 |
|---|---|
| 作業ブランチ | `claude/hoshilu-seller-promo-impl-5opkil`（`origin/feature/ui-search-v2` の `953baf23` から分岐） |
| 本番への反映 | **未反映**。deploy は `feature/ui-search-v2` への push だけで走るため、このブランチの push では本番は変わらない |
| migration | `0090_seller_promo_profiles.sql`・`0091_seller_promo_jobs.sql`・`0092_seller_promo_ops.sql` を追加。**本番は未適用**（ローカル SQLite で適用・全テストで確認済み） |
| vars（追加・すべて OFF） | `SELLER_PROMO_ENABLED=false`、`SELLER_PROMO_PLANS_ENABLED=false`、`SELLER_PROMO_STRIPE_PRICES_APPROVED=false`、`SELLER_PROMO_PILOT_SELLER_KEYS=""`、`SELLER_PROMO_MAX_JOBS_PER_CYCLE=5`、`SELLER_PROMO_MONTHLY_TOKEN_CAP_PER_SELLER=2000000`、`SELLER_PROMO_MONTHLY_COST_CAP_JPY=20000`、`SELLER_PROMO_JPY_PER_USD=150`、`SELLER_PROMO_WP_HOST_ALLOWLIST=""` |
| テスト | `npm test` 全件 pass（開始時 2,895 件・追加 33 件）。`wrangler deploy --dry-run` OK。セッション 1 の push（3423c626）の CI は success |
| 本番 health | 2026-10-02 `https://hoshilu.app/health` `ok:true`（release 1.22.1）。このブランチの変更は含まない |
| Codex との重複 | 直近 7 日、本書の対象ファイルへの Codex の変更なし |

開始時の注意: このコンテナでは `npm ci` 前だと `encoding-japanese` が無く 46 件落ちる。`npm ci --prefix tools/line-worker` 後は全件 pass（自分の変更でない回帰は無し）。

## 状態区分（§2 の言い方）

| 機能 | 実装済み | テスト済み | 本番確認済み | 無人実行済み | 外部店で利用済み |
|---|---|---|---|---|---|
| 店プロファイル（禁止カテゴリ拒否） | ○ | ○ | – | – | – |
| 商品取り込み（CSV・products[]） | ○ | ○ | – | – | – |
| 疑問の取り込み（STORE_PASTE/SUGGEST/FORM/FEEDBACK_API 集計・HOSHILU_DEMAND 自動） | ○ | ○ | – | – | – |
| 週次ジョブ（cron・手動起動・冪等・attempt≤3・kill switch・予算） | ○ | ○ | – | – | – |
| 生成（Gemini 主・OpenAI 予備、JSON、作り直し最大 2 回） | ○ | ○（応答はモック） | – | – | – |
| 検査（数値照合・禁止表現・同型・文字数・URL 除去・SNS 文字数） | ○ | ○ | – | – | – |
| 承認画面（/seller「今週のサポート」・差し戻し理由・自動公開トグル） | ○ | ○（API・HTML 出し分け） | – | – | – |
| 原価記録（seller_promo_usage） | ○ | ○ | – | – | – |
| WordPress 公開（確認→PUBLISHED/CONFIRMING・SSRF・AES-GCM） | ○ | ○（fetch モック＋**ローカル WordPress 6 系で実公開を確認**） | – | – | – |
| 楽天GOLD ZIP | ○ | ○ | – | – | – |
| 通知メール（今週の分・3 回失敗の管理者通知） | ○ | ○（Resend モック） | – | – | – |
| 月次レポート（計測不能の明示） | ○ | ○ | – | – | – |
| Stripe Light/Standard Price の冪等作成 API | ○ | ○（Stripe モック） | – | – | – |
| 画像（Pillow テンプレ 3 種・見切れ検査・手動ワークフロー） | ○（Worker からの自動起動・Vision 検査は未） | ○（ローカルで描画確認） | – | – | – |
| 商品 CSV の見出し対応表の AI 提案（取り込まず人が確認） | ○ | ○ | – | – | – |
| 料金 LP 下書き `/for-sellers-preview`（OK② 前は管理者だけ・有料欄は販売 ON のみ） | ○ | ○ | – | – | – |
| 1,980円「掲載のみ」文言差分（**未反映**・パッチで保存） | ○ | ○（当てた状態で全テスト pass） | – | – | – |
| プラン引数付き Checkout（seller-pilot-payment） | ✕ | – | – | – | – |

## 変更ファイル

新規: `src/seller-promo-{store,crypto,qa,generate,scheduler,publish,report,routes,billing}.mjs`、`public/seller-promo.js`、`migrations/0090〜0092`、`test/seller-promo-{store,qa,scheduler,publish,routes}.test.mjs`、`test/helpers/seller-promo-fixture.mjs`、`.claude/settings.json`。
既存の最小変更: `src/index.mjs`（ルート 1 つ・`*/15` の cron に 1 行）、`src/seller-page.mjs`（フラグ ON のときだけタブとスクリプト）、`wrangler.jsonc`（vars のみ。R2 binding はバケット作成前なので未追加）。

## セッション 2 の確認結果

- **ローカル WordPress（PHP 8.3 内蔵サーバー＋SQLite 連携プラグイン、Docker なし）に実公開**: 承認→`POST` で公開→`GET` で `status=publish` を確認→`PUBLISHED`。カテゴリ指定が反映され、同じ slug の投稿は 1 件だけ。手順は `tools/line-worker/test/seller-promo-wp-integration.manual.mjs`（npm test では走らない）。
- その過程で不具合を 1 件見つけて直した: パーマリンク設定が「基本」の WordPress は `/wp-json/…` に 301 を返し、リダイレクトを追わない方針のため公開に失敗していた。どの設定でも同じ応答を返す `/?rest_route=…` に変更。
- ローカルは http のため公開 URL は空（https のリンクだけ保存する方針どおり）。cloudflared の一時トンネル経由の確認は、本番 Worker が動く OK① 後に行う。
- 画像: `scripts/build-seller-promo-images.py` で正方形 1080×1080・縦 1080×1350・横 1080×566 を描画し目視確認。横長で見出しが帯からはみ出すのを機械検査が検出→帯の高さに合わせて文字を縮める修正済み。
- OK② の文言: 公開中の LP・規約・SNS 文面・SEO 記事に「1,980円に HP・記事・SNS 原稿・画像が含まれる」という記述は**見つからなかった**（含むと書いていたのは統合指示書 v1 §4・§19-2 だけ）。そこで差分は「含みません」を明記する追加（LP の料金カード・FAQ・JSON-LD）と統合指示書 §4 の書き換え。`docs/handoff/2026-10-02-ok2-seller-1980-listing-only.patch`（`git apply` で当たることを確認、当てた状態で全テスト pass、まだ当てていない）。

## 原価の実測

計測不能（実 API を一度も呼んでいない）。参考: テストの仮トークン（入力 1,000・出力 2,000）での見積もりは 1 回 1.24 円、週 3 回の呼び出しで 3.72 円。単価は deep-canary と同じ Gemini Flash 系（入力 0.75／出力 3.75 USD/100 万）を既定にしている。実額は OK① 後の QA 店舗 1 週分で出す。

## 判断待ち（既定で進めた理由付き）

1. **このコンテナは大隆さんの PC ではない**（Claude Code on the web のクラウド環境）。`wrangler login` のブラウザ許可ができないため、本番操作は既存の GitHub Actions（CI と同じ `CLOUDFLARE_API_TOKEN`）を使う案で進める:
   - migration: 既存 `apply-d1-migrations.yml` を `expected_pending_migrations="0090_seller_promo_profiles.sql 0091_seller_promo_jobs.sql 0092_seller_promo_ops.sql"`・`confirm=APPLY` で起動（他に未適用があれば何も適用されずに止まる＝安全）。
   - `SELLER_PROMO_KEK`: 値を誰も見ずに作るため、`openssl rand` で生成して `wrangler secret put` するだけの手動ワークフロー（既に設定済みなら止まる）を追加したい。新しい workflow ファイルなので OK① に束ねる。
   - R2 `hoshilu-seller-promo-assets`: 同様に手動ワークフローで作成→`wrangler.jsonc` に binding。OK① に束ねる。
2. **本番反映の経路**: このブランチを `feature/ui-search-v2` に入れないと deploy されない。フラグはすべて OFF・テーブル未作成でも契約者 API は 404、管理 API は `MIGRATION_PENDING` を返すだけなので、先に入れても挙動は変わらない。マージ方法（PR か直接か）は大隆さんの指示待ち。既定: OK① の連絡と同時に PR を作る。
3. 商品 CSV の見出しが楽天/Amazon の列名に無いとき: AI マッピングは未実装。代わりに `CSV_MAPPING_REQUIRED` と見出し一覧を返し、`mapping` を明示して取り込む（人が確認できる形）。AI での提案は次セッション。
4. SUGGEST（Google サジェスト）は自動取得せず、管理 API での投入だけにした（取得元の利用条件を確認していないため）。
5. 予算の `SELLER_PROMO_MONTHLY_COST_CAP_JPY` は全店合計の月上限として実装（変数名に PER_SELLER が無いため）。店ごとはトークン上限で止める。
6. `src/seller-marketing-guard.mjs` は Seller 文面に `9,800` があると止める。OK③（販売 ON）のときはこのガードの更新が要る（Codex 担当ファイルの可能性あり）。
7. 自動公開（AUTO）は店本人の API でだけ切り替わる。管理者のプロファイル更新では MANUAL/AUTO を変えない。

8. 画像の自動起動: Worker から `build-seller-promo-images.yml` を起動するには GitHub の起動用トークンを Worker Secret に持たせる必要がある（新しい資格情報）。既定: 持たせず、Cowork が手動起動（briefs は管理 API の SNS 納品物の `image_brief` から作る）。Cloud Vision の文字崩れ検査は Actions 側に Google の鍵が無いため未接続。
9. KEK と R2 は `.github/workflows/seller-promo-infra.yml`（手動・`confirm=APPLY`・既にあれば何もしない・KEK は作り直さない）で作る。OK① の後に起動する。

## 次

1. Phase 3: `seller-pilot-payment.mjs` のプラン引数（本番の決済経路なので、Light/Standard を足しても 1,980円の既存経路が 1 文字も変わらないことをテストで固定してから）。
2. OK① の後: migration 適用（apply-d1-migrations.yml）→ seller-promo-infra.yml → `SELLER_PROMO_ENABLED=true` → QA 店舗で手動起動 → 原価の実測 → cloudflared 経由で WordPress 公開を本番 Worker から確認。
3. OK② の後: パッチ適用、`SELLER_PROMO_LP_PREVIEW_PUBLIC=true`、`SELLER_PROMO_STRIPE_PRICES_APPROVED=true` → ensure-prices をテストモードで実行。
