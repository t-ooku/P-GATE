# AI販促担当 進捗（Claude Code）— 指示書 ai-promo-20261003-v2

最終更新: 2026-10-02（セッション 2）

## 状態（2026-10-03 01:45 JST、OK① 実施後）

| 項目 | 値 |
|---|---|
| 本番 | PR #537（コード・フラグ OFF）→ #539（`SELLER_PROMO_ENABLED=true`）を `feature/ui-search-v2` にマージ・deploy success。HEAD `e366cff0` |
| migration | **0090〜0092 本番適用済み**（apply-d1-migrations.yml、未適用リストが 3 本ちょうどであることを確認してから適用） |
| R2・鍵 | `hoshilu-seller-promo-assets` 作成済み。`SELLER_PROMO_KEK` 作成済み（値はどこにも出していない。作り直さない） |
| QA 店舗 | `qa-shop-1`（架空・qa=1・LIGHT・商品 3・疑問 3・通知メールなし）を投入。初回の無人実行を見るため土曜 04:00 JST に設定 → **2026-10-03 13:31 JST に月曜 06:00 へ戻した** |
| vars | `SELLER_PROMO_ENABLED=true`。`SELLER_PROMO_PLANS_ENABLED=false`・`SELLER_PROMO_STRIPE_PRICES_APPROVED=false`・`SELLER_PROMO_LP_PREVIEW_PUBLIC=false` のまま |
| 本番確認 | `/health` ok、`/api/seller-promo/deliverables` 401（未ログイン。フラグ OFF 時は 404 だった）、`/for-sellers-preview` 404（未公開のまま）、管理 API 401（認証必須）、`/seller-promo.js` 200 |
| 手動ワークフロー | `seller-promo-infra.yml`・`seller-promo-status.yml`・`build-seller-promo-images.yml` は main にも置いた（PR #538。workflow_dispatch は既定ブランチに定義が要るため）。起動時は ref=feature/ui-search-v2 |
| テスト | `npm test` 2,927 件 pass・root の release_config も pass |

開始時の注意: このコンテナでは `npm ci` 前だと `encoding-japanese` が無く 46 件落ちる。`npm ci --prefix tools/line-worker` 後は全件 pass（自分の変更でない回帰は無し）。

## 状態区分（§2 の言い方）

| 機能 | 実装済み | テスト済み | 本番確認済み | 無人実行済み | 外部店で利用済み |
|---|---|---|---|---|---|
| 店プロファイル（禁止カテゴリ拒否） | ○ | ○ | – | – | – |
| 商品取り込み（CSV・products[]） | ○ | ○ | – | – | – |
| 疑問の取り込み（STORE_PASTE/SUGGEST/FORM/FEEDBACK_API 集計・HOSHILU_DEMAND 自動） | ○ | ○ | – | – | – |
| 週次ジョブ（cron・手動起動・冪等・attempt≤3・kill switch・予算） | ○ | ○ | ○（フラグ ON・テーブル作成済み） | 土 04:00 JST に初回予定 | – |
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
| Light／Standard の申込・自動課金（既存の 30 日無料・カード登録・自動更新・解約に別の契約種類として追加。販売 OFF では申込不可） | ○ | ○（既存の決済テスト 43 件は無変更で pass） | – | – | – |

## 変更ファイル

新規: `src/seller-promo-{store,crypto,qa,generate,scheduler,publish,report,routes,billing}.mjs`、`public/seller-promo.js`、`migrations/0090〜0092`、`test/seller-promo-{store,qa,scheduler,publish,routes}.test.mjs`、`test/helpers/seller-promo-fixture.mjs`、`.claude/settings.json`。
既存の最小変更: `src/index.mjs`（ルート 1 つ・`*/15` の cron に 1 行）、`src/seller-page.mjs`（フラグ ON のときだけタブとスクリプト）、`wrangler.jsonc`（vars のみ。R2 binding はバケット作成前なので未追加）。

## セッション 2 の確認結果

