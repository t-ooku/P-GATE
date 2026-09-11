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

次の判定: 21:30 JST（Threads 20:30 枠後）。`search_inbound_pending` が着地ごとに出るなら
「その訪問はトークンを取れない環境」で確定。人の着地で `search_completed` が出れば効果あり。

### 定期タスク（Cowork側）

9/8 に「Codexへ移管」として停止していた2本を再開した（Codex不在のため）:
- 検索精度 日次改善（08:00 JST、規則+5・サジェスト+3・カナリア）
- 合成教師データ 50件/日（06:00 JST）

稼働中: 日次レポート（09:00）／本番監視＋Codex報告チェック（2時間ごと）／
日次販促 SNS投入（06:30）／Amazonアソシエイト月次／上記2本 = **6本**

### 未着手（優先順）

1. ~~`search_client_degraded` に autorun / manual を足す~~ → #267 で本番確認済み
2. 希望価格ウォッチの検索語（商品名丸ごと → ブランド＋型番＋主要語）: `NO_CANDIDATES` 3/3 のまま
3. Issue #252 Threads 無限リトライの Worker 側修正（4xx は即 FAILED）
4. 希望価格ウォッチ保存時に `target_product_key`（record_key/ASIN）を持たせる
5. AI女優の同一人物化（#18 の指摘）: reference/persona/QA を確認
6. SEO→検索遷移（記事閲覧はあるが検索開始0）

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
| 本番確認済み | #264 ショップ PROFILE に事業者名・店舗住所（ITG 3店に設定済み）／値下がり待ちの人数は5人以上のみ表示 |
| 決定済み（対応不要） | OpenAI 課金は当面しない。`openai_backup BILLING_DISABLED` は既知状態 |
| 未実装 | 上記「未着手」2〜6 |
