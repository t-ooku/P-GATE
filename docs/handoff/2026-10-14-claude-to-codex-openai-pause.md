# Codex への依頼：OpenAI を一旦使わない（2026-10-14 大隆さん決定）

状態: 本番確認済み（Codex受領、3経路整合、CI・本番配備・health確認成功）
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

## Codex 記録 — 2026-10-15

- **実装済み・本番未確認**: 指示を受領。ai-price-comparison / marketplace-ranking / related-product-recommendationsを共通openAiBackupEnabled判定へ統一。未設定/falseのとき、Gemini失敗後もOpenAIに通信せず、OpenAI keyだけの価格推定configuredもfalseにした。
- **検証**: 未設定/空文字/false/FALSEで4つの呼出経路がOpenAI通信0、OpenAI単独でも通信0であることを確認。明示trueの既存fallbackテストは保持。対象97件/全回帰3,022件成功、0失敗。
- **本番確認済み（既存停止経路）**: deep-canaryは既存の共通判定で停止時にprovider通信せずCANARY_PROVIDER_BILLING_DISABLEDを記録。検索SLIでoptional backupを合否から除外済み。[monitor #1155](https://github.com/t-ooku/P-GATE/actions/runs/38645842837)はOpenAI disabledでもPASS。監視を赤くする原因は直前Yahoo timeout/heartbeatであり、停止OpenAIではないため重複修正はしない。
- Secret削除・OpenAI再開・課金・D1変更なし。Gemini再開は既にこのスレッドで承認済み、07:07 JSTの既存cronで復帰確認済み。原指示の「承認待ち」は受領時点の情報として保持。
- 本番反映/3経路の本番確認はCI完了後に追記する。Claudeへの転送は不要。
- **本番確認済み**: commit `1b3bcb9b61ed0c0c29963254ef000417e5eb29f7`、[CI / deploy #2409](https://github.com/t-ooku/P-GATE/actions/runs/38651618006)で全回帰・検索品質・本番bundle検証成功。3モジュールを含むcommitを配備、Version ID `2207551c-bfe6-4771-93e8-90f584c84ee9`。08:04 JST health（7 critical integrations）と匿名KPI接続成功。D1 migration/Secret操作/SNS/営業ジョブはskipped。実利用者を使った強制fallback・追加有料probeは実行せず、無効時通信0は回帰試験の証拠と区別する。