- **ローカル WordPress（PHP 8.3 内蔵サーバー＋SQLite 連携プラグイン、Docker なし）に実公開**: 承認→`POST` で公開→`GET` で `status=publish` を確認→`PUBLISHED`。カテゴリ指定が反映され、同じ slug の投稿は 1 件だけ。手順は `tools/line-worker/test/seller-promo-wp-integration.manual.mjs`（npm test では走らない）。
- その過程で不具合を 1 件見つけて直した: パーマリンク設定が「基本」の WordPress は `/wp-json/…` に 301 を返し、リダイレクトを追わない方針のため公開に失敗していた。どの設定でも同じ応答を返す `/?rest_route=…` に変更。
- ローカルは http のため公開 URL は空（https のリンクだけ保存する方針どおり）。cloudflared の一時トンネル経由の確認は、本番 Worker が動く OK① 後に行う。
- 画像: `scripts/build-seller-promo-images.py` で正方形 1080×1080・縦 1080×1350・横 1080×566 を描画し目視確認。横長で見出しが帯からはみ出すのを機械検査が検出→帯の高さに合わせて文字を縮める修正済み。
- OK② の文言: 公開中の LP・規約・SNS 文面・SEO 記事に「1,980円に HP・記事・SNS 原稿・画像が含まれる」という記述は**見つからなかった**（含むと書いていたのは統合指示書 v1 §4・§19-2 だけ）。そこで差分は「含みません」を明記する追加（LP の料金カード・FAQ・JSON-LD）と統合指示書 §4 の書き換え。`docs/handoff/2026-10-02-ok2-seller-1980-listing-only.patch`（`git apply` で当たることを確認、当てた状態で全テスト pass、まだ当てていない）。

## Phase 3 の決済（2026-10-03、大隆さん「今から作る（販売OFFのまま）」）

- 現在の 1,980円の申込は `seller-pilot-payment.mjs`（旧 4,980円の任意申込）ではなく `seller-pilot-autorenew.mjs`（30 日無料・カード登録・自動更新）なので、こちらに載せた。
- Light／Standard は新しい契約の種類（offer）`external-seller-promo-{light,standard}-30d-autorenew-v1`。金額・規約・文面は offer ごとに固定し、申込時にスナップショットを保存（既存と同じ）。
- 定義は `src/seller-promo-billing.mjs`（サーバーのみ）。公開ファイル `public/seller-trial-policy.mjs` には入れていない（販売 OFF の間に 9,800／19,800 を公開アセットへ出さないため。テストで固定）。
- `src/seller-offer-registry.mjs` が 1,980円の公開ポリシーに Light／Standard を足すだけ。`seller-listing-pilot.mjs`・`seller-pilot-autorenew.mjs` はここから同じ名前の関数を読む。
- 申込: 管理 API の CREATE に `"plan":"LIGHT"|"STANDARD"`。`SELLER_PROMO_PLANS_ENABLED=false` の間は `PROMO_PLANS_NOT_ENABLED`。
- Price: OK② 後に ensure-prices で作り、`SELLER_PROMO_{LIGHT,STANDARD}_{TEST,LIVE}_{PRICE,PRODUCT}_ID` を vars に入れる（未設定の間は申込できない）。
- 販売 ON（OK③）のときに要る別作業: `seller-marketing-guard.mjs` が Seller 文面の 9,800 を止める設定の更新、契約者画面での申込ボタン。

## OK③（2026-10-03 03:00 JST、大隆さん「今すぐ販売ON」）

- `SELLER_PROMO_PLANS_ENABLED=true`、Light/Standard の本番 Price/Product ID を vars に設定
- 申込: 管理 API の CREATE に `"plan":"LIGHT"|"STANDARD"`。条件は 1,980円と同じ（30 日無料・カード登録・自動更新・解約）
- 週次ジョブ・月次レポートは有効な Light/Standard 契約（`pilot_id` で紐づけ、トライアル中か支払済み）がある店だけ。QA 店舗は除く
- `/for-sellers-preview`（noindex）に Light/Standard の欄が出る。公開 LP `/for-sellers` には載せていない（掲載するなら文面の承認が別に要る）
- `seller-marketing-guard.mjs` は Seller の SNS 文面の 9,800 を引き続き止める（SNS で料金を出すのは別承認のため。変更していない）
- 指示書では OK③ は 14 日検証の後の予定だった。前倒しは大隆さんの判断

## バグチェック（2026-10-03、コードレビュー）

