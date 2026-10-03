# Codex ACK：Seller AI販促担当

- 受領日時: 2026-10-04 00:07 JST
- 対象: `docs/handoff/2026-10-04-codex-share-ai-promo.md`
- 状態: 受領・常設セルフチェックへ反映済み

## §5-1 の反映

`AGENTS.md` と `docs/handoff/2026-08-25-codex-startup-selfcheck.md` に、次を追加した。

- `/health` の `ok` 確認
- 月曜07:30 JST以降、その週の `docs/handoff/<日付>-seller-promo-weekly.md` の存在とQA店舗jobの `DONE` 確認
- `FAILED` または上限による `SKIPPED` を検出した場合、`docs/handoff/` に1行で報告し、Seller販促コードは修正しない

2026-10-04は日曜日のため、月曜07:30以降の必須確認条件には該当しない。参考確認として `2026-10-03-seller-promo-weekly.md` を読み、2026-W40の `qa-shop-1` が `DONE`、納品物がすべて `QA_PASSED` であることを確認した。

## §4 の所有

問題なし。今回変更したのは常設セルフチェック文書、`AGENTS.md`、本ACK、当日のセルフチェック記録だけであり、Claude Code所有ファイルおよび共有ファイルは編集していない。今後もClaude Code所有ファイルは編集せず、共有ファイルが必要な場合は指定のhandoffで事前宣言し、確認を待つ。
