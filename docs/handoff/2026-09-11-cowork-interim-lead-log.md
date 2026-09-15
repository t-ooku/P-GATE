# Cowork 暫定主幹ログ（2026-09-11〜 Codex復帰まで）

大隆さんの「Cowork暫定主幹・完全運用引継書」（2026-09-11）に基づく。
Codex がクレジット切れの間、Cowork（Claude）が主幹。Codex 復帰時にこのログを起点に主幹を戻す。

完了判定の語彙: 本番確認済み / 実装済み・本番未確認 / 一部実装 / 未実装 / 不具合あり / 要確認

---

## 2026-09-11（初日）

### P0: Issue #261 の直接原因を特定し修正 → **本番確認済み（デプロイ）・効果は未確認**

**事実**（D1 growth_events、QA/INTERNAL除外、本番）
- AIチャット主系のタイムアウト（9/9 初検知）は最新カナリアで PASS。いまの SLI FAIL は AI ではない
- 直近48時間: SNS着地（`?q=`付き）ごとに `search_started` と `search_client_degraded / TURNSTILE_TOKEN_UNAVAILABLE` が1対1。SNS由来 `search_completed` = **0**
- 30日: SNS着地 98人 → 自動検索 50人 → 検索完了 **2人** → モール遷移 1人

**原因**: `autoRunInboundSearch` がウィジェット描画直後に submit → トークン未発行 → 15秒後に
`TURNSTILE_TOKEN_UNAVAILABLE` → 「もう一度検索を押してください」で停止。#170/#249 と同系統。

**修正**: #263（`59e2086`）。トークンが届いてから submit。届かなければエラーにせず案内し、
届いた瞬間に自動実行。監視基準は緩めていない。テスト 2293 全通過。

**効果判定（未確認）**: 次の Threads 自動投稿枠（09:30 / 12:30 / 20:30 JST）以降の growth_events で
「SNS由来 search_started → search_completed の比率」と `TURNSTILE_TOKEN_UNAVAILABLE` 件数を見る。
判定SQLは §3 に。

### OpenAI フォールバック → **大隆さん決定（2026-09-11）: 当面課金しない。Gemini に依存する**

深層カナリア `openai_backup = DEGRADED(CANARY_PROVIDER_BILLING_DISABLED)`。
これは**想定内の既知状態**として扱う。監視で新規障害として通知しない。

Gemini が落ちた場合の挙動（Codex 9/10 自己点検で回帰テスト8件 PASS を確認済み）:
HTTP 200 を返し、AI候補なしで **13モールの検索リンク導線は残る**。検索が無音停止にはならない。
ただし「AIが理解して候補を出す」部分は止まる。この前提で運用する。

再検討の条件: Gemini 主系の `CANARY_PROVIDER_TIMEOUT` / 5xx が**連続して**出るようになった時。
それまでは課金しない。

### ショッププロフィールの事業者名・店舗住所 ＋ 値下がり待ち「○人が待ってる」の閾値 → **本番確認済み**

大隆さん指示（2026-09-11）:
- 「ショッププロフィールに、事業者名、店舗住所を記載。ITグループ3アカウント: 事業者名 ITグループ株式会社／店舗住所 東京都新宿区西新宿8-5-10」
- 「○人が待ってるは載せないで。1人だとしょうもない。」

対応（#264、head `bdf0439`、CI ✅ 2026-09-10T17:11Z、テスト 2294 全通過）:
- migration `0078_seller_shop_business_identity.sql` を本番 D1 に手動適用（`seller_shops.business_name` / `business_address`）
- `with-care` / `tomorrows-smile` / `find-fun` の3行を UPDATE（大隆さん指示のため承認済み扱い、3件）
- `seller-shop.mjs`: 入力検証・upsert（列が無い環境では旧SQLにフォールバック）・公開 PROFILE に「事業者名」「店舗住所」を表示（空なら出さない）
- `seller-page.mjs` / `seller.js`: ショップ設定フォームに2項目を追加（出品者が自分で編集できる）
- `watch-demand.mjs?v=3`: `waiting_members` が 5人未満なら人数を出さない（希望額の平均と同じ「5人以上」基準に統一）

