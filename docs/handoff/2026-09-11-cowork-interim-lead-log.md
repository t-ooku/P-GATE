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

### P1（同日夜、A/B/C/D2 承認の範囲内で続行）→ 4 件すべて本番デプロイ済み

- **#282 「ホシってるもの」**（head `22a2c8d`、CI ✅ 16:07Z）: トップの保存ハブ見出しを「ホシってるもの」にし、先頭に
  探しています／見つかりました／値下がり待ち／あとで見る の 4 状態（件数つき、タップで該当一覧へ）。ログイン完了
  （`/?member=logged-in`）で戻った時はこのハブへスクロール（§8/§9/§32）。`app.js?v=160` / `mywatch.css?v=2`、
  テスト追加 `test/hoshi-status.test.mjs`。hoshilu.app で見出しを確認 → **本番確認済み**
- **#283 「違う」を数える**（head `69b5724`、CI ✅ 16:14Z）: AI「これですか？」の はい／違う を固定イベント
  `result_confirmed` / `result_rejected` に（候補名・検索文は送らない）。`growth-analytics.mjs?v=14`。
  §27 の他の KPI は既存イベントで出せる（ホシっとく = `wish_saved` + `continuous_search_saved` + `target_price_watch_started`、
  登録 = `member_registered`、上位クリック = `ai_result_clicked`）→ **本番確認済み（デプロイ）**
- **#284 機能名の言い換え（§11）**（head `88cf6f2`、CI ✅ 16:21Z）: AI最安比較 →「これ、今買う？」／関連商品 →「こんなのもホシりそう」／
  BUZZ 見出し →「今、みんながホシってる。」／通知のちがい → 探しているもの・値下がり待ち・セール。
  SALE RADAR の見出しは据え置き（「ホシってる商品のセール」は、ホシってる商品に絞ったセール表示ができてから）。
  hoshilu.app で見出しを確認 → **本番確認済み**
- **日次販促タスクの型を「欲しい瞬間」型に変更（§23〜§25）**: `trig_01HfNzS3XKThiiv9h5p3Aeot` の指示を書き換え
  （1日3本すべて『欲しい瞬間』→ HOSHILU に話す → ホシっとく。#ホシっといて 必須。「見つかるまで探します」等の結果保証は禁止 §29。
  投稿の評価軸を着地数から「ホシっとく件数」に変更 §27。セラー営業メールの【必読】定型文ルールと第2候補リストも明記）。
  次回 9/16 06:30 JST から適用 → **実装済み・本番未確認**（初回投稿は 9/16 07:45 JST）

### Codex 復帰を検知（9/13〜）→ D2

Codex が feature/ui-search-v2 に直接コミット（self-check `docs/handoff/2026-09-1{3,5}-codex-selfcheck.md`、#278 Threads 一時エラー再試行）。
Cowork から Codex へのメモ: `docs/handoff/2026-09-15-cowork-note-for-codex.md`（クローラ監査は #276 と整合、#278 の重複除外を文書化、
大隆さん判断待ちの 3 件には触らない）。

### セラー営業（継続）

- 9/14 投入分 3 通は訂正済み本文で 9/15 09:15 送信（template_mismatch なし）。返信はまだ 0
- 第 2 候補リスト 13 社（Projects `claude/hoshilu_seller_outreach_candidates_round2_2026-09-15.md`）。#1〜5 を 9/16 09:05 に投入済み、残 8 社

### 次に自動で進めること（9/16〜）

1. #280 の通し体験を本番で確認（未ログインで検索 → 「無料でホシっとく」→ メール 6 桁 → 「探しています」に入る）
2. ~~継続探索の「見つかりました」通知の実例~~ → #285 で 9/16 02:05 JST に本番初の通知。#286 の通知間隔（24h）を本番確認
3. 9/16 07:45 JST の『欲しい瞬間』型 初回投稿を確認し、9/17 以降「ホシっとく件数」で評価
4. P2: ホシってる商品に絞ったセール表示、§7 の完全版（画像・SNS URL の保存）

---

## 2026-09-16（深夜、大隆さん決定 3 件＋「見つかるまで探します、を実現」）

### 大隆さんの決定と実行（§54 承認済み）

- **誤字メール 5 社への再送: しない**（決定のみ。返信があった相手にだけ丁寧に対応）
- **v2 毎日リールの取消: 実行** — `hoshilu-ai-actress-daily-v1` の APPROVED（9/16〜9/29、IG 14 + X 14 = **28 件**。9/12 時点の 26 件から
  2 日分増えていた）を CANCELLED に UPDATE（`last_error='CANCELLED_BY_TAKAYUKI_2026-09-16 …'`）。以後 Runway の月・水・土枠は precheck で止まらない
- **クローラ行の削除: 実行** — `growth_events` の with-care/search クローラ行 **2,890,802 行** を 8 回に分けて DELETE。
  D1 サイズ 2.65GB → **0.90GB**。Seller 向け「Shop 閲覧」KPI の 9/8〜9/15 は欠測扱い

### 「見つかるまで探します」を本当にする（#285 → 本番初の「見つかりました」通知 → #286 で通知の間隔を整える）

- 原因: 継続探索の巡回は D1 索引済みカタログ**だけ**を見ていた（`insight-catalog-search.mjs` に「ライブモール API は呼ばない」と明記）。
  索引に新商品が入らない限り通知は永久に 0 回。SNS で「見つかるまで探します」と書けない根本理由はここだった
- **#285**（head `0412443`、CI ✅ 17:01Z）: 巡回のたびに楽天市場 API・Yahoo!ショッピング API を実際に呼び、同じ品質基盤
  （カテゴリ不一致除去・ランキング）を通した候補を索引結果に足す。ライブ候補は `record_key` から `product_id` / `marketplace` を作り、
  既存の重複除外（`product_identity_key`）と基準集合にそのまま乗る。`INSIGHT_LIVE_MARKETPLACES='0'` で索引のみに戻せる
- **本番結果**: デプロイ 4 分後の 17:05Z 巡回で **本番初の「条件に合う商品が見つかりました」通知**（「汗染み防止 Tシャツ…」、5 商品、
  WEB 即時・EMAIL/LINE 17:16Z 配信済み）。**通知は動く**ことを本番で確認 → **本番確認済み**
- 副作用: 15 分後の 17:20Z にも同じ条件で 5 商品の通知。楽天側の並び替えで上位 20 件の顔ぶれが変わり、毎回数件ずつ「新着」になる。
  実ユーザーなら 15 分おきの通知で解除される
