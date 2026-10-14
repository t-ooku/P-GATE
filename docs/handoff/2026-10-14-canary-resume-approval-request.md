# 有料AIカナリア再開の承認依頼 — 2026-10-14

状態: 要確認（承認待ち、再開未実行）

## 求める承認

料金見直しで停止した既存Gemini監視だけを、現在の月額上限US$5の範囲で再開してよいか。新規契約・上限引上げ・クレジット購入・利用者料金変更は含まない。

## 根拠

- 2026-10-13 09:00 JSTにdeep-canaryの価格レビュー期限到達。既存D1 SELECT記録はCANARY_PRICING_REVIEW_REQUIRED。安全停止を維持している。
- 2026-10-14 [Google公式料金表](https://ai.google.dev/gemini-api/docs/pricing)確認: Gemini3.1 Flash-Liteの入力$0.25/出力$1.50、Gemini3.6 Flashは2026-12-31まで入力$0.75/出力$3.75（100万tokenあたり）。現行設定と同一。
- 最新[monitor #1144](https://github.com/t-ooku/P-GATE/actions/runs/38478794151)は一次provider timeout反復7でFAIL。料金レビュー期限切れとtimeoutは別問題で、この再開だけで利用者検索が改善するとは保証しない。

## 承認後にCodexが行う限定作業

- Geminiのレビュー日・次回期限を更新。予約上限・月額US$5・有限頻度・重複防止・実usage精算は保持。
- OpenAI backupはbilling disabledのまま。単価確認なしで再開しない。
- CIで期限超過fail-closed、予算上限、重複・再試行回数を確認して反映。既存cronの次回結果を再利用し、手動有料probeは追加しない。
- 監視再開に伴う既存予算台帳への自動記録のみ。D1 migration、既存行UPDATE/DELETE、予算reset、新規SNS/営業は含まない。

## 復旧・停止方法

不具合時は既存価格レビュー期限を過去へ戻す変更で有料監視を再びfail-closedにする。予算記録を消去・リセットせず保全する。外形監視・利用者検索は独立して継続する。

大隆さんが必要なのはこの再開への承認のみ。Claudeへの中継・Cloudflareログイン・Secret入力は不要。

## 承認（2026-10-14 夜、大隆さん → Claude/Cowork 経由で記録）

- 大隆さん「再開して」。**上記「承認後にCodexが行う限定作業」の範囲で、Gemini 監視の再開を承認**（月額上限US$5のまま。上限引上げ・モデル変更・新規契約は含まない）。
- 大隆さん「点検はコーデックスで」→ 作業・本番確認は Codex が行う。Claude はコードを変更していない。
- OpenAI は別件で「一旦使わない」（[2026-10-14-claude-to-codex-openai-pause.md](2026-10-14-claude-to-codex-openai-pause.md)）。OpenAI backup は再開しない。
- 結果はこのファイルに「## Codex 記録」として追記してください（実装／本番反映／本番確認を分けて）。

## Codex 記録 — 2026-10-15

- このスレッドで大隆さん「承認する」を受領。Gemini既存監視のみ月額US$5の範囲で再開、予算台帳のresetなし。
- 実装済み・本番未確認: Google公式料金表を再確認し、PRICING_REVISIONを2026-10-15、次回レビュー期限を2026-11-15へ更新。単価・予約額・月上限・頻度・OpenAI backup無効フラグは変更しない。
- 匿名KPIへ監視台帳の当月UTC集計を追加。Googleアカウント全体の利用額・プリペイド残高とは別であることを成果物にも明記。既存SELECT成果物から読取り、D1 migration/予算reset/手動有料probeは行わない。
- Geminiアカウントの残高・請求額は未取得。課金管理への接続がなく、API成功や監視上限US$5だけで「残高に余裕あり」とは判断しない。確認先: https://aistudio.google.com/billing 。