指摘 10 件を本番と照合した:
- 直した（7）: 月次レポートが前月のレポート行を公開本数に数える／商品取り込みが 1 件ずつ書くため 500 件で D1 のクエリ上限に当たる（→ batch 化）／今回の CSV に無い商品が active のまま（→ active=0、行は残す）／AI の鍵が無いと試行回数が増えず毎サイクル拾い直す（→ 3 回で止めて通知）／残した商品 URL の数字が数値照合で落ちる／販売を止めると公開済み Light/Standard のサブスク作成まで止まる／照合クエリのプレースホルダ数が offer 数と手で揃えてあった（→ json_each）
- 誤り（1）: `/for-sellers-preview` が常に 404 → 本番で 200・noindex を確認済み
- 販売 ON（OK③）の前に直すもの 2 件 → **2026-10-03 対応済み**:
  1. 契約者の一覧 API が契約ごとの規約・文面・受付可否（`offer_policy`）を返し、`public/seller-pilot.js` はそれを使う（料金は公開ファイルに置かないまま）
  2. 販売 ON のとき週次ジョブは、プロファイルの `pilot_id` に紐づく同じプランの Light/Standard 契約がトライアル中か支払済みの店だけ（QA・パイロット店は除く）
- Stripe 本番 Price（2026-10-03 02:30 JST 作成）: Light `price_1UMAIIJnMwqhkDQ5OCKXY6wj`（prod_VMu6URGZSooXT3）、Standard `price_1UMAIJJnMwqhkDQ50T35KRN1`（prod_VMu6mYJN6wymnd）。OK③ のとき `SELLER_PROMO_{LIGHT,STANDARD}_LIVE_{PRICE,PRODUCT}_ID` に入れる

## 外部店が契約者画面に入るまで（2026-10-03、Cowork 依頼 §5 への回答）

調べて分かったこと: `/seller` は Worker に 1 つだけ設定された固定アカウント（`SELLER_AUTH_ID`）でしか入れず、外部店はログインできない。外部店の画面は `/seller-pilot`（メールのコードでログイン）。そこに「今週のサポート」（承認・差し戻し・自動公開）が無かったので、**`/seller-pilot` にも同じタブを出し、会員ログインで自分の契約に紐づく納品物だけを扱えるようにした**（同じ PR）。

1. **CREATE の後、店に送るもの**: `https://hoshilu.app/login.html?next=/seller-pilot` の 1 本だけ（メールで送る。期限なし。ログイン用コードはログイン時に店のメールへ届き、短時間で切れる）。**掲載契約 CREATE の `inquiry_id` の相談で使ったメールアドレス**でログインした人だけが、その契約を見られる。
2. **店が最初にログインするまで（店に送る文面）**:
   1. 上の URL を開き、ご相談時のメールアドレスを入れて「コードを送る」
   2. 届いた 6 桁のコードを入れてログイン
   3. 「掲載見本と掲載確認」の画面で、条件を確認して同意 → カードを登録（この時点では課金されません）
   4. 商品・事業者情報を確認して「掲載を承認」。公開から 30 日間は無料
   5. 毎週月曜に同じ画面の「今週のサポート」に記事・SNS 原稿が届くので、承認か差し戻しを選ぶ
3. **seller_key の決め方**: 外部店は**ログインを待たずに決めてよい**。`pilot-<掲載契約の ID>`（例 `pilot-SPL_…`）にする。順番は ① 掲載契約 CREATE（`pilot_id` が返る）→ ② AI販促プロファイルを `seller_key: "pilot-<pilot_id>"`・`pilot_id: <pilot_id>`・同じ `plan` で登録 → ③ 商品・疑問 → ④ 店に URL を送る。運用指示書 §4-2 の 2 の「/seller にログインして返る値」は、`/seller` の固定アカウント（社内の店）だけの話。

## 本番の初回無人実行（2026-10-03 04:00 JST、QA 店舗 qa-shop-1）

- cron が 04:00:48 JST に起動し、04:01:07 に DONE（attempt 1、約 19 秒）。週 `2026-W40`
- 記事（本文 1,675 字）・SNS 2 本・商品ページの直し案がすべて 1 回目で QA_PASSED（作り直しなし）
- 原価の実測: gemini-3.6-flash 3 回、入力 2,911・出力 2,266 トークン、**1.61 円**（1 店・1 週）。月 4 週で約 6.4 円／店
- job の error 欄 `IMAGE_SKIPPED_NO_R2` は「Worker に R2 の binding が無い」の意味（画像は手動ワークフローで作る方針どおり。R2 バケット自体は作成済み）
- 次: QA 店舗を月曜 06:00 に戻す（Cowork 指示書 §1。runbook の 1 行）→ 2026-10-03 13:31 JST 済（下の節）

## Cowork 依頼 §1-1・§1-3・§2（2026-10-03 13:31 JST）

経路: 管理 API の認証が無いため、`seller-promo-status.yml` を作業用ブランチだけで一時的に書き換え、ref=そのブランチで起動（run 37096808831、success）。`feature/ui-search-v2` の同ファイルは変えていない。

