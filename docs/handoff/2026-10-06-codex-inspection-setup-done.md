# Codex 点検設定一覧（2026-10-06）
全体状態: 一部実装。受領記録は2026-10-06-claude-to-codex-inspection-handover.md。
| 対象 | 頻度(JST) | 出力 | 状態 |
|---|---|---|---|
| HOSHILU日次9項目 | 既存日報を08:00開始に変更、08:30までを目標 | docs/handoff/YYYY-MM-DD-codex-selfcheck.md | 実装済み・本番未確認 |
| HOSHILU SEO | 月曜、同じ日次内 | 同じselfcheck | 実装済み・本番未確認 |
| Amazon期限 | 毎月1日、同じ日次内 | 同じselfcheck | 実装済み・本番未確認 |
| 黒谷HP追加点検 | 既存10:00巡回内、月曜実表示/SEO | monitor/YYYY-MM-DD_1000-codex.md、STATUS.md | 実装済み・本番未確認 |
| Trioland site smoke | 毎日08:15（既存workflowへschedule追加） | Actions Step Summary、失敗時[AUTO][TRIOLAND] Issue | 実装済み・本番未確認 |
| ITG Worker health | 月曜08:35 | Actions Step Summary、失敗時[AUTO][ITG] Issue | 一部実装 |
| ITG投稿失敗・OAuth期限 | 同じ週次内 | 未計測理由をStep Summary | 未実装 |
| HoikuPilot | 毎日09:30予定 | 未設定 | 未実装 |

## 検証
GitHub default mainへの保存と再読込確認済み。Trioland/ITG YAMLと埋込Pythonの構文確認済み。定期起動成功・本番HTTP・D1実測は未確認。workflow_dispatch実行ツールはこの接続で利用できないため手動実行未実施。
Trioland問い合わせGETは実装上405を返す。405を生存確認として扱う（配送機能の検証ではない）。求人最終commitは48h超で警告、本文取得なし。
黒谷旧§8-3 Cowork単独公開は削除、09:00監視の旧記述を廃止。22:00記事反映は維持、追加点検は10:00のみ。
HOSHILU既存日報から制作・営業実行を除いて点検に変更。別の既存Actions・朝ブリーフは変更しない。

## 未解決
接続済みP-GATE mainでは旧AGENTS.md/docs/handoffとread-codex-kpi-snapshot.mjsの指定候補パスを取得できなかった。追加AGENTS.mdと引継ぎ記録は保存済み。日次値は読取接続が成立しない場合「未計測（理由）」とする。D1値を取得できたとは記載しない。
HoikuPilotはアクセス可能リポジトリ一覧になく、t-ooku/hoiku-shiftも404。所有者/正確なリポジトリURLとGitHub接続許可が必要。
ITG公開healthにはOAuth有効期限/投稿ジョブ失敗集計がない。Secretを取得せずに利用できる認証付き読取接続・集計経路が未確認のため、health正常でも両項目を正常扱いしない。
最大3行の利用者報告と本人作業欄、0/未計測の区別を各実行指示に保持。

**大隆さんがやること**
HoikuPilotの正確なGitHubリポジトリURLを知らせ、ChatGPTのGitHub接続で当該リポジトリを許可する。接続管理: https://chatgpt.com/ の設定 → アプリ → GitHub → 設定/接続先の管理。権限範囲に当該リポジトリを追加（画面表示が異なる場合は実画面に従う）。