本番確認: `https://hoshilu.app/shop/with-care` の PROFILE に「事業者名 ITグループ株式会社」「店舗住所 東京都新宿区西新宿8-5-10」を表示。
トップの値下がり待ちリストは「1人が待ってる」を出さない（デプロイ済みコードで確認、表示側は次回アクセスで反映）。

### #263 効果判定（13:15 JST）→ **未判定**。計測の穴を #267 で塞いだ → **本番確認済み**

事実（D1、QA/INTERNAL除外、9/11 01:31 JST 以降）:
- `?q=` 付き SNS 着地は Threads 2件のみ（07:47 投稿「抱っこひも 新生児」から 45秒後・98秒後、別 visitor）
- その2件で `search_started` / `search_completed` / `search_client_degraded` すべて **0**
- #263 で「トークン未着＝エラー」が「トークン未着＝静かに待つ」に変わったため、トークンを取れない
  訪問はイベントを何も残さなくなっていた（着地→無音）。投稿直後の着地は Threads 側の事前読み込み／bot 疑い

対応（#267、head `e115eac`、CI ✅ 2026-09-11T04:30Z、テスト 2295 全通過）:
- 着地後の自動検索が 30 秒待ってもトークンを得られなければ `search_inbound_pending` を1回だけ送る
  （流入元付き、検索文・識別子なし、`/api/events` 許可リストに追加）
- `search_degraded` に `trigger: autorun|manual` を付け、`search_client_degraded` は空だった
  `marketplace` 列に `AUTORUN` / `MANUAL` を入れる
- `assets-v147/app.js?v=156`、`growth-analytics.mjs?v=11`（本番の growth-analytics.mjs で新コードを確認）

**判定 2回目（21:30 JST）→ 未判定のまま。ただし「SNS 着地はトークンを一度も取れていない」が数字で確定**
- Threads 20:32 投稿の着地 2件（61秒後・79秒後、別 visitor）。うち1件が着地40秒後に `search_inbound_pending`
  （ページは開いたまま、トークン未着）。`search_started` / `search_completed` / 縮退 = 0
- 朝（45秒後・98秒後）と同じ型。投稿直後に必ず2件、時間帯のばらつきなし → 事前読み込み／bot の疑いが濃い。
  ただし Threads アプリ内ブラウザで人が開いてもトークンが出ない可能性は残る（決め打ちしない）
- 対応 #269（head `1f5b40e`、CI ✅ 2026-09-11T12:36Z、テスト 2296）: `search_inbound_pending` を
  `document.visibilityState` / `navigator.webdriver` で `search_inbound_pending_hidden` と分ける（固定2値、識別子なし）。
  `app.js?v=157` / `growth-analytics.mjs?v=12`。本番の growth-analytics.mjs で確認 → **本番確認済み**
- 判定 3回目: 9/12 21:30 JST（send_later 予約済み）。`_hidden` が支配的なら「人の SNS 流入はほぼゼロ」で確定し
  評価軸を「人の着地（visible）と検索完了」に変える。visible の pending が多ければ Turnstile を
  `appearance=interaction-only` / `execution=execute` にする案を大隆さんへ提案（監視基準は緩めない）

**判定 3回目（9/12 21:30 JST）→ 「人の SNS 流入はほぼゼロ」で確定**
- 9/11 21:40 以降の Threads 着地 8件（6投稿分）: すべて投稿の約1分後に到着、40秒以内に離脱
  （`search_inbound_pending` / `_hidden` ともに 0 ＝ 開いたまま待つ訪問がない）。検索開始 0／完了 0／縮退 0
- 結論: 投稿直後の着地は Threads 側の事前読み込み／bot。#263 の効果は「人が来ていないので測れない」。
  以後 SNS の評価軸は 着地数ではなく `search_completed` と `target_price_watch_set`（人の行動）だけにする
- Turnstile の設定変更（interaction-only 等）は、人の visible pending が観測されるまで**行わない**

### 未着手 2〜4 は Codex の 9/7〜9/10 修正で既に本番動作 → **本番確認済み**（D1 で確認、13:40 JST）

- 2 希望価格ウォッチの検索語: `targetPriceSearchQuery`（`35fca07`）で短い検索語に落としている。
  `target_price_observations` 直近2巡回（00:45Z / 03:45Z）で 5 件すべて `matched=1 / ABOVE_TARGET`
  （商品を特定し価格比較できている。目標額未達なので通知なし＝正しい）。`NO_CANDIDATES` は解消