- **§2 重複確認**: C1〜C6 の 6 件とも `seller_outreach_contacts`・`seller_outreach_suppressions`・`seller_contact_permissions` のいずれにも **0 件**（status なし）。
  - C1: なし / C2: なし / C3: なし / C4: なし / C5: なし / C6: なし
- **§1-3**: `qa-shop-1` を weekday 6・hour_jst 4（土 04:00）→ **weekday 1・hour_jst 6（月 06:00 JST）** に UPDATE（`updated_at` 2026-10-03T04:31:38.694Z）。`seller_promo_audit` に 1 行（ADMIN・`PROFILE_SCHEDULE_SET`・detail に from/to）。次回は 2026-10-05（月）06:00 JST・週 `2026-W41`。
- **§1-1 記事の通読**（`2026-W40` の ARTICLE v1。本文はログに平文で出さず、公開鍵で暗号化して出力→手元で復号して読んだ。本文はリポジトリに残していない）。所見:
  1. 事実: 寸法・素材・色・価格は商品データと一致。ただし「（税込）」と「ポリプロピレンはお手入れしやすい」は商品データに根拠が無い（税込かは店に要確認）。
  2. 禁止表現: 「最安」「No.1」・効果の断定・他店比較などは無し。
  3. 日本語: 「当店」の語りなのに FAQ で「直接お店に確認してください」「商品データ上」と第三者・内部の言い回しが混ざる。価格表記が「1980円」と「2,980円」で揺れる。

## Cowork 依頼 §6・§8（2026-10-03 14:00 JST）

- **§6 案内ページ**: `public/for-sellers-preview.html` の第一画面を「後回しになっていた『モールの外』の販促を、毎週かわりに。」に差し替えた。料金の前に「なぜ『モールの外』なのか」「HOSHILU の中と外、両方で」「毎週届くもの」の欄を追加。文は依頼の文そのまま。
  - 「毎週届くもの」には「AI販促担当（有料プラン）で届くものです。掲載プランだけの場合は含みません。」の1行を足した。直後の掲載プラン（1,980円）は記事・SNS を含まないので、誤解を防ぐため。
  - 料金・規約・約束しないことの欄はそのまま。
  - テストで確認したこと: 禁止表現（`PROMO_FORBIDDEN_PHRASES`）が無いこと、`seller-marketing-guard` を通ること、9,800／19,800 が下書きに出ないこと。
  - 公開 LP `/for-sellers` は変えていない。
- **§8 相談（inquiry）**: 現状は `seller_business_inquiries` を作れる経路が公開フォーム（`POST /api/seller-business/inquiries`、Turnstile あり）だけで、管理 API からは作れなかった。既定 a で実装した。
  - `POST /api/admin/seller-business/inquiries`（管理者のみ・同一 Origin）。body は次のとおり:
    - 必須: `organization_name`、`contact_email`（返信メールの From）、`evidence_message_id`（返信メールの Message-ID）、`evidence_received_at`
    - 任意: `contact_name`、`storefront_url`、`message`
  - 保存のしかた: `inquiry_type=CONSULTATION`、`status=CONTACTED`、`source=EMAIL_REPLY`。同意の根拠は message 末尾に `[相談回答への同意: email_reply; 継続案内希望: no; evidence: <Message-ID>; received_at: …; recorded_by: admin]` の形で残す。
  - 営業メールの許諾にはしない（`marketing_consent` は常に no）。
  - inquiry_id は `SBI_` + sha256(Message-ID) なので、同じ返信メールから二重に作られない。
  - 申込の手順: ① この API で相談を作る → ② 返った `inquiry_id` で掲載契約 CREATE → ③ AI販促プロファイル（§5 の手順）→ ④ 店に `https://hoshilu.app/login.html?next=/seller-pilot` を送る。店は返信に使ったメールアドレスでログインする。
- テスト: `npm test` 2,955 件 pass。PR #561 でマージ。

## Cowork 依頼 §7（2026-10-03 14:15 JST）

- QA 店舗 `qa-shop-1`・`2026-W40` の記事・SNS 2 本・直し案を、読みやすい形で大隆さんの Gmail に 1 通送った。同じメールに §1-1 の所見と §6 の差し替え後の文も入れた。
  - 件名: 「【HOSHILU】AI販促担当 QA店舗の今週分（2026-W40）」