- **#286**（head `1fc0c71`、CI ✅ 17:32Z）: 同じ条件への通知は **24 時間に 1 回**。静穏期間中の新着は通知なしで記録して重複除外に使う。
  ライブ候補の上限 20 → 60（楽天 30 + Yahoo! 30 の 1 ページ全件を初回の基準集合に入れる）。
  本番確認: 直後の 17:35Z 巡回は新着 5 件を通知なし（`notification_id NULL`）で記録し、通知は出なかった → **本番確認済み**
- SNS: 日次販促の指示を更新し「見つからなければ、見つかるまで探します」「HOSHILUが探し続けます」を**書いてよい**に変更
  （書いてはいけない: 「必ず見つかります」「100%」、期限の約束、割引率の断定）。9/16 06:30 JST の回から

---

## 2026-09-16（昼〜夜、大隆さん指示 5 件＋売上の実態確認）

### #287 トップ補足コピーの改行と「マイページ」時代の表示の整理（head `28a2bb9`）→ **本番確認済み**

- 補足コピーを文単位で固定:「スクショでも、SNSでも、うろ覚えでも。HOSHILUが見つけます。」／「なければ、見つかるまで探します。」
  （JA だけ `white-space:nowrap`、EN/ZH/KO は折り返し可）
- 「ホシってるもの」内に残っていた旧名称（マイページ／保存した検索 等）を 9/15 指示書の言葉に統一。`app.js?v=162` / `ai-search-layout-fix.css?v=130`

### #288 HOSHILU BUZZ の各商品に「この価格になったら教えて☑」（head `908d27c`）→ **本番確認済み**

- 大隆さん指示「ホシルバズも、希望価格ウォッチが必要」。トップの BUZZ 棚（`buzz-home.mjs?v=5`）は `window.HoshiluWatch.open(candidate)`
  で検索結果と同じ希望価格ダイアログを開く。`/buzz` のランキング（`buzz.mjs?v=5`）は `/?q=<商品名>` で検索へ
- `marketplace-ranking.mjs` の楽天ランキングに `record_key: RAKUTEN:<itemCode>` を付け、`buzz-shelf.mjs` が `record_key` を通す（ウォッチの商品特定用）

### #290 SNS プロフィール用の短縮 URL（head `afd46b6`）→ **本番確認済み**

- 大隆さん指示「流入経路が判別できるスレッツプロフィールに貼るホシルの URL」→「短縮 URL 作って」
- `hoshilu.app/th` `/ig` `/x` `/tt` `/yt` `/line` → `/?utm_source=<src>&utm_medium=profile&utm_campaign=hoshilu-profile&utm_content=<src>-bio` に 302（`no-store`）。
  growth_events の `source` / `medium` / `campaign` / `content` に載るので、プロフィール経由の着地と「ホシっとく」件数を経路別に数えられる
- **大隆さんの操作**: Threads プロフィールのリンクを `https://hoshilu.app/th` に、Instagram を `https://hoshilu.app/ig` に差し替える（他も同様）

### #291 下部固定メニュー（5 タブ）＋上部のページ名帯（head `0eb225b`、CI ✅ 16:42Z）→ **本番確認済み（デプロイ）**

- 大隆さん指示「インスタや X みたいに下部にメニューの固定帯。開いたら上部に何のページか分かるように」
- タブ: 探す（メイン検索・ジャンル・人気の小ジャンル）／ショップ（ショップから探す・クーポン）／ホシる中（ホシってるもの・値下がり待ち・
  今みんながホシってる・みんなが値下がりを待ってる）／セール（セールレーダー）／マイアカウント（ログイン・お知らせ・公式アカウント）
- `tab-nav.mjs` / `tab-nav.css`（新規、SW `hoshilu-shell-v408`）。既存の節は動かさず `data-view` で出し分け。ページ内リンクは属するタブを開いてからスクロール。
  検索実行時は「探す」に戻る。`window.HoshiluTabs.activate(id)`、イベント `hoshilu:view-changed`
- **出していないもの**: 「ユーザーポイント管理（ショップ負担）」は未実装のため表示しない（§33 未実装の体験を宣伝しない）。
  ショップ負担の設計（セラーへの課金・原資・付与条件）を決めてから実装する → P2

### #292 「♡ 気になる」（ハート）→「ホシる中」に横スクロール一覧（head `641f607`、CI ✅ 17:00Z）→ **本番確認済み（デプロイ）**

- 大隆さん指示「提示された商品やレコメンド商品やホシルバズの商品に気になるボタン（ハート）。タップで保存したら『ホシる中』に横回転スクロールで一覧（削除もできる）」
- 検索結果・おすすめの既存ハートを「♡ 気になる／♥ 気になる」に改名（保存先の案内は「ホシる中で見る →」）。BUZZ 棚の各商品にもハート（`buzz-home.mjs?v=6`）
- 「ホシる中」タブに `#keptProducts`「気になる商品」（横スクロール、画像・商品名・価格、× で外す）。端末内保存（`hoshilu_kept_products`、登録不要）。
  `window.HoshiluKeep`、イベント `hoshilu:kept-changed`。`app.js?v=165` / `mywatch.css?v=3` / `buzz-home.css?v=5` / `tab-nav.mjs?v=2`。テスト 2325 全通過

### 売上の実態（大隆さん質問「ほんとに売上立つようになってるよね？9/14・9/15 のインフルエンサー 15 人投稿で何か増えた？」）→ **売上はまだ 0**

事実（D1、QA/INTERNAL 除外、9/14〜9/16）:
- モール遷移 `marketplace_click`: 9/14 1 件・9/15 3 件・9/16 5 件（およそ 2 人）。アフィリエイト成果は各社ダッシュボードでしか分からない（HOSHILU 側に成果データは来ない）
- セラー: 問い合わせ 9/7 以降 0、営業メール SENT 34 通・返信 0、契約 0
- クリエイター: `creator_inquiries` 0、クリエイター由来（`utm_source` / `ref` 付き）の着地 0
- 9/14 に出所不明の着地の山（39 view / 29 visitor、検索完了 1）。インフルエンサー投稿の可能性はあるが、渡した URL に印が無ければ判別できない
- **大隆さんに確認したいこと**: 15 人にどの URL を渡したか（素の `hoshilu.app` なら経路は追えない）。次回からはクリエイター別の短縮 URL（#290 の型で `/c/<name>`）を渡す。
  楽天アフィリエイト／Amazon アソシエイト／バリューコマースの管理画面で 9/14〜9/16 のクリック・成果を見てほしい（URL→押す場所は日次レポートに記載）