- 3 #252 Threads 無限リトライ: `158c6ac` で `SOCIAL_PUBLISH_MAX_ATTEMPTS` と一時エラー判定を導入済み。
  現在 `SOCIAL_RETRY_*` の行は 0。publish 段階の 5xx は二重投稿回避のため即 FAILED（設計）
- 4 保存時の `target_product_key`: `61481ca`。9/8 以降の watch_price=1 wish は 2/2 に key あり

### 未着手 6「SEO→検索遷移 0」の原因 → 人の読者がほぼ居ない。クローラを KPI から外した（#268）→ **本番確認済み**

事実（D1、9/4〜9/11、QA/INTERNAL除外）: `seo_article_view` 147件・146人。記事ごとに同じ日に
6〜11件ずつまとまって入り、146人のうち検索を始めたのは1人。`seo_search_transition` は30日で0。
JS を実行する検索エンジン／SNS のリンク先取得が「読者」として数えられていた。

対応（#268、head `da52e34`、CI ✅ 2026-09-11T04:49Z、テスト 2296 全通過）:
`/api/events` の User-Agent が既知クローラなら `traffic_class='QA'`（既存の KPI 除外枠）。UA は保存しない。
人のアプリ内ブラウザ（LINE / Instagram / Threads）は対象外（テストで固定）。
**以後 `seo_*_view` の件数は大きく下がる。回帰ではなく実数。** 日次レポートはこの注記を付けること。

### 未着手 5「AI女優の同一人物化」→ 原因は参照画像の食い違い。v1 に統一 → **実装済み・本番未確認**（次回生成 9/12 土 06:00 JST で確認）

事実:
- 2026-09-04 大隆さん決定「今後の AI 女優は最初の女優（v1）」、9/6 指示書「人物は 25〜40代主婦層中心」
- しかし `tools/line-worker/ops/runway/auto/themes.json`（9/6 作成）は **v2（22歳設定）参照のまま**。
  `runway_generation_jobs` の 9/2〜9/9 の 5 件すべて `character_image_url = …reference-v2.jpg`
- 一方、希望価格ウォッチ推しの静止画 Reel（`scripts/build-watch-reel.py`）は v1 → 同じアカウントで顔が2人に割れていた
- 自動QA の `identity_consistent` は「毎回同じ参照画像を条件にする」だけで顔照合はしていない（証跡に明記あり）。
  参照が正しければ一貫する仕組みなので、参照を直すのが根本対応

対応（commit `22c6fef`、feature/ui-search-v2 に直接、コード変更なし・デプロイ不要）:
`persona` / `character_image_url` を v1 に変更、scenes の「若い女性」を「女性（参照画像と同じ人物）」に変更。
次の自動生成（9/12 土 06:00 JST、price_drop_notice）から v1 で生成される。

**大隆さんの判断が要るもの**: 既に v2 で生成済みの `runway-auto-want-at-price-20260909`（APPROVED_FOR_POST）と
`runway-auto-stop-chasing-sales-20260909`（GENERATED_REVIEW_REQUIRED）を、そのまま出すか・捨てて v1 で作り直すか
（作り直しは 336 クレジット×2）。指示があるまで触らない。

### 今日の SNS 障害（記録）

- `hoshilu-threads-amazon-boost-v1-2026-09-11-am`（09:30 JST）: `THREADS_PUBLISH_500`（Meta 側 `is_transient:true`）で FAILED。
  publish 段階の 5xx は投稿が成立している可能性があるため再試行しない設計。再投入していない（重複回避）

### 定期タスク（Cowork側）

9/8 に「Codexへ移管」として停止していた2本を再開した（Codex不在のため）:
- 検索精度 日次改善（08:00 JST、規則+5・サジェスト+3・カナリア）
- 合成教師データ 50件/日（06:00 JST）

稼働中: 日次レポート（09:00）／本番監視＋Codex報告チェック（2時間ごと）／
日次販促 SNS投入（06:30）／Amazonアソシエイト月次／上記2本 = **6本**

### 未着手（優先順）

