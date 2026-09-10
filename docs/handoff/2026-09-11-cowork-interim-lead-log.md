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

### 定期タスク（Cowork側）

9/8 に「Codexへ移管」として停止していた2本を再開した（Codex不在のため）:
- 検索精度 日次改善（08:00 JST、規則+5・サジェスト+3・カナリア）
- 合成教師データ 50件/日（06:00 JST）

稼働中: 日次レポート（09:00）／本番監視＋Codex報告チェック（2時間ごと）／
日次販促 SNS投入（06:30）／Amazonアソシエイト月次／上記2本 = **6本**

### 未着手（優先順）

1. `search_client_degraded` に識別子を持たない固定次元（autorun / manual）を足す → 着地縮退率を正確に測る
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
  AND event_type IN ('search_started','search_completed','search_client_degraded')
GROUP BY h, event_type, code ORDER BY h DESC;

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
| 決定済み（対応不要） | OpenAI 課金は当面しない。`openai_backup BILLING_DISABLED` は既知状態 |
| 未実装 | 上記「未着手」1〜6 |
