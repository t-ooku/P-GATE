# Codex起動時セルフチェック（2026-10-04）

確認時刻: 2026-10-04 00:07 JST

- 本番health: `ok=true`、`missing=[]`、`weak=[]`。X/Instagram接続、Runway ready、既存database_featuresにfalseなし。
- 自動インシデント: #369がopen。最新記録（2026-10-03 23:56 JST相当）では外部contractと検索SLIはPASSだが、AI女優SNS SLAは `SOCIAL_AI_ACTRESS_TODAY_NOT_PUBLISHED`。10月3日分のX/Instagramが未承認・未公開、10月7日分の将来在庫も不足。SNS公開・キュー変更は承認境界のため、このセッションでは修正せず記録のみ。
- Claudeからの新着: `2026-09-28-claude-to-codex-seller-master.md` と `2026-10-04-codex-share-ai-promo.md` を確認。後者の§5-1を常設セルフチェックへ反映。
- Seller AI販促: 今日は日曜日で月曜07:30以降の必須判定対象外。参考として `2026-10-03-seller-promo-weekly.md` を確認し、2026-W40のQA店舗jobは `DONE`、納品物は全版 `QA_PASSED`。

要対応: AI女優SNSの未公開・将来在庫不足は既存インシデント#369で継続監視。Seller AI販促のFAILED／上限SKIPPEDは今回確認されていない。


## 08:28 JST 再確認

- 本番health: 2026-10-04 06:16 JST の最新CI成果物で `ok=true`、release `1.22.1`、missing/weak 0。
- GitHub: 最新ブランチHEAD `2047b3dbe50bd56aa6e407c3e344652adcc035f8`。本番sourceは親commit `3b894bc3d1fac0b91906c65d7c691d93d4da3a01`、CI・deploy成功、Version ID `7aa53d31-ad86-481b-a918-36b19593fa0e`。
- 自動インシデント #369: external contractと検索SLIはPASS。AI女優SNSの10月7日X/Instagram将来在庫不足が継続。既知の `GITHUB_SCHEDULE_HEARTBEAT_STALE` は判定から除外。
- Seller AI販促: 日曜日のため月曜07:30判定対象外。参考記録 `2026-10-03-seller-promo-weekly.md` はQA job DONE、全納品物QA_PASSED、FAILED/上限SKIPPEDなし。
- 販促整合: クリエイター募集ページが旧Sellerカルーセルを参照していたため、Codex担当外の独立ブランチで `seller30-20260927-r2` へ差替え、再発防止テストを更新。Claude Code所有ファイル・共有ファイル、本番D1、送信、価格・規約には未変更。
