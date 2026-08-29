# 写真検索 Web画像一致照合ランブック

## 目的

Google Lensの非公開処理は自動化せず、公式のGoogle Cloud Vision API
`WEB_DETECTION`を写真検索の補助手掛かりとして使用する。

処理順は次のとおり。

1. 端末で縮小・JPEG化し、EXIFを引き継がない画像を受信
2. `WEB_DETECTION`でWeb上の一致画像候補を照合
3. URL・価格・在庫を破棄し、固有名候補と件数だけをGeminiへ渡す
4. Geminiは検索語の仮説だけを返す
5. HOSHILUが既存のモールAPI・確認済み索引・モール検索ページを探す

購入先、価格、在庫をCloud VisionやGeminiの回答から生成してはならない。

## 通常状態

`wrangler.jsonc`の`GOOGLE_VISUAL_SEARCH_ENABLED`は`false`を既定とする。
この状態ではCloud Visionを呼ばず、既存のGemini画像解析だけを使用する。
さらにD1の月次予約カウンターをリクエスト前に原子的に更新し、Google Cloudの
課金月境界（America/Los_Angeles）ごとに既定900画像で停止する。カウンター用
migration未適用・D1障害・上限到達時は
Cloud Visionを呼ばずGeminiへフォールバックする。失敗した予約も戻さないため、
クライアント再試行で上限を越えない。
Turnstileで自動送信を抑止し、アプリ側では生IP・IP由来識別子・匿名セッション・
画像・検索語をこの機能のために保存しない。

## 本番有効化の前提

- Google Cloud上でCloud Vision APIを有効化する
- 本番専用のGoogle CloudプロジェクトとAPIキーを使い、ステージングや他サービスの
  `WEB_DETECTION`利用と共有しない
- 費用承認を記録する。Web Detectionは月初1,000画像まで無料で、その後は
  1,000画像あたり3.50米ドル（料金は有効化時に公式ページで再確認）
- Google Cloud側でAPIをCloud Vision APIだけに制限したキーを発行する
- `0062_google_visual_web_detection_budget.sql`を適用し、アプリ側の月次上限を
  承認済みの値に固定する。無料運用の既定値は900画像
- 無料枠・段階料金は同じCloud Billingアカウントの対象利用量と合算されるため、
  他サービスでWeb Detectionを使う場合は900より十分低い上限へ変更する
- Google Cloudの割当上限とBilling Budgetアラートを設定する。Budgetアラートは
  課金を自動停止する上限ではないことを運用者が理解する
- 「Google Lens搭載」「Google Lens同等」とは訴求せず、必要に応じてGoogle
  Cloudへ用途を確認する
- 検索画面の処理告知とプライバシー方針を、Cloud Vision利用を含む文面へ同時更新する

公式資料：

- <https://docs.cloud.google.com/vision/docs/detecting-web>
- <https://cloud.google.com/vision/pricing>
- <https://docs.cloud.google.com/vision/docs/data-usage>
- <https://cloud.google.com/terms/service-terms>

## 有効化

APIキーは設定ファイルやGitへ書かず、Cloudflare Worker Secret
`GOOGLE_CLOUD_VISION_API_KEY`として登録する。費用承認、表示更新、Secret登録が
完了したデプロイでのみ`GOOGLE_VISUAL_SEARCH_ENABLED`を`true`へ変更する。

デプロイ後、`/health`の次の固定値を確認する。

```json
{
  "checks": {
    "search_input_analysis_configured": true,
    "google_visual_web_detection_configured": true,
    "google_visual_web_detection_budget_ready": true,
    "database_features": {
      "google_visual_web_detection_usage_monthly": true
    }
  }
}
```

Secret値、画像、検索語、Web一致URLはヘルスチェックやログへ出さない。

## 本番受入確認のQA分離

自動ブラウザやCodexで本番検索を確認する場合は、必ず次のQA専用パラメーターを
付けてから操作する。

```text
https://hoshilu.app/?utm_source=codex_qa&utm_medium=qa&utm_campaign=acceptance_search
```

`utm_source=codex_qa`または`utm_medium=qa`は`traffic_class=QA`に分類され、
実ユーザーの検索SLIから除外される。QAパラメーターなしの検証は、
Turnstileが自動ブラウザを拒否した結果を実ユーザー障害として記録するため禁止する。
カメラ検索の最終受入は、自動ブラウザだけではなく非ヘッドレスの実スマホでも行う。

## 停止とフォールバック

緊急停止は`GOOGLE_VISUAL_SEARCH_ENABLED=false`で行う。Visionのタイムアウト、
HTTPエラー、不正JSON、空のWeb一致は検索全体を失敗させず、既存のGemini画像
解析へ戻る。provider障害・月次上限・費用ヒューズ障害は固定区分だけを監視し、
入力内容は記録しない。
