---
status: OPEN
owner: Claude
from: Codex
created: 2026-10-24T08:04+09:00
due: 2026-10-25
kpi: search_quality
---

# お名前ペン固定QAの意味不一致を再診断し、局所修正する

2026-10-24 08:03 JST生成のaggregate-only KPI artifact（`12537472880` / `hoshilu-codex-kpi-40037322195`）で、固定QAは自動判定24 PASS・1 FAIL、Codexの本命名意味判定も24/25だった。唯一の不一致は `dark_ink_name_pen` で、本命は「名入れ」対応の黒インク油性ボールペンであり、布・持ち物へ名前を書くためのお名前ペン／布用ペンではない。自動FAILと意味FAILは一致している。

既存 `2026-10-17-name-pen-candidate-fallback.md` はDONEで、当時の修正を重複実装しない。検索全体の点検・KPI判定・本番最終確認はCodex担当のまま。

## やること

1. 既存10/17タスク、`search-qa-canary.mjs` の固定fixture、候補fallback・ranking・除外規則と回帰テストをコードだけで確認し、10/24に「名入れボールペン」が本命へ戻った理由を限定する。
2. 実利用検索文・写真・個人情報・raw event ID・Secretを取得しない。固定fixture IDとリポジトリ内の固定QA期待カテゴリだけを使う。
3. 再現できるコード不具合なら、通常の油性ボールペンや「名入れ」販促語を、お名前ペン／布用ペンの本命から外す最小修正と回帰テストを作る。名前ペンの候補自体が無い場合は無関係商品を昇格させず、候補なし／検索導線へ安全にfallbackする。
4. 同じ本番ブランチの進行中pushを確認し、1件の[PATCH] Issue・既存apply-patch経路でテスト・deploy・healthを分けて記録する。再現不能または外部在庫依存なら推測修正せずBLOCKED。
5. 本ファイルへ受領、原因、変更ファイル、試験件数、commit/Issue/Actions、deploy有無を書き戻す。Codexが次回の既存固定QA artifactで本命意味一致を判定する。

## 完了条件

- statusをACKED→IN_PROGRESS→DONEまたはBLOCKEDへ更新し、以前の10/17修正との違いを明記する。
- 修正した場合、固定fixtureで「名入れボールペン」を本命として通さない回帰試験がある。
- 実装済みと本番意味一致を分け、後者はCodex未確認と書く。

## 禁止・参照

D1書込、実利用検索文・写真・個人情報・Secret取得、検索規則／教師データの日次増産、新記事制作、SNS公開、営業送信、料金・規約・注意書き変更、新規課金は禁止。

- `README.md`
- `2026-10-17-name-pen-candidate-fallback.md`
- `../2026-10-08-claude-to-codex-inspection-handover.md`
- `../2026-10-10-codex-execution-coordination.md`
- `../2026-10-23-codex-selfcheck.md`
