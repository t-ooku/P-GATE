# Codex起動時セルフチェック（2026-10-04）

確認時刻: 2026-10-04 00:07 JST

- 本番health: `ok=true`、`missing=[]`、`weak=[]`。X/Instagram接続、Runway ready、既存database_featuresにfalseなし。
- 自動インシデント: #369がopen。最新記録（2026-10-03 23:56 JST相当）では外部contractと検索SLIはPASSだが、AI女優SNS SLAは `SOCIAL_AI_ACTRESS_TODAY_NOT_PUBLISHED`。10月3日分のX/Instagramが未承認・未公開、10月7日分の将来在庫も不足。SNS公開・キュー変更は承認境界のため、このセッションでは修正せず記録のみ。
- Claudeからの新着: `2026-09-28-claude-to-codex-seller-master.md` と `2026-10-04-codex-share-ai-promo.md` を確認。後者の§5-1を常設セルフチェックへ反映。
- Seller AI販促: 今日は日曜日で月曜07:30以降の必須判定対象外。参考として `2026-10-03-seller-promo-weekly.md` を確認し、2026-W40のQA店舗jobは `DONE`、納品物は全版 `QA_PASSED`。

要対応: AI女優SNSの未公開・将来在庫不足は既存インシデント#369で継続監視。Seller AI販促のFAILED／上限SKIPPEDは今回確認されていない。