---

## 2026-09-17（昼〜夕、大隆さん指示 9 件＋「HOSHILU SHOP全面強化」指示書 P0）

### 画面の直し（#294〜#297、すべて本番確認済み（デプロイ））
- #294（head `56b3782`）: 「いまの価格を見る」が反応しない → 下部タブ導入後、検索欄が「探す」タブに隠れていたため。タブを開いて検索を実行（`focusSearch` もタブを開く）
- #295（head `654d905`）: 「ショップから探す」ボタンも同じ原因 → 「ショップ」タブを開いてから移動
- #296（head `b82af68`）: 「探す」の帯からページ名を消す／検索候補の『メーカー』『関連』バッジを消す／「ホシルからの提案」のモール導線を商品提示の下へ
- #297（head `5e0a686`）: 「検索方法」見出しを削除し検索枠を縦に詰める（入力欄 138px→92px）／主 CTA「ホシっとく」→「AIで探す」／補足「見つからなければ、そのまま探し続けます。」1 行／結果直下の通知リンク 2 つを削除／商品画像を高解像度で要求（楽天 `_ex=128x128`→ カード 300・拡大 600、Yahoo! `/i/g/`→`/i/l/`）。画像自体の補正ではない

### 「HOSHILU SHOP全面強化」指示書（#298〜#300）→ P0 を本番へ（実装済み・本番未確認）
- 指示書原文: `docs/handoff/2026-09-17-shop-directive.md`。現状判定と P1 の順: Projects `claude/hoshilu_shop_directive_status_2026-09-17.md`
- 監査で分かった前提: Seller 専用の商品表は無く、ショップの商品は `products`（tenant 同期、価格なし）と `sp_api_listings`。横断検索・検索文の保存・値下がり/再入荷の検知・フォロー通知・店別 AI は無かった
- **#299（head `be4bf9d`）Worker 側**: migration `0079_shop_demand.sql`（本番 D1 に手動適用済み: `shop_demand_requests` / `shop_search_log` / `shop_demand_offers`）。`src/shop-demand.mjs`:
  `GET /api/shops/search?q=` が掲載中 3 店（itg / itt / mc2、在庫あり約 32.6 万件）を横断し、検索文から 色・素材・サイズ・名詞 の条件を取り出して商品名で判定 → 条件一致（全部あり）／近い（半分以上、✓／△ を返す）／なし。％は出さない。
  `POST /api/shops/demand` で探し中需要を保存（未ログインは日替わり匿名ハッシュ、端末に控え → ログイン後 `claim`）。メール・URL・長い数字列を含む文は保存しない。1 訪問者 1 日 20 件。
  `GET /api/seller/shop/demand`（Business）: 需要の匿名集計（人数・検索回数・0件・近似のみ・自社商品の一致/近い件数・状態）。`POST /api/seller/shop/demand/offers`: ASIN／URL で自社商品を指定 → HOSHILU が再判定 → 一致（保存時 0 件なら近いでも）の時だけ需要を MATCHED にし `SHOP_DEMAND_MATCH` を WEB 即時＋LINE/EMAIL（既存配信）で通知。INSIGHT と同じ 15 分枠で OPEN 需要を最大 15 件再判定