1. ~~`search_client_degraded` に autorun / manual を足す~~ → #267 で本番確認済み
2. ~~希望価格ウォッチの検索語~~ → Codex `35fca07`、本番確認済み
3. ~~#252 Threads 無限リトライの Worker 側修正~~ → Codex `158c6ac`、本番確認済み
4. ~~保存時の `target_product_key`~~ → Codex `61481ca`、本番確認済み
5. ~~AI女優の同一人物化~~ → themes.json の参照が v2 だったのが原因。v1 に統一（`22c6fef`）、9/12 生成で本番確認
6. ~~SEO→検索遷移~~ → 原因は人の読者不在。#268 でクローラを除外、本番確認済み。次は「人の読者を作る」施策（SNS からの記事誘導）に置き換える

---

## 2026-09-12

### Runway 自動生成（土 06:00）→ **未生成**（Issue #270、クレジット消費なし）

`AUTO_REEL_COMPETING_SLOT_PRECHECK`: 同じ 20:15 JST 枠に `hoshilu-ai-actress-daily-v1-instagram-2026-09-12`
が APPROVED だったため二重投稿回避で停止。v1 参照での生成確認は次回（月・水・土）に持ち越し。

### 発見: 22歳設定（v2）の毎日リールが止まっていない → **要判断（大隆さん）**

- キャンペーン `hoshilu-ai-actress-daily-v1`（8/29 作成、権利台帳「承認済み v2 参照画像」）が毎日 20:15 JST に
  Instagram + X へ PUBLISHED（8/28〜9/12 で各14件）。9/13〜9/25 に APPROVED が **IG 13・X 13 = 26件** 残っている
- 9/4 の Codex 宛引き継ぎ `docs/handoff/2026-09-04-target-shift-sns-handover.md` §「毎日20:15 JST」は
  「v1 を毎日1本、v2 の毎日枠は停止」。**Codex 側で未実施のまま**（9/7・9/9 の2日分だけ CANCELLED）
- Runway 日（月・水・土）にこの行が残っていると precheck で自動生成が毎回止まる
- 提示した選択肢: (1) 26件すべて CANCELLED（9/4 決定どおり） (2) 月・水・土の 10 件だけ CANCELLED
  （9/14,16,19,21,23 の IG+X） (3) 何もしない。**既存行 UPDATE は §54 承認事項なので指示待ち**
- 実行 SQL（承認後）: `UPDATE social_post_queue SET status='CANCELLED', last_error='CANCELLED_BY_TAKAYUKI_2026-09-12', updated_at=<now> WHERE campaign_id='hoshilu-ai-actress-daily-v1' AND status='APPROVED' AND jst_publish_date >= '2026-09-13'`（案2は `AND jst_publish_date IN (...)` を付ける）

---

## 2026-09-14

### 事故: セラー営業メールの本文に誤った漢字・カナ → 3通は D1 で訂正、Worker に定型文ゲート（#275）→ **本番確認済み**

- 13:15 JST 大隆さんが配信テスト（自分宛）で発見:「弁然のご連絡失箰いたします」「取り揁って」「リピーグー」「まだ大にありません」
- 原因: Cowork の日次販促タスク（06:30 JST）が AI で本文を書き、目視確認だけで投入していた。9/7〜9/10 投入分（20通）は正常、
  **9/11 投入分 5 通**（かばんやさん／スタイルオンバッグ／京童工房／HushTug／ナチュレンピー）は「冒頃なご連絡失祬いたします」
  「商品情報ヘージ」のまま **9/14 09:15〜09:30 JST に実送信済み**。9/14 投入分 3 通は 9/15 09:05 送信予定で未送信
- 対応1（大隆さん指示「すぐ訂正して」＝承認済み）: QUEUED 3 行（`seller-outreach-2026-09-14-01〜03`）の `body` / `hook` を正しい定型文に UPDATE し、読み直して確認
- 対応2（#275、head `1881c07`、CI ✅ 2026-09-14T04:29Z、テスト 2304）: `OUTREACH_REQUIRED_SENTENCES`（定型文13文）を
  一字一句そのまま含まない行は Worker が送らず `SKIPPED`（`last_error=template_mismatch:<欠けた文>`）。
  hook の1文（自由文）の誤字は検出できない → 投入側の手順で「hook は常用漢字のみ・INSERT 後に SELECT で読み直す」
  （Projects `claude/hoshilu_seller_outreach_template_rule_2026-09-14.md`、日次販促ログ冒頭に【必読】を追記）
