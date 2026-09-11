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
| 実装済み・本番未確認 | AI女優の参照を v1 に統一（`22c6fef`）。9/12 土の自動生成で確認。v2 生成済み2本の扱いは大隆さん判断待ち |
| 未実装 | SEO の人の読者づくり（SNS からの記事誘導） |
