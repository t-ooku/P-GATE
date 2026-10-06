# Codex 日次点検 — 2026-10-07

## 判定

- **不具合あり**: 本番 health と検索 SLI は正常だが、SNS 将来在庫は 2026-10-12 の X / Instagram が不足している。
- **最大ボトルネック**: E（希望価格設定を完了しない）。直近7日で検索 19 セッションに対し、設定開始 1、設定完了 0（検索→完了 0.0%）。
- **次の修正**: 検索結果の「ホシっとく」押下から価格入力、認証、保存 API までを段階別の匿名イベントで集計し、開始 1 件が完了しなかった位置を QA / INTERNAL 除外で特定する。母数 20 検索未満のため、原因未特定の大型 UI 変更はしない。

## 証拠と観測範囲

- 点検時刻: 2026-10-07 07:55 JST
- 正本: `AGENTS.md`（`feature/ui-search-v2`）と `docs/handoff/2026-10-06-claude-to-codex-inspection-handover.md`（`origin/main`。本番ブランチには未収録）
- 本番 source: `a5a0ad392e49b1dbfeff138a6ef76cd47f244d87`
- リポジトリ最新 HEAD: `9e731951b74b290e1ffb95e00fc3bcf7cc0daf9a`（教師データ生成結果。未デプロイ）
- 最新の既存監視: [HOSHILU production monitor #37530343941](https://github.com/t-ooku/P-GATE/actions/runs/37530343941)、2026-10-07 05:57 JST
  - external contract / health: PASS、`/health ok (7 critical integrations)`
  - real-user search SLI: PASS、15分窓の backend failed 0、provider degradation 全診断群 0
  - 30日 continuity: 178 finished / unavailable 0
  - SNS SLA: FAIL、将来在庫 4/6、2026-10-12 の X / Instagram が不足
- 最新の再利用可能な匿名 KPI: [production monitor #37524558040](https://github.com/t-ooku/P-GATE/actions/runs/37524558040) の artifact `hoshilu-codex-kpi-37524558040`、生成 2026-10-07 05:11 JST
  - 7日窓: 2026-09-30 05:11〜2026-10-07 05:11 JST
  - 計測カバレッジ 100%。QA は除外され、一般希望価格保存は設定済み内部会員3人を除外している。
- 最新 CI: [Project GATE CI #37532139633](https://github.com/t-ooku/P-GATE/actions/runs/37532139633) は `0a1d4bcedd270ede01274b0ca81c46d7f7c87149` で成功。
- 本点検では health / OAuth / SNS在庫 / 検索SLIを再取得せず、上記 Actions の結果を再利用した。D1への書込み、SNS公開、営業送信、新記事制作、料金・規約変更は行っていない。

## P-GATE 日次9項目

### 1. 07:22 search QA の本命商品・カテゴリ意味一致

- **未計測（理由）**: 点検時点の既存 Actions / 匿名成果物に、2026-10-07 07:22 JST 実行分の固定 QA 各行と本命商品名がない。最新成果物の `search_qa` は PASS 23 / FAIL 1 の集計だけで、最終観測も 2026-10-06 07:24 JST。PASS 数は意味一致の証拠にしない。
- 固定 QA の商品名・カテゴリ意味一致は判定不能。利用者の検索文は取得していない。

### 2. search_backend_failed / search_provider_degraded

- 既存監視の直近15分窓: `search_backend_failed` 相当 0。provider degradation は AI chat primary transient 0、query structurer primary transient 0、search input advisory 0、visual web advisory 0、all-provider 0。
- **24時間・campaign 診断コード別は未計測（理由）**: 最新の再利用可能な匿名成果物に当該24時間集計がない。直近15分の0を24時間値へ読み替えない。
- `openai_backup=DEGRADED(CANARY_PROVIDER_BILLING_DISABLED)` は既知の想定内構成で、利用者検索障害には数えない。

### 3. target_price_observations 24時間 reason別

- **未計測（理由）**: 最新成果物の reason 別値は全期間かつ `includes_internal_tests: true` であり、QA / INTERNAL を除外した24時間集計ではない。
- 参考値として同成果物の24時間 provider 診断は楽天 `CANDIDATES` 17件だが、reason 別件数の代用にはしない。
- NO_CANDIDATES / NO_MATCH の偏りを確認できないため、検索語長・同一判定に関する因果仮説も保留する。

### 4. price_observations 前日増加

- **未計測（理由）**: 最新成果物に `SELECT COUNT(*) FROM price_observations` の当日値と前日値がなく、増分を再現できない。0件とは扱わない。

### 5. SNS APPROVED / PUBLISHING の last_error

- 2026-10-07 当日分の匿名集計では、Instagram APPROVED 1、Threads APPROVED 5、X APPROVED 2はいずれも `error_code=NONE`。
- **全期間の件数 / content_id は未計測（理由）**: 再利用成果物は当日プラットフォーム別集計で content_id を含まない。Issue [#252](https://github.com/t-ooku/P-GATE/issues/252) の既知行との差分を個別同定できないため、差分0とは断定しない。
- 書込み・再送・UPDATEは行っていない。

### 6. モール別 CTR / 検索→モール1タップ

- モール別 click / shown CTR: **未計測（理由）**。最新成果物に marketplace 別 shown 分母がない。shown=0 とも扱わない。
- 検索→モール送客: 3 / 19 セッション = **15.8%**。検索完了→モール送客は 3 / 15 = **20.0%**。
- いずれも直近7日、QA除外の匿名集計。モール別CTRとは別指標。

### 7. 最大ボトルネックと次の修正

- A 流入: landing 81。目標母数がないため合否は未判定。
- B 検索しない: 19 / 81 = 23.5% が検索。
- C 正解が出ない: 検索完了 15 / 19 = 78.9%。固定 QA の意味一致が未計測なので正解率とは断定しない。
- D モールへ行かない: 3 / 15 = 20.0% が検索完了後にモール送客。
- **E 登録しない: 設定開始 1 / 19、設定完了 0 / 19 = 0.0%。比較可能な既取得ファネルで最大の離脱。**
- F 戻らない: 一般保存者0のため通知再訪率は分母なし・未計測。
- 次の修正は冒頭判定の通り、希望価格保存を段階別に匿名計測して離脱点を特定する。

### 8. 前日 Claude 成果物

- 検索精度改善: `d81b64449e73e441e2d935d72be1ce145dee5a16`（教師データの `excluded_conditions` が未登録カテゴリで素通りする不具合を修正）。
- 教師データ: `2613ea9d3b51b6fcbc336a70df7d8fdf5c507900`（daily batch 044、50件）、`ae9c29cbbcfae0e13f9f6dee70da673a1598f44e`（batch-019自動生成・再コンパイル）。件数自体は事業実績にしない。
- **Claude 日次作業 欠落: social_post_queue 追加**。前日追加を識別できる既存成果物 / commit がないため、欠落として記録のみ行う。Claudeへ点検を回していない。

### 9. openで14日以上動きのないIssue

2026-09-23より前に最終更新された open Issue は27件。検索条件は `repo:t-ooku/P-GATE is:issue is:open updated:<2026-09-23`。

- [#1](https://github.com/t-ooku/P-GATE/issues/1), [#44](https://github.com/t-ooku/P-GATE/issues/44), [#52](https://github.com/t-ooku/P-GATE/issues/52), [#74](https://github.com/t-ooku/P-GATE/issues/74), [#123](https://github.com/t-ooku/P-GATE/issues/123)
- [#149](https://github.com/t-ooku/P-GATE/issues/149), [#161](https://github.com/t-ooku/P-GATE/issues/161), [#169](https://github.com/t-ooku/P-GATE/issues/169), [#219](https://github.com/t-ooku/P-GATE/issues/219), [#223](https://github.com/t-ooku/P-GATE/issues/223)
- [#258](https://github.com/t-ooku/P-GATE/issues/258), [#260](https://github.com/t-ooku/P-GATE/issues/260), [#270](https://github.com/t-ooku/P-GATE/issues/270), [#273](https://github.com/t-ooku/P-GATE/issues/273), [#289](https://github.com/t-ooku/P-GATE/issues/289)
- [#321](https://github.com/t-ooku/P-GATE/issues/321), [#325](https://github.com/t-ooku/P-GATE/issues/325), [#326](https://github.com/t-ooku/P-GATE/issues/326), [#353](https://github.com/t-ooku/P-GATE/issues/353), [#388](https://github.com/t-ooku/P-GATE/issues/388)
- [#422](https://github.com/t-ooku/P-GATE/issues/422), [#423](https://github.com/t-ooku/P-GATE/issues/423), [#463](https://github.com/t-ooku/P-GATE/issues/463), [#464](https://github.com/t-ooku/P-GATE/issues/464), [#465](https://github.com/t-ooku/P-GATE/issues/465), [#466](https://github.com/t-ooku/P-GATE/issues/466), [#467](https://github.com/t-ooku/P-GATE/issues/467)

## 追加監査の適用

- 水曜日のため月曜SEO監査は対象外。
- 毎月1日ではないためAmazon 180日期限チェックは対象外。

## 大隆さんがやること

- ない。
