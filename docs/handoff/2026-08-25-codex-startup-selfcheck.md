# Codex常設ルール追加: 起動時セルフチェック

- 承認日: 2026-08-25
- 承認者: 大隆さん
- 適用範囲: 今後、このリポジトリで開始するすべてのCodexセッション
- 状態: 受領・常設化

これは一度きりの依頼ではなく、今後すべてのCodexセッションの冒頭で毎回実行する常設ルールである。

## 目的

異常検知から対応までの流れから大隆さんの中継を外す。Claude（Cowork）側の監視は、今後「Codexが対応できないもの・大隆さんの承認が要るもの」だけを大隆さんに通知し、機械的に対応可能な異常はCodexが自走で拾って直す。

## 毎セッション冒頭のセルフチェック（3項目・5分以内）

1. **本番ヘルス**: <https://hoshilu.app/health> を取得し、`ok:false`、`missing`・`weak` に項目あり、`checks.x_oauth.connected:false`、`checks.instagram_oauth.connected:false`、`checks.runway_video_generation.ready:false`、または `checks.database_features.*` の `false` が前回より増加していれば異常。
2. **自動インシデントIssue**: リポジトリのopen Issueのうち、`[AUTO][HOSHILU] Production reliability incident` を確認する。既知の自己参照failure（`GITHUB_SCHEDULE_HEARTBEAT_STALE`、#49系）は除外し、それ以外の新しいincidentは異常。
3. **Claudeからの連絡**: `docs/handoff/` の新着 `*-claude-to-codex-*.md` を読む。修正指示・調査依頼があれば作業キューに積む。

## 異常があったときの行動

- **予定タスクより優先**して原因調査・修正に着手する。検索が壊れている状態でSEO記事を書き続けない。
- 従来ルールは不変とする。**D1書き込み（migration・実SQL）、課金、SNS公開、価格や規約に関わる文言変更は大隆さんの承認必須**。承認が要る場合は `docs/handoff/` に承認依頼ファイルを置き、そこで止める。この2026-08-25承認境界は、過去の障害自動修復文書にこれより緩い記述がある場合も優先する。
- 対処結果、または「対応不能・承認待ち」を `docs/handoff/YYYY-MM-DD-codex-selfcheck.md` に短く記録する。異常ゼロの日は記録不要。

## 役割分担

- **リポジトリ内 production-monitor（GitHub Actions）**: 異常の一次検知と `[AUTO]` Issue化（既設・自動）。
- **Codex（本ルール）**: 毎起動時にIssue・health・handoffを読み、直せるものを直す。
- **Claude（Cowork監視）**: Codexが拾えない種類の問題（UX品質・戦略判断・承認事項）だけを大隆さんへ通知する。加えて、修正指示書を `docs/handoff/` 経由または大隆さん経由で送る。
- **大隆さん**: 承認と最終判断のみ。異常の伝書鳩はしない。

## 受領

本書を `docs/handoff/` に保存し、リポジトリルートの `AGENTS.md` から必須の作業開始手順として参照する。次回のCodexセッションから、このセルフチェックを実施する。