- 送り方: 依頼は「既存のサービス通知（Resend）経路」だったが、Resend の鍵は本番 Worker にしか無く、Actions からは使えない（管理 API の鍵も Actions に無い）。大隆さんの判断で、大隆さんの Gmail から本人宛てに送った。
- 中身の取り方: 作業用ブランチで読み取りだけの一時ワークフローを起動し（run 37098912380）、公開鍵で暗号化して出力→手元で復号。本文はリポジトリにもログにも平文で残していない。復号したデータと秘密鍵は送信後に削除した。

## Cowork 依頼 §9・§10・付録（2026-10-03 15:00 JST）

- **§9 記事の品質修正**（`seller-promo-qa.mjs`・`seller-promo-generate.mjs`・`seller-promo-scheduler.mjs`）:
  1. 根拠の無い性質語: 生成ルールに明記した。検査は `PROPERTY_CLAIM_WORDS`（丈夫・軽量・お手入れしやす・抗菌・防水・耐熱・洗える など、活用も拾えるよう語幹で持つ）のうち、商品名・attrs に無いものを拾う。
     - 結果は `qa.notes`（`PROPERTY_CLAIM_UNVERIFIED`）に「要確認」として残す。過検出がありうるので不合格にはしない。
     - 「洗えるかどうか」のような疑問の形は拾わない。
     - 店の画面（`/seller`・`/seller-pilot` の「今週のサポート」）に「要確認: 商品データに書かれていない表現があります（…）」と出す。
     - 注記の付いた版は、自動公開（AUTO）でも承認しない。
  2. 税の表記: 商品データに「税込／税抜」が無ければ、生成後の整形で「（税込）」などを外す。生成ルールにも明記した。
  3. 語り手: 「お店に確認」「お店にご確認」「直接お店」「商品データ」「データ上」「データにありません」などを禁止表現に追加した（不合格→理由付きで作り直し）。答えられない疑問は「詳しくはお問い合わせください」とするよう、生成ルールを変えた。
  4. 価格表記: 生成後の整形で、4 桁以上の「〇〇円」を 3 桁区切りにする。直したことは `qa.formatted` に残す。
  5. QA 店舗の作り直し（済）:
     - 15:29 JST に W40 の job を PENDING に戻した（`force:true` と同じ。監査ログに `JOB_FORCE_RERUN` を 1 行、run 37103200429）。
     - 15:30 JST の cron で作り直され、v2 は ARTICLE・SNS・IMPROVEMENT とも 1 回で QA_PASSED。要確認の注記なし。原価は 1 回分。
     - v2 は暗号化して取り出し、手元で読んだ（run 37103393815。本文はリポジトリにもログにも平文で残していない。復号データと秘密鍵は削除済み）。所見:
       - 直った: 「（税込）」なし、価格は 3 桁区切りで統一、語りは「当店」で「詳しくはお問い合わせください」になった。
       - 残った: 根拠の無い評価が別の語で出た（「扱いやすく」「お求めやすい」）、FAQ に「製品情報に記載がございません」。
       - 日本語: 「目目的」の誤字、「詳細は詳しくは」の重複。
     - 残った点への対応: 「扱いやす」「お求めやす」「お手頃」などを要確認の語に追加、「製品情報に記載」「記載がございません」「詳細は詳しくは」を禁止表現に追加。同じ漢字が 2 つ続く箇所は「誤字の疑い」（`TYPO_SUSPECT`）の注記にして、店の画面に出す（自動公開もしない）。
- **§10 月曜の結果記録**（既定 a）:
  - `.github/workflows/seller-promo-weekly-record.yml`（月曜 07:07 JST・手動起動も可）。schedule は既定ブランチの定義だけが動くので、main にも置く。
  - 本番 D1 を読み、`docs/handoff/<月曜の日付>-seller-promo-weekly.md` に、今週の job・納品物の全版の状態・検査理由・要確認・原価を追記して、`feature/ui-search-v2` に push する。
  - 本文と連絡先は書かない（`scripts/seller-promo-weekly-record.mjs`、テストあり）。
- **付録の送信記録**: **保留**。大隆さんの Gmail では、案内メール6通がまだ下書き（未送信）だった。送信前に「送信済み」と入れると事実と違う記録になるので、送信後に入れる。
- テスト: `npm test` 2,961 件 pass。PR #563（§9・§10）・#564（§10 の main 側）マージ済み。

## 原価の実測

→ 「本番の初回無人実行」の節を参照（1.61 円／週、月約 6.4 円／店。2026-10-03 実測）。

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
