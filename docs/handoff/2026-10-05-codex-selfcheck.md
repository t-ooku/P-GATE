# Codex起動時セルフチェック（2026-10-05）

確認時刻: 2026-10-05 08:32 JST

- 本番health: `ok=true`、release `1.22.1`、`missing=[]`、`weak=[]`。X/Instagram接続、Runway ready、既存database_featuresにfalseなし。
- GitHub: 最新ブランチHEAD `3308ee8a570fd415a427f3226ebfa4c1aa5708f3`。直近の本番監視が示すproduction sourceは `19478dbd029eae7f744e8bc79be928d99989e74f`。直近Project GATE CI・deployは run 37237102054（HEAD `8a92a11f86c55da67d0a94c0e59dd0a91dc4727a`）で成功。
- 自動インシデント #369: external contractはPASS。検索SLIは `QUERY_STRUCTURER_PRIMARY:AI_PROVIDER_TIMEOUT` の同一request内2回でFAIL。AI女優SNSは10月7日・12日のX/Instagram将来在庫不足。既知のheartbeat自己参照は除外。
- Seller AI販促: 月曜07:30以降の必須確認で `docs/handoff/2026-10-05-seller-promo-weekly.md` が存在せず、定時workflow runも確認できないため、今週のQA job・QA状態・原価は**未確認**。Seller promoコード、workflow、本番D1は変更しない。
- 最新匿名KPI成果物: 2026-10-05 06:43 JST生成。外部獲得実績は送信191、返信0、外部Seller登録0、外部商品登録0。Seller LPは直近7日14閲覧・CTA 0。一般導線はLP 77、検索18、希望価格設定開始1・完了0、モール送客4。

要対応: Seller週次記録の未生成はClaude Code/Cowork側でworkflow遅延・未実行を確認する。検索SLIのAI provider timeoutは継続監視し、同一失敗が続く場合のみ原因別修正を検討する。料金・Secret・migration・本番D1・外部送信・SNSキューは変更していない。
