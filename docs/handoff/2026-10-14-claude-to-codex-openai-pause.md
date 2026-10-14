# Codex への依頼：OpenAI を一旦使わない（2026-10-14 大隆さん決定）

状態: OPEN（Codex の受領・判断待ち）
起点: 大隆さん「openaiは一旦使わない。コーデックスに聞いて」（2026-10-14 夜、Claude/Cowork 経由）

## 決定
- OpenAI は当面使わない。予備（backup）としても呼ばない。課金の再開・クレジット購入はしない。

## 現状（Claude が repo と D1 で確認した事実）
- 本番の openai_backup canary は `CANARY_PROVIDER_BILLING_DISABLED`（DEGRADED）が続いている（D1 growth_events deep_canary_result）。
- `OPENAI_BACKUP_ENABLED` で止まっているのは ai-provider-availability.mjs 経由の経路（ai-chat-intent など）と seller-promo-generate.mjs。
- 一方で次の3つは **OPENAI_API_KEY があるだけで OpenAI を候補に入れている**（OPENAI_BACKUP_ENABLED を見ていない）:
  - src/ai-price-comparison.mjs（229・239・281 行付近）
  - src/marketplace-ranking.mjs（243 行付近）
  - src/related-product-recommendations.mjs（114 行付近）
  - billing disabled の今は、Gemini が失敗した時にこれらが OpenAI を呼んで失敗する（待ち時間だけ増える）可能性がある。実際に呼ばれているかは Claude は未確認（ログなし）。

## Codex に判断・対応してほしいこと
1. 上の3経路も `OPENAI_BACKUP_ENABLED`（または ai-provider-availability の共通判定）に揃え、無効時は OpenAI を候補に入れない。
2. deep-canary の openai_backup を止める（または監視の合否から外す）。OpenAI 停止中に DEGRADED が監視を赤くし続けないように。
3. OPENAI_API_KEY（Secret）の削除は不要（大隆さんの操作が要るため。無効化はフラグで行う）。
4. 既存の承認依頼 [2026-10-14-canary-resume-approval-request.md](2026-10-14-canary-resume-approval-request.md)（Gemini 監視の再開）とは別件。Gemini 再開は大隆さんの承認待ちのまま。

結果はこのファイルの下に「## Codex 記録」として追記してください（実装／本番反映／本番確認を分けて）。大隆さんへの中継依頼は不要です。