- 候補リスト 30 社は 9/14 で投入完了（フォーム限定2社除く28社）。新規候補の調査までは新しい行は発生しない
- **大隆さんの判断が要るもの**: 誤字のまま届いた 5 社へ訂正・お詫びを再送するか。「1アドレス生涯1回」の仕組み外の手動送信になり、
  2通目は特定電子メール法上も慎重さが要る。Cowork の意見は「再送しない（返信があった相手にだけ丁寧に対応）」

### shop_viewed の洪水（9/8〜、1日 48〜67万件）→ 原因はクローラの絞り込み総当たり。#276 → **本番確認済み**

- 事実: `growth_events.shop_viewed` が `source='worker'` で 9/14 は 14 時間で 320,873 件（ほぼ全部 `with-care` / `content='search'`、
  1分あたり 370〜480 件）。D1 が 2.6GB まで肥大。日次販促タスクが 9/9 から6日連続で「要注意」と報告していたが未対応だった
- 原因: ショップページの絞り込みワード（商品名から生成）×ブランド×属性×ページ送りのリンクを検索エンジンのクローラが総当たり
- 対応（#276、head `2d74620`、CI ✅ 2026-09-14T04:51Z、テスト 2305）: 既知クローラ UA は `shop_viewed` を記録しない／
  絞り込み・並び順・2ページ目以降は `noindex,nofollow`／チップとページ送りに `rel=nofollow`／`robots.txt` に `Disallow: /shop/*?`
- 本番確認: robots.txt に反映。D1 の分あたり件数が 04:51 の 384 件 → 04:52 以降 **0〜1 件**（デプロイ直後に止まった）
- **大隆さんの承認が要るもの**: 既存の約 300 万行の削除（§54 DELETE）。SQL:
  `DELETE FROM growth_events WHERE event_type='shop_viewed' AND source='worker' AND campaign='with-care' AND content='search' AND occurred_at >= '2026-09-08'`
  （人の閲覧も一部混ざるが、この期間の with-care/search は 99.9% がクローラ。Seller 向け「Shop 閲覧」KPI は 9/8〜9/14 を欠測扱いにする）

---

## 2026-09-15

### 新指示書「HOSHILU 成功戦略・プロダクト再定義 指示書」（探さなくていい。ホシっといて。）→ 保存・着手

- 原文: `docs/handoff/2026-09-15-master-directive-hoshittoku.md`（Projects `claude/hoshilu_master_directive_2026-09-15_hoshittoku.md`）
- 現状との突き合わせ: Projects `claude/hoshilu_hoshittoku_status_map_2026-09-15.md`（項目別に 本番確認済み／一部実装／未実装 を判定、P0→P1 の順）
- 大隆さん決定: **A ok**（P0-1 コピー・CTA・0件導線を本番へ）／**B ok**（無料でホシっとく＝メール or LINE→完了）／
  **C ok**（INSIGHT 巡回を D1 有料枠に合わせる）／**D2**（Codex 復帰まで Cowork が主幹、Codex は検索品質・監視の個別課題）
- 出発点の実数: 預かっている「欲しい」24 件（内部 3 人）、INSIGHT の一致通知 0 回。§29 に従い、
  通知が実際に出ることを内部で確認するまで「見つかるまで探します」を SNS・広告で宣伝しない

### P0-1 意味の統一（#279、head `749e3a9`）→ **本番確認済み**

h1「探さなくていい。ホシっといて。」／補足「スクショでも、SNSでも、うろ覚えでも。HOSHILUが見つけます。なければ、見つかるまで探します。」／
入力欄「何が欲しい？」／主 CTA「ホシっとく」＋直下「今探します。見つからなければ、そのまま探し続けます。」（EN/ZH/KO も更新）。
`app.js?v=158`。hoshilu.app で表示を確認。

### P0-2 登録前後の導線（#280、head `ca85d96`、CI ✅ 2026-09-15T15:47Z）→ **実装済み・本番未確認（コードは本番、体験の通し確認は次回）**