- **#300（head `d61a16d`）画面側**: 「ショップ」タブ最上部に「欲しいものを、HOSHILUのショップ全部から探す」（`shop-search.mjs/css`）。カード＝画像・商品名・価格（SP-API にある時）・ショップ名・✓／△・「ショップで見る」「♡ 気になる」「この価格になったら教えて☑」。0 件は「今は見つかりませんでした／HOSHILUが探し続けます」＋条件チップ＋「ホシっとく」。`?shop_search=` で通知から結果へ。「みんなが今探しているもの」（2 人以上）。`/seller` に「HOSHILUで今探されているもの」と「この需要に商品を登録」。app.js v170 / tab-nav.mjs v4 / SW v409
- 本番の性能: 商品名 LIKE（3 語 OR）は 1 tenant 13 万件で約 130ms。1 検索あたり FTS 最大 5 本＋LIKE 1 本 × 3 tenant
- **残る確認**: 本番での通し体験（横断検索 → 0 件 → ホシっとく → `/seller` に出る → 商品登録 → 通知）。数字は 0 から（`shop_search_log` 0 件、需要 0 件）

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
| 本番確認済み | #275 セラー営業メールの定型文ゲート（template_mismatch）。誤字のまま届いた 5 社への再送は **しない**（大隆さん決定 9/16） |
| 本番確認済み | #276 クローラのショップ閲覧を記録しない・絞り込み URL を noindex,nofollow・robots Disallow。洪水は停止。既存 2,890,802 行は 9/16 に削除済み（D1 0.90GB） |
| 実行済み | v2 毎日リール（`hoshilu-ai-actress-daily-v1`）の APPROVED 28 件を 9/16 に CANCELLED（大隆さん決定）。Runway の月・水・土枠は次回から止まらない |
| 確定 | SNS 着地は事前読み込み／bot。人の SNS 流入はほぼゼロ。評価軸を検索完了・ウォッチ設定に変更 |
| 未実装 | SEO の人の読者づくり（SNS からの記事誘導） |
| 本番確認済み | #279 P0-1 トップコピー「探さなくていい。ホシっといて。」＋主 CTA「ホシっとく」（9/15 指示書、A 承認） |
| 実装済み・本番未確認 | #280 P0-2 結果内「無料でホシっとく」→ メール/LINE 最短登録 → INSIGHT 保存検索を自動作成（B 承認）。通し体験の本番確認が残る |
| 本番確認済み（デプロイ） | #281 P0-3 `INSIGHT_D1_QUERY_TIER=PAID`（C 承認、費用増なし）。巡回対象は現状 2 件のみ（他 22 件は対象外） |
| 本番確認済み | #285 継続探索が楽天・Yahoo! のライブ API を巡回。本番初の「見つかりました」通知が 9/16 02:05 JST に出た（WEB/EMAIL/LINE 配信済み） |
| 本番確認済み | #286 INSIGHT 通知は 1 条件 24 時間に 1 回、ライブ候補 1 ページ全件を基準集合に（17:35Z 巡回で新着 5 件を通知なしで記録、通知 0 を確認） |
| 決定済み | SNS で「見つからなければ、見つかるまで探します」を書いてよい（大隆さん決定 9/16）。日次販促の指示に反映済み |
| 決定済み | D2: Codex 復帰後も当面 Cowork が主幹。Codex は検索品質・監視の個別課題。メモ `2026-09-15-cowork-note-for-codex.md` |
| 本番確認済み | #282 「ホシってるもの」4 状態ハブ＋ログイン後の最初の画面（§8/§9） |
| 本番確認済み（デプロイ） | #283 `result_confirmed` / `result_rejected`（§21「違う」の計測） |
| 本番確認済み | #284 機能名の言い換え（§11）。SALE RADAR 見出しは据え置き |
| 実装済み・本番未確認 | 日次販促を『欲しい瞬間』型へ（§23、#ホシっといて）。9/16 06:30 JST から |
| 未実装（P2） | ホシってる商品に絞ったセール表示（→ SALE RADAR を「ホシってる商品のセール」と名乗れる）／登録後の「あなたがホシりそう」（個人化）／画像・SNS URL・色サイズ素材の wish への保存（§7 の完全版） |
| 本番確認済み | #287 トップ補足コピーの改行固定＋「マイページ」時代の旧名称の整理 |
| 本番確認済み | #288 BUZZ の各商品に希望価格ウォッチ（トップ棚はダイアログ、/buzz は検索へ）。楽天ランキングに `record_key` |
| 本番確認済み | #290 SNS プロフィール短縮 URL `/th /ig /x /tt /yt /line`（UTM 付き 302）。大隆さんがプロフィールのリンクを差し替える |
| 本番確認済み（デプロイ） | #291 下部固定メニュー 5 タブ＋ページ名帯（`tab-nav.mjs`）。ユーザーポイント（ショップ負担）は未実装のため非表示 |
| 本番確認済み（デプロイ） | #292 「♡ 気になる」→「ホシる中」の横スクロール一覧（× で外す）、BUZZ にもハート |
| 事実 | 売上 0（9/14〜16 モール遷移 9 件≈2 人、セラー契約 0、クリエイター経由 0）。インフルエンサー 15 人の URL は要確認 |
| 本番確認済み（デプロイ） | #294〜#297 9/17 の画面直し（タブ隠れの導線 2 件、帯・バッジ・モール導線、検索枠・CTA「AIで探す」・通知リンク削除・画像高解像度） |
| 実装済み・本番未確認 | #298〜#300 SHOP 強化 P0: 横断検索／探し中需要／Seller 需要表示／商品登録の再判定と `SHOP_DEMAND_MATCH` 通知（migration 0079 適用済み）。通し体験の確認が残る |
| 未実装（P1） | SHOP 強化 P1: 店内検索 0 件→店向けホシっとく、今日のこのショップ（新着から）、ショップをホシる通知、私の棚、`/for-sellers` 文言 |
| 本番確認済み（デプロイ） | #302 横断検索にジャンル・詳細条件（`/api/shops/filters`）／ヘッダー 1 段（「販売者専用」、会員名・ログアウトはマイアカウントへ） |
| 本番確認済み（デプロイ） | #303 全ページのページ名帯を削除（`tab-nav.mjs` v5） |
| 実装済み・本番未確認 | #304 第2指示書（`2026-09-17-shop-kpi-directive.md`）P0: Seller 需要は **同じ条件 5 人以上**だけ・検索文でなく正規化条件を表示（`SHOP_DEMAND_SELLER_MIN_PEOPLE`）／会員の「ショップで探しているもの」一覧＋やめる（`/api/shops/demand/mine`, `DELETE /api/shops/demand/:id`）／KPI イベント `shop_search_completed` `shop_demand_saved` `shop_demand_matched` |
| 事実 | KPI 低下の調査: 9/11〜13 は検索開始 0（着地は bot のみ）。7 日率の分母が数十件で、日次系列に計測欠落は見つからず。タブ導入後（9/16〜）も `search_started` は記録されている |
| 実装済み・本番未確認 | #305 KPI ダッシュボード 4 タブ（経営KPI／検索品質／SHOP・Seller／流入・販促、§18）。SHOP・Seller は回数・件数のみ（推定売上・CV なし） |
| 事実→修正 | §19 流入元: 30 日の着地セッション 572 件のうち 405 件（71%）が「直接・不明」。原因は UTM しか読んでおらず参照元（referrer）を使っていなかったこと。#305 で参照元ホストだけを読み google/yahoo=organic、instagram/threads/x/tiktok/line=social、他=referral に補完（パス・クエリは読まない）。9/17 以前の期間は直接・不明が実態より多い |
| 本番確認済み（デプロイ） | #305 KPI 4 タブ＋参照元補完（12:05Z） |
| 実装済み・本番未確認 | #306 SHOP P1: 店内検索 0 件→「このショップにホシっとく」（seller_slug 付き需要）／「ショップをホシる」の完了文から未実装の通知を外す／`/for-sellers` 中心メッセージ「欲しい人が見える。欲しい人に商品を届けられる。」（§30〜31） |
| 事実（要判断） | 「今日のこのショップ」は作れない: 3 店の `products` は全行 `imported_at=2026-07-22`（約 2 か月、再同期なし）。新着・値下げ・再入荷はデータが無い。商品同期の再開が先 |
| 本番確認済み（デプロイ） | #307 値下がり待ちの各行に「やめる」 |
| 決定・実装済み・本番未確認 | SNS 方針 v3（`2026-09-17-sns-policy-v3.md`）: リール火・金（Runway 新規生成・声付き v1）、カルーセル月・水・土（Pillow 画像、IG CAROUSEL / X 画像 4 枚）、ユーザー向け:セラー向け=50:50、X 同日同内容。#308 |
| 実行済み（承認済み） | 9/9 の v2 女優 Runway ジョブを不採用（FAILED_FINAL）、キュー行 CANCELLED。migration 0080（media_urls）本番適用 |
| 事実 | production monitor の GITHUB_SCHEDULE_HEARTBEAT_STALE は GitHub 側の schedule 遅延（21:07 JST 検知→22:22 JST 自動 ACK）。Cloudflare 側の監視は正常。AI 女優 SLA の FAIL は 9/16 のリール停止決定によるもの → v3 の監視に置き換え |
| 本番確認済み（デプロイ） | #313 SHEIN をバリューコマース提携モールとして扱う（大隆さん 9/18 提携承認、プログラム 2173939）。開示文 4 言語・privacy・/go 提携ホスト。フロント直リンクは LinkSwitch が変換。9/30 までの報酬率・バリュポの 200 円はユーザー向け文面に書かない |
| 事実 | 9/18 D1: `search_client_degraded` 直近 7 日は全件 `TURNSTILE_TOKEN_UNAVAILABLE`（手動）。9/16 同一 JA 訪問者が 5 分で 6 回押し直し、毎回 15 秒後に同じ縮退。#170/#249 は本番未反映だった（現行は `catch{return;}` の無音終了）。threads/x/instagram の「social/profile」着地 62 件は全件 locale=EN・投稿 60〜100 秒後・1 秒未満に 5 件連続で、リンク検査 bot の可能性が高い（人の着地は locale=JA の Instagram プロフィール経由 5 人、うち 2 人は検索開始） |
| 本番確認済み（デプロイ） | #314 Turnstile: 初期化失敗の取り直し（手動検索の復旧）／着地自動検索は失敗で無音終了せず `TURNSTILE_INIT_FAILED`（autorun）を記録／トークン未到達時は一度だけ描き直して 8 秒待つ／error-callback 番号を `TURNSTILE_TOKEN_UNAVAILABLE_E<番号>` で D1 に残す。app.js v173。#170/#249 は completed で close（内容は #314 に置換） |
| 事実→修正 | 登録ゼロの分離: `member_notification_destinations` は 9/15 LINE（既存会員の追加連携）・9/17 EMAIL（新規）だが `member_registered` は全期間 0。同じ INSERT を D1 に直接流すと成功 → Worker の batch が失敗し「計測は任意」の catch が無音で通っていた（登録イベントだけ欠落、登録者は 1 人実在）。#315 で batch 失敗時も冪等 event_id で単独書き込み＋ `member_registration_telemetry_failed`（固定コード）を残す。9/17 分の遡及 INSERT は大隆さん判断待ち |
| 本番確認済み（デプロイ） | #316 品質カナリア偽陽性: 9/17 `energy_saving_kotatsu` は本命「こたつ中掛け毛布」でも PASS（末尾ひらがなで主名詞が取れず null→2）。ひらがな主名詞（こたつ）＋直付き付属品語（毛布・布団・カバー・継ぎ脚）を H0、本体語（テーブル・本体・セット）を H2。カナリア reject・教師データ excluded_conditions・回帰テスト。次回カナリア（22:2x UTC）で再判定 |
| 事実 | 9/14 の別人公開事故以降、auto-runway-reel は生体照合未実装のため `identity_check_unavailable` で必ず不合格（fail closed）。9/18(金) `seller_demand_visible` も同理由（#312。顔 5/5・セリフ 0.895・禁止語なし）。方針 v3 のリール枠は人が承認するか生体照合を実装しない限り空になる |
| 本番確認済み（デプロイ） | #317 リール日 19:30 JST 以降に承認済みリールが無ければ 20:15 JST 枠を静止画カルーセル（火=ユーザー／金=セラー）で代替（`hoshilu-carousel-v3-fallback-*`）。9/18 から。SLA も代替行を当日投稿として数える |
| 本番確認済み（デプロイ） | #318 SHOP タブに横断検索開始率・完全一致率・近似率・0件→ホシっとく率・後日マッチ率・ホシる率（計測できる率だけ）。未計測: 商品→ショップ遷移率、マッチ通知→再訪率 |
| 決定（9/19 大隆さん） | 「HOSHILU Seller収益化・需要マッチ改修」: 料金は **HOSHILU Seller 4,980円/月・最初の3か月 月額0円・Demand Match Click 1有効クリック50円** に統一。Growth 9,800円・上位プランは LP に出さない（内部バックログのみ）。50円は「探していた人を HOSHILU が呼び戻して商品を開いた時だけ」に固定 |
| 本番確認済み（デプロイ） | #327 `/for-sellers` 全面書き換え（欲しい人が、先に見える。／8 ステップ／「今探されているもの」実データ `/api/shops/demand/public`／1 プラン／FAQ）。#328 9,800→4,980 をコード全体で統一、`QUALIFIED_CLICK_CHARGE_ENABLED=false`（旧ジャンル別クリック課金停止） |
| 本番確認済み（デプロイ） | #329 Demand Match Click 1/2: Seller 専用商品ページ `/shop/<slug>/product/<asin>`（商品データの事実だけ）、通知リンクを署名付き商品ページに（会員IDはハッシュ・30日失効）、`seller_demand_match_clicks`/`seller_demand_match_budgets`（migration 0081 本番適用済み）、判定 VALID/EXCLUDED（BOT/QA/ADMIN/SELF/NOT_LOGGED_IN/MEMBER_MISMATCH/SELLER_MISMATCH/ACCOUNT_NOT_ACTIVE/BUDGET_CAP/DUPLICATE）、`/api/seller/demand-match`＋`PUT /budget`、growth_events `shop_product_viewed`/`demand_match_click` |
| 本番確認済み（デプロイ） | #330 Demand Match Click 2/2: 契約者画面 `#demand-match`（通知した需要・有効クリック・今月の利用額・予算上限 0/1,000/3,000/5,000/10,000/任意、初期 3,000円）。seller.js v2。テスト 8 本 |
| 判断待ち（大隆さん） | `DEMAND_MATCH_CHARGE_ENABLED` は false。判定・件数は本番で記録するが残高からは引かない。true にすると VALID ごとに前払い残高から 50円（REFERRAL_CHARGE）。LP の「準備中・それまで0円」文言は、true にした時に外す |
| 事実 | 9/19 03:50Z 時点で `shop_demand_requests` は 0 行（探し中需要がまだ 1 件も無い）。完成条件の実データ E2E（検索→0件→ホシっとく→需要一覧→商品登録→再照合→通知→商品ページ→有効クリック 1 件→50円表示）は本番でまだ通せていない。合成テストでは全経路 PASS |
| 決定（9/19 大隆さん） | 「ユーザー(ニーズ)とセラー(需要)を近付けて繋ぐプラットフォームだから、SNS 含めた全ての販促で積極的にセラー募集」「9,800円の旧料金体系の記事は取り下げ」 |
| 本番確認済み（デプロイ） | #332 Demand Match Click 課金開始（ITG 3 アカウントは無料 `DEMAND_MATCH_FREE_SELLER_KEYS`）、LP の「準備中」削除・見出し折り返し修正。#333 残高 50 円未満の Seller は Demand Match 停止（商品登録拒否・再照合対象外・通知なし）。#334 LP スマホ折り返し。#335/#336/#337 クリエイター募集: 表の見切れ修正、素材をカルーセル 6 セットに改定、セラー募集を最優先（上）、ハッシュタグ 8 個、二次利用の注意書き＋規約第 1.1 版。カルーセル画像は t-ooku の PAT 経由の push（037a1f7）で workflow を起動して再生成（040e047） |
| 本番確認済み（デプロイ） | #339 Threads 22:30 JST を毎日セラー募集（`hoshilu-threads-seller-v1`、10 本日替わり）。X 補助枠のセラー比率 1/6→1/4。旧料金投稿の取り下げ `retractOldPricingPosts`（`SOCIAL_RETRACT_OLD_PRICING=true`）。#340 Threads 削除 API の呼び方修正 |
| 事実 | 取り下げ対象 20 件（hoshilu-seller-daily-v1 9/7〜9/18、X 10・Threads 10）。X は API で削除済み（9/10 件、残 1 件は次 cron）。Threads は `Application does not have permission for this action (code 10)`＝アプリに `threads_delete` 権限が無い。大隆さんが Threads アプリで手動削除するか、Meta アプリに threads_delete を追加して再認可（トークン再発行）が必要 |
| 事実 | `hoshilu-seller-daily-v1`（X/Threads 12:35 JST）は Codex 側の日次投入。9/19 以降の行は無い。次に投入する時は料金行を「4,980円/月・最初の 3 か月 0 円・Demand Match Click 50 円」にすること（旧「9,800円・送客料のみ」は禁止） |
| 実行済み | Seller 営業メール: 9/21 送信予定の 5 件（9/18 投入）の料金行を新料金へ UPDATE（大隆さん「旧料金は取り下げ」に基づく）。新規 12 件を投入（round4: PERENNE／Bag DIRECT／ふとんタウン／ホテルのインテリア／赤ちゃんデパート水谷＝9/21 10:05 JST、CoffeeSAKURA／ばいせん工房／カフェ工房／エコノレッグ／Belle and Sofa／食喜屋／EAST table＝9/22 09:05 JST）。公開メールのみ、1 アドレス生涯 1 回（Style On Bag・ベビーアルテは送信済みのため除外）、必須文・禁止語は機械検査済み |
| 本番確認済み（デプロイ） | #342（1c4493f）取り下げ cron は `RETRACT_FAILED_%permission%` の Threads 行を飛ばし X を先に処理。X 10/10 件 CANCELLED（9/7 分も本番 D1 で確認）。Threads 10 件は PUBLISHED のまま＝大隆さんの手動削除待ち（12:35 JST 投稿 9/7・8・9・10・11・14・15・16・17・18）。threads_delete 権限追加＋再認可後は `POST /api/internal/social/retract-old-pricing`（force）で API 削除可 |
| 決定（大隆さん 9/17 の再確認） | SNS 曜日方針の正本は `2026-09-17-sns-policy-v3.md` のみ。9/8 引き継ぎ書の曜日表（月水土 Runway 等）は置換済みで、Codex の日次判定・監視は v3 基準。土曜 Runway 新規 Reel は要求なし（9/19 の「未達」は方針の読み違い。9/19 20:00 の IG/X は静止画案内で正常、v2 日次 Reel は 9/16 に CANCELLED 済み、9/18 金のセラー Runway Reel は IG/X PUBLISHED）。#123 に記録 |
| 事実 | 旧料金投稿の取り下げ完了: X 10 件 API 削除、Threads 10 件は大隆さんが 9/19 に手動削除、D1 を CANCELLED/RETRACTED_OLD_PRICING_MANUAL_2026-09-19 に更新。旧料金を含む PUBLISHED 行 0 件 |
| 実行済み | クリエイター初採用: yuking（X）。1 依頼 1 投稿・最大 10 回、第 1 回はセラー募集（期限 9/26）。creator_inquiries を APPROVED に更新。台帳は Cowork プロジェクト `claude/hoshilu_creator_ledger_yuking_2026-09-19.md` |
| 決定（大隆さん 9/19） | 90日計画「最初の100人と最初の1店」。トップの主役を「値下がり待ち」に差し替え（本番実測: 2週間 約600訪問→会員3人＝転換率約0.5%）。機能追加・SEO記事追加・営業メール候補追加は止め、転換率・広告テスト（Meta 月3〜5万円）・セラー実績1件に集中。計画は Cowork プロジェクト `claude/hoshilu_90day_plan_first100_2026-09-19.md` |
| 実装（本 commit） | トップ: H1「欲しい値段を、先に決めておく。」＋入力→既存「すぐ検索」→結果カードの「この価格になったら教えて☑」を点滅（`hero-watch.mjs`/`.css`、計測 `hero_price_watch_submitted`）。届く通知の例（実際の通知文言の型）。手がかり4ボタンは折りたたみ、SEARCH AGENT／DISCOVERY／GUIDES／WHY の4節は `<details>` に（ページ高さ 4648→3107px）。登録ダイアログは LINE 1タップを第一候補に。Turnstile 初期化失敗は3回静かに再試行してから従来の案内文。app.js v174 |
| 決定（大隆さん 9/19 深夜） | Google 検索の組み込み: 楽天・Yahoo! は API 検索のまま、他の 11 モール（Amazon・Qoo10・SHEIN・ZOZOTOWN・BUYMA・SHOPLIST・MUSINSA・SNKRDUNK・ロフト・ハンズ・マツキヨ）は公式 Google Programmable Search（Custom Search JSON API、大隆さんが 11 ドメインだけ登録）の結果をカードで出す。楽天・Yahoo! に候補があっても出す。SERP スクレイピング業者は使わない。次に「URL を貼ってホシっとく」（構造化データから商品名・画像・価格→価格ウォッチ）を作る。計画は Cowork プロジェクト `claude/hoshilu_google_search_and_url_watch_plan_2026-09-19.md` |
| 実装（本 commit） | `src/google-mall-search.mjs`（cx/key は Secrets `GOOGLE_CSE_ID`/`GOOGLE_CSE_KEY`、日次上限 `GOOGLE_MALL_SEARCH_DAILY_LIMIT` 既定 95 を D1 `google_mall_search_usage_daily`（migration 0082、本番適用済み）で予約、同一検索語は Cache API 24h、2.5 秒でタイムアウト、検索語以外は送らない）。`decoratePwaResult` が本検索と並行に呼び `google_mall_results` を返す（/go 署名リンク、t=GOOGLE_MALL、cm=false）。フロント `google-mall-results.mjs/.css` が結果カード直下に「GOOGLE で見つかった商品」を描画（価格は「ページ記載の価格（確認時点）」と明記、JPY 以外は出さない）。app.js v175 は renderResults 先頭で `hoshilu:results-rendered` を投げるだけ。許可ドメインに matsukiyo.co.jp 追加 |
| 決定（GPT 指示書 2026-09-20、大隆さん承認） | Custom Search JSON API は新規利用停止・2027-01-01 廃止のため基盤にしない（#350 で停止）。置き換えは Google Agent Search（Website Search、基本モード=ドメイン確認不要、月 10,000 クエリ無料、以降 1,000 クエリ 4 ドル）。大隆さんがアプリ `hoshilu-malls_1789846201676`（global、11 モールのデータストア、Enterprise Edition、生成レスポンス OFF、生成 AI 除外）とサービスアカウント `hoshilu-agent-search@…`（Discovery Engine 閲覧者）を作成、Secrets `GOOGLE_AGENT_SEARCH_SA_JSON` / `GOOGLE_AGENT_SEARCH_ENGINE` を登録。ルール: 楽天・Yahoo! は API 検索のまま。その他のモールは「そのモールから HOSHILU の結果が 0 件」のときだけ Google（楽天・Yahoo! の有無に関係なく、モール単位）。指示書全文の要点と P0〜P2 は Cowork プロジェクト `claude/hoshilu_master_directive_2026-09-20_google_search_url_watch_searching.md` |
| 実装（本 commit） | `google-mall-search.mjs` を Agent Search 版に差し替え: サービスアカウント JWT(RS256)→OAuth トークン（メモリ 50 分キャッシュ）→ Discovery Engine `servingConfigs/default_search:search`（query/pageSize/languageCode/safeSearch のみ送る）。商品詳細 URL だけ残す（検索一覧・カテゴリ・ランキング等は除外、商品ページが 0 件の時だけ一覧 2 件）。`excludeMarketplaces` で HOSHILU に結果があるモールを除外（`decoratePwaResult` が候補の offers から算出）。日次上限既定 300（≒月 9,000）、24h キャッシュ。`GOOGLE_MALL_SEARCH_ENABLED=true` に戻す。フロントのカードは次 commit |
| 実装（本 commit） | フロント: Google（Agent Search）で見つかった商品を結果カード直下に横スライド（`google-mall-results.mjs/.css`、scroll-snap、PC は左右ボタン、スマホはスワイプ、最大 20 件、「参考価格・検索時点」明記）。大隆さん指示「検索窓を一番上に」: 第一画面の価格ウォッチ専用入力欄（heroWatchForm）と hero-watch.mjs を廃止し、検索窓を見出し直下に。検索窓の下に「探して → この価格になったら教えて☑ を押すだけ」、「届く通知の例」は検索枠の下へ。app.js v175（renderResults 先頭で `hoshilu:results-rendered` を投げるだけ）。Worker は pageSize 20 |
| 実装（本 commit、大隆さん 9/20 10:35 指示） | トップ: 副文を「探し続けるのはもう終わり。」に、🎙を右端（クリアはその左）、見出し上に 12px、案内文を「気になる商品の『この価格になったら教えて☑』を押すだけ。あとはほっといて、値下がりしたらHOSHILUが通知。」、通知の例を身近な商品名（子ども用ステンレス水筒 500ml）に。ホシる中: 4 状態タイルの停止位置を見出しが見える位置（`scroll-margin-top`）へ、「あとで見る」は専用ブロック `#laterWishes`（保存だけの条件を列挙、押すと同じ行を開く）へ分離。タブ: 4 番目を「ホシルバズ」（`#buzzHome`・`#watchDemand`）に、セールはマイアカウント（ログイン→受け取るセール→公式→お知らせ）へ移動、`#tab-sale` は account に読み替え。BUZZ 棚は届いた分をすべて表示、取得失敗時は隠さず「取得できなかった」と書く（順位・商品は API のまま）。ジャンル追加は公式ランキングページで genre_id を照合してから別 commit。 |
| 実装（本 commit、大隆さん 9/20 10:56 指示） | 結果画面: Google 枠の見出しを「Google検索から発見」だけに（kicker・注記は出さない、参考価格の断りは各カード）。商品が出ている時の「近い種類・特徴を選んでください。」と「価格まで確認できた商品 N／接続済みモールで…」の見出しは出さず上に詰める。「まとめて探す（1タップでモールへ）」→「ショッピングサイトで探す」。AI特定候補カード内のモールボタン欄は「個別に探す」と重複するため非表示（CSS、SNSで探すが上に詰まる）。`.marketplace-links.compact` も 2 列。固定バーに「ホシっとく」（結果内のホシっとく欄へ移動して点滅）。フッターに「出品者募集」(/for-sellers)。ホシっとく欄の補足はボタンの下に 1 文「ホシっとくと、HOSHILU が探し続けます。一致する商品が見つかったときだけ、アプリ・LINE・メールへお知らせします。」（会員・未登録とも、JA の note は空）。app.js v177、continuous-search.css v3、google-mall-results.mjs v2。 |
| 実装（本 commit、大隆さん 9/20「ホシルバズ、バージョンアップ始めて」） | BUZZ v2: 主婦層向けの公式ジャンル棚を 14 追加（`BUZZ_HOME_GENRE_IDS`: キッズ・ベビー・マタニティ 100533／食品 100227／スイーツ・お菓子 551167／日用品雑貨・文房具・手芸 215783／キッチン用品・食器・調理器具 558944／インテリア・寝具・収納 100804／美容・コスメ・香水 100939／スキンケア 100944／レディースファッション 100371／バッグ・小物・ブランド雑貨 216131／ペット・ペットグッズ 101213／おもちゃ 215333／美容・健康家電 100191／サプリメント 563727。全て ranking.rakuten.co.jp/daily/<id>/ の見出しで照合済み）。各 10 件、テーマ棚（6 件）の後ろに全部同時表示、予算別棚は全棚から集計。楽天 1 req/sec を守るため D1 キャッシュに無い棚だけ 1 秒間隔で順に取得（`BUZZ_FETCH_GAP_MS`）、BUZZ 棚の D1 TTL は 20 分、15 分 cron（7,22,37,52）で `warmBuzzShelves` が予熱。フロント: ジャンルの帯（押すと棚へ）、棚ごとに「◯◯ を他のモール（Google）でも探す →」（HOSHILU 検索を実行＝Agent Search 枠が出る。BUZZ 側で Google は呼ばない）。順位・商品・価格は公式 API のまま。buzz-home.mjs v9 / .css v7。 |
| 実装（本 commit、大隆さん 9/20 12:54 指示） | 結果画面: 「ホシルからの提案」と最初の商品の余白を詰める（`.results .section-title` の下 6px、空の `#resultMessage` は非表示、先頭の `.result-row` の上余白 0）。マイアカウント: 公式アカウント枠に「出品者募集（ショップ登録・3か月0円）／探している人に、あなたの商品を届ける」ボタン（黒地・金の縁、`/for-sellers?utm_source=app&utm_medium=account&utm_campaign=sellers-v1`）。experience-layer.css v16。大隆さん確認: ホシルバズの「◯◯ を他のモール（Google）でも探す →」で検索結果に Google 枠が出た（本番 OK）。 |
| 実装（本 commit、GPT 指示書 2026-09-20 §P0 上限） | 「ホシっとく＝保存」と「探し中＝継続処理」を数で分離。無料上限: 保存 100／同時「探し中」10／希望価格 Watch 10（`WISH_LIMIT_SAVED` 等で上書き可）。`POST/PATCH /api/member/wishes` で新規行・探し中 ON・希望価格の新規付与だけを数え、超えたら 409（`WISH_SAVE_LIMIT_REACHED` / `WISH_SEARCHING_LIMIT_REACHED` / `WISH_PRICE_WATCH_LIMIT_REACHED`、`message`・`usage`・`limits` 付き。指示書の文言「10 個を探し中です。新しく探し始めるには、探し中の条件から 1 つを『あとで見る』へ」）。既存行の再保存・同じ商品の希望額変更は数えない。`GET /api/member/wishes` に `limits`・`usage` を追加。画面: 409 の文言をそのまま出し「ホシってるものを整理する →」(#laterWishes) へ、状態タイルは「探し中 2/10」「値下がり待ち 1/10」表示。DB 監査（本番）: member_wishes 24 行・会員 3 人・最大 19 行/人・探し中 2・希望価格付き 5 → 既存行は全員上限内、UPDATE/DELETE なし。外部 URL Watch（5 件）は機能そのものが未実装のため未着手。app.js v178、mywatch.css v6、test/member-wish-limits.test.mjs。 |
| 調査・実装（本 commit、9/20 Agent Search の結果欠落報告） | Agent Search の待ち時間を 3 秒→7 秒へ延長。初回応答が 3 秒を超える可能性はあるが、検索本文や検索単位のIDを本番D1へ保存しない。原因は固定コードの集計と安全な合成試験で確認する。 |
| 実装（本 commit、大隆さん 9/20 13:20〜13:30 指示） | ホシる中: 開いたらすぐ「気になる商品（♡）」→「値下がり待ち」→「探しているもの（追ってるキーワード）」→「あとで見る」→「見つかりました・お知らせ」の順（tab-nav `HOSHIRU_ORDER = ['#keptProducts','#insight']`、#insight 内の並びも入替）。ダッシュボード（HOSHILU INSIGHT・要約・4 状態タイル・通知のちがい）は `<details id="insightDashboard">` で普段は閉じ、「ホシってるもの」（見出し）を押すと開く。値下がり待ちの行は 楽天のように 商品画像（72px）＋商品名 2 行まで＋希望額＋操作。画像は「この価格になったら教えて☑」時に候補の image_url（https）を price_condition.target_image_url として保存（既存 5 行は画像なし→頭文字タイル、次に希望額を付け直すと入る）。app.js v179・tab-nav.mjs v8・mywatch.css v7。 |
| 実装（本 commit、9/20 Agent Search の検索補正） | Agent Search の検索要求に `spellCorrectionSpec:{mode:'AUTO'}` と `queryExpansionSpec:{condition:'AUTO'}` を明示（綴り違い・少件数でも補正）。固定バーの「モールで直接探す」「ホシっとく」を同じ幅（2 列とも 1fr）。continuous-search.css v4。原因確認は検索本文を保存せず、固定コードの集計と安全な合成試験で行う。 |
| 実装（本 commit、大隆さん 9/20 14:27 報告「Google 枠が出ない」続き） | Codex 916e379 の privacy boundary（検索本文・検索単位 ID は D1 に残さない）に従い、`google_mall_search_log` は 1 時間バケット × 結果種別の件数だけを数える（SHOWN／ALL_EXCLUDED／NO_PRODUCT_PAGES／RAW_0／TIMEOUT／HTTP_xxx…）。本番の旧テーブル（0 行）は DROP → 0083 の新スキーマで再作成済み。書き込みは await（Workers はレスポンス後の未完了 Promise を打ち切るため、投げっぱなしでは 1 行も残らなかった）。14:27 の検索では予約 +2 のみで結果種別は不明 → 次の検索で確定。 |
| 実装（本 commit、GPT 指示書 §P0「URL 貼り付け→ホシっとく」） | 検索窓に 13 モールの商品ページ URL を 1 本貼って検索すると、本検索の代わりに `POST /api/product-url/identify`（`src/product-url-identify.mjs`）がそのページを 1 回取り（6 秒・1MB・UA 明示・6 時間キャッシュ）、JSON-LD Product/Offer → OG の順で商品名・画像・価格（JPY だけ）を読み、「この商品ですか？」カード（`product-url-paste.mjs/.css`）を出す。価格が読めない時は「この商品の価格は現在自動追跡できません」（推測しない）。カードから「この価格になったら教えて☑」（既存の HoshiluWatch、外部 URL は record_key=URL）と「この商品名で HOSHILU で探す（ホシっとく）」。対象 URL の判定は既存 `marketplaceForProductUrl`（一覧・検索ページ・非対応サイトは取りに行かない）。app.js は無変更（document capture で送信を先に受ける）。外部 URL の Watch 5 件枠は次（現状は値下がり待ち 10 件枠に含まれる）。 |
