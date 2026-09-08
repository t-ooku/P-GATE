# Claude → Codex（2026-09-08）定期タスクの集約と、2本の移管

大隆さん指示により、Claude 側の定期タスクを **10本 → 4本** に集約した。
そのうち **2本は Codex へ移管する**（どちらも `feature/ui-search-v2` へ push するため、
9/7 に決めた「ブランチの所有者は Codex」と衝突していた）。

## 1. Codex に引き継ぐ2本（今日から Claude 側は動かない）

### A. 検索精度の日次改善（旧 08:00 JST・毎日）

停止した理由: 毎日 `[PATCH]` issue を出して本番ブランチへ push していた。実装は Codex の領分。

毎日やっていた内容:

1. 前日のカナリア結果を確認
   `SELECT medium, campaign, content, created_at FROM growth_events WHERE event_type='search_qa_result' AND created_at >= datetime('now','-1 day') ORDER BY created_at DESC`
   FAIL があれば `src/search-qa-canary.mjs` の `SEARCH_QA_CANARY_QUERIES` の該当クエリについて、
   `src/query-expansion*.mjs` / `knowledge-search.mjs` の `rankMerchantCandidates` /
   `index.mjs` の `buildMarketplaceApiKeywordCandidates`・`refineMarketplaceSearchQuery` を調べて直す。
2. **「利用者の機能語 ≠ 売り手の語」型の展開規則を5件**、`src/query-expansion-feature-rules.mjs` に追加。
   既存45件以上と重複しないジャンル（主婦層25〜40代の日常買い: キッチン・育児・洗濯掃除・
   コスメ・収納・ペット・通園通学・季節家電・衣類・健康）。
   形式は既存の `rule(id, match, primary, { synonyms, related, broad, sample, teacher:{...} })`。
   **`match` は特徴語とカテゴリ語の両方を要求する先読み正規表現**にし、一般語だけ（例「水筒」）には当たらないこと。
3. `node scripts/build-feature-teacher-batch.mjs` → `node scripts/compile-teacher-dataset-rules.mjs`
4. 入力サジェスト辞書 `public/search-suggest-data.mjs` の `CATEGORY_SUGGESTIONS` に3件追加
   （主要メーカー5社以上・絞り込み語5個以上、重複なし）
5. カナリアの固定クエリは **2日に1件まで**追加してよい（`test/search-qa-canary.test.mjs` の件数アサートも更新）
6. `npm test` 全緑 ＋ `npx wrangler deploy --dry-run` を通してから1コミット
7. 反映後、新しい教師データを D1 `teacher_queries` に `INSERT OR IGNORE`
   （`entry_id='tq_'+sha256(nfkc(query_text).lower()|category.lower()|locale)` の先頭16桁、
   `source='manual_verified'`、`status='ACTIVE'`）
8. Projects の `claude/hoshilu_search_quality_daily_log.md` に追記

禁止: 実利用者の入力を推測して規則に書く／テストの削除・緩和／D1 既存行の UPDATE・DELETE／
Secrets の出力／検索精度に無関係な UI 変更。

### B. 合成教師データ 50件/日（旧 06:00 JST・毎日）

停止した理由: 同上（毎日 push していた）。

手順は Projects の `claude/hoshilu_teacher_dataset_daily_ops_guide.md` に全部ある。
**絶対ルール: 合成データのみ（実ユーザー検索文は使わない）／D1適用ワークフローは実行しない／
医薬品・効能は断定しない。**

現状: `teacher_queries` の ACTIVE は **121件**。

### 引き継ぎで失われるもの（正直に）

この2本が止まっている間、**検索の展開規則もサジェスト辞書も教師データも増えない**。
Codex が拾うまで検索精度の日次改善は止まる。優先度は大隆さんの判断だが、
今週の最優先（一般ユーザーの Watch Set を発生させる）から見ると、
**Issue #252（Threads 無限リトライ）と 希望価格ウォッチの検索語修正の方が先**だと考える。

## 2. Claude 側に残した4本

| タスク | 頻度 | 役割 |
|---|---|---|
| 日次レポート（統合） | 毎日 09:00 JST | KPI・検索品質カナリア・モール到達・SNS・障害・ボトルネック。**コードは変更しない。提案まで** |
| 本番監視＋Codex報告チェック | 2時間ごと | `/health`・service-worker 世代・AUTO Issue・**`docs/handoff/` の新規**。読み取りのみ |
| 日次販促（SNS投入） | 毎日 06:30 JST | **Codex へ移管中**。Codex が1日成功させたら停止する（`2026-09-08-claude-to-codex-sns-operations.md` §1） |
| Amazonアソシエイト 180日期限 | 毎月1日 10:00 JST | 期限 2027-02-09。3件の適格販売が必要 |

### 統合で消した6本（内容は上の4本に入れた）

- 成功レポート§50（09:30 JST）→ 日次レポートへ
- SEO品質監査（09:00 JST）→ 日次レポートの**週1・月曜**へ
- 日次運用チェック（08:00 JST）→ 日次レポートの障害・設定監視へ
- Codex引き継ぎ報告チェック（2時間ごと）→ 本番監視へ
- 検索精度 日次改善（08:00 JST）→ **Codex へ**（上記 A）
- 教師データ50件/日（06:00 JST）→ **Codex へ**（上記 B）

**なぜ集約したか**: 4本が毎日それぞれ別々に同じ `growth_events` を叩き、
`/health` を3本が取り、「大隆さんがやること」欄を3本が書いていた。
同じ数字が1日に何度も別の形で報告されていて、読む側の負担になっていた。

## 3. 監視タスクのベースラインを更新した（重要）

旧「毎時監視」のベースラインが **2026-08-14 の release 1.19.0 / service-worker v386** のまま古く、
本番が 1.22.1 / v405 になっていたため、**毎時「release が変わった」と報告し続ける状態**だった。
2026-09-08 実測値に更新済み。

Codex がデプロイして release が上がったら、このベースラインも更新が必要になる。
気づいたら `docs/handoff/` に書き残すか、大隆さん経由で Claude に知らせてほしい。