- 結果末尾と 0 件時に「今は見つかりませんでした。ホシっといて、HOSHILU に探し続けてもらいますか？」→「無料でホシっとく」
- 未ログインなら、その場で希望価格ウォッチと同じ最短登録（メール 6 桁 or LINE、`createWatchQuickJoin` に `lead` / `source='hoshittoku'`）。
  検索語を `hoshilu_pending_insight` に保存し、登録完了→`syncMemberWishes()` 後に `applyPendingInsight()` が INSIGHT 保存検索を自動作成（再入力なし、§7）
- ログイン済みなら即 `saveInsightWatch(query)`→「HOSHILU が探し続けています」
- `app.js?v=159` / `ai-search-layout-fix.css?v=129`。テスト 2311 全通過。本番 app.js に文言・`hoshilu_pending_insight` を確認

### P0-3 継続探索を効かせる（#281、head `72bec1c`、CI ✅ 2026-09-15T15:50Z、`INSIGHT_D1_QUERY_TIER=PAID`）→ **本番確認済み（デプロイ）**

D1 は 2.6GB＝既に Workers Paid のため新規費用なし（C 承認）。1 巡回 1 件 → 最大 40 件。

**訂正（D1 実測）**: 預かり 24 件のうち INSIGHT の巡回対象（`insight_enabled_at` あり・`notify_new_match=1`）は **2 件だけ**
（「マルアイ 底部開口 封筒」9/4、「汗染み防止 Tシャツ…」9/8）。残り 22 件は希望価格ウォッチ／通常保存で、継続探索の対象外。
2 件とも初回巡回で `INSIGHT_BASELINE`（基準の候補集合）を保存済み。以後は知識索引に**新しい候補が入った時だけ**
「見つかりました」通知が出る仕組みで、9/4・9/8 以降に新候補は出ていない＝通知 0 回は「動いていない」ではなく「新着がない」。
#280 の「無料でホシっとく」は `saveInsightWatch` → `notify_new_match=1` → `insight_enabled_at` が入る経路なので、
新規登録はそのまま巡回対象になる（コードで確認）。
残る確認: 実際に新着候補が索引に入って通知が出る 1 例。これが出るまで外部発信は「今探します」まで（§29）。

### Codex 復帰を検知（9/13〜）→ D2

Codex が feature/ui-search-v2 に直接コミット（self-check `docs/handoff/2026-09-1{3,5}-codex-selfcheck.md`、#278 Threads 一時エラー再試行）。
Cowork から Codex へのメモ: `docs/handoff/2026-09-15-cowork-note-for-codex.md`（クローラ監査は #276 と整合、#278 の重複除外を文書化、
大隆さん判断待ちの 3 件には触らない）。

### セラー営業（継続）

- 9/14 投入分 3 通は訂正済み本文で 9/15 09:15 送信（template_mismatch なし）。返信はまだ 0
- 第 2 候補リスト 13 社（Projects `claude/hoshilu_seller_outreach_candidates_round2_2026-09-15.md`）。#1〜5 を 9/16 09:05 に投入済み、残 8 社

### 次に自動で進めること（P1）

1. `/mywatch` を「探しています／見つかりました／値下がり待ち／あとで見る」の 4 状態にし、ログイン後の最初の画面にする（§8/§9）
2. 機能名の言い換え（§11）
3. 計測イベント `want_saved` / `result_top3_clicked` / `result_rejected`（「違う」ボタン、§21）
4. 日次販促の型を「欲しい瞬間」型（§23、#ホシっといて）に作り直す

---

## 3. 判定SQL（再利用）

