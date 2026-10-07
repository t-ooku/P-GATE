# Codex 日次点検 — 2026-10-08

## 判定

- **不具合あり**: 本番 health と実利用者検索 SLI は正常。SNS 将来在庫は 2026-10-12 の X / Instagram が不足し、Yahoo! deep canary は `CANARY_YAHOO_COORDINATOR_HOP_TIMEOUT` で1回 FAIL。ただし直近15分の実利用者検索は backend failed 0、provider degradation 0で、pending incident / advisory はない。
- **最大ボトルネック**: E（希望価格設定を完了しない）。直近7日で検索 16 セッション、設定開始 1、設定完了 0（検索→完了 0.0%）。
- **次の修正**: 「ホシっとく」押下→価格入力→認証→保存 API を匿名の段階別イベントで集計し、開始1件が完了しなかった位置を QA / INTERNAL 除外で特定する。母数20検索未満のため、原因未特定の大型UI変更はしない。

## 証拠と観測範囲

- 点検時刻: 2026-10-08 07:56 JST
- 正本: `AGENTS.md`（`feature/ui-search-v2`）と `docs/handoff/2026-10-06-claude-to-codex-inspection-handover.md`（`origin/main`）
- 本番 source: `ffd9db023f3c99b47311b580322a36acd574f78c`
- リポジトリ最新 HEAD: `906aa1ade8221e9b848a0a8cde65c3298ead9b4c`（教師データ生成結果。本番 source とは別）
- 最新の既存監視: [HOSHILU production monitor #37687706161](https://github.com/t-ooku/P-GATE/actions/runs/37687706161)、2026-10-08 06:12 JST
  - external contract / health: PASS、`/health ok (7 critical integrations)`
  - real-user search SLI: PASS、直近15分 started 0 / backend failed 0 / provider degradation 全診断群 0
  - 30日 continuity: 179 finished / unavailable 0
  - deep canary: query structurer / 楽天 / AI chat primary は PASS。Yahoo! は `CANARY_YAHOO_COORDINATOR_HOP_TIMEOUT` で FAIL
  - SNS SLA: FAIL、将来在庫 4/6、2026-10-12 の X / Instagram が不足
- 最新の再利用可能な匿名 KPI: 同 run の artifact `hoshilu-codex-kpi-37687706161`、生成 2026-10-08 06:12 JST
  - 7日窓: 2026-10-01 06:12〜2026-10-08 06:12 JST
  - 計測カバレッジ 100%。QA は除外され、一般希望価格保存は設定済み内部会員3人を除外している。
- 本点検では health / OAuth / SNS在庫 / 検索SLIを再取得せず、上記 Actions の結果を再利用した。D1への書込み、SNS公開、営業送信、新記事制作、料金・規約変更は行っていない。

## P-GATE 日次9項目

### 1. 07:22 search QA の本命商品・カテゴリ意味一致

- 2026-10-08 07:22〜07:25 JST の匿名集計は PASS 23 / FAIL 1。
- **本命商品名の意味一致は未計測（理由）**: 再利用可能な Actions 成果物には固定 QA 各行の本命商品名がなく、結果数と最終観測時刻だけが収録されている。PASS数を意味一致の証拠・成果にしない。
- FAIL 1件のクエリID、本命商品名、カテゴリがないため、カテゴリ違いか外部API一時障害かを判定不能。利用者検索文は取得していない。

### 2. search_backend_failed / search_provider_degraded

- 既存監視の直近15分: backend failed 0。provider degradation は AI chat primary transient 0、query structurer primary transient 0、search input advisory 0、visual web advisory 0、all-provider 0。
- **24時間・campaign診断コード別は未計測（理由）**: 最新匿名成果物に当該24時間集計がない。直近15分の0を24時間値へ読み替えない。
- 別系統の deep canary で Yahoo! `CANARY_YAHOO_COORDINATOR_HOP_TIMEOUT` 1回を確認。実利用者検索失敗数ではないため混算しない。
- `openai_backup=DEGRADED(CANARY_PROVIDER_BILLING_DISABLED)` は既知の想定内構成。

### 3. target_price_observations 24時間 reason別

- **一般利用者・QA / INTERNAL除外後は未計測（理由）**: 最新成果物の reason 別値は全期間かつ `includes_internal_tests: true` で、24時間の除外済み集計ではない。
- 前回成果物から累計 `ABOVE_TARGET` は811→828（+17）だが、一般保存者は0人・0件、内部watchは2件。内部を含むため一般実績に数えない。
- 同成果物の24時間 provider 診断は楽天 `CANDIDATES` 17件。reason別件数の代用にはしない。
- NO_CANDIDATES / NO_MATCH の一般利用者偏重を確認できないため、検索語長・同一判定に関する因果仮説は保留する。

### 4. price_observations 前日増加

- **未計測（理由）**: 最新匿名成果物に `SELECT COUNT(*) FROM price_observations` の当日値と前日値がなく、増分を再現できない。0件とは扱わない。

### 5. SNS APPROVED / PUBLISHING の last_error

- 2026-10-08 当日分の匿名集計では、Threads APPROVED 5、X APPROVED 2はいずれも `error_code=NONE`。Instagramの当日行は成果物にない。
- **全期間の件数 / content_id は未計測（理由）**: 再利用成果物は当日プラットフォーム別集計で content_id を含まない。Issue [#252](https://github.com/t-ooku/P-GATE/issues/252) の既知行との差分を個別同定できないため、差分0とは断定しない。
- 書込み・再送・UPDATEは行っていない。

### 6. モール別 CTR / 検索→モール1タップ

- モール別 click / shown CTR: **未計測（理由）**。最新成果物に marketplace 別 shown 分母がない。shown=0 とも扱わない。
- 検索→モール送客: 2 / 16 セッション = **12.5%**。検索完了→モール送客は 2 / 14 = **14.3%**。
- 直近7日、QA除外の匿名集計。前回の検索→送客 3 / 19（15.8%）から3.3ポイント低下したが、母数が小さいため勝敗は断定しない。

### 7. 最大ボトルネックと次の修正

- A 流入: landing 76。目標母数がないため合否は未判定。
- B 検索しない: 16 / 76 = 21.1% が検索。
- C 正解が出ない: 検索完了 14 / 16 = 87.5%。固定 QA の本命意味一致が未計測なので正解率とは断定しない。
- D モールへ行かない: 2 / 14 = 14.3% が検索完了後にモール送客。
- **E 登録しない: 設定開始 1 / 16、設定完了 0 / 16 = 0.0%。比較可能な既取得ファネルで最大の離脱。**
- F 戻らない: 一般保存者0のため通知再訪率は分母なし・未計測。
- 次の修正は冒頭判定の通り、希望価格保存を段階別に匿名計測して離脱点を特定する。

### 8. 前日 Claude 成果物

- 検索精度改善: `a59c9e0044a8626d0f4dcf1971a57e16577497e8`（こたつ検索の修正、展開規則・サジェスト・固定QA追加）。
- 教師データ: `0a1d4bcedd270ede01274b0ca81c46d7f7c87149`（daily batch 045、50件）と `9e731951b74b290e1ffb95e00fc3bcf7cc0daf9a`（生成規則再コンパイル）。件数自体は事業実績にしない。
- **Claude 日次作業 欠落: social_post_queue 追加**。前日追加を識別できる既存成果物 / commit がないため、欠落として記録のみ行う。Claudeへ点検を回していない。

### 9. openで14日以上動きのないIssue

2026-09-24より前に最終更新された open Issue は29件。検索条件は `repo:t-ooku/P-GATE is:issue is:open updated:<2026-09-24`。

- [#1](https://github.com/t-ooku/P-GATE/issues/1), [#44](https://github.com/t-ooku/P-GATE/issues/44), [#52](https://github.com/t-ooku/P-GATE/issues/52), [#74](https://github.com/t-ooku/P-GATE/issues/74), [#123](https://github.com/t-ooku/P-GATE/issues/123)
- [#149](https://github.com/t-ooku/P-GATE/issues/149), [#161](https://github.com/t-ooku/P-GATE/issues/161), [#169](https://github.com/t-ooku/P-GATE/issues/169), [#219](https://github.com/t-ooku/P-GATE/issues/219), [#223](https://github.com/t-ooku/P-GATE/issues/223)
- [#258](https://github.com/t-ooku/P-GATE/issues/258), [#260](https://github.com/t-ooku/P-GATE/issues/260), [#270](https://github.com/t-ooku/P-GATE/issues/270), [#273](https://github.com/t-ooku/P-GATE/issues/273), [#289](https://github.com/t-ooku/P-GATE/issues/289)
- [#321](https://github.com/t-ooku/P-GATE/issues/321), [#325](https://github.com/t-ooku/P-GATE/issues/325), [#326](https://github.com/t-ooku/P-GATE/issues/326), [#353](https://github.com/t-ooku/P-GATE/issues/353), [#388](https://github.com/t-ooku/P-GATE/issues/388)
- [#422](https://github.com/t-ooku/P-GATE/issues/422), [#423](https://github.com/t-ooku/P-GATE/issues/423), [#432](https://github.com/t-ooku/P-GATE/issues/432), [#463](https://github.com/t-ooku/P-GATE/issues/463), [#464](https://github.com/t-ooku/P-GATE/issues/464)
- [#465](https://github.com/t-ooku/P-GATE/issues/465), [#466](https://github.com/t-ooku/P-GATE/issues/466), [#467](https://github.com/t-ooku/P-GATE/issues/467), [#473](https://github.com/t-ooku/P-GATE/issues/473)

## 追加監査の適用

- 木曜日のため月曜SEO監査は対象外。
- 毎月1日ではないためAmazon 180日期限チェックは対象外。

## 大隆さんがやること

- ない。