```sql
-- SNS由来の自動検索が完了しているか（#263 の効果）
SELECT substr(occurred_at,1,13) h, event_type, COALESCE(campaign,'') code, COUNT(*) n
FROM growth_events
WHERE occurred_at >= datetime('now','-24 hours') AND traffic_class NOT IN ('QA','INTERNAL')
  AND event_type IN ('search_started','search_completed','search_client_degraded','search_inbound_pending')
GROUP BY h, event_type, code ORDER BY h DESC;

-- #267 以降: 縮退が自動実行か手動か（marketplace 列 = AUTORUN / MANUAL）
SELECT marketplace trig, campaign code, COUNT(*) n FROM growth_events
WHERE event_type='search_client_degraded' AND occurred_at >= '2026-09-11T04:30:00'
GROUP BY trig, code;

-- 30日ファネル（SNS visitor）
WITH v AS (SELECT DISTINCT visitor_id FROM growth_events
  WHERE occurred_at >= datetime('now','-30 days') AND event_type='landing_view'
    AND traffic_class NOT IN ('QA','INTERNAL') AND source IN ('threads','x','instagram') AND visitor_id<>'')
SELECT (SELECT COUNT(*) FROM v) visitors,
 (SELECT COUNT(DISTINCT g.visitor_id) FROM growth_events g JOIN v USING(visitor_id) WHERE g.event_type='search_started') started,
 (SELECT COUNT(DISTINCT g.visitor_id) FROM growth_events g JOIN v USING(visitor_id) WHERE g.event_type='search_completed') completed,
 (SELECT COUNT(DISTINCT g.visitor_id) FROM growth_events g JOIN v USING(visitor_id) WHERE g.event_type='marketplace_click') mall_click;
```

---

## 4. Codex 復帰時に渡すもの（都度更新）

| 状態 | 項目 |
|---|---|
| 本番確認済み | #263 SNS着地の自動検索をトークン到着後に実行（効果は数字で要確認） |
| 本番確認済み | #267 `search_inbound_pending` ＋ 縮退の autorun/manual 次元（#263 の効果判定はこれで可能になる。判定は 21:30 JST） |
| 本番確認済み | #269 `search_inbound_pending_hidden`（事前読み込み／bot と人のアプリ内ブラウザの切り分け。判定 9/12 21:30 JST） |
| 本番確認済み | #268 既知クローラの UA を KPI 除外（`seo_*_view` が下がるのは実数化） |
| 本番確認済み | 未着手 2〜4 は Codex 既存修正で動作（`35fca07` / `158c6ac` / `61481ca`） |
| 本番確認済み | #264 ショップ PROFILE に事業者名・店舗住所（ITG 3店に設定済み）／値下がり待ちの人数は5人以上のみ表示 |
| 決定済み（対応不要） | OpenAI 課金は当面しない。`openai_backup BILLING_DISABLED` は既知状態 |
| 実装済み・本番未確認 | AI女優の参照を v1 に統一（`22c6fef`）。9/12 は precheck で未生成（#270）→ 次の月・水・土で確認。v2 生成済み2本の扱いは大隆さん判断待ち |
| 本番確認済み | #275 セラー営業メールの定型文ゲート（template_mismatch）。9/14 投入分 3 通は D1 で訂正済み。誤字のまま届いた 5 社への再送は大隆さん判断待ち |
| 本番確認済み | #276 クローラのショップ閲覧を記録しない・絞り込み URL を noindex,nofollow・robots Disallow。洪水は停止。既存 300 万行の削除は承認待ち |
| 要判断（大隆さん） | v2 毎日リール（`hoshilu-ai-actress-daily-v1`）の APPROVED 26件の取り消し。9/4 引き継ぎが Codex 側で未実施 |
| 確定 | SNS 着地は事前読み込み／bot。人の SNS 流入はほぼゼロ。評価軸を検索完了・ウォッチ設定に変更 |
| 未実装 | SEO の人の読者づくり（SNS からの記事誘導） |
| 本番確認済み | #279 P0-1 トップコピー「探さなくていい。ホシっといて。」＋主 CTA「ホシっとく」（9/15 指示書、A 承認） |
| 実装済み・本番未確認 | #280 P0-2 結果内「無料でホシっとく」→ メール/LINE 最短登録 → INSIGHT 保存検索を自動作成（B 承認）。通し体験の本番確認が残る |
| 本番確認済み（デプロイ） | #281 P0-3 `INSIGHT_D1_QUERY_TIER=PAID`（C 承認、費用増なし）。巡回対象は現状 2 件のみ（他 22 件は対象外）。通知の実例はまだ 0 |
| 決定済み | D2: Codex 復帰後も当面 Cowork が主幹。Codex は検索品質・監視の個別課題。メモ `2026-09-15-cowork-note-for-codex.md` |
| 未実装（P1） | 「ホシってるもの」4 状態画面／名称言い換え／`want_saved` 等の計測／「違う」ボタン／SNS「欲しい瞬間」型 |
